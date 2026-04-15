import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import {
  SmoobuClient,
  mapSmoobuApartment,
  mapSmoobuReservation,
  calculateBookingStatus,
} from '@/lib/smoobu'
import { decrypt, encrypt } from '@/lib/encryption'
import { autoGenerateMeldescheine } from '@/lib/auto-generate-meldeschein'

export async function POST(request: NextRequest) {
  void request

  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const userId = user.id
  let integrationId: string | null = null

  try {
    // Load API key from integrations table (encrypted)
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, api_key_encrypted')
      .eq('user_id', userId)
      .eq('provider', 'smoobu')
      .single()

    if (!integration?.api_key_encrypted) {
      return NextResponse.json(
        { error: 'Smoobu API-Key nicht konfiguriert. Bitte unter Integrationen hinterlegen.' },
        { status: 400 }
      )
    }

    integrationId = integration.id
    const { plaintext: apiKey, needsReEncrypt } = decrypt(integration.api_key_encrypted)

    // Re-encrypt with current key if decrypted with previous key (key rotation)
    if (needsReEncrypt) {
      await supabase
        .from('integrations')
        .update({ api_key_encrypted: encrypt(apiKey), updated_at: new Date().toISOString() })
        .eq('id', integration.id)
    }

    const smoobu = new SmoobuClient({ apiKey })

    // 1. Sync apartments/properties
    const apartments = await smoobu.getApartments()
    const propertyMap = new Map<number, string>() // external_id → uuid
    const propertyCleaningFees = new Map<string, number>() // property uuid → default_cleaning_fee

    for (const apartment of apartments) {
      const propertyData = mapSmoobuApartment(apartment)

      const { data: existing } = await supabase
        .from('properties')
        .select('id, default_cleaning_fee')
        .eq('external_id', apartment.id)
        .eq('user_id', userId)
        .single()

      if (existing) {
        const updateData: Record<string, unknown> = {
          name: propertyData.name,
          street: propertyData.street,
          city: propertyData.city,
          zip: propertyData.zip,
          country: propertyData.country,
          timezone: propertyData.timezone,
          synced_at: new Date().toISOString(),
        }
        if (propertyData.city) {
          const { data: currentProp } = await supabase
            .from('properties')
            .select('accommodation_tax_city')
            .eq('id', existing.id)
            .single()
          if (!currentProp?.accommodation_tax_city) {
            updateData.accommodation_tax_city = propertyData.city
          }
        }
        await supabase
          .from('properties')
          .update(updateData)
          .eq('id', existing.id)
        propertyMap.set(apartment.id, existing.id)
        if (existing.default_cleaning_fee != null) {
          propertyCleaningFees.set(existing.id, existing.default_cleaning_fee)
        }
      } else {
        const { data: inserted } = await supabase
          .from('properties')
          .insert({ ...propertyData, user_id: userId })
          .select('id')
          .single()
        if (inserted) {
          propertyMap.set(apartment.id, inserted.id)
          if (propertyData.city) {
            const { data: rule } = await supabase
              .from('city_tax_rules')
              .select('tax_model, tax_rate')
              .eq('city', propertyData.city)
              .eq('user_id', userId)
              .single()
            if (rule) {
              await supabase
                .from('properties')
                .update({
                  accommodation_tax_model: rule.tax_model,
                  accommodation_tax_rate: rule.tax_rate,
                })
                .eq('id', inserted.id)
            }
          }
        }
      }
    }

    // 1b. Sync subscription quantity if user has an active Stripe subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', userId)
      .single()

    if (profile?.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const { default: Stripe } = await import('stripe')
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2026-02-25.clover',
        })

        const { count: propertyCount } = await supabase
          .from('properties')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)

        const newQuantity = Math.max(1, propertyCount ?? 0)
        const subscription = await stripe.subscriptions.retrieve(
          profile.stripe_subscription_id
        )
        const item = subscription.items.data[0]

        if (item && item.quantity !== newQuantity) {
          await stripe.subscriptions.update(profile.stripe_subscription_id, {
            items: [{ id: item.id, quantity: newQuantity }],
            proration_behavior: 'create_prorations',
          })
          console.log(
            `Smoobu sync: subscription updated ${item.quantity} → ${newQuantity} properties`
          )
        }
      } catch (err) {
        console.error('Smoobu sync: subscription quantity update failed:', err)
        // Non-blocking: sync continues even if Stripe update fails
      }
    }

    // 2. Sync reservations (last 12 months + next 12 months)
    const now = new Date()
    const from = new Date(now)
    from.setMonth(from.getMonth() - 12)
    const to = new Date(now)
    to.setMonth(to.getMonth() + 12)

    const fromStr = from.toISOString().split('T')[0]
    const toStr = to.toISOString().split('T')[0]

    const reservations = await smoobu.getAllReservations(fromStr, toStr)

    let synced = 0
    let created = 0
    let updated = 0

    for (const reservation of reservations) {
      // Skip blockings: explicit flag, type field, or heuristic (no guest + no price)
      if (reservation['is-blocked-booking']) continue
      if (reservation.type?.toLowerCase() === 'blocking') continue
      const hasGuest = !!(reservation.firstname || reservation.lastname || reservation['guest-name'])
      const hasPrice = (reservation.price ?? 0) > 0
      if (!hasGuest && !hasPrice) continue

      const propertyId = propertyMap.get(reservation.apartment?.id)
      if (!propertyId) continue

      const bookingData = mapSmoobuReservation(reservation, propertyId)
      const isCancelled =
        reservation.status === 'cancelled' ||
        reservation.type?.toLowerCase().includes('cancellation')
      bookingData.status = calculateBookingStatus(
        reservation.arrival,
        reservation.departure,
        isCancelled
      )

      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('external_id', reservation.id)
        .eq('user_id', userId)
        .single()

      if (existing) {
        const { external_id: _, trip_purpose: _tripPurpose, ...updateData } = bookingData

        // Check if this booking was created as a direct booking via our wizard (channel_id=0)
        const { data: existingBooking } = await supabase
          .from('bookings')
          .select('channel_id, cleaning_fee, payment_status, accommodation_tax_amount, amount_gross, nights, check_out')
          .eq('id', existing.id)
          .single()
        const isWizardDirectBooking = existingBooking?.channel_id === 0
        const isDirectChannel = updateData.channel === 'Direct'

        // Check if booking has credit notes (Gutschrift) — if so, preserve adjusted financial values
        const { count: creditNoteCount } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('booking_id', existing.id)
          .eq('invoice_type', 'credit_note')
        if (creditNoteCount && creditNoteCount > 0 && existingBooking) {
          // Gutschrift has adjusted these values — do not overwrite with Smoobu originals
          // (nights is a generated column, recalculated from check_out automatically)
          updateData.amount_gross = existingBooking.amount_gross
          if (existingBooking.check_out) updateData.check_out = existingBooking.check_out
        }

        // Preserve manually set trip_purpose – never overwrite on sync
        // For wizard-created direct bookings, preserve the cleaning_fee, accommodation_tax_amount,
        // and channel_id set by the user (even if 0€), since Smoobu doesn't reliably store these
        if (isWizardDirectBooking) {
          updateData.cleaning_fee = existingBooking.cleaning_fee
          updateData.channel_id = 0
          if (existingBooking.accommodation_tax_amount != null) {
            updateData.accommodation_tax_amount = existingBooking.accommodation_tax_amount
          }
        } else if (isDirectChannel) {
          // Direct bookings from Smoobu: use what Smoobu returns as-is (no fallback)
          // The user explicitly controls pricing for direct bookings
        } else if ((updateData.cleaning_fee ?? 0) === 0) {
          // For OTA bookings: when Smoobu returns cleaning_fee=0, use the property default
          const fallback = propertyCleaningFees.get(propertyId)
          if (fallback != null && fallback > 0) {
            updateData.cleaning_fee = fallback
          }
        }
        // Never overwrite an existing payment_status (manual, Stripe paid, etc.)
        if (existingBooking?.payment_status) {
          delete (updateData as Record<string, unknown>).payment_status
        }
        // Never overwrite existing guest address fields with empty/null from Smoobu
        // (user may have entered address manually via the app)
        const addressFields = ['guest_street', 'guest_city', 'guest_zip', 'guest_country', 'guest_nationality'] as const
        for (const field of addressFields) {
          if (!updateData[field]) {
            delete (updateData as Record<string, unknown>)[field]
          }
        }
        await supabase
          .from('bookings')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        updated++
      } else {
        // For OTA bookings: when Smoobu returns cleaning_fee=0, use the property default
        // Direct bookings: use what Smoobu returns as-is (user controls pricing)
        if ((bookingData.cleaning_fee ?? 0) === 0 && bookingData.channel !== 'Direct') {
          const fallback = propertyCleaningFees.get(propertyId)
          if (fallback != null && fallback > 0) {
            bookingData.cleaning_fee = fallback
          }
        }
        await supabase.from('bookings').insert({ ...bookingData, user_id: userId })
        created++
      }
      synced++
    }

    // 3. Update last sync timestamp in integrations table
    await supabase
      .from('integrations')
      .update({ last_synced_at: new Date().toISOString(), status: 'connected', error_message: null })
      .eq('id', integration.id)

    // 4. Auto-generate missing Meldescheine for newly synced bookings
    const { created: meldescheineCreated } = await autoGenerateMeldescheine(userId, supabase)


    // 5b. Auto-generate missing Online Check-In tokens for bookings
    let checkInTokensCreated = 0
    try {
      const { data: existingTokenBookingIds } = await supabase
        .from('guest_registration_tokens')
        .select('booking_id')
        .eq('user_id', userId)

      const tokenBookingIdSet = new Set((existingTokenBookingIds ?? []).map(t => t.booking_id))

      const { data: allBookings } = await supabase
        .from('bookings')
        .select('id, check_out')
        .eq('user_id', userId)

      const bookingsNeedingToken = (allBookings ?? []).filter(b => !tokenBookingIdSet.has(b.id))

      if (bookingsNeedingToken.length > 0) {
        const tokenInserts = bookingsNeedingToken.map(b => {
          const expiresAt = new Date(b.check_out)
          expiresAt.setDate(expiresAt.getDate() + 30)
          return {
            booking_id: b.id,
            user_id: userId,
            expires_at: expiresAt.toISOString(),
          }
        })
        const { data: inserted } = await supabase
          .from('guest_registration_tokens')
          .insert(tokenInserts)
          .select('id')
        checkInTokensCreated = inserted?.length ?? 0
      }
    } catch (e) {
      console.error('Auto-create guest registration tokens failed:', e)
    }

    // 6. Backfill guest address on existing Meldescheine & invoices
    //    (for records created before address data was available from Smoobu)
    let meldescheineUpdated = 0
    let invoicesUpdated = 0

    // 6a. Update Meldescheine where address is missing but booking now has it
    const { data: formsToUpdate } = await supabase
      .from('registration_forms')
      .select('id, booking_id')
      .eq('user_id', userId)
      .is('guest_street', null)
      .not('booking_id', 'is', null)

    if (formsToUpdate && formsToUpdate.length > 0) {
      const bookingIds = formsToUpdate.map((f) => f.booking_id!).filter(Boolean)
      const { data: bookingsWithAddr } = await supabase
        .from('bookings')
        .select('id, guest_street, guest_city, guest_zip, guest_country, guest_nationality')
        .in('id', bookingIds)
        .not('guest_street', 'is', null)

      if (bookingsWithAddr) {
        const addrMap = new Map(bookingsWithAddr.map((b) => [b.id, b]))
        for (const form of formsToUpdate) {
          const addr = addrMap.get(form.booking_id!)
          if (addr) {
            await supabase
              .from('registration_forms')
              .update({
                guest_street: addr.guest_street,
                guest_city: addr.guest_city,
                guest_zip: addr.guest_zip,
                guest_country: addr.guest_country,
                guest_nationality: addr.guest_nationality,
              })
              .eq('id', form.id)
            meldescheineUpdated++
          }
        }
      }
    }

    // 6b. Update invoice guest_snapshots where address is missing
    const { data: invoicesToUpdate } = await supabase
      .from('invoices')
      .select('id, booking_id, guest_snapshot')
      .eq('user_id', userId)
      .not('booking_id', 'is', null)

    if (invoicesToUpdate && invoicesToUpdate.length > 0) {
      const invBookingIds = invoicesToUpdate
        .filter((inv) => {
          const gs = inv.guest_snapshot as Record<string, string> | null
          return !gs?.street
        })
        .map((inv) => inv.booking_id!)
        .filter(Boolean)

      if (invBookingIds.length > 0) {
        const { data: bookingsWithAddr } = await supabase
          .from('bookings')
          .select('id, guest_street, guest_city, guest_zip, guest_country')
          .in('id', invBookingIds)
          .not('guest_street', 'is', null)

        if (bookingsWithAddr) {
          const addrMap = new Map(bookingsWithAddr.map((b) => [b.id, b]))
          for (const inv of invoicesToUpdate) {
            const gs = inv.guest_snapshot as Record<string, string> | null
            if (gs?.street) continue
            const addr = addrMap.get(inv.booking_id!)
            if (addr) {
              const updatedSnapshot = {
                ...gs,
                street: addr.guest_street ?? '',
                city: addr.guest_city ?? '',
                zip: addr.guest_zip ?? '',
                country: addr.guest_country ?? '',
              }
              await supabase
                .from('invoices')
                .update({ guest_snapshot: updatedSnapshot })
                .eq('id', inv.id)
              invoicesUpdated++
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      properties: apartments.length,
      reservations: { total: synced, created, updated },
      meldescheineCreated,
      invoicesCreated: 0,
      checkInTokensCreated,
      meldescheineUpdated,
      invoicesUpdated,
      syncedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Smoobu sync error:', error)

    // Update integration status to error
    if (integrationId) {
      await supabase
        .from('integrations')
        .update({
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Sync failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', integrationId)
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}

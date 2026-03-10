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
import { autoGenerateInvoices } from '@/lib/auto-generate-invoices'

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

    for (const apartment of apartments) {
      const propertyData = mapSmoobuApartment(apartment)

      const { data: existing } = await supabase
        .from('properties')
        .select('id')
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
      if (reservation['is-blocked-booking']) continue

      const propertyId = propertyMap.get(reservation.apartment?.id)
      if (!propertyId) continue

      const bookingData = mapSmoobuReservation(reservation, propertyId)
      const isCancelled = reservation.type?.toLowerCase().includes('cancellation')
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
        const { external_id: _, ...updateData } = bookingData
        await supabase
          .from('bookings')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        updated++
      } else {
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

    // 5. Auto-generate missing invoice drafts for newly synced bookings
    const { created: invoicesCreated } = await autoGenerateInvoices(userId, supabase)

    return NextResponse.json({
      success: true,
      properties: apartments.length,
      reservations: { total: synced, created, updated },
      meldescheineCreated,
      invoicesCreated,
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

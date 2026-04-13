import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt, encrypt } from '@/lib/encryption'

/**
 * POST /api/smoobu/sync-guest
 *
 * Syncs guest address data from the Smoobu Guest API for a single booking.
 * Used when a booking exists but guest address fields are missing (e.g. the
 * guest was created/updated in Smoobu after the initial sync).
 *
 * Body: { bookingId: string }
 *
 * Flow:
 * 1. Look up booking by internal UUID, get external_id (Smoobu reservation ID)
 * 2. Fetch reservation detail from Smoobu to obtain guestId
 * 3. Fetch guest details from Smoobu Guest API
 * 4. Update booking with guest address, email, phone, nationality
 * 5. Backfill related Meldescheine and invoices that are missing address data
 */

const requestSchema = z.object({
  bookingId: z.string().uuid('Ungültige Buchungs-ID'),
})

export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Validate input
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { bookingId } = parsed.data
  const userId = user.id

  try {
    // 1. Look up the booking (scoped to user via RLS)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, external_id, guest_street, guest_city, guest_zip, guest_country, guest_nationality, guest_email, guest_phone')
      .eq('id', bookingId)
      .eq('user_id', userId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Buchung nicht gefunden' },
        { status: 404 }
      )
    }

    if (!booking.external_id) {
      return NextResponse.json(
        { error: 'Buchung hat keine Smoobu-ID (external_id). Nur Smoobu-Buchungen koennen synchronisiert werden.' },
        { status: 400 }
      )
    }

    // 2. Load Smoobu API key
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

    const { plaintext: apiKey, needsReEncrypt } = decrypt(integration.api_key_encrypted)

    // Re-encrypt with current key if decrypted with previous key (key rotation)
    if (needsReEncrypt) {
      await supabase
        .from('integrations')
        .update({ api_key_encrypted: encrypt(apiKey), updated_at: new Date().toISOString() })
        .eq('id', integration.id)
    }

    const smoobu = new SmoobuClient({ apiKey })

    // 3. Fetch reservation detail to get guestId
    const reservation = await smoobu.getReservation(booking.external_id)

    if (!reservation.guestId) {
      return NextResponse.json(
        { error: 'Smoobu-Reservierung hat keine Gast-ID. Gastdaten koennen nicht abgerufen werden.' },
        { status: 404 }
      )
    }

    // 4. Fetch guest details from Smoobu Guest API
    const guest = await smoobu.getGuest(reservation.guestId)

    if (!guest) {
      return NextResponse.json(
        { error: 'Gast konnte nicht von Smoobu abgerufen werden.' },
        { status: 502 }
      )
    }

    // 5. Build update data from guest fields (only overwrite if guest has data)
    const updateData: Record<string, string | null> = {}
    let fieldsUpdated = 0

    if (guest.address?.street) {
      updateData.guest_street = guest.address.street
      fieldsUpdated++
    }
    if (guest.address?.city) {
      updateData.guest_city = guest.address.city
      fieldsUpdated++
    }
    if (guest.address?.postalCode) {
      updateData.guest_zip = guest.address.postalCode
      fieldsUpdated++
    }
    if (guest.address?.country) {
      updateData.guest_country = guest.address.country
      fieldsUpdated++
    }
    if (guest.emails?.[0]) {
      updateData.guest_email = guest.emails[0]
      fieldsUpdated++
    }
    if (guest.telephoneNumbers?.[0]) {
      updateData.guest_phone = guest.telephoneNumbers[0]
      fieldsUpdated++
    }
    if (guest.firstName) {
      updateData.guest_firstname = guest.firstName
      fieldsUpdated++
    }
    if (guest.lastName) {
      updateData.guest_lastname = guest.lastName
      fieldsUpdated++
    }

    // Also try nationality from reservation detail (not available on guest endpoint)
    if (reservation.nationality) {
      updateData.guest_nationality = reservation.nationality
      fieldsUpdated++
    }

    if (fieldsUpdated === 0) {
      return NextResponse.json({
        success: true,
        message: 'Keine neuen Gastdaten bei Smoobu vorhanden.',
        bookingId,
        fieldsUpdated: 0,
        meldescheineUpdated: 0,
        invoicesUpdated: 0,
      })
    }

    // 6. Update the booking
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', bookingId)

    if (updateError) {
      console.error('sync-guest: booking update failed', updateError)
      return NextResponse.json(
        { error: 'Buchung konnte nicht aktualisiert werden.' },
        { status: 500 }
      )
    }

    // 7. Always update related Meldescheine with latest guest data
    //    (not just when missing – Smoobu address may have changed)
    let meldescheineUpdated = 0

    if (updateData.guest_street) {
      const { data: formsToUpdate } = await supabase
        .from('registration_forms')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('user_id', userId)

      if (formsToUpdate && formsToUpdate.length > 0) {
        for (const form of formsToUpdate) {
          await supabase
            .from('registration_forms')
            .update({
              guest_street: updateData.guest_street ?? null,
              guest_city: updateData.guest_city ?? null,
              guest_zip: updateData.guest_zip ?? null,
              guest_country: updateData.guest_country ?? null,
              guest_nationality: updateData.guest_nationality ?? null,
            })
            .eq('id', form.id)
          meldescheineUpdated++
        }
      }
    }

    // 8. Invoice guest_snapshot is frozen at creation time and NOT updated here.
    // Manual edits in the invoice wizard must be preserved.
    const invoicesUpdated = 0

    return NextResponse.json({
      success: true,
      bookingId,
      fieldsUpdated,
      meldescheineUpdated,
      invoicesUpdated,
      guest: {
        name: `${guest.firstName ?? ''} ${guest.lastName ?? ''}`.trim(),
        street: guest.address?.street ?? null,
        city: guest.address?.city ?? null,
        zip: guest.address?.postalCode ?? null,
        country: guest.address?.country ?? null,
        email: guest.emails?.[0] ?? null,
        phone: guest.telephoneNumbers?.[0] ?? null,
      },
    })
  } catch (error) {
    console.error('sync-guest error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gastdaten-Sync fehlgeschlagen' },
      { status: 500 }
    )
  }
}

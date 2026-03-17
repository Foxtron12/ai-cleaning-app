import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt, encrypt } from '@/lib/encryption'

/**
 * POST /api/bookings/update-guest
 *
 * Updates guest address on a booking (in DB) and syncs back to Smoobu
 * if the booking has an external_id. Called from the invoice wizard when
 * the user enters/changes a guest address.
 *
 * Body: { bookingId, guestFirstname?, guestLastname?, guestStreet?, guestZip?, guestCity?, guestCountry? }
 */

const requestSchema = z.object({
  bookingId: z.string().uuid(),
  guestFirstname: z.string().optional(),
  guestLastname: z.string().optional(),
  guestStreet: z.string().optional(),
  guestZip: z.string().optional(),
  guestCity: z.string().optional(),
  guestCountry: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

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

  const { bookingId, guestFirstname, guestLastname, guestStreet, guestZip, guestCity, guestCountry } = parsed.data

  try {
    // 1. Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, external_id, guest_firstname, guest_lastname, guest_street, guest_city, guest_zip, guest_country')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
    }

    // 2. Build update object (only update provided fields)
    const dbUpdate: Record<string, string | null> = {}
    if (guestFirstname !== undefined) dbUpdate.guest_firstname = guestFirstname || null
    if (guestLastname !== undefined) dbUpdate.guest_lastname = guestLastname || null
    if (guestStreet !== undefined) dbUpdate.guest_street = guestStreet || null
    if (guestZip !== undefined) dbUpdate.guest_zip = guestZip || null
    if (guestCity !== undefined) dbUpdate.guest_city = guestCity || null
    if (guestCountry !== undefined) dbUpdate.guest_country = guestCountry || null

    if (Object.keys(dbUpdate).length === 0) {
      return NextResponse.json({ success: true, message: 'Keine Änderungen', smoobuSynced: false })
    }

    // 3. Update booking in DB
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ ...dbUpdate, updated_at: new Date().toISOString() })
      .eq('id', bookingId)

    if (updateError) {
      return NextResponse.json({ error: 'Buchung konnte nicht aktualisiert werden' }, { status: 500 })
    }

    // 4. Sync to Smoobu if booking has external_id
    let smoobuSynced = false
    if (booking.external_id) {
      try {
        const { data: integration } = await supabase
          .from('integrations')
          .select('id, api_key_encrypted')
          .eq('user_id', user.id)
          .eq('provider', 'smoobu')
          .single()

        if (integration?.api_key_encrypted) {
          const { plaintext: apiKey, needsReEncrypt } = decrypt(integration.api_key_encrypted)

          if (needsReEncrypt) {
            await supabase
              .from('integrations')
              .update({ api_key_encrypted: encrypt(apiKey), updated_at: new Date().toISOString() })
              .eq('id', integration.id)
          }

          const smoobu = new SmoobuClient({ apiKey })
          await smoobu.updateReservation(booking.external_id, {
            firstName: guestFirstname,
            lastName: guestLastname,
            street: guestStreet,
            city: guestCity,
            postalCode: guestZip,
            country: guestCountry,
          })
          smoobuSynced = true
        }
      } catch (smoobuError) {
        // Log but don't fail — DB update already succeeded
        console.error('Smoobu sync failed for guest update:', smoobuError)
      }
    }

    return NextResponse.json({
      success: true,
      message: smoobuSynced
        ? 'Gastdaten in Buchung und Smoobu aktualisiert'
        : 'Gastdaten in Buchung aktualisiert',
      smoobuSynced,
    })
  } catch (error) {
    console.error('update-guest error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Aktualisierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}

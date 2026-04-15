import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'

/**
 * POST /api/bookings/sync-edit
 *
 * Syncs booking edits (guest data, dates, price) to Smoobu.
 * Called non-blocking after a booking is updated in the DB.
 */

const requestSchema = z.object({
  bookingId: z.string().uuid(),
  guestFirstname: z.string().optional(),
  guestLastname: z.string().optional(),
  guestEmail: z.string().optional(),
  guestPhone: z.string().optional(),
  guestStreet: z.string().optional(),
  guestZip: z.string().optional(),
  guestCity: z.string().optional(),
  guestCountry: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  amountGross: z.number().optional(),
  guestNote: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler', details: parsed.error.issues }, { status: 400 })
  }

  const data = parsed.data

  try {
    // Fetch booking to get external_id
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, external_id')
      .eq('id', data.bookingId)
      .eq('user_id', user.id)
      .single()

    if (bookingError || !booking?.external_id) {
      return NextResponse.json({ error: 'Buchung nicht gefunden oder keine Smoobu-ID' }, { status: 404 })
    }

    // Get Smoobu API key
    const { data: integration } = await supabase
      .from('integrations')
      .select('api_key_encrypted')
      .eq('user_id', user.id)
      .eq('provider', 'smoobu')
      .single()

    if (!integration?.api_key_encrypted) {
      return NextResponse.json({ error: 'Smoobu nicht verbunden' }, { status: 400 })
    }

    const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
    const smoobu = new SmoobuClient({ apiKey })

    await smoobu.updateReservation(booking.external_id, {
      firstName: data.guestFirstname,
      lastName: data.guestLastname,
      email: data.guestEmail,
      phone: data.guestPhone,
      street: data.guestStreet,
      city: data.guestCity,
      postalCode: data.guestZip,
      country: data.guestCountry,
      arrivalDate: data.checkIn,
      departureDate: data.checkOut,
      price: data.amountGross,
      note: data.guestNote,
    })

    return NextResponse.json({ success: true, smoobuSynced: true })
  } catch (error) {
    console.error('sync-edit Smoobu error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Smoobu-Sync fehlgeschlagen' },
      { status: 502 }
    )
  }
}

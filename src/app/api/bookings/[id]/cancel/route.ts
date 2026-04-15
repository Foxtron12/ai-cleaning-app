import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawParams = await params
  const parsed = paramsSchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Buchungs-ID' }, { status: 400 })
  }
  const { id } = parsed.data
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Fetch booking (enforce ownership via user_id)
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, external_id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
  }

  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Buchung ist bereits storniert' }, { status: 400 })
  }

  // If the booking came from Smoobu, cancel it there first
  if (booking.external_id) {
    const { data: integration } = await supabase
      .from('integrations')
      .select('api_key_encrypted')
      .eq('user_id', user.id)
      .eq('provider', 'smoobu')
      .single()

    if (!integration?.api_key_encrypted) {
      return NextResponse.json(
        { error: 'Smoobu API-Key nicht konfiguriert' },
        { status: 400 }
      )
    }

    try {
      const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
      const smoobu = new SmoobuClient({ apiKey })
      await smoobu.cancelReservation(Number(booking.external_id))
    } catch (err) {
      console.error('Smoobu cancellation failed:', err)
      return NextResponse.json(
        { error: 'Stornierung bei Smoobu fehlgeschlagen. Bitte direkt in Smoobu stornieren.' },
        { status: 502 }
      )
    }
  }

  // Update status in local DB
  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, properties(*)')
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Datenbankfehler beim Aktualisieren' }, { status: 500 })
  }

  return NextResponse.json({ booking: updated })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'

/**
 * GET /api/smoobu/debug-detail?id=130962675
 * Debug endpoint: fetches reservation + guest details from Smoobu API
 * to verify what fields are available.
 */
export async function GET(request: NextRequest) {
  // Only available in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const reservationId = request.nextUrl.searchParams.get('id')
  if (!reservationId) {
    return NextResponse.json({ error: 'Missing ?id= parameter' }, { status: 400 })
  }

  const { data: integration } = await supabase
    .from('integrations')
    .select('api_key_encrypted')
    .eq('user_id', user.id)
    .eq('provider', 'smoobu')
    .single()

  if (!integration?.api_key_encrypted) {
    return NextResponse.json({ error: 'No Smoobu API key configured' }, { status: 400 })
  }

  const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
  const headers = { 'Api-Key': apiKey, 'Content-Type': 'application/json' }

  // 1. Fetch reservation detail
  const resResponse = await fetch(`https://login.smoobu.com/api/reservations/${reservationId}`, { headers })
  if (!resResponse.ok) {
    const text = await resResponse.text()
    return NextResponse.json({ error: `Reservation API ${resResponse.status}`, body: text }, { status: 500 })
  }
  const reservation = await resResponse.json()

  // 2. If reservation has guestId, fetch guest details
  let guest = null
  if (reservation.guestId) {
    const guestResponse = await fetch(`https://login.smoobu.com/api/guests/${reservation.guestId}`, { headers })
    if (guestResponse.ok) {
      guest = await guestResponse.json()
    }
  }

  return NextResponse.json({
    _summary: {
      reservationHasAddress: !!reservation.address,
      reservationGuestId: reservation.guestId ?? 'NOT PRESENT',
      guestAddress: guest?.address ?? 'NOT FETCHED / NOT PRESENT',
      guestEmails: guest?.emails ?? 'NOT FETCHED / NOT PRESENT',
      guestPhones: guest?.telephoneNumbers ?? 'NOT FETCHED / NOT PRESENT',
    },
    reservation,
    guest,
  })
}

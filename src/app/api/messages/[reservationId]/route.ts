import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'
import { checkRateLimit } from '@/lib/rate-limit'

const sendMessageSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(5000),
})

const pageQuerySchema = z.coerce.number().int().min(1).max(1000).default(1)

/**
 * Helper: Get authenticated SmoobuClient for the current user.
 */
async function getSmoobuClient(userId: string, supabase: Awaited<ReturnType<typeof getServerUser>>['supabase']) {
  const { data: integration } = await supabase
    .from('integrations')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('provider', 'smoobu')
    .eq('status', 'connected')
    .single()

  if (!integration?.api_key_encrypted) {
    return null
  }

  const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
  return new SmoobuClient({ apiKey })
}

/**
 * Helper: Verify that the given Smoobu reservation (external_id) belongs to a
 * booking owned by the authenticated user. Defense in depth — without this,
 * an authed attacker could enumerate / send messages to reservations that are
 * in their own Smoobu account but not yet synced into our DB.
 *
 * Returns true if the booking exists and belongs to the user, false otherwise.
 * RLS scopes `bookings` queries to the calling user already; we additionally
 * check explicitly for clarity.
 */
async function verifyBookingOwnership(
  externalId: number,
  userId: string,
  supabase: Awaited<ReturnType<typeof getServerUser>>['supabase']
): Promise<boolean> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('id')
    .eq('external_id', externalId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!booking
}

/**
 * GET /api/messages/[reservationId]
 * Load messages for a specific reservation from Smoobu.
 * Query params: page (number)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> }
) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reservationId } = await params
  const reservationIdNum = parseInt(reservationId, 10)
  if (isNaN(reservationIdNum)) {
    return NextResponse.json({ error: 'Invalid reservation ID' }, { status: 400 })
  }

  // Verify the reservation belongs to a booking owned by this user.
  const owned = await verifyBookingOwnership(reservationIdNum, user.id, supabase)
  if (!owned) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const pageParse = pageQuerySchema.safeParse(request.nextUrl.searchParams.get('page') ?? undefined)
  if (!pageParse.success) {
    return NextResponse.json({ error: 'Invalid page parameter' }, { status: 400 })
  }
  const page = pageParse.data

  const smoobu = await getSmoobuClient(user.id, supabase)
  if (!smoobu) {
    return NextResponse.json(
      { error: 'Smoobu integration not connected', code: 'SMOOBU_NOT_CONNECTED' },
      { status: 400 }
    )
  }

  try {
    const result = await smoobu.getMessages(reservationIdNum, page)
    // Returns: { messages, page, page_count } — page_count enables "Ältere laden" UX (BUG-1).
    return NextResponse.json(result)
  } catch (err) {
    console.error('Failed to load messages:', err)
    return NextResponse.json(
      { error: 'Failed to load messages from Smoobu' },
      { status: 502 }
    )
  }
}

/**
 * POST /api/messages/[reservationId]
 * Send a message to a guest via Smoobu Messages API.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> }
) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate-limit per user — prevent spamming guests via Smoobu API
  const rl = checkRateLimit('messages-post', user.id, 10, 60_000)
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many messages – please slow down.', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  const { reservationId } = await params
  const reservationIdNum = parseInt(reservationId, 10)
  if (isNaN(reservationIdNum)) {
    return NextResponse.json({ error: 'Invalid reservation ID' }, { status: 400 })
  }

  // Verify the reservation belongs to a booking owned by this user.
  const owned = await verifyBookingOwnership(reservationIdNum, user.id, supabase)
  if (!owned) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const body = await request.json()
  const parsed = sendMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const smoobu = await getSmoobuClient(user.id, supabase)
  if (!smoobu) {
    return NextResponse.json(
      { error: 'Smoobu integration not connected', code: 'SMOOBU_NOT_CONNECTED' },
      { status: 400 }
    )
  }

  try {
    await smoobu.sendMessage(reservationIdNum, parsed.data.subject, parsed.data.body)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to send message:', err)
    return NextResponse.json(
      { error: 'Failed to send message via Smoobu' },
      { status: 502 }
    )
  }
}

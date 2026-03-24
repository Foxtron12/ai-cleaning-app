import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'

const sendMessageSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(5000),
})

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

  const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10)

  const smoobu = await getSmoobuClient(user.id, supabase)
  if (!smoobu) {
    return NextResponse.json(
      { error: 'Smoobu integration not connected', code: 'SMOOBU_NOT_CONNECTED' },
      { status: 400 }
    )
  }

  try {
    const messages = await smoobu.getMessages(reservationIdNum, page)
    return NextResponse.json({ messages })
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

  const { reservationId } = await params
  const reservationIdNum = parseInt(reservationId, 10)
  if (isNaN(reservationIdNum)) {
    return NextResponse.json({ error: 'Invalid reservation ID' }, { status: 400 })
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

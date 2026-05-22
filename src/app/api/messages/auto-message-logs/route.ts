import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // optional event_type filter
  event_type: z.string().min(1).max(50).optional(),
})

/**
 * GET /api/messages/auto-message-logs
 *
 * Returns the authenticated user's last N auto-message log rows so the
 * dashboard can show an audit trail (BUG #N12). RLS scopes to the user.
 *
 * Query params: limit (1..200, default 50), event_type (optional)
 */
export async function GET(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
    event_type: searchParams.get('event_type') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { limit, event_type } = parsed.data

  let query = supabase
    .from('auto_message_logs')
    .select('id, user_id, booking_id, trigger_id, event_type, message_subject, success, error, created_at, bookings(external_id, guest_firstname, guest_lastname, check_in, check_out, properties(name))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (event_type) {
    query = query.eq('event_type', event_type)
  }

  const { data, error } = await query
  if (error) {
    console.error('Failed to load auto-message logs:', error)
    return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [] })
}

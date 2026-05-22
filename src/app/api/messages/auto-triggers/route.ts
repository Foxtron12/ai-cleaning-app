import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

const EVENT_TYPES = [
  'new_booking',
  'checkin_reminder',
  'guest_checkin_completed',
  'follow_up',
  'checkout_reminder',
  'review_request',
  // Legacy (kept for backwards compatibility)
  'days_before_checkin',
  'after_checkout',
] as const

const upsertSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  template_id: z.string().uuid().nullable(),
  is_enabled: z.boolean(),
  delay_minutes: z.number().int().min(0).default(0),
  days_offset: z.number().int().min(0).default(0),
})

/**
 * GET /api/messages/auto-triggers
 * Returns the user's auto-message trigger configurations.
 */
export async function GET() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: triggers } = await supabase
    .from('auto_message_triggers')
    .select('id, event_type, template_id, is_enabled, delay_minutes, days_offset, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(20)

  return NextResponse.json({ triggers: triggers ?? [] })
}

/**
 * POST /api/messages/auto-triggers
 * Upsert an auto-message trigger (one per event_type per user).
 */
export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
  }

  const { event_type, template_id, is_enabled, days_offset } = parsed.data
  let { delay_minutes } = parsed.data

  // Event-based triggers (`new_booking`, `guest_checkin_completed`) fire from webhooks /
  // form submissions and cannot honor a delay (no job queue). Force delay_minutes = 0
  // server-side so the UI cannot create a "silently dropped" trigger configuration.
  const EVENT_BASED_NO_DELAY = new Set(['new_booking', 'guest_checkin_completed'])
  if (EVENT_BASED_NO_DELAY.has(event_type) && delay_minutes !== 0) {
    delay_minutes = 0
  }

  // NOTE: We allow `is_enabled=true && template_id=null` because the UI flow is:
  // (1) flip switch ON → (2) reveal template select → (3) pick a template.
  // The dashboard surfaces a prominent warning while this state persists, and the
  // backend `fireAutoMessageTrigger` short-circuits when template_id is null.
  // See PROJ-20 #N1 / #N9 — the silent-no-op is mitigated by UI warnings, not by
  // rejecting the API call (which would break the natural user flow).

  // Check if trigger already exists (upsert)
  const { data: existing } = await supabase
    .from('auto_message_triggers')
    .select('id')
    .eq('user_id', user.id)
    .eq('event_type', event_type)
    .single()

  if (existing) {
    const { data: updated, error } = await supabase
      .from('auto_message_triggers')
      .update({
        template_id,
        is_enabled,
        delay_minutes,
        days_offset,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ trigger: updated })
  }

  const { data: created, error } = await supabase
    .from('auto_message_triggers')
    .insert({
      user_id: user.id,
      event_type,
      template_id,
      is_enabled,
      delay_minutes,
      days_offset,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ trigger: created }, { status: 201 })
}

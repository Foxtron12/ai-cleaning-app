import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

const upsertSchema = z.object({
  event_type: z.literal('guest_checkin_completed'),
  template_id: z.string().uuid().nullable(),
  is_enabled: z.boolean(),
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
    .select('id, event_type, template_id, is_enabled, created_at, updated_at')
    .eq('user_id', user.id)
    .limit(10)

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

  const { event_type, template_id, is_enabled } = parsed.data

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
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ trigger: created }, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import {
  mapSmoobuReservation,
  calculateBookingStatus,
} from '@/lib/smoobu'
import type { SmoobuReservation } from '@/lib/types'
import type { Json } from '@/lib/database.types'
import { z } from 'zod'

// Zod schema for Smoobu webhook payload (validates minimum required fields)
const webhookPayloadSchema = z.object({
  id: z.number().int().positive(),
  apartment: z.object({
    id: z.number().int().positive(),
    name: z.string(),
  }),
  arrival: z.string(),
  departure: z.string(),
  channel: z.object({
    id: z.number(),
    name: z.string(),
  }).optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  email: z.string().optional(),
  phone: z.union([z.string(), z.null()]).optional(),
  adults: z.number().optional(),
  children: z.number().optional(),
  price: z.number().optional(),
  'host-payout': z.number().optional(),
  commission: z.number().optional(),
  'cleaning-fee': z.number().optional(),
  'extra-fees': z.number().optional(),
  currency: z.string().optional(),
  balance: z.number().optional(),
  prepayment: z.union([z.number(), z.null()]).optional(),
}).passthrough()

// ─── In-memory rate limiting ────────────────────────────────────────────────
// Suitable for Vercel serverless with low Smoobu webhook volume.
// Each cold start resets the map, which is acceptable for this use case.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX = 100 // max 100 requests per minute per token

function isRateLimited(token: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(token)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(token, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    return true
  }
  return false
}

/**
 * POST /api/webhooks/smoobu/[token]
 * Per-user webhook endpoint for Smoobu events.
 * Authenticated via the unique webhook token (no session needed).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Rate limiting
  if (isRateLimited(token)) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    )
  }

  // Validate token format (32-char hex)
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Look up integration by webhook token (service client bypasses RLS)
  const { data: integration, error: lookupError } = await supabase
    .from('integrations')
    .select('id, user_id, status')
    .eq('webhook_token', token)
    .eq('provider', 'smoobu')
    .single()

  if (lookupError || !integration) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (integration.status !== 'connected') {
    return NextResponse.json(
      { error: 'Integration is not active' },
      { status: 403 }
    )
  }

  const userId = integration.user_id

  // Declare outside try so catch block can access them
  let action: string | null = null
  let rawPayload: Json = null

  try {
    const body = await request.json()

    // Log raw webhook payload for debugging
    action = body?.action ?? null
    rawPayload = body

    // Smoobu may wrap the payload: { action: "...", data: { ... } }
    // Or send the reservation directly at the top level.
    const payload = body?.data && body?.action ? body.data : body

    const parsed = webhookPayloadSchema.safeParse(payload)

    if (!parsed.success) {
      // Log failed webhook
      await supabase.from('webhook_logs').insert({
        user_id: userId,
        provider: 'smoobu',
        action,
        payload: rawPayload,
        processed: false,
        error: JSON.stringify(parsed.error.issues),
      })
      console.warn('Smoobu webhook: invalid payload for token', token.slice(0, 8) + '...', JSON.stringify(parsed.error.issues))
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const reservation = parsed.data as SmoobuReservation

    // Find the property by Smoobu apartment ID (scoped to user)
    const { data: property } = await supabase
      .from('properties')
      .select('id')
      .eq('external_id', reservation.apartment.id)
      .eq('user_id', userId)
      .single()

    if (!property) {
      // Property not synced yet -- acknowledge receipt but don't process
      return NextResponse.json({
        success: false,
        message: 'Property not found. Run a full sync first.',
      })
    }

    const bookingData = mapSmoobuReservation(reservation, property.id)
    const isCancelled =
      reservation.status === 'cancelled' ||
      reservation.type?.toLowerCase().includes('cancellation')
    bookingData.status = calculateBookingStatus(
      reservation.arrival,
      reservation.departure,
      isCancelled
    )

    // Idempotent upsert: update if exists, insert if new
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('external_id', reservation.id)
      .eq('user_id', userId)
      .single()

    if (existing) {
      const { external_id: _, ...updateData } = bookingData
      await supabase
        .from('bookings')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('bookings')
        .insert({ ...bookingData, user_id: userId })
    }

    // Update last_synced_at on the integration
    await supabase
      .from('integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', integration.id)

    // Log successful webhook
    await supabase.from('webhook_logs').insert({
      user_id: userId,
      provider: 'smoobu',
      action,
      reservation_id: reservation.id,
      payload: rawPayload,
      processed: true,
    })

    return NextResponse.json({ success: true, bookingId: reservation.id })
  } catch (error) {
    console.error('Webhook error:', error)

    // Log error webhook (best-effort, don't fail if logging fails)
    try {
      await supabase.from('webhook_logs').insert({
        user_id: userId,
        provider: 'smoobu',
        action,
        payload: rawPayload ?? {},
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    } catch { /* ignore logging errors */ }

    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

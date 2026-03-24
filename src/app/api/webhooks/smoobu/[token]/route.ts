import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import {
  mapSmoobuReservation,
  calculateBookingStatus,
} from '@/lib/smoobu'
import { fireAutoMessageTrigger } from '@/lib/auto-message'
import type { SmoobuReservation } from '@/lib/types'
import type { Json } from '@/lib/database.types'
import { z } from 'zod'

// Actions that are not reservation events and should be ignored
const IGNORED_ACTIONS = new Set(['updateRates', 'updateAvailability'])

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
  firstname: z.string().optional().nullable(),
  lastname: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  adults: z.number().optional().nullable(),
  children: z.number().optional().nullable(),
  price: z.number().optional().nullable(),
  'host-payout': z.number().optional().nullable(),
  commission: z.number().optional().nullable(),
  'cleaning-fee': z.number().optional().nullable(),
  'extra-fees': z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  balance: z.number().optional().nullable(),
  prepayment: z.number().optional().nullable(),
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

    // Ignore non-reservation events (rate/availability updates)
    if (action && IGNORED_ACTIONS.has(action)) {
      await supabase.from('webhook_logs').insert({
        user_id: userId,
        provider: 'smoobu',
        action,
        payload: rawPayload,
        processed: true,
      })
      return NextResponse.json({ success: true, skipped: action })
    }

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
      .select('id, name, default_cleaning_fee')
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
      action === 'cancelled_reservation' ||
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
      const { external_id: _, trip_purpose: _tripPurpose, ...updateData } = bookingData

      // Check if this booking was created via our wizard (channel_id=0)
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('channel_id, cleaning_fee, payment_status, accommodation_tax_amount')
        .eq('id', existing.id)
        .single()
      const isWizardDirectBooking = existingBooking?.channel_id === 0

      // For wizard-created direct bookings, preserve cleaning_fee, accommodation_tax_amount,
      // and channel_id set by the user (even if 0€), since Smoobu doesn't reliably store these
      if (isWizardDirectBooking) {
        updateData.cleaning_fee = existingBooking.cleaning_fee
        updateData.channel_id = 0
        if (existingBooking.accommodation_tax_amount != null) {
          updateData.accommodation_tax_amount = existingBooking.accommodation_tax_amount
        }
      } else if ((updateData.cleaning_fee ?? 0) === 0 && updateData.channel !== 'Direct') {
        // For OTA bookings: when Smoobu returns cleaning_fee=0, use the property default
        if (property.default_cleaning_fee != null && property.default_cleaning_fee > 0) {
          updateData.cleaning_fee = property.default_cleaning_fee
        }
      }
      // Never overwrite an existing payment_status (manual, Stripe paid, etc.)
      if (existingBooking?.payment_status) {
        delete (updateData as Record<string, unknown>).payment_status
      }
      await supabase
        .from('bookings')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      // For OTA bookings: when Smoobu returns cleaning_fee=0, use the property default
      // Direct bookings: use what Smoobu returns as-is (user controls pricing)
      if ((bookingData.cleaning_fee ?? 0) === 0 && bookingData.channel !== 'Direct') {
        if (property.default_cleaning_fee != null && property.default_cleaning_fee > 0) {
          bookingData.cleaning_fee = property.default_cleaning_fee
        }
      }
      const { data: inserted } = await supabase
        .from('bookings')
        .insert({ ...bookingData, user_id: userId })
        .select('id')
        .single()

      // Fire auto-message trigger for new bookings (non-cancelled only)
      if (inserted && !isCancelled) {
        const guestName = [reservation.firstname, reservation.lastname]
          .filter(Boolean).join(' ') || reservation['guest-name'] || ''
        await fireAutoMessageTrigger(supabase, {
          userId,
          bookingId: inserted.id,
          externalId: reservation.id,
          eventType: 'new_booking',
          guestName,
          propertyName: property.name,
          checkIn: reservation.arrival,
          checkOut: reservation.departure,
        })
      }
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

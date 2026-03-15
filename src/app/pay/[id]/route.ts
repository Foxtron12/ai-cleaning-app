import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /pay/[id]
 * Public redirect: looks up booking by ID, redirects to Stripe checkout URL.
 * No auth required – the booking ID acts as an unguessable token (UUID).
 * Rate limited to prevent enumeration attacks.
 */

// Simple in-memory rate limiter: max 10 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 10

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return false
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) return true
  return false
}

// Cleanup stale entries periodically (prevent memory leak)
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 60_000)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const ip = _request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { id } = await params

  // Validate UUID format to reject obviously invalid requests
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.redirect(new URL('/', _request.url))
  }

  const supabase = createServiceClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('stripe_payment_link')
    .eq('id', id)
    .single()

  if (!booking?.stripe_payment_link) {
    return NextResponse.redirect(new URL('/', _request.url))
  }

  return NextResponse.redirect(booking.stripe_payment_link)
}

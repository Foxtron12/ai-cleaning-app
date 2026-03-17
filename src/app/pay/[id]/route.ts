import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase'
import { decrypt } from '@/lib/encryption'

/**
 * GET /pay/[id]
 * Public redirect: looks up booking by ID, checks if the Stripe Checkout
 * session is still valid (not expired), and redirects to it.
 * If the session has expired, a new one is automatically created.
 *
 * No auth required – the booking ID acts as an unguessable token (UUID).
 */

// Simple in-memory rate limiter: max 10 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000
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
  const ip = _request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { id } = await params
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.redirect(new URL('/', _request.url))
  }

  const supabase = createServiceClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, stripe_payment_link, stripe_checkout_session_id, payment_status, amount_gross, guest_firstname, guest_lastname, guest_email, check_in, check_out, properties(name)')
    .eq('id', id)
    .single()

  if (!booking) {
    return NextResponse.redirect(new URL('/', _request.url))
  }

  // Already paid — redirect to success page
  if (booking.payment_status === 'paid') {
    return NextResponse.redirect(new URL('/dashboard/buchungen?payment=already_paid', _request.url))
  }

  // Try to use existing session if available
  if (booking.stripe_payment_link && booking.stripe_checkout_session_id) {
    try {
      const stripe = await getStripeClient(supabase, booking.user_id!)
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id)

        // Session is still open — redirect to it
        if (session.status === 'open' && session.url) {
          return NextResponse.redirect(session.url)
        }

        // Session completed (paid) — update booking
        if (session.status === 'complete') {
          await supabase
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', id)
          return NextResponse.redirect(new URL('/dashboard/buchungen?payment=success', _request.url))
        }
      }
    } catch {
      // Session retrieval failed — create a new one below
    }
  }

  // Session expired or doesn't exist — create a new one
  try {
    const stripe = await getStripeClient(supabase, booking.user_id!)
    if (!stripe) {
      return NextResponse.redirect(new URL('/', _request.url))
    }

    const totalCents = Math.round((booking.amount_gross ?? 0) * 100)
    if (totalCents <= 0) {
      return NextResponse.redirect(new URL('/', _request.url))
    }

    const propertyName = (booking.properties as { name?: string } | null)?.name ?? 'Ferienwohnung'
    const formatDate = (d: string) => {
      const [y, m, day] = d.split('-')
      return `${day}.${m}.${y}`
    }
    const description = `${propertyName} – ${formatDate(booking.check_in)} bis ${formatDate(booking.check_out)}`
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: description,
              description: `Gast: ${booking.guest_firstname ?? ''} ${booking.guest_lastname ?? ''}`.trim(),
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'booking_payment',
        booking_id: id,
        user_id: booking.user_id!,
      },
      customer_email: booking.guest_email ?? undefined,
      success_url: `${siteUrl}/dashboard/buchungen?payment=success&booking=${id}`,
      cancel_url: `${siteUrl}/pay/${id}`,
    })

    // Update booking with new session
    await supabase
      .from('bookings')
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_link: session.url,
        payment_status: 'pending',
      })
      .eq('id', id)

    return NextResponse.redirect(session.url!)
  } catch (err) {
    console.error('pay/[id] auto-renew failed:', err)
    return NextResponse.redirect(new URL('/', _request.url))
  }
}

/** Load the user's Stripe API key and return a Stripe client */
async function getStripeClient(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<Stripe | null> {
  const { data: integration } = await supabase
    .from('integrations')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('status', 'connected')
    .single()

  if (!integration?.api_key_encrypted) return null

  const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
  return new Stripe(apiKey, { apiVersion: '2026-02-25.clover' })
}

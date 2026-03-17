import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase'
import { decrypt } from '@/lib/encryption'

/**
 * GET /api/debug-payment?id=BOOKING_UUID
 * Debug endpoint — shows payment session status without redirecting.
 * REMOVE after debugging.
 */
export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('id')
  if (!bookingId) {
    return NextResponse.json({ error: 'Missing ?id= parameter' })
  }

  const supabase = createServiceClient()

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, user_id, stripe_payment_link, stripe_checkout_session_id, payment_status, amount_gross, guest_firstname, guest_lastname')
    .eq('id', bookingId)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found', bookingError })
  }

  // Load Stripe client
  const { data: integration } = await supabase
    .from('integrations')
    .select('api_key_encrypted')
    .eq('user_id', booking.user_id!)
    .eq('provider', 'stripe')
    .eq('status', 'connected')
    .single()

  if (!integration?.api_key_encrypted) {
    return NextResponse.json({ error: 'No Stripe integration found', booking })
  }

  let apiKey: string
  try {
    const result = decrypt(integration.api_key_encrypted)
    apiKey = result.plaintext
  } catch (e) {
    return NextResponse.json({ error: 'Decrypt failed', message: String(e) })
  }

  const stripe = new Stripe(apiKey, { apiVersion: '2026-02-25.clover' })

  // Check existing session
  let sessionStatus = null
  let sessionUrl = null
  if (booking.stripe_checkout_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id)
      sessionStatus = session.status
      sessionUrl = session.url
    } catch (e) {
      sessionStatus = `error: ${String(e)}`
    }
  }

  // Try creating a new session
  let newSessionError = null
  let newSessionUrl = null
  try {
    const totalCents = Math.round((booking.amount_gross ?? 0) * 100)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    const newSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: `Debug Test – ${booking.guest_firstname} ${booking.guest_lastname}` },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      metadata: { type: 'booking_payment', booking_id: bookingId },
      customer_email: undefined,
      success_url: `${siteUrl}/dashboard/buchungen?payment=success`,
      cancel_url: `${siteUrl}/pay/${bookingId}`,
    })
    newSessionUrl = newSession.url
  } catch (e) {
    newSessionError = String(e)
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      guest: `${booking.guest_firstname} ${booking.guest_lastname}`,
      payment_status: booking.payment_status,
      amount_gross: booking.amount_gross,
      has_checkout_session: !!booking.stripe_checkout_session_id,
    },
    existingSession: {
      status: sessionStatus,
      url: sessionUrl,
    },
    newSession: {
      url: newSessionUrl,
      error: newSessionError,
    },
    env: {
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? '(not set)',
    },
  })
}

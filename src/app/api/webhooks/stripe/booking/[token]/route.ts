import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'

/**
 * POST /api/webhooks/stripe/booking/[token]
 * Per-user Stripe webhook for booking payment events.
 * The [token] identifies which user's integration to use for signature verification.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServiceClient()

  // Look up integration by webhook token
  const { data: integration, error: lookupError } = await supabase
    .from('integrations')
    .select('id, user_id, api_key_encrypted, webhook_secret_encrypted')
    .eq('provider', 'stripe')
    .eq('webhook_token', token)
    .eq('status', 'connected')
    .single()

  if (lookupError || !integration) {
    return NextResponse.json({ error: 'Ungültiger Webhook-Token' }, { status: 404 })
  }

  if (!integration.webhook_secret_encrypted) {
    return NextResponse.json({ error: 'Kein Webhook-Secret konfiguriert' }, { status: 500 })
  }

  // Verify Stripe signature using the user's webhook secret
  const { plaintext: webhookSecret } = decrypt(integration.webhook_secret_encrypted)
  const { plaintext: apiKey } = decrypt(integration.api_key_encrypted!)

  const stripe = new Stripe(apiKey, { apiVersion: '2026-02-25.clover' })
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Keine Stripe-Signatur' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Stripe booking webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 400 })
  }

  // Handle checkout.session.completed for booking payments
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session

    // Only handle booking payments
    if (session.metadata?.type !== 'booking_payment') {
      return NextResponse.json({ received: true, skipped: 'not a booking payment' })
    }

    if (session.payment_status !== 'paid') {
      console.log(
        `Stripe booking webhook: session ${session.id} payment_status is '${session.payment_status}', waiting`
      )
      return NextResponse.json({ received: true })
    }

    const bookingId = session.metadata.booking_id
    if (!bookingId) {
      console.error('Stripe booking webhook: missing booking_id in metadata')
      return NextResponse.json({ error: 'Keine booking_id in Metadata' }, { status: 400 })
    }

    // Update booking payment status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ payment_status: 'paid' })
      .eq('id', bookingId)
      .eq('user_id', integration.user_id)

    if (updateError) {
      console.error('Stripe booking webhook: failed to update booking:', updateError)
      return NextResponse.json({ error: 'Buchungs-Update fehlgeschlagen' }, { status: 500 })
    }

    console.log(`Stripe booking webhook: booking ${bookingId} marked as paid`)
  }

  // Handle async payment failure
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (session.metadata?.type !== 'booking_payment') {
      return NextResponse.json({ received: true, skipped: 'not a booking payment' })
    }

    const bookingId = session.metadata.booking_id
    if (bookingId) {
      await supabase
        .from('bookings')
        .update({ payment_status: 'failed' })
        .eq('id', bookingId)
        .eq('user_id', integration.user_id)

      console.error(`Stripe booking webhook: payment failed for booking ${bookingId}`)
    }
  }

  return NextResponse.json({ received: true })
}

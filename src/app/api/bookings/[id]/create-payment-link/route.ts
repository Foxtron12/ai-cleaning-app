import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerUser } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'

/**
 * POST /api/bookings/[id]/create-payment-link
 * Creates a Stripe Checkout Session for a booking and stores the link.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id: bookingId } = await params

  // Load booking with property
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, properties(*)')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
  }

  // Load user's Stripe API key
  const { data: integration } = await supabase
    .from('integrations')
    .select('api_key_encrypted')
    .eq('user_id', user.id)
    .eq('provider', 'stripe')
    .eq('status', 'connected')
    .single()

  if (!integration?.api_key_encrypted) {
    return NextResponse.json(
      { error: 'Stripe ist nicht konfiguriert. Bitte unter Integrationen den API-Key hinterlegen.' },
      { status: 400 }
    )
  }

  const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
  const stripe = new Stripe(apiKey, { apiVersion: '2026-02-25.clover' })

  // Calculate total in cents
  const totalAmount = booking.amount_gross ?? 0
  const totalCents = Math.round(totalAmount * 100)

  if (totalCents <= 0) {
    return NextResponse.json(
      { error: 'Buchungsbetrag muss größer als 0 sein' },
      { status: 400 }
    )
  }

  // Build description
  const propertyName = booking.properties?.name ?? 'Ferienwohnung'
  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-')
    return `${day}.${m}.${y}`
  }
  const description = `${propertyName} – ${formatDate(booking.check_in)} bis ${formatDate(booking.check_out)}`

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'sepa_debit'],
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
        booking_id: bookingId,
        user_id: user.id,
      },
      customer_email: booking.guest_email ?? undefined,
      success_url: `${siteUrl}/dashboard/buchungen?payment=success&booking=${bookingId}`,
      cancel_url: `${siteUrl}/dashboard/buchungen?payment=cancelled&booking=${bookingId}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    })

    // Store the checkout session info on the booking
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_link: session.url,
        payment_status: 'pending',
      })
      .eq('id', bookingId)
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: `Zahlungslink erstellt, aber Buchung konnte nicht aktualisiert werden: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      paymentLink: session.url,
      sessionId: session.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe-Fehler'
    return NextResponse.json(
      { error: `Zahlungslink konnte nicht erstellt werden: ${message}` },
      { status: 500 }
    )
  }
}

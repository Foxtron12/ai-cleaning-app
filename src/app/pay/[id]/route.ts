import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /pay/[id]
 * Public redirect: looks up booking by ID, redirects to Stripe checkout URL.
 * No auth required – the booking ID acts as an unguessable token (UUID).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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

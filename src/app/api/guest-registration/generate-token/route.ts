import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

const schema = z.object({
  booking_id: z.string().uuid(),
})

/**
 * POST /api/guest-registration/generate-token
 * Generates a guest registration token for a booking.
 * Authenticated – requires logged-in user.
 * Idempotent – returns existing token if one already exists.
 */
export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })
  }

  const { booking_id } = parsed.data

  // Verify booking belongs to user
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, check_out')
    .eq('id', booking_id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // Check for existing token
  const { data: existing } = await supabase
    .from('guest_registration_tokens')
    .select('id, token, status, expires_at')
    .eq('booking_id', booking_id)
    .single()

  if (existing) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    return NextResponse.json({
      token: existing.token,
      url: `${siteUrl}/guest/register/${existing.token}`,
      status: existing.status,
      expires_at: existing.expires_at,
    })
  }

  // Create new token with expiry = check_out + 30 days
  const expiresAt = new Date(booking.check_out)
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { data: token, error } = await supabase
    .from('guest_registration_tokens')
    .insert({
      booking_id,
      user_id: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, token, status, expires_at')
    .single()

  if (error) {
    console.error('Failed to create guest registration token:', error)
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return NextResponse.json({
    token: token.token,
    url: `${siteUrl}/guest/register/${token.token}`,
    status: token.status,
    expires_at: token.expires_at,
  })
}

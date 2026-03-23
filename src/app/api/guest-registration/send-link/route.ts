import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'
import { getRegistrationMessage } from '@/lib/guest-registration-templates'
import type { Locale } from '@/lib/i18n/guest-registration'

const schema = z.object({
  booking_id: z.string().uuid(),
  language: z.enum(['de', 'en']).default('de'),
})

/**
 * POST /api/guest-registration/send-link
 * Sends the guest registration link via Smoobu Messages API.
 * Authenticated – requires logged-in user.
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

  const { booking_id, language } = parsed.data

  // Get booking with external_id for Smoobu
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, external_id, guest_firstname, guest_lastname, check_out, property_id, properties(name)')
    .eq('id', booking_id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  if (!booking.external_id) {
    return NextResponse.json({ error: 'Booking has no Smoobu ID – cannot send message' }, { status: 400 })
  }

  // Get or create token
  let token: string
  const { data: existingToken } = await supabase
    .from('guest_registration_tokens')
    .select('id, token')
    .eq('booking_id', booking_id)
    .single()

  if (existingToken) {
    token = existingToken.token
  } else {
    const expiresAt = new Date(booking.check_out)
    expiresAt.setDate(expiresAt.getDate() + 30)

    const { data: newToken, error } = await supabase
      .from('guest_registration_tokens')
      .insert({
        booking_id,
        user_id: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select('id, token')
      .single()

    if (error || !newToken) {
      return NextResponse.json({ error: 'Failed to create token' }, { status: 500 })
    }
    token = newToken.token
  }

  // Build registration URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const registrationUrl = `${siteUrl}/guest/register/${token}`

  // Get Smoobu API key
  const { data: integration } = await supabase
    .from('integrations')
    .select('api_key_encrypted')
    .eq('user_id', user.id)
    .eq('provider', 'smoobu')
    .eq('status', 'connected')
    .single()

  if (!integration?.api_key_encrypted) {
    return NextResponse.json({ error: 'Smoobu integration not connected' }, { status: 400 })
  }

  const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
  const smoobu = new SmoobuClient({ apiKey })

  // Build message
  const guestName = `${booking.guest_firstname ?? ''} ${booking.guest_lastname ?? ''}`.trim() || 'Gast'
  const propertyName = (booking.properties as { name?: string } | null)?.name ?? 'Ferienwohnung'
  const message = getRegistrationMessage(language as Locale, guestName, propertyName, registrationUrl)

  // Send via Smoobu
  try {
    await smoobu.sendMessage(booking.external_id, message.subject, message.body)
  } catch (err) {
    console.error('Failed to send Smoobu message:', err)
    return NextResponse.json({ error: 'Failed to send message via Smoobu' }, { status: 502 })
  }

  // Update token status to 'sent'
  const tokenId = existingToken?.id
  if (tokenId) {
    await supabase
      .from('guest_registration_tokens')
      .update({ status: 'sent' })
      .eq('id', tokenId)
  }

  return NextResponse.json({
    success: true,
    url: registrationUrl,
    token,
  })
}

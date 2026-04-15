import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fireAutoMessageTrigger } from '@/lib/auto-message'
import { addDays, format } from 'date-fns'

/**
 * GET /api/messages/cron
 *
 * Vercel Cron endpoint (or manual trigger) that checks all bookings
 * and fires time-based auto-message triggers:
 *
 * - checkin_reminder: 1 day before check-in (only if online check-in NOT completed)
 * - follow_up: 1 day after check-in
 * - checkout_reminder: 1 day before check-out
 * - review_request: on check-out day (intended for 15:00, run cron at that time)
 *
 * Protected by CRON_SECRET or the service role key.
 */
export async function GET(req: NextRequest) {
  // Auth: accept CRON_SECRET header or query param
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd')
  const yesterday = format(addDays(now, -1), 'yyyy-MM-dd')

  const results = {
    checkin_reminder: 0,
    follow_up: 0,
    checkout_reminder: 0,
    review_request: 0,
    errors: 0,
  }

  try {
    // Load all users with active time-based triggers
    const { data: triggers } = await supabase
      .from('auto_message_triggers')
      .select('user_id, event_type, template_id, delay_minutes')
      .eq('is_enabled', true)
      .in('event_type', ['checkin_reminder', 'follow_up', 'checkout_reminder', 'review_request'])
      .not('template_id', 'is', null)

    if (!triggers || triggers.length === 0) {
      return NextResponse.json({ message: 'Keine aktiven zeitbasierten Trigger', results })
    }

    // Group triggers by user
    const triggersByUser = new Map<string, typeof triggers>()
    for (const t of triggers) {
      const list = triggersByUser.get(t.user_id) ?? []
      list.push(t)
      triggersByUser.set(t.user_id, list)
    }

    // Process each user
    for (const [userId, userTriggers] of triggersByUser) {
      const eventTypes = userTriggers.map((t) => t.event_type)

      // Determine which dates we need to query
      const needsTomorrow = eventTypes.includes('checkin_reminder') || eventTypes.includes('checkout_reminder')
      const needsYesterday = eventTypes.includes('follow_up')
      const needsToday = eventTypes.includes('review_request')

      // Build date filter: bookings with check_in or check_out matching relevant dates
      const dates: string[] = []
      if (needsTomorrow) dates.push(tomorrow)
      if (needsYesterday) dates.push(yesterday)
      if (needsToday) dates.push(today)

      if (dates.length === 0) continue

      // Fetch relevant bookings for this user
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, external_id, guest_firstname, guest_lastname, check_in, check_out, adults, property_id, properties(name)')
        .eq('user_id', userId)
        .or(`check_in.in.(${dates.join(',')}),check_out.in.(${dates.join(',')})`)
        .not('status', 'eq', 'cancelled')
        .limit(200)

      if (!bookings || bookings.length === 0) continue

      // Load check-in status for all bookings (for checkin_reminder condition)
      const bookingIds = bookings.map((b) => b.id)
      const { data: tokens } = await supabase
        .from('guest_registration_tokens')
        .select('booking_id, token, status')
        .in('booking_id', bookingIds)

      const tokenMap = new Map(tokens?.map((t) => [t.booking_id, t]) ?? [])

      // Check already-sent messages to avoid duplicates
      const { data: sentLogs } = await supabase
        .from('auto_message_logs')
        .select('booking_id, event_type')
        .eq('user_id', userId)
        .eq('success', true)
        .in('booking_id', bookingIds)
        .in('event_type', eventTypes)

      const sentSet = new Set(
        sentLogs?.map((l) => `${l.booking_id}:${l.event_type}`) ?? []
      )

      // Process each booking
      for (const booking of bookings) {
        const guestName = [booking.guest_firstname, booking.guest_lastname].filter(Boolean).join(' ') || 'Gast'
        const propertyName = (booking.properties as { name: string } | null)?.name ?? ''
        const token = tokenMap.get(booking.id)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.example.com'
        const registrationLink = token ? `${siteUrl}/guest/register/${token.token}` : undefined

        if (!booking.external_id) continue

        // checkin_reminder: check_in is tomorrow AND check-in NOT completed
        if (
          eventTypes.includes('checkin_reminder') &&
          booking.check_in === tomorrow &&
          (!token || token.status !== 'completed') &&
          !sentSet.has(`${booking.id}:checkin_reminder`)
        ) {
          try {
            await fireAutoMessageTrigger(supabase, {
              userId,
              bookingId: booking.id,
              externalId: booking.external_id,
              eventType: 'checkin_reminder',
              guestName,
              propertyName,
              checkIn: booking.check_in,
              checkOut: booking.check_out,
              numberOfGuests: booking.adults ?? 1,
              registrationLink,
              skipDelayCheck: true,
            })
            results.checkin_reminder++
          } catch {
            results.errors++
          }
        }

        // follow_up: check_in was yesterday
        if (
          eventTypes.includes('follow_up') &&
          booking.check_in === yesterday &&
          !sentSet.has(`${booking.id}:follow_up`)
        ) {
          try {
            await fireAutoMessageTrigger(supabase, {
              userId,
              bookingId: booking.id,
              externalId: booking.external_id,
              eventType: 'follow_up',
              guestName,
              propertyName,
              checkIn: booking.check_in,
              checkOut: booking.check_out,
              numberOfGuests: booking.adults ?? 1,
              registrationLink,
              skipDelayCheck: true,
            })
            results.follow_up++
          } catch {
            results.errors++
          }
        }

        // checkout_reminder: check_out is tomorrow
        if (
          eventTypes.includes('checkout_reminder') &&
          booking.check_out === tomorrow &&
          !sentSet.has(`${booking.id}:checkout_reminder`)
        ) {
          try {
            await fireAutoMessageTrigger(supabase, {
              userId,
              bookingId: booking.id,
              externalId: booking.external_id,
              eventType: 'checkout_reminder',
              guestName,
              propertyName,
              checkIn: booking.check_in,
              checkOut: booking.check_out,
              numberOfGuests: booking.adults ?? 1,
              registrationLink,
              skipDelayCheck: true,
            })
            results.checkout_reminder++
          } catch {
            results.errors++
          }
        }

        // review_request: check_out is today
        if (
          eventTypes.includes('review_request') &&
          booking.check_out === today &&
          !sentSet.has(`${booking.id}:review_request`)
        ) {
          try {
            await fireAutoMessageTrigger(supabase, {
              userId,
              bookingId: booking.id,
              externalId: booking.external_id,
              eventType: 'review_request',
              guestName,
              propertyName,
              checkIn: booking.check_in,
              checkOut: booking.check_out,
              numberOfGuests: booking.adults ?? 1,
              registrationLink,
              skipDelayCheck: true,
            })
            results.review_request++
          } catch {
            results.errors++
          }
        }
      }
    }

    return NextResponse.json({
      message: 'Cron erfolgreich ausgeführt',
      results,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error('Auto-message cron error:', err)
    return NextResponse.json(
      { error: 'Interner Fehler', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

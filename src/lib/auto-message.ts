import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'
import { replaceTemplateVariables } from '@/lib/message-template-defaults'
import { format, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fires all enabled auto-message triggers for a given event.
 * Loads the user's trigger config, resolves the template, sends via Smoobu, and logs the result.
 *
 * @param supabase - Service-level Supabase client (bypasses RLS)
 * @param params - Event context
 */
export async function fireAutoMessageTrigger(
  supabase: SupabaseClient,
  params: {
    userId: string
    bookingId: string
    externalId: number
    eventType: string
    guestName: string
    propertyName: string
    checkIn: string
    checkOut: string
    numberOfGuests?: number
    registrationLink?: string
    /** Skip delay_minutes check (used by cron, which handles timing itself) */
    skipDelayCheck?: boolean
  }
): Promise<void> {
  const { userId, bookingId, externalId, eventType, guestName, propertyName, checkIn, checkOut, registrationLink } = params

  try {
    // Check if user has an enabled trigger for this event
    const { data: trigger } = await supabase
      .from('auto_message_triggers')
      .select('id, template_id, is_enabled, delay_minutes')
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .eq('is_enabled', true)
      .single()

    if (!trigger?.template_id) return

    // Event-based triggers (`new_booking`, `guest_checkin_completed`) cannot honor a delay
    // because we have no job queue. Server-side ENFORCE delay=0 for these by ignoring it
    // (rather than silently dropping the message).
    const EVENT_BASED_TRIGGERS = ['new_booking', 'guest_checkin_completed'] as const
    const isEventBased = (EVENT_BASED_TRIGGERS as readonly string[]).includes(eventType)

    // Dedup: don't re-send the same event_type for the same booking if a successful send
    // has already been logged. The cron path has its own dedup against auto_message_logs;
    // this guards the event-based path against webhook retries / double-submissions.
    if (!params.skipDelayCheck) {
      const { data: priorLogs } = await supabase
        .from('auto_message_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('booking_id', bookingId)
        .eq('event_type', eventType)
        .eq('success', true)
        .limit(1)

      if (priorLogs && priorLogs.length > 0) {
        console.log(`Auto-message dedup: ${eventType} already sent successfully for booking ${bookingId}, skipping`)
        return
      }
    }

    // BUG-10 fix: previously, non-event-based triggers (legacy `days_before_checkin`,
    // `days_after_checkout`) with delay_minutes > 0 were silently dropped — no log row,
    // no UI signal. These event types are not exposed in the current UI but may still
    // exist on legacy rows. Rather than silently dropping the message, we now IGNORE
    // delay_minutes uniformly (we have no job queue) and send immediately, with a
    // server-side warning. The cron path (skipDelayCheck=true) bypasses this.
    if (trigger.delay_minutes > 0 && !params.skipDelayCheck) {
      console.warn(
        `Auto-message for ${eventType}: delay_minutes=${trigger.delay_minutes} ignored ` +
          `(no job queue available; ${isEventBased ? 'event-based trigger' : 'legacy time-based trigger'}) — sending immediately`
      )
    }

    // Load template
    const { data: template } = await supabase
      .from('message_templates')
      .select('name, body')
      .eq('id', trigger.template_id)
      .single()

    if (!template) return

    // Get Smoobu integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('api_key_encrypted')
      .eq('user_id', userId)
      .eq('provider', 'smoobu')
      .eq('status', 'connected')
      .single()

    if (!integration?.api_key_encrypted) return

    const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
    const client = new SmoobuClient({ apiKey })

    // Load brand name from profile for {{companyName}} placeholder
    const { data: profile } = await supabase
      .from('profiles')
      .select('brand_name, company_name')
      .eq('id', userId)
      .single()

    const messageBody = replaceTemplateVariables(template.body, {
      guestFirstName: guestName.split(' ')[0],
      checkInDate: checkIn ? format(new Date(checkIn), 'dd.MM.yyyy', { locale: de }) : '',
      checkOutDate: checkOut ? format(new Date(checkOut), 'dd.MM.yyyy', { locale: de }) : '',
      numberOfGuests: String(params.numberOfGuests ?? 1),
      preCheckInLink: registrationLink,
      // PROJ-19 N2 (2026-05-06): /guest/area/[token] route does not exist.
      // Pass undefined → replaceTemplateVariables substitutes empty string for any
      // legacy templates that still reference {{guestAreaLateCheckOutLink}}.
      guestAreaLateCheckOutLink: undefined,
      companyName: profile?.brand_name || profile?.company_name || '',
      bookingNumber: String(externalId),
      propertyName,
    })

    let success = false
    let error: string | null = null
    try {
      await client.sendMessage(externalId, template.name, messageBody)
      success = true
    } catch (sendErr) {
      const rawMessage = sendErr instanceof Error ? sendErr.message : String(sendErr)
      // Sanitize: Smoobu errors include the raw HTTP body (`Smoobu API error 4xx: <body>`)
      // which may contain API-key fragments or guest details. Truncate to a safe length
      // and strip anything after a likely API-key/header marker before persisting.
      error = rawMessage
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
        .replace(/api[-_]?key[\s:=]+[A-Za-z0-9._-]+/gi, 'api_key=[REDACTED]')
        .slice(0, 500)
      console.error(`Auto-message send failed for ${eventType} (non-fatal):`, sendErr)
    }

    // Log (fire-and-forget but surface insert errors to server console)
    const { error: logErr } = await supabase.from('auto_message_logs').insert({
      user_id: userId,
      booking_id: bookingId,
      trigger_id: trigger.id,
      event_type: eventType,
      message_subject: template.name,
      message_body: messageBody,
      success,
      error,
    })
    if (logErr) {
      console.error(`Auto-message log insert failed for ${eventType} (non-fatal):`, logErr)
    }
  } catch (err) {
    console.error(`Auto-message trigger check failed for ${eventType} (non-fatal):`, err)
  }
}

/**
 * Fires time-based reminders that are ALREADY DUE for a single booking, right when
 * the booking is created.
 *
 * The cron (/api/messages/cron) only evaluates time-based triggers at its fixed run
 * times (09:00 / 15:00 UTC). A booking that arrives AFTER the last run of the day with
 * check-out the next day would otherwise miss its checkout_reminder entirely (the next
 * morning check_out === today, not tomorrow). This runs the same date conditions for the
 * one new booking so a due reminder is not lost.
 *
 * NOT "send immediately for every booking": a booking with check-out weeks away triggers
 * nothing here. It only fires what the cron itself would have fired today. Dedup in
 * fireAutoMessageTrigger (skipDelayCheck omitted) prevents a double-send if the cron later
 * runs over the same booking.
 */
export async function fireDueTimeBasedTriggers(
  supabase: SupabaseClient,
  params: {
    userId: string
    bookingId: string
    externalId: number
    guestName: string
    propertyName: string
    checkIn: string
    checkOut: string
    numberOfGuests?: number
    registrationLink?: string
  }
): Promise<void> {
  const { userId, bookingId, externalId, guestName, propertyName, checkIn, checkOut } = params

  try {
    const now = new Date()
    const today = format(now, 'yyyy-MM-dd')
    const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd')
    const yesterday = format(addDays(now, -1), 'yyyy-MM-dd')

    const { data: triggers } = await supabase
      .from('auto_message_triggers')
      .select('event_type')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .in('event_type', ['checkin_reminder', 'follow_up', 'checkout_reminder', 'review_request'])
      .not('template_id', 'is', null)

    if (!triggers || triggers.length === 0) return
    const eventTypes = new Set(triggers.map((t) => t.event_type))

    const fire = (eventType: string) =>
      fireAutoMessageTrigger(supabase, {
        userId,
        bookingId,
        externalId,
        eventType,
        guestName,
        propertyName,
        checkIn,
        checkOut,
        numberOfGuests: params.numberOfGuests,
        registrationLink: params.registrationLink,
        // skipDelayCheck omitted on purpose: fireAutoMessageTrigger's dedup against
        // auto_message_logs must run so the cron can't re-send the same reminder later.
      })

    // checkin_reminder: check-in is tomorrow AND online check-in NOT completed
    if (eventTypes.has('checkin_reminder') && checkIn === tomorrow) {
      const { data: token } = await supabase
        .from('guest_registration_tokens')
        .select('status')
        .eq('booking_id', bookingId)
        .maybeSingle()
      if (!token || token.status !== 'completed') {
        await fire('checkin_reminder')
      }
    }

    // follow_up: check-in was yesterday
    if (eventTypes.has('follow_up') && checkIn === yesterday) {
      await fire('follow_up')
    }

    // checkout_reminder: check-out is tomorrow
    if (eventTypes.has('checkout_reminder') && checkOut === tomorrow) {
      await fire('checkout_reminder')
    }

    // review_request: check-out is today AND it's the afternoon (>=14:00 UTC), matching
    // the cron's guard so reviews are not requested while the guest is still checking out.
    if (eventTypes.has('review_request') && checkOut === today && now.getUTCHours() >= 14) {
      await fire('review_request')
    }
  } catch (err) {
    console.error('fireDueTimeBasedTriggers failed (non-fatal):', err)
  }
}

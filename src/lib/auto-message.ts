import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'
import { replaceTemplateVariables } from '@/lib/message-template-defaults'
import { format } from 'date-fns'
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

    // If delay > 0 and not called from cron, skip (would need a job queue for delayed sends)
    // Cron-based triggers (checkin_reminder, follow_up, etc.) handle timing via schedule
    if (trigger.delay_minutes > 0 && !params.skipDelayCheck) {
      console.log(`Auto-message for ${eventType}: delay=${trigger.delay_minutes}min, skipping (not yet supported)`)
      return
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
      guestAreaLateCheckOutLink: registrationLink ? registrationLink.replace('/register/', '/area/') : undefined,
      companyName: profile?.brand_name || profile?.company_name || '',
    })

    let success = false
    let error: string | null = null
    try {
      await client.sendMessage(externalId, template.name, messageBody)
      success = true
    } catch (sendErr) {
      error = sendErr instanceof Error ? sendErr.message : String(sendErr)
      console.error(`Auto-message send failed for ${eventType} (non-fatal):`, sendErr)
    }

    // Log
    await supabase.from('auto_message_logs').insert({
      user_id: userId,
      booking_id: bookingId,
      trigger_id: trigger.id,
      event_type: eventType,
      message_subject: template.name,
      message_body: messageBody,
      success,
      error,
    })
  } catch (err) {
    console.error(`Auto-message trigger check failed for ${eventType} (non-fatal):`, err)
  }
}

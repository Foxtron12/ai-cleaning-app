import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Auto-generates registration_form records for bookings that have
 * sufficient data but no existing form. Called on page load and after Smoobu sync.
 *
 * PROJ-15: Stricter validation – all 6 mandatory fields per BeherbStatG must be present:
 * guest_firstname, guest_lastname, check_in, check_out, guest_nationality, guest_street.
 * Bookings missing any of these are skipped (no error, just not auto-generated).
 */
export async function autoGenerateMeldescheine(
  userId: string,
  supabase: SupabaseClient<Database>
): Promise<{ created: number; skipped: number }> {

  // Fetch bookings with minimum required fields, scoped to user
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, property_id, guest_firstname, guest_lastname, guest_nationality, guest_street, guest_city, guest_zip, guest_country, check_in, check_out, adults, children, trip_purpose, properties(name, street, city, zip)')
    .eq('user_id', userId)
    .not('guest_firstname', 'is', null)
    .not('guest_lastname', 'is', null)
    .neq('status', 'cancelled')

  if (bookingsError || !bookings || bookings.length === 0) return { created: 0, skipped: 0 }

  // Get booking IDs that already have a registration form for this user
  const { data: existingForms } = await supabase
    .from('registration_forms')
    .select('booking_id')
    .eq('user_id', userId)
    .not('booking_id', 'is', null)

  const existingBookingIds = new Set(
    (existingForms ?? []).map((f) => f.booking_id).filter(Boolean)
  )

  // Find bookings without an existing form
  const withoutForm = bookings.filter((b) => !existingBookingIds.has(b.id))
  if (withoutForm.length === 0) return { created: 0, skipped: 0 }

  // PROJ-15: Strict mandatory field check per BeherbStatG
  // All 6 fields must be non-empty for auto-generation
  const toCreate = withoutForm.filter(
    (b) =>
      b.guest_firstname?.trim() &&
      b.guest_lastname?.trim() &&
      b.check_in &&
      b.check_out &&
      b.guest_nationality?.trim() &&
      b.guest_street?.trim()
  )
  const skipped = withoutForm.length - toCreate.length
  if (toCreate.length === 0) return { created: 0, skipped }

  type PropertySnapshot = { name?: string; street?: string; city?: string; zip?: string }

  const inserts = toCreate.map((b) => ({
    booking_id: b.id,
    property_id: b.property_id,
    user_id: userId,
    guest_firstname: b.guest_firstname!,
    guest_lastname: b.guest_lastname!,
    guest_nationality: b.guest_nationality ?? null,
    guest_street: b.guest_street ?? null,
    guest_city: b.guest_city ?? null,
    guest_zip: b.guest_zip ?? null,
    guest_country: b.guest_country ?? null,
    check_in: b.check_in,
    check_out: b.check_out,
    adults: b.adults ?? 1,
    children: b.children ?? 0,
    trip_purpose: b.trip_purpose ?? null,
    property_snapshot: {
      name: (b.properties as PropertySnapshot)?.name ?? '',
      street: (b.properties as PropertySnapshot)?.street ?? '',
      city: (b.properties as PropertySnapshot)?.city ?? '',
      zip: (b.properties as PropertySnapshot)?.zip ?? '',
    },
    status: 'created',
  }))

  const { error: insertError } = await supabase
    .from('registration_forms')
    .insert(inserts)

  if (insertError) {
    console.error('autoGenerateMeldescheine insert error:', insertError.message)
    return { created: 0, skipped }
  }

  return { created: toCreate.length, skipped }
}

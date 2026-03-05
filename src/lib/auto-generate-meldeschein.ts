import { createServiceClient } from '@/lib/supabase'

/**
 * Auto-generates registration_form records for bookings that have
 * sufficient data (firstname, lastname, check_in, check_out) but no
 * existing form. Called on page load and after Smoobu sync.
 */
export async function autoGenerateMeldescheine(): Promise<{ created: number }> {
  const supabase = createServiceClient()

  // Fetch bookings with minimum required fields
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, property_id, guest_firstname, guest_lastname, guest_nationality, guest_street, guest_city, guest_zip, guest_country, check_in, check_out, adults, children, trip_purpose, properties(name, street, city, zip)')
    .not('guest_firstname', 'is', null)
    .not('guest_lastname', 'is', null)
    .neq('status', 'cancelled')

  if (bookingsError || !bookings || bookings.length === 0) return { created: 0 }

  // Get booking IDs that already have a registration form
  const { data: existingForms } = await supabase
    .from('registration_forms')
    .select('booking_id')
    .not('booking_id', 'is', null)

  const existingBookingIds = new Set(
    (existingForms ?? []).map((f) => f.booking_id).filter(Boolean)
  )

  // Find bookings without an existing form
  const toCreate = bookings.filter((b) => !existingBookingIds.has(b.id))
  if (toCreate.length === 0) return { created: 0 }

  type PropertySnapshot = { name?: string; street?: string; city?: string; zip?: string }

  const inserts = toCreate.map((b) => ({
    booking_id: b.id,
    property_id: b.property_id,
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
    return { created: 0 }
  }

  return { created: toCreate.length }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'
import { fireAutoMessageTrigger } from '@/lib/auto-message'

// ─── Rate limiting (same pattern as /pay/[id]) ──────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 15

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT_MAX
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 60_000)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Zod schema for form submission ─────────────────────────────────────────
const coTravellerSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  birthdate: z.string().optional(),
  nationality: z.string().optional(),
})

const submissionSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  birthdate: z.string().optional(),
  nationality: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  trip_purpose: z.enum(['leisure', 'business', 'unknown']).optional(),
  signature: z.string().optional(),
  co_travellers: z.array(coTravellerSchema).optional(),
})

/**
 * GET /api/guest-registration/[token]
 * Public endpoint – returns booking data for pre-filling the guest form.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { token } = await params
  if (!UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Look up token
  const { data: regToken } = await supabase
    .from('guest_registration_tokens')
    .select('id, booking_id, user_id, status, expires_at')
    .eq('token', token)
    .single()

  if (!regToken) {
    return NextResponse.json({ error: 'invalid' }, { status: 404 })
  }

  // Check expiry
  if (new Date(regToken.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  // Fetch booking + property data (only fields needed for pre-fill, no financials)
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, guest_firstname, guest_lastname, guest_email, guest_street, guest_city, guest_zip, guest_country, guest_nationality, guest_language, check_in, check_out, adults, children, trip_purpose, property_id, properties(name, street, city, zip)')
    .eq('id', regToken.booking_id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // Fetch landlord logo from settings
  const { data: settings } = await supabase
    .from('settings')
    .select('landlord_logo_url')
    .eq('user_id', regToken.user_id)
    .single()

  // Check if form was already submitted
  const { data: existingForm } = await supabase
    .from('registration_forms')
    .select('id, guest_firstname, guest_lastname, guest_birthdate, guest_nationality, guest_street, guest_city, guest_zip, guest_country, trip_purpose, co_travellers')
    .eq('booking_id', regToken.booking_id)
    .eq('guest_submitted', true)
    .single()

  const property = booking.properties as { name?: string; street?: string; city?: string; zip?: string } | null

  return NextResponse.json({
    status: regToken.status,
    logo_url: settings?.landlord_logo_url ?? null,
    booking: {
      firstname: booking.guest_firstname ?? '',
      lastname: booking.guest_lastname ?? '',
      nationality: booking.guest_nationality ?? '',
      street: booking.guest_street ?? '',
      city: booking.guest_city ?? '',
      zip: booking.guest_zip ?? '',
      country: booking.guest_country ?? '',
      language: booking.guest_language ?? 'de',
      check_in: booking.check_in,
      check_out: booking.check_out,
      adults: booking.adults ?? 1,
      children: booking.children ?? 0,
      trip_purpose: booking.trip_purpose ?? 'unknown',
    },
    property: property ? {
      name: property.name ?? '',
      street: property.street ?? '',
      city: property.city ?? '',
      zip: property.zip ?? '',
    } : null,
    existingForm: existingForm ? {
      firstname: existingForm.guest_firstname,
      lastname: existingForm.guest_lastname,
      birthdate: existingForm.guest_birthdate ?? '',
      nationality: existingForm.guest_nationality ?? '',
      street: existingForm.guest_street ?? '',
      city: existingForm.guest_city ?? '',
      zip: existingForm.guest_zip ?? '',
      country: existingForm.guest_country ?? '',
      trip_purpose: existingForm.trip_purpose ?? 'unknown',
      co_travellers: existingForm.co_travellers ?? [],
    } : null,
  })
}

/**
 * POST /api/guest-registration/[token]
 * Public endpoint – guest submits registration form data.
 * Writes to registration_forms, updates bookings, syncs to Smoobu.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { token } = await params
  if (!UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // Support both JSON and FormData (multipart) submissions
  let body: unknown
  let idScanFile: File | null = null
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const dataStr = formData.get('data') as string | null
    body = dataStr ? JSON.parse(dataStr) : {}
    idScanFile = formData.get('idScan') as File | null
  } else {
    body = await request.json()
  }

  const parsed = submissionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
  }

  const data = parsed.data
  const supabase = createServiceClient()

  // Validate token
  const { data: regToken } = await supabase
    .from('guest_registration_tokens')
    .select('id, booking_id, user_id, status, expires_at')
    .eq('token', token)
    .single()

  if (!regToken) {
    return NextResponse.json({ error: 'invalid' }, { status: 404 })
  }

  if (new Date(regToken.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  // Fetch booking + property for registration form
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, external_id, check_in, check_out, adults, children, property_id, user_id, properties(name, street, city, zip)')
    .eq('id', regToken.booking_id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const property = booking.properties as { name?: string; street?: string; city?: string; zip?: string } | null

  // Check if form already exists for this booking (update instead of insert)
  const { data: existingForm } = await supabase
    .from('registration_forms')
    .select('id')
    .eq('booking_id', regToken.booking_id)
    .single()

  const formData = {
    guest_firstname: data.firstname,
    guest_lastname: data.lastname,
    guest_birthdate: data.birthdate || null,
    guest_nationality: data.nationality || null,
    guest_street: data.street || null,
    guest_city: data.city || null,
    guest_zip: data.zip || null,
    guest_country: data.country || null,
    trip_purpose: data.trip_purpose || null,
    signature: data.signature || null,
    co_travellers: data.co_travellers ?? [],
    guest_submitted: true,
    updated_at: new Date().toISOString(),
  }

  if (existingForm) {
    // Update existing form
    await supabase
      .from('registration_forms')
      .update(formData)
      .eq('id', existingForm.id)
  } else {
    // Insert new form
    await supabase
      .from('registration_forms')
      .insert({
        ...formData,
        booking_id: regToken.booking_id,
        property_id: booking.property_id,
        user_id: regToken.user_id,
        check_in: booking.check_in,
        check_out: booking.check_out,
        adults: booking.adults,
        children: booking.children,
        property_snapshot: {
          name: property?.name ?? '',
          street: property?.street ?? '',
          city: property?.city ?? '',
          zip: property?.zip ?? '',
        },
      })
  }

  // Upload ID scan to storage if provided (non-German guests)
  if (idScanFile && idScanFile.size > 0) {
    const MAX_ID_SIZE = 10 * 1024 * 1024 // 10 MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (idScanFile.size <= MAX_ID_SIZE && ALLOWED_TYPES.includes(idScanFile.type)) {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const ext = idScanFile.name.split('.').pop() ?? 'jpg'
        const storagePath = `${regToken.user_id}/${regToken.booking_id}/id-scan_${timestamp}.${ext}`
        const fileBuffer = Buffer.from(await idScanFile.arrayBuffer())

        await supabase.storage
          .from('booking-documents')
          .upload(storagePath, fileBuffer, { contentType: idScanFile.type, upsert: false })

        // Save document reference
        await supabase.from('booking_documents').insert({
          booking_id: regToken.booking_id,
          user_id: regToken.user_id,
          file_name: `Ausweis – ${data.firstname} ${data.lastname}`,
          file_size: idScanFile.size,
          mime_type: idScanFile.type,
          storage_path: storagePath,
        })
      } catch (err) {
        console.error('Guest registration: ID scan upload failed (non-fatal):', err)
      }
    }
  }

  // Update booking with guest data
  const bookingUpdate: Record<string, unknown> = {}
  if (data.street) bookingUpdate.guest_street = data.street
  if (data.city) bookingUpdate.guest_city = data.city
  if (data.zip) bookingUpdate.guest_zip = data.zip
  if (data.country) bookingUpdate.guest_country = data.country
  if (data.nationality) bookingUpdate.guest_nationality = data.nationality
  if (data.trip_purpose) bookingUpdate.trip_purpose = data.trip_purpose

  if (Object.keys(bookingUpdate).length > 0) {
    bookingUpdate.updated_at = new Date().toISOString()
    await supabase
      .from('bookings')
      .update(bookingUpdate)
      .eq('id', regToken.booking_id)
  }

  // Update token status
  await supabase
    .from('guest_registration_tokens')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', regToken.id)

  // Sync to Smoobu (best-effort, don't fail if this errors)
  if (booking.external_id) {
    try {
      const { data: integration } = await supabase
        .from('integrations')
        .select('api_key_encrypted')
        .eq('user_id', regToken.user_id)
        .eq('provider', 'smoobu')
        .eq('status', 'connected')
        .single()

      if (integration?.api_key_encrypted) {
        const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
        const client = new SmoobuClient({ apiKey })
        await client.updateReservation(booking.external_id, {
          firstName: data.firstname,
          lastName: data.lastname,
          street: data.street,
          city: data.city,
          postalCode: data.zip,
          country: data.country,
        })
      }
    } catch (err) {
      console.error('Guest registration: Smoobu sync failed (non-fatal):', err)
    }
  }

  // ─── Auto-message trigger: send message after check-in completion ──────────
  if (booking.external_id) {
    await fireAutoMessageTrigger(supabase, {
      userId: regToken.user_id,
      bookingId: regToken.booking_id,
      externalId: booking.external_id,
      eventType: 'guest_checkin_completed',
      guestName: `${data.firstname} ${data.lastname}`.trim(),
      propertyName: property?.name ?? '',
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      numberOfGuests: booking.adults ?? 1,
    })
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

const coTravellerSchema = z.object({
  firstname: z.string(),
  lastname: z.string(),
  birthdate: z.string().optional(),
  nationality: z.string().optional(),
})

const createMeldescheinSchema = z.object({
  booking_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  guest_firstname: z.string().min(1, 'Vorname erforderlich'),
  guest_lastname: z.string().min(1, 'Familienname erforderlich'),
  guest_birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  guest_nationality: z.string().min(1, 'Staatsangehörigkeit erforderlich'),
  guest_street: z.string().min(1, 'Wohnanschrift erforderlich'),
  guest_city: z.string().nullable().optional(),
  guest_zip: z.string().nullable().optional(),
  guest_country: z.string().nullable().optional(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Ankunftsdatum'),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Abreisedatum'),
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  trip_purpose: z.enum(['leisure', 'business', 'unknown']).optional(),
  co_travellers: z.array(coTravellerSchema).nullable().optional(),
  property_snapshot: z.object({
    name: z.string(),
    street: z.string(),
    city: z.string(),
    zip: z.string(),
  }).optional(),
})

export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createMeldescheinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const data = parsed.data

  if (data.check_in >= data.check_out) {
    return NextResponse.json(
      { error: 'Abreisedatum muss nach Ankunftsdatum liegen' },
      { status: 400 }
    )
  }

  // Prevent duplicate Meldeschein for the same booking (server-side guard)
  if (data.booking_id) {
    const { data: existing } = await supabase
      .from('registration_forms')
      .select('id')
      .eq('booking_id', data.booking_id)
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: 'Für diese Buchung wurde bereits ein Meldeschein erstellt.' },
        { status: 409 }
      )
    }
  }

  const { data: saved, error: insertError } = await supabase
    .from('registration_forms')
    .insert({
      booking_id: data.booking_id ?? null,
      property_id: data.property_id ?? null,
      user_id: user.id,
      guest_firstname: data.guest_firstname,
      guest_lastname: data.guest_lastname,
      guest_birthdate: data.guest_birthdate ?? null,
      guest_nationality: data.guest_nationality,
      guest_street: data.guest_street,
      guest_city: data.guest_city ?? null,
      guest_zip: data.guest_zip ?? null,
      guest_country: data.guest_country ?? null,
      check_in: data.check_in,
      check_out: data.check_out,
      adults: data.adults,
      children: data.children,
      trip_purpose: data.trip_purpose ?? 'unknown',
      co_travellers: data.co_travellers ?? null,
      property_snapshot: data.property_snapshot ?? {},
      signature: null,
      status: 'created',
    })
    .select('id, guest_firstname, guest_lastname, check_in, check_out, status, created_at, trip_purpose')
    .single()

  if (insertError) {
    return NextResponse.json(
      { error: 'Speichern fehlgeschlagen: ' + insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, data: saved }, { status: 201 })
}

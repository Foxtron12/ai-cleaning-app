import { NextRequest, NextResponse } from 'next/server'
import { SmoobuClient, calculateBookingStatus } from '@/lib/smoobu'
import { getServerUser } from '@/lib/supabase-server'
import { z } from 'zod'


const createBookingSchema = z.object({
  // Property
  propertyId: z.string().uuid(),
  apartmentExternalId: z.number().int().positive(),
  // Dates
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  // Guest
  guestFirstname: z.string().min(1),
  guestLastname: z.string().min(1),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(1),
  guestStreet: z.string().min(1),
  guestZip: z.string().min(1),
  guestCity: z.string().min(1),
  guestCountry: z.string().min(1),
  guestNationality: z.string().optional(),
  guestBirthdate: z.string().optional(),
  guestIdNumber: z.string().optional(),
  guestNote: z.string().optional(),
  // Pricing
  accommodationPrice: z.number().min(0),
  cleaningFee: z.number().min(0),
  accommodationTax: z.number().min(0),
})

export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = createBookingSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ungueltige Daten', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const data = parsed.data

    if (data.checkIn >= data.checkOut) {
      return NextResponse.json(
        { error: 'Check-out muss nach Check-in liegen' },
        { status: 400 }
      )
    }
    const { data: settings } = await supabase
      .from('settings')
      .select('smoobu_api_key')
      .eq('user_id', user.id)
      .single()

    const apiKey = settings?.smoobu_api_key ?? process.env.SMOOBU_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Smoobu API-Key nicht konfiguriert' },
        { status: 400 }
      )
    }

    const client = new SmoobuClient({ apiKey })

    // 1. Create reservation in Smoobu
    const totalPrice = data.accommodationPrice + data.cleaningFee
    let smoobuResult: { id: number }

    try {
      smoobuResult = await client.createReservation({
        apartmentId: data.apartmentExternalId,
        arrivalDate: data.checkIn,
        departureDate: data.checkOut,
        firstName: data.guestFirstname,
        lastName: data.guestLastname,
        email: data.guestEmail,
        phone: data.guestPhone,
        adults: data.adults,
        children: data.children,
        price: totalPrice,
        cleaningFee: data.cleaningFee,
        note: data.guestNote,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Smoobu-Fehler'
      return NextResponse.json(
        { error: `Buchung konnte nicht an Smoobu uebermittelt werden: ${message}` },
        { status: 502 }
      )
    }

    // 2. Save in Supabase
    const status = calculateBookingStatus(data.checkIn, data.checkOut)

    const { data: booking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        external_id: smoobuResult.id,
        property_id: data.propertyId,
        check_in: data.checkIn,
        check_out: data.checkOut,
        adults: data.adults,
        children: data.children,
        channel: 'Direct',
        channel_id: 0,
        amount_gross: totalPrice,
        amount_host_payout: totalPrice,
        commission_amount: 0,
        cleaning_fee: data.cleaningFee,
        extra_fees: 0,
        security_deposit: 0,
        currency: 'EUR',
        prepayment: 0,
        balance: totalPrice,
        status,
        trip_purpose: 'unknown',
        guest_firstname: data.guestFirstname,
        guest_lastname: data.guestLastname,
        guest_email: data.guestEmail,
        guest_phone: data.guestPhone,
        guest_street: data.guestStreet,
        guest_city: data.guestCity,
        guest_zip: data.guestZip,
        guest_country: data.guestCountry,
        guest_nationality: data.guestNationality ?? null,
        guest_note: data.guestNote ?? null,
        synced_at: new Date().toISOString(),
        user_id: user.id,
      })
      .select('*, properties(*)')
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: `Buchung konnte nicht gespeichert werden: ${insertError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      booking,
      smoobuId: smoobuResult.id,
      invoiceId: null,
      stripePaymentLink: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

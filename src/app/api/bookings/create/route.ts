import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { SmoobuClient, calculateBookingStatus } from '@/lib/smoobu'
import { getServerUser, createServiceClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'
import { fireAutoMessageTrigger } from '@/lib/auto-message'
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
  guestPhone: z.string().optional(),
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
  // Company / Invoice recipient
  invoiceRecipient: z.enum(['guest', 'company']).default('guest'),
  companyName: z.string().optional(),
  companyStreet: z.string().optional(),
  companyZip: z.string().optional(),
  companyCity: z.string().optional(),
  companyCountry: z.string().optional(),
  companyVatId: z.string().optional(),
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
      const fieldErrors = parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`
      )
      return NextResponse.json(
        {
          error: `Ungültige Daten: ${fieldErrors.join(', ')}`,
          details: parsed.error.issues,
        },
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
    // Load API key from integrations table (encrypted)
    const { data: integration } = await supabase
      .from('integrations')
      .select('api_key_encrypted')
      .eq('user_id', user.id)
      .eq('provider', 'smoobu')
      .single()

    if (!integration?.api_key_encrypted) {
      return NextResponse.json(
        { error: 'Smoobu API-Key nicht konfiguriert. Bitte unter Integrationen hinterlegen.' },
        { status: 400 }
      )
    }

    const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)

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
        phone: data.guestPhone ?? '',
        adults: data.adults,
        children: data.children,
        price: totalPrice,
        cleaningFee: data.cleaningFee,
        note: data.guestNote,
        street: data.guestStreet,
        city: data.guestCity,
        postalCode: data.guestZip,
        country: data.guestCountry,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Smoobu-Fehler'
      return NextResponse.json(
        { error: `Buchung konnte nicht an Smoobu übermittelt werden: ${message}` },
        { status: 502 }
      )
    }

    // 1b. Sync guest address to Smoobu reservation (createReservation doesn't persist address reliably)
    try {
      await client.updateReservation(smoobuResult.id, {
        firstName: data.guestFirstname,
        lastName: data.guestLastname,
        email: data.guestEmail,
        phone: data.guestPhone ?? '',
        street: data.guestStreet,
        city: data.guestCity,
        postalCode: data.guestZip,
        country: data.guestCountry,
      })
    } catch {
      // Non-blocking: address sync failure shouldn't prevent booking creation
      console.warn('Failed to sync guest address to Smoobu reservation', smoobuResult.id)
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
        accommodation_tax_amount: data.accommodationTax,
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
        guest_phone: data.guestPhone ?? null,
        guest_street: data.guestStreet,
        guest_city: data.guestCity,
        guest_zip: data.guestZip,
        guest_country: data.guestCountry,
        guest_nationality: data.guestNationality ?? null,
        guest_note: data.guestNote ?? null,
        company_name: data.companyName ?? null,
        company_street: data.companyStreet ?? null,
        company_zip: data.companyZip ?? null,
        company_city: data.companyCity ?? null,
        company_country: data.companyCountry ?? null,
        company_vat_id: data.companyVatId ?? null,
        invoice_recipient: data.invoiceRecipient ?? 'guest',
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

    // 3. Auto-generate guest registration token (Online Check-In link)
    let registrationLink: string | undefined
    try {
      const expiresAt = new Date(data.checkOut)
      expiresAt.setDate(expiresAt.getDate() + 30)
      const { data: tokenRow } = await supabase
        .from('guest_registration_tokens')
        .insert({
          booking_id: booking.id,
          user_id: user.id,
          expires_at: expiresAt.toISOString(),
        })
        .select('token')
        .single()
      if (tokenRow) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.example.com'
        registrationLink = `${siteUrl}/guest/register/${tokenRow.token}`
      }
    } catch (e) {
      console.error('Auto-create guest registration token failed:', e)
    }

    let invoiceId: string | null = null

    // 4b. Create Stripe payment link if user has Stripe configured
    let stripePaymentLink: string | null = null
    try {
      const { data: stripeIntegration } = await supabase
        .from('integrations')
        .select('api_key_encrypted')
        .eq('user_id', user.id)
        .eq('provider', 'stripe')
        .eq('status', 'connected')
        .single()

      if (stripeIntegration?.api_key_encrypted) {
        const { plaintext: stripeKey } = decrypt(stripeIntegration.api_key_encrypted)
        const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' })

        const propertyName = booking.properties?.name ?? 'Ferienwohnung'
        const fmtDate = (d: string) => {
          const [y, m, day] = d.split('-')
          return `${day}.${m}.${y}`
        }
        const description = `${propertyName} – ${fmtDate(data.checkIn)} bis ${fmtDate(data.checkOut)}`
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',

          line_items: [
            {
              price_data: {
                currency: 'eur',
                product_data: {
                  name: description,
                  description: `Gast: ${data.guestFirstname} ${data.guestLastname}`,
                },
                unit_amount: Math.round(totalPrice * 100),
              },
              quantity: 1,
            },
          ],
          metadata: {
            type: 'booking_payment',
            booking_id: booking.id,
            user_id: user.id,
          },
          customer_email: data.guestEmail,
          success_url: `${siteUrl}/dashboard/buchungen?payment=success&booking=${booking.id}`,
          cancel_url: `${siteUrl}/dashboard/buchungen?payment=cancelled&booking=${booking.id}`,
          expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        })

        stripePaymentLink = session.url

        await supabase
          .from('bookings')
          .update({
            stripe_checkout_session_id: session.id,
            stripe_payment_link: session.url,
            payment_status: 'pending',
          })
          .eq('id', booking.id)
          .eq('user_id', user.id)
      }
    } catch (e) {
      console.error('Auto-create Stripe payment link failed:', e)
    }

    // 5. Fire auto-message trigger for new booking
    try {
      const serviceClient = createServiceClient()
      const propertyName = booking.properties?.name ?? 'Ferienwohnung'
      const guestName = `${data.guestFirstname} ${data.guestLastname}`
      await fireAutoMessageTrigger(serviceClient, {
        userId: user.id,
        bookingId: booking.id,
        externalId: smoobuResult.id,
        eventType: 'new_booking',
        guestName,
        propertyName,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        numberOfGuests: data.adults + data.children,
        registrationLink,
      })
    } catch (e) {
      console.error('Auto-message trigger after booking creation failed:', e)
    }

    return NextResponse.json({
      success: true,
      booking,
      smoobuId: smoobuResult.id,
      invoiceId,
      stripePaymentLink,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

/**
 * POST /api/make/send-invoice
 *
 * Sends invoice data to a Make.com webhook for automated email dispatch.
 * The webhook payload includes all invoice details, guest info (incl. email),
 * and landlord info so Make.com can compose and send the email with PDF attachment.
 *
 * Body: { invoiceId: string }
 */

const requestSchema = z.object({
  invoiceId: z.string().uuid('Ungültige Rechnungs-ID'),
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
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { invoiceId } = parsed.data

  try {
    // 1. Get Make.com webhook URL from settings
    const { data: settings } = await supabase
      .from('settings')
      .select('make_invoice_webhook_url')
      .eq('user_id', user.id)
      .single()

    const webhookUrl = settings?.make_invoice_webhook_url
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'Make.com Webhook-URL nicht konfiguriert. Bitte unter Einstellungen → Integrationen hinterlegen.' },
        { status: 400 }
      )
    }

    // 2. Fetch invoice with all data
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, bookings(guest_email, guest_firstname, guest_lastname, guest_phone, check_in, check_out, adults, children, channel, external_id, properties(name))')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 })
    }

    // 3. Build webhook payload
    const ls = (invoice.landlord_snapshot ?? {}) as Record<string, string>
    const gs = (invoice.guest_snapshot ?? {}) as Record<string, string>
    const booking = invoice.bookings as Record<string, unknown> | null
    const property = (booking?.properties as Record<string, string>) ?? null

    const guestEmail = (booking?.guest_email as string) ?? ''
    const guestName = [gs.firstname, gs.lastname].filter(Boolean).join(' ')
    const guestStreet = gs.street ?? ''
    const guestZipCity = [gs.zip, gs.city].filter(Boolean).join(' ')
    const guestCountry = gs.country ?? ''

    const payload = {
      // Invoice details
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      issued_date: invoice.issued_date,
      due_date: invoice.due_date,
      status: invoice.status,
      service_period_start: invoice.service_period_start,
      service_period_end: invoice.service_period_end,

      // Amounts
      subtotal_net: invoice.subtotal_net,
      vat_7_net: invoice.vat_7_net,
      vat_7_amount: invoice.vat_7_amount,
      vat_19_net: invoice.vat_19_net,
      vat_19_amount: invoice.vat_19_amount,
      total_vat: invoice.total_vat,
      total_gross: invoice.total_gross,
      is_kleinunternehmer: invoice.is_kleinunternehmer,

      // Line items
      line_items: invoice.line_items,

      // Notes
      notes: invoice.notes,
      notes_footer: invoice.notes_footer,

      // Payment schedule
      payment_schedule: invoice.payment_schedule,

      // Guest info
      guest_email: guestEmail,
      guest_name: guestName,
      guest_firstname: gs.firstname ?? '',
      guest_lastname: gs.lastname ?? '',
      guest_street: guestStreet,
      guest_zip_city: guestZipCity,
      guest_country: guestCountry,
      guest_phone: (booking?.guest_phone as string) ?? '',

      // Booking info
      booking_reference: gs.booking_reference ?? (booking?.external_id?.toString() ?? ''),
      check_in: (booking?.check_in as string) ?? invoice.service_period_start ?? '',
      check_out: (booking?.check_out as string) ?? invoice.service_period_end ?? '',
      guest_count: (booking?.adults as number ?? 0) + (booking?.children as number ?? 0),
      channel: (booking?.channel as string) ?? gs.payment_channel ?? '',
      property_name: property?.name ?? '',

      // Landlord info
      landlord_name: ls.name ?? '',
      landlord_street: ls.street ?? '',
      landlord_zip: ls.zip ?? '',
      landlord_city: ls.city ?? '',
      landlord_country: ls.country ?? '',
      landlord_email: ls.email ?? '',
      landlord_phone: ls.phone ?? '',
      landlord_website: ls.website ?? '',

      // Bank info
      bank_iban: ls.bank_iban ?? '',
      bank_bic: ls.bank_bic ?? '',
      bank_name: ls.bank_name ?? '',

      // Tax info
      tax_number: ls.tax_number ?? '',
      vat_id: ls.vat_id ?? '',
    }

    // 4. Send to Make.com webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text().catch(() => 'Unknown error')
      console.error('Make.com webhook failed:', webhookResponse.status, errorText)
      return NextResponse.json(
        { error: `Make.com Webhook fehlgeschlagen (HTTP ${webhookResponse.status})` },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Rechnungsdaten an Make.com gesendet',
      invoiceNumber: invoice.invoice_number,
      guestEmail,
    })
  } catch (error) {
    console.error('make/send-invoice error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Make.com Webhook fehlgeschlagen' },
      { status: 500 }
    )
  }
}

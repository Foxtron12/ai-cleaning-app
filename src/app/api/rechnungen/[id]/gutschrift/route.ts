import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import type { Json } from '@/lib/database.types'
import type { InvoiceLineItem } from '@/lib/types'
import { format } from 'date-fns'

// ─── Request body schema ────────────────────────────────────────────────────

const GutschriftPositionSchema = z.object({
  description: z.string().min(1, 'Beschreibung ist erforderlich'),
  amount: z.number().positive('Betrag muss positiv sein'),
  vat_rate: z.number().refine((v) => v === 0 || v === 7 || v === 19, {
    message: 'USt-Satz muss 0%, 7% oder 19% sein',
  }),
})

const GutschriftBodySchema = z.object({
  /** 'simple' = einfache Erstattung, 'shortened_stay' = Aufenthaltsverkürzung */
  type: z.enum(['simple', 'shortened_stay']),
  /** Manual positions (description + gross amount + vat_rate) */
  positions: z.array(GutschriftPositionSchema).min(1, 'Mindestens eine Position erforderlich'),
  /** Optional reason / info text */
  reason: z.string().optional(),
  /** Required when type = 'shortened_stay': new number of nights */
  new_nights: z.number().int().min(1).optional(),
})

type GutschriftBody = z.infer<typeof GutschriftBodySchema>

/**
 * POST /api/rechnungen/[id]/gutschrift
 *
 * Creates a Gutschrift (credit note) for the given invoice.
 * - Supports two types: simple refund and shortened stay
 * - For simple refund: reduces booking amount_gross, BhSt unchanged
 * - For shortened stay: reduces amount_gross AND recalculates BhSt
 * - Validates total credit does not exceed original invoice amount
 * - Assigns a sequential GS-YYYY-NNN number
 *
 * GoBD-compliant: atomic operation, immutable after creation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id: invoiceId } = await params

  // Parse and validate request body
  let body: GutschriftBody
  try {
    const rawBody = await request.json()
    body = GutschriftBodySchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ungültige Eingabe', details: error.issues },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  try {
    // 1. Load the original invoice
    const { data: original, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 })
    }

    // 2. Validate: only 'created' or 'paid' invoices can have credit notes
    if (original.status !== 'created' && original.status !== 'paid') {
      return NextResponse.json(
        { error: `Rechnung im Status "${original.status}" kann keine Gutschrift erhalten. Nur Rechnungen mit Status "created" oder "paid".` },
        { status: 400 }
      )
    }

    // 3. Validate: only regular invoices can have credit notes
    if (original.invoice_type !== 'invoice') {
      return NextResponse.json(
        { error: 'Gutschriften können nur für reguläre Rechnungen erstellt werden.' },
        { status: 400 }
      )
    }

    // 4. Check existing credit notes to determine remaining refundable amount
    const { data: existingCredits } = await supabase
      .from('invoices')
      .select('total_gross')
      .eq('cancelled_invoice_id', invoiceId)
      .eq('invoice_type', 'credit_note')
      .eq('user_id', user.id)

    const alreadyCredited = (existingCredits ?? []).reduce(
      (sum, cn) => sum + Math.abs(cn.total_gross),
      0
    )
    const maxRefundable = Math.round((original.total_gross - alreadyCredited) * 100) / 100

    // 5. Calculate totals from provided positions
    const isKlein = original.is_kleinunternehmer ?? false
    const lineItems: InvoiceLineItem[] = body.positions.map((pos) => {
      const grossAmount = Math.round(pos.amount * 100) / 100
      let netAmount: number
      let vatAmount: number

      if (isKlein || pos.vat_rate === 0) {
        netAmount = grossAmount
        vatAmount = 0
      } else {
        netAmount = Math.round((grossAmount / (1 + pos.vat_rate / 100)) * 100) / 100
        vatAmount = Math.round((grossAmount - netAmount) * 100) / 100
      }

      return {
        description: pos.description,
        quantity: 1,
        unit_price: -netAmount,
        vat_rate: pos.vat_rate,
        vat_amount: -vatAmount,
        total: -grossAmount,
      }
    })

    const creditTotal = lineItems.reduce((sum, item) => sum + Math.abs(item.total), 0)
    const creditTotalRounded = Math.round(creditTotal * 100) / 100

    // 6. Validate: credit must not exceed remaining refundable amount
    if (creditTotalRounded > maxRefundable + 0.01) {
      return NextResponse.json(
        {
          error: `Gutschriftsbetrag (${creditTotalRounded.toFixed(2)} EUR) übersteigt den verbleibenden Rechnungsbetrag (${maxRefundable.toFixed(2)} EUR).`,
        },
        { status: 400 }
      )
    }

    // 7. Validate shortened stay specifics
    if (body.type === 'shortened_stay') {
      if (!body.new_nights) {
        return NextResponse.json(
          { error: 'Bei Aufenthaltsverkürzung muss die neue Nächteanzahl angegeben werden.' },
          { status: 400 }
        )
      }

      // Load booking to validate nights
      if (original.booking_id) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('nights')
          .eq('id', original.booking_id)
          .eq('user_id', user.id)
          .single()

        if (booking && body.new_nights >= (booking.nights ?? 0)) {
          return NextResponse.json(
            { error: `Neue Nächteanzahl (${body.new_nights}) muss kleiner sein als die aktuelle Anzahl (${booking.nights}).` },
            { status: 400 }
          )
        }
      }
    }

    // 8. Get settings for gutschrift number
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('id, gutschrift_next_number')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (settingsError || !settings) {
      return NextResponse.json({ error: 'Einstellungen nicht gefunden' }, { status: 500 })
    }

    // 9. Generate gutschrift number: GS-YYYY-NNN
    const year = new Date().getFullYear()
    const gsNumber = `GS-${year}-${String(settings.gutschrift_next_number).padStart(3, '0')}`

    // 10. Calculate VAT totals from line items
    const vat7Items = lineItems.filter((i) => i.vat_rate === 7)
    const vat19Items = lineItems.filter((i) => i.vat_rate === 19)

    const vat7Net = Math.round(vat7Items.reduce((s, i) => s + (i.total - i.vat_amount), 0) * 100) / 100
    const vat7Amount = Math.round(vat7Items.reduce((s, i) => s + i.vat_amount, 0) * 100) / 100
    const vat19Net = Math.round(vat19Items.reduce((s, i) => s + (i.total - i.vat_amount), 0) * 100) / 100
    const vat19Amount = Math.round(vat19Items.reduce((s, i) => s + i.vat_amount, 0) * 100) / 100

    const totalGross = Math.round(lineItems.reduce((s, i) => s + i.total, 0) * 100) / 100
    const totalVat = Math.round((vat7Amount + vat19Amount) * 100) / 100
    const subtotalNet = Math.round((totalGross - totalVat) * 100) / 100

    // 11. Build the credit note record
    const issuedDate = format(new Date(), 'yyyy-MM-dd')
    const creditNote = {
      invoice_number: gsNumber,
      invoice_type: 'credit_note',
      booking_id: original.booking_id,
      property_id: original.property_id,
      user_id: user.id,
      cancelled_invoice_id: original.id,
      landlord_snapshot: original.landlord_snapshot,
      guest_snapshot: original.guest_snapshot,
      line_items: lineItems as unknown as Json,
      subtotal_net: subtotalNet,
      vat_7_net: vat7Net,
      vat_7_amount: vat7Amount,
      vat_19_net: vat19Net,
      vat_19_amount: vat19Amount,
      total_vat: totalVat,
      total_gross: totalGross,
      is_kleinunternehmer: isKlein,
      issued_date: issuedDate,
      due_date: issuedDate,
      service_period_start: original.service_period_start,
      service_period_end: original.service_period_end,
      status: 'created',
      notes: body.reason
        ? `Gutschrift zu Rechnung ${original.invoice_number} vom ${original.issued_date ? format(new Date(original.issued_date), 'dd.MM.yyyy') : 'unbekannt'}. ${body.reason}`
        : `Gutschrift zu Rechnung ${original.invoice_number} vom ${original.issued_date ? format(new Date(original.issued_date), 'dd.MM.yyyy') : 'unbekannt'}`,
    }

    // 12. Insert credit note
    const { data: insertedCredit, error: insertError } = await supabase
      .from('invoices')
      .insert(creditNote)
      .select('id, invoice_number')
      .single()

    if (insertError) {
      console.error('Credit note insert error:', insertError.message)
      return NextResponse.json(
        { error: 'Gutschrift konnte nicht erstellt werden: ' + insertError.message },
        { status: 500 }
      )
    }

    // 13. Update booking amount_gross (reduce by credit amount)
    if (original.booking_id) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('amount_gross, nights, check_in')
        .eq('id', original.booking_id)
        .eq('user_id', user.id)
        .single()

      if (booking) {
        const currentAmount = booking.amount_gross ?? 0
        const newAmount = Math.round((currentAmount - creditTotalRounded) * 100) / 100

        const bookingUpdate: Record<string, unknown> = {
          amount_gross: Math.max(0, newAmount),
        }

        // For shortened stay: update check_out (nights is a generated column, recalculated automatically)
        if (body.type === 'shortened_stay' && body.new_nights && booking.check_in) {
          const checkInDate = new Date(booking.check_in)
          checkInDate.setDate(checkInDate.getDate() + body.new_nights)
          bookingUpdate.check_out = format(checkInDate, 'yyyy-MM-dd')
        }

        const { error: bookingError } = await supabase
          .from('bookings')
          .update(bookingUpdate)
          .eq('id', original.booking_id)
          .eq('user_id', user.id)

        if (bookingError) {
          console.error('Booking update error:', bookingError.message)
        }
      }
    }

    // 14. Atomically increment gutschrift_next_number (optimistic lock)
    const { data: updatedSettings, error: settingsUpdateError } = await supabase
      .from('settings')
      .update({ gutschrift_next_number: settings.gutschrift_next_number + 1 })
      .eq('id', settings.id)
      .eq('gutschrift_next_number', settings.gutschrift_next_number)
      .select('id')

    if (settingsUpdateError || !updatedSettings?.length) {
      // Race condition: clean up and ask user to retry
      await supabase.from('invoices').delete().eq('id', insertedCredit.id).eq('user_id', user.id)
      return NextResponse.json(
        { error: 'Gutschriftnummer-Konflikt: Bitte erneut versuchen' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      gutschrift: {
        id: insertedCredit.id,
        invoice_number: insertedCredit.invoice_number,
      },
    })
  } catch (error) {
    console.error('Gutschrift route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gutschrift fehlgeschlagen' },
      { status: 500 }
    )
  }
}

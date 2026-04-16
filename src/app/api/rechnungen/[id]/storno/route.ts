import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import type { Json } from '@/lib/database.types'
import type { InvoiceLineItem } from '@/lib/types'
import { format } from 'date-fns'

/**
 * POST /api/rechnungen/[id]/storno
 *
 * Creates a Stornorechnung (cancellation invoice) for the given invoice.
 * - Negates all line items from the original invoice
 * - Sets original invoice status to 'cancelled'
 * - Booking financial data (amount_gross etc.) is preserved
 * - Assigns a sequential ST-YYYY-NNN number
 *
 * GoBD-compliant: atomic operation via sequential DB calls with validation.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id: invoiceId } = await params

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

    // 2. Validate: only 'created' or 'paid' invoices can be cancelled
    if (original.status !== 'created' && original.status !== 'paid') {
      return NextResponse.json(
        { error: `Rechnung im Status "${original.status}" kann nicht storniert werden. Nur Rechnungen mit Status "created" oder "paid" können storniert werden.` },
        { status: 400 }
      )
    }

    // 3. Validate: only regular invoices can be cancelled (not stornos or credit notes)
    if (original.invoice_type !== 'invoice') {
      return NextResponse.json(
        { error: 'Nur reguläre Rechnungen können storniert werden.' },
        { status: 400 }
      )
    }

    // 4. Check if already cancelled (has an existing storno)
    const { data: existingStorno } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('cancelled_invoice_id', invoiceId)
      .eq('invoice_type', 'storno')
      .eq('user_id', user.id)
      .limit(1)

    if (existingStorno && existingStorno.length > 0) {
      return NextResponse.json(
        { error: `Rechnung wurde bereits storniert (${existingStorno[0].invoice_number}).` },
        { status: 400 }
      )
    }

    // 5. Get settings for storno number
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('id, storno_next_number')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (settingsError || !settings) {
      return NextResponse.json({ error: 'Einstellungen nicht gefunden' }, { status: 500 })
    }

    // 6. Generate storno number: ST-YYYY-NNN
    const year = new Date().getFullYear()
    const stornoNumber = `ST-${year}-${String(settings.storno_next_number).padStart(3, '0')}`

    // 7. Negate all line items
    const originalLineItems = (original.line_items as unknown as InvoiceLineItem[]) ?? []
    const negatedLineItems: InvoiceLineItem[] = originalLineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: -Math.abs(item.unit_price),
      vat_rate: item.vat_rate,
      vat_amount: -Math.abs(item.vat_amount),
      total: -Math.abs(item.total),
    }))

    // 8. Build the storno invoice record
    const issuedDate = format(new Date(), 'yyyy-MM-dd')
    const stornoInvoice = {
      invoice_number: stornoNumber,
      invoice_type: 'storno',
      booking_id: original.booking_id,
      property_id: original.property_id,
      user_id: user.id,
      cancelled_invoice_id: original.id,
      landlord_snapshot: original.landlord_snapshot,
      guest_snapshot: original.guest_snapshot,
      line_items: negatedLineItems as unknown as Json,
      subtotal_net: -Math.abs(original.subtotal_net),
      vat_7_net: original.vat_7_net != null ? -Math.abs(original.vat_7_net) : null,
      vat_7_amount: original.vat_7_amount != null ? -Math.abs(original.vat_7_amount) : null,
      vat_19_net: original.vat_19_net != null ? -Math.abs(original.vat_19_net) : null,
      vat_19_amount: original.vat_19_amount != null ? -Math.abs(original.vat_19_amount) : null,
      total_vat: -Math.abs(original.total_vat),
      total_gross: -Math.abs(original.total_gross),
      is_kleinunternehmer: original.is_kleinunternehmer,
      issued_date: issuedDate,
      due_date: issuedDate,
      service_period_start: original.service_period_start,
      service_period_end: original.service_period_end,
      status: 'created',
      notes: `Storno zu Rechnung ${original.invoice_number} vom ${original.issued_date ? format(new Date(original.issued_date), 'dd.MM.yyyy') : 'unbekannt'}`,
    }

    // 9. Insert storno invoice
    const { data: insertedStorno, error: insertError } = await supabase
      .from('invoices')
      .insert(stornoInvoice)
      .select('id, invoice_number')
      .single()

    if (insertError) {
      console.error('Storno insert error:', insertError.message)
      return NextResponse.json(
        { error: 'Stornorechnung konnte nicht erstellt werden: ' + insertError.message },
        { status: 500 }
      )
    }

    // 10. Update original invoice status to 'cancelled'
    const { error: updateOriginalError } = await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', original.id)
      .eq('user_id', user.id)

    if (updateOriginalError) {
      console.error('Original invoice status update error:', updateOriginalError.message)
    }

    // 11. Atomically increment storno_next_number (optimistic lock)
    const { data: updatedSettings, error: settingsUpdateError } = await supabase
      .from('settings')
      .update({ storno_next_number: settings.storno_next_number + 1 })
      .eq('id', settings.id)
      .eq('storno_next_number', settings.storno_next_number)
      .select('id')

    if (settingsUpdateError || !updatedSettings?.length) {
      // Race condition: delete the storno we just created and ask user to retry
      await supabase.from('invoices').delete().eq('id', insertedStorno.id).eq('user_id', user.id)
      await supabase.from('invoices').update({ status: original.status }).eq('id', original.id).eq('user_id', user.id)
      return NextResponse.json(
        { error: 'Stornonummer-Konflikt: Bitte erneut versuchen' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      storno: {
        id: insertedStorno.id,
        invoice_number: insertedStorno.invoice_number,
      },
    })
  } catch (error) {
    console.error('Storno route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Storno fehlgeschlagen' },
      { status: 500 }
    )
  }
}

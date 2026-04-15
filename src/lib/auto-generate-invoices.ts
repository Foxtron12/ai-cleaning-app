import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from './database.types'
import type { BookingWithProperty, Settings, CityTaxRule } from './types'
import {
  getAccommodationGrossWithoutCityTax,
} from './calculators/booking-price'
import {
  calculateAccommodationTax,
  getTaxConfigForProperty,
} from './calculators/accommodation-tax'
import { format, addDays } from 'date-fns'

interface AutoGenerateOptions {
  /** Only process direct bookings created via this app (channel_id = 0). Default: true */
  directOnly?: boolean
  /** Only process bookings with check_in >= fromDate (ISO date string) */
  fromDate?: string
  /** Only process bookings with check_in <= toDate (ISO date string) */
  toDate?: string
}

/**
 * Auto-generates invoice draft records for bookings that have sufficient data
 * (firstname, lastname, amount_gross > 0) but no existing invoice.
 *
 * By default (directOnly: true) only processes app-created direct bookings (channel_id = 0).
 * For bulk generation of OTA bookings, pass { directOnly: false, fromDate, toDate }.
 */
export async function autoGenerateInvoices(
  userId: string,
  supabase: SupabaseClient<Database>,
  options: AutoGenerateOptions = {}
): Promise<{ created: number }> {
  const { directOnly = true, fromDate, toDate } = options

  // Fetch bookings with minimum required fields, scoped to user
  let query = supabase
    .from('bookings')
    .select('*, properties(*)')
    .eq('user_id', userId)
    .not('guest_firstname', 'is', null)
    .not('guest_lastname', 'is', null)
    .neq('status', 'cancelled')
    .gt('amount_gross', 0)

  // Only app-created direct bookings (channel_id = 0) unless bulk mode
  if (directOnly) {
    query = query.eq('channel_id', 0)
  }

  // Date range filter for bulk generation
  if (fromDate) query = query.gte('check_in', fromDate)
  if (toDate) query = query.lte('check_in', toDate)

  const { data: bookings, error: bookingsError } = await query

  if (bookingsError || !bookings || bookings.length === 0) return { created: 0 }

  // Get booking IDs that already have an invoice for this user
  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('booking_id')
    .eq('user_id', userId)
    .not('booking_id', 'is', null)

  const existingBookingIds = new Set(
    (existingInvoices ?? []).map((inv) => inv.booking_id).filter(Boolean)
  )

  // Load settings for landlord snapshot + invoice numbering
  const { data: settingsData } = await supabase
    .from('settings')
    .select(`
      id, landlord_name, landlord_street, landlord_zip, landlord_city,
      landlord_phone, landlord_email, landlord_website, landlord_country,
      landlord_logo_url,
      tax_number, vat_id, is_kleinunternehmer,
      bank_iban, bank_bic, bank_name,
      company_register, managing_director, invoice_thank_you_text,
      invoice_prefix, invoice_next_number, invoice_payment_days,
      invoice_start_date
    `)
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!settingsData) return { created: 0 }
  const settings = settingsData as Settings

  // Find bookings without an existing invoice, respecting invoice_start_date
  const invoiceStartDate = settings.invoice_start_date ?? null
  const toCreate = (bookings as BookingWithProperty[]).filter(
    (b) =>
      !existingBookingIds.has(b.id) &&
      (!invoiceStartDate || !b.check_in || b.check_in >= invoiceStartDate)
  )
  if (toCreate.length === 0) return { created: 0 }

  // Load city tax rules
  const { data: rulesData } = await supabase
    .from('city_tax_rules')
    .select('*')
    .eq('user_id', userId)
    .order('city')

  const cityRules = (rulesData ?? []) as CityTaxRule[]

  const isKlein = settings.is_kleinunternehmer ?? false
  const paymentDays = settings.invoice_payment_days ?? 14
  const prefix = settings.invoice_prefix ?? 'RE'
  let nextNumber = settings.invoice_next_number ?? 1

  const landlordSnapshot = {
    name: settings.landlord_name ?? '',
    street: settings.landlord_street ?? '',
    city: settings.landlord_city ?? '',
    zip: settings.landlord_zip ?? '',
    country: settings.landlord_country ?? 'DE',
    phone: settings.landlord_phone ?? '',
    email: settings.landlord_email ?? '',
    website: settings.landlord_website ?? '',
    tax_number: settings.tax_number ?? '',
    vat_id: settings.vat_id ?? '',
    bank_iban: settings.bank_iban ?? '',
    bank_bic: settings.bank_bic ?? '',
    bank_name: settings.bank_name ?? '',
    company_register: settings.company_register ?? '',
    managing_director: settings.managing_director ?? '',
    invoice_thank_you_text: settings.invoice_thank_you_text ?? '',
    logo_url: settings.landlord_logo_url ?? '',
  }

  const inserts = toCreate.map((booking) => {
    const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(nextNumber).padStart(3, '0')}`
    nextNumber++

    const nights = booking.nights ?? 1
    const grossWithoutTax = getAccommodationGrossWithoutCityTax(booking)
    // Use booking's actual cleaning_fee (no fallback) for invoices
    const cleaningFee = booking.cleaning_fee ?? 0
    const accommodationGross = grossWithoutTax - cleaningFee
    const accommodationPerNight = nights > 0 ? accommodationGross / nights : 0

    // City tax – use stored value from booking if available (avoids rounding drift),
    // otherwise calculate from scratch (OTA bookings, legacy data)
    const taxConfig = booking.properties
      ? getTaxConfigForProperty(booking.properties, cityRules)
      : null
    const taxResult = taxConfig
      ? calculateAccommodationTax(booking, taxConfig, booking.properties?.ota_remits_tax ?? [])
      : null
    const cityTax = booking.accommodation_tax_amount != null
      ? booking.accommodation_tax_amount
      : (taxResult?.taxAmount ?? 0)
    const taxVatRate =
      taxConfig?.vatType === '7' ? 7 : taxConfig?.vatType === '19' ? 19 : 0

    // Build line items
    const lineItems: Array<{
      description: string
      quantity: number
      unit_price: number
      vat_rate: number
      vat_amount: number
      total: number
    }> = []

    // Accommodation (7% USt)
    // Use gross as anchor, derive vat from total (not per-unit) to avoid rounding errors
    const accomTotal = Math.round(accommodationGross * 100) / 100
    const accomNetTotal = isKlein ? accomTotal : Math.round((accommodationGross / 1.07) * 100) / 100
    const accomUnitPrice = nights > 0 ? Math.round((accomNetTotal / nights) * 100) / 100 : 0
    const accomVat = isKlein ? 0 : Math.round((accomTotal - accomNetTotal) * 100) / 100
    lineItems.push({
      description: `Beherbergung in ${booking.properties?.name ?? 'Ferienwohnung'} (${nights} Nächte)`,
      quantity: nights,
      unit_price: accomUnitPrice,
      vat_rate: isKlein ? 0 : 7,
      vat_amount: accomVat,
      total: accomTotal,
    })

    // Cleaning (7% USt)
    if (cleaningFee > 0) {
      const cleanUnitPrice = Math.round((cleaningFee / (isKlein ? 1 : 1.07)) * 100) / 100
      const cleanTotal = Math.round(cleaningFee * 100) / 100
      const cleanVat = isKlein ? 0 : Math.round((cleanTotal - cleanUnitPrice) * 100) / 100
      lineItems.push({
        description: 'Endreinigung',
        quantity: 1,
        unit_price: cleanUnitPrice,
        vat_rate: isKlein ? 0 : 7,
        vat_amount: cleanVat,
        total: cleanTotal,
      })
    }

    // City tax – always include so invoice total matches what guest pays
    if (cityTax > 0) {
      const cityLabel = taxConfig?.city ? ` (${taxConfig.city})` : ''
      const cityTaxRounded = Math.round(cityTax * 100) / 100
      const taxVatAmount = isKlein
        ? 0
        : Math.round(cityTaxRounded * (taxVatRate / 100) * 100) / 100
      const cityTotal = Math.round((cityTaxRounded + taxVatAmount) * 100) / 100
      lineItems.push({
        description: `Beherbergungssteuer${cityLabel}`,
        quantity: 1,
        unit_price: cityTaxRounded,
        vat_rate: taxVatRate,
        vat_amount: taxVatAmount,
        total: cityTotal,
      })
    }

    // Calculate totals – derive from line item totals (gross) to avoid rounding drift
    const totalGross = Math.round(lineItems.reduce((s, i) => s + i.total, 0) * 100) / 100
    const vat7Items = lineItems.filter((i) => i.vat_rate === 7)
    const vat19Items = lineItems.filter((i) => i.vat_rate === 19)
    const vat7Net = Math.round(vat7Items.reduce((s, i) => s + (i.total - i.vat_amount), 0) * 100) / 100
    const vat7Amount = isKlein
      ? 0
      : Math.round(vat7Items.reduce((s, i) => s + i.vat_amount, 0) * 100) / 100
    const vat19Net = Math.round(vat19Items.reduce((s, i) => s + (i.total - i.vat_amount), 0) * 100) / 100
    const vat19Amount = isKlein
      ? 0
      : Math.round(vat19Items.reduce((s, i) => s + i.vat_amount, 0) * 100) / 100
    const totalVat = Math.round((vat7Amount + vat19Amount) * 100) / 100
    const subtotalNet = Math.round((totalGross - totalVat) * 100) / 100

    const issuedDate = format(new Date(), 'yyyy-MM-dd')
    const dueDate = format(addDays(new Date(), paymentDays), 'yyyy-MM-dd')

    const guestCount = (booking.adults ?? 0) + (booking.children ?? 0)
    const guestSnapshot = {
      firstname: booking.guest_firstname ?? '',
      lastname: booking.guest_lastname ?? '',
      street: booking.guest_street ?? '',
      city: booking.guest_city ?? '',
      zip: booking.guest_zip ?? '',
      country: booking.guest_country ?? '',
      booking_reference: booking.external_id?.toString() ?? '',
      guest_count: guestCount > 0 ? String(guestCount) : '',
      payment_channel: booking.channel ?? '',
      // Company / invoice recipient
      invoice_recipient: booking.invoice_recipient ?? 'guest',
      company_name: booking.company_name ?? '',
      company_street: booking.company_street ?? '',
      company_zip: booking.company_zip ?? '',
      company_city: booking.company_city ?? '',
      company_country: booking.company_country ?? '',
      company_vat_id: booking.company_vat_id ?? '',
    }

    return {
      invoice_number: invoiceNumber,
      booking_id: booking.id,
      property_id: booking.property_id,
      user_id: userId,
      landlord_snapshot: landlordSnapshot as unknown as Json,
      guest_snapshot: guestSnapshot as unknown as Json,
      line_items: lineItems as unknown as Json,
      subtotal_net: Math.round(subtotalNet * 100) / 100,
      vat_7_net: Math.round(vat7Net * 100) / 100,
      vat_7_amount: Math.round(vat7Amount * 100) / 100,
      vat_19_net: Math.round(vat19Net * 100) / 100,
      vat_19_amount: Math.round(vat19Amount * 100) / 100,
      total_vat: Math.round(totalVat * 100) / 100,
      total_gross: Math.round(totalGross * 100) / 100,
      is_kleinunternehmer: isKlein,
      issued_date: issuedDate,
      due_date: dueDate,
      service_period_start: booking.check_in,
      service_period_end: booking.check_out,
      status: 'draft',
    }
  })

  const { error: insertError } = await supabase
    .from('invoices')
    .insert(inserts)

  if (insertError) {
    console.error('autoGenerateInvoices insert error:', insertError.message)
    return { created: 0 }
  }

  // Atomically update invoice_next_number (optimistic lock: only update if value hasn't changed)
  const { data: updated, error: updateError } = await supabase
    .from('settings')
    .update({ invoice_next_number: nextNumber })
    .eq('id', settings.id)
    .eq('invoice_next_number', settings.invoice_next_number ?? 1)
    .select('id')

  if (updateError || !updated?.length) {
    // Race condition detected — another request incremented the counter
    // Roll back the inserted invoices to prevent duplicate numbers
    const insertedNumbers = inserts.map((i) => i.invoice_number)
    await supabase.from('invoices').delete().in('invoice_number', insertedNumbers).eq('user_id', userId)
    throw new Error('Rechnungsnummer-Konflikt: Bitte erneut versuchen')
  }

  return { created: toCreate.length }
}

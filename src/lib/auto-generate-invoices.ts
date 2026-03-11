import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from './database.types'
import type { BookingWithProperty, Settings, CityTaxRule } from './types'
import {
  getCleaningFee,
  getAccommodationGrossWithoutCityTax,
} from './calculators/booking-price'
import {
  calculateAccommodationTax,
  getTaxConfigForProperty,
} from './calculators/accommodation-tax'
import { format, addDays } from 'date-fns'

/**
 * Auto-generates invoice draft records for bookings that have sufficient data
 * (firstname, lastname, amount_gross > 0) but no existing invoice.
 * Called on page load and after Smoobu sync.
 */
export async function autoGenerateInvoices(
  userId: string,
  supabase: SupabaseClient<Database>
): Promise<{ created: number }> {
  // Fetch bookings with minimum required fields, scoped to user
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*, properties(*)')
    .eq('user_id', userId)
    .not('guest_firstname', 'is', null)
    .not('guest_lastname', 'is', null)
    .neq('status', 'cancelled')
    .gt('amount_gross', 0)

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
    const cleaningFee = getCleaningFee(booking, booking.properties?.default_cleaning_fee ?? undefined)
    const accommodationGross = grossWithoutTax - cleaningFee
    const accommodationPerNight = nights > 0 ? accommodationGross / nights : 0

    // City tax
    const taxConfig = booking.properties
      ? getTaxConfigForProperty(booking.properties, cityRules)
      : null
    const taxResult = taxConfig
      ? calculateAccommodationTax(booking, taxConfig, booking.properties?.ota_remits_tax ?? [])
      : null
    const cityTax = taxResult?.taxAmount ?? 0
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
    const accomNet = isKlein ? accommodationGross : accommodationGross / 1.07
    const accomVat = isKlein ? 0 : accommodationGross - accomNet
    lineItems.push({
      description: `Beherbergung in ${booking.properties?.name ?? 'Ferienwohnung'} (${nights} Nächte)`,
      quantity: nights,
      unit_price:
        Math.round((accommodationPerNight / (isKlein ? 1 : 1.07)) * 100) / 100,
      vat_rate: 7,
      vat_amount: Math.round(accomVat * 100) / 100,
      total: Math.round(accommodationGross * 100) / 100,
    })

    // Cleaning (7% USt)
    if (cleaningFee > 0) {
      const cleanNet = isKlein ? cleaningFee : cleaningFee / 1.07
      const cleanVat = isKlein ? 0 : cleaningFee - cleanNet
      lineItems.push({
        description: 'Endreinigung',
        quantity: 1,
        unit_price: Math.round(cleanNet * 100) / 100,
        vat_rate: 7,
        vat_amount: Math.round(cleanVat * 100) / 100,
        total: Math.round(cleaningFee * 100) / 100,
      })
    }

    // City tax – always include with actual amount
    if (cityTax > 0) {
      const cityLabel = taxConfig?.city ? ` (${taxConfig.city})` : ''
      const taxVatAmount = isKlein
        ? 0
        : Math.round(cityTax * (taxVatRate / 100) * 100) / 100
      lineItems.push({
        description: `Beherbergungssteuer${cityLabel}`,
        quantity: 1,
        unit_price: Math.round(cityTax * 100) / 100,
        vat_rate: taxVatRate,
        vat_amount: taxVatAmount,
        total: Math.round((cityTax + taxVatAmount) * 100) / 100,
      })
    }

    // Calculate totals
    const subtotalNet = lineItems.reduce(
      (s, item) => s + item.quantity * item.unit_price,
      0
    )
    const vat7Items = lineItems.filter((i) => i.vat_rate === 7)
    const vat19Items = lineItems.filter((i) => i.vat_rate === 19)
    const vat7Net = vat7Items.reduce(
      (s, i) => s + i.quantity * i.unit_price,
      0
    )
    const vat7Amount = isKlein
      ? 0
      : vat7Items.reduce((s, i) => s + i.vat_amount, 0)
    const vat19Net = vat19Items.reduce(
      (s, i) => s + i.quantity * i.unit_price,
      0
    )
    const vat19Amount = isKlein
      ? 0
      : vat19Items.reduce((s, i) => s + i.vat_amount, 0)
    const totalVat = vat7Amount + vat19Amount
    const totalGross = isKlein ? subtotalNet : subtotalNet + totalVat

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

  // Update invoice_next_number in settings
  await supabase
    .from('settings')
    .update({ invoice_next_number: nextNumber })
    .eq('id', settings.id)

  return { created: toCreate.length }
}

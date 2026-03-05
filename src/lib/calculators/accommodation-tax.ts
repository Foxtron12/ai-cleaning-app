import type { Booking, Property, CityTaxRule } from '../types'
import { parsePriceDetails, extractCityTaxFromDetails } from '../smoobu'

export type TaxModel =
  | 'net_percentage'
  | 'gross_percentage'
  | 'per_person_per_night'
  | 'per_room_per_night'

/** Default cleaning fee when Smoobu doesn't provide one */
export const DEFAULT_CLEANING_FEE = 50

export interface TaxConfig {
  model: TaxModel
  rate: number // percentage or EUR amount
  city: string
  defaultCleaningFee?: number
  vatType?: string        // '7' | '19' | '0' | 'exempt'
  personLimit?: number    // max persons for calculation
  taxTreatment?: string   // 'exclusive' | 'inclusive'
}

export interface TaxResult {
  taxableAmount: number
  taxAmount: number
  isExempt: boolean
  exemptReason?: string
  vatType?: string
  taxTreatment?: string
}

/**
 * Get the effective cleaning fee for a booking.
 * Uses the booking's cleaning_fee if > 0, otherwise the default.
 */
export function getCleaningFee(booking: Booking, defaultFee = DEFAULT_CLEANING_FEE): number {
  return (booking.cleaning_fee ?? 0) > 0 ? (booking.cleaning_fee ?? 0) : defaultFee
}

/**
 * Resolve tax config for a property using city_tax_rules lookup with fallback.
 */
export function getTaxConfigForProperty(
  property: Property,
  cityRules: CityTaxRule[]
): TaxConfig {
  const rule = cityRules.find(
    (r) => r.city === (property.accommodation_tax_city ?? property.city)
  )
  if (rule) {
    return {
      model: rule.tax_model as TaxModel,
      rate: rule.tax_rate,
      city: rule.city,
      vatType: rule.vat_type ?? '0',
      personLimit: rule.person_limit ?? undefined,
      taxTreatment: rule.tax_treatment ?? 'exclusive',
    }
  }
  return {
    model: (property.accommodation_tax_model as TaxModel) ?? 'gross_percentage',
    rate: property.accommodation_tax_rate ?? 6,
    city: property.accommodation_tax_city ?? property.city ?? 'Unbekannt',
  }
}

/**
 * Calculate accommodation tax for a booking.
 *
 * Exemptions:
 * - Airbnb bookings (Airbnb remits tax directly to the city)
 * - Business travelers (trip_purpose = 'business')
 */
export function calculateAccommodationTax(
  booking: Booking,
  config: TaxConfig
): TaxResult {
  const baseResult = { vatType: config.vatType, taxTreatment: config.taxTreatment }

  // Business travelers are exempt (no tax to calculate)
  if (booking.trip_purpose === 'business') {
    return {
      taxableAmount: 0,
      taxAmount: 0,
      isExempt: true,
      exemptReason: 'Geschäftsreise',
      ...baseResult,
    }
  }

  const nights = booking.nights ?? 0
  if (nights === 0) {
    return { taxableAmount: 0, taxAmount: 0, isExempt: false, ...baseResult }
  }

  const cleaningFee = getCleaningFee(booking, config.defaultCleaningFee)
  let taxableAmount: number
  let taxAmount: number

  switch (config.model) {
    case 'gross_percentage': {
      // Dresden model: % of gross price including cleaning fee
      // For Booking.com: gross already includes city tax → subtract it first
      let gross = booking.amount_gross ?? 0
      if (booking.channel === 'Booking.com') {
        const details = parsePriceDetails(booking.price_details)
        const cityTax = extractCityTaxFromDetails(details) ?? 0
        gross -= cityTax
      }
      // Airbnb: cleaning is always included in amount_gross (even though booking.cleaning_fee = 0)
      const cleaningInGross = (booking.cleaning_fee ?? 0) > 0 || booking.channel === 'Airbnb'
      taxableAmount = cleaningInGross ? gross : gross + cleaningFee
      taxAmount = taxableAmount * (config.rate / 100)
      break
    }
    case 'net_percentage': {
      // Berlin/Hamburg model: % of net accommodation price (without cleaning, etc.)
      taxableAmount = (booking.amount_gross ?? 0) - cleaningFee - (booking.extra_fees ?? 0)
      taxAmount = taxableAmount * (config.rate / 100)
      break
    }
    case 'per_person_per_night': {
      // Flat rate per person per night (with optional person limit)
      const adults = booking.adults ?? 1
      const effectivePersons = config.personLimit
        ? Math.min(adults, config.personLimit)
        : adults
      taxableAmount = config.rate * effectivePersons * nights
      taxAmount = taxableAmount
      break
    }
    case 'per_room_per_night': {
      // Flat rate per room per night (1 room per booking)
      taxableAmount = config.rate * nights
      taxAmount = taxableAmount
      break
    }
    default:
      taxableAmount = 0
      taxAmount = 0
  }

  const result: TaxResult = {
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    isExempt: false,
    ...baseResult,
  }

  // Airbnb: tax is calculated (for invoices) but collected by Airbnb
  if (booking.channel === 'Airbnb') {
    result.isExempt = true
    result.exemptReason = 'Airbnb führt ab'
  }

  return result
}

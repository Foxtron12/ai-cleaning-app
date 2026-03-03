import type { Booking } from '../types'
import { parsePriceDetails, extractCityTaxFromDetails } from '../smoobu'

export type TaxModel = 'net_percentage' | 'gross_percentage' | 'per_person_per_night'

/** Default cleaning fee when Smoobu doesn't provide one */
export const DEFAULT_CLEANING_FEE = 50

export interface TaxConfig {
  model: TaxModel
  rate: number // percentage or EUR amount
  city: string
  defaultCleaningFee?: number
}

export interface TaxResult {
  taxableAmount: number
  taxAmount: number
  isExempt: boolean
  exemptReason?: string
}

/**
 * Get the effective cleaning fee for a booking.
 * Uses the booking's cleaning_fee if > 0, otherwise the default.
 */
export function getCleaningFee(booking: Booking, defaultFee = DEFAULT_CLEANING_FEE): number {
  return (booking.cleaning_fee ?? 0) > 0 ? (booking.cleaning_fee ?? 0) : defaultFee
}

/**
 * Calculate accommodation tax for a booking.
 * Dresden default: 6% on gross price including cleaning fee.
 *
 * Exemptions:
 * - Airbnb bookings (Airbnb remits tax directly to the city)
 * - Business travelers (trip_purpose = 'business')
 */
export function calculateAccommodationTax(
  booking: Booking,
  config: TaxConfig
): TaxResult {
  // Airbnb remits accommodation tax directly to the city
  if (booking.channel === 'Airbnb') {
    return {
      taxableAmount: 0,
      taxAmount: 0,
      isExempt: true,
      exemptReason: 'Airbnb führt ab',
    }
  }

  // Business travelers are exempt
  if (booking.trip_purpose === 'business') {
    return {
      taxableAmount: 0,
      taxAmount: 0,
      isExempt: true,
      exemptReason: 'Geschäftsreise',
    }
  }

  const nights = booking.nights ?? 0
  if (nights === 0) {
    return { taxableAmount: 0, taxAmount: 0, isExempt: false }
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
      const bookingCleaningInGross = (booking.cleaning_fee ?? 0) > 0
      taxableAmount = bookingCleaningInGross ? gross : gross + cleaningFee
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
      // Flat rate per person per night
      const adults = booking.adults ?? 1
      taxableAmount = config.rate * adults * nights
      taxAmount = taxableAmount
      break
    }
    default:
      taxableAmount = 0
      taxAmount = 0
  }

  return {
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    isExempt: false,
  }
}

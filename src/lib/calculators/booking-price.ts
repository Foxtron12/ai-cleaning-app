import type { Booking } from '../types'
import { parsePriceDetails, extractCityTaxFromDetails } from '../smoobu'
import { getCleaningFee, DEFAULT_CLEANING_FEE } from './accommodation-tax'

/**
 * Extract the city tax amount from a booking's price_details.
 * Works for both Airbnb ("Airbnb Collected Tax") and Booking.com ("Übernachtungssteuer").
 */
export function getCityTaxAmount(booking: Booking): number {
  const details = parsePriceDetails(booking.price_details)
  return extractCityTaxFromDetails(details) ?? 0
}

/**
 * Get accommodation gross WITHOUT city tax.
 * - Airbnb: amount_gross already excludes city tax → return as-is
 * - Booking.com: amount_gross includes Übernachtungssteuer → subtract it
 * - Other channels: return amount_gross as-is
 */
export function getAccommodationGrossWithoutCityTax(booking: Booking): number {
  const gross = booking.amount_gross ?? 0
  if (booking.channel === 'Booking.com') {
    return gross - getCityTaxAmount(booking)
  }
  return gross
}

/**
 * Get total amount the guest actually pays (for invoices).
 * - Airbnb: amount_gross + parsed "Airbnb Collected Tax"
 * - Booking.com: amount_gross (already includes everything)
 * - Other channels: amount_gross
 */
export function getTotalGuestPays(booking: Booking): number {
  const gross = booking.amount_gross ?? 0
  if (booking.channel === 'Airbnb') {
    return gross + getCityTaxAmount(booking)
  }
  return gross
}

/**
 * Get accommodation-only revenue (without cleaning fee, without city tax).
 */
export function getAccommodationRevenue(booking: Booking, propertyDefaultCleaningFee?: number): number {
  const grossWithoutTax = getAccommodationGrossWithoutCityTax(booking)
  const cleaning = getCleaningFee(booking, propertyDefaultCleaningFee)
  return Math.max(0, grossWithoutTax - cleaning)
}

export { getCleaningFee, DEFAULT_CLEANING_FEE }

import type { Booking, Property } from '../types'
import type { TaxConfig, TaxResult } from './accommodation-tax'
import { getAccommodationGrossWithoutCityTax } from './booking-price'

type BookingWithProp = Booking & { properties: Property | null }

export interface BhstTaxItem {
  booking: BookingWithProp
  tax: TaxResult
  config: TaxConfig | null
}

const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Einzige Quelle fuer die BhSt-Summen. Wird von der Steuer-Uebersicht UND vom
 * Vordruck-Export genutzt, damit beide immer identische Zahlen zeigen.
 */
export function computeBhstSummary(items: BhstTaxItem[]) {
  const otaRemitted = items.filter((d) => d.tax.remittedByOta)
  const selfRemit = items.filter((d) => !d.tax.remittedByOta)
  const business = selfRemit.filter((d) => d.tax.exemptReason === 'Befreit')
  const taxable = selfRemit.filter((d) => !d.tax.isExempt)
  const exempt = selfRemit.filter((d) => d.tax.isExempt)

  const nights = (list: BhstTaxItem[]) => list.reduce((s, d) => s + (d.booking.nights ?? 0), 0)
  const revenue = (list: BhstTaxItem[]) => list.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0)
  const tax = (list: BhstTaxItem[]) => list.reduce((s, d) => s + d.tax.taxAmount, 0)

  const otaRemittedTax = tax(otaRemitted)
  const selfRemitTax = tax(taxable)
  const totalRevenue = revenue(items)
  const exemptRevenue = revenue(exempt)

  return {
    totalNights: nights(items),
    otaRemittedNights: nights(otaRemitted),
    otaRemittedTax,
    otaRemittedRevenue: revenue(otaRemitted),
    selfRemitRevenue: revenue(selfRemit),
    businessNights: nights(business),
    businessRevenue: revenue(business),
    remainingNights: nights(taxable),
    taxableRevenue: revenue(selfRemit) - revenue(business),
    selfRemitTax,
    totalTax: selfRemitTax + otaRemittedTax,
    bookingCount: items.length,
    // Chemnitz-Vordruck (Z10/Z11/Z12/Z13)
    totalRevenue,
    totalExemptRevenue: exemptRevenue,
    chemnitzTaxableRevenue: totalRevenue - exemptRevenue,
    fivePercent: round2((totalRevenue - exemptRevenue) * 0.05),
  }
}

export type BhstSummary = ReturnType<typeof computeBhstSummary>

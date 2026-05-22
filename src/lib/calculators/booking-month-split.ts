import { startOfMonth, addMonths, differenceInCalendarDays, format } from 'date-fns'
import type { Booking, Property } from '../types'

type BookingWithProp = Booking & { properties: Property | null }

/**
 * Skaliert die Übernachtungssteuer-Zeile in einem Smoobu-`price_details`-String
 * proportional mit `ratio`. Andere Zeilen bleiben unangetastet. Wird beim
 * Aufsplitten von Mehrmonats-Buchungen benötigt, damit Booking.com-Buchungen
 * nicht in einen negativen `gross − cityTax` kippen.
 */
function scaleCityTaxInPriceDetails(priceDetails: string | null | undefined, ratio: number): string | null {
  if (!priceDetails) return priceDetails ?? null
  const cityTaxKeyword = /bernachtungssteuer|city.?tax|kurtaxe|beherbergungssteuer|tourist.?tax/i
  const amountRe = /^(.+?-\s*EUR\s*)([\d.,]+)(\s*)$/i
  return priceDetails
    .split(/\r?\n/)
    .map((line) => {
      if (!cityTaxKeyword.test(line)) return line
      const m = line.match(amountRe)
      if (!m) return line
      const amount = parseFloat(m[2].replace(',', '.'))
      if (isNaN(amount)) return line
      const scaled = (Math.round(amount * ratio * 100) / 100).toFixed(2)
      return `${m[1]}${scaled}${m[3]}`
    })
    .join('\n')
}

/**
 * Splittet eine Mehrmonats-Buchung in virtuelle Pro-Kalendermonat-Segmente.
 * Geldbeträge (inkl. der City-Tax-Zeile in `price_details`) werden proportional
 * skaliert. Es werden nur Segmente zurückgegeben, die mit `[rangeFrom, rangeTo]`
 * überlappen.
 *
 * `rangeOnlyFilter`:
 *   - false (default): Single-Monat-Buchungen werden IMMER zurückgegeben (auch
 *     wenn ausserhalb des Range — Aufrufer filtert separat). Verhalten der
 *     Steuer-Übersicht.
 *   - true: Single-Monat-Buchungen werden ebenfalls am Range geprüft. Verhalten
 *     des BhSt-Vordruck-Exports (strikte Periodenmeldung).
 */
export function splitBookingByMonth(
  booking: BookingWithProp,
  rangeFrom: string,
  rangeTo: string,
  rangeOnlyFilter = false,
): BookingWithProp[] {
  const checkIn = new Date(booking.check_in + 'T00:00:00')
  const checkOut = new Date(booking.check_out + 'T00:00:00')
  const totalNights = booking.nights ?? differenceInCalendarDays(checkOut, checkIn)
  if (totalNights <= 0) return [booking]

  if (checkIn.getMonth() === checkOut.getMonth() && checkIn.getFullYear() === checkOut.getFullYear()) {
    if (!rangeOnlyFilter) return [booking]
    if (booking.check_out > rangeFrom && booking.check_in <= rangeTo) return [booking]
    return []
  }

  const segments: BookingWithProp[] = []
  let current = startOfMonth(checkIn)

  while (current <= checkOut) {
    const segStart = checkIn > current ? checkIn : current
    const nextMonthStart = addMonths(current, 1)
    const segNightsActual = differenceInCalendarDays(checkOut < nextMonthStart ? checkOut : nextMonthStart, segStart)

    if (segNightsActual > 0) {
      const segCheckIn = format(segStart, 'yyyy-MM-dd')
      const segCheckOut = format(checkOut < nextMonthStart ? checkOut : nextMonthStart, 'yyyy-MM-dd')

      if (segCheckOut > rangeFrom && segCheckIn <= rangeTo) {
        const ratio = segNightsActual / totalNights
        segments.push({
          ...booking,
          check_in: segCheckIn,
          check_out: segCheckOut,
          nights: segNightsActual,
          amount_gross: booking.amount_gross !== null ? Math.round(booking.amount_gross * ratio * 100) / 100 : null,
          cleaning_fee: booking.cleaning_fee !== null ? Math.round(booking.cleaning_fee * ratio * 100) / 100 : null,
          amount_host_payout: booking.amount_host_payout !== null ? Math.round(booking.amount_host_payout * ratio * 100) / 100 : null,
          commission_amount: booking.commission_amount !== null ? Math.round(booking.commission_amount * ratio * 100) / 100 : null,
          price_details: scaleCityTaxInPriceDetails(booking.price_details, ratio),
        })
      }
    }

    current = nextMonthStart
    if (checkOut <= nextMonthStart) break
  }

  if (rangeOnlyFilter) return segments
  return segments.length > 0 ? segments : [booking]
}

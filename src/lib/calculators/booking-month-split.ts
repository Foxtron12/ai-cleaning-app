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

function inRange(seg: BookingWithProp, rangeFrom: string, rangeTo: string): boolean {
  return seg.check_out > rangeFrom && seg.check_in <= rangeTo
}

/**
 * Erzeugt Segmente für eine gekürzte Buchung. Alle Kalendermonate, die VOR
 * dem neuen check_out komplett liegen, werden mit ihren Original-Anteilen
 * eingefroren (= Werte wie sie vor der Kürzung gemeldet wurden). Der neue
 * letzte Monat absorbiert die Differenz zwischen Gesamtbetrag und Summe der
 * eingefrorenen Monate — die Anzahl Nächte bleibt für ihn die tatsächliche
 * (gekürzte) Anzahl.
 *
 * Wichtig: `booking.amount_gross` ist hier die AKTUELLE Summe nach Kürzung.
 * Wenn der Gesamtbetrag bei der Kürzung unverändert blieb (typischer Fall),
 * landen alte Monate exakt auf ihren Original-Werten und der neue letzte
 * Monat behält ebenfalls seinen Original-Wert (über weniger Tage verteilt).
 */
function buildShortenedSegments(
  booking: BookingWithProp,
  checkIn: Date,
  newCheckOut: Date,
  originalCheckOut: Date,
): BookingWithProp[] {
  const originalNights = differenceInCalendarDays(originalCheckOut, checkIn)
  if (originalNights <= 0) return []

  const fullGross = booking.amount_gross ?? 0
  const fullCleaning = booking.cleaning_fee ?? 0
  const accomExclCleaning = fullGross - fullCleaning

  type SegSpec = {
    segStart: Date
    segEnd: Date
    segNights: number
    originalRatio: number
    isLast: boolean
  }
  const specs: SegSpec[] = []

  let current = startOfMonth(checkIn)
  while (current <= originalCheckOut) {
    const segStart = checkIn > current ? checkIn : current
    const nextMonthStart = addMonths(current, 1)
    const segEndOriginal = originalCheckOut < nextMonthStart ? originalCheckOut : nextMonthStart
    const segNightsOriginal = differenceInCalendarDays(segEndOriginal, segStart)

    if (segNightsOriginal > 0) {
      const originalRatio = segNightsOriginal / originalNights
      if (segEndOriginal <= newCheckOut) {
        specs.push({ segStart, segEnd: segEndOriginal, segNights: segNightsOriginal, originalRatio, isLast: false })
      } else if (segStart < newCheckOut) {
        const newNights = differenceInCalendarDays(newCheckOut, segStart)
        specs.push({ segStart, segEnd: newCheckOut, segNights: newNights, originalRatio, isLast: true })
      }
    }

    current = nextMonthStart
    if (originalCheckOut <= nextMonthStart) break
  }

  if (specs.length === 0) return []
  if (!specs.some((s) => s.isLast)) {
    specs[specs.length - 1].isLast = true
  }

  const frozenRatioSum = specs
    .filter((s) => !s.isLast)
    .reduce((sum, s) => sum + s.originalRatio, 0)
  const newLastRatio = Math.max(0, 1 - frozenRatioSum)

  return specs.map((s) => {
    const ratio = s.isLast ? newLastRatio : s.originalRatio
    const segAccom = Math.round(accomExclCleaning * ratio * 100) / 100
    const segCleaning = s.isLast ? fullCleaning : 0
    const segGrossDisplay = Math.round((segAccom + segCleaning) * 100) / 100

    return {
      ...booking,
      check_in: format(s.segStart, 'yyyy-MM-dd'),
      check_out: format(s.segEnd, 'yyyy-MM-dd'),
      nights: s.segNights,
      amount_gross: booking.amount_gross !== null ? segGrossDisplay : null,
      cleaning_fee: booking.cleaning_fee !== null ? Math.round(segCleaning * 100) / 100 : null,
      amount_host_payout: booking.amount_host_payout !== null ? Math.round(booking.amount_host_payout * ratio * 100) / 100 : null,
      commission_amount: booking.commission_amount !== null ? Math.round(booking.commission_amount * ratio * 100) / 100 : null,
      price_details: scaleCityTaxInPriceDetails(booking.price_details, ratio),
    }
  })
}

/**
 * Splittet eine Mehrmonats-Buchung in virtuelle Pro-Kalendermonat-Segmente.
 * Geldbeträge (inkl. der City-Tax-Zeile in `price_details`) werden proportional
 * skaliert. Es werden nur Segmente zurückgegeben, die mit `[rangeFrom, rangeTo]`
 * überlappen.
 *
 * Wenn `booking.original_check_out` gesetzt ist (= Buchung wurde gekürzt),
 * werden Kalendermonate VOR dem neuen check_out mit ihren Original-Anteilen
 * eingefroren (damit bereits gemeldete BhSt-Werte unverändert bleiben), und
 * der neue letzte Monat absorbiert die Differenz.
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

  const originalCheckOutStr = booking.original_check_out
  const isShortened = !!originalCheckOutStr && originalCheckOutStr > booking.check_out

  if (isShortened) {
    const originalCheckOut = new Date(originalCheckOutStr + 'T00:00:00')
    const allSegments = buildShortenedSegments(booking, checkIn, checkOut, originalCheckOut)
    const filtered = allSegments.filter((s) => inRange(s, rangeFrom, rangeTo))
    if (rangeOnlyFilter) return filtered
    return filtered.length > 0 ? filtered : (allSegments.length > 0 ? [allSegments[allSegments.length - 1]] : [booking])
  }

  if (checkIn.getMonth() === checkOut.getMonth() && checkIn.getFullYear() === checkOut.getFullYear()) {
    if (!rangeOnlyFilter) return [booking]
    if (booking.check_out > rangeFrom && booking.check_in <= rangeTo) return [booking]
    return []
  }

  const fullGross = booking.amount_gross ?? 0
  const fullCleaning = booking.cleaning_fee ?? 0
  const accomExclCleaning = fullGross - fullCleaning

  type SegSpec = { segStart: Date; segEnd: Date; segNights: number; ratio: number; isLast: boolean }
  const specs: SegSpec[] = []
  let current = startOfMonth(checkIn)

  while (current <= checkOut) {
    const segStart = checkIn > current ? checkIn : current
    const nextMonthStart = addMonths(current, 1)
    const segEnd = checkOut < nextMonthStart ? checkOut : nextMonthStart
    const segNights = differenceInCalendarDays(segEnd, segStart)

    if (segNights > 0) {
      specs.push({ segStart, segEnd, segNights, ratio: segNights / totalNights, isLast: false })
    }

    current = nextMonthStart
    if (checkOut <= nextMonthStart) break
  }

  if (specs.length === 0) return rangeOnlyFilter ? [] : [booking]
  specs[specs.length - 1].isLast = true

  const segments: BookingWithProp[] = []
  for (const s of specs) {
    const segCheckIn = format(s.segStart, 'yyyy-MM-dd')
    const segCheckOut = format(s.segEnd, 'yyyy-MM-dd')
    if (segCheckOut <= rangeFrom || segCheckIn > rangeTo) continue

    const segAccom = Math.round(accomExclCleaning * s.ratio * 100) / 100
    const segCleaning = s.isLast ? fullCleaning : 0
    const segGrossDisplay = Math.round((segAccom + segCleaning) * 100) / 100

    segments.push({
      ...booking,
      check_in: segCheckIn,
      check_out: segCheckOut,
      nights: s.segNights,
      amount_gross: booking.amount_gross !== null ? segGrossDisplay : null,
      cleaning_fee: booking.cleaning_fee !== null ? Math.round(segCleaning * 100) / 100 : null,
      amount_host_payout: booking.amount_host_payout !== null ? Math.round(booking.amount_host_payout * s.ratio * 100) / 100 : null,
      commission_amount: booking.commission_amount !== null ? Math.round(booking.commission_amount * s.ratio * 100) / 100 : null,
      price_details: scaleCityTaxInPriceDetails(booking.price_details, s.ratio),
    })
  }

  if (rangeOnlyFilter) return segments
  return segments.length > 0 ? segments : [booking]
}

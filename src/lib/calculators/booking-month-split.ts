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

function makeSegment(
  booking: BookingWithProp,
  segStart: Date,
  segEnd: Date,
  segNights: number,
  ratio: number,
): BookingWithProp {
  return {
    ...booking,
    check_in: format(segStart, 'yyyy-MM-dd'),
    check_out: format(segEnd, 'yyyy-MM-dd'),
    nights: segNights,
    amount_gross: booking.amount_gross !== null ? Math.round(booking.amount_gross * ratio * 100) / 100 : null,
    cleaning_fee: booking.cleaning_fee !== null ? Math.round(booking.cleaning_fee * ratio * 100) / 100 : null,
    amount_host_payout: booking.amount_host_payout !== null ? Math.round(booking.amount_host_payout * ratio * 100) / 100 : null,
    commission_amount: booking.commission_amount !== null ? Math.round(booking.commission_amount * ratio * 100) / 100 : null,
    price_details: scaleCityTaxInPriceDetails(booking.price_details, ratio),
  }
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

  const frozen: BookingWithProp[] = []
  let frozenAmountSum = 0
  let frozenCleaningSum = 0
  let frozenCommissionSum = 0
  let frozenHostPayoutSum = 0
  let newLastSegStart: Date | null = null

  let current = startOfMonth(checkIn)
  while (current <= originalCheckOut) {
    const segStart = checkIn > current ? checkIn : current
    const nextMonthStart = addMonths(current, 1)
    const segEndOriginal = originalCheckOut < nextMonthStart ? originalCheckOut : nextMonthStart
    const segNightsOriginal = differenceInCalendarDays(segEndOriginal, segStart)

    if (segNightsOriginal > 0) {
      if (segEndOriginal <= newCheckOut) {
        const ratio = segNightsOriginal / originalNights
        const seg = makeSegment(booking, segStart, segEndOriginal, segNightsOriginal, ratio)
        frozen.push(seg)
        frozenAmountSum += seg.amount_gross ?? 0
        frozenCleaningSum += seg.cleaning_fee ?? 0
        frozenCommissionSum += seg.commission_amount ?? 0
        frozenHostPayoutSum += seg.amount_host_payout ?? 0
      } else if (segStart < newCheckOut) {
        newLastSegStart = segStart
      }
    }

    current = nextMonthStart
    if (originalCheckOut <= nextMonthStart) break
  }

  const segments = [...frozen]

  if (newLastSegStart) {
    const newNights = differenceInCalendarDays(newCheckOut, newLastSegStart)
    const totalGross = booking.amount_gross ?? 0
    const remainderAmount = Math.round((totalGross - frozenAmountSum) * 100) / 100
    const remainderCleaning = booking.cleaning_fee !== null
      ? Math.round(((booking.cleaning_fee ?? 0) - frozenCleaningSum) * 100) / 100
      : null
    const remainderCommission = booking.commission_amount !== null
      ? Math.round(((booking.commission_amount ?? 0) - frozenCommissionSum) * 100) / 100
      : null
    const remainderHostPayout = booking.amount_host_payout !== null
      ? Math.round(((booking.amount_host_payout ?? 0) - frozenHostPayoutSum) * 100) / 100
      : null
    const remainderRatio = totalGross > 0 ? remainderAmount / totalGross : 0

    segments.push({
      ...booking,
      check_in: format(newLastSegStart, 'yyyy-MM-dd'),
      check_out: format(newCheckOut, 'yyyy-MM-dd'),
      nights: newNights,
      amount_gross: booking.amount_gross !== null ? remainderAmount : null,
      cleaning_fee: remainderCleaning,
      commission_amount: remainderCommission,
      amount_host_payout: remainderHostPayout,
      price_details: scaleCityTaxInPriceDetails(booking.price_details, remainderRatio),
    })
  }

  return segments
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
        segments.push(makeSegment(booking, segStart, checkOut < nextMonthStart ? checkOut : nextMonthStart, segNightsActual, ratio))
      }
    }

    current = nextMonthStart
    if (checkOut <= nextMonthStart) break
  }

  if (rangeOnlyFilter) return segments
  return segments.length > 0 ? segments : [booking]
}

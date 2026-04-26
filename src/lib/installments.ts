import { addMonths, differenceInCalendarDays, format, parseISO, startOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'

export interface PaymentScheduleEntry {
  due_date: string
  amount: number
  paid_at?: string | null
}

export type UpcomingPaymentSource = 'installment' | 'invoice'
export type UpcomingPaymentStatus = 'overdue' | 'today' | 'upcoming'

export interface UpcomingPayment {
  key: string
  source: UpcomingPaymentSource
  invoiceId: string
  invoiceNumber: string
  guestName: string
  propertyName: string | null
  dueDate: string
  amount: number
  status: UpcomingPaymentStatus
  daysFromToday: number
  installmentIndex?: number
  installmentTotal?: number
  rawSchedule?: PaymentScheduleEntry[]
}

export interface InvoiceForInstallments {
  id: string
  invoice_number: string
  status: string
  invoice_type?: string | null
  due_date: string | null
  total_gross: number
  property_id: string | null
  payment_schedule: PaymentScheduleEntry[] | null
  guest_snapshot: Record<string, string> | null
}

const TRACKED_INVOICE_STATUSES = new Set(['created', 'sent'])

function classifyByDate(dueDate: string, today: Date): { status: UpcomingPaymentStatus; days: number } {
  const due = parseISO(dueDate + 'T00:00:00')
  const days = differenceInCalendarDays(due, today)
  if (days < 0) return { status: 'overdue', days }
  if (days === 0) return { status: 'today', days }
  return { status: 'upcoming', days }
}

function guestNameFromSnapshot(snapshot: Record<string, string> | null): string {
  if (!snapshot) return 'Unbekannter Gast'
  const name = `${snapshot.firstname ?? ''} ${snapshot.lastname ?? ''}`.trim()
  if (name) return name
  if (snapshot.company) return snapshot.company
  return 'Unbekannter Gast'
}

export function getUpcomingPayments(params: {
  invoices: InvoiceForInstallments[]
  propertyMap: Record<string, string>
  today?: Date
  windowDays?: number
}): UpcomingPayment[] {
  const today = params.today ?? new Date()
  today.setHours(0, 0, 0, 0)
  const windowDays = params.windowDays ?? 30
  const result: UpcomingPayment[] = []

  for (const inv of params.invoices) {
    if (inv.status === 'cancelled' || inv.status === 'paid') continue
    if (inv.invoice_type && inv.invoice_type !== 'invoice') continue

    const guestName = guestNameFromSnapshot(inv.guest_snapshot)
    const propertyName = inv.property_id ? params.propertyMap[inv.property_id] ?? null : null
    const schedule = inv.payment_schedule ?? null

    if (schedule && schedule.length > 0) {
      schedule.forEach((entry, idx) => {
        if (entry.paid_at) return
        const { status, days } = classifyByDate(entry.due_date, today)
        if (days > windowDays) return
        result.push({
          key: `${inv.id}:${idx}`,
          source: 'installment',
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          guestName,
          propertyName,
          dueDate: entry.due_date,
          amount: entry.amount,
          status,
          daysFromToday: days,
          installmentIndex: idx + 1,
          installmentTotal: schedule.length,
          rawSchedule: schedule,
        })
      })
      continue
    }

    if (!inv.due_date) continue
    if (!TRACKED_INVOICE_STATUSES.has(inv.status)) continue

    const { status, days } = classifyByDate(inv.due_date, today)
    if (days > windowDays) continue

    result.push({
      key: `${inv.id}:single`,
      source: 'invoice',
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      guestName,
      propertyName,
      dueDate: inv.due_date,
      amount: inv.total_gross,
      status,
      daysFromToday: days,
    })
  }

  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export function setInstallmentPaid(
  schedule: PaymentScheduleEntry[],
  index: number,
  paidAt: string | null,
): PaymentScheduleEntry[] {
  return schedule.map((entry, i) =>
    i === index ? { ...entry, paid_at: paidAt } : entry,
  )
}

export function hasOpenInstallments(schedule: PaymentScheduleEntry[] | null): boolean {
  if (!schedule || schedule.length === 0) return false
  return schedule.some((e) => !e.paid_at)
}

export function countOpenInstallments(schedule: PaymentScheduleEntry[] | null): number {
  if (!schedule) return 0
  return schedule.filter((e) => !e.paid_at).length
}

export interface BookingForSegments {
  id: string
  check_in: string
  check_out: string
  amount_gross: number | null
  nights: number | null
  status: string
  guest_firstname: string | null
  guest_lastname: string | null
  property_id: string | null
}

export interface InvoicedPeriod {
  booking_id: string | null
  service_period_start: string | null
  status: string
  invoice_type: string | null
}

export interface PendingInvoiceCreation {
  key: string
  bookingId: string
  guestName: string
  propertyName: string | null
  segmentStart: string
  segmentEnd: string
  monthLabel: string
  amount: number
  daysFromToday: number
  status: UpcomingPaymentStatus
}

function calculateSegments(booking: BookingForSegments): Array<{
  checkIn: string
  checkOut: string
  monthLabel: string
  amount: number
}> {
  const checkIn = parseISO(booking.check_in + 'T00:00:00')
  const checkOut = parseISO(booking.check_out + 'T00:00:00')
  const totalNights = booking.nights ?? differenceInCalendarDays(checkOut, checkIn)
  if (totalNights <= 0) return []

  const grossTotal = booking.amount_gross ?? 0
  const segments: Array<{ checkIn: string; checkOut: string; monthLabel: string; amount: number }> = []
  let current = startOfMonth(checkIn)
  while (current < checkOut) {
    const nextMonth = addMonths(current, 1)
    const segStart = checkIn > current ? checkIn : current
    const segEnd = checkOut < nextMonth ? checkOut : nextMonth
    const segNights = differenceInCalendarDays(segEnd, segStart)
    if (segNights > 0) {
      const ratio = segNights / totalNights
      segments.push({
        checkIn: format(segStart, 'yyyy-MM-dd'),
        checkOut: format(segEnd, 'yyyy-MM-dd'),
        monthLabel: format(segStart, 'MMMM yyyy', { locale: de }),
        amount: Math.round(grossTotal * ratio * 100) / 100,
      })
    }
    current = nextMonth
  }
  return segments
}

export function getPendingInvoiceCreations(params: {
  bookings: BookingForSegments[]
  invoicedPeriods: InvoicedPeriod[]
  propertyMap: Record<string, string>
  today?: Date
  windowDaysAhead?: number
}): PendingInvoiceCreation[] {
  const today = params.today ?? new Date()
  today.setHours(0, 0, 0, 0)
  const windowDaysAhead = params.windowDaysAhead ?? 35

  const invoicedSet = new Set<string>()
  for (const inv of params.invoicedPeriods) {
    if (!inv.booking_id || !inv.service_period_start) continue
    if (inv.status === 'draft' || inv.status === 'cancelled') continue
    if (inv.invoice_type && inv.invoice_type !== 'invoice') continue
    invoicedSet.add(`${inv.booking_id}:${inv.service_period_start}`)
  }

  const result: PendingInvoiceCreation[] = []
  for (const booking of params.bookings) {
    if (booking.status === 'cancelled') continue
    const segments = calculateSegments(booking)
    if (segments.length <= 1) continue

    const guestName = [booking.guest_firstname, booking.guest_lastname]
      .filter(Boolean)
      .join(' ') || 'Unbekannter Gast'
    const propertyName = booking.property_id ? params.propertyMap[booking.property_id] ?? null : null

    for (const seg of segments) {
      const matchKey = `${booking.id}:${seg.checkIn}`
      if (invoicedSet.has(matchKey)) continue

      const segDate = parseISO(seg.checkIn + 'T00:00:00')
      const days = differenceInCalendarDays(segDate, today)
      if (days > windowDaysAhead) continue

      const status: UpcomingPaymentStatus =
        days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming'

      result.push({
        key: matchKey,
        bookingId: booking.id,
        guestName,
        propertyName,
        segmentStart: seg.checkIn,
        segmentEnd: seg.checkOut,
        monthLabel: seg.monthLabel,
        amount: seg.amount,
        daysFromToday: days,
        status,
      })
    }
  }

  return result.sort((a, b) => a.segmentStart.localeCompare(b.segmentStart))
}

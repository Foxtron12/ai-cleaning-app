import { differenceInCalendarDays, parseISO } from 'date-fns'

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

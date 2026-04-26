'use client'

import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, addDays, addMonths, subMonths, eachDayOfInterval, isWithinInterval, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import type { BookingWithProperty } from '@/lib/types'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { UpcomingActivities } from '@/components/dashboard/upcoming-activities'
import { ChannelChart, type ChannelData } from '@/components/dashboard/channel-chart'
import { RevenueChart, type MonthlyRevenue } from '@/components/dashboard/revenue-chart'
import { UpcomingInstallmentsCard } from '@/components/dashboard/upcoming-installments-card'
import {
  getUpcomingPayments,
  setInstallmentPaid,
  type InvoiceForInstallments,
  type UpcomingPayment,
} from '@/lib/installments'
import { useToast } from '@/hooks/use-toast'

interface KpiData {
  bookingsThisMonth: number
  occupancyPercent: number
  revenueGross: number
  revenueNet: number
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [checkIns, setCheckIns] = useState<BookingWithProperty[]>([])
  const [checkOuts, setCheckOuts] = useState<BookingWithProperty[]>([])
  const [channelData, setChannelData] = useState<ChannelData[]>([])
  const [revenueData, setRevenueData] = useState<MonthlyRevenue[]>([])
  const [paymentInvoices, setPaymentInvoices] = useState<InvoiceForInstallments[]>([])
  const [propertyMap, setPropertyMap] = useState<Record<string, string>>({})
  const [markingKey, setMarkingKey] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const now = new Date()
        const monthStart = startOfMonth(now)
        const monthEnd = endOfMonth(now)
        const monthStartStr = format(monthStart, 'yyyy-MM-dd')
        const monthEndStr = format(monthEnd, 'yyyy-MM-dd')
        const todayStr = format(now, 'yyyy-MM-dd')
        const weekLaterStr = format(addDays(now, 7), 'yyyy-MM-dd')

        // Fetch all bookings for KPIs + channel data (this month, non-cancelled)
        const { data: monthBookings } = await supabase
          .from('bookings')
          .select('*, properties(*)')
          .neq('status', 'cancelled')
          .lte('check_in', monthEndStr)
          .gte('check_out', monthStartStr)
          .limit(500)

        // Fetch upcoming check-ins (next 7 days)
        const { data: upcomingCheckIns } = await supabase
          .from('bookings')
          .select('*, properties(*)')
          .neq('status', 'cancelled')
          .gte('check_in', todayStr)
          .lte('check_in', weekLaterStr)
          .order('check_in', { ascending: true })
          .limit(10)

        // Fetch upcoming check-outs (next 7 days)
        const { data: upcomingCheckOuts } = await supabase
          .from('bookings')
          .select('*, properties(*)')
          .neq('status', 'cancelled')
          .gte('check_out', todayStr)
          .lte('check_out', weekLaterStr)
          .order('check_out', { ascending: true })
          .limit(10)

        // Fetch 6 months revenue data
        const sixMonthsAgo = subMonths(monthStart, 5)
        const sixMonthsAgoStr = format(sixMonthsAgo, 'yyyy-MM-dd')
        const { data: revenueBookings } = await supabase
          .from('bookings')
          .select('check_in, amount_gross, amount_host_payout, commission_amount')
          .neq('status', 'cancelled')
          .gte('check_in', sixMonthsAgoStr)
          .lte('check_in', monthEndStr)
          .limit(2000)

        // Fetch property count for occupancy calculation
        const { count: propertyCount } = await supabase
          .from('properties')
          .select('id', { count: 'exact', head: true })

        // Fetch property names for upcoming-payments widget
        const { data: propertyRows } = await supabase
          .from('properties')
          .select('id, name')
          .limit(500)
        const pMap: Record<string, string> = {}
        for (const p of propertyRows ?? []) pMap[p.id] = p.name
        setPropertyMap(pMap)

        // Fetch open invoices for upcoming-payments widget
        const { data: openInvoices } = await supabase
          .from('invoices')
          .select('id, invoice_number, status, invoice_type, due_date, total_gross, property_id, payment_schedule, guest_snapshot')
          .not('status', 'in', '(paid,cancelled,draft)')
          .limit(500)
        setPaymentInvoices((openInvoices ?? []) as unknown as InvoiceForInstallments[])

        // Calculate KPIs
        const bookings = monthBookings ?? []
        const totalGross = bookings.reduce((sum, b) => sum + (b.amount_gross ?? 0), 0)
        const totalNet = bookings.reduce((sum, b) => sum + (b.amount_host_payout ?? ((b.amount_gross ?? 0) - (b.commission_amount ?? 0))), 0)

        // Occupancy: count booked nights this month across all properties
        const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).length
        const totalAvailableNights = (propertyCount ?? 1) * daysInMonth
        let bookedNights = 0
        for (const booking of bookings) {
          const bStart = parseISO(booking.check_in)
          const bEnd = parseISO(booking.check_out)
          for (const day of eachDayOfInterval({ start: monthStart, end: monthEnd })) {
            if (isWithinInterval(day, { start: bStart, end: addDays(bEnd, -1) })) {
              bookedNights++
            }
          }
        }
        const occupancy = totalAvailableNights > 0
          ? (bookedNights / totalAvailableNights) * 100
          : 0

        setKpi({
          bookingsThisMonth: bookings.length,
          occupancyPercent: occupancy,
          revenueGross: totalGross,
          revenueNet: totalNet,
        })

        // Channel distribution
        const channelMap = new Map<string, number>()
        for (const b of bookings) {
          channelMap.set(b.channel, (channelMap.get(b.channel) ?? 0) + 1)
        }
        setChannelData(
          Array.from(channelMap.entries())
            .map(([channel, count]) => ({ channel, count }))
            .sort((a, b) => b.count - a.count)
        )

        // Monthly revenue
        const monthlyMap = new Map<string, { gross: number; net: number }>()
        for (let i = 5; i >= 0; i--) {
          const m = addMonths(monthStart, -i)
          const key = format(m, 'yyyy-MM')
          monthlyMap.set(key, { gross: 0, net: 0 })
        }
        for (const b of revenueBookings ?? []) {
          const key = b.check_in.substring(0, 7)
          const existing = monthlyMap.get(key)
          if (existing) {
            existing.gross += b.amount_gross ?? 0
            existing.net += b.amount_host_payout ?? ((b.amount_gross ?? 0) - (b.commission_amount ?? 0))
          }
        }
        setRevenueData(
          Array.from(monthlyMap.entries()).map(([key, val]) => ({
            month: format(parseISO(key + '-01'), 'MMM yy', { locale: de }),
            gross: val.gross,
            net: val.net,
          }))
        )

        setCheckIns((upcomingCheckIns ?? []) as BookingWithProperty[])
        setCheckOuts((upcomingCheckOuts ?? []) as BookingWithProperty[])
      } catch (error) {
        console.error('Dashboard fetch error:', error)
        setError('Daten konnten nicht geladen werden. Bitte Seite neu laden.')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const upcomingPayments: UpcomingPayment[] = getUpcomingPayments({
    invoices: paymentInvoices,
    propertyMap,
  })

  async function handleMarkInstallmentPaid(payment: UpcomingPayment) {
    if (payment.source !== 'installment' || payment.installmentIndex == null) return
    const idx = payment.installmentIndex - 1
    const invoice = paymentInvoices.find((i) => i.id === payment.invoiceId)
    if (!invoice || !invoice.payment_schedule) return

    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const updated = setInstallmentPaid(invoice.payment_schedule, idx, todayStr)
    const previous = invoice.payment_schedule

    setMarkingKey(payment.key)
    setPaymentInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id ? { ...inv, payment_schedule: updated } : inv,
      ),
    )

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ payment_schedule: updated as unknown as import('@/lib/database.types').Json })
      .eq('id', invoice.id)

    setMarkingKey(null)

    if (updateError) {
      setPaymentInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id ? { ...inv, payment_schedule: previous } : inv,
        ),
      )
      toast({
        title: 'Speichern fehlgeschlagen',
        description: updateError.message,
        variant: 'destructive',
      })
      return
    }

    toast({ title: 'Rate als bezahlt markiert' })
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-destructive">{error}</p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          onClick={() => window.location.reload()}
        >
          Seite neu laden
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <KpiCards data={kpi} loading={loading} />
      <UpcomingInstallmentsCard
        payments={upcomingPayments}
        loading={loading}
        onMarkPaid={handleMarkInstallmentPaid}
        markingKey={markingKey}
      />
      <UpcomingActivities
        checkIns={checkIns}
        checkOuts={checkOuts}
        loading={loading}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <ChannelChart data={channelData} loading={loading} />
        <RevenueChart data={revenueData} loading={loading} />
      </div>
    </div>
  )
}

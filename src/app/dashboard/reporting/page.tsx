'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  parseISO,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { Download } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell } from 'recharts'
import { supabase } from '@/lib/supabase'
import type { BookingWithProperty } from '@/lib/types'
import {
  getCleaningFee,
  getAccommodationRevenue,
  getAccommodationGrossWithoutCityTax,
} from '@/lib/calculators/booking-price'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'

type TimeRange = '12_months' | 'this_year' | 'last_year'

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

const barChartConfig = {
  accommodation: { label: 'Übernachtung', color: 'hsl(var(--chart-1))' },
  cleaning: { label: 'Reinigung', color: 'hsl(var(--chart-3))' },
  net: { label: 'Netto', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const CHANNEL_COLORS: Record<string, string> = {
  Airbnb: 'hsl(350, 80%, 55%)',
  'Booking.com': 'hsl(220, 80%, 55%)',
  VRBO: 'hsl(270, 60%, 55%)',
  Expedia: 'hsl(45, 80%, 55%)',
  Direct: 'hsl(140, 60%, 45%)',
  Google: 'hsl(200, 70%, 50%)',
  Other: 'hsl(0, 0%, 60%)',
}

export default function ReportingPage() {
  const [bookings, setBookings] = useState<BookingWithProperty[]>([])
  const [propertyCount, setPropertyCount] = useState(1)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('12_months')
  const [showNet, setShowNet] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const now = new Date()
      let from: string
      let to: string

      switch (timeRange) {
        case '12_months':
          from = format(subMonths(startOfMonth(now), 11), 'yyyy-MM-dd')
          to = format(endOfMonth(now), 'yyyy-MM-dd')
          break
        case 'this_year':
          from = `${now.getFullYear()}-01-01`
          to = `${now.getFullYear()}-12-31`
          break
        case 'last_year':
          from = `${now.getFullYear() - 1}-01-01`
          to = `${now.getFullYear() - 1}-12-31`
          break
      }

      const { data } = await supabase
        .from('bookings')
        .select('*, properties(*)')
        .neq('status', 'cancelled')
        .gte('check_in', from)
        .lte('check_in', to)
        .order('check_in', { ascending: true })

      const { count } = await supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })

      setBookings((data ?? []) as BookingWithProperty[])
      setPropertyCount(count ?? 1)
      setLoading(false)
    }
    fetchData()
  }, [timeRange])

  // Aggregate KPIs
  const kpis = useMemo(() => {
    if (bookings.length === 0) return null
    const totalAccommodation = bookings.reduce((s, b) => s + getAccommodationRevenue(b), 0)
    const totalCleaning = bookings.reduce((s, b) => s + getCleaningFee(b), 0)
    const totalGross = totalAccommodation + totalCleaning // WITHOUT city tax
    const totalCommission = bookings.reduce((s, b) => s + (b.commission_amount ?? 0), 0)
    const totalNet = totalGross - totalCommission
    const totalNights = bookings.reduce((s, b) => s + (b.nights ?? 0), 0)
    const avgNights = totalNights / bookings.length
    const adr = totalNights > 0 ? totalAccommodation / totalNights : 0

    // Calculate months in range for RevPAR
    const months = timeRange === '12_months' ? 12 : 12
    const totalDays = months * 30
    const totalAvailable = propertyCount * totalDays
    const occupancy = totalAvailable > 0 ? (totalNights / totalAvailable) * 100 : 0
    const revpar = adr * (occupancy / 100)

    return {
      adr,
      revpar,
      occupancy,
      avgNights,
      totalGross,
      totalNet,
      totalAccommodation,
      totalCleaning,
      totalCommission,
    }
  }, [bookings, propertyCount, timeRange])

  // Monthly breakdown
  const monthlyData = useMemo(() => {
    const map = new Map<string, {
      bookings: number
      accommodation: number
      cleaning: number
      gross: number
      commission: number
      net: number
    }>()

    for (const b of bookings) {
      const key = b.check_in.substring(0, 7)
      const existing = map.get(key) ?? { bookings: 0, accommodation: 0, cleaning: 0, gross: 0, commission: 0, net: 0 }
      const accom = getAccommodationRevenue(b)
      const clean = getCleaningFee(b)
      const commission = b.commission_amount ?? 0
      existing.bookings++
      existing.accommodation += accom
      existing.cleaning += clean
      existing.gross += accom + clean
      existing.commission += commission
      existing.net += accom + clean - commission
      map.set(key, existing)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        month: format(parseISO(key + '-01'), 'MMM yy', { locale: de }),
        monthKey: key,
        ...val,
      }))
  }, [bookings])

  // Channel breakdown
  const channelData = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; commission: number }>()
    for (const b of bookings) {
      const ch = b.channel
      const existing = map.get(ch) ?? { count: 0, gross: 0, commission: 0 }
      existing.count++
      existing.gross += b.amount_gross ?? 0
      existing.commission += b.commission_amount ?? 0
      map.set(ch, existing)
    }
    return Array.from(map.entries())
      .map(([channel, val]) => ({ channel, ...val }))
      .sort((a, b) => b.gross - a.gross)
  }, [bookings])

  const channelChartConfig = useMemo(() => {
    const config: ChartConfig = {}
    for (const d of channelData) {
      config[d.channel] = { label: d.channel, color: CHANNEL_COLORS[d.channel] ?? 'hsl(0,0%,60%)' }
    }
    return config
  }, [channelData])

  function exportCSV() {
    const headers = ['Monat', 'Buchungen', 'Übernachtung', 'Reinigung', 'Brutto', 'Provision', 'Netto']
    const rows = monthlyData.map((m) => [
      m.monthKey,
      m.bookings,
      m.accommodation.toFixed(2),
      m.cleaning.toFixed(2),
      m.gross.toFixed(2),
      m.commission.toFixed(2),
      m.net.toFixed(2),
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(';'))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporting-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Reporting</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={showNet ? 'ghost' : 'secondary'}
              size="sm"
              className="rounded-r-none"
              onClick={() => setShowNet(false)}
            >
              Brutto
            </Button>
            <Button
              variant={showNet ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => setShowNet(true)}
            >
              Netto
            </Button>
          </div>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12_months">Letzte 12 Monate</SelectItem>
              <SelectItem value="this_year">Dieses Jahr</SelectItem>
              <SelectItem value="last_year">Letztes Jahr</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-7 w-24" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">ADR (Ø Preis/Nacht)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatEur(kpis?.adr ?? 0)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">RevPAR</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatEur(kpis?.revpar ?? 0)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Auslastung</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{(kpis?.occupancy ?? 0).toFixed(0)}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ø Aufenthalt</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{(kpis?.avgNights ?? 0).toFixed(1)} Nächte</div></CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monatsumsatz (ohne City Tax)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <ChartContainer config={barChartConfig} className="h-[250px] w-full">
                <BarChart data={monthlyData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(v)
                    }
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(v) => formatEur(v as number)} />}
                  />
                  {showNet ? (
                    <Bar dataKey="net" fill="var(--color-net)" radius={[4, 4, 0, 0]} />
                  ) : (
                    <>
                      <Bar dataKey="accommodation" stackId="gross" fill="var(--color-accommodation)" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="cleaning" stackId="gross" fill="var(--color-cleaning)" radius={[4, 4, 0, 0]} />
                    </>
                  )}
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Umsatz nach Kanal</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <ChartContainer config={channelChartConfig} className="h-[200px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatEur(v as number)} />} />
                    <Pie data={channelData} dataKey="gross" nameKey="channel" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {channelData.map((e) => (
                        <Cell key={e.channel} fill={CHANNEL_COLORS[e.channel] ?? 'hsl(0,0%,60%)'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-wrap justify-center gap-3">
                  {channelData.map((e) => (
                    <div key={e.channel} className="flex items-center gap-1.5 text-sm">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[e.channel] ?? 'hsl(0,0%,60%)' }} />
                      <span>{e.channel}: {formatEur(e.gross)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly summary table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Monatsübersicht (ohne City Tax)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Monat</TableHead>
                    <TableHead className="text-center">Buchungen</TableHead>
                    <TableHead className="text-right">Übernachtung</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Reinigung</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead className="text-right">Provision</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map((m) => (
                    <TableRow key={m.monthKey}>
                      <TableCell className="font-medium">{m.month}</TableCell>
                      <TableCell className="text-center">{m.bookings}</TableCell>
                      <TableCell className="text-right">{formatEur(m.accommodation)}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">{formatEur(m.cleaning)}</TableCell>
                      <TableCell className="text-right">{formatEur(m.gross)}</TableCell>
                      <TableCell className="text-right">{formatEur(m.commission)}</TableCell>
                      <TableCell className="text-right font-medium">{formatEur(m.net)}</TableCell>
                    </TableRow>
                  ))}
                  {monthlyData.length > 0 && (
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Gesamt</TableCell>
                      <TableCell className="text-center">
                        {monthlyData.reduce((s, m) => s + m.bookings, 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEur(monthlyData.reduce((s, m) => s + m.accommodation, 0))}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {formatEur(monthlyData.reduce((s, m) => s + m.cleaning, 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEur(monthlyData.reduce((s, m) => s + m.gross, 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEur(monthlyData.reduce((s, m) => s + m.commission, 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEur(monthlyData.reduce((s, m) => s + m.net, 0))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

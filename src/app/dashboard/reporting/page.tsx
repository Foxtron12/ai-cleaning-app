'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  parseISO,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell } from 'recharts'
import { supabase } from '@/lib/supabase'
import type { BookingWithProperty, Property, CityTaxRule } from '@/lib/types'
import { calculateAccommodationTax, getTaxConfigForProperty } from '@/lib/calculators/accommodation-tax'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

type TimeRange = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | '12_months' | 'last_year' | 'custom'

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

const barChartConfig = {
  gross: { label: 'Brutto', color: 'hsl(var(--chart-1))' },
  net: { label: 'Auszahlung', color: 'hsl(var(--chart-2))' },
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

/**
 * Brutto (ohne City Tax) — matches PROJ-2 booking-detail-sheet exactly.
 * Booking.com: amount_gross already includes Übernachtungssteuer → subtract calculated city tax.
 * All other channels: amount_gross excludes city tax → use as-is.
 */
function getBruttoWithoutCityTax(b: BookingWithProperty, cityRules: CityTaxRule[]): number {
  if (b.channel === 'Booking.com') {
    const config = b.properties
      ? getTaxConfigForProperty(b.properties, cityRules)
      : null
    const taxResult = config ? calculateAccommodationTax(b, config, b.properties?.ota_remits_tax ?? []) : null
    return (b.amount_gross ?? 0) - (taxResult?.taxAmount ?? 0)
  }
  return b.amount_gross ?? 0
}

function getDateRange(range: TimeRange, customMonth: string): { from: string; to: string; label: string } {
  const now = new Date()
  switch (range) {
    case 'this_month':
      return {
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
        label: format(now, 'MMMM yyyy', { locale: de }),
      }
    case 'last_month': {
      const last = subMonths(now, 1)
      return {
        from: format(startOfMonth(last), 'yyyy-MM-dd'),
        to: format(endOfMonth(last), 'yyyy-MM-dd'),
        label: format(last, 'MMMM yyyy', { locale: de }),
      }
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const qs = new Date(now.getFullYear(), q * 3, 1)
      const qe = new Date(now.getFullYear(), q * 3 + 3, 0)
      return {
        from: format(qs, 'yyyy-MM-dd'),
        to: format(qe, 'yyyy-MM-dd'),
        label: `Q${q + 1} ${now.getFullYear()}`,
      }
    }
    case 'this_year':
      return {
        from: `${now.getFullYear()}-01-01`,
        to: `${now.getFullYear()}-12-31`,
        label: String(now.getFullYear()),
      }
    case '12_months':
      return {
        from: format(subMonths(startOfMonth(now), 11), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
        label: 'Letzte 12 Monate',
      }
    case 'last_year':
      return {
        from: `${now.getFullYear() - 1}-01-01`,
        to: `${now.getFullYear() - 1}-12-31`,
        label: String(now.getFullYear() - 1),
      }
    case 'custom': {
      const d = customMonth ? parseISO(customMonth + '-01') : now
      return {
        from: format(startOfMonth(d), 'yyyy-MM-dd'),
        to: format(endOfMonth(d), 'yyyy-MM-dd'),
        label: format(d, 'MMMM yyyy', { locale: de }),
      }
    }
  }
}

export default function ReportingPage() {
  const [bookings, setBookings] = useState<BookingWithProperty[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [cityRules, setCityRules] = useState<CityTaxRule[]>([])
  const [isKleinunternehmer, setIsKleinunternehmer] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('this_month')
  const [customMonth, setCustomMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [showNet, setShowNet] = useState(false)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const range = getDateRange(timeRange, customMonth)
  const isSingleMonth = ['this_month', 'last_month', 'custom'].includes(timeRange)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const r = getDateRange(timeRange, customMonth)

        let bookingsQuery = supabase
          .from('bookings')
          .select('*, properties(*)')
          .neq('status', 'cancelled')
          .gte('check_in', r.from)
          .lte('check_in', r.to)
          .order('check_in', { ascending: true })

        if (selectedPropertyId !== 'all') {
          bookingsQuery = bookingsQuery.eq('property_id', selectedPropertyId)
        }

        const [{ data }, { data: propData }, { data: rulesData }, { data: settingsData }] = await Promise.all([
          bookingsQuery,
          supabase.from('properties').select('*').order('name'),
          supabase.from('city_tax_rules').select('*').order('city'),
          supabase.from('settings').select('is_kleinunternehmer').limit(1).single(),
        ])

        setBookings((data ?? []) as BookingWithProperty[])
        setProperties((propData ?? []) as Property[])
        setCityRules((rulesData ?? []) as CityTaxRule[])
        setIsKleinunternehmer((settingsData as { is_kleinunternehmer: boolean | null } | null)?.is_kleinunternehmer ?? false)
      } catch (err) {
        console.error('Failed to load reporting data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [timeRange, customMonth, selectedPropertyId])

  // All unique tags across properties
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    properties.forEach((p) => (p.tags ?? []).forEach((t) => tags.add(t)))
    return Array.from(tags).sort()
  }, [properties])

  // Filter bookings by property/tag
  const filteredBookings = useMemo(() => {
    let result = bookings
    if (selectedPropertyId !== 'all') {
      result = result.filter((b) => b.property_id === selectedPropertyId)
    }
    if (selectedTags.length > 0) {
      const tagPropIds = properties
        .filter((p) => (p.tags ?? []).some((t) => selectedTags.includes(t)))
        .map((p) => p.id)
      result = result.filter((b) => tagPropIds.includes(b.property_id ?? ''))
    }
    return result
  }, [bookings, selectedPropertyId, selectedTags, properties])

  // Aggregate KPIs
  const kpis = useMemo(() => {
    if (filteredBookings.length === 0) return null
    const totalGross = filteredBookings.reduce((s, b) => s + getBruttoWithoutCityTax(b, cityRules), 0)
    const totalCleaning = filteredBookings.reduce((s, b) => s + (b.cleaning_fee ?? 0), 0)
    const totalAccommodation = totalGross - totalCleaning
    const totalCommission = filteredBookings.reduce((s, b) => s + (b.commission_amount ?? 0), 0)
    const totalAuszahlung = totalGross - totalCommission
    const effectiveVatRate = isKleinunternehmer ? 0 : 7
    const totalVat = effectiveVatRate > 0
      ? filteredBookings.reduce((s, b) => s + getBruttoWithoutCityTax(b, cityRules) * effectiveVatRate / (100 + effectiveVatRate), 0)
      : 0
    const totalNet = totalGross - totalVat
    const totalNights = filteredBookings.reduce((s, b) => s + (b.nights ?? 0), 0)
    const avgNights = totalNights / filteredBookings.length
    const adr = totalNights > 0 ? totalAccommodation / totalNights : 0

    // Occupancy: per-property nights / days in period, then average
    const r = getDateRange(timeRange, customMonth)
    const fromDate = parseISO(r.from)
    const toDate = parseISO(r.to)
    const daysInPeriod = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)

    // Group nights by property (from bookings)
    const nightsByProperty = new Map<string, number>()
    for (const b of filteredBookings) {
      const pid = b.property_id ?? 'unknown'
      nightsByProperty.set(pid, (nightsByProperty.get(pid) ?? 0) + (b.nights ?? 0))
    }

    // Determine which properties to include in occupancy calculation
    // - Specific property selected: just that one
    // - Tags selected: all properties matching those tags
    // - "Alle": all properties
    let relevantPropertyIds: string[]
    if (selectedPropertyId !== 'all') {
      relevantPropertyIds = [selectedPropertyId]
    } else if (selectedTags.length > 0) {
      relevantPropertyIds = properties
        .filter((p) => (p.tags ?? []).some((t) => selectedTags.includes(t)))
        .map((p) => p.id)
    } else {
      relevantPropertyIds = properties.map((p) => p.id)
    }

    // Include 0% for properties without bookings
    const totalPropertyCount = Math.max(1, relevantPropertyIds.length)
    const propertyOccupancies = relevantPropertyIds.map((pid) => {
      const nights = nightsByProperty.get(pid) ?? 0
      return Math.min(100, (nights / daysInPeriod) * 100)
    })
    const occupancy = propertyOccupancies.length > 0
      ? propertyOccupancies.reduce((s, v) => s + v, 0) / totalPropertyCount
      : 0
    const revpar = adr * (occupancy / 100)

    return {
      adr,
      revpar,
      occupancy,
      avgNights,
      totalGross,
      totalNet,
      totalVat,
      totalAuszahlung,
      totalAccommodation,
      totalCleaning,
      totalCommission,
      totalNights,
      bookingCount: filteredBookings.length,
    }
  }, [filteredBookings, timeRange, customMonth, properties, selectedPropertyId, selectedTags, cityRules, isKleinunternehmer])

  const vatRate = isKleinunternehmer ? 0 : 7

  // Monthly breakdown
  const monthlyData = useMemo(() => {
    const map = new Map<string, {
      bookings: number
      accommodation: number
      cleaning: number
      gross: number
      vat: number
      netVat: number
      commission: number
      tax: number
      net: number
      nights: number
      hasUnknownCommission: boolean
    }>()

    for (const b of filteredBookings) {
      const key = b.check_in.substring(0, 7)
      const existing = map.get(key) ?? { bookings: 0, accommodation: 0, cleaning: 0, gross: 0, vat: 0, netVat: 0, commission: 0, tax: 0, net: 0, nights: 0, hasUnknownCommission: false }
      const gross = getBruttoWithoutCityTax(b, cityRules)
      const clean = b.cleaning_fee ?? 0
      const accom = gross - clean
      const commissionUnknown = b.commission_amount === null
      const commission = b.commission_amount ?? 0
      const vatAmount = vatRate > 0 ? gross * vatRate / (100 + vatRate) : 0
      const taxConfig = b.properties ? getTaxConfigForProperty(b.properties, cityRules) : null
      const taxResult = taxConfig ? calculateAccommodationTax(b, taxConfig, b.properties?.ota_remits_tax ?? []) : null
      existing.bookings++
      existing.accommodation += accom
      existing.cleaning += clean
      existing.gross += gross
      existing.vat += vatAmount
      existing.netVat += gross - vatAmount
      existing.commission += commission
      existing.hasUnknownCommission = existing.hasUnknownCommission || commissionUnknown
      existing.tax += (taxResult?.isExempt ? 0 : taxResult?.taxAmount) ?? 0
      existing.net += gross - commission
      existing.nights += b.nights ?? 0
      map.set(key, existing)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        month: format(parseISO(key + '-01'), 'MMM yy', { locale: de }),
        monthKey: key,
        ...val,
      }))
  }, [filteredBookings, cityRules, vatRate])

  // Channel breakdown
  const channelData = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; commission: number; nights: number }>()
    for (const b of filteredBookings) {
      const ch = b.channel
      const existing = map.get(ch) ?? { count: 0, gross: 0, commission: 0, nights: 0 }
      existing.count++
      existing.gross += getBruttoWithoutCityTax(b, cityRules)
      existing.commission += b.commission_amount ?? 0
      existing.nights += b.nights ?? 0
      map.set(ch, existing)
    }
    return Array.from(map.entries())
      .map(([channel, val]) => ({ channel, ...val }))
      .sort((a, b) => b.gross - a.gross)
  }, [filteredBookings, cityRules])

  const channelChartConfig = useMemo(() => {
    const config: ChartConfig = {}
    for (const d of channelData) {
      config[d.channel] = { label: d.channel, color: CHANNEL_COLORS[d.channel] ?? 'hsl(0,0%,60%)' }
    }
    return config
  }, [channelData])

  // Per-property breakdown (for Monatsübersicht)
  const propertyData = useMemo(() => {
    const map = new Map<string, {
      name: string
      bookings: number
      nights: number
      gross: number
      commission: number
      net: number
    }>()

    for (const b of filteredBookings) {
      const propId = b.property_id ?? 'unknown'
      const propName = b.properties?.name ?? 'Unbekannt'
      const existing = map.get(propId) ?? { name: propName, bookings: 0, nights: 0, gross: 0, commission: 0, net: 0 }
      const gross = getBruttoWithoutCityTax(b, cityRules)
      const commission = b.commission_amount ?? 0
      existing.bookings++
      existing.nights += b.nights ?? 0
      existing.gross += gross
      existing.commission += commission
      existing.net += gross - commission
      map.set(propId, existing)
    }

    return Array.from(map.values()).sort((a, b) => b.gross - a.gross)
  }, [filteredBookings, cityRules])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Reporting</h2>
          <p className="text-sm text-muted-foreground">{range.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Property filter */}
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Alle Objekte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Objekte</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <SelectItem value="this_month">Dieser Monat</SelectItem>
              <SelectItem value="last_month">Letzter Monat</SelectItem>
              <SelectItem value="this_quarter">Dieses Quartal</SelectItem>
              <SelectItem value="this_year">Dieses Jahr</SelectItem>
              <SelectItem value="12_months">Letzte 12 Monate</SelectItem>
              <SelectItem value="last_year">Letztes Jahr</SelectItem>
              <SelectItem value="custom">Individuell</SelectItem>
            </SelectContent>
          </Select>
          {timeRange === 'custom' && (
            <Input
              type="month"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value)}
              className="w-[160px]"
            />
          )}
        </div>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Tags:</span>
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={selectedTags.includes(tag) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() =>
                setSelectedTags((prev) =>
                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                )
              }
            >
              {tag}
            </Badge>
          ))}
          {selectedTags.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedTags([])}>
              <X className="h-3 w-3 mr-1" />
              Zurücksetzen
            </Button>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-7 w-24" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{showNet ? 'Netto-Umsatz' : 'Brutto-Umsatz'}</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatEur(showNet ? (kpis?.totalNet ?? 0) : (kpis?.totalGross ?? 0))}</div>
                <p className="text-xs text-muted-foreground mt-1">{kpis?.bookingCount ?? 0} Buchungen · {kpis?.totalNights ?? 0} Nächte · Ø {(kpis?.avgNights ?? 0).toFixed(1)} Nächte</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">ADR (Ø Preis/Nacht)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatEur(kpis?.adr ?? 0)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Auslastung</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{(kpis?.occupancy ?? 0).toFixed(0)}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">RevPAR</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatEur(kpis?.revpar ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">ADR × Auslastung</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Monatsübersicht (for single-month views) */}
      {!loading && isSingleMonth && filteredBookings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monatsübersicht – {range.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-lg font-bold tabular-nums">{kpis?.bookingCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Buchungen</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{kpis?.totalNights ?? 0}</p>
                <p className="text-xs text-muted-foreground">Nächte</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{formatEur(kpis?.totalGross ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Brutto</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums text-emerald-600">{formatEur(kpis?.totalAuszahlung ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Auszahlung</p>
              </div>
            </div>

            {/* Per-property breakdown */}
            {propertyData.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Objekt</TableHead>
                      <TableHead className="text-center">Buchungen</TableHead>
                      <TableHead className="text-center">Nächte</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead className="text-right">Provision</TableHead>
                      <TableHead className="text-right">Auszahlung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propertyData.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-center">{p.bookings}</TableCell>
                        <TableCell className="text-center">{p.nights}</TableCell>
                        <TableCell className="text-right">{formatEur(p.gross)}</TableCell>
                        <TableCell className="text-right">{formatEur(p.commission)}</TableCell>
                        <TableCell className="text-right font-medium">{formatEur(p.net)}</TableCell>
                      </TableRow>
                    ))}
                    {propertyData.length > 1 && (
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Gesamt</TableCell>
                        <TableCell className="text-center">{kpis?.bookingCount ?? 0}</TableCell>
                        <TableCell className="text-center">{kpis?.totalNights ?? 0}</TableCell>
                        <TableCell className="text-right">{formatEur(kpis?.totalGross ?? 0)}</TableCell>
                        <TableCell className="text-right">{formatEur(kpis?.totalCommission ?? 0)}</TableCell>
                        <TableCell className="text-right">{formatEur(kpis?.totalAuszahlung ?? 0)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Per-channel breakdown */}
            {channelData.length > 1 && (
              <div className="flex flex-wrap gap-4">
                {channelData.map((c) => (
                  <div key={c.channel} className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[c.channel] ?? 'hsl(0,0%,60%)' }} />
                    <span className="text-muted-foreground">{c.channel}:</span>
                    <span className="font-medium">{c.count}× · {formatEur(c.gross)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Booking list */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gast</TableHead>
                    <TableHead>Objekt</TableHead>
                    <TableHead>Kanal</TableHead>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead className="text-center">Nächte</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    {!isKleinunternehmer && <TableHead className="text-right hidden md:table-cell">MwSt (7%)</TableHead>}
                    {!isKleinunternehmer && <TableHead className="text-right hidden md:table-cell">Netto</TableHead>}
                    <TableHead className="text-right">Provision</TableHead>
                    <TableHead className="text-right">Auszahlung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((b) => {
                    const gross = getBruttoWithoutCityTax(b, cityRules)
                    const vatAmount = vatRate > 0 ? gross * vatRate / (100 + vatRate) : 0
                    const commissionUnknown = b.commission_amount === null
                    const commission = b.commission_amount ?? 0
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          {[b.guest_firstname, b.guest_lastname].filter(Boolean).join(' ') || '–'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{b.properties?.name ?? '–'}</TableCell>
                        <TableCell className="text-muted-foreground">{b.channel}</TableCell>
                        <TableCell>
                          {format(new Date(b.check_in + 'T00:00:00'), 'dd.MM.', { locale: de })} –{' '}
                          {format(new Date(b.check_out + 'T00:00:00'), 'dd.MM.', { locale: de })}
                        </TableCell>
                        <TableCell className="text-center">{b.nights ?? 0}</TableCell>
                        <TableCell className="text-right">{formatEur(gross)}</TableCell>
                        {!isKleinunternehmer && <TableCell className="text-right hidden md:table-cell">{formatEur(vatAmount)}</TableCell>}
                        {!isKleinunternehmer && <TableCell className="text-right hidden md:table-cell">{formatEur(gross - vatAmount)}</TableCell>}
                        <TableCell className="text-right">
                          {commissionUnknown ? (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">unbekannt</Badge>
                          ) : formatEur(commission)}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatEur(gross - commission)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts (for multi-month views) */}
      {!isSingleMonth && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Monatsumsatz</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : (
                <ChartContainer config={barChartConfig} className="h-[250px] w-full">
                  <BarChart data={monthlyData} accessibilityLayer barCategoryGap="20%">
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
                    <Bar dataKey="gross" fill="var(--color-gross)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="net" fill="var(--color-net)" radius={[4, 4, 0, 0]} />
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
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-center gap-2">
                    <ChartContainer config={channelChartConfig} className="h-[180px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatEur(v as number)} />} />
                        <Pie data={channelData} dataKey="gross" nameKey="channel" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                          {channelData.map((e) => (
                            <Cell key={e.channel} fill={CHANNEL_COLORS[e.channel] ?? 'hsl(0,0%,60%)'} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </div>
                  {channelData.length > 0 && (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kanal</TableHead>
                            <TableHead className="text-center">Buchungen</TableHead>
                            <TableHead className="text-center">Nächte</TableHead>
                            <TableHead className="text-right">Brutto</TableHead>
                            <TableHead className="text-right">Provision</TableHead>
                            <TableHead className="text-right">Auszahlung</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {channelData.map((c) => (
                            <TableRow key={c.channel}>
                              <TableCell className="font-medium flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[c.channel] ?? 'hsl(0,0%,60%)' }} />
                                {c.channel}
                              </TableCell>
                              <TableCell className="text-center">{c.count}</TableCell>
                              <TableCell className="text-center">{c.nights}</TableCell>
                              <TableCell className="text-right">{formatEur(c.gross)}</TableCell>
                              <TableCell className="text-right">{formatEur(c.commission)}</TableCell>
                              <TableCell className="text-right font-medium">{formatEur(c.gross - c.commission)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly summary table (for multi-month views) */}
      {!isSingleMonth && !loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monatsübersicht</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Monat</TableHead>
                    <TableHead className="text-center">Buchungen</TableHead>
                    <TableHead className="text-center">Nächte</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Übernachtung</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Reinigung</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    {!isKleinunternehmer && <TableHead className="text-right hidden md:table-cell">MwSt (7%)</TableHead>}
                    {!isKleinunternehmer && <TableHead className="text-right hidden md:table-cell">Netto</TableHead>}
                    <TableHead className="text-right">Provision</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Beherb.-steuer</TableHead>
                    <TableHead className="text-right">Auszahlung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map((m) => (
                    <TableRow key={m.monthKey}>
                      <TableCell className="font-medium">{m.month}</TableCell>
                      <TableCell className="text-center">{m.bookings}</TableCell>
                      <TableCell className="text-center">{m.nights}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">{formatEur(m.accommodation)}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">{formatEur(m.cleaning)}</TableCell>
                      <TableCell className="text-right">{formatEur(m.gross)}</TableCell>
                      {!isKleinunternehmer && <TableCell className="text-right hidden md:table-cell">{formatEur(m.vat)}</TableCell>}
                      {!isKleinunternehmer && <TableCell className="text-right hidden md:table-cell">{formatEur(m.netVat)}</TableCell>}
                      <TableCell className="text-right">
                        {m.hasUnknownCommission ? (
                          <span className="flex items-center justify-end gap-1">
                            {formatEur(m.commission)}
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">?</Badge>
                          </span>
                        ) : formatEur(m.commission)}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">{formatEur(m.tax)}</TableCell>
                      <TableCell className="text-right font-medium">{formatEur(m.net)}</TableCell>
                    </TableRow>
                  ))}
                  {monthlyData.length > 0 && (
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Gesamt</TableCell>
                      <TableCell className="text-center">
                        {monthlyData.reduce((s, m) => s + m.bookings, 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        {monthlyData.reduce((s, m) => s + m.nights, 0)}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {formatEur(monthlyData.reduce((s, m) => s + m.accommodation, 0))}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {formatEur(monthlyData.reduce((s, m) => s + m.cleaning, 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEur(monthlyData.reduce((s, m) => s + m.gross, 0))}
                      </TableCell>
                      {!isKleinunternehmer && <TableCell className="text-right hidden md:table-cell">{formatEur(monthlyData.reduce((s, m) => s + m.vat, 0))}</TableCell>}
                      {!isKleinunternehmer && <TableCell className="text-right hidden md:table-cell">{formatEur(monthlyData.reduce((s, m) => s + m.netVat, 0))}</TableCell>}
                      <TableCell className="text-right">
                        {formatEur(monthlyData.reduce((s, m) => s + m.commission, 0))}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        {formatEur(monthlyData.reduce((s, m) => s + m.tax, 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEur(monthlyData.reduce((s, m) => s + m.net, 0))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && filteredBookings.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Keine Buchungen im gewählten Zeitraum ({range.label})</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

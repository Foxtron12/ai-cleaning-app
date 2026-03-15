'use client'

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { Download, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { calculateAccommodationTax, getTaxConfigForProperty, type TaxConfig, type TaxResult } from '@/lib/calculators/accommodation-tax'
import { getAccommodationGrossWithoutCityTax } from '@/lib/calculators/booking-price'
import type { Booking, Property, CityTaxRule, Settings } from '@/lib/types'
import { VordruckDialog } from '@/components/vordruck-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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

type BookingWithProp = Booking & { properties: Property | null }

interface TaxDataItem {
  booking: BookingWithProp
  tax: TaxResult
  config: TaxConfig | null
}

// --- Period helpers ---

const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const QUARTER_MONTH_LABELS: Record<number, string> = {
  1: 'Jan – Mär',
  2: 'Apr – Jun',
  3: 'Jul – Sep',
  4: 'Okt – Dez',
}

interface PeriodOption {
  value: string // e.g. '2026-03', '2026-Q1', '2026'
  label: string // e.g. 'März 2026', 'Q1 2026 (Jan – Mär)', 'Gesamtjahr 2026'
  group: 'month' | 'quarter' | 'year'
}

function generatePeriodOptions(): PeriodOption[] {
  const now = new Date()
  const options: PeriodOption[] = []

  // Months: current + 23 past months
  for (let i = 0; i < 24; i++) {
    const d = subMonths(now, i)
    const year = d.getFullYear()
    const month = d.getMonth() // 0-indexed
    const value = `${year}-${String(month + 1).padStart(2, '0')}`
    const label = `${MONTH_NAMES_DE[month]} ${year}`
    options.push({ value, label, group: 'month' })
  }

  // Quarters: current + 7 past quarters
  const currentQ = Math.floor(now.getMonth() / 3) + 1
  const currentYear = now.getFullYear()
  for (let i = 0; i < 8; i++) {
    let q = currentQ - i
    let y = currentYear
    while (q <= 0) { q += 4; y -= 1 }
    const value = `${y}-Q${q}`
    const label = `Q${q} ${y} (${QUARTER_MONTH_LABELS[q]})`
    options.push({ value, label, group: 'quarter' })
  }

  // Years: current + 2 past years
  for (let i = 0; i < 3; i++) {
    const y = currentYear - i
    options.push({ value: String(y), label: `Gesamtjahr ${y}`, group: 'year' })
  }

  return options
}

function getCurrentMonthPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function parsePeriod(period: string): { from: string; to: string; label: string } {
  // Year: '2026'
  if (/^\d{4}$/.test(period)) {
    const year = parseInt(period)
    return {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      label: `Gesamtjahr ${year}`,
    }
  }

  // Quarter: '2026-Q1'
  const qMatch = period.match(/^(\d{4})-Q([1-4])$/)
  if (qMatch) {
    const year = parseInt(qMatch[1])
    const q = parseInt(qMatch[2])
    const startMonth = (q - 1) * 3 // 0-indexed
    const qs = new Date(year, startMonth, 1)
    const qe = new Date(year, startMonth + 3, 0) // last day of quarter
    return {
      from: format(qs, 'yyyy-MM-dd'),
      to: format(qe, 'yyyy-MM-dd'),
      label: `Q${q} ${year} (${QUARTER_MONTH_LABELS[q]})`,
    }
  }

  // Month: '2026-03'
  const mMatch = period.match(/^(\d{4})-(\d{2})$/)
  if (mMatch) {
    const year = parseInt(mMatch[1])
    const month = parseInt(mMatch[2]) - 1 // 0-indexed
    const d = new Date(year, month, 1)
    return {
      from: format(startOfMonth(d), 'yyyy-MM-dd'),
      to: format(endOfMonth(d), 'yyyy-MM-dd'),
      label: `${MONTH_NAMES_DE[month]} ${year}`,
    }
  }

  // Fallback: current month
  return parsePeriod(getCurrentMonthPeriod())
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatModelLabel(model: string): string {
  switch (model) {
    case 'gross_percentage': return 'Brutto %'
    case 'net_percentage': return 'Netto %'
    case 'per_person_per_night': return 'Pro Person/Nacht'
    case 'per_room_per_night': return 'Pro Zimmer/Nacht'
    default: return model
  }
}

function formatRate(config: TaxConfig | null | undefined): string {
  if (!config) return '–'
  if (config.model === 'per_person_per_night' || config.model === 'per_room_per_night') {
    return `${config.rate.toFixed(2)} €`
  }
  return `${config.rate}%`
}

function computeSummary(items: TaxDataItem[]) {
  const otaRemitted = items.filter((d) => d.tax.remittedByOta)
  const selfRemit = items.filter((d) => !d.tax.remittedByOta)
  const business = selfRemit.filter((d) => d.tax.exemptReason === 'Befreit')
  const taxable = selfRemit.filter((d) => !d.tax.isExempt)

  const otaRemittedTax = otaRemitted.reduce((s, d) => s + d.tax.taxAmount, 0)
  const otaRemittedRevenue = otaRemitted.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0)
  const selfRemitTax = taxable.reduce((s, d) => s + d.tax.taxAmount, 0)

  return {
    totalNights: items.reduce((s, d) => s + (d.booking.nights ?? 0), 0),
    otaRemittedNights: otaRemitted.reduce((s, d) => s + (d.booking.nights ?? 0), 0),
    otaRemittedTax,
    otaRemittedRevenue,
    selfRemitRevenue: selfRemit.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0),
    businessNights: business.reduce((s, d) => s + (d.booking.nights ?? 0), 0),
    businessRevenue: business.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0),
    remainingNights: taxable.reduce((s, d) => s + (d.booking.nights ?? 0), 0),
    taxableRevenue: selfRemit.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0)
      - business.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0),
    selfRemitTax,
    totalTax: selfRemitTax + otaRemittedTax,
    bookingCount: items.length,
  }
}

// Splits a multi-month booking into per-calendar-month virtual segments.
// Each segment has proportionally scaled amounts. Only segments overlapping [rangeFrom, rangeTo] are returned.
function splitBookingByMonth(booking: BookingWithProp, rangeFrom: string, rangeTo: string): BookingWithProp[] {
  const checkIn = new Date(booking.check_in + 'T00:00:00')
  const checkOut = new Date(booking.check_out + 'T00:00:00')
  const totalNights = booking.nights ?? differenceInCalendarDays(checkOut, checkIn)
  if (totalNights <= 0) return [booking]

  // Single month: no split needed
  if (checkIn.getMonth() === checkOut.getMonth() && checkIn.getFullYear() === checkOut.getFullYear()) {
    return [booking]
  }

  const segments: BookingWithProp[] = []
  let current = startOfMonth(checkIn)

  while (current <= checkOut) {
    const segStart = checkIn > current ? checkIn : current

    // checkout is exclusive (day guest leaves), so nights = differenceInCalendarDays(min(checkout, nextMonthStart), segStart)
    const nextMonthStart = addMonths(current, 1)
    const segNightsActual = differenceInCalendarDays(checkOut < nextMonthStart ? checkOut : nextMonthStart, segStart)

    if (segNightsActual > 0) {
      const segCheckIn = format(segStart, 'yyyy-MM-dd')
      const segCheckOut = format(checkOut < nextMonthStart ? checkOut : nextMonthStart, 'yyyy-MM-dd')

      // Only include if overlaps with filter range
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
        })
      }
    }

    current = nextMonthStart
    if (checkOut <= nextMonthStart) break
  }

  return segments.length > 0 ? segments : [booking]
}

// Wrap main content in Suspense for useSearchParams
export default function SteuerPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    }>
      <SteuerPageContent />
    </Suspense>
  )
}

function SteuerPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [bookings, setBookings] = useState<BookingWithProp[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [cityRules, setCityRules] = useState<CityTaxRule[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCity, setSelectedCity] = useState<string>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Period from URL or default to current month
  const period = searchParams.get('period') ?? getCurrentMonthPeriod()
  const periodOptions = useMemo(() => generatePeriodOptions(), [])

  const setPeriod = useCallback((newPeriod: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', newPeriod)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const range = parsePeriod(period)

    const { data: { user } } = await supabase.auth.getUser()

    const [{ data: bookingData }, { data: propData }, { data: rulesData }, { data: settingsData }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, properties(*)')
        .neq('status', 'cancelled')
        .lte('check_in', range.to)
        .gte('check_out', range.from)
        .order('check_in', { ascending: true }),
      supabase.from('properties').select('*').order('name'),
      supabase.from('city_tax_rules').select('*').order('city'),
      user
        ? supabase.from('settings').select('*').eq('user_id', user.id).limit(1).single()
        : Promise.resolve({ data: null }),
    ])

    setBookings((bookingData ?? []) as BookingWithProp[])
    setProperties((propData ?? []) as Property[])
    setCityRules((rulesData ?? []) as CityTaxRule[])
    setSettings(settingsData as Settings | null)
    setLoading(false)
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  // All unique tags across properties
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    properties.forEach((p) => (p.tags ?? []).forEach((t) => tags.add(t)))
    return Array.from(tags).sort()
  }, [properties])

  // All unique cities across properties (for dropdown)
  const allCities = useMemo(() => {
    const citySet = new Set<string>()
    for (const prop of properties) {
      const config = getTaxConfigForProperty(prop, cityRules)
      const city = config?.city ?? prop.city ?? ''
      if (city) citySet.add(city)
    }
    return Array.from(citySet).sort()
  }, [properties, cityRules])

  // Filter bookings by city/tag
  const filteredBookings = useMemo(() => {
    let result = bookings
    if (selectedCity !== 'all') {
      result = result.filter((b) => {
        const config = b.properties ? getTaxConfigForProperty(b.properties, cityRules) : null
        const city = config?.city ?? b.properties?.city ?? 'Unbekannt'
        return city === selectedCity
      })
    }
    if (selectedTags.length > 0) {
      const tagPropIds = properties
        .filter((p) => (p.tags ?? []).some((t) => selectedTags.includes(t)))
        .map((p) => p.id)
      result = result.filter((b) => tagPropIds.includes(b.property_id ?? ''))
    }
    return result
  }, [bookings, selectedCity, selectedTags, properties, cityRules])

  // Calculate tax per booking using per-property config, splitting multi-month bookings
  const taxData = useMemo<TaxDataItem[]>(() => {
    const range = parsePeriod(period)
    return filteredBookings.flatMap((booking) => {
      const config = booking.properties
        ? getTaxConfigForProperty(booking.properties, cityRules)
        : null
      const segments = splitBookingByMonth(booking, range.from, range.to)
      return segments.map((seg) => {
        const tax = config
          ? calculateAccommodationTax(seg, config, booking.properties?.ota_remits_tax ?? [])
          : { taxableAmount: 0, taxAmount: 0, isExempt: true, exemptReason: 'Keine Beherbergungssteuer', remittedByOta: false } as TaxResult
        return { booking: seg, tax, config }
      })
    })
  }, [filteredBookings, cityRules, period])

  // Group by property for "Alle" view - include properties without bookings
  const groupedByProperty = useMemo(() => {
    const groups = new Map<string, { property: Property | null; items: TaxDataItem[] }>()

    // Seed with all relevant properties (respecting tag filter)
    const relevantProperties = selectedTags.length > 0
      ? properties.filter((p) => (p.tags ?? []).some((t) => selectedTags.includes(t)))
      : properties
    for (const prop of relevantProperties) {
      groups.set(prop.id, { property: prop, items: [] })
    }

    // Add booking data
    for (const item of taxData) {
      const propId = item.booking.property_id ?? 'unknown'
      if (!groups.has(propId)) {
        groups.set(propId, { property: item.booking.properties, items: [] })
      }
      groups.get(propId)!.items.push(item)
    }

    return Array.from(groups.values())
  }, [taxData, properties, selectedTags])

  // Group by city for "Alle" view
  const groupedByCity = useMemo(() => {
    const cityMap = new Map<string, { city: string; config: TaxConfig | null; properties: typeof groupedByProperty; items: TaxDataItem[] }>()

    for (const group of groupedByProperty) {
      const config = group.property
        ? getTaxConfigForProperty(group.property, cityRules)
        : null
      const city = config?.city ?? group.property?.city ?? 'Unbekannt'

      if (!cityMap.has(city)) {
        cityMap.set(city, { city, config, properties: [], items: [] })
      }
      const cityGroup = cityMap.get(city)!
      cityGroup.properties.push(group)
      cityGroup.items.push(...group.items)
    }

    return Array.from(cityMap.values()).sort((a, b) => a.city.localeCompare(b.city))
  }, [groupedByProperty, cityRules])

  const totalSummary = useMemo(() => computeSummary(taxData), [taxData])

  // --- Business travel toggle ---
  async function toggleBusinessTravel(bookingId: string, isBusiness: boolean) {
    const newPurpose = isBusiness ? 'business' : 'unknown'
    const { error } = await supabase.from('bookings').update({ trip_purpose: newPurpose }).eq('id', bookingId)
    if (error) {
      toast.error('Fehler beim Speichern des Befreiungsstatus')
      return
    }
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, trip_purpose: newPurpose } : b))
    )
    toast.success(isBusiness ? 'Als Geschaeftsreise markiert' : 'Befreiung aufgehoben')
  }


  // --- XLSX Export (AC-3: enhanced with OTA/self columns) ---
  function exportXLSX() {
    const range = parsePeriod(period)
    const headers = [
      'Objekt', 'Gast', 'Kanal', 'Check-in', 'Check-out', 'Nächte',
      'Umsatz (ohne City Tax)', 'Steuersatz', 'Steuerbetrag',
      'Selbst abzuführen (EUR)', 'Von OTA abgeführt (EUR)',
      'Befreiungsgrund',
    ]
    const rows = taxData.map((d) => {
      const taxAmount = d.tax.taxAmount
      const isExempt = d.tax.isExempt
      const remittedByOta = d.tax.remittedByOta
      const otaName = d.tax.remittedByOtaName ?? 'OTA'

      let selfAmount = 0
      let otaAmountVal = 0
      let otaLabel = ''

      if (!isExempt && !remittedByOta) {
        selfAmount = taxAmount
      } else if (remittedByOta) {
        otaAmountVal = taxAmount
        otaLabel = ` (${otaName})`
      }

      return [
        d.booking.properties?.name ?? '–',
        [d.booking.guest_firstname, d.booking.guest_lastname].filter(Boolean).join(' '),
        d.booking.channel,
        d.booking.check_in,
        d.booking.check_out,
        d.booking.nights ?? 0,
        getAccommodationGrossWithoutCityTax(d.booking),
        formatRate(d.config),
        taxAmount,
        selfAmount,
        otaAmountVal > 0 ? `${otaAmountVal.toFixed(2)}${otaLabel}` : 0,
        isExempt ? d.tax.exemptReason ?? 'Befreit' : '',
      ]
    })

    // Summary per property
    const summaryRows: (string | number)[][] = [[], ['Beherbergungssteuer-Übersicht'], ['Zeitraum', range.label]]
    for (const group of groupedByProperty) {
      const s = computeSummary(group.items)
      const config = group.property
        ? getTaxConfigForProperty(group.property, cityRules)
        : null
      summaryRows.push(
        [],
        ['Objekt', group.property?.name ?? 'Unbekannt'],
        ['Stadt', config?.city ?? '–'],
        ['Steuersatz', formatRate(config)],
        ['1. Entgeltliche Übernachtungen', s.totalNights],
        ['2. abzgl. Von OTA abgeführt', `${s.otaRemittedNights} Nächte / ${s.otaRemittedRevenue.toFixed(2)} EUR`],
        ['3. Umsätze verbleibend', s.selfRemitRevenue],
        ['4. abzgl. steuerbefreite Übernachtungen', `${s.businessNights} Nächte / ${s.businessRevenue.toFixed(2)} EUR`],
        ['5. Verbleibende Übernachtungen', s.remainingNights],
        ['6. Steuerpflichtige Umsätze', s.taxableRevenue],
        ['7. Selbst abzuführen', s.selfRemitTax],
      )
    }
    summaryRows.push(
      [],
      ['GESAMT Steuerbetrag', totalSummary.totalTax],
      ['GESAMT selbst abzuführen', totalSummary.selfRemitTax],
      ['GESAMT von OTA abgeführt', totalSummary.otaRemittedTax],
    )

    // Build workbook with two sheets
    const wb = XLSX.utils.book_new()

    // Sheet 1: Buchungen
    const wsData = [headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
      { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Buchungen')

    // Sheet 2: Zusammenfassung
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [{ wch: 40 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Zusammenfassung')

    XLSX.writeFile(wb, `beherbergungssteuer-${range.from}-${range.to}.xlsx`)
  }

  const range = parsePeriod(period)

  // Find the label for the currently selected period
  const currentPeriodLabel = periodOptions.find((o) => o.value === period)?.label ?? range.label

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Beherbergungssteuer</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* City filter */}
          <Select value={selectedCity} onValueChange={setSelectedCity}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Alle Städte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Städte</SelectItem>
              {allCities.map((city) => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Period selector (AC-2: month names, quarters, years) */}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[220px]" aria-label="Zeitraum auswählen">
              <SelectValue>{currentPeriodLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Einzelne Monate</SelectLabel>
                {periodOptions
                  .filter((o) => o.group === 'month')
                  .map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Quartale</SelectLabel>
                {periodOptions
                  .filter((o) => o.group === 'quarter')
                  .map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Jahre</SelectLabel>
                {periodOptions
                  .filter((o) => o.group === 'year')
                  .map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportXLSX}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
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

      {/* Tax summaries */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : selectedCity !== 'all' ? (
        // Single city view
        <SingleCitySummary
          taxData={taxData}
          range={range}
          city={selectedCity}
          config={groupedByCity.find((g) => g.city === selectedCity)?.config ?? null}
          bookings={bookings}
          cityRules={cityRules}
          properties={properties}
          settings={settings}
        />
      ) : (
        // Grouped view: Gesamtübersicht -> per city -> per property
        <>
          {/* Gesamtübersicht - 4 KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border-2 border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold tabular-nums text-emerald-700">{formatEur(totalSummary.selfRemitTax)}</p>
                <p className="text-xs text-muted-foreground mt-1">Selbst abzuführen</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold tabular-nums">{formatEur(totalSummary.otaRemittedTax)}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  Von OTA abgeführt
                  <Badge variant="outline" className="border-rose-300 text-rose-600 text-[10px] px-1 py-0">OTA</Badge>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold tabular-nums">{totalSummary.businessNights}</p>
                <p className="text-xs text-muted-foreground mt-1">Steuerbefreite Nächte</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold tabular-nums">{formatEur(totalSummary.totalTax)}</p>
                <p className="text-xs text-muted-foreground mt-1">Gesamt-Steueraufkommen</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-city sections */}
          {groupedByCity.map((cityGroup) => {
            const citySummary = computeSummary(cityGroup.items)
            return (
              <div key={cityGroup.city} className="space-y-3">
                {/* City header */}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{cityGroup.city}</h3>
                    <span className="text-sm text-muted-foreground">
                      · {formatRate(cityGroup.config)} · {formatModelLabel(cityGroup.config?.model ?? 'gross_percentage')}
                    </span>
                  </div>
                  {(cityGroup.city.toLowerCase() === 'dresden' || cityGroup.city.toLowerCase() === 'chemnitz') && (
                    <VordruckDialog
                      city={cityGroup.city}
                      bookings={bookings}
                      cityRules={cityRules}
                      properties={properties}
                      settings={settings}
                    />
                  )}
                </div>

                {/* City detail summary (always shown in Alle-view) */}
                <Card className="border-dashed">
                  <CardHeader className="pb-2 pt-4">
                    <p className="text-xs text-muted-foreground">
                      {cityGroup.properties.length} Objekt{cityGroup.properties.length !== 1 ? 'e' : ''} · {citySummary.bookingCount} Buchungen
                    </p>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <DetailSummary summary={citySummary} config={cityGroup.config} />
                  </CardContent>
                </Card>

              </div>
            )
          })}
        </>
      )}

      {/* Booking table(s) */}
      {!loading && taxData.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground py-8 text-center">
              Keine Buchungen im gewählten Zeitraum
            </p>
          </CardContent>
        </Card>
      )}
      {!loading && taxData.length > 0 && (
        selectedCity === 'all' ? (
          // Per-city booking tables
          <div className="space-y-4">
            {groupedByCity.filter((g) => g.items.length > 0).map((cityGroup) => {
              const citySummaryForTable = computeSummary(cityGroup.items)
              return (
                <Card key={cityGroup.city}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Buchungen – {cityGroup.city}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BookingTable
                      items={cityGroup.items}
                      showProperty
                      summary={citySummaryForTable}
                      onToggleExempt={toggleBusinessTravel}
                    />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          // Single city table
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Buchungen im Zeitraum</CardTitle>
            </CardHeader>
            <CardContent>
              <BookingTable
                items={taxData}
                showProperty={false}
                summary={totalSummary}
                onToggleExempt={toggleBusinessTravel}
              />
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}

// --- Sub-components ---

function DetailSummary({ summary, config }: { summary: ReturnType<typeof computeSummary>; config: TaxConfig | null | undefined }) {
  return (
    <div className="space-y-1">
      <SummaryLine label="1. Anzahl entgeltlicher Übernachtungen insgesamt" value={`${summary.totalNights} Nächte`} />
      <SummaryLine label="2. abzgl. von OTA abgeführt" value={`– ${summary.otaRemittedNights} Nächte / ${formatEur(summary.otaRemittedRevenue)}`} className="text-rose-600" />
      <SummaryLine label="3. Umsätze aus verbleibenden Übernachtungen" value={formatEur(summary.selfRemitRevenue)} />
      <SummaryLine label="4. abzgl. beherbergungssteuerbefreite Übernachtungen" value={`– ${summary.businessNights} Nächte / ${formatEur(summary.businessRevenue)}`} className="text-blue-600" />
      <SummaryLine label="5. verbleibende Anzahl entgeltlicher Übernachtungen" value={`${summary.remainingNights} Nächte`} />
      <SummaryLine label="6. verbleibende steuerpflichtige Umsätze" value={formatEur(summary.taxableRevenue)} />
      <div className="flex justify-between py-3 bg-emerald-50 rounded px-2 mt-2">
        <span className="text-sm font-bold">7. Selbst abzuführen ({formatRate(config)})</span>
        <span className="text-lg font-bold tabular-nums text-emerald-700">{formatEur(summary.selfRemitTax)}</span>
      </div>
    </div>
  )
}

function SingleCitySummary({
  taxData,
  range,
  city,
  config,
  bookings,
  cityRules,
  properties,
  settings,
}: {
  taxData: TaxDataItem[]
  range: { label: string }
  city: string
  config: TaxConfig | null
  bookings: BookingWithProp[]
  cityRules: CityTaxRule[]
  properties: Property[]
  settings: Settings | null
}) {
  const summary = computeSummary(taxData)
  const showVordruck = city.toLowerCase() === 'dresden' || city.toLowerCase() === 'chemnitz'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              {city} – {range.label}
            </CardTitle>
            {config && (
              <p className="text-sm text-muted-foreground">
                {formatRate(config)} · {formatModelLabel(config.model)}
              </p>
            )}
          </div>
          {showVordruck && (
            <VordruckDialog
              city={city}
              bookings={bookings}
              cityRules={cityRules}
              properties={properties}
              settings={settings}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <DetailSummary summary={summary} config={config} />
      </CardContent>
    </Card>
  )
}

function SummaryLine({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between py-2 border-b ${className ?? ''}`}>
      <span className="text-sm">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}


function BookingTable({
  items,
  showProperty,
  summary,
  onToggleExempt,
}: {
  items: TaxDataItem[]
  showProperty: boolean
  summary: ReturnType<typeof computeSummary>
  onToggleExempt: (bookingId: string, isExempt: boolean) => void
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showProperty && <TableHead>Objekt</TableHead>}
            <TableHead>Gast</TableHead>
            <TableHead>Kanal</TableHead>
            <TableHead>Zeitraum</TableHead>
            <TableHead className="text-center">Nächte</TableHead>
            <TableHead className="text-right">Umsatz</TableHead>
            <TableHead className="text-right">Steuer</TableHead>
            <TableHead className="text-center">Befreit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(({ booking, tax }, idx) => (
            <TableRow key={`${booking.id}-${booking.check_in}-${idx}`} className={tax.isExempt ? 'opacity-60' : ''}>
              {showProperty && (
                <TableCell className="text-sm text-muted-foreground">
                  {booking.properties?.name ?? '–'}
                </TableCell>
              )}
              <TableCell className="font-medium">
                {[booking.guest_firstname, booking.guest_lastname].filter(Boolean).join(' ') || '–'}
              </TableCell>
              <TableCell className="text-muted-foreground">{booking.channel}</TableCell>
              <TableCell>
                {format(new Date(booking.check_in + 'T00:00:00'), 'dd.MM.', { locale: de })} –{' '}
                {format(new Date(booking.check_out + 'T00:00:00'), 'dd.MM.yy', { locale: de })}
              </TableCell>
              <TableCell className="text-center">{booking.nights ?? 0}</TableCell>
              <TableCell className="text-right">{formatEur(getAccommodationGrossWithoutCityTax(booking))}</TableCell>
              <TableCell className="text-right">
                {tax.remittedByOta ? (
                  <Badge variant="outline" className="border-rose-300 text-rose-600">
                    {tax.remittedByOtaName ?? 'OTA'} führt ab
                  </Badge>
                ) : tax.isExempt ? (
                  <Badge variant="outline" className="border-blue-300 text-blue-600">
                    {tax.exemptReason}
                  </Badge>
                ) : (
                  formatEur(tax.taxAmount)
                )}
              </TableCell>
              <TableCell className="text-center">
                {!tax.remittedByOta && (
                  <Checkbox
                    checked={booking.trip_purpose === 'business'}
                    onCheckedChange={(checked) =>
                      onToggleExempt(booking.id, checked === true)
                    }
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="font-bold bg-muted/50">
            <TableCell colSpan={showProperty ? 4 : 3}>Gesamt (steuerpflichtig)</TableCell>
            <TableCell className="text-center">{summary.remainingNights}</TableCell>
            <TableCell className="text-right">{formatEur(summary.taxableRevenue)}</TableCell>
            <TableCell className="text-right">{formatEur(summary.selfRemitTax)}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import { Download, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calculateAccommodationTax, getTaxConfigForProperty, type TaxConfig, type TaxResult } from '@/lib/calculators/accommodation-tax'
import { getAccommodationGrossWithoutCityTax } from '@/lib/calculators/booking-price'
import type { Booking, Property, CityTaxRule } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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

type BookingWithProp = Booking & { properties: Property | null }

type TimeRange = 'this_month' | 'last_month' | 'this_quarter' | 'this_year'

interface TaxDataItem {
  booking: BookingWithProp
  tax: TaxResult
  config: TaxConfig | null
}

function getDateRange(range: TimeRange): { from: string; to: string; label: string } {
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
  }
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
  const business = selfRemit.filter((d) => d.tax.exemptReason === 'Geschäftsreise')
  const taxable = selfRemit.filter((d) => !d.tax.isExempt)

  const otaRemittedTax = otaRemitted.reduce((s, d) => s + d.tax.taxAmount, 0)
  const selfRemitTax = taxable.reduce((s, d) => s + d.tax.taxAmount, 0)

  return {
    totalNights: items.reduce((s, d) => s + (d.booking.nights ?? 0), 0),
    otaRemittedNights: otaRemitted.reduce((s, d) => s + (d.booking.nights ?? 0), 0),
    otaRemittedTax,
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

export default function SteuerPage() {
  const [bookings, setBookings] = useState<BookingWithProp[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [cityRules, setCityRules] = useState<CityTaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('this_quarter')
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Tag editor state
  const [tagPropertyId, setTagPropertyId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const range = getDateRange(timeRange)

    const [{ data: bookingData }, { data: propData }, { data: rulesData }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, properties(*)')
        .neq('status', 'cancelled')
        .gte('check_in', range.from)
        .lte('check_in', range.to)
        .order('check_in', { ascending: true }),
      supabase.from('properties').select('*').order('name'),
      supabase.from('city_tax_rules').select('*').order('city'),
    ])

    setBookings((bookingData ?? []) as BookingWithProp[])
    setProperties((propData ?? []) as Property[])
    setCityRules((rulesData ?? []) as CityTaxRule[])
    setLoading(false)
  }, [timeRange])

  useEffect(() => { fetchData() }, [fetchData])

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

  // Calculate tax per booking using per-property config
  const taxData = useMemo<TaxDataItem[]>(() => {
    return filteredBookings.map((booking) => {
      const config = booking.properties
        ? getTaxConfigForProperty(booking.properties, cityRules)
        : null
      const tax = config
        ? calculateAccommodationTax(booking, config, booking.properties?.ota_remits_tax ?? [])
        : { taxableAmount: 0, taxAmount: 0, isExempt: true, exemptReason: 'Keine Beherbergungssteuer', remittedByOta: false } as TaxResult
      return { booking, tax, config }
    })
  }, [filteredBookings, cityRules])

  // Group by property for "Alle" view – include properties without bookings
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
    await supabase.from('bookings').update({ trip_purpose: newPurpose }).eq('id', bookingId)
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, trip_purpose: newPurpose } : b))
    )
  }

  // --- Tag management ---
  async function addTag(propertyId: string, tag: string) {
    const trimmed = tag.trim()
    if (!trimmed) return
    const prop = properties.find((p) => p.id === propertyId)
    if (!prop) return
    const newTags = [...new Set([...(prop.tags ?? []), trimmed])]
    await supabase.from('properties').update({ tags: newTags }).eq('id', propertyId)
    setProperties((prev) => prev.map((p) => (p.id === propertyId ? { ...p, tags: newTags } : p)))
    setTagInput('')
  }

  async function removeTag(propertyId: string, tag: string) {
    const prop = properties.find((p) => p.id === propertyId)
    if (!prop) return
    const newTags = (prop.tags ?? []).filter((t) => t !== tag)
    await supabase.from('properties').update({ tags: newTags }).eq('id', propertyId)
    setProperties((prev) => prev.map((p) => (p.id === propertyId ? { ...p, tags: newTags } : p)))
  }

  // --- CSV Export ---
  function exportCSV() {
    const range = getDateRange(timeRange)
    const headers = [
      'Objekt', 'Gast', 'Kanal', 'Check-in', 'Check-out', 'Nächte',
      'Umsatz (ohne City Tax)', 'Steuersatz', 'Steuerbetrag', 'Befreiungsgrund',
    ]
    const rows = taxData.map((d) => [
      d.booking.properties?.name ?? '–',
      [d.booking.guest_firstname, d.booking.guest_lastname].filter(Boolean).join(' '),
      d.booking.channel,
      d.booking.check_in,
      d.booking.check_out,
      d.booking.nights ?? 0,
      getAccommodationGrossWithoutCityTax(d.booking).toFixed(2),
      formatRate(d.config),
      d.tax.taxAmount.toFixed(2),
      d.tax.isExempt ? d.tax.exemptReason ?? 'Befreit' : '',
    ])

    // Summary per property
    const summarySection: (string | number)[][] = [[], ['Beherbergungssteuer-Übersicht'], ['Zeitraum', range.label]]
    for (const group of groupedByProperty) {
      const s = computeSummary(group.items)
      const config = group.property
        ? getTaxConfigForProperty(group.property, cityRules)
        : null
      summarySection.push(
        [],
        ['Objekt', group.property?.name ?? 'Unbekannt'],
        ['Stadt', config?.city ?? '–'],
        ['Steuersatz', formatRate(config)],
        ['1. Entgeltliche Übernachtungen', s.totalNights],
        ['2. abzgl. Von OTA abgeführt', `${s.otaRemittedNights} Nächte / ${s.otaRemittedTax.toFixed(2)} EUR`],
        ['3. Umsätze verbleibend', s.selfRemitRevenue.toFixed(2)],
        ['4. abzgl. Geschäftsreisen', `${s.businessNights} Nächte / ${s.businessRevenue.toFixed(2)} EUR`],
        ['5. Verbleibende Übernachtungen', s.remainingNights],
        ['6. Steuerpflichtige Umsätze', s.taxableRevenue.toFixed(2)],
        ['7. Selbst abzuführen', s.selfRemitTax.toFixed(2)],
      )
    }
    summarySection.push(
      [],
      ['GESAMT selbst abzuführen', totalSummary.selfRemitTax.toFixed(2)],
      ['GESAMT von OTA abgeführt', totalSummary.otaRemittedTax.toFixed(2)],
      ['GESAMT Steueraufkommen', totalSummary.totalTax.toFixed(2)],
    )

    const csv = [...[headers], ...rows, ...summarySection]
      .map((r) => r.map((c) => `"${c}"`).join(';'))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `beherbergungssteuer-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const range = getDateRange(timeRange)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Beherbergungssteuer</h2>
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
          {/* Time range */}
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">Dieser Monat</SelectItem>
              <SelectItem value="last_month">Letzter Monat</SelectItem>
              <SelectItem value="this_quarter">Dieses Quartal</SelectItem>
              <SelectItem value="this_year">Dieses Jahr</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
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
      ) : selectedPropertyId !== 'all' ? (
        // Single property view
        <SinglePropertySummary
          taxData={taxData}
          range={range}
          cityRules={cityRules}
          property={properties.find((p) => p.id === selectedPropertyId) ?? null}
        />
      ) : (
        // Grouped view: Gesamtübersicht → per city → per property
        <>
          {/* Gesamtübersicht – 4 KPI Cards */}
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
                <div className="flex items-center gap-2 pt-2">
                  <h3 className="text-lg font-semibold">{cityGroup.city}</h3>
                  <span className="text-sm text-muted-foreground">
                    · {formatRate(cityGroup.config)} · {formatModelLabel(cityGroup.config?.model ?? 'gross_percentage')}
                  </span>
                </div>

                {/* City summary (if multiple properties in this city) */}
                {cityGroup.properties.length > 1 && (
                  <Card className="border-dashed">
                    <CardContent className="pt-4 pb-3">
                      <CompactSummary summary={citySummary} config={cityGroup.config} />
                    </CardContent>
                  </Card>
                )}

                {/* Per-property cards within this city */}
                {cityGroup.properties.map((group, idx) => {
                  const summary = computeSummary(group.items)
                  return (
                    <Card key={idx}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{group.property?.name ?? 'Unbekannt'}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {group.property?.street ? `${group.property.street}, ` : ''}
                              {group.property?.zip ? `${group.property.zip} ` : ''}
                              {cityGroup.city} · {summary.bookingCount} Buchungen
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {(group.property?.tags ?? []).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                                <button
                                  className="ml-1 hover:text-destructive"
                                  onClick={() => group.property && removeTag(group.property.id, tag)}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </Badge>
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs"
                              onClick={() => {
                                setTagPropertyId(group.property?.id ?? null)
                                setTagInput('')
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            {tagPropertyId === group.property?.id && (
                              <form
                                className="flex items-center gap-1"
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  if (group.property) addTag(group.property.id, tagInput)
                                  setTagPropertyId(null)
                                }}
                              >
                                <Input
                                  autoFocus
                                  className="h-6 w-24 text-xs"
                                  value={tagInput}
                                  onChange={(e) => setTagInput(e.target.value)}
                                  placeholder="Tag..."
                                  onBlur={() => setTagPropertyId(null)}
                                />
                              </form>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CompactSummary summary={summary} config={cityGroup.config} />
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )
          })}
        </>
      )}

      {/* Booking table */}
      {!loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Buchungen im Zeitraum</CardTitle>
          </CardHeader>
          <CardContent>
            {taxData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Keine Buchungen im gewählten Zeitraum
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectedPropertyId === 'all' && <TableHead>Objekt</TableHead>}
                      <TableHead>Gast</TableHead>
                      <TableHead>Kanal</TableHead>
                      <TableHead>Zeitraum</TableHead>
                      <TableHead className="text-center">Nächte</TableHead>
                      <TableHead className="text-right">Umsatz</TableHead>
                      <TableHead className="text-right">Steuer</TableHead>
                      <TableHead className="text-center">Geschäftsreise</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxData.map(({ booking, tax }) => (
                      <TableRow key={booking.id} className={tax.isExempt ? 'opacity-60' : ''}>
                        {selectedPropertyId === 'all' && (
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
                                toggleBusinessTravel(booking.id, checked === true)
                              }
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell colSpan={selectedPropertyId === 'all' ? 4 : 3}>Gesamt (steuerpflichtig)</TableCell>
                      <TableCell className="text-center">{totalSummary.remainingNights}</TableCell>
                      <TableCell className="text-right">{formatEur(totalSummary.taxableRevenue)}</TableCell>
                      <TableCell className="text-right">{formatEur(totalSummary.selfRemitTax)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- Sub-components ---

function SinglePropertySummary({
  taxData,
  range,
  cityRules,
  property,
}: {
  taxData: TaxDataItem[]
  range: { label: string }
  cityRules: CityTaxRule[]
  property: Property | null
}) {
  const config = property ? getTaxConfigForProperty(property, cityRules) : null
  const summary = computeSummary(taxData)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {property?.name ?? 'Unbekannt'} – {range.label}
        </CardTitle>
        {config && (
          <p className="text-sm text-muted-foreground">
            {config.city} · {formatRate(config)} ·{' '}
            {formatModelLabel(config.model)}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <SummaryLine label="1. Anzahl entgeltlicher Übernachtungen insgesamt" value={`${summary.totalNights} Nächte`} />
          <SummaryLine label="2. abzgl. von OTA abgeführt" value={`– ${summary.otaRemittedNights} Nächte / ${formatEur(summary.otaRemittedTax)}`} className="text-rose-600" />
          <SummaryLine label="3. Umsätze aus verbleibenden Übernachtungen" value={formatEur(summary.selfRemitRevenue)} />
          <SummaryLine label="4. abzgl. beherbergungssteuerbefreite Übernachtungen (Geschäftsreisen)" value={`– ${summary.businessNights} Nächte / ${formatEur(summary.businessRevenue)}`} className="text-blue-600" />
          <SummaryLine label="5. verbleibende Anzahl entgeltlicher Übernachtungen" value={`${summary.remainingNights} Nächte`} />
          <SummaryLine label="6. verbleibende steuerpflichtige Umsätze" value={formatEur(summary.taxableRevenue)} />
          <div className="flex justify-between py-3 bg-emerald-50 rounded px-2 mt-2">
            <span className="text-sm font-bold">7. Selbst abzuführen ({formatRate(config)})</span>
            <span className="text-lg font-bold tabular-nums text-emerald-700">{formatEur(summary.selfRemitTax)}</span>
          </div>
        </div>
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

function CompactSummary({ summary, config }: { summary: ReturnType<typeof computeSummary>; config: TaxConfig | null | undefined }) {
  return (
    <div className="grid grid-cols-4 gap-4 text-center">
      <div>
        <p className="text-lg font-bold tabular-nums text-emerald-700">{formatEur(summary.selfRemitTax)}</p>
        <p className="text-xs text-muted-foreground">Selbst abzuführen</p>
      </div>
      <div>
        <p className="text-lg font-bold tabular-nums">{formatEur(summary.otaRemittedTax)}</p>
        <p className="text-xs text-muted-foreground">Von OTA abgeführt</p>
      </div>
      <div>
        <p className="text-lg font-bold tabular-nums">{summary.businessNights}</p>
        <p className="text-xs text-muted-foreground">Steuerbefreit</p>
      </div>
      <div>
        <p className="text-lg font-bold tabular-nums">{formatEur(summary.totalTax)}</p>
        <p className="text-xs text-muted-foreground">Gesamt ({formatRate(config)})</p>
      </div>
    </div>
  )
}

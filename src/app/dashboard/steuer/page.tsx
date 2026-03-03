'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calculateAccommodationTax, type TaxConfig } from '@/lib/calculators/accommodation-tax'
import { getAccommodationGrossWithoutCityTax } from '@/lib/calculators/booking-price'
import type { Booking, Property } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

type BookingWithProp = Booking & { properties: Property | null }

type TimeRange = 'this_month' | 'last_month' | 'this_quarter' | 'this_year'

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

export default function SteuerPage() {
  const [bookings, setBookings] = useState<BookingWithProp[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('this_quarter')
  const [taxConfig, setTaxConfig] = useState<TaxConfig>({
    model: 'gross_percentage',
    rate: 6,
    city: 'Dresden',
  })

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const range = getDateRange(timeRange)

      // Fetch bookings in range
      const { data } = await supabase
        .from('bookings')
        .select('*, properties(*)')
        .neq('status', 'cancelled')
        .gte('check_in', range.from)
        .lte('check_in', range.to)
        .order('check_in', { ascending: true })

      // Fetch tax config from first property (or settings)
      const { data: props } = await supabase
        .from('properties')
        .select('accommodation_tax_model, accommodation_tax_rate, accommodation_tax_city')
        .limit(1)
        .single()

      if (props?.accommodation_tax_model) {
        setTaxConfig({
          model: props.accommodation_tax_model as TaxConfig['model'],
          rate: props.accommodation_tax_rate ?? 6,
          city: props.accommodation_tax_city ?? 'Dresden',
        })
      }

      setBookings((data ?? []) as BookingWithProp[])
      setLoading(false)
    }
    fetchData()
  }, [timeRange])

  // Calculate tax for each booking
  const taxData = useMemo(() => {
    return bookings.map((booking) => {
      const result = calculateAccommodationTax(booking, taxConfig)
      return { booking, tax: result }
    })
  }, [bookings, taxConfig])

  // Dresden Melde-format: 7 official line items
  const melde = useMemo(() => {
    const allBookings = taxData
    const airbnbBookings = taxData.filter((d) => d.tax.exemptReason === 'Airbnb führt ab')
    const nonAirbnb = taxData.filter((d) => d.tax.exemptReason !== 'Airbnb führt ab')
    const businessNonAirbnb = nonAirbnb.filter((d) => d.tax.exemptReason === 'Geschäftsreise')
    const taxable = nonAirbnb.filter((d) => !d.tax.isExempt)

    // 1. Total paid nights
    const totalNights = allBookings.reduce((s, d) => s + (d.booking.nights ?? 0), 0)
    // 2. Airbnb nights
    const airbnbNights = airbnbBookings.reduce((s, d) => s + (d.booking.nights ?? 0), 0)
    // 3. Revenue from remaining (non-Airbnb) nights – gross without city tax
    const nonAirbnbRevenue = nonAirbnb.reduce(
      (s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0
    )
    // 4. Business-exempt revenue (non-Airbnb only)
    const businessRevenue = businessNonAirbnb.reduce(
      (s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0
    )
    const businessNights = businessNonAirbnb.reduce((s, d) => s + (d.booking.nights ?? 0), 0)
    // 5. Remaining taxable nights
    const remainingNights = taxable.reduce((s, d) => s + (d.booking.nights ?? 0), 0)
    // 6. Remaining taxable revenue
    const taxableRevenue = nonAirbnbRevenue - businessRevenue
    // 7. Collected tax
    const collectedTax = taxable.reduce((s, d) => s + d.tax.taxAmount, 0)

    return {
      totalNights,
      airbnbNights,
      nonAirbnbRevenue,
      businessNights,
      businessRevenue,
      remainingNights,
      taxableRevenue,
      collectedTax,
      airbnbCount: airbnbBookings.length,
      businessCount: businessNonAirbnb.length,
      taxableCount: taxable.length,
    }
  }, [taxData])

  async function toggleBusinessTravel(bookingId: string, isBusiness: boolean) {
    const newPurpose = isBusiness ? 'business' : 'unknown'
    await supabase
      .from('bookings')
      .update({ trip_purpose: newPurpose })
      .eq('id', bookingId)
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, trip_purpose: newPurpose } : b))
    )
  }

  function exportCSV() {
    const range = getDateRange(timeRange)
    const headers = [
      'Gast', 'Kanal', 'Check-in', 'Check-out', 'Nächte', 'Umsatz (ohne City Tax)',
      'Steuerbetrag', 'Befreiungsgrund',
    ]
    const rows = taxData.map((d) => [
      [d.booking.guest_firstname, d.booking.guest_lastname].filter(Boolean).join(' '),
      d.booking.channel,
      d.booking.check_in,
      d.booking.check_out,
      d.booking.nights ?? 0,
      getAccommodationGrossWithoutCityTax(d.booking).toFixed(2),
      d.tax.taxAmount.toFixed(2),
      d.tax.isExempt ? d.tax.exemptReason ?? 'Befreit' : '',
    ])
    const meldeSection = [
      [],
      ['Meldeformat Dresden'],
      ['Zeitraum', range.label],
      ['Stadt', taxConfig.city],
      ['Steuersatz', `${taxConfig.rate}%`],
      [],
      ['1. Anzahl entgeltlicher Übernachtungen insgesamt', melde.totalNights],
      ['2. abzgl. Airbnb-Übernachtungen (direkt abgeführt)', melde.airbnbNights],
      ['3. Umsätze aus verbleibenden Übernachtungen', melde.nonAirbnbRevenue.toFixed(2)],
      ['4. abzgl. beherbergungssteuerbefreite Übernachtungen (Geschäftsreisen)', `${melde.businessNights} Nächte / ${melde.businessRevenue.toFixed(2)} EUR`],
      ['5. verbleibende Anzahl entgeltlicher Übernachtungen', melde.remainingNights],
      ['6. verbleibende steuerpflichtige Umsätze', melde.taxableRevenue.toFixed(2)],
      ['7. eingezogene Beherbergungssteuer', melde.collectedTax.toFixed(2)],
    ]
    const csv = [...[headers], ...rows, ...meldeSection]
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Beherbergungssteuer</h2>
          <p className="text-sm text-muted-foreground">
            {taxConfig.city} · {taxConfig.rate}% auf{' '}
            {taxConfig.model === 'gross_percentage'
              ? 'Bruttopreis inkl. Nebenleistungen'
              : taxConfig.model === 'net_percentage'
              ? 'Nettopreis'
              : 'pro Person/Nacht'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[180px]">
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

      {/* Dresden Meldeformat */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Meldeformat {taxConfig.city} – {range.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm">1. Anzahl entgeltlicher Übernachtungen insgesamt</span>
                <span className="font-semibold tabular-nums">{melde.totalNights} Nächte</span>
              </div>
              <div className="flex justify-between py-2 border-b text-rose-600">
                <span className="text-sm">2. abzgl. Airbnb-Übernachtungen (direkt abgeführt)</span>
                <span className="font-semibold tabular-nums">– {melde.airbnbNights} Nächte</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm">3. Umsätze aus verbleibenden Übernachtungen</span>
                <span className="font-semibold tabular-nums">{formatEur(melde.nonAirbnbRevenue)}</span>
              </div>
              <div className="flex justify-between py-2 border-b text-blue-600">
                <span className="text-sm">4. abzgl. beherbergungssteuerbefreite Übernachtungen (Geschäftsreisen)</span>
                <span className="font-semibold tabular-nums">– {melde.businessNights} Nächte / {formatEur(melde.businessRevenue)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm">5. verbleibende Anzahl entgeltlicher Übernachtungen</span>
                <span className="font-semibold tabular-nums">{melde.remainingNights} Nächte</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm">6. verbleibende steuerpflichtige Umsätze aus Übernachtungen</span>
                <span className="font-semibold tabular-nums">{formatEur(melde.taxableRevenue)}</span>
              </div>
              <div className="flex justify-between py-3 bg-muted/50 rounded px-2 mt-2">
                <span className="text-sm font-bold">7. eingezogene Beherbergungssteuer ({taxConfig.rate}%)</span>
                <span className="text-lg font-bold tabular-nums">{formatEur(melde.collectedTax)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Booking list with tax */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buchungen im Zeitraum</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : taxData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Keine Buchungen im gewählten Zeitraum
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
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
                      <TableCell className="font-medium">
                        {[booking.guest_firstname, booking.guest_lastname].filter(Boolean).join(' ') || '–'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {booking.channel}
                      </TableCell>
                      <TableCell>
                        {format(new Date(booking.check_in + 'T00:00:00'), 'dd.MM.', { locale: de })} –{' '}
                        {format(new Date(booking.check_out + 'T00:00:00'), 'dd.MM.yy', { locale: de })}
                      </TableCell>
                      <TableCell className="text-center">{booking.nights ?? 0}</TableCell>
                      <TableCell className="text-right">{formatEur(getAccommodationGrossWithoutCityTax(booking))}</TableCell>
                      <TableCell className="text-right">
                        {tax.isExempt ? (
                          <Badge variant="outline" className={
                            tax.exemptReason === 'Airbnb führt ab'
                              ? 'border-rose-300 text-rose-600'
                              : 'border-blue-300 text-blue-600'
                          }>
                            {tax.exemptReason}
                          </Badge>
                        ) : (
                          formatEur(tax.taxAmount)
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {booking.channel !== 'Airbnb' && (
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
                  {/* Totals row */}
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell colSpan={3}>Gesamt (steuerpflichtig)</TableCell>
                    <TableCell className="text-center">
                      {melde.remainingNights}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEur(melde.taxableRevenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEur(melde.collectedTax)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

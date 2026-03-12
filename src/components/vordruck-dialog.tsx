'use client'

import { useState, useMemo } from 'react'
import { FileText, Download, AlertTriangle, Info, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import type { Booking, Property, CityTaxRule, Settings } from '@/lib/types'
import { calculateAccommodationTax, getTaxConfigForProperty, type TaxConfig, type TaxResult } from '@/lib/calculators/accommodation-tax'
import { getAccommodationGrossWithoutCityTax } from '@/lib/calculators/booking-price'
import { startOfMonth, endOfMonth, differenceInCalendarDays, addMonths, format } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingWithProp = Booking & { properties: Property | null }

type DresdenRhythm = 'monthly' | 'quarterly' | 'half-yearly'
type FormType = 'anmeldung' | 'berichtigt' | 'korrektur'

interface VordruckDialogProps {
  city: string
  bookings: BookingWithProp[]
  cityRules: CityTaxRule[]
  properties: Property[]
  settings: Settings | null
}

interface DresdenFormData {
  city: 'dresden'
  year: number
  rhythm: DresdenRhythm
  period: number
  type: 'anmeldung' | 'berichtigt'
  totalNights: number
  airbnbNights: number
  remainingNights: number
  revenueD: number
  exemptRevenueE: number
  taxableRevenueF: number
  taxAmountG: number
}

interface ChemnitzFormData {
  city: 'chemnitz'
  year: number
  months: number[]
  type: 'anmeldung' | 'korrektur'
  propertyName: string
  propertyStreet: string
  propertyZipCity: string
  nights: number
  revenue: number
  exemptRevenue: number
  taxableRevenue: number
  fivePercent: number
  actualTax: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
]

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function getDateRangeForDresden(
  year: number,
  rhythm: DresdenRhythm,
  period: number
): { from: string; to: string } {
  switch (rhythm) {
    case 'monthly': {
      const start = new Date(year, period - 1, 1)
      return {
        from: format(startOfMonth(start), 'yyyy-MM-dd'),
        to: format(endOfMonth(start), 'yyyy-MM-dd'),
      }
    }
    case 'quarterly': {
      const qStart = new Date(year, (period - 1) * 3, 1)
      const qEnd = new Date(year, (period - 1) * 3 + 3, 0)
      return {
        from: format(qStart, 'yyyy-MM-dd'),
        to: format(qEnd, 'yyyy-MM-dd'),
      }
    }
    case 'half-yearly': {
      const hStart = new Date(year, (period - 1) * 6, 1)
      const hEnd = new Date(year, (period - 1) * 6 + 6, 0)
      return {
        from: format(hStart, 'yyyy-MM-dd'),
        to: format(hEnd, 'yyyy-MM-dd'),
      }
    }
  }
}

function getDateRangeForChemnitz(
  year: number,
  months: number[]
): { from: string; to: string } {
  if (months.length === 0) {
    return { from: `${year}-01-01`, to: `${year}-01-31` }
  }
  const minMonth = Math.min(...months)
  const maxMonth = Math.max(...months)
  const start = new Date(year, minMonth - 1, 1)
  const end = endOfMonth(new Date(year, maxMonth - 1, 1))
  return {
    from: format(start, 'yyyy-MM-dd'),
    to: format(end, 'yyyy-MM-dd'),
  }
}

function splitBookingByMonth(booking: BookingWithProp, rangeFrom: string, rangeTo: string): BookingWithProp[] {
  const checkIn = new Date(booking.check_in + 'T00:00:00')
  const checkOut = new Date(booking.check_out + 'T00:00:00')
  const totalNights = booking.nights ?? differenceInCalendarDays(checkOut, checkIn)
  if (totalNights <= 0) return [booking]

  if (checkIn.getMonth() === checkOut.getMonth() && checkIn.getFullYear() === checkOut.getFullYear()) {
    if (booking.check_out > rangeFrom && booking.check_in <= rangeTo) {
      return [booking]
    }
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
    if (current > checkOut) break
  }

  return segments.length > 0 ? segments : []
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VordruckDialog({ city, bookings, cityRules, properties, settings }: VordruckDialogProps) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const [rhythm, setRhythm] = useState<DresdenRhythm>('monthly')
  const [period, setPeriod] = useState(new Date().getMonth() + 1)

  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)

  const isDresden = city.toLowerCase() === 'dresden'
  const [formType, setFormType] = useState<FormType>('anmeldung')

  const cityBookings = useMemo(() => {
    return bookings.filter((b) => {
      const config = b.properties ? getTaxConfigForProperty(b.properties, cityRules) : null
      const bookingCity = config?.city ?? b.properties?.city ?? ''
      return bookingCity.toLowerCase() === city.toLowerCase()
    })
  }, [bookings, city, cityRules])

  const cityProperties = useMemo(() => {
    return properties.filter((p) => {
      const config = getTaxConfigForProperty(p, cityRules)
      const propCity = config?.city ?? p.city ?? ''
      return propCity.toLowerCase() === city.toLowerCase()
    })
  }, [properties, city, cityRules])

  const dateRange = useMemo(() => {
    if (isDresden) {
      return getDateRangeForDresden(year, rhythm, period)
    }
    return getDateRangeForChemnitz(year, [selectedMonth])
  }, [isDresden, year, rhythm, period, selectedMonth])

  const taxData = useMemo(() => {
    interface TaxDataItem {
      booking: BookingWithProp
      tax: TaxResult
      config: TaxConfig | null
    }

    const items: TaxDataItem[] = []
    for (const booking of cityBookings) {
      const config = booking.properties
        ? getTaxConfigForProperty(booking.properties, cityRules)
        : null
      if (booking.check_out <= dateRange.from || booking.check_in > dateRange.to) continue

      const segments = splitBookingByMonth(booking, dateRange.from, dateRange.to)
      for (const seg of segments) {
        const tax = config
          ? calculateAccommodationTax(seg, config, booking.properties?.ota_remits_tax ?? [])
          : { taxableAmount: 0, taxAmount: 0, isExempt: true, exemptReason: 'Keine Beherbergungssteuer', remittedByOta: false } as TaxResult
        items.push({ booking: seg, tax, config })
      }
    }
    return items
  }, [cityBookings, cityRules, dateRange])

  const aggregated = useMemo(() => {
    const otaRemitted = taxData.filter((d) => d.tax.remittedByOta)
    const selfRemit = taxData.filter((d) => !d.tax.remittedByOta)
    const exempt = selfRemit.filter((d) => d.tax.isExempt)
    const taxable = selfRemit.filter((d) => !d.tax.isExempt)

    const totalNights = taxData.reduce((s, d) => s + (d.booking.nights ?? 0), 0)
    const airbnbNights = otaRemitted.reduce((s, d) => s + (d.booking.nights ?? 0), 0)
    const remainingNights = totalNights - airbnbNights

    const totalRevenue = taxData.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0)
    const selfRemitRevenue = selfRemit.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0)
    const exemptRevenue = exempt.reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0)
    const taxableRevenue = selfRemitRevenue - exemptRevenue
    const selfRemitTax = taxable.reduce((s, d) => s + d.tax.taxAmount, 0)

    // Chemnitz: total revenue for Z10 (all bookings), exempt from all for Z11
    const totalExemptRevenue = taxData.filter(d => d.tax.isExempt && !d.tax.remittedByOta)
      .reduce((s, d) => s + getAccommodationGrossWithoutCityTax(d.booking), 0)
    const chemnitzTaxableRevenue = totalRevenue - totalExemptRevenue

    return {
      totalNights,
      airbnbNights,
      remainingNights,
      selfRemitRevenue: Math.round(selfRemitRevenue * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      exemptRevenue: Math.round(exemptRevenue * 100) / 100,
      totalExemptRevenue: Math.round(totalExemptRevenue * 100) / 100,
      taxableRevenue: Math.round(taxableRevenue * 100) / 100,
      chemnitzTaxableRevenue: Math.round(chemnitzTaxableRevenue * 100) / 100,
      selfRemitTax: Math.round(selfRemitTax * 100) / 100,
      fivePercent: Math.round(chemnitzTaxableRevenue * 0.05 * 100) / 100,
      bookingCount: taxData.length,
    }
  }, [taxData])

  const primaryProperty = useMemo(() => {
    if (isDresden || cityProperties.length === 0) return null
    return cityProperties[0]
  }, [isDresden, cityProperties])

  const unassignedBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (!b.properties) return true
      const config = getTaxConfigForProperty(b.properties, cityRules)
      const bookingCity = config?.city ?? b.properties?.city ?? ''
      return !bookingCity
    }).length
  }, [bookings, cityRules])

  const missingKassenzeichen = isDresden && !settings?.kassenzeichen_dresden
  const missingPersonenkonto = !isDresden && !settings?.personenkonto_chemnitz
  const missingLandlordData = !settings?.landlord_name || !settings?.landlord_street

  async function handleDownload() {
    setDownloading(true)
    setDownloadSuccess(false)

    try {
      let payload: DresdenFormData | ChemnitzFormData

      if (isDresden) {
        payload = {
          city: 'dresden',
          year,
          rhythm,
          period,
          type: formType as 'anmeldung' | 'berichtigt',
          totalNights: aggregated.totalNights,
          airbnbNights: aggregated.airbnbNights,
          remainingNights: aggregated.remainingNights,
          revenueD: aggregated.selfRemitRevenue,
          exemptRevenueE: aggregated.exemptRevenue,
          taxableRevenueF: aggregated.taxableRevenue,
          taxAmountG: aggregated.selfRemitTax,
        }
      } else {
        payload = {
          city: 'chemnitz',
          year,
          months: [selectedMonth],
          type: formType as 'anmeldung' | 'korrektur',
          propertyName: primaryProperty?.name ?? '',
          propertyStreet: primaryProperty?.street ?? '',
          propertyZipCity: [primaryProperty?.zip, primaryProperty?.city].filter(Boolean).join(' '),
          nights: aggregated.totalNights,
          revenue: aggregated.totalRevenue,
          exemptRevenue: aggregated.totalExemptRevenue,
          taxableRevenue: aggregated.chemnitzTaxableRevenue,
          fivePercent: aggregated.fivePercent,
          actualTax: aggregated.selfRemitTax,
        }
      }

      const res = await fetch('/api/bhst-vordrucke/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }))
        throw new Error(err.error ?? 'PDF-Generierung fehlgeschlagen')
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const filenameMatch = disposition?.match(/filename="(.+)"/)
      const filename = filenameMatch?.[1] ?? `BhSt_${city}_${year}.pdf`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      setDownloadSuccess(true)
    } catch (error) {
      console.error('Download error:', error)
      alert(error instanceof Error ? error.message : 'PDF-Download fehlgeschlagen')
    } finally {
      setDownloading(false)
    }
  }

  function getDresdenPeriodOptions() {
    switch (rhythm) {
      case 'monthly':
        return MONTHS.map((m, i) => ({ value: i + 1, label: m }))
      case 'quarterly':
        return [
          { value: 1, label: 'Q1 (Jan - März)' },
          { value: 2, label: 'Q2 (Apr - Jun)' },
          { value: 3, label: 'Q3 (Jul - Sep)' },
          { value: 4, label: 'Q4 (Okt - Dez)' },
        ]
      case 'half-yearly':
        return [
          { value: 1, label: '1. Halbjahr (Jan - Jun)' },
          { value: 2, label: '2. Halbjahr (Jul - Dez)' },
        ]
    }
  }

  function handleRhythmChange(newRhythm: DresdenRhythm) {
    setRhythm(newRhythm)
    if (newRhythm === 'monthly') {
      setPeriod(Math.min(period, 12))
    } else if (newRhythm === 'quarterly') {
      setPeriod(Math.min(period, 4))
    } else {
      setPeriod(Math.min(period, 2))
    }
  }

  function getPeriodLabel(): string {
    if (isDresden) {
      const opts = getDresdenPeriodOptions()
      return opts.find((o) => o.value === period)?.label ?? ''
    }
    return MONTHS_SHORT[selectedMonth - 1]
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setDownloadSuccess(false) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="mr-2 h-4 w-4" />
          Vordruck erstellen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vordruck erstellen – {city}</DialogTitle>
          <DialogDescription>
            {isDresden
              ? 'Anmeldung Beherbergungssteuer (Vdr. 22.040/5)'
              : 'Anmeldung / Korrektur der Beherbergungsteuer (20.5-152-01.26)'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Year */}
          <div className="space-y-2">
            <Label>Jahr</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[140px]" aria-label="Jahr">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Period */}
          {isDresden ? (
            <div className="space-y-3">
              <Label>Melderhythmus</Label>
              <RadioGroup
                value={rhythm}
                onValueChange={(v) => handleRhythmChange(v as DresdenRhythm)}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="monthly" id="rhythm-monthly" />
                  <Label htmlFor="rhythm-monthly" className="font-normal">Monatlich</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="quarterly" id="rhythm-quarterly" />
                  <Label htmlFor="rhythm-quarterly" className="font-normal">Vierteljährlich</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="half-yearly" id="rhythm-half-yearly" />
                  <Label htmlFor="rhythm-half-yearly" className="font-normal">Halbjährlich</Label>
                </div>
              </RadioGroup>

              <Label>Zeitraum</Label>
              <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
                <SelectTrigger className="w-[260px]" aria-label="Zeitraum">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getDresdenPeriodOptions().map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Meldemonat</Label>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-[260px]" aria-label="Meldemonat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Form type */}
          <div className="space-y-2">
            <Label>Typ</Label>
            <RadioGroup
              value={formType}
              onValueChange={(v) => setFormType(v as FormType)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="anmeldung" id="type-anmeldung" />
                <Label htmlFor="type-anmeldung" className="font-normal">Anmeldung</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value={isDresden ? 'berichtigt' : 'korrektur'}
                  id="type-correction"
                />
                <Label htmlFor="type-correction" className="font-normal">
                  {isDresden ? 'Berichtigte Anmeldung' : 'Korrektur'}
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Warnings */}
          {(missingKassenzeichen || missingPersonenkonto) && (
            <Alert variant="default" className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">
                {isDresden ? 'Kassenzeichen fehlt' : 'Personenkonto fehlt'}
              </AlertTitle>
              <AlertDescription className="text-amber-700">
                {isDresden
                  ? 'Das Kassenzeichen ist nicht hinterlegt. Das Feld im PDF bleibt leer.'
                  : 'Das Personenkonto ist nicht hinterlegt. Das Feld im PDF bleibt leer.'}
                <a
                  href="/dashboard/einstellungen"
                  className="ml-1 inline-flex items-center gap-1 underline text-amber-800 hover:text-amber-900"
                >
                  In Einstellungen hinterlegen
                  <ExternalLink className="h-3 w-3" />
                </a>
              </AlertDescription>
            </Alert>
          )}

          {missingLandlordData && (
            <Alert variant="default" className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Betreiber-Adresse unvollständig</AlertTitle>
              <AlertDescription className="text-amber-700">
                Name oder Anschrift fehlen. Bitte zuerst in den{' '}
                <a
                  href="/dashboard/einstellungen"
                  className="inline-flex items-center gap-1 underline text-amber-800 hover:text-amber-900"
                >
                  Einstellungen
                  <ExternalLink className="h-3 w-3" />
                </a>{' '}
                hinterlegen.
              </AlertDescription>
            </Alert>
          )}

          {unassignedBookings > 0 && (
            <Alert variant="default" className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Buchungen ohne Stadtzuordnung</AlertTitle>
              <AlertDescription className="text-amber-700">
                {unassignedBookings} Buchung{unassignedBookings !== 1 ? 'en' : ''} ohne Stadtzuordnung
                {unassignedBookings !== 1 ? ' werden' : ' wird'} nicht berücksichtigt.
              </AlertDescription>
            </Alert>
          )}

          {!isDresden && cityProperties.length > 1 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Mehrere Objekte in {city}</AlertTitle>
              <AlertDescription>
                Steuerdaten wurden über alle {cityProperties.length} Objekte summiert.
                Standortangaben (Zeilen 6-8) zeigen: <strong>{primaryProperty?.name}</strong>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Vorschau</h3>
              <Badge variant="outline">
                {aggregated.bookingCount} Buchung{aggregated.bookingCount !== 1 ? 'en' : ''}
              </Badge>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between pb-2 border-b">
                <span className="text-muted-foreground">Stadt</span>
                <span className="font-medium">{city}</span>
              </div>
              <div className="flex justify-between pb-2 border-b">
                <span className="text-muted-foreground">Zeitraum</span>
                <span className="font-medium">{year} – {getPeriodLabel()}</span>
              </div>
              <div className="flex justify-between pb-2 border-b">
                <span className="text-muted-foreground">Typ</span>
                <span className="font-medium">
                  {formType === 'anmeldung' ? 'Anmeldung' : formType === 'berichtigt' ? 'Berichtigte Anmeldung' : 'Korrektur'}
                </span>
              </div>

              <div className="flex justify-between pb-2 border-b">
                <span className="text-muted-foreground">Betreiber</span>
                <span className="font-medium text-right">
                  {settings?.landlord_name || <span className="text-destructive">fehlt</span>}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b">
                <span className="text-muted-foreground">
                  {isDresden ? 'Kassenzeichen' : 'Personenkonto'}
                </span>
                <span className="font-medium">
                  {isDresden
                    ? (settings?.kassenzeichen_dresden || <span className="text-amber-600">nicht hinterlegt</span>)
                    : (settings?.personenkonto_chemnitz || <span className="text-amber-600">nicht hinterlegt</span>)
                  }
                </span>
              </div>

              <Separator className="my-2" />

              {isDresden ? (
                <>
                  <PreviewLine label="A. Entgeltliche Übernachtungen insgesamt" value={String(aggregated.totalNights)} />
                  <PreviewLine label="B. davon: Airbnb (OTA führt ab)" value={String(aggregated.airbnbNights)} className="text-rose-600" />
                  <PreviewLine label="C. Verbleibende Übernachtungen" value={String(aggregated.remainingNights)} />
                  <PreviewLine label="D. Umsätze aus verbleibenden Übernachtungen" value={formatEur(aggregated.selfRemitRevenue)} />
                  <PreviewLine label="E. abzgl. steuerbefreite Umsätze" value={formatEur(aggregated.exemptRevenue)} className="text-blue-600" />
                  <PreviewLine label="F. Steuerpflichtige Umsätze" value={formatEur(aggregated.taxableRevenue)} bold />
                  <div className="flex justify-between py-2 px-2 bg-emerald-50 rounded mt-1">
                    <span className="font-bold text-sm">G. Eingezogene Beherbergungssteuer</span>
                    <span className="font-bold text-emerald-700 tabular-nums">{formatEur(aggregated.selfRemitTax)}</span>
                  </div>
                </>
              ) : (
                <>
                  {primaryProperty && (
                    <>
                      <PreviewLine label="Beherbergungseinrichtung" value={primaryProperty.name} />
                      <PreviewLine label="Adresse" value={[primaryProperty.street, [primaryProperty.zip, primaryProperty.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')} />
                      <Separator className="my-1" />
                    </>
                  )}
                  <PreviewLine label="Z. 9  Entgeltliche Übernachtungen" value={String(aggregated.totalNights)} />
                  <PreviewLine label="Z. 10 Umsätze aus Übernachtungen" value={formatEur(aggregated.totalRevenue)} />
                  <PreviewLine label="Z. 11 Steuerbefreite Umsätze" value={formatEur(aggregated.totalExemptRevenue)} className="text-blue-600" />
                  <PreviewLine label="Z. 12 Steuerpflichtige Umsätze" value={formatEur(aggregated.chemnitzTaxableRevenue)} bold />
                  <PreviewLine label="Z. 13 5% der steuerpfl. Umsätze" value={formatEur(aggregated.fivePercent)} />
                  <div className="flex justify-between py-2 px-2 bg-emerald-50 rounded mt-1">
                    <span className="font-bold text-sm">Z. 14 Abzuführende Steuer</span>
                    <span className="font-bold text-emerald-700 tabular-nums">{formatEur(aggregated.selfRemitTax)}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between pt-2 border-t mt-2">
                <span className="text-muted-foreground">Datum</span>
                <span className="font-medium">
                  {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Download */}
          <div className="space-y-3">
            <Button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading ? 'PDF wird erstellt...' : 'PDF herunterladen'}
            </Button>

            {downloadSuccess && (
              <Alert className="border-blue-300 bg-blue-50">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800">Unterschrift erforderlich</AlertTitle>
                <AlertDescription className="text-blue-700">
                  Bitte das Formular vor Abgabe <strong>eigenhändig unterschreiben</strong>.
                  Das Unterschriftsfeld wurde absichtlich leer gelassen.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PreviewLine({
  label,
  value,
  className,
  bold,
}: {
  label: string
  value: string
  className?: string
  bold?: boolean
}) {
  return (
    <div className={`flex justify-between py-1 border-b border-dashed ${className ?? ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold' : ''}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

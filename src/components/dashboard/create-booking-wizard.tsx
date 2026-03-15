'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  Check,
  Copy,
  Loader2,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  CalendarIcon,
  Mail,
} from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

import { supabase } from '@/lib/supabase'
import { generateBookingEmailHtml, copyHtmlToClipboard } from '@/lib/email-template'
import type { Property, BookingWithProperty } from '@/lib/types'

// -- Types --
interface RatesResult {
  available: boolean
  price: number | null
  priceDetails: string | null
  cleaningFee: number | null
  currency: string
}

// -- Zod Schemas --
const guestFormSchema = z.object({
  guestFirstname: z.string().min(1, 'Vorname ist erforderlich'),
  guestLastname: z.string().min(1, 'Nachname ist erforderlich'),
  guestEmail: z.string().email('Ungueltige E-Mail-Adresse'),
  guestPhone: z.string().min(1, 'Telefonnummer ist erforderlich'),
  guestStreet: z.string().min(1, 'Strasse ist erforderlich'),
  guestZip: z.string().min(1, 'PLZ ist erforderlich').regex(/^\d+$/, { message: 'PLZ darf nur Ziffern enthalten' }),
  guestCity: z.string().min(1, 'Ort ist erforderlich'),
  guestCountry: z.string().min(1, 'Land ist erforderlich'),
  guestNationality: z.string().optional(),
  guestBirthdate: z.string().optional(),
  guestIdNumber: z.string().optional(),
  guestNote: z.string().optional(),
})

type GuestFormData = z.infer<typeof guestFormSchema>

// -- Helpers --
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatDate(dateStr: string): string {
  return format(new Date(dateStr + 'T00:00:00'), 'dd.MM.yyyy', { locale: de })
}

// -- Step indicator --
function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
              i < currentStep
                ? 'bg-primary text-primary-foreground'
                : i === currentStep
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {i < currentStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span
            className={`text-xs hidden sm:inline ${
              i === currentStep ? 'font-semibold' : 'text-muted-foreground'
            }`}
          >
            {label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  )
}

// -- InfoRow for summary --
function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm text-right ${bold ? 'font-bold' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

// -- Main Component --
export function CreateBookingWizard({
  open,
  onOpenChange,
  onBookingCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBookingCreated?: (booking: BookingWithProperty) => void
}) {
  const [step, setStep] = useState(0)
  const [properties, setProperties] = useState<Property[]>([])
  const [propertiesLoading, setPropertiesLoading] = useState(true)

  // Step 1 state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [promoCode, setPromoCode] = useState('')
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesResult, setRatesResult] = useState<RatesResult | null>(null)
  const [ratesError, setRatesError] = useState<string | null>(null)

  // Editable pricing
  const [accommodationPrice, setAccommodationPrice] = useState(0)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [lastEditedPriceField, setLastEditedPriceField] = useState<'total' | 'perNight'>('total')
  const [cleaningFee, setCleaningFee] = useState(0)
  const [accommodationTax, setAccommodationTax] = useState(0)
  // BUG-7: track whether Smoobu provided cleaning fee

  // Step 3 state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Success state
  const [createdBooking, setCreatedBooking] = useState<BookingWithProperty | null>(null)
  const [stripeLink, setStripeLink] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

  // Guest form
  const form = useForm<GuestFormData>({
    resolver: zodResolver(guestFormSchema),
    defaultValues: {
      guestFirstname: '',
      guestLastname: '',
      guestEmail: '',
      guestPhone: '',
      guestStreet: '',
      guestZip: '',
      guestCity: '',
      guestCountry: 'DE',
      guestNationality: '',
      guestBirthdate: '',
      guestIdNumber: '',
      guestNote: '',
    },
  })

  // Load properties
  useEffect(() => {
    if (!open) return
    async function loadProperties() {
      setPropertiesLoading(true)
      const { data } = await supabase.from('properties').select('*').order('name')
      setProperties(data ?? [])
      if (data && data.length > 0 && !selectedPropertyId) {
        setSelectedPropertyId(data[0].id)
      }
      setPropertiesLoading(false)
    }
    loadProperties()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(0)
      setRatesResult(null)
      setRatesError(null)
      setSubmitError(null)
      setCreatedBooking(null)
      setStripeLink(null)
      setInvoiceId(null)
      setLinkCopied(false)
      setEmailCopied(false)
      setCheckIn('')
      setCheckOut('')
      setAdults(1)
      setChildren(0)
      setPromoCode('')
      setAccommodationPrice(0)
      setPricePerNight(0)
      setLastEditedPriceField('total')
      setCleaningFee(0)
      setAccommodationTax(0)
      form.reset()
    }
  }, [open, form])

  // Calculate tax when pricing changes
  useEffect(() => {
    const selectedProperty = properties.find((p) => p.id === selectedPropertyId)
    if (!selectedProperty) return

    const taxRate = selectedProperty.accommodation_tax_rate
    const taxModel = selectedProperty.accommodation_tax_model

    // No BHSt if not configured for this property
    if (taxRate == null || taxModel == null) {
      setAccommodationTax(0)
      return
    }

    const totalBeforeTax = accommodationPrice + cleaningFee
    let tax = 0

    if (taxModel === 'gross_percentage') {
      tax = totalBeforeTax * (taxRate / 100)
    } else if (taxModel === 'net_percentage') {
      tax = accommodationPrice * (taxRate / 100)
    } else if (taxModel === 'per_person_per_night' && checkIn && checkOut) {
      const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn))
      tax = taxRate * adults * nights
    } else if (taxModel === 'per_room_per_night' && checkIn && checkOut) {
      const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn))
      tax = taxRate * nights
    }

    setAccommodationTax(Math.round(tax * 100) / 100)
  }, [accommodationPrice, cleaningFee, selectedPropertyId, properties, adults, checkIn, checkOut])

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId)
  const nights =
    checkIn && checkOut
      ? differenceInCalendarDays(new Date(checkOut), new Date(checkIn))
      : 0

  // Recalculate total when nights change and per-night was last edited
  useEffect(() => {
    if (nights > 0 && lastEditedPriceField === 'perNight' && pricePerNight > 0) {
      setAccommodationPrice(Math.round(pricePerNight * nights * 100) / 100)
    }
  }, [nights]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPrice = accommodationPrice + cleaningFee + accommodationTax

  // MwSt-Aufschlüsselung: Übernachtung 7%, Reinigung + BHSt 0%
  const vat7Net = Math.round((accommodationPrice / 1.07) * 100) / 100
  const vat7Amount = Math.round((accommodationPrice - vat7Net) * 100) / 100
  const vat0Net = Math.round((cleaningFee + accommodationTax) * 100) / 100
  const nettoGesamt = Math.round((vat7Net + vat0Net) * 100) / 100
  const totalVat = vat7Amount

  // BUG-10: correct tax label unit based on tax model
  function getTaxLabel(property: typeof selectedProperty): string {
    const rate = property?.accommodation_tax_rate
    const model = property?.accommodation_tax_model
    if (rate == null || model == null) return 'Beherbergungssteuer'
    if (model === 'per_person_per_night') return `Beherbergungssteuer (${rate} EUR/Person/Nacht)`
    if (model === 'per_room_per_night') return `Beherbergungssteuer (${rate} EUR/Zimmer/Nacht)`
    return `Beherbergungssteuer (${rate}%)`
  }

  // -- Handlers --
  const handleCheckRates = useCallback(async () => {
    if (!selectedProperty || !checkIn || !checkOut) return

    setRatesLoading(true)
    setRatesError(null)
    setRatesResult(null)

    try {
      const params = new URLSearchParams({
        apartmentId: String(selectedProperty.external_id),
        checkIn,
        checkOut,
        adults: String(adults),
        children: String(children),
      })
      if (promoCode) params.set('promoCode', promoCode)

      const res = await fetch(`/api/smoobu/rates?${params}`)
      const data = await res.json()

      if (!res.ok) {
        setRatesError(data.error ?? 'Fehler bei der Preisabfrage')
        return
      }

      setRatesResult(data)

      if (data.available && data.price !== null) {
        setAccommodationPrice(data.price)
        // Calculate per-night price from total
        const currentNights = checkIn && checkOut
          ? differenceInCalendarDays(new Date(checkOut), new Date(checkIn))
          : 0
        setPricePerNight(currentNights > 0 ? Math.round((data.price / currentNights) * 100) / 100 : 0)
        setLastEditedPriceField('total')
        // Use Smoobu cleaning fee if provided, otherwise fall back to property default
        const smoobuCleaningFee = data.cleaningFee
        const propertyDefault = selectedProperty?.default_cleaning_fee != null
          ? parseFloat(String(selectedProperty.default_cleaning_fee))
          : null
        if (smoobuCleaningFee !== null && smoobuCleaningFee > 0) {
          setCleaningFee(smoobuCleaningFee)
        } else if (propertyDefault !== null && propertyDefault > 0) {
          setCleaningFee(propertyDefault)
        } else {
          setCleaningFee(0)
        }
      }
    } catch {
      setRatesError('Verbindungsfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setRatesLoading(false)
    }
  }, [selectedProperty, checkIn, checkOut, adults, children, promoCode])

  const handleSubmit = useCallback(async () => {
    if (!selectedProperty) return

    setSubmitting(true)
    setSubmitError(null)

    const guestData = form.getValues()

    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedProperty.id,
          apartmentExternalId: selectedProperty.external_id,
          checkIn,
          checkOut,
          adults,
          children,
          ...guestData,
          accommodationPrice,
          cleaningFee,
          accommodationTax,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error ?? 'Fehler beim Erstellen der Buchung')
        return
      }

      setCreatedBooking(data.booking)
      setStripeLink(data.stripePaymentLink)
      setInvoiceId(data.invoiceId)
      setStep(3) // Success
      onBookingCreated?.(data.booking)
    } catch {
      setSubmitError('Verbindungsfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setSubmitting(false)
    }
  }, [
    selectedProperty, checkIn, checkOut, adults, children,
    accommodationPrice, cleaningFee, accommodationTax,
    form, onBookingCreated,
  ])

  const handleCopyLink = useCallback(() => {
    if (!stripeLink) return
    navigator.clipboard.writeText(stripeLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }, [stripeLink])

  const handleCopyEmail = useCallback(async () => {
    if (!stripeLink || !createdBooking) return
    const html = generateBookingEmailHtml({
      guestFirstname: createdBooking.guest_firstname ?? 'Gast',
      guestLastname: createdBooking.guest_lastname ?? '',
      propertyName: selectedProperty?.name ?? 'Ferienwohnung',
      checkIn: createdBooking.check_in,
      checkOut: createdBooking.check_out,
      adults: (createdBooking.adults ?? 1) + (createdBooking.children ?? 0),
      bookingId: createdBooking.id,
    })
    await copyHtmlToClipboard(html)
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 2000)
  }, [stripeLink, createdBooking, selectedProperty])

  const canProceedStep1 =
    selectedPropertyId &&
    checkIn &&
    checkOut &&
    nights > 0 &&
    ratesResult?.available &&
    accommodationPrice > 0

  const stepLabels = ['Buchungsdetails', 'Gastdaten', 'Bestaetigung']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step < 3 ? 'Direktbuchung anlegen' : 'Buchung erstellt'}
          </DialogTitle>
        </DialogHeader>

        {step < 3 && <StepIndicator currentStep={step} steps={stepLabels} />}

        {/* Step 1: Booking Details & Price Check */}
        {step === 0 && (
          <div className="space-y-4">
            {/* Property Selection */}
            <div className="space-y-2">
              <Label htmlFor="property">Objekt</Label>
              {propertiesLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : properties.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Keine Objekte gefunden. Bitte zuerst Smoobu synchronisieren.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger id="property">
                    <SelectValue placeholder="Objekt waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in</Label>
                <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {checkIn
                        ? format(new Date(checkIn + 'T00:00:00'), 'dd.MM.yyyy', { locale: de })
                        : <span className="text-muted-foreground">Datum wählen</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      weekStartsOn={1}
                      selected={checkIn ? new Date(checkIn + 'T00:00:00') : undefined}
                      onSelect={(date) => {
                        if (!date) return
                        const str = format(date, 'yyyy-MM-dd')
                        setCheckIn(str)
                        setRatesResult(null)
                        setCheckInOpen(false)
                        setTimeout(() => setCheckOutOpen(true), 100)
                      }}
                      disabled={(date) => date < new Date(new Date().toDateString())}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Check-out</Label>
                <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {checkOut
                        ? format(new Date(checkOut + 'T00:00:00'), 'dd.MM.yyyy', { locale: de })
                        : <span className="text-muted-foreground">Datum wählen</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      weekStartsOn={1}
                      selected={checkOut ? new Date(checkOut + 'T00:00:00') : undefined}
                      onSelect={(date) => {
                        if (!date) return
                        setCheckOut(format(date, 'yyyy-MM-dd'))
                        setRatesResult(null)
                        setCheckOutOpen(false)
                      }}
                      disabled={(date) => {
                        const minDate = checkIn
                          ? new Date(new Date(checkIn + 'T00:00:00').getTime() + 86400000)
                          : new Date(new Date().toDateString())
                        return date < minDate
                      }}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {nights > 0 && (
              <p className="text-sm text-muted-foreground">
                {nights} Naechte
              </p>
            )}

            {/* Guests */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="adults">Erwachsene</Label>
                <Input
                  id="adults"
                  type="number"
                  min={1}
                  max={20}
                  value={adults}
                  onChange={(e) => setAdults(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="children">Kinder</Label>
                <Input
                  id="children"
                  type="number"
                  min={0}
                  max={20}
                  value={children}
                  onChange={(e) => setChildren(Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>
            </div>

            {/* Promo Code */}
            <div className="space-y-2">
              <Label htmlFor="promo">Promo-Code (optional)</Label>
              <Input
                id="promo"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="z.B. SOMMER2026"
              />
            </div>

            {/* Check Rates Button */}
            <Button
              onClick={handleCheckRates}
              disabled={!selectedPropertyId || !checkIn || !checkOut || nights <= 0 || ratesLoading}
              className="w-full"
            >
              {ratesLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preise werden abgefragt...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Verfuegbarkeit & Preise pruefen
                </>
              )}
            </Button>

            {/* Error */}
            {ratesError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{ratesError}</AlertDescription>
              </Alert>
            )}

            {/* Rates Result: Not Available */}
            {ratesResult && !ratesResult.available && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Zeitraum nicht verfuegbar. Bitte waehlen Sie andere Daten.
                </AlertDescription>
              </Alert>
            )}

            {/* Rates Result: Available - Editable Pricing */}
            {ratesResult?.available && (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Preisaufstellung</h4>
                  <Badge variant="secondary">Verfuegbar</Badge>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="acc-price" className="text-xs text-muted-foreground">
                      Uebernachtungskosten gesamt ({nights} Naechte)
                    </Label>
                    <Input
                      id="acc-price"
                      type="number"
                      step="0.01"
                      min={0}
                      value={accommodationPrice}
                      onChange={(e) => {
                        const total = parseFloat(e.target.value) || 0
                        setAccommodationPrice(total)
                        setLastEditedPriceField('total')
                        if (nights > 0) {
                          setPricePerNight(Math.round((total / nights) * 100) / 100)
                        }
                      }}
                      placeholder={String(ratesResult.price ?? 0)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="price-per-night" className="text-xs text-muted-foreground">
                      Preis pro Nacht (brutto)
                    </Label>
                    <Input
                      id="price-per-night"
                      type="number"
                      step="0.01"
                      min={0}
                      value={pricePerNight}
                      onChange={(e) => {
                        const perNight = parseFloat(e.target.value) || 0
                        setPricePerNight(perNight)
                        setLastEditedPriceField('perNight')
                        if (nights > 0) {
                          setAccommodationPrice(Math.round(perNight * nights * 100) / 100)
                        }
                      }}
                      placeholder={nights > 0 ? String(Math.round(((ratesResult.price ?? 0) / nights) * 100) / 100) : '0'}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="cleaning-fee" className="text-xs text-muted-foreground">
                      Reinigungsgebuehr
                    </Label>
                    <Input
                      id="cleaning-fee"
                      type="number"
                      step="0.01"
                      min={0}
                      value={cleaningFee}
                      onChange={(e) => setCleaningFee(parseFloat(e.target.value) || 0)}
                      placeholder={String(ratesResult.cleaningFee ?? 0)}
                    />
                  </div>

                  <Separator />

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {getTaxLabel(selectedProperty)}
                    </span>
                    <span className="font-medium">{formatCurrency(accommodationTax)}</span>
                  </div>

                  <Separator />

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Nettobetrag 0%</span>
                      <span>{formatCurrency(vat0Net)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Nettobetrag 7%</span>
                      <span>{formatCurrency(vat7Net)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span>Netto gesamt</span>
                      <span>{formatCurrency(nettoGesamt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Umsatzsteuer 0%</span>
                      <span>{formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Umsatzsteuer 7%</span>
                      <span>{formatCurrency(vat7Amount)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between font-semibold">
                    <span>Rechnungsbetrag</span>
                    <span>{formatCurrency(totalPrice)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Next */}
            <div className="flex justify-end">
              <Button
                onClick={() => setStep(1)}
                disabled={!canProceedStep1}
              >
                Weiter
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Guest Data */}
        {step === 1 && (
          <Form {...form}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="guestFirstname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Max" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestLastname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nachname *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Mustermann" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="guestEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-Mail *</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="max@beispiel.de" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon *</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" placeholder="+49 123 456789" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="guestStreet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Strasse + Hausnummer *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Musterstr. 1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="guestZip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PLZ *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="01067" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestCity"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Ort *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Dresden" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="guestCountry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Land *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="DE" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <p className="text-xs text-muted-foreground">Optionale Angaben</p>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="guestNationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nationalitaet</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="DE" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestBirthdate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Geburtsdatum</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestIdNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ausweis-Nr.</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="C01X..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="guestNote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notiz</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Besondere Wuensche..." rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Navigation */}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Zurueck
                </Button>
                <Button
                  onClick={async () => {
                    const valid = await form.trigger()
                    if (valid) setStep(2)
                  }}
                >
                  Weiter
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Form>
        )}

        {/* Step 3: Summary & Confirmation */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-semibold text-sm">Aufenthalt</h4>
              <SummaryRow label="Objekt" value={selectedProperty?.name ?? '–'} />
              <SummaryRow label="Check-in" value={checkIn ? formatDate(checkIn) : '–'} />
              <SummaryRow label="Check-out" value={checkOut ? formatDate(checkOut) : '–'} />
              <SummaryRow label="Naechte" value={String(nights)} />
              <SummaryRow
                label="Gaeste"
                value={`${adults} Erw.${children > 0 ? ` + ${children} Kinder` : ''}`}
              />
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-semibold text-sm">Gast</h4>
              <SummaryRow
                label="Name"
                value={`${form.getValues('guestFirstname')} ${form.getValues('guestLastname')}`}
              />
              <SummaryRow label="E-Mail" value={form.getValues('guestEmail')} />
              <SummaryRow label="Telefon" value={form.getValues('guestPhone')} />
              <SummaryRow
                label="Adresse"
                value={`${form.getValues('guestStreet')}, ${form.getValues('guestZip')} ${form.getValues('guestCity')}, ${form.getValues('guestCountry')}`}
              />
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-semibold text-sm">Preise</h4>
              <SummaryRow label="Uebernachtungskosten" value={formatCurrency(accommodationPrice)} />
              <SummaryRow label="Reinigungsgebuehr" value={formatCurrency(cleaningFee)} />
              <SummaryRow
                label={getTaxLabel(selectedProperty)}
                value={formatCurrency(accommodationTax)}
              />
              <Separator />
              <SummaryRow label="Nettobetrag 0%" value={formatCurrency(vat0Net)} />
              <SummaryRow label="Nettobetrag 7%" value={formatCurrency(vat7Net)} />
              <Separator />
              <SummaryRow label="Netto gesamt" value={formatCurrency(nettoGesamt)} />
              <SummaryRow label="Umsatzsteuer 0%" value={formatCurrency(0)} />
              <SummaryRow label="Umsatzsteuer 7%" value={formatCurrency(vat7Amount)} />
              <Separator />
              <SummaryRow label="Rechnungsbetrag" value={formatCurrency(totalPrice)} bold />
            </div>

            {submitError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Zurueck
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Buchung wird erstellt...
                  </>
                ) : (
                  'Buchung anlegen'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 3 && createdBooking && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold">Buchung erfolgreich erstellt</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Die Buchung wurde an Smoobu uebermittelt und gespeichert.
              </p>
            </div>

            <div className="rounded-lg border p-4 space-y-2 text-left">
              <SummaryRow
                label="Gast"
                value={`${createdBooking.guest_firstname ?? ''} ${createdBooking.guest_lastname ?? ''}`}
              />
              <SummaryRow label="Zeitraum" value={`${formatDate(createdBooking.check_in)} - ${formatDate(createdBooking.check_out)}`} />
              <SummaryRow label="Gesamtpreis" value={formatCurrency(totalPrice)} bold />
            </div>

            {invoiceId && (
              <Alert>
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  Rechnung wurde automatisch erstellt. Sie finden sie unter Rechnungen.
                </AlertDescription>
              </Alert>
            )}

            {stripeLink ? (
              <div className="space-y-4 text-left">
                <div className="rounded-lg border p-4 space-y-2">
                  <Label className="text-sm font-semibold">Stripe-Zahlungslink</Label>
                  <div className="flex gap-2">
                    <Input value={stripeLink} readOnly className="text-xs" />
                    <Button variant="outline" size="icon" onClick={handleCopyLink} aria-label="Zahlungslink kopieren">
                      {linkCopied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Email Text Generator */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      E-Mail-Text fuer den Gast
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyEmail}
                      aria-label="E-Mail-Text kopieren"
                    >
                      {emailCopied ? (
                        <>
                          <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                          Kopiert
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Text kopieren
                        </>
                      )}
                    </Button>
                  </div>
                  <div
                    className="text-xs bg-muted/50 rounded-md p-3 max-h-48 overflow-y-auto border"
                    dangerouslySetInnerHTML={{
                      __html: generateBookingEmailHtml({
                        guestFirstname: createdBooking.guest_firstname ?? 'Gast',
                        guestLastname: createdBooking.guest_lastname ?? '',
                        propertyName: selectedProperty?.name ?? 'Ferienwohnung',
                        checkIn: createdBooking.check_in,
                        checkOut: createdBooking.check_out,
                        adults: (createdBooking.adults ?? 1) + (createdBooking.children ?? 0),
                        bookingId: createdBooking.id,
                      }),
                    }}
                  />
                </div>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Kein Stripe-API-Key hinterlegt. Zahlungslink kann unter Integrationen aktiviert werden.
                </AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Schliessen
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

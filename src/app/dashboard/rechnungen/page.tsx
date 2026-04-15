'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { format, addDays, addMonths, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { pdf } from '@react-pdf/renderer'
import JSZip from 'jszip'
import { Plus, Download, FileText, Ban, Search, Archive, Loader2, Trash2, Info, Mail, Copy, Check, RotateCcw, CreditCard, ArrowUpDown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { InvoicePDF, type InvoicePDFData, type InvoiceLineItem } from '@/lib/pdf/invoice'
import { DunningPDF, type DunningPDFData } from '@/lib/pdf/dunning'
import { type DunningType, type DunningData, DUNNING_LABELS, getDunningText, generateDunningEmailHtml } from '@/lib/dunning-templates'
import { copyHtmlToClipboard } from '@/lib/email-template'
import type { BookingWithProperty, Settings, CityTaxRule } from '@/lib/types'
import {
  getAccommodationGrossWithoutCityTax,
} from '@/lib/calculators/booking-price'
import {
  calculateAccommodationTax,
  getTaxConfigForProperty,
} from '@/lib/calculators/accommodation-tax'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface PaymentScheduleEntry {
  due_date: string
  amount: number
}

type InvoiceType = 'invoice' | 'storno' | 'credit_note'

interface InvoiceRow {
  id: string
  invoice_number: string
  issued_date: string | null
  due_date: string | null
  total_gross: number
  total_vat: number
  subtotal_net: number
  vat_7_net: number | null
  vat_7_amount: number | null
  vat_19_net: number | null
  vat_19_amount: number | null
  status: string
  booking_id: string | null
  property_id: string | null
  is_kleinunternehmer: boolean | null
  service_period_start: string | null
  service_period_end: string | null
  notes: string | null
  notes_footer: string | null
  payment_schedule: PaymentScheduleEntry[] | null
  invoice_type?: InvoiceType
  cancelled_invoice_id?: string | null
  landlord_snapshot: Record<string, string>
  guest_snapshot: Record<string, string>
  line_items: Array<{
    description: string
    quantity: number
    unit_price: number
    vat_rate: number
    vat_amount: number
    total: number
  }>
}

interface PropertyInfo {
  id: string
  name: string
}

interface SplitSegment {
  checkIn: string
  checkOut: string
  nights: number
  ratio: number
  monthLabel: string
  amount: number
  selected: boolean
  alreadyInvoiced: boolean
  isCustom?: boolean
}

const INVOICE_SELECT = 'id, invoice_number, issued_date, due_date, total_gross, total_vat, subtotal_net, vat_7_net, vat_7_amount, vat_19_net, vat_19_amount, status, booking_id, property_id, is_kleinunternehmer, service_period_start, service_period_end, notes, notes_footer, payment_schedule, invoice_type, cancelled_invoice_id, landlord_snapshot, guest_snapshot, line_items'

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  created: 'Erstellt',
  sent: 'Versendet',
  paid: 'Bezahlt',
  cancelled: 'Storniert',
}

const TYPE_LABELS: Record<InvoiceType, string> = {
  invoice: 'Rechnung',
  storno: 'Storno',
  credit_note: 'Gutschrift',
}

/** Derive invoice type from invoice_type field or number prefix (ST- / GS- / RE-) */
function getInvoiceType(inv: InvoiceRow): InvoiceType {
  if (inv.invoice_type) return inv.invoice_type
  if (inv.invoice_number.startsWith('ST-')) return 'storno'
  if (inv.invoice_number.startsWith('GS-')) return 'credit_note'
  return 'invoice'
}


export default function RechnungenPage() {
  return (
    <Suspense>
      <RechnungenContent />
    </Suspense>
  )
}

function RechnungenContent() {
  const searchParams = useSearchParams()
  const bookingIdParam = searchParams.get('booking')
  const splitParam = searchParams.get('split') === 'true'

  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [bookings, setBookings] = useState<BookingWithProperty[]>([])
  const [properties, setProperties] = useState<PropertyInfo[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [cityRules, setCityRules] = useState<CityTaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [syncingGuest, setSyncingGuest] = useState(false)
  const [dunningDialogOpen, setDunningDialogOpen] = useState(false)
  const [dunningInvoice, setDunningInvoice] = useState<InvoiceRow | null>(null)
  const [dunningType, setDunningType] = useState<DunningType>('reminder')
  const [dunningCopied, setDunningCopied] = useState(false)
  const [dunningDownloading, setDunningDownloading] = useState(false)
  // Storno & Gutschrift state
  const [stornoInvoice, setStornoInvoice] = useState<InvoiceRow | null>(null)
  const [stornoLoading, setStornoLoading] = useState(false)
  const [gutschriftInvoice, setGutschriftInvoice] = useState<InvoiceRow | null>(null)
  const [gutschriftLoading, setGutschriftLoading] = useState(false)
  const [gutschriftType, setGutschriftType] = useState<'simple' | 'shortened'>('simple')
  const [gutschriftPositions, setGutschriftPositions] = useState<Array<{ description: string; amount: number; vatRate: number }>>([{ description: '', amount: 0, vatRate: 7 }])
  const [gutschriftReason, setGutschriftReason] = useState('')
  const [gutschriftNewNights, setGutschriftNewNights] = useState<number>(1)
  // Split preview state
  const [splitPreviewOpen, setSplitPreviewOpen] = useState(false)
  const [splitSegments, setSplitSegments] = useState<SplitSegment[]>([])
  const [splitBooking, setSplitBooking] = useState<BookingWithProperty | null>(null)
  // Queue of split segments to process through the wizard one by one
  const [splitQueue, setSplitQueue] = useState<SplitSegment[]>([])
  const { toast } = useToast()

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | InvoiceType>('all')

  // Sort state
  const [sortField, setSortField] = useState<'number' | 'type' | 'guest' | 'property' | 'date' | 'due' | 'period' | 'amount' | 'status'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Form state
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestStreet, setGuestStreet] = useState('')
  const [guestZip, setGuestZip] = useState('')
  const [guestCity, setGuestCity] = useState('')
  const [guestCountry, setGuestCountry] = useState('')
  // Track which guest fields the user has manually edited (dirty)
  const dirtyGuestFields = useRef(new Set<string>())
  const [servicePeriodStart, setServicePeriodStart] = useState('')
  const [servicePeriodEnd, setServicePeriodEnd] = useState('')
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [bhstIncluded, setBhstIncluded] = useState<boolean[]>([]) // parallel to lineItems: is this item included in BhSt?
  const [issuedDate, setIssuedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [dueDate, setDueDate] = useState('')
  const [dueDateManual, setDueDateManual] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesFooter, setNotesFooter] = useState('')
  const [paymentScheduleEnabled, setPaymentScheduleEnabled] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [{ data: invoicesData }, { data: bookingsData }, { data: settingsData }, { data: rulesData }, { data: propsData }] =
        await Promise.all([
          supabase
            .from('invoices')
            .select(INVOICE_SELECT)
            .order('created_at', { ascending: false }),
          supabase
            .from('bookings')
            .select('*, properties(*)')
            .order('check_in', { ascending: false })
            .limit(100),
          supabase.from('settings').select(`
            id, created_at, updated_at,
            landlord_name, landlord_street, landlord_zip, landlord_city,
            landlord_phone, landlord_email, landlord_website, landlord_country,
            landlord_logo_url,
            tax_number, vat_id, finanzamt, is_kleinunternehmer,
            bank_iban, bank_bic, bank_name,
            company_register, managing_director, invoice_thank_you_text,
            invoice_prefix, invoice_next_number, invoice_payment_days,
            make_invoice_webhook_url
          `).limit(1).single(),
          supabase.from('city_tax_rules').select('*').order('city'),
          supabase.from('properties').select('id, name').order('name'),
        ])

      const rules = (rulesData ?? []) as CityTaxRule[]
      setInvoices((invoicesData ?? []) as InvoiceRow[])
      setBookings((bookingsData ?? []) as BookingWithProperty[])
      setProperties((propsData ?? []) as PropertyInfo[])
      setSettings(settingsData as Settings | null)
      setCityRules(rules)
      setLoading(false)


      if (bookingIdParam) {
        // First try the already-loaded list, then fall back to a direct fetch (avoids limit(100) miss)
        let targetBooking = (bookingsData ?? []).find(
          (b: BookingWithProperty) => b.id === bookingIdParam
        ) as BookingWithProperty | undefined
        if (!targetBooking) {
          const { data: directBooking } = await supabase
            .from('bookings')
            .select('*, properties(*)')
            .eq('id', bookingIdParam)
            .single()
          targetBooking = directBooking as BookingWithProperty | undefined
        }
        if (targetBooking) {
          if (splitParam) {
            if (!settingsData) {
              toast({ title: 'Einstellungen fehlen', description: 'Bitte zuerst Vermieter-Daten in den Einstellungen hinterlegen.', variant: 'destructive' })
            } else {
              setSplitting(true)
              await openSplitPreview(targetBooking)
              setSplitting(false)
            }
          } else {
            fillFromBooking(targetBooking, settingsData as Settings | null, rules)
            setDialogOpen(true)
          }
        }
      }
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingIdParam, splitParam])

  function fillFromBooking(booking: BookingWithProperty, s: Settings | null, rules?: CityTaxRule[]) {
    setSelectedBookingId(booking.id)
    setSelectedPropertyId(booking.property_id ?? '')
    setNotes('')
    setNotesFooter('')
    setPaymentScheduleEnabled(false)
    dirtyGuestFields.current.clear()

    // Use company data as invoice recipient if set
    const isCompany = booking.invoice_recipient === 'company'
    const name = isCompany && booking.company_name
      ? booking.company_name
      : [booking.guest_firstname, booking.guest_lastname].filter(Boolean).join(' ')
    setGuestName(name)
    setGuestStreet(isCompany && booking.company_street ? booking.company_street : (booking.guest_street ?? ''))
    setGuestZip(isCompany && booking.company_zip ? booking.company_zip : (booking.guest_zip ?? ''))
    setGuestCity(isCompany && booking.company_city ? booking.company_city : (booking.guest_city ?? ''))
    setGuestCountry(isCompany && booking.company_country ? booking.company_country : (booking.guest_country ?? ''))
    setServicePeriodStart(booking.check_in)
    setServicePeriodEnd(booking.check_out)

    const nights = booking.nights ?? 1
    const grossWithoutTax = getAccommodationGrossWithoutCityTax(booking)
    // In the manual invoice wizard, use the booking's actual cleaning_fee (no fallback)
    const cleaningFee = booking.cleaning_fee ?? 0
    const isKlein = s?.is_kleinunternehmer ?? false

    // Calculate accommodation tax using city_tax_rules
    const effectiveRules = rules ?? cityRules
    const taxConfig = booking.properties
      ? getTaxConfigForProperty(booking.properties, effectiveRules)
      : null
    const taxResult = taxConfig
      ? calculateAccommodationTax(booking, taxConfig, booking.properties?.ota_remits_tax ?? [])
      : null
    const cityTax = booking.accommodation_tax_amount != null
      ? booking.accommodation_tax_amount
      : (taxResult?.taxAmount ?? 0)
    const taxVatRate = taxConfig?.vatType === '7' ? 7 : taxConfig?.vatType === '19' ? 19 : 0

    // Calculate accommodation price (gross without tax minus cleaning)
    const accommodationGross = grossWithoutTax - cleaningFee
    const accommodationPerNight = nights > 0 ? accommodationGross / nights : 0

    const items: InvoiceLineItem[] = []

    // Accommodation (7% USt) – gross as anchor, vat from total (not per-unit) to avoid rounding errors
    const accomTotal = Math.round(accommodationGross * 100) / 100
    const accomNetTotal = isKlein ? accomTotal : Math.round((accommodationGross / 1.07) * 100) / 100
    const accomUnitPrice = nights > 0 ? Math.round((accomNetTotal / nights) * 100) / 100 : 0
    const accomVat = isKlein ? 0 : Math.round((accomTotal - accomNetTotal) * 100) / 100
    items.push({
      description: `Beherbergung in ${booking.properties?.name ?? 'Ferienwohnung'} (${nights} Nächte)`,
      quantity: nights,
      unitPrice: accomUnitPrice,
      vatRate: 7,
      vatAmount: accomVat,
      total: accomTotal,
    })

    // Cleaning (7% USt – Teil der Beherbergungsleistung)
    if (cleaningFee > 0) {
      const cleanUnitPrice = Math.round((cleaningFee / (isKlein ? 1 : 1.07)) * 100) / 100
      const cleanTotal = Math.round(cleaningFee * 100) / 100
      const cleanVat = isKlein ? 0 : Math.round((cleanTotal - cleanUnitPrice) * 100) / 100
      items.push({
        description: 'Endreinigung',
        quantity: 1,
        unitPrice: cleanUnitPrice,
        vatRate: 7,
        vatAmount: cleanVat,
        total: cleanTotal,
      })
    }

    // Beherbergungssteuer – always include so invoice total matches what guest pays
    if (cityTax > 0) {
      const cityLabel = taxConfig?.city ? ` (${taxConfig.city})` : ''
      const cityTaxRounded = Math.round(cityTax * 100) / 100
      const taxVatAmount = isKlein ? 0 : Math.round(cityTaxRounded * (taxVatRate / 100) * 100) / 100
      items.push({
        description: `Beherbergungssteuer${cityLabel}`,
        quantity: 1,
        unitPrice: cityTaxRounded,
        vatRate: taxVatRate,
        vatAmount: taxVatAmount,
        total: Math.round((cityTaxRounded + taxVatAmount) * 100) / 100,
      })
    }

    setLineItems(items)
    // Initialize BhSt flags: non-BhSt items are included by default
    setBhstIncluded(items.map(i => !isBhStItem(i)))

    // Auto-sync guest address from Smoobu when booking has an external_id
    if (booking.external_id && !booking.guest_street) {
      syncGuestFromSmoobu(booking.id)
    }
  }

  /** Fill the wizard form from a split segment (proportional line items, segment dates) */
  function fillFromSplitSegment(booking: BookingWithProperty, segment: SplitSegment, s: Settings | null) {
    setSelectedBookingId(booking.id)
    setSelectedPropertyId(booking.property_id ?? '')
    setNotes('')
    setNotesFooter('')
    setPaymentScheduleEnabled(false)
    dirtyGuestFields.current.clear()

    const isCompany = booking.invoice_recipient === 'company'
    const name = isCompany && booking.company_name
      ? booking.company_name
      : [booking.guest_firstname, booking.guest_lastname].filter(Boolean).join(' ')
    setGuestName(name)
    setGuestStreet(isCompany && booking.company_street ? booking.company_street : (booking.guest_street ?? ''))
    setGuestZip(isCompany && booking.company_zip ? booking.company_zip : (booking.guest_zip ?? ''))
    setGuestCity(isCompany && booking.company_city ? booking.company_city : (booking.guest_city ?? ''))
    setGuestCountry(isCompany && booking.company_country ? booking.company_country : (booking.guest_country ?? ''))
    setServicePeriodStart(segment.checkIn)
    setServicePeriodEnd(segment.checkOut)
    setIssuedDate(format(new Date(), 'yyyy-MM-dd'))
    setDueDate('')
    setDueDateManual(false)

    const isKlein = s?.is_kleinunternehmer ?? false
    const effectiveRules = cityRules
    const taxConfig = booking.properties ? getTaxConfigForProperty(booking.properties, effectiveRules) : null
    const grossWithoutTax = getAccommodationGrossWithoutCityTax(booking)
    const cleaningFee = booking.cleaning_fee ?? 0
    const accommodationGross = grossWithoutTax - cleaningFee

    const fullTaxResult = taxConfig
      ? calculateAccommodationTax(booking, taxConfig, booking.properties?.ota_remits_tax ?? [])
      : null
    const fullTaxAmount = booking.accommodation_tax_amount != null
      ? booking.accommodation_tax_amount
      : (fullTaxResult?.taxAmount ?? 0)
    const taxVatRate = taxConfig?.vatType === '7' ? 7 : taxConfig?.vatType === '19' ? 19 : 0

    // If the user manually edited the amount (isCustom), create a single line item
    // with the custom gross amount so the user can further adjust in the wizard
    if (segment.isCustom) {
      const customGross = segment.amount
      const customNet = isKlein ? customGross : Math.round((customGross / 1.07) * 100) / 100
      const customVat = isKlein ? 0 : Math.round((customGross - customNet) * 100) / 100
      const customItems = [{
        description: `Beherbergung in ${booking.properties?.name ?? 'Ferienwohnung'} – ${segment.monthLabel} (${segment.nights} Nächte)`,
        quantity: 1,
        unitPrice: customNet,
        vatRate: 7,
        vatAmount: customVat,
        total: customGross,
      }]
      setLineItems(customItems)
      setBhstIncluded(customItems.map(() => true))
    } else {
      // Proportional amounts based on segment ratio
      const segAccomGross = Math.round(accommodationGross * segment.ratio * 100) / 100
      const segClean = Math.round(cleaningFee * segment.ratio * 100) / 100

      const items: InvoiceLineItem[] = []

      const segAccomTotal = Math.round(segAccomGross * 100) / 100
      const segAccomNetTotal = isKlein ? segAccomTotal : Math.round((segAccomGross / 1.07) * 100) / 100
      const segAccomUnitPrice = segment.nights > 0 ? Math.round((segAccomNetTotal / segment.nights) * 100) / 100 : 0
      const accomVat = isKlein ? 0 : Math.round((segAccomTotal - segAccomNetTotal) * 100) / 100
      items.push({
        description: `Beherbergung in ${booking.properties?.name ?? 'Ferienwohnung'} – ${segment.monthLabel} (${segment.nights} Nächte)`,
        quantity: segment.nights,
        unitPrice: segAccomUnitPrice,
        vatRate: 7,
        vatAmount: accomVat,
        total: segAccomTotal,
      })

      if (segClean > 0) {
        const cleanUnitPrice = Math.round((segClean / (isKlein ? 1 : 1.07)) * 100) / 100
        const cleanTotal = Math.round(segClean * 100) / 100
        const cleanVat = isKlein ? 0 : Math.round((cleanTotal - cleanUnitPrice) * 100) / 100
        items.push({
          description: 'Endreinigung',
          quantity: 1,
          unitPrice: cleanUnitPrice,
          vatRate: 7,
          vatAmount: cleanVat,
          total: cleanTotal,
        })
      }

      if (fullTaxAmount > 0) {
        const segTax = Math.round(fullTaxAmount * segment.ratio * 100) / 100
        const taxVatAmount = isKlein ? 0 : Math.round(segTax * (taxVatRate / 100) * 100) / 100
        items.push({
          description: `Beherbergungssteuer${taxConfig?.city ? ` (${taxConfig.city})` : ''}`,
          quantity: 1,
          unitPrice: segTax,
          vatRate: taxVatRate,
          vatAmount: taxVatAmount,
          total: Math.round((segTax + taxVatAmount) * 100) / 100,
        })
      }

      setLineItems(items)
      setBhstIncluded(items.map(i => !isBhStItem(i)))
    }

    if (booking.external_id && !booking.guest_street) {
      syncGuestFromSmoobu(booking.id)
    }
  }

  /** Open the wizard for the next split segment in the queue */
  function processNextSplitSegment() {
    if (splitQueue.length === 0 || !splitBooking) return
    const [next, ...rest] = splitQueue
    setSplitQueue(rest)
    fillFromSplitSegment(splitBooking, next, settings)
    setDialogOpen(true)
  }

  /** Start the split wizard flow: queue selected segments and open wizard for the first one */
  function startSplitWizardFlow() {
    const booking = splitBooking
    if (!booking) return
    const selectedSegs = splitSegments.filter(seg => seg.selected && !seg.alreadyInvoiced)
    if (selectedSegs.length === 0) {
      toast({ title: 'Keine Monate ausgewählt', variant: 'destructive' })
      return
    }

    // Queue all except the first, fill wizard with the first
    const [first, ...rest] = selectedSegs
    setSplitQueue(rest)
    fillFromSplitSegment(booking, first, settings)
    setSplitPreviewOpen(false)
    setDialogOpen(true)
  }

  /** Fetch latest guest data from Smoobu and update form fields + local booking state */
  async function syncGuestFromSmoobu(bookingId: string) {
    setSyncingGuest(true)
    try {
      const res = await fetch('/api/smoobu/sync-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      const data = await res.json()
      if (data.success && data.guest) {
        // Update form fields — only overwrite fields the user hasn't manually edited
        const dirty = dirtyGuestFields.current
        if (data.guest.street && !dirty.has('guestStreet')) setGuestStreet(data.guest.street)
        if (data.guest.zip && !dirty.has('guestZip')) setGuestZip(data.guest.zip)
        if (data.guest.city && !dirty.has('guestCity')) setGuestCity(data.guest.city)
        if (data.guest.country && !dirty.has('guestCountry')) setGuestCountry(data.guest.country)
        if (data.guest.name && !dirty.has('guestName')) setGuestName(data.guest.name)

        // Update local bookings state so re-opening won't re-fetch
        setBookings((prev) =>
          prev.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  guest_street: data.guest.street ?? b.guest_street,
                  guest_city: data.guest.city ?? b.guest_city,
                  guest_zip: data.guest.zip ?? b.guest_zip,
                  guest_country: data.guest.country ?? b.guest_country,
                  guest_firstname: data.guest.name?.split(' ')[0] ?? b.guest_firstname,
                  guest_lastname: data.guest.name?.split(' ').slice(1).join(' ') ?? b.guest_lastname,
                }
              : b
          )
        )

        if (data.fieldsUpdated > 0) {
          toast({
            title: 'Gastadresse synchronisiert',
            description: `${data.fieldsUpdated} Feld(er) aus Smoobu aktualisiert.`,
          })
        }
      }
    } catch {
      // Non-blocking: form still works with empty address
    } finally {
      setSyncingGuest(false)
    }
  }

  function calculateSplitSegments(booking: BookingWithProperty): SplitSegment[] {
    const checkIn = new Date(booking.check_in + 'T00:00:00')
    const checkOut = new Date(booking.check_out + 'T00:00:00')
    const totalNights = booking.nights ?? differenceInCalendarDays(checkOut, checkIn)
    if (totalNights <= 0) return []

    const grossTotal = booking.amount_gross ?? 0
    const segments: SplitSegment[] = []
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
          nights: segNights,
          ratio,
          monthLabel: format(segStart, 'MMMM yyyy', { locale: de }),
          amount: Math.round(grossTotal * ratio * 100) / 100,
          selected: false,
          alreadyInvoiced: false,
        })
      }
      current = nextMonth
    }
    return segments
  }

  async function openSplitPreview(booking: BookingWithProperty) {
    const segments = calculateSplitSegments(booking)
    if (segments.length <= 1) {
      fillFromBooking(booking, settings, cityRules)
      setDialogOpen(true)
      return
    }

    // Check which segments already have invoices (by matching service_period_start)
    const { data: existing } = await supabase
      .from('invoices')
      .select('id, status, invoice_type, service_period_start')
      .eq('booking_id', booking.id)

    const existingPeriods = new Set(
      (existing ?? [])
        .filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled' && inv.invoice_type === 'invoice')
        .map(inv => inv.service_period_start)
    )

    // Delete orphan auto-generated drafts for segments that don't have a finalized invoice yet
    if (existing && existing.length > 0) {
      const draftIds = existing
        .filter(inv => inv.status === 'draft' && !existingPeriods.has(inv.service_period_start))
        .map(inv => inv.id)
      if (draftIds.length > 0) {
        await supabase.from('invoices').delete().in('id', draftIds)
      }
    }

    // Mark segments that already have invoices
    const enrichedSegments = segments.map(seg => ({
      ...seg,
      alreadyInvoiced: existingPeriods.has(seg.checkIn),
      selected: false,
    }))

    if (enrichedSegments.every(seg => seg.alreadyInvoiced)) {
      toast({ title: 'Alle Monate bereits abgerechnet', description: 'Für jeden Monat dieser Buchung existiert bereits eine Rechnung.' })
      return
    }

    setSplitBooking(booking)
    setSplitSegments(enrichedSegments)
    setSplitPreviewOpen(true)
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unitPrice: 0, vatRate: 19, vatAmount: 0, total: 0 },
    ])
    setBhstIncluded((prev) => [...prev, true])
  }

  function updateLineItem(index: number, field: keyof InvoiceLineItem | 'unitPriceGross', value: string | number) {
    setLineItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index] }
      const isKlein = settings?.is_kleinunternehmer ?? false

      // Don't manually edit the BhSt line item if it's auto-calculated
      const editingBhSt = isBhStItem(item)

      if (field === 'unitPriceGross') {
        const grossPrice = Number(value)
        const vatRate = Number(item.vatRate)
        item.unitPrice = isKlein || vatRate === 0
          ? grossPrice
          : Math.round((grossPrice / (1 + vatRate / 100)) * 100) / 100
        const grossTotal = Math.round(Number(item.quantity) * grossPrice * 100) / 100
        const netTotal = Math.round(Number(item.quantity) * Number(item.unitPrice) * 100) / 100
        item.vatAmount = isKlein ? 0 : Math.round((grossTotal - netTotal) * 100) / 100
        item.total = grossTotal
      } else {
        ;(item as Record<string, unknown>)[field] = value
        if (['quantity', 'unitPrice', 'vatRate'].includes(field)) {
          const netTotal = Number(item.quantity) * Number(item.unitPrice)
          item.vatAmount = isKlein ? 0 : Math.round(netTotal * (Number(item.vatRate) / 100) * 100) / 100
          item.total = Math.round((netTotal + item.vatAmount) * 100) / 100
        }
      }
      updated[index] = item

      // Auto-recalculate BhSt when a non-BhSt item changes
      if (!editingBhSt) {
        return recalcBhSt(updated, bhstIncluded)
      }
      return updated
    })
  }

  function removeLineItem(index: number) {
    const newFlags = bhstIncluded.filter((_, i) => i !== index)
    setBhstIncluded(newFlags)
    setLineItems((prev) => {
      const filtered = prev.filter((_, i) => i !== index)
      return recalcBhSt(filtered, newFlags)
    })
  }

  const isBhStItem = (item: InvoiceLineItem) => /beherbergungssteuer|city.?tax/i.test(item.description)

  /** Recalculate the BhSt line item based on checked items */
  function recalcBhSt(items: InvoiceLineItem[], included: boolean[]): InvoiceLineItem[] {
    const bhstIdx = items.findIndex(i => isBhStItem(i))
    if (bhstIdx < 0) return items

    const selectedBooking = bookings.find(b => b.id === selectedBookingId)
    const taxConfig = selectedBooking?.properties
      ? getTaxConfigForProperty(selectedBooking.properties, cityRules)
      : null
    if (!taxConfig) return items

    const isKlein = settings?.is_kleinunternehmer ?? false
    const base = items.reduce((sum, item, idx) => {
      if (idx === bhstIdx) return sum
      if (!included[idx]) return sum
      return sum + item.total
    }, 0)

    let newTaxAmount: number
    if (taxConfig.model === 'net_percentage') {
      // Net models: exclude cleaning from base
      const cleaningTotal = items
        .filter((_, idx) => idx !== bhstIdx)
        .filter(i => /reinigung|cleaning|endreinigung/i.test(i.description))
        .reduce((sum, i) => sum + i.total, 0)
      newTaxAmount = (base - cleaningTotal) * (taxConfig.rate / 100)
    } else {
      // Gross percentage (Dresden) and others: rate * base
      newTaxAmount = base * (taxConfig.rate / 100)
    }

    const newTax = Math.round(newTaxAmount * 100) / 100
    const taxVatRate = taxConfig.vatType === '7' ? 7 : taxConfig.vatType === '19' ? 19 : 0
    const newTaxVat = isKlein ? 0 : Math.round(newTax * (taxVatRate / 100) * 100) / 100

    return items.map((item, idx) =>
      idx === bhstIdx
        ? { ...item, unitPrice: newTax, vatAmount: newTaxVat, total: Math.round((newTax + newTaxVat) * 100) / 100 }
        : item
    )
  }

  async function handleSave() {
    if (!settings) return
    setGenerating(true)
    const { data: { user } } = await supabase.auth.getUser()
    try {
      const isKlein = settings.is_kleinunternehmer ?? false

      const subtotalNet = lineItems.reduce(
        (s, item) => s + (item.total - item.vatAmount),
        0
      )
      const vat7Items = lineItems.filter((i) => i.vatRate === 7)
      const vat19Items = lineItems.filter((i) => i.vatRate === 19)
      const vat7Net = vat7Items.reduce((s, i) => s + (i.total - i.vatAmount), 0)
      const vat7Amount = isKlein ? 0 : vat7Items.reduce((s, i) => s + i.vatAmount, 0)
      const vat19Net = vat19Items.reduce((s, i) => s + (i.total - i.vatAmount), 0)
      const vat19Amount = isKlein ? 0 : vat19Items.reduce((s, i) => s + i.vatAmount, 0)
      const totalVat = vat7Amount + vat19Amount
      const totalGross = isKlein ? subtotalNet : subtotalNet + totalVat

      const paymentDays = settings.invoice_payment_days ?? 14
      const prefix = settings.invoice_prefix ?? 'RE'
      const nextNumber = settings.invoice_next_number ?? 1
      const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(nextNumber).padStart(3, '0')}`

      const selectedBooking = bookings.find((b) => b.id === selectedBookingId)

      // Save to database
      const lineItemsJson = lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        vat_rate: item.vatRate,
        vat_amount: item.vatAmount,
        total: item.total,
      }))

      const landlordSnapshotData = {
        name: settings.landlord_name ?? '',
        street: settings.landlord_street ?? '',
        city: settings.landlord_city ?? '',
        zip: settings.landlord_zip ?? '',
        country: settings.landlord_country ?? 'DE',
        phone: settings.landlord_phone ?? '',
        email: settings.landlord_email ?? '',
        website: settings.landlord_website ?? '',
        tax_number: settings.tax_number ?? '',
        vat_id: settings.vat_id ?? '',
        bank_iban: settings.bank_iban ?? '',
        bank_bic: settings.bank_bic ?? '',
        bank_name: settings.bank_name ?? '',
        company_register: settings.company_register ?? '',
        managing_director: settings.managing_director ?? '',
        invoice_thank_you_text: settings.invoice_thank_you_text ?? '',
        logo_url: settings.landlord_logo_url ?? '',
      }

      const isCompanyInvoice = selectedBooking?.invoice_recipient === 'company'
      const nameParts = guestName.trim().split(' ')
      const guestSnapshotData = {
        firstname: nameParts[0] ?? '',
        lastname: nameParts.slice(1).join(' ') ?? '',
        street: isCompanyInvoice ? (selectedBooking?.guest_street ?? '') : guestStreet,
        zip: isCompanyInvoice ? (selectedBooking?.guest_zip ?? '') : guestZip,
        city: isCompanyInvoice ? (selectedBooking?.guest_city ?? '') : guestCity,
        country: isCompanyInvoice ? (selectedBooking?.guest_country ?? '') : guestCountry,
        booking_reference: selectedBooking?.external_id?.toString() ?? '',
        guest_count: selectedBooking ? String((selectedBooking.adults ?? 0) + (selectedBooking.children ?? 0)) : '',
        payment_channel: selectedBooking?.channel ?? '',
        // Company / invoice recipient
        invoice_recipient: selectedBooking?.invoice_recipient ?? 'guest',
        company_name: selectedBooking?.company_name ?? '',
        company_street: selectedBooking?.company_street ?? '',
        company_zip: selectedBooking?.company_zip ?? '',
        company_city: selectedBooking?.company_city ?? '',
        company_country: selectedBooking?.company_country ?? '',
        company_vat_id: selectedBooking?.company_vat_id ?? '',
      }

      // Compute payment schedule if enabled
      let computedSchedule: PaymentScheduleEntry[] | null = null
      if (paymentScheduleEnabled && servicePeriodStart && servicePeriodEnd) {
        const ciDate = new Date(servicePeriodStart + 'T00:00:00')
        const coDate = new Date(servicePeriodEnd + 'T00:00:00')
        const months =
          (coDate.getFullYear() - ciDate.getFullYear()) * 12 +
          (coDate.getMonth() - ciDate.getMonth()) + 1
        if (months >= 2) {
          const perMonth = Math.round((totalGross / months) * 100) / 100
          computedSchedule = []
          for (let m = 0; m < months; m++) {
            const dueDate = new Date(ciDate.getFullYear(), ciDate.getMonth() + m, 1)
            const amount = m < months - 1
              ? perMonth
              : Math.round((totalGross - perMonth * (months - 1)) * 100) / 100
            computedSchedule.push({
              due_date: format(dueDate, 'yyyy-MM-dd'),
              amount,
            })
          }
        }
      }

      const { data: saved } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          booking_id: selectedBookingId || null,
          property_id: selectedBooking?.property_id ?? (selectedPropertyId || null),
          user_id: user?.id,
          landlord_snapshot: landlordSnapshotData,
          guest_snapshot: guestSnapshotData,
          line_items: lineItemsJson,
          notes: notes.trim() || null,
          notes_footer: notesFooter.trim() || null,
          payment_schedule: computedSchedule as unknown as import('@/lib/database.types').Json ?? null,
          subtotal_net: Math.round(subtotalNet * 100) / 100,
          vat_7_net: Math.round(vat7Net * 100) / 100,
          vat_7_amount: Math.round(vat7Amount * 100) / 100,
          vat_19_net: Math.round(vat19Net * 100) / 100,
          vat_19_amount: Math.round(vat19Amount * 100) / 100,
          total_vat: Math.round(totalVat * 100) / 100,
          total_gross: Math.round(totalGross * 100) / 100,
          is_kleinunternehmer: isKlein,
          issued_date: issuedDate,
          due_date: dueDate || format(addDays(new Date(issuedDate), paymentDays), 'yyyy-MM-dd'),
          service_period_start: servicePeriodStart || null,
          service_period_end: servicePeriodEnd || null,
          status: 'created',
        })
        .select(INVOICE_SELECT)
        .single()

      // Increment invoice number
      await supabase
        .from('settings')
        .update({ invoice_next_number: nextNumber + 1 })
        .not('id', 'is', null)

      if (saved) {
        setInvoices((prev) => [saved as InvoiceRow, ...prev])

        // Sync cleaning fee back to booking (non-blocking)
        if (selectedBookingId) {
          const cleaningLineItem = lineItems.find(i => /reinigung|cleaning|endreinigung/i.test(i.description))
          if (cleaningLineItem) {
            const cleaningGross = cleaningLineItem.total
            Promise.resolve(
              supabase.from('bookings')
                .update({ cleaning_fee: cleaningGross, updated_at: new Date().toISOString() })
                .eq('id', selectedBookingId)
            ).then(() => {
              // Update local state so booking overview reflects the change
              setBookings(prev => prev.map(b =>
                b.id === selectedBookingId ? { ...b, cleaning_fee: cleaningGross } : b
              ))
            }).catch(() => { /* non-blocking */ })
          }
        }

        // Sync guest address back to booking + Smoobu (non-blocking)
        if (selectedBookingId && (guestStreet || guestCity || guestZip || guestCountry)) {
          const nameParts = guestName.split(' ')
          fetch('/api/bookings/update-guest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId: selectedBookingId,
              guestFirstname: nameParts[0] ?? '',
              guestLastname: nameParts.slice(1).join(' ') ?? '',
              guestStreet,
              guestZip,
              guestCity,
              guestCountry,
            }),
          }).catch(() => { /* non-blocking */ })
        }

        // Trigger Make.com webhook (non-blocking)
        if (settings.make_invoice_webhook_url) {
          fetch('/api/make/send-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId: saved.id }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                toast({ title: 'An Make.com gesendet', description: `${invoiceNumber} → ${data.guestEmail || 'Webhook ausgelöst'}` })
              }
            })
            .catch(() => { /* non-blocking */ })
        }
      }

      setDialogOpen(false)
      toast({ title: 'Rechnung gespeichert', description: invoiceNumber })

      // If there are more split segments in the queue, open wizard for the next one
      if (splitQueue.length > 0 && splitBooking) {
        const [next, ...rest] = splitQueue
        setSplitQueue(rest)
        fillFromSplitSegment(splitBooking, next, settings)
        // Small delay so the dialog close animation completes
        setTimeout(() => setDialogOpen(true), 200)
      } else {
        // Clear split state when done
        setSplitBooking(null)
        setSplitQueue([])
      }
    } finally {
      setGenerating(false)
    }
  }

  /** Generate PDF on-demand – uses the frozen guest_snapshot from invoice creation.
   *  Also auto-attaches the PDF as a booking document (if booking_id exists). */
  async function handleDownloadPDF(inv: InvoiceRow) {
    setDownloading(inv.id)
    try {
      const pdfData = buildPdfData(inv)
      const blob = await pdf(<InvoicePDF data={pdfData} />).toBlob()

      // Download to browser
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.invoice_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      // Auto-attach PDF to booking documents (best-effort, don't block download)
      if (inv.booking_id) {
        attachInvoicePdfToBooking(inv, blob).catch(err =>
          console.error('Auto-attach invoice PDF failed (non-fatal):', err)
        )
      }
    } finally {
      setDownloading(null)
    }
  }

  /** Upload invoice PDF to Supabase Storage and link as booking document */
  async function attachInvoicePdfToBooking(inv: InvoiceRow, blob: Blob) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !inv.booking_id) return

    const fileName = `${inv.invoice_number}.pdf`
    const storagePath = `${user.id}/${inv.booking_id}/${fileName}`

    // Check if already attached (idempotent)
    const { data: existing } = await supabase
      .from('booking_documents')
      .select('id')
      .eq('booking_id', inv.booking_id)
      .eq('file_name', fileName)
      .maybeSingle()
    if (existing) return

    // Upload to storage (upsert in case file exists but DB record was lost)
    const arrayBuffer = await blob.arrayBuffer()
    await supabase.storage
      .from('booking-documents')
      .upload(storagePath, arrayBuffer, { contentType: 'application/pdf', upsert: true })

    // Create booking_documents record
    await supabase.from('booking_documents').insert({
      booking_id: inv.booking_id,
      user_id: user.id,
      file_name: fileName,
      file_size: blob.size,
      mime_type: 'application/pdf',
      storage_path: storagePath,
    })
  }

  async function updateStatus(invoiceId: string, newStatus: string) {
    const updates: Record<string, string | null> = { status: newStatus }
    if (newStatus === 'paid') {
      updates.paid_date = format(new Date(), 'yyyy-MM-dd')
    }
    await supabase.from('invoices').update(updates).eq('id', invoiceId)

    // When marking as paid, also update the linked booking's payment_status
    if (newStatus === 'paid') {
      const inv = invoices.find(i => i.id === invoiceId)
      if (inv?.booking_id) {
        await supabase.from('bookings')
          .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', inv.booking_id)
      }
    }

    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: newStatus } : inv))
    )
  }

  // Build period filter options
  function getPeriodRange(period: string): { from: string; to: string } | null {
    if (period === 'all') return null
    const now = new Date()
    const year = now.getFullYear()
    if (period === 'this_year') return { from: `${year}-01-01`, to: `${year}-12-31` }
    if (period === 'last_year') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
    if (period.startsWith('q')) {
      const q = parseInt(period[1])
      const qYear = period.includes('_last') ? year - 1 : year
      const fromMonth = (q - 1) * 3
      const toMonth = fromMonth + 2
      return {
        from: `${qYear}-${String(fromMonth + 1).padStart(2, '0')}-01`,
        to: `${qYear}-${String(toMonth + 1).padStart(2, '0')}-${toMonth === 1 ? 28 : toMonth === 11 || toMonth === 3 || toMonth === 5 || toMonth === 8 || toMonth === 10 ? 30 : 31}`,
      }
    }
    return null
  }

  // Filtered invoices
  const propertyMap: Record<string, string> = Object.fromEntries(properties.map(p => [p.id, p.name]))

  const filteredInvoices = invoices.filter((inv) => {
    // Search by guest name
    if (searchQuery) {
      const name = `${inv.guest_snapshot?.firstname ?? ''} ${inv.guest_snapshot?.lastname ?? ''}`.toLowerCase()
      if (!name.includes(searchQuery.toLowerCase())) return false
    }
    // Property filter
    if (propertyFilter !== 'all' && inv.property_id !== propertyFilter) return false
    // Document type filter
    if (typeFilter !== 'all' && getInvoiceType(inv) !== typeFilter) return false
    // Period filter
    const range = getPeriodRange(periodFilter)
    if (range && inv.issued_date) {
      if (inv.issued_date < range.from || inv.issued_date > range.to) return false
    }
    return true
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortField) {
      case 'number':
        return dir * a.invoice_number.localeCompare(b.invoice_number, 'de', { numeric: true })
      case 'type':
        return dir * getInvoiceType(a).localeCompare(getInvoiceType(b))
      case 'guest': {
        const nameA = `${a.guest_snapshot?.firstname ?? ''} ${a.guest_snapshot?.lastname ?? ''}`.trim()
        const nameB = `${b.guest_snapshot?.firstname ?? ''} ${b.guest_snapshot?.lastname ?? ''}`.trim()
        return dir * nameA.localeCompare(nameB, 'de')
      }
      case 'property': {
        const propA = propertyMap[a.property_id ?? ''] ?? ''
        const propB = propertyMap[b.property_id ?? ''] ?? ''
        return dir * propA.localeCompare(propB, 'de')
      }
      case 'date':
        return dir * (a.issued_date ?? '').localeCompare(b.issued_date ?? '')
      case 'due':
        return dir * (a.due_date ?? '').localeCompare(b.due_date ?? '')
      case 'period':
        return dir * (a.service_period_start ?? '').localeCompare(b.service_period_start ?? '')
      case 'amount':
        return dir * (a.total_gross - b.total_gross)
      case 'status':
        return dir * (a.status ?? '').localeCompare(b.status ?? '')
      default:
        return 0
    }
  })

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  /** Bulk download filtered invoices as ZIP */
  async function handleBulkDownload() {
    if (filteredInvoices.length === 0) return
    setBulkDownloading(true)
    try {
      const zip = new JSZip()
      for (const inv of filteredInvoices) {
        const pdfData = buildPdfData(inv)
        const blob = await pdf(<InvoicePDF data={pdfData} />).toBlob()
        zip.file(`${inv.invoice_number}.pdf`, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rechnungen-${format(new Date(), 'yyyy-MM-dd')}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: `${filteredInvoices.length} Rechnungen heruntergeladen` })
    } finally {
      setBulkDownloading(false)
    }
  }


  async function handleDeleteInvoice(invoiceId: string) {
    await supabase.from('invoices').delete().eq('id', invoiceId)
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId))
    setDeletingInvoiceId(null)
    toast({ title: 'Rechnung gelöscht' })
  }

  /** Handle storno creation via API */
  async function handleCreateStorno() {
    if (!stornoInvoice) return
    setStornoLoading(true)
    try {
      const res = await fetch(`/api/rechnungen/${stornoInvoice.id}/storno`, { method: 'POST' })
      const result = await res.json()
      if (!res.ok) {
        toast({ title: 'Fehler', description: result.error ?? 'Storno fehlgeschlagen', variant: 'destructive' })
        return
      }
      toast({ title: 'Stornorechnung erstellt', description: result.stornoNumber ?? 'Storno erfolgreich' })
      // Refresh invoices list
      const { data: refreshed } = await supabase
        .from('invoices')
        .select(INVOICE_SELECT)
        .order('created_at', { ascending: false })
      if (refreshed) setInvoices(refreshed as unknown as InvoiceRow[])
      setStornoInvoice(null)
    } finally {
      setStornoLoading(false)
    }
  }

  /** Handle gutschrift creation via API */
  async function handleCreateGutschrift() {
    if (!gutschriftInvoice) return

    // Validate: total must not exceed original invoice amount
    const totalGutschrift = gutschriftPositions.reduce((s, p) => s + p.amount, 0)
    // Find existing credit notes for this invoice
    const existingCredits = invoices
      .filter((inv) => inv.cancelled_invoice_id === gutschriftInvoice.id && getInvoiceType(inv) === 'credit_note')
      .reduce((s, inv) => s + Math.abs(inv.total_gross), 0)
    const maxAmount = gutschriftInvoice.total_gross - existingCredits
    if (totalGutschrift > maxAmount) {
      toast({
        title: 'Betrag zu hoch',
        description: `Maximaler Gutschriftsbetrag: ${formatEur(maxAmount)}`,
        variant: 'destructive',
      })
      return
    }
    if (totalGutschrift <= 0) {
      toast({ title: 'Ungültiger Betrag', description: 'Der Gutschriftsbetrag muss positiv sein.', variant: 'destructive' })
      return
    }

    setGutschriftLoading(true)
    try {
      const body: Record<string, unknown> = {
        type: gutschriftType,
        positions: gutschriftPositions.filter((p) => p.amount > 0),
        reason: gutschriftReason.trim() || null,
      }
      if (gutschriftType === 'shortened') {
        body.newNights = gutschriftNewNights
      }

      const res = await fetch(`/api/rechnungen/${gutschriftInvoice.id}/gutschrift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) {
        toast({ title: 'Fehler', description: result.error ?? 'Gutschrift fehlgeschlagen', variant: 'destructive' })
        return
      }
      toast({ title: 'Gutschrift erstellt', description: result.gutschriftNumber ?? 'Gutschrift erfolgreich' })
      // Refresh invoices list
      const { data: refreshed } = await supabase
        .from('invoices')
        .select(INVOICE_SELECT)
        .order('created_at', { ascending: false })
      if (refreshed) setInvoices(refreshed as unknown as InvoiceRow[])
      setGutschriftInvoice(null)
      // Reset form
      setGutschriftPositions([{ description: '', amount: 0, vatRate: 7 }])
      setGutschriftReason('')
      setGutschriftType('simple')
      setGutschriftNewNights(1)
    } finally {
      setGutschriftLoading(false)
    }
  }

  /** Check if an invoice can be storniert */
  function canStorno(inv: InvoiceRow): boolean {
    const type = getInvoiceType(inv)
    if (type !== 'invoice') return false
    if (inv.status !== 'created' && inv.status !== 'paid') return false
    // Check if already has a storno
    const hasStorno = invoices.some(
      (other) => other.cancelled_invoice_id === inv.id && getInvoiceType(other) === 'storno'
    )
    return !hasStorno
  }

  /** Check if a gutschrift can be created for this invoice */
  function canGutschrift(inv: InvoiceRow): boolean {
    const type = getInvoiceType(inv)
    if (type !== 'invoice') return false
    if (inv.status !== 'created' && inv.status !== 'paid') return false
    return true
  }

  /** Get remaining amount available for credit notes */
  function getRemainingCreditAmount(inv: InvoiceRow): number {
    const existingCredits = invoices
      .filter((other) => other.cancelled_invoice_id === inv.id && getInvoiceType(other) === 'credit_note')
      .reduce((s, other) => s + Math.abs(other.total_gross), 0)
    return Math.max(0, inv.total_gross - existingCredits)
  }

  /** Build PDF data from an InvoiceRow (shared between single + bulk download) */
  function buildPdfData(inv: InvoiceRow): InvoicePDFData {
    const ls = inv.landlord_snapshot ?? {}
    const gs = inv.guest_snapshot ?? {}
    const items = (inv.line_items ?? []) as InvoiceRow['line_items']
    const isKlein = inv.is_kleinunternehmer ?? false
    const paymentDays = settings?.invoice_payment_days ?? 14

    const landlordStreet = ls.street ?? ''
    const landlordZipCity = [ls.zip, ls.city].filter(Boolean).join(' ')

    // Prefer individual address fields (updated by sync-guest) over legacy combined "address" string
    const guestAddr = gs.street
      ? [gs.street, [gs.zip, gs.city].filter(Boolean).join(' '), gs.country]
          .filter(Boolean)
          .join(', ')
      : (gs.address ?? '')

    const pdfLineItems: InvoiceLineItem[] = items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      vatRate: i.vat_rate,
      vatAmount: i.vat_amount,
      total: i.total,
    }))

    const booking = inv.booking_id
      ? bookings.find((b) => b.id === inv.booking_id)
      : null

    // Anreise/Abreise = always the full booking dates
    const bookingCheckIn = booking?.check_in ?? inv.service_period_start
    const bookingCheckOut = booking?.check_out ?? inv.service_period_end
    const checkIn = bookingCheckIn
      ? format(new Date(bookingCheckIn + 'T00:00:00'), 'dd.MM.yyyy')
      : ''
    const checkOut = bookingCheckOut
      ? format(new Date(bookingCheckOut + 'T00:00:00'), 'dd.MM.yyyy')
      : ''

    // Leistungszeitraum = only for split invoices (when segment differs from booking dates)
    const isSplit = inv.service_period_start && inv.service_period_end
      && booking
      && (inv.service_period_start !== booking.check_in || inv.service_period_end !== booking.check_out)
    const servicePeriod = isSplit
      ? `${format(new Date(inv.service_period_start! + 'T00:00:00'), 'dd.MM.yyyy')} – ${format(new Date(inv.service_period_end! + 'T00:00:00'), 'dd.MM.yyyy')}`
      : ''
    const channel = (gs as Record<string, string>).payment_channel ?? booking?.channel ?? ''
    const isOta = channel && channel.toLowerCase() !== 'direct' && channel !== ''
    const amountPaid = isOta ? inv.total_gross : 0

    return {
      invoiceNumber: inv.invoice_number,
      issuedDate: inv.issued_date
        ? format(new Date(inv.issued_date + 'T00:00:00'), 'dd.MM.yyyy')
        : '',
      dueDate: inv.due_date
        ? format(new Date(inv.due_date + 'T00:00:00'), 'dd.MM.yyyy')
        : '',
      servicePeriod,
      checkIn,
      checkOut,
      landlordName: ls.name ?? '',
      landlordAddress: [landlordStreet, landlordZipCity].filter(Boolean).join(', '),
      landlordStreet,
      landlordZipCity,
      landlordCountry: ls.country ?? 'Deutschland',
      taxNumber: ls.tax_number || undefined,
      vatId: ls.vat_id || undefined,
      phone: ls.phone || undefined,
      email: ls.email || undefined,
      website: ls.website || undefined,
      guestName: gs.invoice_recipient === 'company' && gs.company_name
        ? gs.company_name
        : [gs.firstname, gs.lastname].filter(Boolean).join(' '),
      guestAddress: gs.invoice_recipient === 'company' && gs.company_street
        ? [gs.company_street, [gs.company_zip, gs.company_city].filter(Boolean).join(' '), gs.company_country].filter(Boolean).join(', ')
        : guestAddr,
      guestStreet: gs.invoice_recipient === 'company' && gs.company_street
        ? gs.company_street
        : (gs.street || undefined),
      guestZipCity: gs.invoice_recipient === 'company' && gs.company_city
        ? [gs.company_zip, gs.company_city].filter(Boolean).join(' ') || undefined
        : ([gs.zip, gs.city].filter(Boolean).join(' ') || undefined),
      guestCountry: gs.invoice_recipient === 'company'
        ? (gs.company_country || undefined)
        : (gs.country || undefined),
      bookingReference: (gs as Record<string, string>).booking_reference || booking?.external_id?.toString() || undefined,
      guestCount: (gs as Record<string, string>).guest_count
        ? Number((gs as Record<string, string>).guest_count)
        : (booking ? ((booking.adults ?? 0) + (booking.children ?? 0)) || undefined : undefined),
      paymentChannel: channel || undefined,
      amountPaid,
      lineItems: pdfLineItems,
      subtotalNet: inv.subtotal_net,
      vat7Net: inv.vat_7_net ?? 0,
      vat7Amount: inv.vat_7_amount ?? 0,
      vat19Net: inv.vat_19_net ?? 0,
      vat19Amount: inv.vat_19_amount ?? 0,
      totalVat: inv.total_vat,
      totalGross: inv.total_gross,
      bankIban: ls.bank_iban || undefined,
      bankBic: ls.bank_bic || undefined,
      bankName: ls.bank_name || undefined,
      paymentDays,
      isKleinunternehmer: isKlein,
      logoUrl: ls.logo_url || undefined,
      companyRegister: ls.company_register || undefined,
      managingDirector: ls.managing_director || undefined,
      thankYouText: ls.invoice_thank_you_text || undefined,
      notes: inv.notes || undefined,
      notesFooter: inv.notes_footer || undefined,
      paymentSchedule: (inv.payment_schedule as PaymentScheduleEntry[] | null) || undefined,
      // Storno / Gutschrift PDF overrides
      ...(() => {
        const invType = getInvoiceType(inv)
        if (invType === 'storno') {
          const originalInv = inv.cancelled_invoice_id
            ? invoices.find((o) => o.id === inv.cancelled_invoice_id)
            : null
          const originalDate = originalInv?.issued_date
            ? format(new Date(originalInv.issued_date + 'T00:00:00'), 'dd.MM.yyyy')
            : ''
          return {
            documentTitle: 'Stornorechnung',
            referenceText: originalInv
              ? `Storno zu Rechnung ${originalInv.invoice_number} vom ${originalDate}`
              : undefined,
          }
        }
        if (invType === 'credit_note') {
          const originalInv = inv.cancelled_invoice_id
            ? invoices.find((o) => o.id === inv.cancelled_invoice_id)
            : null
          const originalDate = originalInv?.issued_date
            ? format(new Date(originalInv.issued_date + 'T00:00:00'), 'dd.MM.yyyy')
            : ''
          return {
            documentTitle: 'Gutschrift',
            referenceText: originalInv
              ? `Gutschrift zu Rechnung ${originalInv.invoice_number} vom ${originalDate}`
              : undefined,
          }
        }
        return {}
      })(),
    }
  }

  function buildDunningData(inv: InvoiceRow): DunningData {
    const gs = (inv.guest_snapshot ?? {}) as Record<string, string>
    const ls = (inv.landlord_snapshot ?? {}) as Record<string, string>
    const guestName = [gs.firstname, gs.lastname].filter(Boolean).join(' ')
    const booking = inv.booking_id ? bookings.find((b) => b.id === inv.booking_id) : null
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const payLink = booking ? `${siteUrl}/pay/${booking.id}` : ''

    return {
      salutation: guestName ? `Sehr geehrte(r) ${guestName}` : 'Sehr geehrte Damen und Herren',
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.issued_date ? format(new Date(inv.issued_date + 'T00:00:00'), 'dd.MM.yyyy') : '',
      dueDate: inv.due_date ? format(new Date(inv.due_date + 'T00:00:00'), 'dd.MM.yyyy') : '',
      totalAmount: formatEur(inv.total_gross),
      openAmount: formatEur(inv.total_gross),
      companyName: ls.name ?? '',
      iban: ls.bank_iban || undefined,
      bic: ls.bank_bic || undefined,
      bankName: ls.bank_name || undefined,
      paymentLink: payLink || undefined,
      guestEmail: (booking?.guest_email as string) ?? undefined,
      propertyName: booking?.properties?.name ?? undefined,
    }
  }

  function buildDunningPdfData(inv: InvoiceRow, type: DunningType): DunningPDFData {
    const gs = (inv.guest_snapshot ?? {}) as Record<string, string>
    const ls = (inv.landlord_snapshot ?? {}) as Record<string, string>
    const guestName = [gs.firstname, gs.lastname].filter(Boolean).join(' ')
    const booking = inv.booking_id ? bookings.find((b) => b.id === inv.booking_id) : null
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const payLink = booking ? `${siteUrl}/pay/${booking.id}` : ''

    return {
      type,
      guestName: gs.invoice_recipient === 'company' && gs.company_name
        ? gs.company_name
        : guestName,
      guestStreet: gs.invoice_recipient === 'company' && gs.company_street
        ? gs.company_street
        : (gs.street || undefined),
      guestZipCity: gs.invoice_recipient === 'company' && gs.company_city
        ? [gs.company_zip, gs.company_city].filter(Boolean).join(' ') || undefined
        : ([gs.zip, gs.city].filter(Boolean).join(' ') || undefined),
      guestCountry: gs.invoice_recipient === 'company'
        ? (gs.company_country || undefined)
        : (gs.country || undefined),
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.issued_date ? format(new Date(inv.issued_date + 'T00:00:00'), 'dd.MM.yyyy') : '',
      dueDate: inv.due_date ? format(new Date(inv.due_date + 'T00:00:00'), 'dd.MM.yyyy') : '',
      totalAmount: formatEur(inv.total_gross),
      openAmount: formatEur(inv.total_gross),
      documentDate: format(new Date(), 'dd.MM.yyyy'),
      landlordName: ls.name ?? '',
      landlordStreet: ls.street ?? '',
      landlordZipCity: [ls.zip, ls.city].filter(Boolean).join(' '),
      landlordCountry: ls.country ?? 'Deutschland',
      taxNumber: ls.tax_number || undefined,
      vatId: ls.vat_id || undefined,
      companyRegister: ls.company_register || undefined,
      managingDirector: ls.managing_director || undefined,
      bankName: ls.bank_name || undefined,
      bankIban: ls.bank_iban || undefined,
      bankBic: ls.bank_bic || undefined,
      logoUrl: ls.logo_url || undefined,
      paymentLink: payLink || undefined,
    }
  }

  async function handleCopyDunningEmail() {
    if (!dunningInvoice) return
    const data = buildDunningData(dunningInvoice)
    const html = generateDunningEmailHtml(dunningType, data)
    await copyHtmlToClipboard(html)
    setDunningCopied(true)
    setTimeout(() => setDunningCopied(false), 2000)
    toast({ title: 'E-Mail-Text kopiert', description: 'Kann jetzt in Gmail/Outlook eingefügt werden.' })
  }

  async function handleDownloadDunningPdf() {
    if (!dunningInvoice) return
    setDunningDownloading(true)
    try {
      const pdfData = buildDunningPdfData(dunningInvoice, dunningType)
      const blob = await pdf(<DunningPDF data={pdfData} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${DUNNING_LABELS[dunningType]}_${dunningInvoice.invoice_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDunningDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      {splitting && (
        <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Rechnungen werden monatsweise aufgeteilt...
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Rechnungen</h2>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/buchungen?create=true">
              <Plus className="mr-2 h-4 w-4" />
              Buchung anlegen
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={bulkDownloading || filteredInvoices.length === 0}
            onClick={handleBulkDownload}
          >
            <Archive className="mr-2 h-4 w-4" />
            {bulkDownloading ? 'Wird erstellt...' : `Alle herunterladen (${filteredInvoices.length})`}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setSelectedBookingId('')
                  setSelectedPropertyId('')
                  setGuestName('')
                  setGuestStreet('')
                  setGuestZip('')
                  setGuestCity('')
                  setGuestCountry('')
                  setServicePeriodStart('')
                  setServicePeriodEnd('')
                  setLineItems([{ description: '', quantity: 1, unitPrice: 0, vatRate: 19, vatAmount: 0, total: 0 }])
                  setBhstIncluded([true])
                  setIssuedDate(format(new Date(), 'yyyy-MM-dd'))
                  setDueDate(format(addDays(new Date(), settings?.invoice_payment_days ?? 14), 'yyyy-MM-dd'))
                  setDueDateManual(false)
                  setNotes('')
                  setNotesFooter('')
                  setPaymentScheduleEnabled(false)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Neue Rechnung
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Rechnung erstellen
                {splitBooking && servicePeriodStart && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    – {format(new Date(servicePeriodStart + 'T00:00:00'), 'MMMM yyyy', { locale: de })}
                    {splitQueue.length > 0 && ` (${splitQueue.length} weitere)`}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Booking selector (optional) */}
              <div className="space-y-2">
                <Label>Aus Buchung vorausfüllen (optional)</Label>
                <Select
                  value={selectedBookingId}
                  onValueChange={(v) => {
                    if (v === '__none__') {
                      setSelectedBookingId('')
                      setSelectedPropertyId('')
                      return
                    }
                    const booking = bookings.find((b) => b.id === v)
                    if (booking) fillFromBooking(booking, settings, cityRules)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ohne Buchung (freie Rechnung)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Ohne Buchung (freie Rechnung)</SelectItem>
                    {bookings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {[b.guest_firstname, b.guest_lastname].filter(Boolean).join(' ') || 'Unbekannt'}{' '}
                        – {b.check_in} ({formatEur(b.amount_gross ?? 0)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Property selector for free invoices (without booking) */}
              {!selectedBookingId && (
                <div className="space-y-2">
                  <Label>Objekt (optional)</Label>
                  <Select
                    value={selectedPropertyId}
                    onValueChange={(v) => {
                      if (v === '__none__') {
                        setSelectedPropertyId('')
                        return
                      }
                      setSelectedPropertyId(v)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Kein Objekt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Kein Objekt</SelectItem>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Guest & date */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Empfänger (Gast)</Label>
                  {syncingGuest && (
                    <p className="text-xs text-muted-foreground animate-pulse">Adresse wird aus Smoobu geladen…</p>
                  )}
                  <Input value={guestName} onChange={(e) => { dirtyGuestFields.current.add('guestName'); setGuestName(e.target.value) }} placeholder="Name" />
                  <Input
                    value={guestStreet}
                    onChange={(e) => { dirtyGuestFields.current.add('guestStreet'); setGuestStreet(e.target.value) }}
                    placeholder="Straße, Nr."
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={guestZip} onChange={(e) => { dirtyGuestFields.current.add('guestZip'); setGuestZip(e.target.value) }} placeholder="PLZ" />
                    <Input value={guestCity} onChange={(e) => { dirtyGuestFields.current.add('guestCity'); setGuestCity(e.target.value) }} placeholder="Ort" className="col-span-2" />
                  </div>
                  <Input value={guestCountry} onChange={(e) => { dirtyGuestFields.current.add('guestCountry'); setGuestCountry(e.target.value) }} placeholder="Land" />
                </div>
                <div className="space-y-2">
                  <Label>Rechnungsdatum</Label>
                  <Input type="date" value={issuedDate} onChange={(e) => {
                    setIssuedDate(e.target.value)
                    if (!dueDateManual && e.target.value) {
                      setDueDate(format(addDays(new Date(e.target.value), settings?.invoice_payment_days ?? 14), 'yyyy-MM-dd'))
                    }
                  }} />
                  <Label>Fälligkeitsdatum</Label>
                  <Input type="date" value={dueDate} onChange={(e) => {
                    setDueDate(e.target.value)
                    setDueDateManual(true)
                  }} />
                  <Label>Leistungszeitraum (optional)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={servicePeriodStart} onChange={(e) => setServicePeriodStart(e.target.value)} placeholder="Von" />
                    <Input type="date" value={servicePeriodEnd} onChange={(e) => setServicePeriodEnd(e.target.value)} placeholder="Bis" />
                  </div>
                </div>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Positionen</Label>
                  <Button variant="outline" size="sm" onClick={addLineItem}>
                    <Plus className="mr-1 h-3 w-3" />
                    Position
                  </Button>
                </div>
                <div className="space-y-2 overflow-x-auto">
                  {lineItems.map((item, i) => {
                    const isKlein = settings?.is_kleinunternehmer ?? false
                    const grossUnitPrice = isKlein || item.vatRate === 0
                      ? item.unitPrice
                      : Math.round(item.unitPrice * (1 + item.vatRate / 100) * 100) / 100
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end min-w-[600px]">
                        <div className="col-span-3">
                          {i === 0 && <Label className="text-xs">Beschreibung</Label>}
                          <Input
                            value={item.description}
                            onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                            placeholder="Leistung"
                          />
                        </div>
                        <div className="col-span-1">
                          {i === 0 && <Label className="text-xs">Menge</Label>}
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateLineItem(i, 'quantity', Number(e.target.value))}
                          />
                        </div>
                        <div className="col-span-2">
                          {i === 0 && <Label className="text-xs">Netto-EP</Label>}
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateLineItem(i, 'unitPrice', Number(e.target.value))}
                          />
                        </div>
                        <div className="col-span-2">
                          {i === 0 && <Label className="text-xs">Brutto-EP</Label>}
                          <Input
                            type="number"
                            step="0.01"
                            value={grossUnitPrice}
                            onChange={(e) => updateLineItem(i, 'unitPriceGross', Number(e.target.value))}
                          />
                        </div>
                        <div className="col-span-1">
                          {i === 0 && <Label className="text-xs">USt%</Label>}
                          <Select
                            value={String(item.vatRate)}
                            onValueChange={(v) => updateLineItem(i, 'vatRate', Number(v))}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="7">7%</SelectItem>
                              <SelectItem value="19">19%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          {i === 0 && <Label className="text-xs">Gesamt</Label>}
                          <Input value={formatEur(item.total)} disabled />
                        </div>
                        <div className="col-span-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLineItem(i)}
                            className="text-destructive"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* BhSt-Relevanz: Checkboxen für jede Position */}
                {lineItems.some(i => isBhStItem(i)) && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">BhSt-Berechnung – welche Positionen fließen ein?</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {lineItems.map((item, i) => {
                        if (isBhStItem(item)) return null
                        return (
                          <label key={i} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <Checkbox
                              checked={bhstIncluded[i] ?? true}
                              onCheckedChange={(checked) => {
                                const newFlags = [...bhstIncluded]
                                newFlags[i] = checked === true
                                setBhstIncluded(newFlags)
                                setLineItems(prev => recalcBhSt(prev, newFlags))
                              }}
                            />
                            <span className="truncate max-w-[200px]">{item.description || `Position ${i + 1}`}</span>
                            <span className="text-muted-foreground">({formatEur(item.total)})</span>
                          </label>
                        )
                      })}
                    </div>
                    {(() => {
                      const bhstItem = lineItems.find(i => isBhStItem(i))
                      return bhstItem ? (
                        <p className="text-xs text-muted-foreground">
                          → BhSt: {formatEur(bhstItem.unitPrice)} (Basis: {formatEur(
                            lineItems.reduce((sum, item, idx) => {
                              if (isBhStItem(item)) return sum
                              if (!bhstIncluded[idx]) return sum
                              return sum + item.total
                            }, 0)
                          )})
                        </p>
                      ) : null
                    })()}
                  </div>
                )}

                {/* Totals – aufgeschlüsselt nach MwSt-Satz */}
                {lineItems.length > 0 && (() => {
                  const groups: Record<number, { net: number; vat: number; gross: number }> = {}
                  for (const item of lineItems) {
                    const rate = item.vatRate ?? 0
                    if (!groups[rate]) groups[rate] = { net: 0, vat: 0, gross: 0 }
                    groups[rate].net += item.total - item.vatAmount
                    groups[rate].vat += item.vatAmount
                    groups[rate].gross += item.total
                  }
                  const entries = Object.entries(groups)
                    .map(([r, v]) => ({ rate: Number(r), ...v }))
                    .filter((e) => e.net !== 0)
                    .sort((a, b) => a.rate - b.rate)
                  const totalNet = entries.reduce((s, e) => s + e.net, 0)
                  const totalVat = entries.reduce((s, e) => s + e.vat, 0)
                  const totalGross = entries.reduce((s, e) => s + e.gross, 0)

                  return (
                    <div className="text-right space-y-1 pt-2 border-t text-sm">
                      {entries.map((e) => (
                        <p key={`net-${e.rate}`}>
                          Nettobetrag {e.rate > 0 ? `${e.rate}%` : '0%'}: {formatEur(e.net)}
                        </p>
                      ))}
                      <div className="border-t pt-1 mt-1">
                        <p>Netto gesamt: {formatEur(totalNet)}</p>
                      </div>
                      {!settings?.is_kleinunternehmer && entries.map((e) => (
                        <p key={`vat-${e.rate}`}>
                          Umsatzsteuer {e.rate > 0 ? `${e.rate}%` : '0%'}: {formatEur(e.vat)}
                        </p>
                      ))}
                      <div className="border-t pt-1 mt-1">
                        <p className="text-base font-bold">
                          Rechnungsbetrag: {formatEur(totalGross)}
                        </p>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Notiz / Anschreiben */}
              <div className="space-y-2">
                <Label>Notiz / Anschreiben (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="z.B. Vielen Dank für Ihren Aufenthalt..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Erscheint auf dem PDF zwischen Titel und Positionen.
                </p>
              </div>

              {/* Zahlungsplan / Ratenzahlung */}
              {(() => {
                const hasServicePeriod = servicePeriodStart && servicePeriodEnd
                const monthCount = hasServicePeriod
                  ? (() => {
                      const ciDate = new Date(servicePeriodStart + 'T00:00:00')
                      const coDate = new Date(servicePeriodEnd + 'T00:00:00')
                      const months =
                        (coDate.getFullYear() - ciDate.getFullYear()) * 12 +
                        (coDate.getMonth() - ciDate.getMonth()) + 1
                      return months
                    })()
                  : 0
                const canEnable = hasServicePeriod && monthCount >= 2
                const totalGross = lineItems.reduce((s, i) => s + i.total, 0)

                // Compute payment schedule entries
                const scheduleEntries: PaymentScheduleEntry[] = []
                if (paymentScheduleEnabled && canEnable && totalGross > 0) {
                  const ciDate = new Date(servicePeriodStart + 'T00:00:00')
                  const coDate = new Date(servicePeriodEnd + 'T00:00:00')
                  const months =
                    (coDate.getFullYear() - ciDate.getFullYear()) * 12 +
                    (coDate.getMonth() - ciDate.getMonth()) + 1
                  const perMonth = Math.round((totalGross / months) * 100) / 100
                  for (let m = 0; m < months; m++) {
                    const dueDate = new Date(ciDate.getFullYear(), ciDate.getMonth() + m, 1)
                    const amount = m < months - 1
                      ? perMonth
                      : Math.round((totalGross - perMonth * (months - 1)) * 100) / 100
                    scheduleEntries.push({
                      due_date: format(dueDate, 'yyyy-MM-dd'),
                      amount,
                    })
                  }
                }

                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="payment-schedule"
                        checked={paymentScheduleEnabled}
                        onCheckedChange={(checked) => setPaymentScheduleEnabled(!!checked)}
                        disabled={!canEnable}
                      />
                      <Label htmlFor="payment-schedule" className={!canEnable ? 'text-muted-foreground' : ''}>
                        Zahlungsplan (monatliche Raten)
                      </Label>
                      {!canEnable && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{!hasServicePeriod ? 'Bitte zuerst eine Buchung mit Anreise und Abreise wählen.' : 'Ratenzahlung ab 2 Monaten Aufenthaltsdauer'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>

                    {/* Zahlungsplan Vorschau */}
                    {paymentScheduleEnabled && scheduleEntries.length > 0 && (
                      <div className="rounded-md border p-3 space-y-1 text-sm">
                        <p className="font-medium text-xs text-muted-foreground mb-2">Zahlungsplan-Vorschau:</p>
                        {scheduleEntries.map((entry, i) => (
                          <div key={i} className="flex justify-between">
                            <span>{format(new Date(entry.due_date + 'T00:00:00'), 'dd.MM.yyyy')}</span>
                            <span>{formatEur(entry.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t pt-1 mt-1 font-medium">
                          <span>Gesamt:</span>
                          <span>{formatEur(scheduleEntries.reduce((s, e) => s + e.amount, 0))}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Schlusstext / Fußnote */}
              <div className="space-y-2">
                <Label>Schlusstext unter der Rechnung (optional)</Label>
                <Textarea
                  value={notesFooter}
                  onChange={(e) => setNotesFooter(e.target.value)}
                  placeholder="z.B. Zahlungsbedingungen, Hinweise..."
                  rows={3}
                />
              </div>

              <Button
                className="w-full"
                disabled={lineItems.length === 0 || !guestName || generating}
                onClick={handleSave}
              >
                <FileText className="mr-2 h-4 w-4" />
                {generating ? 'Wird gespeichert...' : 'Speichern'}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Gast suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
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
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alle Zeiträume" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Zeiträume</SelectItem>
            <SelectItem value="this_year">Dieses Jahr</SelectItem>
            <SelectItem value="q1">Q1 (Jan–Mär)</SelectItem>
            <SelectItem value="q2">Q2 (Apr–Jun)</SelectItem>
            <SelectItem value="q3">Q3 (Jul–Sep)</SelectItem>
            <SelectItem value="q4">Q4 (Okt–Dez)</SelectItem>
            <SelectItem value="last_year">Letztes Jahr</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | InvoiceType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alle Dokumenttypen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Dokumenttypen</SelectItem>
            <SelectItem value="invoice">Rechnungen</SelectItem>
            <SelectItem value="storno">Stornorechnungen</SelectItem>
            <SelectItem value="credit_note">Gutschriften</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice archive */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Rechnungsarchiv
            {filteredInvoices.length !== invoices.length && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filteredInvoices.length} von {invoices.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {invoices.length === 0 ? 'Noch keine Rechnungen erstellt' : 'Keine Rechnungen für diesen Filter'}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('number')}>
                      <span className="inline-flex items-center gap-1">Nummer <ArrowUpDown className={`h-3 w-3 ${sortField === 'number' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('type')}>
                      <span className="inline-flex items-center gap-1">Typ <ArrowUpDown className={`h-3 w-3 ${sortField === 'type' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('guest')}>
                      <span className="inline-flex items-center gap-1">Gast <ArrowUpDown className={`h-3 w-3 ${sortField === 'guest' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('property')}>
                      <span className="inline-flex items-center gap-1">Wohnung <ArrowUpDown className={`h-3 w-3 ${sortField === 'property' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('date')}>
                      <span className="inline-flex items-center gap-1">Rechnungsdatum <ArrowUpDown className={`h-3 w-3 ${sortField === 'date' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('due')}>
                      <span className="inline-flex items-center gap-1">Fällig am <ArrowUpDown className={`h-3 w-3 ${sortField === 'due' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('period')}>
                      <span className="inline-flex items-center gap-1">Zeitraum <ArrowUpDown className={`h-3 w-3 ${sortField === 'period' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                      <span className="inline-flex items-center gap-1 justify-end w-full">Betrag <ArrowUpDown className={`h-3 w-3 ${sortField === 'amount' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                      <span className="inline-flex items-center gap-1">Status <ArrowUpDown className={`h-3 w-3 ${sortField === 'status' ? 'opacity-100' : 'opacity-30'}`} /></span>
                    </TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => {
                    const invType = getInvoiceType(inv)
                    return (
                    <TableRow key={inv.id} className={inv.status === 'cancelled' ? 'opacity-60' : ''}>
                      <TableCell className="font-medium font-mono text-sm">
                        {inv.status === 'cancelled' ? (
                          <span className="line-through">{inv.invoice_number}</span>
                        ) : (
                          inv.invoice_number
                        )}
                      </TableCell>
                      <TableCell>
                        {invType === 'storno' ? (
                          <Badge variant="destructive">Storno</Badge>
                        ) : invType === 'credit_note' ? (
                          <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Gutschrift</Badge>
                        ) : (
                          <Badge variant="secondary">Rechnung</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {inv.guest_snapshot?.firstname} {inv.guest_snapshot?.lastname}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {propertyMap[inv.property_id ?? ''] ?? '–'}
                      </TableCell>
                      <TableCell>
                        {inv.issued_date
                          ? format(new Date(inv.issued_date), 'dd.MM.yyyy')
                          : '–'}
                      </TableCell>
                      <TableCell>
                        {inv.due_date
                          ? format(new Date(inv.due_date), 'dd.MM.yyyy')
                          : '–'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {inv.service_period_start && inv.service_period_end
                          ? `${format(new Date(inv.service_period_start), 'dd.MM.')} – ${format(new Date(inv.service_period_end), 'dd.MM.yyyy')}`
                          : '–'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatEur(inv.total_gross)}
                      </TableCell>
                      <TableCell>
                        {inv.status === 'cancelled' ? (
                          <Badge variant="destructive">{STATUS_LABELS[inv.status]}</Badge>
                        ) : invType !== 'invoice' ? (
                          <Badge variant="outline">{STATUS_LABELS[inv.status] ?? inv.status}</Badge>
                        ) : (
                          <Select
                            value={inv.status}
                            onValueChange={(v) => updateStatus(inv.id, v)}
                          >
                            <SelectTrigger className="h-7 w-[110px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">{STATUS_LABELS.draft}</SelectItem>
                              <SelectItem value="created">{STATUS_LABELS.created}</SelectItem>
                              <SelectItem value="sent">{STATUS_LABELS.sent}</SelectItem>
                              <SelectItem value="paid">{STATUS_LABELS.paid}</SelectItem>
                              <SelectItem value="cancelled">{STATUS_LABELS.cancelled}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={downloading === inv.id}
                            onClick={() => handleDownloadPDF(inv)}
                            title="PDF herunterladen"
                          >
                            {downloading === inv.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Download className="h-4 w-4" />}
                          </Button>
                          {invType === 'invoice' && inv.status !== 'cancelled' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDunningInvoice(inv)
                                  setDunningType('reminder')
                                  setDunningCopied(false)
                                  setDunningDialogOpen(true)
                                }}
                                title="Mahnung / Erinnerung"
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                              {canStorno(inv) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setStornoInvoice(inv)}
                                  title="Storno erstellen"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                              {canGutschrift(inv) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setGutschriftInvoice(inv)
                                    setGutschriftPositions([{ description: '', amount: 0, vatRate: 7 }])
                                    setGutschriftReason('')
                                    setGutschriftType('simple')
                                    setGutschriftNewNights(1)
                                  }}
                                  title="Gutschrift erstellen"
                                  className="text-orange-600 hover:text-orange-700"
                                >
                                  <CreditCard className="h-4 w-4" />
                                </Button>
                              )}
                              {inv.booking_id && inv.status === 'draft' && (() => {
                                const bk = bookings.find(b => b.id === inv.booking_id)
                                if (!bk) return null
                                const segs = calculateSplitSegments(bk)
                                if (segs.length <= 1) return null
                                return (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openSplitPreview(bk)}
                                    title="Rechnung aufteilen"
                                    className="text-blue-600 hover:text-blue-700"
                                  >
                                    <Archive className="h-4 w-4" />
                                  </Button>
                                )
                              })()}
                            </>
                          )}
                          {invType === 'invoice' && inv.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeletingInvoiceId(inv.id)}
                              title="Löschen"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={!!deletingInvoiceId} onOpenChange={(open) => { if (!open) setDeletingInvoiceId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Rechnung wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingInvoiceId && handleDeleteInvoice(deletingInvoiceId)}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dunning Dialog */}
      <Dialog open={dunningDialogOpen} onOpenChange={setDunningDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Zahlungserinnerung / Mahnung</DialogTitle>
          </DialogHeader>
          {dunningInvoice && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-4">
                <div className="space-y-1 flex-1">
                  <Label>Vorlage</Label>
                  <Select value={dunningType} onValueChange={(v) => { setDunningType(v as DunningType); setDunningCopied(false) }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reminder">Zahlungserinnerung</SelectItem>
                      <SelectItem value="dunning1">1. Mahnung</SelectItem>
                      <SelectItem value="dunning2">2. Mahnung (mit Inkasso-Hinweis)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-muted-foreground pt-5">
                  Rechnung {dunningInvoice.invoice_number} – {formatEur(dunningInvoice.total_gross)}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Textvorschau</Label>
                <Textarea
                  readOnly
                  rows={14}
                  className="font-mono text-xs resize-none"
                  value={getDunningText(dunningType, buildDunningData(dunningInvoice))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleCopyDunningEmail} variant="outline">
                  {dunningCopied
                    ? <><Check className="mr-2 h-4 w-4 text-green-600" />Kopiert!</>
                    : <><Copy className="mr-2 h-4 w-4" />E-Mail-Text kopieren</>}
                </Button>
                <Button onClick={handleDownloadDunningPdf} disabled={dunningDownloading}>
                  {dunningDownloading
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Download className="mr-2 h-4 w-4" />}
                  PDF herunterladen
                </Button>
              </div>

              {buildDunningData(dunningInvoice).guestEmail && (
                <p className="text-xs text-muted-foreground">
                  Gast-E-Mail: {buildDunningData(dunningInvoice).guestEmail}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Storno Confirmation Dialog */}
      <AlertDialog open={!!stornoInvoice} onOpenChange={(open) => { if (!open) setStornoInvoice(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              {stornoInvoice && (
                <>
                  Möchten Sie Rechnung <span className="font-semibold">{stornoInvoice.invoice_number}</span> vollständig stornieren?
                  <br /><br />
                  Es wird eine Stornorechnung mit negativen Beträgen erstellt. Die Originalrechnung erhält den Status &quot;Storniert&quot; und der Buchungsbetrag wird auf 0 gesetzt. Diese Aktion kann nicht rückgängig gemacht werden.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stornoLoading}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={stornoLoading}
              onClick={(e) => {
                e.preventDefault()
                handleCreateStorno()
              }}
            >
              {stornoLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wird erstellt...</>
              ) : (
                'Storno erstellen'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gutschrift Dialog */}
      <Dialog open={!!gutschriftInvoice} onOpenChange={(open) => { if (!open) { setGutschriftInvoice(null); setGutschriftPositions([{ description: '', amount: 0, vatRate: 7 }]); setGutschriftReason(''); setGutschriftType('simple'); setGutschriftNewNights(1) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gutschrift erstellen</DialogTitle>
          </DialogHeader>
          {gutschriftInvoice && (() => {
            const remaining = getRemainingCreditAmount(gutschriftInvoice)
            const currentTotal = gutschriftPositions.reduce((s, p) => s + p.amount, 0)
            const booking = gutschriftInvoice.booking_id
              ? bookings.find((b) => b.id === gutschriftInvoice.booking_id)
              : null
            const currentNights = booking?.nights ?? 0

            return (
              <div className="space-y-4 py-2">
                {/* Reference info */}
                <div className="rounded-md border p-3 bg-muted/50 text-sm space-y-1">
                  <p>
                    Gutschrift zu Rechnung <span className="font-semibold font-mono">{gutschriftInvoice.invoice_number}</span>
                    {gutschriftInvoice.issued_date && (
                      <> vom {format(new Date(gutschriftInvoice.issued_date + 'T00:00:00'), 'dd.MM.yyyy')}</>
                    )}
                  </p>
                  <p>Rechnungsbetrag: <span className="font-semibold">{formatEur(gutschriftInvoice.total_gross)}</span></p>
                  {remaining < gutschriftInvoice.total_gross && (
                    <p className="text-orange-600">
                      Bereits erstattet: {formatEur(gutschriftInvoice.total_gross - remaining)} — Verbleibend: <span className="font-semibold">{formatEur(remaining)}</span>
                    </p>
                  )}
                </div>

                {/* Type selection */}
                <div className="space-y-2">
                  <Label>Art der Gutschrift</Label>
                  <Select value={gutschriftType} onValueChange={(v) => setGutschriftType(v as 'simple' | 'shortened')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Einfache Erstattung</SelectItem>
                      <SelectItem value="shortened">Aufenthaltsverkürzung</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {gutschriftType === 'simple'
                      ? 'Teilerstattung ohne Änderung der Beherbergungssteuer (z.B. Mangel, Kulanz).'
                      : 'Der Aufenthalt wird verkürzt. Buchungsbetrag und Beherbergungssteuer werden neu berechnet.'}
                  </p>
                </div>

                {/* Shortened stay: new nights input */}
                {gutschriftType === 'shortened' && booking && (
                  <div className="space-y-2">
                    <Label>Neue Nächteanzahl</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={currentNights - 1}
                        value={gutschriftNewNights}
                        onChange={(e) => setGutschriftNewNights(Math.max(1, Number(e.target.value)))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        von aktuell {currentNights} Nächten
                      </span>
                    </div>
                    {gutschriftNewNights >= currentNights && (
                      <p className="text-xs text-destructive">
                        Die neue Nächteanzahl muss kleiner als die aktuelle sein ({currentNights}). Für eine vollständige Stornierung verwenden Sie bitte die Storno-Funktion.
                      </p>
                    )}
                  </div>
                )}

                {/* Positions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Positionen (Erstattungsbeträge)</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGutschriftPositions((prev) => [...prev, { description: '', amount: 0, vatRate: 7 }])}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Position
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {gutschriftPositions.map((pos, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          {i === 0 && <Label className="text-xs">Beschreibung</Label>}
                          <Input
                            value={pos.description}
                            onChange={(e) => {
                              const updated = [...gutschriftPositions]
                              updated[i] = { ...updated[i], description: e.target.value }
                              setGutschriftPositions(updated)
                            }}
                            placeholder="z.B. Teilerstattung Wasserschaden"
                          />
                        </div>
                        <div className="col-span-3">
                          {i === 0 && <Label className="text-xs">Bruttobetrag</Label>}
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={pos.amount || ''}
                            onChange={(e) => {
                              const updated = [...gutschriftPositions]
                              updated[i] = { ...updated[i], amount: Number(e.target.value) }
                              setGutschriftPositions(updated)
                            }}
                            placeholder="0,00"
                          />
                        </div>
                        <div className="col-span-2">
                          {i === 0 && <Label className="text-xs">USt%</Label>}
                          <Select
                            value={String(pos.vatRate)}
                            onValueChange={(v) => {
                              const updated = [...gutschriftPositions]
                              updated[i] = { ...updated[i], vatRate: Number(v) }
                              setGutschriftPositions(updated)
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="7">7%</SelectItem>
                              <SelectItem value="19">19%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          {gutschriftPositions.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setGutschriftPositions((prev) => prev.filter((_, idx) => idx !== i))}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reason / Info */}
                <div className="space-y-2">
                  <Label>Grund / Info (optional)</Label>
                  <Textarea
                    value={gutschriftReason}
                    onChange={(e) => setGutschriftReason(e.target.value)}
                    placeholder="z.B. Erstattung wegen defekter Heizung am 15.03.2026"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Wird als Notiz auf der Gutschrift angezeigt.
                  </p>
                </div>

                {/* Summary */}
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Gutschriftsbetrag:</span>
                    <span className="font-semibold">{formatEur(currentTotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Maximaler Erstattungsbetrag:</span>
                    <span>{formatEur(remaining)}</span>
                  </div>
                  {currentTotal > remaining && (
                    <p className="text-xs text-destructive mt-1">
                      Der Gutschriftsbetrag übersteigt den maximalen Erstattungsbetrag.
                    </p>
                  )}
                </div>

                {/* Submit */}
                <Button
                  className="w-full"
                  disabled={
                    gutschriftLoading ||
                    currentTotal <= 0 ||
                    currentTotal > remaining ||
                    gutschriftPositions.every((p) => !p.description && p.amount === 0) ||
                    (gutschriftType === 'shortened' && gutschriftNewNights >= currentNights)
                  }
                  onClick={handleCreateGutschrift}
                >
                  {gutschriftLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wird erstellt...</>
                  ) : (
                    <><CreditCard className="mr-2 h-4 w-4" />Gutschrift erstellen</>
                  )}
                </Button>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Split Preview Dialog */}
      <Dialog open={splitPreviewOpen} onOpenChange={setSplitPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rechnung aufteilen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {splitBooking && (
              <p className="text-sm text-muted-foreground">
                Buchung: {splitBooking.guest_firstname} {splitBooking.guest_lastname} ({splitBooking.properties?.name ?? '–'})
              </p>
            )}
            <p className="text-sm">Wählen Sie die Zeiträume aus und passen Sie ggf. die Beträge an:</p>
            <div className="space-y-2">
              {splitSegments.map((seg, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-md border ${seg.alreadyInvoiced ? 'opacity-50 bg-muted' : ''}`}>
                  <Checkbox
                    checked={seg.selected || seg.alreadyInvoiced}
                    disabled={seg.alreadyInvoiced}
                    onCheckedChange={(checked) => {
                      if (seg.alreadyInvoiced) return
                      setSplitSegments(prev => prev.map((s, idx) =>
                        idx === i ? { ...s, selected: checked === true } : s
                      ))
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{seg.monthLabel}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Input
                        type="date"
                        value={seg.checkIn}
                        disabled={seg.alreadyInvoiced}
                        className="h-6 w-[120px] text-xs px-1"
                        onChange={(e) => {
                          const newDate = e.target.value
                          if (!newDate) return
                          setSplitSegments(prev => prev.map((s, idx) => {
                            if (idx !== i) return s
                            const nights = differenceInCalendarDays(new Date(s.checkOut), new Date(newDate))
                            return { ...s, checkIn: newDate, nights: Math.max(nights, 1), isCustom: true,
                              monthLabel: format(new Date(newDate + 'T00:00:00'), 'MMMM yyyy', { locale: de }) }
                          }))
                        }}
                      />
                      <span>–</span>
                      <Input
                        type="date"
                        value={seg.checkOut}
                        disabled={seg.alreadyInvoiced}
                        className="h-6 w-[120px] text-xs px-1"
                        onChange={(e) => {
                          const newDate = e.target.value
                          if (!newDate) return
                          setSplitSegments(prev => prev.map((s, idx) => {
                            if (idx !== i) return s
                            const nights = differenceInCalendarDays(new Date(newDate), new Date(s.checkIn))
                            return { ...s, checkOut: newDate, nights: Math.max(nights, 1), isCustom: true }
                          }))
                        }}
                      />
                      <span className="ml-1 whitespace-nowrap">{seg.nights} N.</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {seg.alreadyInvoiced ? (
                      <>
                        <span className="text-sm font-medium">{formatEur(seg.amount)}</span>
                        <p className="text-xs text-muted-foreground">Bereits erstellt</p>
                      </>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        value={seg.amount}
                        className="h-7 w-[100px] text-sm text-right"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setSplitSegments(prev => prev.map((s, idx) =>
                            idx === i ? { ...s, amount: val, isCustom: true } : s
                          ))
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-medium pt-2 border-t">
              <span>Neu erstellen: {splitSegments.filter(s => s.selected && !s.alreadyInvoiced).length} von {splitSegments.filter(s => !s.alreadyInvoiced).length} verfügbaren</span>
              <span>{formatEur(splitSegments.filter(s => s.selected && !s.alreadyInvoiced).reduce((sum, s) => sum + s.amount, 0))}</span>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={splitSegments.every(s => !s.selected || s.alreadyInvoiced)}
                onClick={startSplitWizardFlow}
              >
                <FileText className="mr-2 h-4 w-4" />Rechnungen erstellen
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!splitBooking) return
                  fillFromBooking(splitBooking, settings, cityRules)
                  setSplitPreviewOpen(false)
                  setDialogOpen(true)
                }}
              >
                Freie Rechnung
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tipp: Beträge und Daten sind direkt editierbar. &quot;Freie Rechnung&quot; öffnet den Wizard mit allen Buchungsdaten zur freien Bearbeitung.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

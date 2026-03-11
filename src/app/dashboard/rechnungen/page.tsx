'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, addDays, addMonths, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { pdf } from '@react-pdf/renderer'
import JSZip from 'jszip'
import { Plus, Download, FileText, Ban, Search, Archive, Loader2, Trash2, Wand2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { InvoicePDF, type InvoicePDFData, type InvoiceLineItem } from '@/lib/pdf/invoice'
import type { BookingWithProperty, Settings, CityTaxRule } from '@/lib/types'
import {
  getCleaningFee,
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
import { Skeleton } from '@/components/ui/skeleton'

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

const INVOICE_SELECT = 'id, invoice_number, issued_date, due_date, total_gross, total_vat, subtotal_net, vat_7_net, vat_7_amount, vat_19_net, vat_19_amount, status, booking_id, property_id, is_kleinunternehmer, service_period_start, service_period_end, landlord_snapshot, guest_snapshot, line_items'

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  created: 'Erstellt',
  paid: 'Bezahlt',
  cancelled: 'Storniert',
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
  const [bulkGenDialogOpen, setBulkGenDialogOpen] = useState(false)
  const [bulkGenFrom, setBulkGenFrom] = useState('')
  const [bulkGenTo, setBulkGenTo] = useState('')
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const { toast } = useToast()

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')

  // Form state
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestAddress, setGuestAddress] = useState('')
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [issuedDate, setIssuedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

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
            invoice_prefix, invoice_next_number, invoice_payment_days
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

      // Auto-generate invoice drafts for bookings without invoices
      // Skip when in split mode to avoid creating drafts that interfere with split creation
      if (!splitParam) {
        try {
          const res = await fetch('/api/rechnungen/auto-generate', { method: 'POST' })
          const result = await res.json()
          if (result.created > 0) {
            toast({
              title: `${result.created} neue Rechnungsentwürfe erstellt`,
              description: 'Automatisch aus Buchungsdaten generiert.',
            })
            const { data: refreshed } = await supabase
              .from('invoices')
              .select(INVOICE_SELECT)
              .order('created_at', { ascending: false })
            if (refreshed) setInvoices(refreshed as InvoiceRow[])
          }
        } catch {
          // Non-blocking: page still works without auto-generation
        }
      }

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
              await createSplitInvoices(targetBooking, settingsData as Settings | null, rules)
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
    const name = [booking.guest_firstname, booking.guest_lastname].filter(Boolean).join(' ')
    setGuestName(name)
    setGuestAddress(
      [booking.guest_street, [booking.guest_zip, booking.guest_city].filter(Boolean).join(' '), booking.guest_country]
        .filter(Boolean)
        .join(', ')
    )

    const nights = booking.nights ?? 1
    const grossWithoutTax = getAccommodationGrossWithoutCityTax(booking)
    const cleaningFee = getCleaningFee(booking, booking.properties?.default_cleaning_fee ?? undefined)
    const isKlein = s?.is_kleinunternehmer ?? false

    // Calculate accommodation tax using city_tax_rules
    const effectiveRules = rules ?? cityRules
    const taxConfig = booking.properties
      ? getTaxConfigForProperty(booking.properties, effectiveRules)
      : null
    const taxResult = taxConfig
      ? calculateAccommodationTax(booking, taxConfig, booking.properties?.ota_remits_tax ?? [])
      : null
    const cityTax = taxResult?.taxAmount ?? 0
    const taxVatRate = taxConfig?.vatType === '7' ? 7 : taxConfig?.vatType === '19' ? 19 : 0

    // Calculate accommodation price (gross without tax minus cleaning)
    const accommodationGross = grossWithoutTax - cleaningFee
    const accommodationPerNight = nights > 0 ? accommodationGross / nights : 0

    const items: InvoiceLineItem[] = []

    // Accommodation (7% USt)
    const accomNet = isKlein ? accommodationGross : accommodationGross / 1.07
    const accomVat = isKlein ? 0 : accommodationGross - accomNet
    items.push({
      description: `Beherbergung in ${booking.properties?.name ?? 'Ferienwohnung'} (${nights} Nächte)`,
      quantity: nights,
      unitPrice: Math.round((accommodationPerNight / (isKlein ? 1 : 1.07)) * 100) / 100,
      vatRate: 7,
      vatAmount: Math.round(accomVat * 100) / 100,
      total: Math.round(accommodationGross * 100) / 100,
    })

    // Cleaning (7% USt – Teil der Beherbergungsleistung)
    if (cleaningFee > 0) {
      const cleanNet = isKlein ? cleaningFee : cleaningFee / 1.07
      const cleanVat = isKlein ? 0 : cleaningFee - cleanNet
      items.push({
        description: 'Endreinigung',
        quantity: 1,
        unitPrice: Math.round(cleanNet * 100) / 100,
        vatRate: 7,
        vatAmount: Math.round(cleanVat * 100) / 100,
        total: Math.round(cleaningFee * 100) / 100,
      })
    }

    // Beherbergungssteuer (calculated from city_tax_rules) – always include actual amount
    if (cityTax > 0) {
      const cityLabel = taxConfig?.city ? ` (${taxConfig.city})` : ''
      const taxVatAmount = isKlein ? 0 : Math.round(cityTax * (taxVatRate / 100) * 100) / 100
      items.push({
        description: `Beherbergungssteuer${cityLabel}`,
        quantity: 1,
        unitPrice: Math.round(cityTax * 100) / 100,
        vatRate: taxVatRate,
        vatAmount: taxVatAmount,
        total: Math.round((cityTax + taxVatAmount) * 100) / 100,
      })
    }

    setLineItems(items)
  }

  async function createSplitInvoices(booking: BookingWithProperty, s: Settings | null, rules?: CityTaxRule[]) {
    if (!s) return
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveRules = rules ?? cityRules
    const isKlein = s.is_kleinunternehmer ?? false
    const paymentDays = s.invoice_payment_days ?? 14
    const prefix = s.invoice_prefix ?? 'RE'
    let nextNumber = s.invoice_next_number ?? 1

    const checkIn = new Date(booking.check_in + 'T00:00:00')
    const checkOut = new Date(booking.check_out + 'T00:00:00')
    const totalNights = booking.nights ?? differenceInCalendarDays(checkOut, checkIn)
    if (totalNights <= 0) return

    // Build monthly segments
    const segments: Array<{ checkIn: string; checkOut: string; nights: number; ratio: number; monthLabel: string }> = []
    let current = startOfMonth(checkIn)
    while (current < checkOut) {
      const nextMonth = addMonths(current, 1)
      const segStart = checkIn > current ? checkIn : current
      const segEnd = checkOut < nextMonth ? checkOut : nextMonth
      const segNights = differenceInCalendarDays(segEnd, segStart)
      if (segNights > 0) {
        segments.push({
          checkIn: format(segStart, 'yyyy-MM-dd'),
          checkOut: format(segEnd, 'yyyy-MM-dd'),
          nights: segNights,
          ratio: segNights / totalNights,
          monthLabel: format(segStart, 'MMMM yyyy', { locale: de }),
        })
      }
      current = nextMonth
    }

    if (segments.length <= 1) {
      // Not truly multi-month, fall back to single invoice
      fillFromBooking(booking, s, rules)
      setDialogOpen(true)
      return
    }

    // BUG-3: Prevent duplicates – abort if finalized invoices exist; delete drafts (auto-generated) first
    const { data: existing } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('booking_id', booking.id)
    if (existing && existing.length > 0) {
      const finalized = existing.filter((inv) => inv.status !== 'draft')
      if (finalized.length > 0) {
        toast({ title: 'Rechnungen bereits vorhanden', description: 'Für diese Buchung existieren bereits finalisierte Rechnungen.', variant: 'destructive' })
        return
      }
      // Delete existing draft invoices (auto-generated) before creating split invoices
      const draftIds = existing.map((inv) => inv.id)
      await supabase.from('invoices').delete().in('id', draftIds)
    }

    const taxConfig = booking.properties ? getTaxConfigForProperty(booking.properties, effectiveRules) : null
    const grossWithoutTax = getAccommodationGrossWithoutCityTax(booking)
    const cleaningFee = getCleaningFee(booking, booking.properties?.default_cleaning_fee ?? undefined)
    const accommodationGross = grossWithoutTax - cleaningFee

    // Calculate BHSt once for the full booking, then split proportionally per segment.
    // Avoids wrong cleaning-fee fallback when per-segment cleaning_fee would be 0.
    const fullTaxResult = taxConfig
      ? calculateAccommodationTax(booking, taxConfig, booking.properties?.ota_remits_tax ?? [])
      : null
    const fullTaxAmount = fullTaxResult?.taxAmount ?? 0
    const taxVatRate = taxConfig?.vatType === '7' ? 7 : taxConfig?.vatType === '19' ? 19 : 0

    const landlordSnapshot = {
      name: s.landlord_name ?? '', street: s.landlord_street ?? '', city: s.landlord_city ?? '',
      zip: s.landlord_zip ?? '', country: s.landlord_country ?? 'DE', phone: s.landlord_phone ?? '',
      email: s.landlord_email ?? '', website: s.landlord_website ?? '', tax_number: s.tax_number ?? '',
      vat_id: s.vat_id ?? '', bank_iban: s.bank_iban ?? '', bank_bic: s.bank_bic ?? '',
      bank_name: s.bank_name ?? '', company_register: s.company_register ?? '',
      managing_director: s.managing_director ?? '', invoice_thank_you_text: s.invoice_thank_you_text ?? '',
      logo_url: s.landlord_logo_url ?? '',
    }

    const guestSnapshot = {
      firstname: booking.guest_firstname ?? '', lastname: booking.guest_lastname ?? '',
      street: booking.guest_street ?? '', city: booking.guest_city ?? '',
      zip: booking.guest_zip ?? '', country: booking.guest_country ?? '',
      booking_reference: booking.external_id?.toString() ?? '',
      guest_count: String((booking.adults ?? 0) + (booking.children ?? 0)),
      payment_channel: booking.channel ?? '',
    }

    const inserts = segments.map((seg) => {
      const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(nextNumber).padStart(3, '0')}`
      nextNumber++

      const segAccomGross = Math.round(accommodationGross * seg.ratio * 100) / 100
      const segClean = Math.round(cleaningFee * seg.ratio * 100) / 100

      const lineItems: Array<{ description: string; quantity: number; unit_price: number; vat_rate: number; vat_amount: number; total: number }> = []

      const accomNet = isKlein ? segAccomGross : segAccomGross / 1.07
      const accomVat = isKlein ? 0 : segAccomGross - accomNet
      lineItems.push({
        description: `Beherbergung in ${booking.properties?.name ?? 'Ferienwohnung'} – ${seg.monthLabel} (${seg.nights} Nächte)`,
        quantity: seg.nights,
        unit_price: Math.round((segAccomGross / (isKlein ? 1 : 1.07) / seg.nights) * 100) / 100,
        vat_rate: 7, vat_amount: Math.round(accomVat * 100) / 100, total: Math.round(segAccomGross * 100) / 100,
      })

      if (segClean > 0) {
        const cleanNet = isKlein ? segClean : segClean / 1.07
        const cleanVat = isKlein ? 0 : segClean - cleanNet
        lineItems.push({
          description: 'Endreinigung', quantity: 1, unit_price: Math.round(cleanNet * 100) / 100,
          vat_rate: 7, vat_amount: Math.round(cleanVat * 100) / 100, total: Math.round(segClean * 100) / 100,
        })
      }

      // BHSt proportional: use pre-calculated full-booking tax split by ratio
      if (fullTaxAmount > 0) {
        const segTax = Math.round(fullTaxAmount * seg.ratio * 100) / 100
        const taxVatAmount = isKlein ? 0 : Math.round(segTax * (taxVatRate / 100) * 100) / 100
        lineItems.push({
          description: `Beherbergungssteuer${taxConfig?.city ? ` (${taxConfig.city})` : ''}`,
          quantity: 1, unit_price: segTax,
          vat_rate: taxVatRate, vat_amount: taxVatAmount,
          total: Math.round((segTax + taxVatAmount) * 100) / 100,
        })
      }

      const subtotalNet = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const vat7Items = lineItems.filter((i) => i.vat_rate === 7)
      const vat19Items = lineItems.filter((i) => i.vat_rate === 19)
      const vat7Net = vat7Items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const vat7Amount = isKlein ? 0 : vat7Items.reduce((s, i) => s + i.vat_amount, 0)
      const vat19Net = vat19Items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const vat19Amount = isKlein ? 0 : vat19Items.reduce((s, i) => s + i.vat_amount, 0)
      const totalVat = vat7Amount + vat19Amount
      const totalGross = isKlein ? subtotalNet : subtotalNet + totalVat

      return {
        invoice_number: invoiceNumber,
        booking_id: booking.id,
        property_id: booking.property_id,
        user_id: user?.id,
        landlord_snapshot: landlordSnapshot as unknown as import('@/lib/database.types').Json,
        guest_snapshot: guestSnapshot as unknown as import('@/lib/database.types').Json,
        line_items: lineItems as unknown as import('@/lib/database.types').Json,
        subtotal_net: Math.round(subtotalNet * 100) / 100,
        vat_7_net: Math.round(vat7Net * 100) / 100, vat_7_amount: Math.round(vat7Amount * 100) / 100,
        vat_19_net: Math.round(vat19Net * 100) / 100, vat_19_amount: Math.round(vat19Amount * 100) / 100,
        total_vat: Math.round(totalVat * 100) / 100, total_gross: Math.round(totalGross * 100) / 100,
        is_kleinunternehmer: isKlein,
        issued_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: format(addDays(new Date(), paymentDays), 'yyyy-MM-dd'),
        service_period_start: seg.checkIn,
        service_period_end: seg.checkOut,
        status: 'draft',
      }
    })

    const { error } = await supabase.from('invoices').insert(inserts)
    if (!error) {
      await supabase.from('settings').update({ invoice_next_number: nextNumber }).eq('id', s.id)
      toast({ title: `${inserts.length} Rechnungen erstellt`, description: `Monatsweise aufgeteilt: ${segments.map((s) => s.monthLabel).join(', ')}` })
      const { data: refreshed } = await supabase.from('invoices').select(INVOICE_SELECT).order('created_at', { ascending: false })
      if (refreshed) setInvoices(refreshed as InvoiceRow[])
    } else {
      toast({ title: 'Fehler beim Erstellen', description: error.message, variant: 'destructive' })
    }
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unitPrice: 0, vatRate: 19, vatAmount: 0, total: 0 },
    ])
  }

  function updateLineItem(index: number, field: keyof InvoiceLineItem | 'unitPriceGross', value: string | number) {
    setLineItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index] }
      const isKlein = settings?.is_kleinunternehmer ?? false

      if (field === 'unitPriceGross') {
        // Reverse-calculate net from gross
        const grossPrice = Number(value)
        const vatRate = Number(item.vatRate)
        item.unitPrice = isKlein || vatRate === 0
          ? grossPrice
          : Math.round((grossPrice / (1 + vatRate / 100)) * 100) / 100
      } else {
        ;(item as Record<string, unknown>)[field] = value
      }

      if (['quantity', 'unitPrice', 'unitPriceGross', 'vatRate'].includes(field)) {
        const netTotal = Number(item.quantity) * Number(item.unitPrice)
        item.vatAmount = isKlein ? 0 : Math.round(netTotal * (Number(item.vatRate) / 100) * 100) / 100
        item.total = Math.round((netTotal + item.vatAmount) * 100) / 100
      }
      updated[index] = item
      return updated
    })
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!settings) return
    setGenerating(true)
    const { data: { user } } = await supabase.auth.getUser()
    try {
      const isKlein = settings.is_kleinunternehmer ?? false

      const subtotalNet = lineItems.reduce(
        (s, item) => s + item.quantity * item.unitPrice,
        0
      )
      const vat7Items = lineItems.filter((i) => i.vatRate === 7)
      const vat19Items = lineItems.filter((i) => i.vatRate === 19)
      const vat7Net = vat7Items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      const vat7Amount = isKlein ? 0 : vat7Items.reduce((s, i) => s + i.vatAmount, 0)
      const vat19Net = vat19Items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
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

      const guestSnapshotData = {
        firstname: guestName.split(' ')[0] ?? '',
        lastname: guestName.split(' ').slice(1).join(' ') ?? '',
        address: guestAddress,
        booking_reference: selectedBooking?.external_id?.toString() ?? '',
        guest_count: selectedBooking ? String((selectedBooking.adults ?? 0) + (selectedBooking.children ?? 0)) : '',
        payment_channel: selectedBooking?.channel ?? '',
      }

      const { data: saved } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          booking_id: selectedBookingId || null,
          property_id: selectedBooking?.property_id ?? null,
          user_id: user?.id,
          landlord_snapshot: landlordSnapshotData,
          guest_snapshot: guestSnapshotData,
          line_items: lineItemsJson,
          subtotal_net: Math.round(subtotalNet * 100) / 100,
          vat_7_net: Math.round(vat7Net * 100) / 100,
          vat_7_amount: Math.round(vat7Amount * 100) / 100,
          vat_19_net: Math.round(vat19Net * 100) / 100,
          vat_19_amount: Math.round(vat19Amount * 100) / 100,
          total_vat: Math.round(totalVat * 100) / 100,
          total_gross: Math.round(totalGross * 100) / 100,
          is_kleinunternehmer: isKlein,
          issued_date: issuedDate,
          due_date: format(addDays(new Date(issuedDate), paymentDays), 'yyyy-MM-dd'),
          service_period_start: selectedBooking?.check_in ?? null,
          service_period_end: selectedBooking?.check_out ?? null,
          status: 'created',
        })
        .select('id, invoice_number, issued_date, due_date, total_gross, total_vat, subtotal_net, vat_7_net, vat_7_amount, vat_19_net, vat_19_amount, status, booking_id, is_kleinunternehmer, service_period_start, service_period_end, landlord_snapshot, guest_snapshot, line_items')
        .single()

      // Increment invoice number
      await supabase
        .from('settings')
        .update({ invoice_next_number: nextNumber + 1 })
        .not('id', 'is', null)

      if (saved) {
        setInvoices((prev) => [saved as InvoiceRow, ...prev])
      }

      setDialogOpen(false)
      toast({ title: 'Rechnung gespeichert', description: invoiceNumber })
    } finally {
      setGenerating(false)
    }
  }

  /** Sync guest data from Smoobu before download (always, to catch address updates) */
  async function syncGuestForBooking(bookingId: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/smoobu/sync-guest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ bookingId }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  /** Generate PDF on-demand – always syncs guest data from Smoobu first */
  async function handleDownloadPDF(inv: InvoiceRow) {
    setDownloading(inv.id)
    try {
      // Always sync guest data from Smoobu before PDF generation
      // (webhook doesn't send address updates, so we always re-fetch)
      if (inv.booking_id) {
        await syncGuestForBooking(inv.booking_id)

        // Re-fetch invoice (guest_snapshot may have been updated by sync-guest backfill)
        const { data: refreshed } = await supabase
          .from('invoices')
          .select(INVOICE_SELECT)
          .eq('id', inv.id)
          .single()
        if (refreshed) {
          // Update local state so the table also reflects any changes
          const refreshedInv = refreshed as InvoiceRow
          setInvoices((prev) =>
            prev.map((i) => (i.id === inv.id ? refreshedInv : i))
          )
          inv = refreshedInv
        }
      }

      const pdfData = buildPdfData(inv)
      const blob = await pdf(<InvoicePDF data={pdfData} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.invoice_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(null)
    }
  }

  async function updateStatus(invoiceId: string, newStatus: string) {
    const updates: Record<string, string | null> = { status: newStatus }
    if (newStatus === 'paid') {
      updates.paid_date = format(new Date(), 'yyyy-MM-dd')
    }
    await supabase.from('invoices').update(updates).eq('id', invoiceId)
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
  const filteredInvoices = invoices.filter((inv) => {
    // Search by guest name
    if (searchQuery) {
      const name = `${inv.guest_snapshot?.firstname ?? ''} ${inv.guest_snapshot?.lastname ?? ''}`.toLowerCase()
      if (!name.includes(searchQuery.toLowerCase())) return false
    }
    // Property filter
    if (propertyFilter !== 'all' && inv.property_id !== propertyFilter) return false
    // Period filter
    const range = getPeriodRange(periodFilter)
    if (range && inv.issued_date) {
      if (inv.issued_date < range.from || inv.issued_date > range.to) return false
    }
    return true
  })

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

  async function handleBulkGenerate() {
    if (!bulkGenFrom || !bulkGenTo) return
    setBulkGenerating(true)
    try {
      const res = await fetch('/api/rechnungen/bulk-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate: bulkGenFrom, toDate: bulkGenTo }),
      })
      const result = await res.json()
      if (!res.ok) {
        toast({ title: 'Fehler', description: result.error ?? 'Generierung fehlgeschlagen', variant: 'destructive' })
        return
      }
      setBulkGenDialogOpen(false)
      if (result.created > 0) {
        toast({ title: `${result.created} neue Rechnungsentwürfe erstellt`, description: `Zeitraum: ${bulkGenFrom} – ${bulkGenTo}` })
        const { data: refreshed } = await supabase
          .from('invoices')
          .select(INVOICE_SELECT)
          .order('created_at', { ascending: false })
        if (refreshed) setInvoices(refreshed as InvoiceRow[])
      } else {
        toast({ title: 'Keine neuen Rechnungen', description: 'Alle Buchungen im Zeitraum haben bereits eine Rechnung.' })
      }
    } finally {
      setBulkGenerating(false)
    }
  }

  async function handleDeleteInvoice(invoiceId: string) {
    await supabase.from('invoices').delete().eq('id', invoiceId)
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId))
    setDeletingInvoiceId(null)
    toast({ title: 'Rechnung gelöscht' })
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

    const checkIn = inv.service_period_start
      ? format(new Date(inv.service_period_start + 'T00:00:00'), 'dd.MM.yyyy')
      : ''
    const checkOut = inv.service_period_end
      ? format(new Date(inv.service_period_end + 'T00:00:00'), 'dd.MM.yyyy')
      : ''

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
      servicePeriod: inv.service_period_start && inv.service_period_end
        ? `${format(new Date(inv.service_period_start + 'T00:00:00'), 'dd.MM.yyyy')} – ${format(new Date(inv.service_period_end + 'T00:00:00'), 'dd.MM.yyyy')}`
        : '',
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
      guestName: [gs.firstname, gs.lastname].filter(Boolean).join(' '),
      guestAddress: guestAddr,
      guestStreet: gs.street || undefined,
      guestZipCity: gs.street ? [gs.zip, gs.city].filter(Boolean).join(' ') || undefined : undefined,
      guestCountry: gs.street ? (gs.country || undefined) : undefined,
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
          <Button
            variant="outline"
            disabled={bulkDownloading || filteredInvoices.length === 0}
            onClick={handleBulkDownload}
          >
            <Archive className="mr-2 h-4 w-4" />
            {bulkDownloading ? 'Wird erstellt...' : `Alle herunterladen (${filteredInvoices.length})`}
          </Button>
          {/* Bulk-Erstellen Dialog */}
          <Dialog open={bulkGenDialogOpen} onOpenChange={setBulkGenDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Wand2 className="mr-2 h-4 w-4" />
                Rechnungen erstellen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Rechnungen bulk erstellen</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Erstellt Rechnungsentwürfe für alle Buchungen im gewählten Zeitraum (Anreisedatum), die noch keine Rechnung haben.
              </p>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="bulk-from">Anreise von</Label>
                  <Input
                    id="bulk-from"
                    type="date"
                    value={bulkGenFrom}
                    onChange={(e) => setBulkGenFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bulk-to">Anreise bis</Label>
                  <Input
                    id="bulk-to"
                    type="date"
                    value={bulkGenTo}
                    onChange={(e) => setBulkGenTo(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={bulkGenerating || !bulkGenFrom || !bulkGenTo}
                  onClick={handleBulkGenerate}
                >
                  {bulkGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wird erstellt...</> : 'Rechnungen erstellen'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setSelectedBookingId('')
                  setGuestName('')
                  setGuestAddress('')
                  setLineItems([])
                  setIssuedDate(format(new Date(), 'yyyy-MM-dd'))
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Neue Rechnung
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Rechnung erstellen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Booking selector */}
              <div className="space-y-2">
                <Label>Aus Buchung vorausfüllen</Label>
                <Select
                  value={selectedBookingId}
                  onValueChange={(v) => {
                    const booking = bookings.find((b) => b.id === v)
                    if (booking) fillFromBooking(booking, settings, cityRules)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Buchung wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bookings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {[b.guest_firstname, b.guest_lastname].filter(Boolean).join(' ') || 'Unbekannt'}{' '}
                        – {b.check_in} ({formatEur(b.amount_gross ?? 0)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Guest & date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Empfänger (Gast)</Label>
                  <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Name" />
                  <Input value={guestAddress} onChange={(e) => setGuestAddress(e.target.value)} placeholder="Adresse" />
                </div>
                <div className="space-y-2">
                  <Label>Rechnungsdatum</Label>
                  <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
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
                <div className="space-y-2">
                  {lineItems.map((item, i) => {
                    const isKlein = settings?.is_kleinunternehmer ?? false
                    const grossUnitPrice = isKlein || item.vatRate === 0
                      ? item.unitPrice
                      : Math.round(item.unitPrice * (1 + item.vatRate / 100) * 100) / 100
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
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

                {/* Totals */}
                {lineItems.length > 0 && (
                  <div className="text-right space-y-1 pt-2 border-t">
                    <p className="text-sm">
                      Netto: {formatEur(lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}
                    </p>
                    {!settings?.is_kleinunternehmer && (
                      <p className="text-sm">
                        USt: {formatEur(lineItems.reduce((s, i) => s + i.vatAmount, 0))}
                      </p>
                    )}
                    <p className="text-base font-bold">
                      Gesamt: {formatEur(lineItems.reduce((s, i) => s + i.total, 0))}
                    </p>
                  </div>
                )}
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
                    <TableHead>Nummer</TableHead>
                    <TableHead>Gast</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium font-mono text-sm">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell>
                        {inv.guest_snapshot?.firstname} {inv.guest_snapshot?.lastname}
                      </TableCell>
                      <TableCell>
                        {inv.issued_date
                          ? format(new Date(inv.issued_date), 'dd.MM.yyyy')
                          : '–'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatEur(inv.total_gross)}
                      </TableCell>
                      <TableCell>
                        {inv.status === 'cancelled' ? (
                          <Badge variant="destructive">{STATUS_LABELS[inv.status]}</Badge>
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
                          >
                            {downloading === inv.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Download className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingInvoiceId(inv.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
    </div>
  )
}

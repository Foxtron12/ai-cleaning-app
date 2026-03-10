'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { pdf } from '@react-pdf/renderer'
import { Plus, Download, FileText, Ban } from 'lucide-react'
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

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  created: 'Erstellt',
  paid: 'Bezahlt',
  cancelled: 'Storniert',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  created: 'default',
  paid: 'secondary',
  cancelled: 'destructive',
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

  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [bookings, setBookings] = useState<BookingWithProperty[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [cityRules, setCityRules] = useState<CityTaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const { toast } = useToast()

  // Form state
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestAddress, setGuestAddress] = useState('')
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [issuedDate, setIssuedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    async function fetchData() {
      const [{ data: invoicesData }, { data: bookingsData }, { data: settingsData }, { data: rulesData }] =
        await Promise.all([
          supabase
            .from('invoices')
            .select('id, invoice_number, issued_date, due_date, total_gross, total_vat, subtotal_net, vat_7_net, vat_7_amount, vat_19_net, vat_19_amount, status, booking_id, is_kleinunternehmer, service_period_start, service_period_end, landlord_snapshot, guest_snapshot, line_items')
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
            tax_number, vat_id, finanzamt, is_kleinunternehmer,
            bank_iban, bank_bic, bank_name,
            invoice_prefix, invoice_next_number, invoice_payment_days
          `).limit(1).single(),
          supabase.from('city_tax_rules').select('*').order('city'),
        ])

      const rules = (rulesData ?? []) as CityTaxRule[]
      setInvoices((invoicesData ?? []) as InvoiceRow[])
      setBookings((bookingsData ?? []) as BookingWithProperty[])
      setSettings(settingsData as Settings | null)
      setCityRules(rules)
      setLoading(false)

      // Auto-generate invoice drafts for bookings without invoices
      try {
        const res = await fetch('/api/rechnungen/auto-generate', { method: 'POST' })
        const result = await res.json()
        if (result.created > 0) {
          toast({
            title: `${result.created} neue Rechnungsentwürfe erstellt`,
            description: 'Automatisch aus Buchungsdaten generiert.',
          })
          // Refetch invoices to show newly created drafts
          const { data: refreshed } = await supabase
            .from('invoices')
            .select('id, invoice_number, issued_date, due_date, total_gross, total_vat, subtotal_net, vat_7_net, vat_7_amount, vat_19_net, vat_19_amount, status, booking_id, is_kleinunternehmer, service_period_start, service_period_end, landlord_snapshot, guest_snapshot, line_items')
            .order('created_at', { ascending: false })
          if (refreshed) setInvoices(refreshed as InvoiceRow[])
        }
      } catch {
        // Non-blocking: page still works without auto-generation
      }

      if (bookingIdParam) {
        const booking = (bookingsData ?? []).find(
          (b: BookingWithProperty) => b.id === bookingIdParam
        ) as BookingWithProperty | undefined
        if (booking) {
          fillFromBooking(booking, settingsData as Settings | null, rules)
          setDialogOpen(true)
        }
      }
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingIdParam])

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
    const cleaningFee = getCleaningFee(booking)
    const isKlein = s?.is_kleinunternehmer ?? false

    // Calculate accommodation tax using city_tax_rules
    const effectiveRules = rules ?? cityRules
    const taxConfig = booking.properties
      ? getTaxConfigForProperty(booking.properties, effectiveRules)
      : null
    const taxResult = taxConfig
      ? calculateAccommodationTax(booking, taxConfig)
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

    // Beherbergungssteuer (calculated from city_tax_rules)
    if (cityTax > 0) {
      const cityLabel = taxConfig?.city ? ` (${taxConfig.city})` : ''
      const isAirbnb = taxResult?.isExempt && taxResult?.exemptReason === 'Airbnb führt ab'
      const airbnbNote = isAirbnb ? ', über Airbnb abgeführt' : ''
      const taxVatAmount = isKlein ? 0 : Math.round(cityTax * (taxVatRate / 100) * 100) / 100
      items.push({
        description: `Beherbergungssteuer${cityLabel}${airbnbNote}`,
        quantity: 1,
        unitPrice: Math.round(cityTax * 100) / 100,
        vatRate: taxVatRate,
        vatAmount: taxVatAmount,
        total: Math.round((cityTax + taxVatAmount) * 100) / 100,
      })
    }

    setLineItems(items)
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
        tax_number: settings.tax_number ?? '',
        vat_id: settings.vat_id ?? '',
        bank_iban: settings.bank_iban ?? '',
        bank_bic: settings.bank_bic ?? '',
        bank_name: settings.bank_name ?? '',
      }

      const guestSnapshotData = {
        firstname: guestName.split(' ')[0] ?? '',
        lastname: guestName.split(' ').slice(1).join(' ') ?? '',
        address: guestAddress,
      }

      const { data: saved } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          booking_id: selectedBookingId || null,
          property_id: selectedBooking?.property_id ?? null,
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

  /** Generate PDF on-demand from stored invoice data (no re-query needed) */
  async function handleDownloadPDF(inv: InvoiceRow) {
    setDownloading(inv.id)
    try {
      const ls = inv.landlord_snapshot ?? {}
      const gs = inv.guest_snapshot ?? {}
      const items = (inv.line_items ?? []) as InvoiceRow['line_items']
      const isKlein = inv.is_kleinunternehmer ?? false
      const paymentDays = settings?.invoice_payment_days ?? 14

      const landlordAddress = [
        ls.street,
        [ls.zip, ls.city].filter(Boolean).join(' '),
      ].filter(Boolean).join(', ')

      const guestAddress = gs.address
        ?? [gs.street, [gs.zip, gs.city].filter(Boolean).join(' '), gs.country]
            .filter(Boolean)
            .join(', ')

      const servicePeriod =
        inv.service_period_start && inv.service_period_end
          ? `${format(new Date(inv.service_period_start + 'T00:00:00'), 'dd.MM.yyyy')} – ${format(new Date(inv.service_period_end + 'T00:00:00'), 'dd.MM.yyyy')}`
          : ''

      const pdfLineItems: InvoiceLineItem[] = items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        vatRate: i.vat_rate,
        vatAmount: i.vat_amount,
        total: i.total,
      }))

      const pdfData: InvoicePDFData = {
        invoiceNumber: inv.invoice_number,
        issuedDate: inv.issued_date
          ? format(new Date(inv.issued_date + 'T00:00:00'), 'dd.MM.yyyy')
          : '',
        dueDate: inv.due_date
          ? format(new Date(inv.due_date + 'T00:00:00'), 'dd.MM.yyyy')
          : '',
        servicePeriod,
        landlordName: ls.name ?? '',
        landlordAddress,
        taxNumber: ls.tax_number || undefined,
        vatId: ls.vat_id || undefined,
        phone: ls.phone || undefined,
        email: ls.email || undefined,
        website: ls.website || undefined,
        guestName: [gs.firstname, gs.lastname].filter(Boolean).join(' '),
        guestAddress,
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
      }

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Rechnungen</h2>
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

      {/* Invoice archive */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rechnungsarchiv</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Noch keine Rechnungen erstellt
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
                  {invoices.map((inv) => (
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
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={downloading === inv.id}
                          onClick={() => handleDownloadPDF(inv)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

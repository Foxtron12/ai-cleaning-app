'use client'

import { Suspense, useEffect, useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { Download, Search, Plus } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { BookingWithProperty } from '@/lib/types'
import { BookingTable, type SortColumn, type SortDirection } from '@/components/dashboard/booking-table'
import { BookingDetailSheet } from '@/components/dashboard/booking-detail-sheet'
import { CreateBookingWizard } from '@/components/dashboard/create-booking-wizard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { calculateAccommodationTax, getTaxConfigForProperty, getCleaningFee } from '@/lib/calculators/accommodation-tax'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CHANNELS = ['Alle', 'Airbnb', 'Booking.com', 'VRBO', 'Expedia', 'Direct', 'Google', 'Other'] as const
const STATUSES = ['Alle', 'upcoming', 'active', 'completed', 'cancelled'] as const
const STATUS_LABELS: Record<string, string> = {
  Alle: 'Alle Status',
  upcoming: 'Bevorstehend',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
}

type TimeRange = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all' | 'custom'

function getDateRange(range: Exclude<TimeRange, 'custom'>): { from: string; to: string } | null {
  const now = new Date()
  switch (range) {
    case 'this_month':
      return {
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
      }
    case 'last_month': {
      const lastMonth = subMonths(now, 1)
      return {
        from: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
        to: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
      }
    }
    case 'this_quarter': {
      const quarter = Math.floor(now.getMonth() / 3)
      const quarterStart = new Date(now.getFullYear(), quarter * 3, 1)
      const quarterEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0)
      return {
        from: format(quarterStart, 'yyyy-MM-dd'),
        to: format(quarterEnd, 'yyyy-MM-dd'),
      }
    }
    case 'this_year':
      return {
        from: `${now.getFullYear()}-01-01`,
        to: `${now.getFullYear()}-12-31`,
      }
    case 'all':
      return null
  }
}

function exportXLSX(bookings: BookingWithProperty[]) {
  const rows = bookings.map((b) => {
    const taxConfig = b.properties ? getTaxConfigForProperty(b.properties, []) : null
    const taxResult = taxConfig ? calculateAccommodationTax(b, taxConfig, b.properties?.ota_remits_tax ?? []) : null
    const cityTax = taxResult?.taxAmount ?? 0

    const paidByGuest = b.channel === 'Airbnb'
      ? (b.amount_gross ?? 0) + cityTax
      : (b.amount_gross ?? 0)

    const bruttoWithoutCityTax = b.channel === 'Booking.com'
      ? (b.amount_gross ?? 0) - cityTax
      : (b.amount_gross ?? 0)

    const nettoAmount = bruttoWithoutCityTax > 0
      ? Math.round((bruttoWithoutCityTax / 1.07) * 100) / 100
      : 0

    const hostPayout = (b.amount_host_payout ?? 0) > 0
      ? b.amount_host_payout ?? 0
      : (b.amount_gross ?? 0) - (b.commission_amount ?? 0)

    return {
      'Gast': [b.guest_firstname, b.guest_lastname].filter(Boolean).join(' '),
      'E-Mail': b.guest_email ?? '',
      'Telefon': b.guest_phone ?? '',
      'Objekt': b.properties?.name ?? '',
      'Check-in': b.check_in,
      'Check-out': b.check_out,
      'Nächte': b.nights ?? '',
      'Kanal': b.channel,
      'Status': b.status,
      'Vom Gast bezahlt (€)': paidByGuest,
      'Bruttobetrag ohne City Tax (€)': bruttoWithoutCityTax,
      'Nettobetrag ohne MwSt 7% (€)': nettoAmount,
      'Provision (€)': b.commission_amount ?? 0,
      'Host-Auszahlung (€)': hostPayout,
      'Reinigungsgebühr (€)': getCleaningFee(b, b.properties?.default_cleaning_fee ?? undefined),
      'Beherbergungssteuer (€)': cityTax,
      'Kaution (€)': b.security_deposit ?? 0,
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Buchungen')
  XLSX.writeFile(wb, `buchungen-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
}

const PAGE_SIZE = 20

export default function BuchungenPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <BuchungenContent />
    </Suspense>
  )
}

function BuchungenContent() {
  const searchParams = useSearchParams()
  const [allBookings, setAllBookings] = useState<BookingWithProperty[]>([])
  const [invoiceBookingIds, setInvoiceBookingIds] = useState<Set<string>>(new Set())
  const [meldescheinBookingIds, setMeldescheinBookingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('Alle')
  const [status, setStatus] = useState('upcoming')
  const [property, setProperty] = useState('Alle')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(0)
  const [selectedBooking, setSelectedBooking] = useState<BookingWithProperty | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(searchParams.get('create') === 'true')
  const [sortColumn, setSortColumn] = useState<SortColumn>('check_in')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    async function fetchBookings() {
      const dateRange = timeRange === 'custom'
        ? (customFrom && customTo ? { from: customFrom, to: customTo } : null)
        : getDateRange(timeRange as Exclude<TimeRange, 'custom'>)

      let query = supabase
        .from('bookings')
        .select('*, properties(*)')
        .order('check_in', { ascending: false })

      if (dateRange) {
        query = query.lte('check_in', dateRange.to).gte('check_out', dateRange.from)
      }

      const [{ data }, { data: invData }, { data: meldData }] = await Promise.all([
        query.limit(1000),
        supabase.from('invoices').select('booking_id').not('booking_id', 'is', null).limit(5000),
        supabase.from('registration_forms').select('booking_id').not('booking_id', 'is', null).limit(5000),
      ])
      setAllBookings((data ?? []) as BookingWithProperty[])
      setInvoiceBookingIds(new Set((invData ?? []).map((r) => r.booking_id as string)))
      setMeldescheinBookingIds(new Set((meldData ?? []).map((r) => r.booking_id as string)))
      setLoading(false)
    }

    setLoading(true)
    setPage(0)
    fetchBookings()
  }, [timeRange, customFrom, customTo])

  const handleSort = useCallback((col: SortColumn) => {
    setSortDirection((prev) => col === sortColumn ? (prev === 'asc' ? 'desc' : 'asc') : 'desc')
    setSortColumn(col)
    setPage(0)
  }, [sortColumn])

  const propertyOptions = useMemo(() => {
    const names = new Set(allBookings.map((b) => b.properties?.name).filter(Boolean) as string[])
    return Array.from(names).sort()
  }, [allBookings])

  const filtered = useMemo(() => {
    let result = allBookings

    if (channel !== 'Alle') {
      result = result.filter((b) => b.channel === channel)
    }
    if (status !== 'Alle') {
      result = result.filter((b) => b.status === status)
    }
    if (property !== 'Alle') {
      result = result.filter((b) => b.properties?.name === property)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (b) =>
          (b.guest_firstname ?? '').toLowerCase().includes(q) ||
          (b.guest_lastname ?? '').toLowerCase().includes(q) ||
          String(b.external_id).includes(q)
      )
    }

    result = [...result].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1
      switch (sortColumn) {
        case 'guest': {
          const nameA = `${a.guest_lastname ?? ''} ${a.guest_firstname ?? ''}`.toLowerCase()
          const nameB = `${b.guest_lastname ?? ''} ${b.guest_firstname ?? ''}`.toLowerCase()
          return nameA.localeCompare(nameB) * dir
        }
        case 'check_in': return a.check_in.localeCompare(b.check_in) * dir
        case 'check_out': return a.check_out.localeCompare(b.check_out) * dir
        case 'nights': return ((a.nights ?? 0) - (b.nights ?? 0)) * dir
        case 'amount_gross': return ((a.amount_gross ?? 0) - (b.amount_gross ?? 0)) * dir
        case 'created_at': return (a.created_at ?? '').localeCompare(b.created_at ?? '') * dir
        default: return 0
      }
    })

    return result
  }, [allBookings, channel, status, property, search, sortColumn, sortDirection])

  const paginated = useMemo(() => {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  }, [filtered, page])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const handleRowClick = useCallback((booking: BookingWithProperty) => {
    setSelectedBooking(booking)
    setSheetOpen(true)
  }, [])

  const handleToggleReady = useCallback(async (bookingId: string, newValue: boolean) => {
    // Optimistic update
    setAllBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, is_ready: newValue } : b))
    )
    await supabase.from('bookings').update({ is_ready: newValue }).eq('id', bookingId)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Buchungen</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportXLSX(filtered)}>
            <Download className="mr-2 h-4 w-4" />
            XLSX Export
          </Button>
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Buchung anlegen
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Gast suchen..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="pl-9"
          />
        </div>
        <Select value={timeRange} onValueChange={(v) => { setTimeRange(v as TimeRange); setPage(0) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">Dieser Monat</SelectItem>
            <SelectItem value="last_month">Letzter Monat</SelectItem>
            <SelectItem value="this_quarter">Dieses Quartal</SelectItem>
            <SelectItem value="this_year">Dieses Jahr</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="custom">Benutzerdefiniert</SelectItem>
          </SelectContent>
        </Select>
        {timeRange === 'custom' && (
          <>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => { setCustomFrom(e.target.value); setPage(0) }}
              className="w-[145px]"
            />
            <span className="text-muted-foreground text-sm">–</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => { setCustomTo(e.target.value); setPage(0) }}
              className="w-[145px]"
            />
          </>
        )}
        <Select value={channel} onValueChange={(v) => { setChannel(v); setPage(0) }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNELS.map((ch) => (
              <SelectItem key={ch} value={ch}>
                {ch === 'Alle' ? 'Alle Kanäle' : ch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={property} onValueChange={(v) => { setProperty(v); setPage(0) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Alle">Alle Objekte</SelectItem>
            {propertyOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length} Buchung{filtered.length !== 1 ? 'en' : ''} gefunden
      </p>

      {/* Table */}
      <BookingTable
        bookings={paginated}
        loading={loading}
        onRowClick={handleRowClick}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        invoiceBookingIds={invoiceBookingIds}
        meldescheinBookingIds={meldescheinBookingIds}
        onToggleReady={handleToggleReady}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Zurück
          </Button>
          <span className="text-sm text-muted-foreground">
            Seite {page + 1} von {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Weiter
          </Button>
        </div>
      )}

      {/* Detail Sheet */}
      <BookingDetailSheet
        booking={selectedBooking}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onBookingUpdated={(updated) => {
          setAllBookings((prev) => prev.map((b) => b.id === updated.id ? updated : b))
          setSelectedBooking(updated)
        }}
      />

      {/* Direktbuchungs-Wizard */}
      <CreateBookingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onBookingCreated={(booking) => {
          setAllBookings((prev) => [booking, ...prev])
        }}
      />
    </div>
  )
}

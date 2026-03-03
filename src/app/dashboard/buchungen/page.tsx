'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import { Download, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { BookingWithProperty } from '@/lib/types'
import { BookingTable } from '@/components/dashboard/booking-table'
import { BookingDetailSheet } from '@/components/dashboard/booking-detail-sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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

type TimeRange = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all'

function getDateRange(range: TimeRange): { from: string; to: string } | null {
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

function exportCSV(bookings: BookingWithProperty[]) {
  const headers = [
    'Gast', 'E-Mail', 'Objekt', 'Check-in', 'Check-out', 'Nächte',
    'Kanal', 'Status', 'Brutto', 'Provision', 'Host-Auszahlung',
    'Reinigung', 'Kaution',
  ]
  const rows = bookings.map((b) => [
    [b.guest_firstname, b.guest_lastname].filter(Boolean).join(' '),
    b.guest_email ?? '',
    b.properties?.name ?? '',
    b.check_in,
    b.check_out,
    b.nights ?? '',
    b.channel,
    b.status,
    b.amount_gross ?? '',
    b.commission_amount ?? '',
    b.amount_host_payout ?? '',
    b.cleaning_fee ?? '',
    b.security_deposit ?? '',
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `buchungen-${format(new Date(), 'yyyy-MM-dd')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const PAGE_SIZE = 20

export default function BuchungenPage() {
  const [allBookings, setAllBookings] = useState<BookingWithProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('Alle')
  const [status, setStatus] = useState('Alle')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [page, setPage] = useState(0)
  const [selectedBooking, setSelectedBooking] = useState<BookingWithProperty | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    async function fetchBookings() {
      const dateRange = getDateRange(timeRange)
      let query = supabase
        .from('bookings')
        .select('*, properties(*)')
        .order('check_in', { ascending: false })

      if (dateRange) {
        query = query.lte('check_in', dateRange.to).gte('check_out', dateRange.from)
      }

      const { data } = await query
      setAllBookings((data ?? []) as BookingWithProperty[])
      setLoading(false)
    }

    setLoading(true)
    setPage(0)
    fetchBookings()
  }, [timeRange])

  const filtered = useMemo(() => {
    let result = allBookings

    if (channel !== 'Alle') {
      result = result.filter((b) => b.channel === channel)
    }
    if (status !== 'Alle') {
      result = result.filter((b) => b.status === status)
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

    return result
  }, [allBookings, channel, status, search])

  const paginated = useMemo(() => {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  }, [filtered, page])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const handleRowClick = useCallback((booking: BookingWithProperty) => {
    setSelectedBooking(booking)
    setSheetOpen(true)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Buchungen</h2>
        <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)}>
          <Download className="mr-2 h-4 w-4" />
          CSV Export
        </Button>
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
        <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">Dieser Monat</SelectItem>
            <SelectItem value="last_month">Letzter Monat</SelectItem>
            <SelectItem value="this_quarter">Dieses Quartal</SelectItem>
            <SelectItem value="this_year">Dieses Jahr</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
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
      />
    </div>
  )
}

'use client'

import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowUpDown, ArrowUp, ArrowDown, FileText, ClipboardList, CreditCard } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BookingStatusBadge } from './booking-status-badge'
import type { BookingWithProperty } from '@/lib/types'

export type SortColumn = 'guest' | 'check_in' | 'check_out' | 'nights' | 'amount_gross' | 'created_at'
export type SortDirection = 'asc' | 'desc'

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '–'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatDate(dateStr: string): string {
  return format(new Date(dateStr + 'T00:00:00'), 'dd.MM.yy', { locale: de })
}

function SortIcon({ column, sortColumn, sortDirection }: { column: SortColumn; sortColumn: SortColumn; sortDirection: SortDirection }) {
  if (column !== sortColumn) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />
  return sortDirection === 'asc'
    ? <ArrowUp className="ml-1 h-3 w-3 inline" />
    : <ArrowDown className="ml-1 h-3 w-3 inline" />
}

export function BookingTable({
  bookings,
  loading,
  onRowClick,
  sortColumn,
  sortDirection,
  onSort,
  invoiceBookingIds = new Set(),
  meldescheinBookingIds = new Set(),
  onToggleReady,
}: {
  bookings: BookingWithProperty[]
  loading: boolean
  onRowClick?: (booking: BookingWithProperty) => void
  sortColumn: SortColumn
  sortDirection: SortDirection
  onSort: (col: SortColumn) => void
  invoiceBookingIds?: Set<string>
  meldescheinBookingIds?: Set<string>
  onToggleReady?: (bookingId: string, newValue: boolean) => void
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Keine Buchungen gefunden
      </div>
    )
  }

  const th = (col: SortColumn, label: string, className?: string) => (
    <TableHead
      className={`cursor-pointer select-none ${className ?? ''}`}
      onClick={() => onSort(col)}
    >
      {label}
      <SortIcon column={col} sortColumn={sortColumn} sortDirection={sortDirection} />
    </TableHead>
  )

  return (
    <TooltipProvider>
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {th('guest', 'Gast')}
            <TableHead className="hidden sm:table-cell">Objekt</TableHead>
            {th('check_in', 'Check-in')}
            {th('check_out', 'Check-out')}
            {th('nights', 'Nächte', 'hidden md:table-cell text-center')}
            {th('amount_gross', 'Betrag', 'text-right')}
            <TableHead className="hidden md:table-cell">Kanal</TableHead>
            {th('created_at', 'Gebucht am', 'hidden lg:table-cell')}
            <TableHead>Status</TableHead>
            <TableHead className="text-center w-16">Docs</TableHead>
            <TableHead className="w-8 text-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">&#9679;</span>
                </TooltipTrigger>
                <TooltipContent>Bereit-Status</TooltipContent>
              </Tooltip>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => {
            const guestName =
              [booking.guest_firstname, booking.guest_lastname]
                .filter(Boolean)
                .join(' ') || '–'
            // PROJ-21: Steuer-Befreiungs-Badges
            const isBhstExempt = booking.trip_purpose === 'business'
            const isVatExempt = (booking as unknown as { vat_exempt?: boolean }).vat_exempt === true

            return (
              <TableRow
                key={booking.id}
                className={onRowClick ? 'cursor-pointer' : ''}
                onClick={() => onRowClick?.(booking)}
              >
                <TableCell className="font-medium">
                  <div className="flex flex-col gap-0.5">
                    <span>{guestName}</span>
                    {(isBhstExempt || isVatExempt) && (
                      <div className="flex flex-wrap gap-1">
                        {isBhstExempt && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 h-4 border-blue-300 text-blue-600">
                            BhSt befreit
                          </Badge>
                        )}
                        {isVatExempt && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 h-4 border-purple-300 text-purple-600">
                            USt-frei
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {booking.properties?.name ?? '–'}
                </TableCell>
                <TableCell>{formatDate(booking.check_in)}</TableCell>
                <TableCell>{formatDate(booking.check_out)}</TableCell>
                <TableCell className="hidden md:table-cell text-center">
                  {booking.nights ?? '–'}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(booking.amount_gross)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {booking.channel}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">
                  {booking.created_at ? formatDate(booking.created_at.split('T')[0]) : '–'}
                </TableCell>
                <TableCell>
                  <BookingStatusBadge status={booking.status} />
                </TableCell>
                <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <CreditCard className={`h-4 w-4 ${
                            booking.payment_status === 'paid' || booking.payment_status === 'manual'
                              ? 'text-emerald-600'
                              : booking.payment_status === 'pending'
                                ? 'text-amber-500'
                                : 'text-muted-foreground/30'
                          }`} />
                        </TooltipTrigger>
                        <TooltipContent>
                          {booking.payment_status === 'paid'
                            ? 'Bezahlt'
                            : booking.payment_status === 'manual'
                              ? 'Manuell bezahlt'
                              : booking.payment_status === 'pending'
                                ? 'Zahlung ausstehend'
                                : 'Kein Zahlungsstatus'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <FileText className={`h-4 w-4 ${invoiceBookingIds.has(booking.id) ? 'text-emerald-600' : 'text-muted-foreground/30'}`} />
                        </TooltipTrigger>
                        <TooltipContent>
                          {invoiceBookingIds.has(booking.id) ? 'Rechnung vorhanden' : 'Keine Rechnung'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ClipboardList className={`h-4 w-4 ${meldescheinBookingIds.has(booking.id) ? 'text-emerald-600' : 'text-muted-foreground/30'}`} />
                        </TooltipTrigger>
                        <TooltipContent>
                          {meldescheinBookingIds.has(booking.id) ? 'Meldeschein vorhanden' : 'Kein Meldeschein'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                </TableCell>
                <TableCell className="text-center w-8">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleReady?.(booking.id, !booking.is_ready)
                        }}
                      >
                        <span className={`inline-block h-3 w-3 rounded-full ${booking.is_ready ? 'bg-emerald-500' : 'bg-red-400'}`} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {booking.is_ready ? 'Bereit' : 'Nicht bereit'} – Klicken zum Umschalten
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  )
}

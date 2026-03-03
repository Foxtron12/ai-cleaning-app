'use client'

import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { BookingStatusBadge } from './booking-status-badge'
import type { BookingWithProperty } from '@/lib/types'

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

export function BookingTable({
  bookings,
  loading,
  onRowClick,
}: {
  bookings: BookingWithProperty[]
  loading: boolean
  onRowClick?: (booking: BookingWithProperty) => void
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Gast</TableHead>
            <TableHead className="hidden sm:table-cell">Objekt</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead className="hidden md:table-cell text-center">Nächte</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead className="hidden md:table-cell">Kanal</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => {
            const guestName =
              [booking.guest_firstname, booking.guest_lastname]
                .filter(Boolean)
                .join(' ') || '–'

            return (
              <TableRow
                key={booking.id}
                className={onRowClick ? 'cursor-pointer' : ''}
                onClick={() => onRowClick?.(booking)}
              >
                <TableCell className="font-medium">{guestName}</TableCell>
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
                <TableCell>
                  <BookingStatusBadge status={booking.status} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

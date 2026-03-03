'use client'

import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { LogIn, LogOut } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { BookingWithProperty } from '@/lib/types'

function formatDate(dateStr: string): string {
  return format(new Date(dateStr + 'T00:00:00'), 'EEE, d. MMM', { locale: de })
}

function ActivityItem({
  booking,
  type,
}: {
  booking: BookingWithProperty
  type: 'check-in' | 'check-out'
}) {
  const date = type === 'check-in' ? booking.check_in : booking.check_out
  const guestName = [booking.guest_firstname, booking.guest_lastname]
    .filter(Boolean)
    .join(' ') || 'Unbekannter Gast'
  const propertyName = booking.properties?.name ?? 'Unbekannt'

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          type === 'check-in'
            ? 'bg-green-100 text-green-600'
            : 'bg-orange-100 text-orange-600'
        }`}
      >
        {type === 'check-in' ? (
          <LogIn className="h-4 w-4" />
        ) : (
          <LogOut className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{guestName}</p>
        <p className="text-xs text-muted-foreground truncate">{propertyName}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm">{formatDate(date)}</p>
        <Badge variant="outline" className="text-xs">
          {booking.channel}
        </Badge>
      </div>
    </div>
  )
}

export function UpcomingActivities({
  checkIns,
  checkOuts,
  loading,
}: {
  checkIns: BookingWithProperty[]
  checkOuts: BookingWithProperty[]
  loading: boolean
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <LogIn className="h-4 w-4 text-green-600" />
            Check-ins (nächste 7 Tage)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : checkIns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Keine Check-ins in den nächsten 7 Tagen
            </p>
          ) : (
            <div className="divide-y">
              {checkIns.map((booking) => (
                <ActivityItem
                  key={booking.id}
                  booking={booking}
                  type="check-in"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <LogOut className="h-4 w-4 text-orange-600" />
            Check-outs (nächste 7 Tage)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : checkOuts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Keine Check-outs in den nächsten 7 Tagen
            </p>
          ) : (
            <div className="divide-y">
              {checkOuts.map((booking) => (
                <ActivityItem
                  key={booking.id}
                  booking={booking}
                  type="check-out"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

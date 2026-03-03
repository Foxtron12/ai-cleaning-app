'use client'

import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { FileText, Receipt } from 'lucide-react'
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
  return format(new Date(dateStr + 'T00:00:00'), 'dd.MM.yyyy', { locale: de })
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value ?? '–'}</span>
    </div>
  )
}

export function BookingDetailSheet({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingWithProperty | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!booking) return null

  const guestName = [booking.guest_firstname, booking.guest_lastname]
    .filter(Boolean)
    .join(' ') || 'Unbekannter Gast'

  const guestAddress = [
    booking.guest_street,
    [booking.guest_zip, booking.guest_city].filter(Boolean).join(' '),
    booking.guest_country,
  ]
    .filter(Boolean)
    .join(', ')

  const commissionPercent =
    booking.amount_gross && booking.commission_amount
      ? ((booking.commission_amount / booking.amount_gross) * 100).toFixed(1)
      : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {guestName}
            <BookingStatusBadge status={booking.status} />
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Aufenthalt */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Aufenthalt</h3>
            <InfoRow label="Objekt" value={booking.properties?.name} />
            <InfoRow label="Check-in" value={formatDate(booking.check_in)} />
            <InfoRow label="Check-out" value={formatDate(booking.check_out)} />
            <InfoRow label="Nächte" value={booking.nights} />
            <InfoRow
              label="Gäste"
              value={`${booking.adults ?? 1} Erw.${booking.children ? ` + ${booking.children} Kinder` : ''}`}
            />
            <InfoRow label="Kanal" value={booking.channel} />
          </div>

          <Separator />

          {/* Gastdaten */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Gastdaten</h3>
            <InfoRow label="Name" value={guestName} />
            <InfoRow label="E-Mail" value={booking.guest_email} />
            <InfoRow label="Telefon" value={booking.guest_phone} />
            <InfoRow label="Adresse" value={guestAddress || null} />
            <InfoRow label="Nationalität" value={booking.guest_nationality} />
            <InfoRow label="Sprache" value={booking.guest_language} />
          </div>

          <Separator />

          {/* Finanzdaten */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Finanzdaten</h3>
            <InfoRow label="Bruttobetrag" value={formatCurrency(booking.amount_gross)} />
            <InfoRow
              label="Provision"
              value={
                booking.commission_amount !== null
                  ? `${formatCurrency(booking.commission_amount)}${commissionPercent ? ` (${commissionPercent}%)` : ''}`
                  : '–'
              }
            />
            <InfoRow label="Host-Auszahlung" value={formatCurrency(booking.amount_host_payout)} />
            <InfoRow label="Reinigungsgebühr" value={formatCurrency(booking.cleaning_fee)} />
            <InfoRow label="Zusatzgebühren" value={formatCurrency(booking.extra_fees)} />
            <InfoRow label="Kaution" value={formatCurrency(booking.security_deposit)} />
            <InfoRow label="Vorauszahlung" value={formatCurrency(booking.prepayment)} />
            <InfoRow label="Restbetrag" value={formatCurrency(booking.balance)} />
          </div>

          {booking.guest_note && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-2">Notizen</h3>
                <p className="text-sm text-muted-foreground">{booking.guest_note}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Aktionen */}
          <div className="flex flex-col gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/meldescheine?booking=${booking.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                Meldeschein erstellen
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/rechnungen?booking=${booking.id}`}>
                <Receipt className="mr-2 h-4 w-4" />
                Rechnung erstellen
              </Link>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

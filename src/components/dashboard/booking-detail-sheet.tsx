'use client'

import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { FileText, Receipt, Copy, Check, ExternalLink } from 'lucide-react'
import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { BookingStatusBadge } from './booking-status-badge'
import type { BookingWithProperty } from '@/lib/types'
import { getCleaningFee } from '@/lib/calculators/booking-price'
import { calculateAccommodationTax, getTaxConfigForProperty } from '@/lib/calculators/accommodation-tax'

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

function StripePaymentLinkSection({ booking }: { booking: BookingWithProperty }) {
  const [copied, setCopied] = useState(false)
  // stripe_payment_link will be available once PROJ-8 is implemented
  // For now we read it from the booking object if present
  const stripeLink = (booking as Record<string, unknown>).stripe_payment_link as string | null | undefined

  const handleCopy = useCallback(() => {
    if (!stripeLink) return
    navigator.clipboard.writeText(stripeLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [stripeLink])

  if (!stripeLink) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2">Zahlungslink</h3>
        <p className="text-sm text-muted-foreground">
          Noch kein Zahlungslink vorhanden. Wird verfuegbar sobald Stripe-Integration aktiv ist.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Stripe-Zahlungslink</h3>
      <div className="flex gap-2">
        <Input value={stripeLink} readOnly className="text-xs flex-1" />
        <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Link kopieren">
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button variant="outline" size="icon" asChild aria-label="Link oeffnen">
          <a href={stripeLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
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

  // Calculate city tax from property config (empty rules → uses property fields directly)
  const taxConfig = booking.properties
    ? getTaxConfigForProperty(booking.properties, [])
    : null
  const taxResult = taxConfig ? calculateAccommodationTax(booking, taxConfig, booking.properties?.ota_remits_tax ?? []) : null
  const cityTax = taxResult?.taxAmount ?? 0

  // Vom Gast bezahlt = gross incl. city tax + portal commission
  // Booking.com: amount_gross already includes city tax → use as-is
  // Airbnb: amount_gross excludes city tax (Airbnb remits separately) → add city tax
  const paidByGuest =
    booking.channel === 'Airbnb'
      ? (booking.amount_gross ?? 0) + cityTax
      : (booking.amount_gross ?? 0)

  // Bruttobetrag = booking price incl. commission, excl. city tax
  // Airbnb: amount_gross already excludes city tax → use as-is
  // Booking.com: subtract city tax from amount_gross
  const bruttoWithoutCityTax =
    booking.channel === 'Booking.com'
      ? (booking.amount_gross ?? 0) - cityTax
      : (booking.amount_gross ?? 0)

  // Nettobetrag = Bruttobetrag ohne 7% MwSt (Beherbergungsleistung)
  const nettoAmount = bruttoWithoutCityTax > 0 ? bruttoWithoutCityTax / 1.07 : null

  const commissionPercent =
    bruttoWithoutCityTax && booking.commission_amount
      ? ((booking.commission_amount / bruttoWithoutCityTax) * 100).toFixed(1)
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
            <InfoRow label="Vom Gast bezahlt" value={formatCurrency(paidByGuest)} />
            <InfoRow label="Bruttobetrag (ohne City Tax)" value={formatCurrency(bruttoWithoutCityTax)} />
            <InfoRow label="Nettobetrag (ohne 7% MwSt)" value={formatCurrency(nettoAmount)} />
            <InfoRow
              label="Provision"
              value={
                booking.commission_amount !== null
                  ? `${formatCurrency(booking.commission_amount)}${commissionPercent ? ` (${commissionPercent}%)` : ''}`
                  : '–'
              }
            />
            <InfoRow
              label="Host-Auszahlung"
              value={formatCurrency(
                (booking.amount_host_payout ?? 0) > 0
                  ? booking.amount_host_payout
                  : (booking.amount_gross ?? 0) - (booking.commission_amount ?? 0)
              )}
            />
            <InfoRow label="Reinigungsgebühr" value={formatCurrency(getCleaningFee(booking))} />
            <InfoRow
              label={`Beherbergungssteuer${taxResult?.remittedByOta ? ` (von ${taxResult.remittedByOtaName ?? 'OTA'} abgeführt)` : ''}`}
              value={taxResult ? formatCurrency(taxResult.taxAmount) : '–'}
            />
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

          {/* Stripe-Zahlungslink (Direktbuchungen) */}
          {booking.channel === 'Direct' && (
            <>
              <Separator />
              <StripePaymentLinkSection booking={booking} />
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

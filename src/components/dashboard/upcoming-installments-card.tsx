'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { CalendarClock, Check, AlertCircle, FileText, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { UpcomingPayment } from '@/lib/installments'

const formatEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

function formatDate(dateStr: string): string {
  return format(new Date(dateStr + 'T00:00:00'), 'dd.MM.yyyy', { locale: de })
}

function StatusBadge({ payment }: { payment: UpcomingPayment }) {
  if (payment.status === 'overdue') {
    const days = Math.abs(payment.daysFromToday)
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Überfällig ({days} {days === 1 ? 'Tag' : 'Tage'})
      </Badge>
    )
  }
  if (payment.status === 'today') {
    return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Heute fällig</Badge>
  }
  return (
    <Badge variant="outline">
      Fällig in {payment.daysFromToday} {payment.daysFromToday === 1 ? 'Tag' : 'Tagen'}
    </Badge>
  )
}

export function UpcomingInstallmentsCard({
  payments,
  loading,
  onMarkPaid,
  markingKey,
}: {
  payments: UpcomingPayment[]
  loading: boolean
  onMarkPaid: (payment: UpcomingPayment) => void
  markingKey: string | null
}) {
  const visible = payments.slice(0, 10)
  const overflow = payments.length - visible.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-blue-600" />
          Fällige Zahlungen (nächste 30 Tage)
          {payments.length > 0 && (
            <Badge variant="secondary" className="ml-1">{payments.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Keine fälligen Zahlungen in den nächsten 30 Tagen
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Fällig am</TableHead>
                    <TableHead>Gast</TableHead>
                    <TableHead>Rechnung</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((p) => (
                    <TableRow key={p.key}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {formatDate(p.dueDate)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{p.guestName}</span>
                          {p.propertyName && (
                            <span className="text-xs text-muted-foreground">{p.propertyName}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{p.invoiceNumber}</span>
                          {p.source === 'installment' && p.installmentIndex && p.installmentTotal && (
                            <Badge variant="secondary" className="text-xs">
                              Rate {p.installmentIndex}/{p.installmentTotal}
                            </Badge>
                          )}
                          {p.source === 'invoice' && (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              Rechnung
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatEur(p.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge payment={p} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.source === 'installment' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={markingKey === p.key}
                              onClick={() => onMarkPaid(p)}
                              title="Rate als bezahlt markieren"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button asChild variant="ghost" size="sm" title="Rechnung öffnen">
                            <Link href={`/dashboard/rechnungen?invoice=${p.invoiceId}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-2">
              {visible.map((p) => (
                <div key={p.key} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.guestName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.invoiceNumber}
                        {p.source === 'installment' && p.installmentIndex && p.installmentTotal && (
                          <> · Rate {p.installmentIndex}/{p.installmentTotal}</>
                        )}
                      </p>
                    </div>
                    <span className="font-medium text-sm whitespace-nowrap">
                      {formatEur(p.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">{formatDate(p.dueDate)}</span>
                      <StatusBadge payment={p} />
                    </div>
                    <div className="flex items-center gap-1">
                      {p.source === 'installment' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={markingKey === p.key}
                          onClick={() => onMarkPaid(p)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/dashboard/rechnungen?invoice=${p.invoiceId}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {overflow > 0 && (
              <div className="mt-3 text-right">
                <Link
                  href="/dashboard/rechnungen?view=raten"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  +{overflow} weitere anzeigen
                </Link>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

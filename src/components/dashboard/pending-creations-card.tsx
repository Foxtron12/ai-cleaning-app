'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { FilePlus2, AlertCircle, Plus } from 'lucide-react'
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
import type { PendingInvoiceCreation } from '@/lib/installments'

const formatEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

function StatusBadge({ item }: { item: PendingInvoiceCreation }) {
  if (item.status === 'overdue') {
    const days = Math.abs(item.daysFromToday)
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Überfällig ({days} {days === 1 ? 'Tag' : 'Tage'})
      </Badge>
    )
  }
  if (item.status === 'today') {
    return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Jetzt erstellen</Badge>
  }
  return (
    <Badge variant="outline">
      In {item.daysFromToday} {item.daysFromToday === 1 ? 'Tag' : 'Tagen'}
    </Badge>
  )
}

export function PendingCreationsCard({
  items,
  loading,
}: {
  items: PendingInvoiceCreation[]
  loading: boolean
}) {
  const visible = items.slice(0, 10)
  const overflow = items.length - visible.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FilePlus2 className="h-4 w-4 text-purple-600" />
          Rechnungen zu erstellen (monatliche Abrechnung)
          {items.length > 0 && (
            <Badge variant="secondary" className="ml-1">{items.length}</Badge>
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
            Aktuell keine offenen Monatsabrechnungen. Bei Langzeitbuchungen erscheint hier eine Erinnerung, sobald ein neuer Monat zu fakturieren ist.
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Monat</TableHead>
                    <TableHead>Gast</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium capitalize">{item.monthLabel}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(item.segmentStart + 'T00:00:00'), 'dd.MM.', { locale: de })}
                            {' – '}
                            {format(new Date(item.segmentEnd + 'T00:00:00'), 'dd.MM.yyyy', { locale: de })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{item.guestName}</span>
                          {item.propertyName && (
                            <span className="text-xs text-muted-foreground">{item.propertyName}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatEur(item.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge item={item} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="default">
                          <Link href={`/dashboard/rechnungen?booking=${item.bookingId}&split=true`}>
                            <Plus className="mr-1 h-3 w-3" />
                            Erstellen
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-2">
              {visible.map((item) => (
                <div key={item.key} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm capitalize truncate">{item.monthLabel}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.guestName}</p>
                    </div>
                    <span className="font-medium text-sm whitespace-nowrap">
                      {formatEur(item.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge item={item} />
                    <Button asChild size="sm" variant="default">
                      <Link href={`/dashboard/rechnungen?booking=${item.bookingId}&split=true`}>
                        <Plus className="mr-1 h-3 w-3" />
                        Erstellen
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {overflow > 0 && (
              <p className="mt-3 text-xs text-muted-foreground text-right">
                +{overflow} weitere ausstehend
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import {
  CalendarDays,
  TrendingUp,
  Euro,
  Wallet,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface KpiData {
  bookingsThisMonth: number
  occupancyPercent: number
  revenueGross: number
  revenueNet: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function KpiCards({ data, loading }: { data: KpiData | null; loading: boolean }) {
  const cards = [
    {
      title: 'Buchungen',
      value: data?.bookingsThisMonth ?? 0,
      format: (v: number) => String(v),
      description: 'Diesen Monat',
      icon: CalendarDays,
    },
    {
      title: 'Auslastung',
      value: data?.occupancyPercent ?? 0,
      format: (v: number) => `${v.toFixed(0)}%`,
      description: 'Diesen Monat',
      icon: TrendingUp,
    },
    {
      title: 'Brutto-Umsatz',
      value: data?.revenueGross ?? 0,
      format: formatCurrency,
      description: 'Diesen Monat',
      icon: Euro,
    },
    {
      title: 'Netto-Umsatz',
      value: data?.revenueNet ?? 0,
      format: formatCurrency,
      description: 'Nach Provisionen',
      icon: Wallet,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-2xl font-bold">{card.format(card.value)}</div>
            )}
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

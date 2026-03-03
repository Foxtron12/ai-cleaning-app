'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'

export interface MonthlyRevenue {
  month: string
  gross: number
  net: number
}

const chartConfig = {
  gross: {
    label: 'Brutto',
    color: 'hsl(var(--chart-1))',
  },
  net: {
    label: 'Netto',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig

export function RevenueChart({
  data,
  loading,
}: {
  data: MonthlyRevenue[]
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Monatsumsatz (6 Monate)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Keine Umsatzdaten vorhanden
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={data} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  new Intl.NumberFormat('de-DE', {
                    notation: 'compact',
                    compactDisplay: 'short',
                  }).format(value)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(value as number)
                    }
                  />
                }
              />
              <Bar
                dataKey="gross"
                fill="var(--color-gross)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="net"
                fill="var(--color-net)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

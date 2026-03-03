'use client'

import { Pie, PieChart, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'

export interface ChannelData {
  channel: string
  count: number
}

const CHANNEL_COLORS: Record<string, string> = {
  Airbnb: 'hsl(350, 80%, 55%)',
  'Booking.com': 'hsl(220, 80%, 55%)',
  VRBO: 'hsl(270, 60%, 55%)',
  Expedia: 'hsl(45, 80%, 55%)',
  Direct: 'hsl(140, 60%, 45%)',
  Google: 'hsl(200, 70%, 50%)',
  Other: 'hsl(0, 0%, 60%)',
}

function buildChartConfig(data: ChannelData[]): ChartConfig {
  const config: ChartConfig = {}
  for (const item of data) {
    config[item.channel] = {
      label: item.channel,
      color: CHANNEL_COLORS[item.channel] ?? 'hsl(0, 0%, 60%)',
    }
  }
  return config
}

export function ChannelChart({
  data,
  loading,
}: {
  data: ChannelData[]
  loading: boolean
}) {
  const chartConfig = buildChartConfig(data)
  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Buchungsquellen</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Keine Buchungsdaten vorhanden
          </p>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="channel"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.channel}
                      fill={CHANNEL_COLORS[entry.channel] ?? 'hsl(0, 0%, 60%)'}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap justify-center gap-3">
              {data.map((entry) => (
                <div key={entry.channel} className="flex items-center gap-1.5 text-sm">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor:
                        CHANNEL_COLORS[entry.channel] ?? 'hsl(0, 0%, 60%)',
                    }}
                  />
                  <span>
                    {entry.channel}{' '}
                    <span className="text-muted-foreground">
                      ({entry.count} / {total > 0 ? Math.round((entry.count / total) * 100) : 0}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

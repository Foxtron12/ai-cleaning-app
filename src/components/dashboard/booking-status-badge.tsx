'use client'

import { Badge } from '@/components/ui/badge'

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  upcoming: { label: 'Bevorstehend', variant: 'default' },
  active: { label: 'Aktiv', variant: 'secondary' },
  completed: { label: 'Abgeschlossen', variant: 'outline' },
  cancelled: { label: 'Storniert', variant: 'destructive' },
}

export function BookingStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, variant: 'outline' as const }

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  )
}

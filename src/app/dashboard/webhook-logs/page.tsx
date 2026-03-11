'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw } from 'lucide-react'

interface WebhookLog {
  id: string
  action: string | null
  reservation_id: number | null
  payload: Record<string, unknown>
  processed: boolean
  error: string | null
  created_at: string
}

function formatLogSummary(payload: Record<string, unknown>): string {
  const data = (payload?.data as Record<string, unknown>) ?? payload
  const firstname = String(data?.firstname ?? '–')
  const lastname = String(data?.lastname ?? '')
  const addr = data?.address as Record<string, string> | undefined
  const addrStr = addr
    ? [addr.street, addr.postalCode, addr.city, addr.country].filter(Boolean).join(', ') || '–'
    : '–'
  return `Gast: ${firstname} ${lastname} | Adresse: ${addrStr}`
}

export default function WebhookLogsPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) setLogs(data as unknown as WebhookLog[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Auto-refresh every 3 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchLogs, 3000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLogs])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhook Logs</h1>
          <p className="text-muted-foreground text-sm">
            Smoobu Webhook-Payloads in Echtzeit.
            {autoRefresh && ' Auto-Refresh aktiv (alle 3s).'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto-Refresh aus' : 'Auto-Refresh an'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Lade Logs...</p>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Noch keine Webhooks empfangen. Ändere etwas in Smoobu und schau hier zu.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card
              key={log.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={log.processed ? 'default' : 'destructive'}>
                      {log.processed ? 'OK' : 'Fehler'}
                    </Badge>
                    <CardTitle className="text-sm font-mono">
                      {log.action ?? 'unknown'}
                    </CardTitle>
                    {log.reservation_id && (
                      <span className="text-xs text-muted-foreground">
                        Reservation #{log.reservation_id}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString('de-DE')}
                  </span>
                </div>
                {log.error && (
                  <p className="text-xs text-destructive mt-1">{log.error}</p>
                )}
                {(!expandedId || expandedId !== log.id) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatLogSummary(log.payload)}
                  </p>
                )}
              </CardHeader>
              {expandedId === log.id && (
                <CardContent className="pt-0 px-4 pb-4">
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-96">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

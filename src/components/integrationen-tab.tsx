'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  RotateCcw,
  CheckCircle,
  XCircle,
  Plug,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface IntegrationData {
  id: string
  provider: string
  status: string
  webhook_token: string | null
  webhook_url: string | null
  last_synced_at: string | null
  error_message: string | null
  has_api_key: boolean
}

type FeedbackMessage = { success: boolean; message: string } | null

export function IntegrationenTab() {
  const [integrations, setIntegrations] = useState<IntegrationData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Smoobu form state
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackMessage>(null)

  const smoobu = integrations.find((i) => i.provider === 'smoobu')

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations')
      if (!res.ok) throw new Error('Laden fehlgeschlagen')
      const json = await res.json()
      setIntegrations(json.data ?? [])
      setError(null)
    } catch {
      setError('Integrationen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  async function handleSaveSmoobu() {
    if (!apiKey.trim()) return
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/integrations/smoobu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setFeedback({ success: true, message: json.message })
        setApiKey('')
        await fetchIntegrations()
      } else {
        setFeedback({ success: false, message: json.error ?? 'Speichern fehlgeschlagen' })
      }
    } catch {
      setFeedback({ success: false, message: 'Verbindungsfehler' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setFeedback(null)
    try {
      const res = await fetch('/api/smoobu/test')
      const json = await res.json()
      setFeedback({
        success: json.success,
        message: json.success
          ? `Verbindung OK – ${json.apartmentCount} Objekt(e) gefunden`
          : json.error ?? 'Verbindung fehlgeschlagen',
      })
    } catch {
      setFeedback({ success: false, message: 'Verbindungsfehler' })
    }
  }

  async function handleSync() {
    setSyncing(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/smoobu/sync', { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        setFeedback({
          success: true,
          message: `Sync erfolgreich: ${json.properties} Objekte, ${json.reservations.total} Buchungen (${json.reservations.created} neu, ${json.reservations.updated} aktualisiert)`,
        })
        await fetchIntegrations()
      } else {
        setFeedback({ success: false, message: json.error ?? 'Sync fehlgeschlagen' })
      }
    } catch {
      setFeedback({ success: false, message: 'Verbindungsfehler' })
    } finally {
      setSyncing(false)
    }
  }

  async function handleRegenerateToken() {
    setRegenerating(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/integrations/smoobu/regenerate-token', { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.success) {
        setFeedback({ success: true, message: json.message })
        await fetchIntegrations()
      } else {
        setFeedback({ success: false, message: json.error ?? 'Token-Erneuerung fehlgeschlagen' })
      }
    } catch {
      setFeedback({ success: false, message: 'Verbindungsfehler' })
    } finally {
      setRegenerating(false)
    }
  }

  async function handleDeleteSmoobu() {
    setDeleting(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/integrations/smoobu', { method: 'DELETE' })
      const json = await res.json()
      if (res.ok && json.success) {
        setFeedback({ success: true, message: json.message })
        await fetchIntegrations()
      } else {
        setFeedback({ success: false, message: json.error ?? 'Löschen fehlgeschlagen' })
      }
    } catch {
      setFeedback({ success: false, message: 'Verbindungsfehler' })
    } finally {
      setDeleting(false)
    }
  }

  function handleCopyWebhookUrl() {
    if (!smoobu?.webhook_url) return
    navigator.clipboard.writeText(smoobu.webhook_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => { setLoading(true); fetchIntegrations() }}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  const statusBadge = (status: string | undefined) => {
    switch (status) {
      case 'connected':
        return <Badge variant="default" className="bg-green-600">Verbunden</Badge>
      case 'error':
        return <Badge variant="destructive">Fehler</Badge>
      default:
        return <Badge variant="secondary">Nicht konfiguriert</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Smoobu Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Plug className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Smoobu</CardTitle>
                <CardDescription>Property Management System</CardDescription>
              </div>
            </div>
            {statusBadge(smoobu?.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* API Key Input */}
          <div className="space-y-2">
            <Label>API-Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={smoobu?.status === 'connected' ? '••••••••••••••••' : 'Smoobu API-Key eingeben'}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={handleSaveSmoobu} disabled={saving || !apiKey.trim()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {saving ? 'Teste...' : 'Speichern & Testen'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Den API-Key findest du unter Smoobu → Einstellungen → API & Webhooks
            </p>
          </div>

          {/* Webhook URL (only if connected) */}
          {smoobu?.webhook_url && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Webhook-URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={smoobu.webhook_url}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={handleCopyWebhookUrl}>
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Trage diese URL in Smoobu unter Einstellungen → Webhooks ein, um Echtzeit-Updates zu erhalten.
                </p>
              </div>
            </>
          )}

          {/* Actions (only if connected) */}
          {smoobu?.status === 'connected' && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleTestConnection}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Verbindung testen
                </Button>
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Synchronisiert...' : 'Jetzt synchronisieren'}
                </Button>

                {/* Regenerate Token */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={regenerating}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Token erneuern
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Webhook-Token erneuern?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Der alte Token wird sofort ungültig. Du musst die neue Webhook-URL anschließend in deinen Smoobu-Einstellungen eintragen.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRegenerateToken}>
                        Token erneuern
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Delete Integration */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={deleting}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Integration entfernen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Smoobu-Integration entfernen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Die Verbindung wird getrennt und die Webhook-URL wird ungültig. Bereits synchronisierte Buchungen bleiben erhalten.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteSmoobu}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Entfernen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Last sync info */}
              {smoobu.last_synced_at && (
                <p className="text-xs text-muted-foreground">
                  Letzter Sync: {new Date(smoobu.last_synced_at).toLocaleString('de-DE')}
                </p>
              )}
            </>
          )}

          {/* Error message from DB */}
          {smoobu?.error_message && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-md bg-red-50 text-red-700">
              <XCircle className="h-4 w-4 shrink-0" />
              {smoobu.error_message}
            </div>
          )}

          {/* Feedback message */}
          {feedback && (
            <div
              className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                feedback.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {feedback.success ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              {feedback.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apaleo Card (Coming Soon) */}
      <Card className="opacity-60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <Plug className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Apaleo</CardTitle>
                <CardDescription>Open Hospitality Cloud</CardDescription>
              </div>
            </div>
            <Badge variant="outline">Demnächst verfügbar</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Apaleo-Integration mit OAuth 2.0 wird in einer zukünftigen Version unterstützt.
          </p>
        </CardContent>
      </Card>

      {/* Mews Card (Coming Soon) */}
      <Card className="opacity-60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <Plug className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Mews</CardTitle>
                <CardDescription>Hospitality Cloud Platform</CardDescription>
              </div>
            </div>
            <Badge variant="outline">Demnächst verfügbar</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Mews-Integration mit API-Token wird in einer zukünftigen Version unterstützt.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Settings } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

export default function EinstellungenPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    async function fetchSettings() {
      // Explicitly select columns – never expose smoobu_api_key to the browser
      const { data } = await supabase
        .from('settings')
        .select(`
          id, created_at, updated_at,
          landlord_name, landlord_street, landlord_zip, landlord_city,
          landlord_phone, landlord_email, landlord_website,
          tax_number, vat_id, finanzamt, is_kleinunternehmer,
          bank_iban, bank_bic, bank_name,
          invoice_prefix, invoice_next_number, invoice_payment_days,
          smoobu_last_sync
        `)
        .limit(1)
        .single()
      setSettings(data as Parameters<typeof setSettings>[0])
      setLoading(false)
    }
    fetchSettings()
  }, [])

  function updateField(field: keyof Settings, value: string | number | boolean | null) {
    if (!settings) return
    setSettings({ ...settings, [field]: value })
    setSaved(false)
  }

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    const { id, created_at, updated_at, ...updateData } = settings
    await supabase
      .from('settings')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/smoobu/sync', {
        method: 'POST',
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      })
      const data = await response.json()
      if (data.success) {
        setSyncResult({
          success: true,
          message: `Sync erfolgreich: ${data.properties} Objekte, ${data.reservations.total} Buchungen (${data.reservations.created} neu, ${data.reservations.updated} aktualisiert)`,
        })
      } else {
        setSyncResult({ success: false, message: data.error ?? 'Sync fehlgeschlagen' })
      }
    } catch {
      setSyncResult({ success: false, message: 'Verbindungsfehler' })
    } finally {
      setSyncing(false)
    }
  }

  async function handleTestConnection() {
    setSyncResult(null)
    try {
      const response = await fetch('/api/smoobu/test')
      const data = await response.json()
      setSyncResult({
        success: data.success,
        message: data.success
          ? `Verbindung OK – ${data.apartmentCount} Objekt(e) gefunden`
          : data.error ?? 'Verbindung fehlgeschlagen',
      })
    } catch {
      setSyncResult({ success: false, message: 'Verbindungsfehler' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Einstellungen</h2>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Einstellungen konnten nicht geladen werden
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Einstellungen</h2>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Wird gespeichert...' : saved ? 'Gespeichert!' : 'Speichern'}
        </Button>
      </div>

      {/* Vermieter-Stammdaten */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vermieter-Stammdaten</CardTitle>
          <CardDescription>Erscheint auf Rechnungen und Meldescheinen</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Name / Firma</Label>
              <Input
                value={settings.landlord_name ?? ''}
                onChange={(e) => updateField('landlord_name', e.target.value)}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Straße, Nr.</Label>
              <Input
                value={settings.landlord_street ?? ''}
                onChange={(e) => updateField('landlord_street', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>PLZ</Label>
              <Input
                value={settings.landlord_zip ?? ''}
                onChange={(e) => updateField('landlord_zip', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ort</Label>
              <Input
                value={settings.landlord_city ?? ''}
                onChange={(e) => updateField('landlord_city', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input
                value={settings.landlord_phone ?? ''}
                onChange={(e) => updateField('landlord_phone', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>E-Mail</Label>
              <Input
                value={settings.landlord_email ?? ''}
                onChange={(e) => updateField('landlord_email', e.target.value)}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Website</Label>
              <Input
                value={settings.landlord_website ?? ''}
                onChange={(e) => updateField('landlord_website', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Steuerliche Daten */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Steuerliche Daten</CardTitle>
          <CardDescription>Für Rechnungen und Finanzamt</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Steuernummer</Label>
              <Input
                value={settings.tax_number ?? ''}
                onChange={(e) => updateField('tax_number', e.target.value)}
                placeholder="z.B. 123/456/78901"
              />
            </div>
            <div className="space-y-2">
              <Label>USt-IdNr. (optional)</Label>
              <Input
                value={settings.vat_id ?? ''}
                onChange={(e) => updateField('vat_id', e.target.value)}
                placeholder="z.B. DE123456789"
              />
            </div>
            <div className="space-y-2">
              <Label>Finanzamt</Label>
              <Input
                value={settings.finanzamt ?? ''}
                onChange={(e) => updateField('finanzamt', e.target.value)}
                placeholder="z.B. Finanzamt Dresden-Süd"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <Switch
              checked={settings.is_kleinunternehmer ?? false}
              onCheckedChange={(checked) => updateField('is_kleinunternehmer', checked)}
            />
            <Label>Kleinunternehmerregelung (§ 19 UStG)</Label>
          </div>
          {settings.is_kleinunternehmer && (
            <p className="text-sm text-muted-foreground">
              Rechnungen werden ohne USt-Ausweis erstellt. Pflichthinweis wird automatisch ergänzt.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Bankverbindung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bankverbindung</CardTitle>
          <CardDescription>Erscheint auf Rechnungen als Zahlungsinformation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>IBAN</Label>
              <Input
                value={settings.bank_iban ?? ''}
                onChange={(e) => updateField('bank_iban', e.target.value)}
                placeholder="DE89 3704 0044 0532 0130 00"
              />
            </div>
            <div className="space-y-2">
              <Label>BIC</Label>
              <Input
                value={settings.bank_bic ?? ''}
                onChange={(e) => updateField('bank_bic', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Bank</Label>
              <Input
                value={settings.bank_name ?? ''}
                onChange={(e) => updateField('bank_name', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rechnungseinstellungen */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rechnungseinstellungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Rechnungspräfix</Label>
              <Input
                value={settings.invoice_prefix ?? 'RE'}
                onChange={(e) => updateField('invoice_prefix', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nächste Nummer</Label>
              <Input
                type="number"
                min={1}
                value={settings.invoice_next_number ?? 1}
                onChange={(e) => updateField('invoice_next_number', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Zahlungsziel (Tage)</Label>
              <Input
                type="number"
                min={1}
                value={settings.invoice_payment_days ?? 14}
                onChange={(e) => updateField('invoice_payment_days', Number(e.target.value))}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Nächste Rechnungsnummer: {settings.invoice_prefix ?? 'RE'}-{new Date().getFullYear()}-
            {String(settings.invoice_next_number ?? 1).padStart(3, '0')}
          </p>
        </CardContent>
      </Card>

      {/* Smoobu API */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Smoobu API</CardTitle>
          <CardDescription>
            Verbindung zu Smoobu für automatische Buchungssynchronisation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.smoobu_last_sync && (
            <p className="text-sm text-muted-foreground">
              Letzter Sync:{' '}
              {new Date(settings.smoobu_last_sync).toLocaleString('de-DE')}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTestConnection}>
              Verbindung testen
            </Button>
            <Button onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchronisiert...' : 'Jetzt synchronisieren'}
            </Button>
          </div>
          {syncResult && (
            <div
              className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                syncResult.success
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {syncResult.success ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              {syncResult.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

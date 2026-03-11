'use client'

import { useEffect, useState, useRef } from 'react'
import { Save, Upload, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import type { Settings } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegrationenTab } from '@/components/integrationen-tab'
import type { Tables } from '@/lib/database.types'

type Profile = Tables<'profiles'>

export default function EinstellungenPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Profile state
  const [profile, setProfile] = useState<Partial<Profile>>({})
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    async function fetchSettings() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('settings')
        .select(`
          id, created_at, updated_at,
          landlord_name, landlord_street, landlord_zip, landlord_city,
          landlord_phone, landlord_email, landlord_website, landlord_country,
          landlord_logo_url,
          tax_number, vat_id, finanzamt, is_kleinunternehmer,
          bank_iban, bank_bic, bank_name,
          company_register, managing_director, invoice_thank_you_text,
          invoice_prefix, invoice_next_number, invoice_payment_days,
          invoice_start_date,
          smoobu_last_sync
        `)
        .eq('user_id', user.id)
        .limit(1)
        .single()
      setSettings(data as Parameters<typeof setSettings>[0])
      setLoading(false)
    }

    async function fetchProfile() {
      const res = await fetch('/api/profile')
      if (res.ok) {
        const json = await res.json()
        setProfile(json.data ?? {})
      }
      setProfileLoading(false)
    }

    fetchSettings()
    fetchProfile()
  }, [])

  function updateField(field: keyof Settings, value: string | number | boolean | null) {
    if (!settings) return
    setSettings({ ...settings, [field]: value })
    setSaved(false)
  }

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { id, created_at, updated_at, ...updateData } = settings
    await supabase
      .from('settings')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)

    // Propagate landlord data to all existing invoices
    const landlordSnapshot = {
      name: settings.landlord_name ?? '',
      street: settings.landlord_street ?? '',
      city: settings.landlord_city ?? '',
      zip: settings.landlord_zip ?? '',
      country: settings.landlord_country ?? 'DE',
      phone: settings.landlord_phone ?? '',
      email: settings.landlord_email ?? '',
      website: settings.landlord_website ?? '',
      tax_number: settings.tax_number ?? '',
      vat_id: settings.vat_id ?? '',
      bank_iban: settings.bank_iban ?? '',
      bank_bic: settings.bank_bic ?? '',
      bank_name: settings.bank_name ?? '',
      company_register: settings.company_register ?? '',
      managing_director: settings.managing_director ?? '',
      invoice_thank_you_text: settings.invoice_thank_you_text ?? '',
      logo_url: settings.landlord_logo_url ?? '',
    }
    const { data: updatedInvoices } = await supabase
      .from('invoices')
      .update({ landlord_snapshot: landlordSnapshot })
      .eq('user_id', user.id)
      .select('id')

    if (updatedInvoices && updatedInvoices.length > 0) {
      toast({
        title: `${updatedInvoices.length} Rechnungen aktualisiert`,
        description: 'Vermieterdaten in allen Rechnungen synchronisiert.',
      })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleProfileSave() {
    setProfileSaving(true)
    setProfileError(null)
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    const json = await res.json()
    if (!res.ok) {
      setProfileError(json.error ?? 'Speichern fehlgeschlagen')
    } else {
      setProfile(json.data)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
    }
    setProfileSaving(false)
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !settings) return

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Nur Bilddateien erlaubt', variant: 'destructive' })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Datei zu groß (max. 2 MB)', variant: 'destructive' })
      return
    }

    setLogoUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLogoUploading(false); return }

    const ext = file.name.split('.').pop()
    const filePath = `${user.id}/logo.${ext}`

    // Delete old logo if exists
    if (settings.landlord_logo_url) {
      const oldPath = settings.landlord_logo_url.split('/logos/')[1]
      if (oldPath) await supabase.storage.from('logos').remove([oldPath])
    }

    const { error } = await supabase.storage
      .from('logos')
      .upload(filePath, file, { upsert: true })

    if (error) {
      toast({ title: 'Upload fehlgeschlagen', description: error.message, variant: 'destructive' })
      setLogoUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(filePath)
    const logoUrl = urlData.publicUrl

    await supabase
      .from('settings')
      .update({ landlord_logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', settings.id)
      .eq('user_id', user.id)

    setSettings({ ...settings, landlord_logo_url: logoUrl })
    setLogoUploading(false)
    toast({ title: 'Logo hochgeladen' })

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleLogoDelete() {
    if (!settings?.landlord_logo_url) return
    setLogoUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLogoUploading(false); return }

    const oldPath = settings.landlord_logo_url.split('/logos/')[1]
    if (oldPath) await supabase.storage.from('logos').remove([oldPath])

    await supabase
      .from('settings')
      .update({ landlord_logo_url: null, updated_at: new Date().toISOString() })
      .eq('id', settings.id)
      .eq('user_id', user.id)

    setSettings({ ...settings, landlord_logo_url: null })
    setLogoUploading(false)
    toast({ title: 'Logo entfernt' })
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

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-xl font-semibold">Einstellungen</h2>

      <Tabs defaultValue="einstellungen">
        <TabsList>
          <TabsTrigger value="einstellungen">Einstellungen</TabsTrigger>
          <TabsTrigger value="integrationen">Integrationen</TabsTrigger>
          <TabsTrigger value="profil">Profil</TabsTrigger>
        </TabsList>

        {/* ─── Einstellungen Tab ─────────────────────────────────────── */}
        <TabsContent value="einstellungen" className="space-y-6 pt-4">
          {!settings ? (
            <div className="py-12 text-center text-muted-foreground">
              Einstellungen konnten nicht geladen werden
            </div>
          ) : (
            <>
              <div className="flex justify-end">
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

              {/* Logo-Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Logo</CardTitle>
                  <CardDescription>Erscheint oben rechts auf Rechnungen (max. 2 MB, PNG/JPG)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settings.landlord_logo_url ? (
                    <div className="flex items-center gap-4">
                      <img
                        src={settings.landlord_logo_url}
                        alt="Logo"
                        className="h-16 max-w-[200px] object-contain border rounded p-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLogoDelete}
                        disabled={logoUploading}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Entfernen
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Kein Logo hochgeladen</p>
                  )}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={logoUploading}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {logoUploading ? 'Wird hochgeladen...' : 'Logo hochladen'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Firmendaten (für Rechnungs-Footer) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Firmendaten</CardTitle>
                  <CardDescription>Handelsregister und Geschäftsführer (erscheint im Rechnungs-Footer)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Handelsregistereintrag</Label>
                      <Input
                        value={settings.company_register ?? ''}
                        onChange={(e) => updateField('company_register', e.target.value)}
                        placeholder="z.B. HRB43938"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Geschäftsführer</Label>
                      <Input
                        value={settings.managing_director ?? ''}
                        onChange={(e) => updateField('managing_director', e.target.value)}
                        placeholder="z.B. Max Mustermann"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Dankestext (Rechnungsende)</Label>
                      <Textarea
                        value={settings.invoice_thank_you_text ?? ''}
                        onChange={(e) => updateField('invoice_thank_you_text', e.target.value)}
                        placeholder="z.B. Vielen Dank für Ihren Aufenthalt! Wir freuen uns auf Ihren nächsten Besuch."
                        rows={3}
                      />
                    </div>
                  </div>
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
                  <div className="space-y-2">
                    <Label>Rechnungen erst ab (Check-in-Datum)</Label>
                    <Input
                      type="date"
                      value={settings.invoice_start_date ?? ''}
                      onChange={(e) => updateField('invoice_start_date', e.target.value || null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Nur Buchungen mit Check-in ab diesem Datum erhalten automatische Rechnungen. Leer = alle Buchungen.
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Nächste Rechnungsnummer: {settings.invoice_prefix ?? 'RE'}-{new Date().getFullYear()}-
                    {String(settings.invoice_next_number ?? 1).padStart(3, '0')}
                  </p>
                </CardContent>
              </Card>

            </>
          )}
        </TabsContent>

        {/* ─── Integrationen Tab ─────────────────────────────────────── */}
        <TabsContent value="integrationen" className="space-y-6 pt-4">
          <IntegrationenTab />
        </TabsContent>

        {/* ─── Profil Tab ────────────────────────────────────────────── */}
        <TabsContent value="profil" className="space-y-6 pt-4">
          {profileLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button onClick={handleProfileSave} disabled={profileSaving}>
                  <Save className="mr-2 h-4 w-4" />
                  {profileSaving ? 'Wird gespeichert...' : profileSaved ? 'Gespeichert!' : 'Speichern'}
                </Button>
              </div>

              {profileError && (
                <p className="text-sm text-destructive">{profileError}</p>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Persönliche Daten</CardTitle>
                  <CardDescription>Dein Name und Unternehmen</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label>Anzeigename</Label>
                      <Input
                        value={profile.display_name ?? ''}
                        onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                        placeholder="Max Mustermann"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Firmenname (optional)</Label>
                      <Input
                        value={profile.company_name ?? ''}
                        onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                        placeholder="Muster Ferienwohnungen GbR"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Adresse</CardTitle>
                  <CardDescription>Deine Anschrift für Dokumente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label>Straße, Nr.</Label>
                      <Input
                        value={profile.street ?? ''}
                        onChange={(e) => setProfile({ ...profile, street: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>PLZ</Label>
                      <Input
                        value={profile.zip ?? ''}
                        onChange={(e) => setProfile({ ...profile, zip: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ort</Label>
                      <Input
                        value={profile.city ?? ''}
                        onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Land</Label>
                      <Input
                        value={profile.country ?? ''}
                        onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                        placeholder="Deutschland"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Steuer-ID</CardTitle>
                  <CardDescription>Nur für dich sichtbar – durch RLS geschützt</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label>Steuer-ID / USt-IdNr.</Label>
                    <Input
                      value={profile.tax_id ?? ''}
                      onChange={(e) => setProfile({ ...profile, tax_id: e.target.value })}
                      placeholder="z.B. DE123456789"
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

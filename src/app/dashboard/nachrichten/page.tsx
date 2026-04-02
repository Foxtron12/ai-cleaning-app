'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageSquare, AlertTriangle, Settings, Zap, FileText, Plus, Pencil, Trash2, Eye, Languages, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { MessageThreadList } from '@/components/dashboard/message-thread-list'
import { MessageConversation } from '@/components/dashboard/message-conversation'
import { DEFAULT_TEMPLATES, TEMPLATE_VARIABLES, replaceTemplateVariables } from '@/lib/message-template-defaults'
import type { SmoobuThread, MessageTemplate } from '@/lib/types'
import Link from 'next/link'

interface Property {
  id: string
  name: string
  external_id: number | null
}

interface AutoTrigger {
  id: string
  event_type: string
  template_id: string | null
  is_enabled: boolean
  delay_minutes: number
  days_offset: number
}

const EVENT_LABELS: Record<string, { label: string; description: string; condition?: string }> = {
  new_booking: {
    label: 'Buchungsbestaetigung',
    description: 'Wenn eine neue Buchung ueber Smoobu eingeht.',
  },
  checkin_reminder: {
    label: 'Online Check-In Erinnerung',
    description: '1 Tag vor Check-in senden.',
    condition: 'Nur wenn der Online Check-In noch NICHT abgeschlossen ist.',
  },
  guest_checkin_completed: {
    label: 'Anreise-Info (Check-In abgeschlossen)',
    description: 'Wenn der Gast den Online Check-In abgeschlossen hat.',
    condition: 'Nur wenn der Online Check-In abgeschlossen ist.',
  },
  follow_up: {
    label: 'Follow-up (Tag nach Check-in)',
    description: '1 Tag nach dem Check-in-Datum senden.',
  },
  checkout_reminder: {
    label: 'Check-out Erinnerung',
    description: '1 Tag vor dem Check-out-Datum senden.',
  },
  review_request: {
    label: 'Bewertung anfragen',
    description: 'Am Check-out-Tag um 15:00 Uhr senden.',
  },
}

const DELAY_OPTIONS = [
  { value: 0, label: 'Sofort' },
  { value: 60, label: '1 Stunde spaeter' },
  { value: 180, label: '3 Stunden spaeter' },
  { value: 1440, label: '24 Stunden spaeter' },
]


export default function NachrichtenPage() {
  // Active tab
  const [activeTab, setActiveTab] = useState('konversationen')

  // Smoobu connection check
  const [smoobuConnected, setSmoobuConnected] = useState<boolean | null>(null)

  // Properties for filter
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all')

  // Threads
  const [threads, setThreads] = useState<SmoobuThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [threadsError, setThreadsError] = useState<string | null>(null)

  // Selected thread
  const [selectedThread, setSelectedThread] = useState<SmoobuThread | null>(null)

  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([])

  // Company name from profile (for {{companyName}} placeholder)
  const [companyName, setCompanyName] = useState<string>('')

  // Check-in status map
  const [checkinStatusMap, setCheckinStatusMap] = useState<Record<number, string>>({})

  // Auto-message triggers
  const [triggers, setTriggers] = useState<AutoTrigger[]>([])
  const [triggerSaving, setTriggerSaving] = useState<string | null>(null)

  // Template editor
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [isNewTemplate, setIsNewTemplate] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editLanguage, setEditLanguage] = useState<'de' | 'en'>('de')
  const [templateSaving, setTemplateSaving] = useState(false)

  // Preview
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null)

  // Translation
  const [isTranslating, setIsTranslating] = useState(false)

  // Template editor textarea ref (for cursor-position insertion)
  const templateTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Mobile: show conversation view
  const [showConversation, setShowConversation] = useState(false)

  const { toast } = useToast()

  // Check Smoobu integration and load properties
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: integration } = await supabase
        .from('integrations')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('provider', 'smoobu')
        .eq('status', 'connected')
        .single()

      setSmoobuConnected(!!integration)

      const { data: props } = await supabase
        .from('properties')
        .select('id, name, external_id')
        .eq('user_id', user.id)
        .order('name')

      setProperties(props ?? [])

      // Load brand name (or company name as fallback) from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('brand_name, company_name')
        .eq('id', user.id)
        .single()
      if (profile) {
        setCompanyName(profile.brand_name || profile.company_name || '')
      }

      await loadTemplates(user.id)
      await loadTriggers()
    }

    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load templates
  const loadTemplates = useCallback(async (userId?: string) => {
    let uid = userId
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser()
      uid = user?.id
    }
    if (!uid) return

    const { data: existingTemplates } = await supabase
      .from('message_templates')
      .select('*')
      .eq('user_id', uid)
      .order('sort_order')

    // Check if old default templates need to be replaced with new ones.
    // Detect old format by checking for {gastname} or old template names.
    const oldDefaults = (existingTemplates ?? []).filter(
      (t) => t.is_default && (
        t.body.includes('{gastname}') ||
        t.body.includes('{checkin}') ||
        // Detect templates from previous default set (hardcoded company name)
        (t.body.includes('NORA Stays') && !t.body.includes('{{companyName}}')) ||
        t.name === 'Check-in Information' ||
        t.name === 'Check-in Information (EN)' ||
        t.name === 'Check-in Bestaetigung' ||
        t.name === 'Online Check-In'
      )
    )

    if (oldDefaults.length > 0) {
      // Delete old default templates
      const oldIds = oldDefaults.map((t) => t.id)
      await supabase
        .from('message_templates')
        .delete()
        .in('id', oldIds)

      // Insert new defaults
      const inserts = DEFAULT_TEMPLATES.map((t) => ({
        user_id: uid!,
        name: t.name,
        body: t.body,
        language: t.language,
        is_default: true,
        sort_order: t.sort_order,
      }))

      const { data: seeded } = await supabase
        .from('message_templates')
        .insert(inserts)
        .select('*')

      // Combine new defaults with any remaining custom templates
      const remaining = (existingTemplates ?? []).filter(
        (t) => !oldIds.includes(t.id)
      )
      setTemplates([...(seeded ?? []), ...remaining] as MessageTemplate[])
      return
    }

    if (existingTemplates && existingTemplates.length > 0) {
      setTemplates(existingTemplates as MessageTemplate[])
    } else {
      const inserts = DEFAULT_TEMPLATES.map((t) => ({
        user_id: uid!,
        name: t.name,
        body: t.body,
        language: t.language,
        is_default: true,
        sort_order: t.sort_order,
      }))

      const { data: seeded, error } = await supabase
        .from('message_templates')
        .insert(inserts)
        .select('*')

      if (!error && seeded) {
        setTemplates(seeded as MessageTemplate[])
      }
    }
  }, [])

  // Load triggers
  const loadTriggers = async () => {
    try {
      const res = await fetch('/api/messages/auto-triggers')
      if (res.ok) {
        const data = await res.json()
        setTriggers(data.triggers ?? [])
      }
    } catch {
      // non-fatal
    }
  }

  // Load threads
  useEffect(() => {
    if (smoobuConnected !== true) return
    loadThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoobuConnected, selectedPropertyId])

  const loadThreads = async () => {
    setThreadsLoading(true)
    setThreadsError(null)

    try {
      const params = new URLSearchParams()
      if (selectedPropertyId !== 'all') {
        const prop = properties.find((p) => p.id === selectedPropertyId)
        if (prop?.external_id) {
          params.set('apartmentId', String(prop.external_id))
        }
      }

      const res = await fetch(`/api/messages/threads?${params}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Fehler beim Laden der Threads')
      }

      const data = await res.json()
      const loadedThreads: SmoobuThread[] = data.threads ?? []
      setThreads(loadedThreads)

      // Load check-in status
      if (loadedThreads.length > 0) {
        const externalIds = loadedThreads.map((t) => t.booking_id)
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, external_id')
          .in('external_id', externalIds)
          .limit(200)

        if (bookings && bookings.length > 0) {
          const bookingIds = bookings.map((b) => b.id)
          const { data: tokens } = await supabase
            .from('guest_registration_tokens')
            .select('booking_id, status')
            .in('booking_id', bookingIds)
            .limit(200)

          if (tokens) {
            const statusMap: Record<number, string> = {}
            for (const token of tokens) {
              const booking = bookings.find((b) => b.id === token.booking_id)
              if (booking?.external_id) {
                statusMap[booking.external_id] = token.status
              }
            }
            setCheckinStatusMap(statusMap)
          }
        }
      }
    } catch (err) {
      setThreadsError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setThreadsLoading(false)
    }
  }

  // ─── Trigger helpers ─────────────────────────────────────────────────────────

  const saveTrigger = async (eventType: string, updates: Partial<AutoTrigger>) => {
    setTriggerSaving(eventType)
    try {
      const existing = triggers.find((t) => t.event_type === eventType)
      const payload = {
        event_type: eventType,
        template_id: updates.template_id ?? existing?.template_id ?? null,
        is_enabled: updates.is_enabled ?? existing?.is_enabled ?? false,
        delay_minutes: updates.delay_minutes ?? existing?.delay_minutes ?? 0,
        days_offset: updates.days_offset ?? existing?.days_offset ?? 0,
      }

      const res = await fetch('/api/messages/auto-triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Speichern fehlgeschlagen')
      const data = await res.json()

      // Update local state
      setTriggers((prev) => {
        const idx = prev.findIndex((t) => t.event_type === eventType)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = data.trigger
          return updated
        }
        return [...prev, data.trigger]
      })

      toast({ title: 'Gespeichert' })
    } catch {
      toast({ title: 'Fehler beim Speichern', variant: 'destructive' })
    } finally {
      setTriggerSaving(null)
    }
  }

  // ─── Template CRUD ───────────────────────────────────────────────────────────

  const openNewTemplate = () => {
    setIsNewTemplate(true)
    setEditingTemplate(null)
    setEditName('')
    setEditBody('')
    setEditLanguage('de')
    setTemplateDialogOpen(true)
  }

  const openEditTemplate = (t: MessageTemplate) => {
    setIsNewTemplate(false)
    setEditingTemplate(t)
    setEditName(t.name)
    setEditBody(t.body)
    setEditLanguage(t.language)
    setTemplateDialogOpen(true)
  }

  const saveTemplate = async () => {
    if (!editName.trim() || !editBody.trim()) return
    setTemplateSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (isNewTemplate) {
        await supabase
          .from('message_templates')
          .insert({
            user_id: user.id,
            name: editName.trim(),
            body: editBody,
            language: editLanguage,
            is_default: false,
            sort_order: templates.length + 1,
          })
      } else if (editingTemplate) {
        await supabase
          .from('message_templates')
          .update({
            name: editName.trim(),
            body: editBody,
            language: editLanguage,
          })
          .eq('id', editingTemplate.id)
      }

      await loadTemplates()
      setTemplateDialogOpen(false)
      toast({ title: isNewTemplate ? 'Vorlage erstellt' : 'Vorlage aktualisiert' })
    } catch {
      toast({ title: 'Fehler beim Speichern', variant: 'destructive' })
    } finally {
      setTemplateSaving(false)
    }
  }

  const deleteTemplate = async (t: MessageTemplate) => {
    if (t.is_default) {
      toast({ title: 'Standard-Vorlagen koennen nicht geloescht werden', variant: 'destructive' })
      return
    }

    await supabase.from('message_templates').delete().eq('id', t.id)
    await loadTemplates()
    toast({ title: 'Vorlage geloescht' })
  }

  // ─── Template editor: insert placeholder at cursor ──────────────────────────

  const insertPlaceholderAtCursor = (placeholder: string) => {
    const textarea = templateTextareaRef.current
    if (!textarea) {
      setEditBody((b) => b + placeholder)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = editBody.slice(0, start)
    const after = editBody.slice(end)
    const updated = before + placeholder + after
    setEditBody(updated)

    requestAnimationFrame(() => {
      const newPos = start + placeholder.length
      textarea.selectionStart = newPos
      textarea.selectionEnd = newPos
      textarea.focus()
    })
  }

  // ─── Translation ───────────────────────────────────────────────────────────

  const translateTemplate = async () => {
    if (!editBody.trim()) return
    setIsTranslating(true)

    try {
      const targetLang = editLanguage === 'de' ? 'en' : 'de'
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editBody, targetLang }),
      })

      if (!res.ok) throw new Error('Uebersetzung fehlgeschlagen')
      const data = await res.json()
      setEditBody(data.translatedText)
      setEditLanguage(targetLang)
      toast({ title: `Uebersetzt nach ${targetLang === 'de' ? 'Deutsch' : 'Englisch'}` })
    } catch {
      toast({ title: 'Uebersetzung fehlgeschlagen', variant: 'destructive' })
    } finally {
      setIsTranslating(false)
    }
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  const handleSelectThread = (thread: SmoobuThread) => {
    setSelectedThread(thread)
    setShowConversation(true)
  }

  const handleBack = () => {
    setShowConversation(false)
  }

  // Not connected state
  if (smoobuConnected === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Alert className="max-w-md">
          <AlertTriangle className="size-4" />
          <AlertTitle>Smoobu-Integration erforderlich</AlertTitle>
          <AlertDescription>
            Um Nachrichten zu senden und zu empfangen, verbinden Sie zuerst Ihre Smoobu-Integration
            in den Einstellungen.
          </AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/dashboard/einstellungen">
            <Settings className="size-4 mr-2" />
            Zu den Einstellungen
          </Link>
        </Button>
      </div>
    )
  }

  // Loading initial state
  if (smoobuConnected === null) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px] w-full rounded-lg" />
      </div>
    )
  }

  // Filter threads
  const filteredThreads = selectedPropertyId === 'all'
    ? threads
    : threads.filter((t) => {
        const prop = properties.find((p) => p.id === selectedPropertyId)
        return prop?.external_id === t.apartment.id
      })

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-5" />
          <h2 className="text-lg font-semibold">Nachrichten</h2>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 mb-4">
          <TabsTrigger value="konversationen" className="gap-1.5">
            <MessageSquare className="size-3.5" />
            Konversationen
          </TabsTrigger>
          <TabsTrigger value="vorlagen" className="gap-1.5">
            <FileText className="size-3.5" />
            Vorlagen
          </TabsTrigger>
          <TabsTrigger value="automatisierung" className="gap-1.5">
            <Zap className="size-3.5" />
            Automatisierung
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB: Konversationen ──────────────────────────────────────── */}
        <TabsContent value="konversationen" className="flex-1 min-h-0 mt-0">
          <div className="flex flex-col h-full">
            {/* Property filter */}
            <div className="flex justify-end mb-3 shrink-0">
              <div className="w-48">
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle Objekte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Objekte</SelectItem>
                    {properties.map((prop) => (
                      <SelectItem key={prop.id} value={prop.id}>
                        {prop.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Error state */}
            {threadsError && (
              <Alert variant="destructive" className="mb-3 shrink-0">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  {threadsError}
                  <Button variant="link" className="ml-2 p-0 h-auto" onClick={loadThreads}>
                    Erneut versuchen
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Split view */}
            <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-background">
              <div className="flex h-full">
                <div
                  className={`w-full md:w-80 lg:w-96 md:border-r shrink-0 ${
                    showConversation ? 'hidden md:block' : 'block'
                  }`}
                >
                  <MessageThreadList
                    threads={filteredThreads}
                    isLoading={threadsLoading}
                    selectedBookingId={selectedThread?.booking_id ?? null}
                    onSelectThread={handleSelectThread}
                    checkinStatusMap={checkinStatusMap}
                  />
                </div>
                <div
                  className={`flex-1 min-w-0 ${
                    showConversation ? 'block' : 'hidden md:block'
                  }`}
                >
                  {selectedThread ? (
                    <MessageConversation
                      thread={selectedThread}
                      onBack={handleBack}
                      templates={templates}
                      onTemplatesChange={() => loadTemplates()}
                      companyName={companyName}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                      <MessageSquare className="size-12 text-muted-foreground mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">
                        Waehlen Sie eine Konversation
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Klicken Sie links auf einen Thread, um die Nachrichten zu lesen.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB: Vorlagen ────────────────────────────────────────────── */}
        <TabsContent value="vorlagen" className="flex-1 min-h-0 mt-0 overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Nachrichten-Vorlagen</h3>
                <p className="text-sm text-muted-foreground">
                  Vorlagen fuer wiederkehrende Nachrichten an Gaeste.
                </p>
              </div>
              <Button onClick={openNewTemplate} size="sm" className="gap-1.5">
                <Plus className="size-3.5" />
                Neue Vorlage
              </Button>
            </div>

            {/* Variable info */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Verfuegbare Platzhalter</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <Badge key={v.key} variant="secondary" className="text-xs font-mono">
                      {v.key}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Platzhalter werden beim Senden automatisch mit Buchungsdaten ersetzt.
                </p>
              </CardContent>
            </Card>

            {/* Template list */}
            <div className="grid gap-3">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{t.name}</span>
                          <Badge variant="outline" className="text-xs">{t.language.toUpperCase()}</Badge>
                          {t.is_default && (
                            <Badge variant="secondary" className="text-xs">Standard</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                          {t.body.slice(0, 120)}{t.body.length > 120 ? '...' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setPreviewTemplate(previewTemplate?.id === t.id ? null : t)}
                          title="Vorschau"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEditTemplate(t)}
                          title="Bearbeiten"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {!t.is_default && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => deleteTemplate(t)}
                            title="Loeschen"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {previewTemplate?.id === t.id && (
                      <div className="mt-3 p-3 bg-muted rounded text-xs whitespace-pre-wrap border">
                        {replaceTemplateVariables(t.body, {
                          guestFirstName: 'Max',
                          checkInDate: '25.03.2026',
                          checkOutDate: '28.03.2026',
                          numberOfGuests: '2',
                          preCheckInLink: 'https://app.example.com/guest/register/...',
                          guestAreaLateCheckOutLink: 'https://app.example.com/guest/area/...',
                          companyName: companyName || 'Mein Unternehmen',
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Template edit dialog */}
          <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isNewTemplate ? 'Neue Vorlage erstellen' : 'Vorlage bearbeiten'}
                </DialogTitle>
                <DialogDescription>
                  Platzhalter wie {'{{guestFirstName}}'} werden beim Senden automatisch ersetzt.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="z.B. Willkommensnachricht"
                  />
                </div>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label>Sprache</Label>
                    <Select value={editLanguage} onValueChange={(v) => setEditLanguage(v as 'de' | 'en')}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={translateTemplate}
                    disabled={isTranslating || !editBody.trim()}
                    title={`Uebersetzen nach ${editLanguage === 'de' ? 'Englisch' : 'Deutsch'}`}
                  >
                    {isTranslating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Languages className="size-3.5" />
                    )}
                    {editLanguage === 'de' ? 'EN' : 'DE'}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label>Nachricht</Label>
                  <Textarea
                    ref={templateTextareaRef}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="Hi {{guestFirstName}}, ..."
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Klicke auf einen Platzhalter, um ihn an der Cursorposition einzufuegen:
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        className="px-1.5 py-0.5 text-xs bg-muted rounded hover:bg-accent transition-colors font-mono"
                        onClick={() => insertPlaceholderAtCursor(v.key)}
                        title={v.description}
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={saveTemplate}
                  disabled={templateSaving || !editName.trim() || !editBody.trim()}
                >
                  {templateSaving ? 'Speichern...' : 'Speichern'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ─── TAB: Automatisierung ─────────────────────────────────────── */}
        <TabsContent value="automatisierung" className="flex-1 min-h-0 mt-0 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold">Automatische Nachrichten</h3>
              <p className="text-sm text-muted-foreground">
                Nachrichten automatisch an Gaeste senden, wenn bestimmte Ereignisse eintreten.
              </p>
            </div>

            {Object.entries(EVENT_LABELS).map(([eventType, { label, description, condition }]) => {
              const trigger = triggers.find((t) => t.event_type === eventType)
              const isEnabled = trigger?.is_enabled ?? false
              const templateId = trigger?.template_id ?? 'none'
              const delayMinutes = trigger?.delay_minutes ?? 0
              const isSaving = triggerSaving === eventType

              return (
                <Card key={eventType}>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <CardTitle className="text-sm">{label}</CardTitle>
                        <CardDescription className="text-xs">{description}</CardDescription>
                      </div>
                      <Switch
                        checked={isEnabled}
                        disabled={isSaving}
                        onCheckedChange={(checked) => {
                          saveTrigger(eventType, { is_enabled: checked })
                        }}
                      />
                    </div>
                    {condition && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 rounded">
                        Bedingung: {condition}
                      </div>
                    )}

                    {isEnabled && (
                      <div className="space-y-3 border-l-2 border-primary/20 ml-1 pl-4">
                        {/* Template selection */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Vorlage</Label>
                          <Select
                            value={templateId}
                            onValueChange={(v) => {
                              saveTrigger(eventType, { template_id: v === 'none' ? null : v })
                            }}
                            disabled={isSaving}
                          >
                            <SelectTrigger className="w-64">
                              <SelectValue placeholder="Vorlage waehlen..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Keine Vorlage</SelectItem>
                              {templates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} ({t.language.toUpperCase()})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Delay selection */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Verzoegerung</Label>
                          <Select
                            value={String(delayMinutes)}
                            onValueChange={(v) => {
                              saveTrigger(eventType, { delay_minutes: parseInt(v, 10) })
                            }}
                            disabled={isSaving}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DELAY_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={String(o.value)}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Template preview */}
                        {templateId !== 'none' && (
                          <div className="p-3 bg-muted rounded text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {replaceTemplateVariables(
                              templates.find((t) => t.id === templateId)?.body ?? '',
                              {
                                guestFirstName: 'Max',
                                checkInDate: '25.03.2026',
                                checkOutDate: '28.03.2026',
                                numberOfGuests: '2',
                                preCheckInLink: 'https://app.../guest/register/...',
                                guestAreaLateCheckOutLink: 'https://app.../guest/area/...',
                                companyName: companyName || 'Mein Unternehmen',
                              }
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

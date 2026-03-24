'use client'

import { useEffect, useState, useCallback } from 'react'
import { MessageSquare, AlertTriangle, Settings, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { MessageThreadList } from '@/components/dashboard/message-thread-list'
import { MessageConversation } from '@/components/dashboard/message-conversation'
import { DEFAULT_TEMPLATES } from '@/lib/message-template-defaults'
import type { SmoobuThread, MessageTemplate } from '@/lib/types'
import Link from 'next/link'

interface Property {
  id: string
  name: string
  external_id: number | null
}

export default function NachrichtenPage() {
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

  // Check-in status map: Smoobu external_id → 'completed' | 'sent' | 'pending' | null
  const [checkinStatusMap, setCheckinStatusMap] = useState<Record<number, string>>({})

  // Auto-message trigger config
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoTemplateId, setAutoTemplateId] = useState<string>('none')
  const [autoSaving, setAutoSaving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Mobile: show conversation view
  const [showConversation, setShowConversation] = useState(false)

  const { toast } = useToast()

  // Check Smoobu integration and load properties
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check Smoobu integration
      const { data: integration } = await supabase
        .from('integrations')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('provider', 'smoobu')
        .eq('status', 'connected')
        .single()

      setSmoobuConnected(!!integration)

      // Load properties for filter
      const { data: props } = await supabase
        .from('properties')
        .select('id, name, external_id')
        .eq('user_id', user.id)
        .order('name')

      setProperties(props ?? [])

      // Load templates
      await loadTemplates(user.id)

      // Load auto-message trigger config
      try {
        const res = await fetch('/api/messages/auto-triggers')
        if (res.ok) {
          const data = await res.json()
          const checkinTrigger = data.triggers?.find(
            (t: { event_type: string }) => t.event_type === 'guest_checkin_completed'
          )
          if (checkinTrigger) {
            setAutoEnabled(checkinTrigger.is_enabled)
            setAutoTemplateId(checkinTrigger.template_id ?? 'none')
          }
        }
      } catch {
        // non-fatal
      }
    }

    init()
  }, [])

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

    if (existingTemplates && existingTemplates.length > 0) {
      setTemplates(existingTemplates as MessageTemplate[])
    } else {
      // Seed default templates
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

  // Load threads when Smoobu is connected and property filter changes
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

      // Load check-in status for all threads
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

  const saveAutoTrigger = async (enabled: boolean, templateId: string) => {
    setAutoSaving(true)
    try {
      const res = await fetch('/api/messages/auto-triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'guest_checkin_completed',
          template_id: templateId === 'none' ? null : templateId,
          is_enabled: enabled,
        }),
      })
      if (!res.ok) throw new Error('Speichern fehlgeschlagen')
      toast({ title: 'Einstellung gespeichert' })
    } catch {
      toast({ title: 'Fehler beim Speichern', variant: 'destructive' })
    } finally {
      setAutoSaving(false)
    }
  }

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

  // Filter threads by selected property (client-side, since API filter by apartment)
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

      {/* Auto-message settings */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen} className="mb-4 shrink-0">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Zap className="size-3.5" />
            Automatische Nachrichten
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-checkin" className="text-sm font-medium">
                  Nach Online-Check-in senden
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatisch eine Nachricht senden, wenn der Gast den Check-in abgeschlossen hat.
                </p>
              </div>
              <Switch
                id="auto-checkin"
                checked={autoEnabled}
                disabled={autoSaving}
                onCheckedChange={(checked) => {
                  setAutoEnabled(checked)
                  saveAutoTrigger(checked, autoTemplateId)
                }}
              />
            </div>
            {autoEnabled && (
              <div className="space-y-1.5">
                <Label className="text-sm">Vorlage</Label>
                <Select
                  value={autoTemplateId}
                  onValueChange={(v) => {
                    setAutoTemplateId(v)
                    saveAutoTrigger(autoEnabled, v)
                  }}
                  disabled={autoSaving}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Vorlage waehlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine Vorlage</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {autoTemplateId !== 'none' && (
                  <div className="mt-2 p-3 bg-muted rounded text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {templates.find((t) => t.id === autoTemplateId)?.body ?? ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Error state */}
      {threadsError && (
        <Alert variant="destructive" className="mb-4 shrink-0">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            {threadsError}
            <Button variant="link" className="ml-2 p-0 h-auto" onClick={loadThreads}>
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main split view */}
      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-background">
        {/* Desktop: side-by-side. Mobile: show one at a time */}
        <div className="flex h-full">
          {/* Thread list (left side) */}
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

          {/* Conversation (right side) */}
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
  )
}

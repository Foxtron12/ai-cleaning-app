'use client'

import { useState, useEffect, useCallback } from 'react'
import { Copy, Check, Send, Link2, Loader2, CheckCircle2, Clock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface Props {
  bookingId: string
  hasExternalId: boolean // booking has a Smoobu ID (needed for sending)
}

interface TokenData {
  token: string
  url: string
  status: 'pending' | 'sent' | 'completed'
  expires_at: string
}

const STATUS_CONFIG = {
  pending: { label: 'Ausstehend', variant: 'outline' as const, icon: Clock },
  sent: { label: 'Gesendet', variant: 'secondary' as const, icon: Mail },
  completed: { label: 'Ausgefüllt', variant: 'default' as const, icon: CheckCircle2 },
}

export function GuestRegistrationLinkManager({ bookingId, hasExternalId }: Props) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sendLanguage, setSendLanguage] = useState<'de' | 'en'>('de')

  // Load existing token on mount
  const loadToken = useCallback(async () => {
    const { data } = await supabase
      .from('guest_registration_tokens')
      .select('token, status, expires_at')
      .eq('booking_id', bookingId)
      .single()

    if (data) {
      const siteUrl = window.location.origin
      setTokenData({
        token: data.token,
        url: `${siteUrl}/guest/register/${data.token}`,
        status: data.status as TokenData['status'],
        expires_at: data.expires_at,
      })
    }
    setLoading(false)
  }, [bookingId])

  useEffect(() => { loadToken() }, [loadToken])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/guest-registration/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId }),
      })

      if (!res.ok) throw new Error('Failed to generate token')

      const data = await res.json()
      setTokenData(data)
      toast.success('Registrierungslink erstellt')
    } catch {
      toast.error('Fehler beim Erstellen des Links')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    if (!tokenData) return
    await navigator.clipboard.writeText(tokenData.url)
    setCopied(true)
    toast.success('Link kopiert')
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend() {
    setSending(true)
    try {
      const res = await fetch('/api/guest-registration/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          language: sendLanguage,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }

      setTokenData(prev => prev ? { ...prev, status: 'sent' } : prev)
      toast.success('Registrierungslink via Smoobu gesendet')
    } catch (err) {
      toast.error(`Fehler: ${err instanceof Error ? err.message : 'Senden fehlgeschlagen'}`)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Lade...
      </div>
    )
  }

  // No token yet – show generate button
  if (!tokenData) {
    return (
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={handleGenerate}
        disabled={generating}
      >
        {generating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="mr-2 h-4 w-4" />
        )}
        Gäste-Registrierungslink erstellen
      </Button>
    )
  }

  // Token exists – show status + actions
  const statusConfig = STATUS_CONFIG[tokenData.status]
  const StatusIcon = statusConfig.icon

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Gäste-Registrierung</span>
        <Badge variant={statusConfig.variant} className="text-xs">
          <StatusIcon className="h-3 w-3 mr-1" />
          {statusConfig.label}
        </Badge>
      </div>

      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
          {copied ? (
            <Check className="h-3.5 w-3.5 mr-1" />
          ) : (
            <Copy className="h-3.5 w-3.5 mr-1" />
          )}
          {copied ? 'Kopiert' : 'Link kopieren'}
        </Button>

        {hasExternalId && tokenData.status !== 'completed' && (
          <div className="flex gap-1">
            <Select value={sendLanguage} onValueChange={v => setSendLanguage(v as 'de' | 'en')}>
              <SelectTrigger className="h-8 w-[60px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">DE</SelectItem>
                <SelectItem value="en">EN</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1" />
              )}
              {!sending && 'Senden'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

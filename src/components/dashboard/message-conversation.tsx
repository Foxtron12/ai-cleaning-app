'use client'

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { de } from 'date-fns/locale'
import { Send, AlertCircle, Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { MessageTemplates } from '@/components/dashboard/message-templates'
import type { SmoobuThread, SmoobuMessage, MessageTemplate } from '@/lib/types'

interface MessageConversationProps {
  thread: SmoobuThread
  onBack?: () => void
  templates: MessageTemplate[]
  onTemplatesChange: () => void
}

interface OptimisticMessage extends SmoobuMessage {
  optimistic?: boolean
  error?: boolean
}

/** Strip HTML tags for safe display */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/** Format a date label for date separators */
function formatDateLabel(date: Date): string {
  if (isToday(date)) return 'Heute'
  if (isYesterday(date)) return 'Gestern'
  return format(date, 'dd. MMMM yyyy', { locale: de })
}

function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex justify-start">
        <Skeleton className="h-16 w-48 rounded-lg" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-12 w-40 rounded-lg" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-20 w-56 rounded-lg" />
      </div>
    </div>
  )
}

export function MessageConversation({
  thread,
  onBack,
  templates,
  onTemplatesChange,
}: MessageConversationProps) {
  const [messages, setMessages] = useState<OptimisticMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [registrationLink, setRegistrationLink] = useState<string | undefined>(undefined)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch registration link for template placeholder
  useEffect(() => {
    async function fetchRegistrationLink() {
      try {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id')
          .eq('external_id', thread.booking_id)
          .single()
        if (!booking) return
        const { data: token } = await supabase
          .from('guest_registration_tokens')
          .select('token')
          .eq('booking_id', booking.id)
          .single()
        if (token) {
          setRegistrationLink(`${window.location.origin}/guest/register/${token.token}`)
        }
      } catch {
        // Non-critical: template will keep placeholder if no link available
      }
    }
    fetchRegistrationLink()
  }, [thread.booking_id])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      // ScrollArea uses a viewport child
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [])

  // Load messages when thread changes
  useEffect(() => {
    let cancelled = false

    async function loadMessages() {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/messages/${thread.booking_id}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error ?? 'Fehler beim Laden der Nachrichten')
        }

        const data = await res.json()
        if (!cancelled) {
          // Sort chronologically (oldest first)
          const sorted = (data.messages as SmoobuMessage[]).sort(
            (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
          )
          setMessages(sorted)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadMessages()
    return () => { cancelled = true }
  }, [thread.booking_id])

  // Scroll to bottom when messages load or change
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      // Small delay to ensure DOM is rendered
      const timer = setTimeout(scrollToBottom, 100)
      return () => clearTimeout(timer)
    }
  }, [isLoading, messages.length, scrollToBottom])

  const handleSend = async () => {
    const text = messageText.trim()
    if (!text || isSending) return

    // Add optimistic message
    const optimisticMsg: OptimisticMessage = {
      id: Date.now(),
      subject: 'Nachricht',
      body: text,
      sent_at: new Date().toISOString(),
      type: 'host',
      optimistic: true,
    }

    setMessages((prev) => [...prev, optimisticMsg])
    setMessageText('')
    setIsSending(true)
    setTimeout(scrollToBottom, 50)

    try {
      const res = await fetch(`/api/messages/${thread.booking_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: 'Nachricht', body: text }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Nachricht konnte nicht gesendet werden')
      }

      // Mark optimistic message as confirmed
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticMsg.id ? { ...msg, optimistic: false } : msg
        )
      )
    } catch (err) {
      // Mark optimistic message as error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticMsg.id ? { ...msg, error: true } : msg
        )
      )
      toast.error(err instanceof Error ? err.message : 'Fehler beim Senden')
      // Keep the text so user can retry
      setMessageText(text)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTemplateInsert = (text: string) => {
    setMessageText(text)
    textareaRef.current?.focus()
  }

  const templateVariables = {
    gastname: thread.guest_name,
    property: thread.apartment.name,
    checkin: format(new Date(thread.arrival), 'dd.MM.yyyy'),
    checkout: format(new Date(thread.departure), 'dd.MM.yyyy'),
    buchungsid: String(thread.booking_id),
    registrierungslink: registrationLink,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
            <ArrowLeft className="size-4" />
            <span className="sr-only">Zurueck</span>
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{thread.guest_name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-xs">
              {thread.apartment.name}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {format(new Date(thread.arrival), 'dd.MM.')} – {format(new Date(thread.departure), 'dd.MM.yyyy')}
            </span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <MessageSkeleton />
        ) : error ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <MessageConversationEmpty />
          </div>
        ) : (
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="flex flex-col gap-2 p-4">
              {messages.map((msg, index) => {
                const msgDate = new Date(msg.sent_at)
                const prevMsg = index > 0 ? messages[index - 1] : null
                const showDateSeparator = !prevMsg || !isSameDay(msgDate, new Date(prevMsg.sent_at))

                return (
                  <div key={msg.id}>
                    {showDateSeparator && (
                      <div className="flex items-center justify-center my-3">
                        <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border">
                          {formatDateLabel(msgDate)}
                        </span>
                      </div>
                    )}
                    <ChatBubble message={msg} />
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-end gap-2">
          <MessageTemplates
            templates={templates}
            onInsert={handleTemplateInsert}
            variables={templateVariables}
            onTemplatesChange={onTemplatesChange}
          />
          <Textarea
            ref={textareaRef}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht schreiben... (Enter zum Senden, Shift+Enter fuer Zeilenumbruch)"
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
            disabled={isSending}
            aria-label="Nachricht eingeben"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!messageText.trim() || isSending}
            aria-label="Nachricht senden"
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: OptimisticMessage }) {
  const isHost = message.type === 'host'
  const time = format(new Date(message.sent_at), 'HH:mm')

  return (
    <div className={`flex ${isHost ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isHost
            ? message.error
              ? 'bg-destructive/10 border border-destructive/30 text-foreground'
              : message.optimistic
                ? 'bg-primary/70 text-primary-foreground'
                : 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{stripHtml(message.body)}</p>
        <div className={`flex items-center gap-1 mt-1 ${isHost ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-xs ${isHost ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
            {time}
          </span>
          {message.error && (
            <AlertCircle className="size-3 text-destructive" />
          )}
          {message.optimistic && !message.error && (
            <Loader2 className="size-3 animate-spin text-primary-foreground/70" />
          )}
        </div>
      </div>
    </div>
  )
}

function MessageConversationEmpty() {
  return (
    <>
      <MessageSquareIcon className="size-10 text-muted-foreground mb-3" />
      <p className="text-sm font-medium text-muted-foreground">
        Noch keine Nachrichten
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Senden Sie eine Nachricht, um die Konversation zu starten.
      </p>
    </>
  )
}

function MessageSquareIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

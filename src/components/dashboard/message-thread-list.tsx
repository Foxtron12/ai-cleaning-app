'use client'

import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import { MessageSquare, ClipboardCheck, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SmoobuThread } from '@/lib/types'

interface MessageThreadListProps {
  threads: SmoobuThread[]
  isLoading: boolean
  selectedBookingId: number | null
  onSelectThread: (thread: SmoobuThread) => void
  checkinStatusMap?: Record<number, string>
}

/** Strip HTML tags from a string for safe display */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3 border-b">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-full" />
    </div>
  )
}

export function MessageThreadList({
  threads,
  isLoading,
  selectedBookingId,
  onSelectThread,
  checkinStatusMap = {},
}: MessageThreadListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 6 }).map((_, i) => (
          <ThreadSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <MessageSquare className="size-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          Keine Konversationen
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Nachrichten erscheinen hier, sobald Gaeste Ihnen schreiben.
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col">
        {threads.map((thread) => {
          const isSelected = selectedBookingId === thread.booking_id
          const lastMessagePreview = thread.last_message
            ? stripHtml(thread.last_message.body).slice(0, 80)
            : 'Tippen zum Anzeigen'

          return (
            <button
              key={thread.booking_id}
              onClick={() => onSelectThread(thread)}
              className={`flex flex-col gap-1 p-3 text-left border-b transition-colors hover:bg-accent/50 ${
                isSelected ? 'bg-accent' : ''
              }`}
              aria-label={`Konversation mit ${thread.guest_name}`}
              aria-current={isSelected ? 'true' : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">
                  {thread.guest_name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {thread.unread_count > 0 && (
                    <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs">
                      {thread.unread_count}
                    </Badge>
                  )}
                  {thread.last_message?.sent_at && (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(thread.last_message.sent_at), {
                        addSuffix: false,
                        locale: de,
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs shrink-0">
                  {thread.apartment.name}
                </Badge>
                {checkinStatusMap[thread.booking_id] === 'completed' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="default" className="text-xs shrink-0 bg-emerald-600 hover:bg-emerald-700 gap-0.5">
                        <ClipboardCheck className="size-3" />
                        Check-in
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Gast hat Online-Check-in abgeschlossen</TooltipContent>
                  </Tooltip>
                )}
                {checkinStatusMap[thread.booking_id] && checkinStatusMap[thread.booking_id] !== 'completed' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs shrink-0 gap-0.5">
                        <Clock className="size-3" />
                        Check-in
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Check-in-Link gesendet, noch ausstehend</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {thread.last_message?.type === 'host' && (
                  <span className="text-muted-foreground/70">Sie: </span>
                )}
                {lastMessagePreview}
              </p>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

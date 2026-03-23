'use client'

import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { FileText, Receipt, Copy, Check, ExternalLink, Loader2, Pencil, XCircle, CreditCard, Mail, CircleDollarSign, Ban, Clock, CheckCircle2, AlertCircle, Upload, Trash2, Image, FileIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { generateBookingEmailHtml, copyHtmlToClipboard } from '@/lib/email-template'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { BookingStatusBadge } from './booking-status-badge'
import type { BookingWithProperty } from '@/lib/types'
import { getCleaningFee } from '@/lib/calculators/booking-price'
import { calculateAccommodationTax, getTaxConfigForProperty } from '@/lib/calculators/accommodation-tax'

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '–'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatDate(dateStr: string): string {
  return format(new Date(dateStr + 'T00:00:00'), 'dd.MM.yyyy', { locale: de })
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value ?? '–'}</span>
    </div>
  )
}

function formatCurrencyValue(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatDateValue(dateStr: string): string {
  return format(new Date(dateStr + 'T00:00:00'), 'dd.MM.yyyy', { locale: de })
}

function PaymentStatusBadge({ status }: { status: string | null }) {
  if (!status) return null

  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    pending: {
      label: 'Ausstehend',
      variant: 'outline',
      icon: <Clock className="h-3 w-3 mr-1" />,
    },
    paid: {
      label: 'Bezahlt',
      variant: 'default',
      icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
    },
    failed: {
      label: 'Fehlgeschlagen',
      variant: 'destructive',
      icon: <Ban className="h-3 w-3 mr-1" />,
    },
    manual: {
      label: 'Manuell bezahlt',
      variant: 'default',
      icon: <CircleDollarSign className="h-3 w-3 mr-1" />,
    },
  }

  const c = config[status] ?? { label: status, variant: 'outline' as const, icon: null }

  return (
    <Badge variant={c.variant} className="text-xs">
      {c.icon}
      {c.label}
    </Badge>
  )
}

function StripePaymentSection({
  booking,
  onBookingUpdated,
}: {
  booking: BookingWithProperty
  onBookingUpdated?: (updated: BookingWithProperty) => void
}) {
  const [copied, setCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const [creatingLink, setCreatingLink] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailText, setShowEmailText] = useState(false)

  const stripeLink = booking.stripe_payment_link as string | null | undefined
  const paymentStatus = booking.payment_status as string | null

  const handleCopy = useCallback(() => {
    if (!stripeLink) return
    navigator.clipboard.writeText(stripeLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [stripeLink])

  const handleCopyEmail = useCallback(async () => {
    if (!stripeLink) return
    const html = generateBookingEmailHtml({
      guestFirstname: booking.guest_firstname ?? 'Gast',
      guestLastname: booking.guest_lastname ?? '',
      propertyName: booking.properties?.name ?? 'Ferienwohnung',
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      adults: (booking.adults ?? 1) + (booking.children ?? 0),
      bookingId: booking.id,
    })
    await copyHtmlToClipboard(html)
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 2000)
  }, [stripeLink, booking])

  const handleCreateLink = useCallback(async () => {
    setCreatingLink(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/create-payment-link`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Fehler beim Erstellen des Zahlungslinks')
        return
      }
      // Refresh booking data
      const { data: updated } = await supabase
        .from('bookings')
        .select('*, properties(*)')
        .eq('id', booking.id)
        .single()
      if (updated) {
        onBookingUpdated?.(updated as BookingWithProperty)
      }
    } catch {
      setError('Verbindungsfehler. Bitte erneut versuchen.')
    } finally {
      setCreatingLink(false)
    }
  }, [booking.id, onBookingUpdated])

  const handleMarkPaid = useCallback(async () => {
    setMarkingPaid(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/mark-paid`, {
        method: 'PATCH',
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Fehler beim Markieren als bezahlt')
        return
      }
      // Refresh booking data
      const { data: updated } = await supabase
        .from('bookings')
        .select('*, properties(*)')
        .eq('id', booking.id)
        .single()
      if (updated) {
        onBookingUpdated?.(updated as BookingWithProperty)
      }
    } catch {
      setError('Verbindungsfehler. Bitte erneut versuchen.')
    } finally {
      setMarkingPaid(false)
    }
  }, [booking.id, onBookingUpdated])

  const isPaid = paymentStatus === 'paid' || paymentStatus === 'manual'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Zahlung</h3>
        <PaymentStatusBadge status={paymentStatus} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Stripe Link display */}
      {stripeLink && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Zahlungslink</Label>
          <div className="flex gap-2">
            <Input value={stripeLink} readOnly className="text-xs flex-1" />
            <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Link kopieren">
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="icon" asChild aria-label="Link oeffnen">
              <a href={stripeLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Email Text Toggle */}
      {stripeLink && (
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setShowEmailText(!showEmailText)}
          >
            <Mail className="mr-2 h-4 w-4" />
            {showEmailText ? 'E-Mail-Text ausblenden' : 'E-Mail-Text anzeigen'}
          </Button>
          {showEmailText && (
            <div className="space-y-2">
              <div
                className="text-xs bg-muted/50 rounded-md p-3 max-h-48 overflow-y-auto border"
                dangerouslySetInnerHTML={{
                  __html: generateBookingEmailHtml({
                    guestFirstname: booking.guest_firstname ?? 'Gast',
                    guestLastname: booking.guest_lastname ?? '',
                    propertyName: booking.properties?.name ?? 'Ferienwohnung',
                    checkIn: booking.check_in,
                    checkOut: booking.check_out,
                    adults: (booking.adults ?? 1) + (booking.children ?? 0),
                    bookingId: booking.id,
                  }),
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleCopyEmail}
                aria-label="E-Mail-Text kopieren"
              >
                {emailCopied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                    Kopiert
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    E-Mail-Text kopieren
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        {/* Create new payment link (if none exists, or if payment failed) */}
        {(!stripeLink || paymentStatus === 'failed') && !isPaid && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleCreateLink}
            disabled={creatingLink}
          >
            {creatingLink ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            {stripeLink ? 'Neuen Zahlungslink erstellen' : 'Zahlungslink erstellen'}
          </Button>
        )}

        {/* Regenerate link button (when one already exists and is pending) */}
        {stripeLink && paymentStatus === 'pending' && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleCreateLink}
            disabled={creatingLink}
          >
            {creatingLink ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            Neuen Zahlungslink erstellen
          </Button>
        )}

        {/* Mark as manually paid */}
        {!isPaid && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleMarkPaid}
            disabled={markingPaid}
          >
            {markingPaid ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CircleDollarSign className="mr-2 h-4 w-4" />
            )}
            Manuell als bezahlt markieren
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Document Upload Types & Helpers ─────────────────────────────────────────

interface BookingDocument {
  id: string
  booking_id: string
  user_id: string
  file_name: string
  file_size: number
  mime_type: string
  storage_path: string
  created_at: string
}

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return <FileIcon className="h-4 w-4 text-red-500 shrink-0" />
  }
  return <Image className="h-4 w-4 text-blue-500 shrink-0" />
}

// ─── Documents Section Component ─────────────────────────────────────────────

function DocumentsSection({ bookingId }: { bookingId: string }) {
  const [documents, setDocuments] = useState<BookingDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch documents on mount
  const fetchDocuments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('booking_documents')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching documents:', error)
        return
      }
      setDocuments(data ?? [])
    } catch (err) {
      console.error('Error fetching documents:', err)
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Handle file selection and upload
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Upload each file in parallel
    const uploadPromises = Array.from(files).map(async (file) => {
      // Client-side validation
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        toast.error(`"${file.name}" hat ein ungültiges Format. Erlaubt: PDF, JPG, PNG.`)
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" ist zu groß. Maximal 10 MB erlaubt.`)
        return
      }
      if (file.size === 0) {
        toast.error(`"${file.name}" ist leer.`)
        return
      }

      const uploadKey = `${file.name}-${Date.now()}`
      setUploading(prev => ({ ...prev, [uploadKey]: true }))

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('booking_id', bookingId)

        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/booking-documents/upload', {
          method: 'POST',
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
          body: formData,
        })

        const json = await res.json()

        if (!res.ok) {
          toast.error(json.error ?? `Upload von "${file.name}" fehlgeschlagen.`)
          return
        }

        // Add new document to list immediately
        if (json.document) {
          setDocuments(prev => [json.document as BookingDocument, ...prev])
        }
        toast.success(`"${file.name}" hochgeladen.`)
      } catch {
        toast.error(`Netzwerkfehler beim Upload von "${file.name}".`)
      } finally {
        setUploading(prev => {
          const next = { ...prev }
          delete next[uploadKey]
          return next
        })
      }
    })

    await Promise.all(uploadPromises)

    // Reset file input so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [bookingId])

  // Open document via signed URL
  const handleOpen = useCallback(async (doc: BookingDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('booking-documents')
        .createSignedUrl(doc.storage_path, 60)

      if (error || !data?.signedUrl) {
        toast.error('Signierter URL konnte nicht erstellt werden.')
        return
      }

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Fehler beim Oeffnen des Dokuments.')
    }
  }, [])

  // Delete document
  const handleDelete = useCallback(async (doc: BookingDocument) => {
    setDeleting(prev => ({ ...prev, [doc.id]: true }))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/booking-documents/${doc.id}`, {
        method: 'DELETE',
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Loeschen fehlgeschlagen.')
        return
      }

      // Remove from list
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
      toast.success(`"${doc.file_name}" geloescht.`)
    } catch {
      toast.error('Netzwerkfehler beim Loeschen.')
    } finally {
      setDeleting(prev => {
        const next = { ...prev }
        delete next[doc.id]
        return next
      })
    }
  }, [])

  const isUploading = Object.keys(uploading).length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Dokumente / Belege</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-label="Dokument hochladen"
        >
          {isUploading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-3.5 w-3.5" />
          )}
          Hochladen
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          className="hidden"
          onChange={handleFileChange}
          aria-label="Datei auswaehlen"
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="ml-2 text-xs text-muted-foreground">Dokumente laden...</span>
        </div>
      )}

      {/* Upload progress indicators */}
      {Object.keys(uploading).length > 0 && (
        <div className="space-y-1.5">
          {Object.keys(uploading).map((key) => (
            <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              <span className="truncate">Wird hochgeladen...</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && documents.length === 0 && !isUploading && (
        <p className="text-xs text-muted-foreground py-2">
          Noch keine Dokumente -- Beleg hochladen
        </p>
      )}

      {/* Document list */}
      {!loading && documents.length > 0 && (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              {getFileIcon(doc.mime_type)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" title={doc.file_name}>
                  {doc.file_name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatFileSize(doc.file_size)} &middot; {format(new Date(doc.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => handleOpen(doc)}
                aria-label={`${doc.file_name} oeffnen`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                onClick={() => handleDelete(doc)}
                disabled={deleting[doc.id] ?? false}
                aria-label={`${doc.file_name} loeschen`}
              >
                {deleting[doc.id] ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function BookingDetailSheet({
  booking,
  open,
  onOpenChange,
  onBookingUpdated,
}: {
  booking: BookingWithProperty | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onBookingUpdated?: (updated: BookingWithProperty) => void
}) {
  if (!booking) return null

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit form state (guest data)
  const [editFirstname, setEditFirstname] = useState(booking.guest_firstname ?? '')
  const [editLastname, setEditLastname] = useState(booking.guest_lastname ?? '')
  const [editEmail, setEditEmail] = useState(booking.guest_email ?? '')
  const [editPhone, setEditPhone] = useState(booking.guest_phone ?? '')
  const [editStreet, setEditStreet] = useState(booking.guest_street ?? '')
  const [editZip, setEditZip] = useState(booking.guest_zip ?? '')
  const [editCity, setEditCity] = useState(booking.guest_city ?? '')
  const [editCountry, setEditCountry] = useState(booking.guest_country ?? '')
  const [editNote, setEditNote] = useState(booking.guest_note ?? '')

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch(`/api/bookings/${booking!.id}/cancel`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? 'Stornierung fehlgeschlagen')
        return
      }
      onBookingUpdated?.(json.booking as BookingWithProperty)
      setCancelDialogOpen(false)
      onOpenChange(false)
    } finally {
      setCancelling(false)
    }
  }

  async function handleSaveEdit() {
    setSaving(true)
    try {
      const { data: updated } = await supabase
        .from('bookings')
        .update({
          guest_firstname: editFirstname || null,
          guest_lastname: editLastname || null,
          guest_email: editEmail || null,
          guest_phone: editPhone || null,
          guest_street: editStreet || null,
          guest_zip: editZip || null,
          guest_city: editCity || null,
          guest_country: editCountry || null,
          guest_note: editNote || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking!.id)
        .select('*, properties(*)')
        .single()
      if (updated) {
        onBookingUpdated?.(updated as BookingWithProperty)
      }
      setEditDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const guestName = [booking.guest_firstname, booking.guest_lastname]
    .filter(Boolean)
    .join(' ') || 'Unbekannter Gast'

  const guestAddress = [
    booking.guest_street,
    [booking.guest_zip, booking.guest_city].filter(Boolean).join(' '),
    booking.guest_country,
  ]
    .filter(Boolean)
    .join(', ')

  // Calculate city tax from property config (empty rules → uses property fields directly)
  const taxConfig = booking.properties
    ? getTaxConfigForProperty(booking.properties, [])
    : null
  const taxResult = taxConfig ? calculateAccommodationTax(booking, taxConfig, booking.properties?.ota_remits_tax ?? []) : null
  const cityTax = taxResult?.taxAmount ?? 0

  // Vom Gast bezahlt = gross incl. city tax + portal commission
  // Booking.com: amount_gross already includes city tax → use as-is
  // Airbnb: amount_gross excludes city tax (Airbnb remits separately) → add city tax
  const paidByGuest =
    booking.channel === 'Airbnb'
      ? (booking.amount_gross ?? 0) + cityTax
      : (booking.amount_gross ?? 0)

  // Bruttobetrag = booking price incl. commission, excl. city tax
  // Airbnb: amount_gross already excludes city tax → use as-is
  // Booking.com: subtract city tax from amount_gross
  const bruttoWithoutCityTax =
    booking.channel === 'Booking.com'
      ? (booking.amount_gross ?? 0) - cityTax
      : (booking.amount_gross ?? 0)

  // Nettobetrag = Bruttobetrag ohne 7% MwSt (Beherbergungsleistung)
  const nettoAmount = bruttoWithoutCityTax > 0 ? bruttoWithoutCityTax / 1.07 : null

  const commissionPercent =
    bruttoWithoutCityTax && booking.commission_amount
      ? ((booking.commission_amount / bruttoWithoutCityTax) * 100).toFixed(1)
      : null

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {guestName}
            <BookingStatusBadge status={booking.status} />
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Aufenthalt */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Aufenthalt</h3>
            <InfoRow label="Objekt" value={booking.properties?.name} />
            <InfoRow label="Check-in" value={formatDate(booking.check_in)} />
            <InfoRow label="Check-out" value={formatDate(booking.check_out)} />
            <InfoRow label="Nächte" value={booking.nights} />
            <InfoRow
              label="Gäste"
              value={`${booking.adults ?? 1} Erw.${booking.children ? ` + ${booking.children} Kinder` : ''}`}
            />
            <InfoRow label="Kanal" value={booking.channel} />
          </div>

          <Separator />

          {/* Gastdaten */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Gastdaten</h3>
            <InfoRow label="Name" value={guestName} />
            <InfoRow label="E-Mail" value={booking.guest_email} />
            <InfoRow label="Telefon" value={booking.guest_phone} />
            <InfoRow label="Adresse" value={guestAddress || null} />
            <InfoRow label="Nationalität" value={booking.guest_nationality} />
            <InfoRow label="Sprache" value={booking.guest_language} />
          </div>

          <Separator />

          {/* Finanzdaten */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Finanzdaten</h3>
            <InfoRow label="Vom Gast bezahlt" value={formatCurrency(paidByGuest)} />
            <InfoRow label="Bruttobetrag (ohne City Tax)" value={formatCurrency(bruttoWithoutCityTax)} />
            <InfoRow label="Nettobetrag (ohne 7% MwSt)" value={formatCurrency(nettoAmount)} />
            <InfoRow
              label="Provision"
              value={
                booking.commission_amount !== null
                  ? `${formatCurrency(booking.commission_amount)}${commissionPercent ? ` (${commissionPercent}%)` : ''}`
                  : '–'
              }
            />
            <InfoRow
              label="Host-Auszahlung"
              value={formatCurrency(
                (booking.amount_host_payout ?? 0) > 0
                  ? booking.amount_host_payout
                  : (booking.amount_gross ?? 0) - (booking.commission_amount ?? 0)
              )}
            />
            <InfoRow label="Reinigungsgebühr" value={formatCurrency(getCleaningFee(booking, booking.properties?.default_cleaning_fee ?? undefined))} />
            <InfoRow
              label={`Beherbergungssteuer${taxResult?.remittedByOta ? ` (von ${taxResult.remittedByOtaName ?? 'OTA'} abgeführt)` : ''}`}
              value={taxResult ? formatCurrency(taxResult.taxAmount) : '–'}
            />
            <InfoRow label="Zusatzgebühren" value={formatCurrency(booking.extra_fees)} />
            <InfoRow label="Kaution" value={formatCurrency(booking.security_deposit)} />
            <InfoRow label="Vorauszahlung" value={formatCurrency(booking.prepayment)} />
            <InfoRow label="Restbetrag" value={formatCurrency(booking.balance)} />
          </div>

          {booking.guest_note && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-2">Notizen</h3>
                <p className="text-sm text-muted-foreground">{booking.guest_note}</p>
              </div>
            </>
          )}

          {/* Stripe-Zahlung (Direktbuchungen) */}
          {booking.channel === 'Direct' && (
            <>
              <Separator />
              <StripePaymentSection booking={booking} onBookingUpdated={onBookingUpdated} />
            </>
          )}

          <Separator />

          {/* Dokumente / Belege */}
          <DocumentsSection bookingId={booking.id} />

          <Separator />

          {/* Aktionen */}
          <div className="flex flex-col gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/meldescheine?booking=${booking.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                Meldeschein erstellen
              </Link>
            </Button>
            {(() => {
              const checkIn = new Date(booking.check_in + 'T00:00:00')
              const checkOut = new Date(booking.check_out + 'T00:00:00')
              const isMultiMonth =
                checkIn.getMonth() !== checkOut.getMonth() ||
                checkIn.getFullYear() !== checkOut.getFullYear()
              return isMultiMonth ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Diese Buchung geht über mehrere Monate:</p>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href={`/dashboard/rechnungen?booking=${booking.id}`}>
                      <Receipt className="mr-2 h-4 w-4" />
                      Gesamtrechnung erstellen
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href={`/dashboard/rechnungen?booking=${booking.id}&split=true`}>
                      <Receipt className="mr-2 h-4 w-4" />
                      Monatsweise aufteilen
                    </Link>
                  </Button>
                </div>
              ) : (
                <Button variant="outline" asChild>
                  <Link href={`/dashboard/rechnungen?booking=${booking.id}`}>
                    <Receipt className="mr-2 h-4 w-4" />
                    Rechnung erstellen
                  </Link>
                </Button>
              )
            })()}
            {booking.status !== 'cancelled' && (
              <Button
                variant="outline"
                className="text-destructive border-destructive/50 hover:bg-destructive/10 justify-start"
                onClick={() => setCancelDialogOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Buchung stornieren
              </Button>
            )}
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                setEditFirstname(booking.guest_firstname ?? '')
                setEditLastname(booking.guest_lastname ?? '')
                setEditEmail(booking.guest_email ?? '')
                setEditPhone(booking.guest_phone ?? '')
                setEditStreet(booking.guest_street ?? '')
                setEditZip(booking.guest_zip ?? '')
                setEditCity(booking.guest_city ?? '')
                setEditCountry(booking.guest_country ?? '')
                setEditNote(booking.guest_note ?? '')
                setEditDialogOpen(true)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Buchung bearbeiten
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    {/* Cancel Confirmation Dialog */}
    <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Buchung stornieren?</AlertDialogTitle>
          <AlertDialogDescription>
            Die Buchung von {[booking.guest_firstname, booking.guest_lastname].filter(Boolean).join(' ') || 'diesem Gast'} wird als storniert markiert. Diese Aenderung kann nicht automatisch rueckgaengig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Stornieren
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Edit Booking Dialog */}
    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buchung bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Vorname</Label>
              <Input value={editFirstname} onChange={(e) => setEditFirstname(e.target.value)} placeholder="Max" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nachname</Label>
              <Input value={editLastname} onChange={(e) => setEditLastname(e.target.value)} placeholder="Mustermann" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">E-Mail</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" placeholder="max@example.de" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefon</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} type="tel" placeholder="+49 123 456789" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Straße + Hausnummer</Label>
            <Input value={editStreet} onChange={(e) => setEditStreet(e.target.value)} placeholder="Musterstr. 1" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">PLZ</Label>
              <Input value={editZip} onChange={(e) => setEditZip(e.target.value)} placeholder="01067" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Ort</Label>
              <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="Dresden" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Land</Label>
            <Input value={editCountry} onChange={(e) => setEditCountry(e.target.value)} placeholder="DE" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notiz</Label>
            <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Besondere Wuensche..." />
          </div>
          <Button className="w-full" onClick={handleSaveEdit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

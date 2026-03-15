'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { pdf } from '@react-pdf/renderer'
import JSZip from 'jszip'
import Link from 'next/link'
import { Plus, Trash2, Download, FileText, AlertTriangle, Archive, Loader2, Info } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { MeldescheinPDF, type MeldescheinData } from '@/lib/pdf/meldeschein'
import type { BookingWithProperty } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

// SEC-8: Only select columns needed – smoobu_api_key and billing fields are excluded
interface SettingsData {
  id: string
  landlord_name: string | null
  landlord_street: string | null
  landlord_zip: string | null
  landlord_city: string | null
  landlord_logo_url: string | null // BUG-9: needed for PDF logo
}

interface RegistrationForm {
  id: string
  booking_id: string | null
  guest_firstname: string
  guest_lastname: string
  check_in: string
  check_out: string
  status: string
  created_at: string | null
  trip_purpose: string | null
}

interface CoTraveller {
  firstname: string
  lastname: string
  birthdate: string
  nationality: string
}

// BUG-5 (type fix): Only Erstellt / Archiviert per tech design
const STATUS_LABELS: Record<string, string> = {
  created: 'Erstellt',
  archived: 'Archiviert',
}

export default function MeldescheinePage() {
  return (
    <Suspense>
      <MeldescheineContent />
    </Suspense>
  )
}

function MeldescheineContent() {
  const searchParams = useSearchParams()
  const bookingIdParam = searchParams.get('booking')

  const [forms, setForms] = useState<RegistrationForm[]>([])
  const [bookings, setBookings] = useState<BookingWithProperty[]>([])
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [autoGenInfo, setAutoGenInfo] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [syncingGuestId, setSyncingGuestId] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [skippedCount, setSkippedCount] = useState(0)

  // Form state
  const [selectedBookingId, setSelectedBookingId] = useState<string>('')
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [nationality, setNationality] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('')
  const [tripPurpose, setTripPurpose] = useState<string>('unknown')
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [coTravellers, setCoTravellers] = useState<CoTraveller[]>([])

  useEffect(() => {
    async function fetchData() {
      const [{ data: formsData }, { data: bookingsData }, { data: settingsData }] =
        await Promise.all([
          supabase
            .from('registration_forms')
            .select('id, booking_id, guest_firstname, guest_lastname, check_in, check_out, status, created_at, trip_purpose')
            .neq('status', 'deleted')
            .order('created_at', { ascending: false }),
          supabase
            .from('bookings')
            .select('*, properties(*)')
            .order('check_in', { ascending: false })
            .limit(100),
          // SEC-8: Explicit column list – smoobu_api_key is NOT included
          supabase
            .from('settings')
            .select('id, landlord_name, landlord_street, landlord_zip, landlord_city, landlord_logo_url')
            .limit(1)
            .single(),
        ])

      setForms(formsData ?? [])
      setBookings((bookingsData ?? []) as BookingWithProperty[])
      setSettings(settingsData as SettingsData | null)
      setLoading(false)

      // Auto-open dialog if booking param
      if (bookingIdParam) {
        const booking = (bookingsData ?? []).find(
          (b: BookingWithProperty) => b.id === bookingIdParam
        ) as BookingWithProperty | undefined
        if (booking) {
          fillFromBooking(booking)
          setDialogOpen(true)
        }
      }

      // BUG-6 (auto-generate): Call on page load with auth token
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/meldescheine/auto-generate', {
          method: 'POST',
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        })
        if (res.ok) {
          const { created, skipped } = await res.json() as { created: number; skipped: number }
          if (created > 0) {
            setAutoGenInfo(`${created} Meldeschein${created > 1 ? 'e' : ''} automatisch erstellt`)
            const { data: refreshed } = await supabase
              .from('registration_forms')
              .select('id, booking_id, guest_firstname, guest_lastname, check_in, check_out, status, created_at, trip_purpose')
              .neq('status', 'deleted')
              .order('created_at', { ascending: false })
            setForms(refreshed ?? [])
          }
          if (skipped > 0) {
            setSkippedCount(skipped)
          }
        }
      } catch {
        // Auto-generate is best-effort, don't block the page
      }
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingIdParam])

  function fillFromBooking(booking: BookingWithProperty) {
    setSelectedBookingId(booking.id)
    setFirstname(booking.guest_firstname ?? '')
    setLastname(booking.guest_lastname ?? '')
    setNationality(booking.guest_nationality ?? '')
    setStreet(booking.guest_street ?? '')
    setCity(booking.guest_city ?? '')
    setZip(booking.guest_zip ?? '')
    setCountry(booking.guest_country ?? '')
    setTripPurpose(booking.trip_purpose ?? 'unknown')
    setAdults(booking.adults ?? 1)
    setChildren(booking.children ?? 0)
    setCheckIn(booking.check_in)
    setCheckOut(booking.check_out)
    setBirthdate('')
    setCoTravellers([])
  }

  function resetForm() {
    setSelectedBookingId('')
    setFirstname('')
    setLastname('')
    setBirthdate('')
    setNationality('')
    setStreet('')
    setCity('')
    setZip('')
    setCountry('')
    setTripPurpose('unknown')
    setAdults(1)
    setChildren(0)
    setCheckIn('')
    setCheckOut('')
    setCoTravellers([])
    setSaveError(null)
  }

  // BUG-1: All mandatory fields per BeherbStatG
  const missingFields = [
    !firstname && 'Vorname',
    !lastname && 'Familienname',
    !nationality && 'Staatsangehörigkeit',
    !street && 'Wohnanschrift (Straße)',
    !checkIn && 'Ankunft',
    !checkOut && 'Abreise',
  ].filter(Boolean) as string[]

  const isFormValid = missingFields.length === 0

  function buildLandlordAddress(): string | undefined {
    if (!settings) return undefined
    return [
      settings.landlord_street,
      [settings.landlord_zip, settings.landlord_city].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ') || undefined
  }

  async function handleSaveAndGeneratePDF() {
    if (!isFormValid) return
    setGenerating(true)
    setSaveError(null)

    try {
      const selectedBooking = bookings.find((b) => b.id === selectedBookingId)
      const property = selectedBooking?.properties

      // BUG-8: Save via server API route with Zod validation (not direct Supabase)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/meldescheine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          booking_id: selectedBookingId || null,
          property_id: property?.id ?? null,
          guest_firstname: firstname,
          guest_lastname: lastname,
          guest_birthdate: birthdate || null,
          guest_nationality: nationality,
          guest_street: street,
          guest_city: city || null,
          guest_zip: zip || null,
          guest_country: country || null,
          check_in: checkIn,
          check_out: checkOut,
          adults,
          children,
          trip_purpose: tripPurpose as 'leisure' | 'business' | 'unknown',
          co_travellers: coTravellers.length > 0 ? coTravellers : null,
          property_snapshot: {
            name: property?.name ?? '',
            street: property?.street ?? '',
            city: property?.city ?? '',
            zip: property?.zip ?? '',
          },
        }),
      })

      if (!response.ok) {
        const err = await response.json() as { error?: string }
        setSaveError(err.error ?? 'Speichern fehlgeschlagen')
        return
      }

      const { data: saved } = await response.json() as { data: RegistrationForm }
      if (saved) {
        setForms((prev) => [saved, ...prev])
      }

      // Generate PDF
      const pdfData: MeldescheinData = {
        propertyName: property?.name ?? 'Ferienwohnung',
        propertyAddress: [property?.street, [property?.zip, property?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        firstname,
        lastname,
        birthdate: birthdate || undefined,
        nationality: nationality || undefined,
        street: street || undefined,
        city: city || undefined,
        zip: zip || undefined,
        country: country || undefined,
        checkIn: checkIn ? format(new Date(checkIn + 'T00:00:00'), 'dd.MM.yyyy') : '',
        checkOut: checkOut ? format(new Date(checkOut + 'T00:00:00'), 'dd.MM.yyyy') : '',
        adults,
        children,
        tripPurpose,
        coTravellers: coTravellers.length > 0 ? coTravellers : undefined,
        landlordName: settings?.landlord_name ?? undefined,
        landlordAddress: buildLandlordAddress(),
        logoUrl: settings?.landlord_logo_url ?? undefined, // BUG-9
      }

      const blob = await pdf(<MeldescheinPDF data={pdfData} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `meldeschein-${lastname || 'gast'}-${checkIn}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      setDialogOpen(false)
      resetForm()
    } finally {
      setGenerating(false)
    }
  }

  /** Sync guest data from Smoobu before download (always, to catch address updates) */
  async function syncGuestForBooking(bookingId: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/smoobu/sync-guest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ bookingId }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function handleDownloadExisting(form: RegistrationForm) {
    setSyncingGuestId(form.id)
    try {
      // Always sync guest data from Smoobu before PDF generation
      // (webhook doesn't send address updates, so we always re-fetch)
      if (form.booking_id) {
        await syncGuestForBooking(form.booking_id)
      }

      // Re-fetch form data (may have been updated by sync-guest backfill)
      const { data } = await supabase
        .from('registration_forms')
        .select('id, guest_firstname, guest_lastname, guest_birthdate, guest_nationality, guest_street, guest_city, guest_zip, guest_country, check_in, check_out, adults, children, trip_purpose, co_travellers, property_snapshot')
        .eq('id', form.id)
        .single()
      if (!data) return

      // BUG-1: landlordAddress is now included (was missing before)
      const pdfData: MeldescheinData = {
        propertyName: (data.property_snapshot as Record<string, string>)?.name ?? 'Ferienwohnung',
        propertyAddress: [
          (data.property_snapshot as Record<string, string>)?.street,
          [(data.property_snapshot as Record<string, string>)?.zip, (data.property_snapshot as Record<string, string>)?.city].filter(Boolean).join(' '),
        ].filter(Boolean).join(', '),
        firstname: data.guest_firstname,
        lastname: data.guest_lastname,
        birthdate: data.guest_birthdate ?? undefined,
        nationality: data.guest_nationality ?? undefined,
        street: data.guest_street ?? undefined,
        city: data.guest_city ?? undefined,
        zip: data.guest_zip ?? undefined,
        country: data.guest_country ?? undefined,
        checkIn: format(new Date(data.check_in + 'T00:00:00'), 'dd.MM.yyyy'),
        checkOut: format(new Date(data.check_out + 'T00:00:00'), 'dd.MM.yyyy'),
        adults: data.adults ?? 1,
        children: data.children ?? 0,
        tripPurpose: data.trip_purpose ?? 'unknown',
        coTravellers: (data.co_travellers as unknown as CoTraveller[]) ?? undefined,
        landlordName: settings?.landlord_name ?? undefined,
        landlordAddress: buildLandlordAddress(), // BUG-1 fixed
        logoUrl: settings?.landlord_logo_url ?? undefined, // BUG-9
      }

      const blob = await pdf(<MeldescheinPDF data={pdfData} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `meldeschein-${data.guest_lastname}-${data.check_in}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setSyncingGuestId(null)
    }
  }

  // BUG-11: Status update via server API route (service client, no auth required)
  async function updateStatus(formId: string, newStatus: string) {
    const res = await fetch(`/api/meldescheine/${formId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      console.error('Status update failed:', err.error)
      return
    }
    setForms((prev) =>
      prev.map((f) => (f.id === formId ? { ...f, status: newStatus } : f))
    )
  }

  // BUG-12: Soft-delete via server API route (service client, no auth required)
  async function handleDelete(formId: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/meldescheine/${formId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        console.error('Delete failed:', err.error)
        return
      }
      setForms((prev) => prev.filter((f) => f.id !== formId))
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  // BUG-5: Remove a co-traveller by index
  function removeCoTraveller(index: number) {
    setCoTravellers((prev) => prev.filter((_, i) => i !== index))
  }

  /** Bulk download all Meldescheine as ZIP */
  async function handleBulkDownload() {
    if (forms.length === 0) return
    setBulkDownloading(true)
    try {
      const zip = new JSZip()
      for (const form of forms) {
        const { data } = await supabase
          .from('registration_forms')
          .select('id, guest_firstname, guest_lastname, guest_birthdate, guest_nationality, guest_street, guest_city, guest_zip, guest_country, check_in, check_out, adults, children, trip_purpose, co_travellers, property_snapshot')
          .eq('id', form.id)
          .single()
        if (!data) continue

        const pdfData: MeldescheinData = {
          propertyName: (data.property_snapshot as Record<string, string>)?.name ?? 'Ferienwohnung',
          propertyAddress: [
            (data.property_snapshot as Record<string, string>)?.street,
            [(data.property_snapshot as Record<string, string>)?.zip, (data.property_snapshot as Record<string, string>)?.city].filter(Boolean).join(' '),
          ].filter(Boolean).join(', '),
          firstname: data.guest_firstname,
          lastname: data.guest_lastname,
          birthdate: data.guest_birthdate ?? undefined,
          nationality: data.guest_nationality ?? undefined,
          street: data.guest_street ?? undefined,
          city: data.guest_city ?? undefined,
          zip: data.guest_zip ?? undefined,
          country: data.guest_country ?? undefined,
          checkIn: format(new Date(data.check_in + 'T00:00:00'), 'dd.MM.yyyy'),
          checkOut: format(new Date(data.check_out + 'T00:00:00'), 'dd.MM.yyyy'),
          adults: data.adults ?? 1,
          children: data.children ?? 0,
          tripPurpose: data.trip_purpose ?? 'unknown',
          coTravellers: (data.co_travellers as unknown as CoTraveller[]) ?? undefined,
          landlordName: settings?.landlord_name ?? undefined,
          landlordAddress: buildLandlordAddress(),
          logoUrl: settings?.landlord_logo_url ?? undefined,
        }

        const blob = await pdf(<MeldescheinPDF data={pdfData} />).toBlob()
        zip.file(`meldeschein-${data.guest_lastname}-${data.check_in}.pdf`, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `meldescheine-${format(new Date(), 'yyyy-MM-dd')}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBulkDownloading(false)
    }
  }

  /** PROJ-15: Delete ALL registration forms for the current user */
  async function handleDeleteAll() {
    setDeletingAll(true)
    try {
      const count = forms.length
      const { error } = await supabase
        .from('registration_forms')
        .delete()
        .gte('created_at', '1970-01-01T00:00:00Z') // delete all rows (RLS scopes to user)
      if (error) {
        console.error('Delete all failed:', error.message)
        toast.error('Löschen fehlgeschlagen')
        return
      }
      setForms([])
      toast.success(`${count} Meldeschein${count > 1 ? 'e' : ''} wurden gelöscht`)
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* PROJ-15: Info banner for skipped bookings (missing mandatory fields) */}
      {skippedCount > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>
              {skippedCount} Buchung{skippedCount > 1 ? 'en' : ''} wurde{skippedCount > 1 ? 'n' : ''} übersprungen, da Pflichtfelder fehlen (z.B. Nationalität oder Adresse). Bitte{' '}
              <Link href="/dashboard/buchungen" className="font-medium underline underline-offset-2 hover:text-amber-900">
                manuell ergänzen
              </Link>.
            </p>
          </div>
        </div>
      )}

      {autoGenInfo && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {autoGenInfo}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Meldescheine</h2>
        <div className="flex flex-wrap gap-2">
          {/* PROJ-15: Delete all button with confirmation */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={forms.length === 0 || deletingAll}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Alle löschen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Alle Meldescheine löschen?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Diese Aktion löscht alle {forms.length} Meldeschein{forms.length !== 1 ? 'e' : ''} permanent. Sie kann nicht rückgängig gemacht werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingAll}>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deletingAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDeleteAll}
                >
                  {deletingAll ? 'Wird gelöscht...' : 'Alle löschen'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant="outline"
            disabled={bulkDownloading || forms.length === 0}
            onClick={handleBulkDownload}
          >
            <Archive className="mr-2 h-4 w-4" />
            {bulkDownloading ? 'Wird erstellt...' : `Alle herunterladen (${forms.length})`}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Neu erstellen
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Meldeschein erstellen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Booking selector */}
              <div className="space-y-2">
                <Label>Aus Buchung vorausfüllen</Label>
                <Select
                  value={selectedBookingId}
                  onValueChange={(v) => {
                    const booking = bookings.find((b) => b.id === v)
                    if (booking) fillFromBooking(booking)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Buchung wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bookings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {[b.guest_firstname, b.guest_lastname].filter(Boolean).join(' ') || 'Unbekannt'}{' '}
                        – {b.check_in} ({b.properties?.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Guest data – BUG-6: grid-cols-1 sm:grid-cols-2 for mobile */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vorname *</Label>
                  <Input value={firstname} onChange={(e) => setFirstname(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Familienname *</Label>
                  <Input value={lastname} onChange={(e) => setLastname(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Geburtsdatum</Label>
                  <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Staatsangehörigkeit *</Label>
                  <Input
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    placeholder="z.B. deutsch"
                    className={!nationality ? 'border-destructive' : ''}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label>Wohnanschrift *</Label>
                <Input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Straße, Nr."
                  className={!street ? 'border-destructive' : ''}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="PLZ" />
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ort" className="col-span-2" />
                </div>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Land" />
              </div>

              {/* Stay – BUG-6: same responsive grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Ankunft *</Label>
                  <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Abreise *</Label>
                  <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Erwachsene</Label>
                  <Input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Kinder</Label>
                  <Input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reisezweck</Label>
                <Select value={tripPurpose} onValueChange={setTripPurpose}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leisure">Privat</SelectItem>
                    <SelectItem value="business">Geschäftlich</SelectItem>
                    <SelectItem value="unknown">Unbekannt</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Co-travellers – BUG-5: remove button added; BUG-11: responsive grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Mitreisende</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCoTravellers((prev) => [
                        ...prev,
                        { firstname: '', lastname: '', birthdate: '', nationality: '' },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Person
                  </Button>
                </div>
                {coTravellers.map((ct, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                      <Input
                        placeholder="Vorname"
                        value={ct.firstname}
                        onChange={(e) => {
                          const updated = [...coTravellers]
                          updated[i] = { ...updated[i], firstname: e.target.value }
                          setCoTravellers(updated)
                        }}
                      />
                      <Input
                        placeholder="Nachname"
                        value={ct.lastname}
                        onChange={(e) => {
                          const updated = [...coTravellers]
                          updated[i] = { ...updated[i], lastname: e.target.value }
                          setCoTravellers(updated)
                        }}
                      />
                      <Input
                        type="date"
                        value={ct.birthdate}
                        onChange={(e) => {
                          const updated = [...coTravellers]
                          updated[i] = { ...updated[i], birthdate: e.target.value }
                          setCoTravellers(updated)
                        }}
                      />
                      <Input
                        placeholder="Nationalität"
                        value={ct.nationality}
                        onChange={(e) => {
                          const updated = [...coTravellers]
                          updated[i] = { ...updated[i], nationality: e.target.value }
                          setCoTravellers(updated)
                        }}
                      />
                    </div>
                    {/* BUG-5: Remove button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCoTraveller(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Missing fields warning */}
              {missingFields.length > 0 && (
                <p className="text-sm text-destructive">
                  Pflichtfelder fehlen: {missingFields.join(', ')}
                </p>
              )}

              {/* Save error */}
              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}

              <Button
                className="w-full"
                disabled={!isFormValid || generating}
                onClick={handleSaveAndGeneratePDF}
              >
                <FileText className="mr-2 h-4 w-4" />
                {generating ? 'Wird generiert...' : 'Speichern & PDF generieren'}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Archive table – BUG-7: overflow-x-auto wrapper for mobile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Archiv</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : forms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Noch keine Meldescheine erstellt
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gast</TableHead>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead>Reisezweck</TableHead>
                    <TableHead>Erstellt</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forms.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {form.guest_firstname} {form.guest_lastname}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(form.check_in + 'T00:00:00'), 'dd.MM.yy', { locale: de })} –{' '}
                        {format(new Date(form.check_out + 'T00:00:00'), 'dd.MM.yy', { locale: de })}
                      </TableCell>
                      <TableCell>
                        {form.trip_purpose === 'business' ? 'Geschäftlich' : form.trip_purpose === 'leisure' ? 'Privat' : '–'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {form.created_at
                          ? format(new Date(form.created_at), 'dd.MM.yy', { locale: de })
                          : '–'}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={form.status}
                          onValueChange={(v) => updateStatus(form.id, v)}
                        >
                          <SelectTrigger className="h-7 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="created">{STATUS_LABELS.created}</SelectItem>
                            <SelectItem value="archived">{STATUS_LABELS.archived}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={syncingGuestId === form.id}
                            onClick={() => handleDownloadExisting(form)}
                          >
                            {syncingGuestId === form.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Download className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(form.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BUG-12: Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Meldeschein löschen?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dieser Meldeschein wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => { if (deleteId) handleDelete(deleteId) }}
            >
              {deleting ? 'Wird gelöscht...' : 'Löschen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

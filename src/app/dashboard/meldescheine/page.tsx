'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { pdf } from '@react-pdf/renderer'
import { Plus, Download, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MeldescheinPDF, type MeldescheinData } from '@/lib/pdf/meldeschein'
import type { BookingWithProperty, Settings } from '@/lib/types'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SignaturePad } from '@/components/dashboard/signature-pad'

interface RegistrationForm {
  id: string
  guest_firstname: string
  guest_lastname: string
  check_in: string
  check_out: string
  status: string
  created_at: string | null
  trip_purpose: string | null
  signature: string | null
}

interface CoTraveller {
  firstname: string
  lastname: string
  birthdate: string
  nationality: string
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Erstellt',
  signed: 'Unterschrieben',
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
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

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
  const [signature, setSignature] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const [{ data: formsData }, { data: bookingsData }, { data: settingsData }] =
        await Promise.all([
          supabase
            .from('registration_forms')
            .select('id, guest_firstname, guest_lastname, check_in, check_out, status, created_at, trip_purpose, signature')
            .order('created_at', { ascending: false }),
          supabase
            .from('bookings')
            .select('*, properties(*)')
            .order('check_in', { ascending: false })
            .limit(100),
          supabase.from('settings').select('*').limit(1).single(),
        ])

      setForms(formsData ?? [])
      setBookings((bookingsData ?? []) as BookingWithProperty[])
      setSettings(settingsData)
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
    setSignature(null)
  }

  async function handleSaveAndGeneratePDF() {
    setGenerating(true)
    try {
      const selectedBooking = bookings.find((b) => b.id === selectedBookingId)
      const property = selectedBooking?.properties

      // Save to database
      const { data: saved } = await supabase
        .from('registration_forms')
        .insert({
          booking_id: selectedBookingId || null,
          property_id: property?.id ?? null,
          guest_firstname: firstname,
          guest_lastname: lastname,
          guest_birthdate: birthdate || null,
          guest_nationality: nationality || null,
          guest_street: street || null,
          guest_city: city || null,
          guest_zip: zip || null,
          guest_country: country || null,
          check_in: checkIn,
          check_out: checkOut,
          adults,
          children,
          trip_purpose: tripPurpose,
          co_travellers: coTravellers.length > 0 ? JSON.parse(JSON.stringify(coTravellers)) : null,
          property_snapshot: JSON.parse(JSON.stringify({
            name: property?.name ?? '',
            street: property?.street ?? '',
            city: property?.city ?? '',
            zip: property?.zip ?? '',
          })),
          signature: signature ?? null,
          status: signature ? 'signed' : 'created',
        })
        .select('id, guest_firstname, guest_lastname, check_in, check_out, status, created_at, trip_purpose, signature')
        .single()

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
        landlordAddress: settings
          ? [settings.landlord_street, [settings.landlord_zip, settings.landlord_city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
          : undefined,
        signature: signature ?? undefined,
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

  async function handleDownloadExisting(form: RegistrationForm) {
    // Fetch full form data
    const { data } = await supabase
      .from('registration_forms')
      .select('*')
      .eq('id', form.id)
      .single()
    if (!data) return

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
      signature: data.signature ?? undefined,
    }

    const blob = await pdf(<MeldescheinPDF data={pdfData} />).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meldeschein-${data.guest_lastname}-${data.check_in}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function updateStatus(formId: string, newStatus: string) {
    await supabase
      .from('registration_forms')
      .update({ status: newStatus })
      .eq('id', formId)
    setForms((prev) =>
      prev.map((f) => (f.id === formId ? { ...f, status: newStatus } : f))
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Meldescheine</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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

              {/* Guest data */}
              <div className="grid grid-cols-2 gap-4">
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
                  <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="z.B. deutsch" />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label>Wohnanschrift *</Label>
                <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Straße, Nr." />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="PLZ" />
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ort" className="col-span-2" />
                </div>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Land" />
              </div>

              {/* Stay */}
              <div className="grid grid-cols-2 gap-4">
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

              {/* Co-travellers */}
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
                  <div key={i} className="grid grid-cols-4 gap-2">
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
                      placeholder="Geb."
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
                ))}
              </div>

              {/* Signature */}
              <SignaturePad onChange={setSignature} />

              {/* Missing fields warning */}
              {(!firstname || !lastname || !checkIn || !checkOut) && (
                <p className="text-sm text-destructive">
                  Pflichtfelder fehlen: {[
                    !firstname && 'Vorname',
                    !lastname && 'Familienname',
                    !checkIn && 'Ankunft',
                    !checkOut && 'Abreise',
                  ].filter(Boolean).join(', ')}
                </p>
              )}

              <Button
                className="w-full"
                disabled={!firstname || !lastname || !checkIn || !checkOut || generating}
                onClick={handleSaveAndGeneratePDF}
              >
                <FileText className="mr-2 h-4 w-4" />
                {generating ? 'Wird generiert...' : 'Speichern & PDF generieren'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Archive table */}
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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gast</TableHead>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead>Reisezweck</TableHead>
                    <TableHead>Signatur</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forms.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium">
                        {form.guest_firstname} {form.guest_lastname}
                      </TableCell>
                      <TableCell>
                        {format(new Date(form.check_in + 'T00:00:00'), 'dd.MM.yy', { locale: de })} –{' '}
                        {format(new Date(form.check_out + 'T00:00:00'), 'dd.MM.yy', { locale: de })}
                      </TableCell>
                      <TableCell>
                        {form.trip_purpose === 'business' ? 'Geschäftlich' : form.trip_purpose === 'leisure' ? 'Privat' : '–'}
                      </TableCell>
                      <TableCell>
                        {form.signature ? (
                          <Badge variant="default" className="bg-green-600">Signiert</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Fehlt</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={form.status}
                          onValueChange={(v) => updateStatus(form.id, v)}
                        >
                          <SelectTrigger className="h-7 w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="created">{STATUS_LABELS.created}</SelectItem>
                            <SelectItem value="signed">{STATUS_LABELS.signed}</SelectItem>
                            <SelectItem value="archived">{STATUS_LABELS.archived}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadExisting(form)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

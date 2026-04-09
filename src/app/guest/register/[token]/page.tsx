'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { CheckCircle2, Loader2, AlertTriangle, XCircle, Plus, Trash2, Globe } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { translations, type Locale } from '@/lib/i18n/guest-registration'

interface BookingData {
  firstname: string
  lastname: string
  nationality: string
  street: string
  city: string
  zip: string
  country: string
  language: string
  check_in: string
  check_out: string
  adults: number
  children: number
  trip_purpose: string
}

interface PropertyData {
  name: string
  street: string
  city: string
  zip: string
}

interface ExistingForm {
  firstname: string
  lastname: string
  birthdate: string
  nationality: string
  street: string
  city: string
  zip: string
  country: string
  trip_purpose: string
  co_travellers: CoTraveller[]
}

interface CoTraveller {
  firstname: string
  lastname: string
  birthdate?: string
  nationality?: string
}

type PageState = 'loading' | 'form' | 'success' | 'expired' | 'invalid' | 'error'

// Countries with priority countries on top (nearby/common)
const PRIORITY_COUNTRIES = [
  { code: 'DE', de: 'Deutschland', en: 'Germany' },
  { code: 'AT', de: 'Österreich', en: 'Austria' },
  { code: 'CH', de: 'Schweiz', en: 'Switzerland' },
  { code: 'CZ', de: 'Tschechien', en: 'Czech Republic' },
  { code: 'PL', de: 'Polen', en: 'Poland' },
  { code: 'NL', de: 'Niederlande', en: 'Netherlands' },
  { code: 'DK', de: 'Dänemark', en: 'Denmark' },
  { code: 'FR', de: 'Frankreich', en: 'France' },
  { code: 'BE', de: 'Belgien', en: 'Belgium' },
  { code: 'LU', de: 'Luxemburg', en: 'Luxembourg' },
]

const OTHER_COUNTRIES = [
  { code: 'AL', de: 'Albanien', en: 'Albania' },
  { code: 'AD', de: 'Andorra', en: 'Andorra' },
  { code: 'AM', de: 'Armenien', en: 'Armenia' },
  { code: 'AU', de: 'Australien', en: 'Australia' },
  { code: 'AZ', de: 'Aserbaidschan', en: 'Azerbaijan' },
  { code: 'BA', de: 'Bosnien und Herzegowina', en: 'Bosnia and Herzegovina' },
  { code: 'BG', de: 'Bulgarien', en: 'Bulgaria' },
  { code: 'BR', de: 'Brasilien', en: 'Brazil' },
  { code: 'BY', de: 'Belarus', en: 'Belarus' },
  { code: 'CA', de: 'Kanada', en: 'Canada' },
  { code: 'CN', de: 'China', en: 'China' },
  { code: 'CY', de: 'Zypern', en: 'Cyprus' },
  { code: 'EE', de: 'Estland', en: 'Estonia' },
  { code: 'ES', de: 'Spanien', en: 'Spain' },
  { code: 'FI', de: 'Finnland', en: 'Finland' },
  { code: 'GB', de: 'Vereinigtes Königreich', en: 'United Kingdom' },
  { code: 'GE', de: 'Georgien', en: 'Georgia' },
  { code: 'GR', de: 'Griechenland', en: 'Greece' },
  { code: 'HR', de: 'Kroatien', en: 'Croatia' },
  { code: 'HU', de: 'Ungarn', en: 'Hungary' },
  { code: 'IE', de: 'Irland', en: 'Ireland' },
  { code: 'IL', de: 'Israel', en: 'Israel' },
  { code: 'IN', de: 'Indien', en: 'India' },
  { code: 'IS', de: 'Island', en: 'Iceland' },
  { code: 'IT', de: 'Italien', en: 'Italy' },
  { code: 'JP', de: 'Japan', en: 'Japan' },
  { code: 'KR', de: 'Südkorea', en: 'South Korea' },
  { code: 'LI', de: 'Liechtenstein', en: 'Liechtenstein' },
  { code: 'LT', de: 'Litauen', en: 'Lithuania' },
  { code: 'LV', de: 'Lettland', en: 'Latvia' },
  { code: 'MC', de: 'Monaco', en: 'Monaco' },
  { code: 'MD', de: 'Moldau', en: 'Moldova' },
  { code: 'ME', de: 'Montenegro', en: 'Montenegro' },
  { code: 'MK', de: 'Nordmazedonien', en: 'North Macedonia' },
  { code: 'MT', de: 'Malta', en: 'Malta' },
  { code: 'MX', de: 'Mexiko', en: 'Mexico' },
  { code: 'NO', de: 'Norwegen', en: 'Norway' },
  { code: 'NZ', de: 'Neuseeland', en: 'New Zealand' },
  { code: 'PT', de: 'Portugal', en: 'Portugal' },
  { code: 'RO', de: 'Rumänien', en: 'Romania' },
  { code: 'RS', de: 'Serbien', en: 'Serbia' },
  { code: 'RU', de: 'Russland', en: 'Russia' },
  { code: 'SE', de: 'Schweden', en: 'Sweden' },
  { code: 'SI', de: 'Slowenien', en: 'Slovenia' },
  { code: 'SK', de: 'Slowakei', en: 'Slovakia' },
  { code: 'TR', de: 'Türkei', en: 'Turkey' },
  { code: 'UA', de: 'Ukraine', en: 'Ukraine' },
  { code: 'US', de: 'Vereinigte Staaten', en: 'United States' },
  { code: 'ZA', de: 'Südafrika', en: 'South Africa' },
]

const ALL_COUNTRIES = [...PRIORITY_COUNTRIES, ...OTHER_COUNTRIES]

export default function GuestRegistrationPage() {
  const { token } = useParams<{ token: string }>()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [booking, setBooking] = useState<BookingData | null>(null)
  const [property, setProperty] = useState<PropertyData | null>(null)
  const [existingForm, setExistingForm] = useState<ExistingForm | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [nationality, setNationality] = useState('')
  const [street, setStreet] = useState('')
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [tripPurpose, setTripPurpose] = useState('unknown')
  const [idScanFile, setIdScanFile] = useState<File | null>(null)
  const [coTravellers, setCoTravellers] = useState<CoTraveller[]>([])

  // Language
  const [locale, setLocale] = useState<Locale>('de')
  const t = translations[locale]

  // Load booking data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/guest-registration/${token}`)
        if (res.status === 410) { setPageState('expired'); return }
        if (res.status === 404) { setPageState('invalid'); return }
        if (!res.ok) { setPageState('error'); return }

        const data = await res.json()
        setBooking(data.booking)
        setProperty(data.property)
        if (data.logo_url) setLogoUrl(data.logo_url)

        // Determine locale from guest language
        const lang = data.booking?.language?.toLowerCase() ?? 'de'
        if (lang.startsWith('en')) setLocale('en')

        // Pre-fill from existing form (re-submission) or from booking
        const source = data.existingForm ?? data.booking
        setFirstname(source.firstname ?? '')
        setLastname(source.lastname ?? '')
        setNationality(source.nationality ?? '')
        setStreet(source.street ?? '')
        setCity(source.city ?? '')
        setZip(source.zip ?? '')
        setCountry(source.country ?? '')
        setTripPurpose(source.trip_purpose ?? 'unknown')

        if (data.existingForm) {
          setExistingForm(data.existingForm)
          setBirthdate(data.existingForm.birthdate ?? '')
          setCoTravellers(data.existingForm.co_travellers ?? [])
        }

        setPageState('form')
      } catch {
        setPageState('error')
      }
    }
    load()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate ID scan for non-German guests
    if (nationality && nationality !== 'DE' && !idScanFile) {
      return
    }

    setSubmitting(true)

    try {
      const formPayload = new FormData()
      formPayload.append('data', JSON.stringify({
        firstname,
        lastname,
        birthdate: birthdate || undefined,
        nationality: nationality || undefined,
        street: street || undefined,
        zip: zip || undefined,
        city: city || undefined,
        country: country || undefined,
        trip_purpose: tripPurpose,
        co_travellers: coTravellers.filter(ct => ct.firstname && ct.lastname),
      }))
      if (idScanFile) {
        formPayload.append('idScan', idScanFile)
      }

      const res = await fetch(`/api/guest-registration/${token}`, {
        method: 'POST',
        body: formPayload,
      })

      if (res.ok) {
        setPageState('success')
      } else {
        setPageState('error')
      }
    } catch {
      setPageState('error')
    } finally {
      setSubmitting(false)
    }
  }

  function addCoTraveller() {
    setCoTravellers([...coTravellers, { firstname: '', lastname: '', birthdate: '', nationality: '' }])
  }

  function removeCoTraveller(index: number) {
    setCoTravellers(coTravellers.filter((_, i) => i !== index))
  }

  function updateCoTraveller(index: number, field: keyof CoTraveller, value: string) {
    const updated = [...coTravellers]
    updated[index] = { ...updated[index], [field]: value }
    setCoTravellers(updated)
  }

  function formatDate(dateStr: string) {
    try {
      return format(new Date(dateStr), 'dd.MM.yyyy', { locale: locale === 'de' ? de : enUS })
    } catch {
      return dateStr
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // ─── Expired ────────────────────────────────────────────────────────────────
  if (pageState === 'expired') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <h2 className="text-xl font-semibold">{t.expiredTitle}</h2>
          <p className="text-muted-foreground">{t.expiredMessage}</p>
        </CardContent>
      </Card>
    )
  }

  // ─── Invalid ────────────────────────────────────────────────────────────────
  if (pageState === 'invalid') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <XCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">{t.invalidTitle}</h2>
          <p className="text-muted-foreground">{t.invalidMessage}</p>
        </CardContent>
      </Card>
    )
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <XCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">{t.errorTitle}</h2>
          <p className="text-muted-foreground">{t.errorMessage}</p>
        </CardContent>
      </Card>
    )
  }

  // ─── Success ────────────────────────────────────────────────────────────────
  if (pageState === 'success') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          <h2 className="text-2xl font-semibold">{t.successTitle}</h2>
          <p className="text-muted-foreground max-w-sm">{t.successMessage}</p>
        </CardContent>
      </Card>
    )
  }

  // ─── Form ───────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit}>
      {/* Header with property info + language toggle */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          {logoUrl && (
            <div className="flex justify-center mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo"
                className="h-16 max-w-[200px] object-contain"
              />
            </div>
          )}
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{t.title}</CardTitle>
              <CardDescription className="mt-1">{t.subtitle}</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLocale(l => l === 'de' ? 'en' : 'de')}
              className="shrink-0"
            >
              <Globe className="h-4 w-4 mr-1" />
              {locale === 'de' ? 'EN' : 'DE'}
            </Button>
          </div>
        </CardHeader>
        {property && booking && (
          <CardContent className="pt-0">
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">{t.propertyLabel}:</span>{' '}
                {property.name}
              </div>
              <div>
                <span className="font-medium text-foreground">{t.stayPeriod}:</span>{' '}
                {formatDate(booking.check_in)} – {formatDate(booking.check_out)}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Existing form notice */}
      {existingForm && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t.alreadySubmitted}
        </div>
      )}

      {/* Guest data form */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground mb-4">{t.legalNote}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* First name */}
            <div className="space-y-2">
              <Label htmlFor="firstname">
                {t.firstname} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstname"
                value={firstname}
                onChange={e => setFirstname(e.target.value)}
                required
              />
            </div>

            {/* Last name */}
            <div className="space-y-2">
              <Label htmlFor="lastname">
                {t.lastname} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastname"
                value={lastname}
                onChange={e => setLastname(e.target.value)}
                required
              />
            </div>

            {/* Birthdate */}
            <div className="space-y-2">
              <Label htmlFor="birthdate">{t.birthdate}</Label>
              <Input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={e => setBirthdate(e.target.value)}
              />
            </div>

            {/* Nationality */}
            <div className="space-y-2">
              <Label htmlFor="nationality">
                {t.nationality} <span className="text-destructive">*</span>
              </Label>
              <Select value={nationality} onValueChange={setNationality} required>
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'de' ? 'Bitte wählen...' : 'Please select...'} />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{locale === 'de' ? c.de : c.en}</SelectItem>
                  ))}
                  <SelectItem disabled value="__sep1__">───────────</SelectItem>
                  {OTHER_COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{locale === 'de' ? c.de : c.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Street */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="street">
                {t.street} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="street"
                value={street}
                onChange={e => setStreet(e.target.value)}
                required
              />
            </div>

            {/* ZIP */}
            <div className="space-y-2">
              <Label htmlFor="zip">{t.zip} <span className="text-destructive">*</span></Label>
              <Input
                id="zip"
                value={zip}
                onChange={e => setZip(e.target.value)}
                required
              />
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="city">{t.city} <span className="text-destructive">*</span></Label>
              <Input
                id="city"
                value={city}
                onChange={e => setCity(e.target.value)}
                required
              />
            </div>

            {/* Country */}
            <div className="space-y-2">
              <Label htmlFor="country">{t.country} <span className="text-destructive">*</span></Label>
              <Select value={country} onValueChange={setCountry} required>
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'de' ? 'Bitte wählen...' : 'Please select...'} />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{locale === 'de' ? c.de : c.en}</SelectItem>
                  ))}
                  <SelectItem disabled value="__sep2__">───────────</SelectItem>
                  {OTHER_COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{locale === 'de' ? c.de : c.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ID scan required for non-German guests */}
            {nationality && nationality !== 'DE' && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="idScan">
                  {locale === 'de' ? 'Ausweiskopie / Reisepass' : 'ID / Passport scan'} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="idScan"
                  type="file"
                  accept="image/*,.pdf"
                  required
                  onChange={e => setIdScanFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  {locale === 'de'
                    ? 'Foto oder Scan Ihres Ausweises / Reisepasses (Bild oder PDF).'
                    : 'Photo or scan of your ID / passport (image or PDF).'}
                </p>
              </div>
            )}

            {/* Trip purpose */}
            <div className="space-y-2">
              <Label>{t.tripPurpose}</Label>
              <Select value={tripPurpose} onValueChange={setTripPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leisure">{t.leisure}</SelectItem>
                  <SelectItem value="business">{t.business}</SelectItem>
                  <SelectItem value="unknown">–</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Co-travellers */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.coTravellers}</CardTitle>
        </CardHeader>
        <CardContent>
          {coTravellers.map((ct, i) => (
            <div key={i} className="mb-4">
              {i > 0 && <Separator className="mb-4" />}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t.firstname}</Label>
                  <Input
                    value={ct.firstname}
                    onChange={e => updateCoTraveller(i, 'firstname', e.target.value)}
                    placeholder={t.firstname}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.lastname}</Label>
                  <Input
                    value={ct.lastname}
                    onChange={e => updateCoTraveller(i, 'lastname', e.target.value)}
                    placeholder={t.lastname}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.birthdate}</Label>
                  <Input
                    type="date"
                    value={ct.birthdate ?? ''}
                    onChange={e => updateCoTraveller(i, 'birthdate', e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCoTraveller(i)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    {t.removeCoTraveller}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addCoTraveller}>
            <Plus className="h-4 w-4 mr-1" />
            {t.addCoTraveller}
          </Button>
        </CardContent>
      </Card>

      {/* Submit */}
      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {t.submitting}
          </>
        ) : (
          t.submit
        )}
      </Button>
    </form>
  )
}

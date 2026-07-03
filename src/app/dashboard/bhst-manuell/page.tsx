'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Loader2, Download, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

type Rhythm = 'monthly' | 'quarterly' | 'half-yearly'
type FormType = 'anmeldung' | 'berichtigt'

const STORAGE_KEY = 'bhst-manuell-operator'

type StoredOperator = {
  operatorName: string
  operatorStreet: string
  operatorZip: string
  operatorCity: string
  kassenzeichen: string
}

export default function BhStManuellPage() {
  const currentYear = new Date().getFullYear()

  const [operatorName, setOperatorName] = useState('')
  const [operatorStreet, setOperatorStreet] = useState('')
  const [operatorZip, setOperatorZip] = useState('')
  const [operatorCity, setOperatorCity] = useState('')
  const [kassenzeichen, setKassenzeichen] = useState('')

  // Betreiber-Daten aus LocalStorage laden (nur einmal beim Mount)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const stored = JSON.parse(raw) as StoredOperator
      if (stored.operatorName) setOperatorName(stored.operatorName)
      if (stored.operatorStreet) setOperatorStreet(stored.operatorStreet)
      if (stored.operatorZip) setOperatorZip(stored.operatorZip)
      if (stored.operatorCity) setOperatorCity(stored.operatorCity)
      if (stored.kassenzeichen) setKassenzeichen(stored.kassenzeichen)
    } catch {
      // ignore
    }
  }, [])

  // Betreiber-Daten bei jeder Aenderung speichern
  useEffect(() => {
    try {
      const payload: StoredOperator = { operatorName, operatorStreet, operatorZip, operatorCity, kassenzeichen }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore
    }
  }, [operatorName, operatorStreet, operatorZip, operatorCity, kassenzeichen])

  const [year, setYear] = useState(currentYear)
  const [rhythm, setRhythm] = useState<Rhythm>('monthly')
  const [period, setPeriod] = useState(1)
  const [type, setType] = useState<FormType>('anmeldung')

  const [totalNights, setTotalNights] = useState(0)
  const [airbnbNights, setAirbnbNights] = useState(0)
  const [remainingNights, setRemainingNights] = useState(0)
  const [revenueD, setRevenueD] = useState(0)
  const [exemptRevenueE, setExemptRevenueE] = useState(0)
  const [taxableRevenueF, setTaxableRevenueF] = useState(0)
  const [taxAmountG, setTaxAmountG] = useState(0)

  const [generating, setGenerating] = useState(false)

  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

  const periodOptions =
    rhythm === 'monthly' ? monthNames.map((n, i) => ({ value: i + 1, label: n }))
    : rhythm === 'quarterly' ? [1, 2, 3, 4].map(q => ({ value: q, label: `${q}. Quartal` }))
    : [1, 2].map(h => ({ value: h, label: `${h}. Halbjahr` }))

  async function handleGenerate() {
    if (!operatorName || !operatorStreet || !operatorZip || !operatorCity) {
      toast.error('Bitte alle Betreiber-Felder ausfüllen')
      return
    }
    setGenerating(true)
    try {
      const body = {
        city: 'dresden' as const,
        year,
        rhythm,
        period,
        type,
        operatorName,
        operatorStreet,
        operatorZip,
        operatorCity,
        kassenzeichen: kassenzeichen || undefined,
        totalNights,
        airbnbNights,
        remainingNights,
        revenueD,
        exemptRevenueE,
        taxableRevenueF,
        taxAmountG,
      }
      const res = await fetch('/api/bhst-vordrucke/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        toast.error(`PDF-Generierung fehlgeschlagen: ${err.error ?? res.statusText}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const periodLabel =
        rhythm === 'monthly' ? monthNames[period - 1].slice(0, 3)
        : rhythm === 'quarterly' ? `Q${period}`
        : `H${period}`
      a.download = `BhSt_Dresden_${year}_${periodLabel}_manuell.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('PDF erzeugt')
    } catch (e) {
      toast.error(`Fehler: ${e instanceof Error ? e.message : 'Unbekannt'}`)
    } finally {
      setGenerating(false)
    }
  }

  function resetValues() {
    setTotalNights(0)
    setAirbnbNights(0)
    setRemainingNights(0)
    setRevenueD(0)
    setExemptRevenueE(0)
    setTaxableRevenueF(0)
    setTaxAmountG(0)
    toast.success('Werte zurückgesetzt (Betreiber bleibt)')
  }

  function nextPeriod() {
    const maxPeriod = rhythm === 'monthly' ? 12 : rhythm === 'quarterly' ? 4 : 2
    if (period < maxPeriod) {
      setPeriod(period + 1)
    } else {
      setPeriod(1)
      setYear(year + 1)
    }
    resetValues()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Beherbergungssteuer-Meldung (Dresden) — manuell</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alle Werte manuell eintragen, dann PDF erzeugen. Nützlich für Wohnungen,
          die nicht in str-dash gepflegt sind (z.B. externe Managements).
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Betreiber</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name / Firma</Label>
            <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Straße und Hausnummer</Label>
            <Input value={operatorStreet} onChange={(e) => setOperatorStreet(e.target.value)} placeholder="Musterstraße 12" />
            <p className="text-[11px] text-muted-foreground">
              Straße und Hausnummer werden automatisch getrennt (Hausnummer am Ende).
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>PLZ</Label>
              <Input value={operatorZip} onChange={(e) => setOperatorZip(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Ort</Label>
              <Input value={operatorCity} onChange={(e) => setOperatorCity(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Kassenzeichen (optional)</Label>
            <Input value={kassenzeichen} onChange={(e) => setKassenzeichen(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Meldung</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Art</Label>
              <Select value={type} onValueChange={(v) => setType(v as FormType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anmeldung">Anmeldung</SelectItem>
                  <SelectItem value="berichtigt">Berichtigte Anmeldung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Jahr</Label>
              <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || currentYear)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rhythmus</Label>
              <Select value={rhythm} onValueChange={(v) => { setRhythm(v as Rhythm); setPeriod(1) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monatlich</SelectItem>
                  <SelectItem value="quarterly">Quartalsweise</SelectItem>
                  <SelectItem value="half-yearly">Halbjährlich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Zeitraum</Label>
              <Select value={String(period)} onValueChange={(v) => setPeriod(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periodOptions.map(opt => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Übernachtungen & Umsätze</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Übernachtungen</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Insgesamt</Label>
                <Input type="number" value={totalNights} onFocus={(e) => e.target.select()} onChange={(e) => setTotalNights(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Airbnb</Label>
                <Input type="number" value={airbnbNights} onFocus={(e) => e.target.select()} onChange={(e) => setAirbnbNights(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Verbleibend</Label>
                <Input type="number" value={remainingNights} onFocus={(e) => e.target.select()} onChange={(e) => setRemainingNights(parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-xs text-muted-foreground mb-2">Umsätze (EUR)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Umsätze verbleibende Übernachtungen (D)</Label>
                <Input type="number" step="0.01" value={revenueD} onFocus={(e) => e.target.select()} onChange={(e) => setRevenueD(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Befreite Umsätze (E)</Label>
                <Input type="number" step="0.01" value={exemptRevenueE} onFocus={(e) => e.target.select()} onChange={(e) => setExemptRevenueE(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Verbleibende steuerpflichtige Umsätze (F)</Label>
                <Input type="number" step="0.01" value={taxableRevenueF} onFocus={(e) => e.target.select()} onChange={(e) => setTaxableRevenueF(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Eingezogene Beherbergungssteuer (G)</Label>
                <Input type="number" step="0.01" value={taxAmountG} onFocus={(e) => e.target.select()} onChange={(e) => setTaxAmountG(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button className="flex-1" onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          PDF erzeugen
        </Button>
        <Button variant="outline" onClick={resetValues} disabled={generating}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Nur Werte zurücksetzen
        </Button>
        <Button variant="secondary" onClick={nextPeriod} disabled={generating}>
          Nächster Zeitraum →
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-4">
        Betreiber-Daten werden lokal im Browser gespeichert und bleiben beim Reload erhalten.
        „Nächster Zeitraum" erhöht den Monat/Quartal automatisch und leert nur die Werte.
      </p>
    </div>
  )
}

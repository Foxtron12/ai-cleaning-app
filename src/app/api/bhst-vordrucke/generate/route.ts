import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { z } from 'zod'
import { PDFDocument, PDFTextField, rgb, StandardFonts, TextAlignment } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'

// ─── Zod schemas ─────────────────────────────────────────────────────────────

// Optional per-property operator override (falls BhSt unter anderem Namen läuft)
const operatorOverrideSchema = z.object({
  operatorName: z.string().optional(),
  operatorStreet: z.string().optional(),
  operatorZip: z.string().optional(),
  operatorCity: z.string().optional(),
  kassenzeichen: z.string().optional(),
})

const dresdenSchema = operatorOverrideSchema.extend({
  city: z.literal('dresden'),
  year: z.number().int().min(2020).max(2099),
  rhythm: z.enum(['monthly', 'quarterly', 'half-yearly']),
  period: z.number().int().min(1).max(12),
  type: z.enum(['anmeldung', 'berichtigt']),
  // Tax data (pre-calculated by frontend)
  totalNights: z.number().int().min(0),
  airbnbNights: z.number().int().min(0),
  remainingNights: z.number().int().min(0),
  revenueD: z.number().min(0), // Umsätze verbleibende Übernachtungen
  exemptRevenueE: z.number().min(0), // steuerbefreite Umsätze
  taxableRevenueF: z.number().min(0), // steuerpflichtige Umsätze
  taxAmountG: z.number().min(0), // eingezogene Beherbergungssteuer
})

const chemnitzSchema = operatorOverrideSchema.extend({
  city: z.literal('chemnitz'),
  year: z.number().int().min(2020).max(2099),
  // Array of months (1-12) selected
  months: z.array(z.number().int().min(1).max(12)).min(1),
  type: z.enum(['anmeldung', 'korrektur']),
  // Property data for Zeilen 6-8
  propertyName: z.string().default(''),
  propertyStreet: z.string().default(''),
  propertyZipCity: z.string().default(''),
  // Tax data (pre-calculated by frontend)
  nights: z.number().int().min(0),       // Zeile 9
  revenue: z.number().min(0),             // Zeile 10
  exemptRevenue: z.number().min(0),       // Zeile 11
  taxableRevenue: z.number().min(0),      // Zeile 12
  fivePercent: z.number().min(0),         // Zeile 13
  actualTax: z.number().min(0),           // Zeile 14
})

const requestSchema = z.discriminatedUnion('city', [dresdenSchema, chemnitzSchema])

// Both Dresden and Chemnitz use PDF form fields directly (no coordinate maps needed)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEuro(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const y = date.getFullYear()
  return `${d}.${m}.${y}`
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const data = parsed.data

  // Cross-validate period against rhythm (BUG-4 fix)
  if (data.city === 'dresden') {
    const maxPeriod = { monthly: 12, quarterly: 4, 'half-yearly': 2 }[data.rhythm]
    if (data.period < 1 || data.period > maxPeriod) {
      return NextResponse.json(
        { error: `Ungültiger Zeitraum: ${data.period} für Rhythmus "${data.rhythm}" (max: ${maxPeriod})` },
        { status: 400 }
      )
    }
  }

  // Load settings for landlord data
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (settingsError || !settings) {
    return NextResponse.json(
      { error: 'Einstellungen nicht gefunden. Bitte zuerst Einstellungen anlegen.' },
      { status: 404 }
    )
  }

  try {
    // Load template PDF
    const templateName = data.city === 'dresden' ? 'bhst-dresden.pdf' : 'bhst-chemnitz.pdf'
    const templatePath = path.join(process.cwd(), 'public', 'forms', templateName)
    const templateBytes = await fs.readFile(templatePath)
    const pdfDoc = await PDFDocument.load(templateBytes)

    const black = rgb(0, 0, 0)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    // Ensure all text fields have a /DA entry (some PDF editors don't set it)
    const form0 = pdfDoc.getForm()
    for (const f of form0.getFields()) {
      if (f instanceof PDFTextField && !f.acroField.getDefaultAppearance()) {
        f.acroField.setDefaultAppearance('/Helv 10 Tf 0 g')
      }
    }

    const today = formatDate(new Date())

    // Helper: draw diagonal cross inside a checkbox field's rectangle
    function drawCross(page: ReturnType<typeof pdfDoc.getPage>, fieldRect: { x: number; y: number; width: number; height: number }) {
      const pad = 1.5
      page.drawLine({
        start: { x: fieldRect.x + pad, y: fieldRect.y + pad },
        end: { x: fieldRect.x + fieldRect.width - pad, y: fieldRect.y + fieldRect.height - pad },
        thickness: 1.2, color: black,
      })
      page.drawLine({
        start: { x: fieldRect.x + pad, y: fieldRect.y + fieldRect.height - pad },
        end: { x: fieldRect.x + fieldRect.width - pad, y: fieldRect.y + pad },
        thickness: 1.2, color: black,
      })
    }

    // Resolve operator data: property-level override → global settings fallback
    const operator = {
      name: data.operatorName || settings.landlord_name || '',
      street: data.operatorStreet || settings.landlord_street || '',
      zip: data.operatorZip || settings.landlord_zip || '',
      city: data.operatorCity || settings.landlord_city || '',
    }

    if (data.city === 'dresden') {
      // ── Dresden – fill form fields directly ──
      const form = pdfDoc.getForm()
      const page1 = pdfDoc.getPage(0)
      const fontSize = 10

      // Helper: set text on a field with consistent font + size
      function setField(name: string, value: string, size = fontSize) {
        const field = form.getTextField(name)
        field.setFontSize(size)
        field.setText(value)
      }

      // Helper: check a checkbox by drawing a diagonal cross and removing the field
      function checkBox(name: string, page: typeof page1) {
        const cb = form.getCheckBox(name)
        const rect = cb.acroField.getWidgets()[0].getRectangle()
        drawCross(page, rect)
        form.removeField(cb)
      }

      // Kassenzeichen (override → global fallback)
      const kassenzeichen = data.kassenzeichen || settings.kassenzeichen_dresden
      if (kassenzeichen) {
        setField('Kassenzeichen', kassenzeichen)
      }

      // Type checkbox
      if (data.type === 'anmeldung') {
        checkBox('Anmeldung', page1)
      } else {
        checkBox('Änderung einer bereits abgegebenen Anmeldung berichtigte Anmeldung', page1)
      }

      // Rhythm + period selection
      const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

      if (data.rhythm === 'monthly') {
        checkBox(monthNames[data.period - 1], page1)
      } else if (data.rhythm === 'quarterly') {
        checkBox(`${data.period} Quartal`, page1)
      } else if (data.rhythm === 'half-yearly') {
        checkBox(`${data.period} Halbjahr`, page1)
      }

      // Betreiber fields (Page 1) – uses resolved operator data
      // Split street into name + house number (e.g. "Musterstraße 12" → "Musterstraße", "12")
      const streetMatch = operator.street.match(/^(.+?)\s+(\d+\s*\w?)$/)
      setField('NameFirma', operator.name)
      setField('VornameFirmenzusatz', '') // bewusst leer
      setField('Straße', streetMatch ? streetMatch[1] : operator.street)
      setField('Hausnummer', streetMatch ? streetMatch[2] : '')
      setField('PLZ', operator.zip)
      setField('Ort', operator.city)
      // 'Telefon freiwillige Angabe' – bewusst leer gelassen

      // Page 2 – Tax values (right-aligned)
      function setFieldRight(name: string, value: string) {
        const field = form.getTextField(name)
        field.setFontSize(fontSize)
        field.setAlignment(TextAlignment.Right)
        field.setText(value)
      }

      setFieldRight('Anzahl entgeltlicher Übernachtungen insgesamt', String(data.totalNights))
      setFieldRight('Anzahl entgeltlicher Übernachtungen airbnb', String(data.airbnbNights))
      setFieldRight('Anzahl entgeltlicher Übernachtungen verbleibend', String(data.remainingNights))
      setFieldRight('umsätze aus verbleibenen übernachtungen', formatEuro(data.revenueD))
      setFieldRight('befreite umsätze', formatEuro(data.exemptRevenueE))
      setFieldRight('verbleibene steuerpflichtige umsätze', formatEuro(data.taxableRevenueF))
      setFieldRight('eingezogene Beherbergungssteuer', formatEuro(data.taxAmountG))

      // Datum (Page 2)
      setField('Datum eigenhändige Unterschrift des Betreibers oder eines Bevollmächtigten', today)

      // Update all field appearances with consistent font, then flatten
      form.updateFieldAppearances(font)
      form.flatten()

    } else {
      // ── Chemnitz – fill form fields directly ──
      const form = pdfDoc.getForm()
      const chPage = pdfDoc.getPage(0)
      const fontSize = 10

      // Helper: set text on a field with consistent font + size
      function setField(name: string, value: string, size = fontSize) {
        const field = form.getTextField(name)
        field.setFontSize(size)
        field.setText(value)
      }

      // Personenkonto (override → global fallback)
      const personenkonto = data.kassenzeichen || settings.personenkonto_chemnitz
      if (personenkonto) {
        setField('PK', personenkonto)
      }

      // Anmeldung / Korrektur (RadioGroup '1': widget 0 = Anmeldung, widget 1 = Korrektur)
      const radioGroup = form.getRadioGroup('1')
      const radioWidgets = radioGroup.acroField.getWidgets()
      const targetWidget = data.type === 'anmeldung' ? 0 : 1
      drawCross(chPage, radioWidgets[targetWidget].getRectangle())
      form.removeField(radioGroup)

      // Year
      setField('2', String(data.year))

      // Month checkboxes (fields '3' = Jan through '14' = Dec)
      // Draw crosses on selected months, then remove ALL month checkboxes to avoid flatten errors
      for (const month of data.months) {
        const fieldName = String(month + 2)
        const cb = form.getCheckBox(fieldName)
        const cbRect = cb.acroField.getWidgets()[0].getRectangle()
        drawCross(chPage, cbRect)
      }
      // Remove all 12 month checkbox fields (checked and unchecked)
      for (let m = 3; m <= 14; m++) {
        try { form.removeField(form.getCheckBox(String(m))) } catch { /* already removed */ }
      }

      // Betreiber Zeilen 1-5 – uses resolved operator data
      setField('B_1', operator.name)
      setField('B_2', data.operatorName ? '' : (settings.managing_director || ''))
      setField('B_3', operator.street)
      const plzOrt = [operator.zip, operator.city].filter(Boolean).join(' ')
      setField('B_4', plzOrt)
      // B_5 (Telefon/E-Mail) – freiwillige Angabe, explizit leeren
      setField('B_5', '')

      // Standort Zeilen 6-8
      setField('B_6', data.propertyName || '')
      setField('B_7', data.propertyStreet || '')
      setField('B_8', data.propertyZipCity || '')

      // Steuerermittlung Zeilen 9-14
      setField('B_9', String(data.nights))
      setField('B_10', formatEuro(data.revenue))
      setField('B_11', formatEuro(data.exemptRevenue))
      setField('B_12', formatEuro(data.taxableRevenue))
      setField('B_13', formatEuro(data.fivePercent))
      setField('B_14', formatEuro(data.actualTax))

      // Datum
      setField('Datum', today)

      // Update all field appearances with consistent font, then flatten
      form.updateFieldAppearances(font)
      form.flatten()
    }

    // Serialize PDF
    const pdfBytes = await pdfDoc.save()

    // Build filename
    let filename: string
    if (data.city === 'dresden') {
      const periodLabels: Record<string, string> = {
        monthly: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][data.period - 1],
        quarterly: `Q${data.period}`,
        'half-yearly': `H${data.period}`,
      }
      filename = `BhSt_Dresden_${data.year}_${periodLabels[data.rhythm]}.pdf`
    } else {
      const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
      const monthStr = data.months.map(m => monthNames[m - 1]).join('-')
      filename = `BhSt_Chemnitz_${data.year}_${monthStr}.pdf`
    }

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
      },
    })

  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PDF-Generierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}

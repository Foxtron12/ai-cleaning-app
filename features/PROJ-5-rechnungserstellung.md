                            wei# PROJ-5: Rechnungserstellung (PDF)

## Status: In Progress
**Created:** 2026-03-03
**Last Updated:** 2026-03-10

## Dependencies
- Requires: PROJ-1 (Dashboard-Übersicht) - Layout
- Requires: PROJ-2 (Buchungsmanagement) - Buchungsdaten als Quelle
- Optional-Later: PROJ-9 (Lexoffice-Integration) - optionaler Export in Buchhaltung

## Beschreibung
Erstellung rechtssicherer Rechnungen nach deutschen Vorschriften (§ 14 UStG) für jeden Gastaufenthalt. Rechnungen werden aus den Buchungsdaten automatisch vorausgefüllt, können angepasst werden und als PDF heruntergeladen werden. Wichtig: 7% USt. für Beherbergungsleistungen, 19% für Zusatzleistungen.

## User Stories
- Als Vermieter möchte ich für jede abgeschlossene Buchung automatisch eine Rechnung erstellen können, damit ich meiner Rechnungsstellungspflicht nachkomme.
- Als Vermieter möchte ich eine fortlaufende Rechnungsnummer, die automatisch vergeben wird (RE-2024-001, RE-2024-002, ...), damit ich GoBD-konform bin.
- Als Vermieter möchte ich Rechnungspositionen anpassen können (Übernachtungskosten, Endreinigung, Touristen-/Beherbergungssteuer als separate Positionen), damit die Rechnung korrekt ist.
- Als Vermieter möchte ich die fertige Rechnung als PDF herunterladen, damit ich sie dem Gast schicken und in meiner Buchhaltung ablegen kann.
- Als Vermieter möchte ich alle Rechnungen in einem Rechnungsarchiv einsehen, damit ich den Überblick behalte.

## Acceptance Criteria

### Rechnungspflichtangaben (§ 14 UStG)
- [ ] Vollständiger Name und Anschrift des Vermieters (Leistungserbringer)
- [ ] Vollständiger Name und Anschrift des Gastes (Leistungsempfänger)
- [ ] Steuernummer oder USt-IdNr. des Vermieters
- [ ] Ausstellungsdatum der Rechnung
- [ ] Eindeutige, fortlaufende Rechnungsnummer
- [ ] Menge und Art der Leistung (z.B. "5 Übernachtungen in [Unterkunftsname]")
- [ ] Zeitraum der Leistung (Leistungsdatum = Aufenthaltszeitraum)
- [ ] Nettobetrag, USt-Satz, USt-Betrag, Bruttobetrag
- [ ] Hinweis bei Kleinunternehmerregelung (§ 19 UStG): konfigurierbar

### Funktionale Anforderungen
- [ ] Rechnungsformular wird aus Buchungsdaten vorausgefüllt (Gastname, Adresse, Zeitraum, Betrag)
- [ ] Rechnungspositionen als editierbare Zeilen:
  - Beherbergungsleistung (7% USt.)
  - Endreinigung (19% USt.)
  - Beherbergungssteuer (ggf. als durchlaufender Posten oder Hinweis)
  - Sonstige Positionen (manuell hinzufügbar)
- [ ] Automatische USt-Berechnung je Position
- [ ] Rechnungsnummer wird automatisch vergeben, kann aber manuell überschrieben werden
- [ ] PDF-Generierung: professionelles Layout mit Vermieter-Briefkopf und Logo
- [ ] Rechnungsarchiv: Liste mit Nummer, Gastname, Datum, Betrag, Status
- [ ] Status pro Rechnung: "Entwurf", "Erstellt", "Bezahlt" (manuell setzbar)
- [ ] Rechnungen können nicht gelöscht werden (GoBD: unveränderliche Buchführung) – nur Stornorechnung möglich

### Konfiguration (einmalig)
- [ ] Vermieter-Stammdaten: Name, Adresse, Telefon, E-Mail, Website
- [ ] Steuerliche Daten: Steuernummer, USt-IdNr. (optional), Finanzamt
- [ ] Kleinunternehmerregelung ja/nein
- [ ] Bankverbindung (IBAN, BIC) für Zahlungsinfos auf Rechnung
- [ ] Logo-Upload
- [ ] Standard-Zahlungsziel (z.B. 14 Tage)

## USt-Regelung für Ferienwohnungen
- **Beherbergungsleistung:** 7% USt. (§ 12 Abs. 2 Nr. 11 UStG) – gilt für Übernachtungen
- **Endreinigung:** 19% USt. (Regelsteuersatz)
- **Frühstück:** 7% USt. (falls angeboten)
- **Parkplatz, Extras:** 19% USt.
- **Kleinunternehmer (§ 19 UStG):** Keine USt. auf Rechnung, Pflichthinweis

## Edge Cases
- Direktbuchungen ohne vollständige Gastadresse: Pflichtfelder müssen manuell ausgefüllt werden
- Stornierungen: Stornorechnung mit Bezug auf Original-Rechnungsnummer
- Ausländische Gäste ohne deutsche Adresse: Adressfeld ist freitext
- Kleinunternehmerregelung: andere Rechnung ohne USt-Ausweis
- Rechnungsnummer-Lücken: Warnung wenn nicht fortlaufend (GoBD-Anforderung)
- Mehrere Buchungen für denselben Gast: separate Rechnungen pro Buchung

---

## Tech Design (Solution Architect) – Update 2026-03-10

> Basis-Architektur: siehe PROJ-1 (Gesamtarchitektur, Datenmodell, Datenfluss)

### Änderungen gegenüber Ursprungsdesign

#### A) Auto-Generierung bei vollständigen Buchungsdaten

**Vorbild:** PROJ-4 (Meldescheine) – identisches Pattern.

**Logik:** Sobald eine Buchung die Mindest-Pflichtfelder enthält, wird automatisch ein `invoices`-Eintrag als Draft erstellt (kein PDF, nur DB-Record mit berechneten Positionen).

**Mindest-Pflichtfelder für Auto-Generierung:**
- `guest_firstname` + `guest_lastname`
- `check_in` + `check_out`
- `amount_gross` > 0

Weitere Felder (Gastadresse, Nationalität) werden gespeichert sofern vorhanden, sind aber nicht Voraussetzung.

**Trigger-Zeitpunkte:**
1. Nach Smoobu-Sync (`/api/smoobu/sync`)
2. Beim Laden der Rechnungen-Seite (für bereits existierende Buchungen)

**Neues API-Endpoint:** `POST /api/rechnungen/auto-generate`
- Liest alle Buchungen aus `bookings` (inkl. `properties`)
- Vergleicht mit existierenden `invoices` (per `booking_id`)
- Erstellt fehlende Einträge für Buchungen mit ausreichenden Daten
- Berechnet Line Items serverseitig (Beherbergung, Reinigung, Beherbergungssteuer)
- Status der auto-generierten Rechnungen: `draft`
- Rechnungsnummer wird automatisch vergeben, `settings.invoice_next_number` inkrementiert
- Gibt Anzahl neu erstellter Rechnungen zurück

#### B) PDF-Generierung on-demand (Lazy Generation)

**PDF wird erst beim Klick auf "Download" erzeugt.**
- Liest alle benötigten Daten aus dem gespeicherten `invoices`-Record (landlord_snapshot, guest_snapshot, line_items, Totals)
- Keine erneute Berechnung oder Buchungs-Abfrage nötig
- Keine PDFs werden serverseitig gespeichert
- Generierung clientseitig via `@react-pdf/renderer`

#### C) Manueller Dialog bleibt erhalten

Für Direktbuchungen ohne vollständige Daten oder Sonderfälle:
- "Neue Rechnung"-Button öffnet Dialog zum manuellen Erstellen
- Dialog-Button wird zu "Speichern" (ohne direkten PDF-Download)
- PDF-Download erfolgt dann über die Archiv-Tabelle

### Komponenten-Baum (aktualisiert)
```
Rechnungen-Seite
├── Auto-Generierung beim Seitenload (ruft /api/rechnungen/auto-generate)
│   └── Toast: "X neue Rechnungsentwürfe automatisch erstellt"
├── "Neue Rechnung"-Button (manuell, für Direktbuchungen ohne vollständige Daten)
├── Rechnungsarchiv-Tabelle (shadcn Table)
│   ├── Spalten: Nummer | Gast | Datum | Betrag | Status | Aktionen
│   └── Zeilen-Aktionen:
│       ├── PDF herunterladen (generiert on-demand aus gespeicherten Daten)
│       ├── Status ändern (Entwurf → Erstellt → Bezahlt)
│       └── Stornorechnung (bei GoBD-konformen Korrekturen)
└── Rechnungsformular (shadcn Dialog – nur für manuelle Erstellung/Bearbeitung)
    ├── Buchungs-Auswahl (Dropdown)
    ├── Gastdaten (vorausgefüllt, editierbar)
    ├── Positionen-Tabelle (editierbar)
    └── "Speichern"-Button [KEIN direkter PDF-Download mehr]
```

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `src/app/dashboard/rechnungen/page.tsx` | Auto-Gen beim Load aufrufen, Download-Button mit on-demand PDF, Dialog-Button nur noch "Speichern" |
| `src/app/api/rechnungen/auto-generate/route.ts` | Neues Endpoint: Auto-Generate-Logik |
| `src/app/api/smoobu/sync/route.ts` | Auto-Gen nach Sync aufrufen (wie bei Meldescheinen) |

### Datenquelle
- Liest Buchungsdaten aus `bookings`-Tabelle (inkl. `properties` für Beherbergungssteuer)
- Liest Vermieter-Stammdaten + Steuer-Config aus `settings`-Tabelle
- Liest Beherbergungssteuer-Regeln aus `city_tax_rules`-Tabelle
- Speichert Rechnungen in `invoices`-Tabelle (Supabase)
- Rechnungsnummer: auto-increment aus `settings.invoice_next_number`
- line_items als JSONB-Feld (flexibel, beliebig viele Positionen)
- PDF via `@react-pdf/renderer` mit Vorlage in `src/lib/pdf/invoice.tsx`
- Rechnungen sind unveränderlich nach Finalisierung (GoBD) → nur Status-Updates erlaubt

---

## Tech Design: PDF-Layout Redesign (2026-03-11)

> Rechnungspositionen bleiben zusammengefasst. Nur das PDF-Layout und zusätzliche Felder ändern sich.
> Referenz: Beispielrechnung "Invoice-DE_LF_DGW-LF-DGW-2507001.pdf"

### Neues PDF-Layout

```
┌─────────────────────────────────────────────────┐
│                                     [LOGO]      │
│                                                  │
│ [Empfänger-Adresse]    Rechnungsnr.: LF-DGW-... │
│ (Gast oder Firma)      Datum: 22.07.2025        │
│                        Anreise: 18.07.2025      │
│                        Abreise: 21.07.2025      │
│                        Gast: Melanie Klott      │
│                        Reservierung: UAZWYLBY-1 │
│                        Anzahl der Gäste: 1      │
│                                                  │
│ Rechnung                                         │
│ "für Ihren Aufenthalt erlauben wir uns..."      │
│                                                  │
│ Leistung                             Betrag     │
│ ─────────────────────────────────────────────    │
│ 3x Übernachtung Tiny House           274.00 EUR │
│ Endreinigung                           65.00 EUR │
│                                                  │
│ Zwischensumme (inkl. MwSt.)          339.00 EUR │
│ Zahlung (Airbnb)                     339.00 EUR │
│ Offener Saldo                          0.00 EUR │
│                                                  │
│ Steuersatz    MwSt.     Netto       Gesamt      │
│ 7%           22.18    316.82       339.00       │
│                                                  │
│ [Dankestext + Website]                          │
│                                                  │
│ ─────────────────────────────────────────────    │
│ [Firma+Adresse] [HRB+GF+USt-ID] [Bank+IBAN]   │
└─────────────────────────────────────────────────┘
```

### Layout-Änderungen (Alt → Neu)

| Bereich | Aktuell | Neu |
|---------|---------|-----|
| Header | Vermieter-Einzeiler oben | Empfänger links, Meta rechts |
| Logo | Nicht vorhanden | Oben rechts (aus Settings, Upload) |
| Meta rechts | Rechnungsnr., Datum, Leistungszeitraum | + Anreise, Abreise, Gast, Reservierung, Gästeanzahl |
| Titel | "Rechnung RE-2024-001" | Nur "Rechnung" |
| Positionen-Tabelle | 6 Spalten (Beschr., Menge, EP, USt, USt-Betrag, Gesamt) | 2 Spalten (Leistung, Betrag) |
| Zahlungseingang | Nicht vorhanden | "Zahlung (Airbnb) 339.00 EUR" |
| Offener Saldo | Nicht vorhanden | "Offener Saldo 0.00 EUR" |
| Steuer-Zusammenfassung | Inline bei Totals | Eigene 4-spaltige Tabelle (Steuersatz, MwSt., Netto, Gesamt) |
| Zahlungsinfo | Grauer Kasten mit Freitext | Entfällt (nur noch in Footer) |
| Footer | 1-zeilig | 3 Spalten: Firma+Adresse \| HRB+GF+USt-ID \| Bank+IBAN+BIC |

### Neue Datenfelder im PDF-Interface

| Feld | Quelle | Beschreibung |
|------|--------|-------------|
| `checkIn` / `checkOut` | `bookings.check_in` / `check_out` | Anreise/Abreise-Datum |
| `bookingReference` | `bookings.smoobu_reservation_id` | Reservierungscode |
| `guestCount` | `bookings.guests` | Anzahl der Gäste |
| `paymentChannel` | `bookings.channel` | Airbnb / Booking.com / Direkt / leer |
| `amountPaid` | Auto-berechnet | Bei OTA-Buchungen = Gesamtbetrag |
| `logoUrl` | `settings.logo_url` | Vermieter-Logo (Upload) |
| `companyRegister` | `settings.company_register` | Handelsregistereintrag (z.B. HRB43938) |
| `managingDirector` | `settings.managing_director` | Geschäftsführer |
| `thankYouText` | `settings.invoice_thank_you_text` | Dankestext am PDF-Ende |
| `websiteUrl` | `settings.website` | Bereits vorhanden |

### Auto-Zahlung bei OTA-Buchungen

Buchungen über OTA-Kanäle (Airbnb, Booking.com, etc.) werden automatisch als bezahlt markiert:
- Zahlungskanal wird aus `bookings.channel` erkannt
- `amount_paid` = `total_gross` (Vollzahlung)
- Offener Saldo = 0.00 EUR
- Nur bei Direktbuchungen bleibt der Saldo offen (manuelle Zahlung nötig)

### Neue Settings-Felder (DB-Migration)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `company_register` | text, nullable | Handelsregistereintrag (z.B. "HRB43938") |
| `managing_director` | text, nullable | Geschäftsführer |
| `invoice_thank_you_text` | text, nullable | Dankestext am Rechnungsende |
| `logo_url` | text, nullable | Pfad zum hochgeladenen Logo (Supabase Storage) |

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/lib/pdf/invoice.tsx` | **Komplett-Redesign**: 2-Spalten-Tabelle, neuer Footer, Logo, Zahlungseingang, Steuer-Tabelle |
| `src/app/dashboard/rechnungen/page.tsx` | PDF-Daten um neue Felder ergänzen |
| `src/app/api/rechnungen/auto-generate/route.ts` | Zahlungskanal + amountPaid aus Buchung befüllen |
| Settings-Seite | Neue Eingabefelder: HRB, Geschäftsführer, Dankestext, Logo-Upload |
| Supabase Migration | 4 neue Spalten in `settings`-Tabelle |

### Keine Änderung nötig bei
- Rechnungspositionen / Line Items Datenmodell (bleibt zusammengefasst)
- USt-Berechnung (7% / 19% Logik bleibt)
- Auto-Generierung Trigger (nur Snapshot um neue Felder erweitern)
- Rechnungsarchiv-Tabelle im UI

## QA Test Results

### QA Round 1 (2026-03-13) -- City Tax Overcharge on Direct Booking Invoices

**QA Date:** 2026-03-13
**Scope:** Targeted investigation of city tax (Beherbergungssteuer) calculation for direct bookings in invoice generation. User-reported issue: 800 EUR brutto (750 Unterkunft + 50 Reinigung) produces 51 EUR city tax instead of the correct 48 EUR (6% of 800).

**Root Cause Analysis:** Two interacting bugs cause the city tax to be calculated on an inflated base amount.

---

#### BUG-10 (HIGH): `createReservation` does not send `cleaningFee` to Smoobu API

- **Severity:** High
- **Priority:** High
- **Description:** When creating a direct booking via the wizard, the `createReservation` call to Smoobu sends `price: totalPrice` (accommodation + cleaning combined = 800) but does NOT include the `cleaningFee` parameter in the request body. The `cleaningFee` param exists in the TypeScript function signature (`src/lib/smoobu.ts` line 190) but is never included in the `body` object (lines 197-216). As a result, Smoobu stores the booking with no cleaning fee information.
- **Impact:** When the next Smoobu sync runs (`/api/smoobu/sync`), `mapSmoobuReservation` reads `reservation['cleaning-fee']` from Smoobu (which is 0 since it was never sent) and overwrites `booking.cleaning_fee` to 0 in the local database. This destroys the cleaning fee data for direct bookings.
- **File:** `src/lib/smoobu.ts` lines 197-216 (body object in `createReservation`)
- **Steps to reproduce:**
  1. Create a direct booking via wizard with accommodation 750 EUR, cleaning 50 EUR
  2. Booking is saved with `amount_gross = 800`, `cleaning_fee = 50`
  3. Run Smoobu sync
  4. Check booking record in DB: `cleaning_fee` is now 0

---

#### BUG-11 (HIGH): City tax `gross_percentage` model double-counts cleaning fee after sync

- **Severity:** High
- **Priority:** High (Critical for invoice correctness)
- **Description:** In `calculateAccommodationTax` (`src/lib/calculators/accommodation-tax.ts` lines 131-144), the `gross_percentage` model uses this logic to determine if cleaning is already in the gross:
  ```
  const cleaningInGross = (booking.cleaning_fee ?? 0) > 0 || booking.channel === 'Airbnb'
  taxableAmount = cleaningInGross ? gross : gross + cleaningFee
  ```
  For direct bookings after Smoobu sync, `booking.cleaning_fee = 0` (due to BUG-10) and `booking.channel = 'Direct'` (not Airbnb). So `cleaningInGross = false`, and the calculator adds the default cleaning fee (50) ON TOP of `amount_gross` (800, which already includes cleaning). This results in `taxableAmount = 850` instead of the correct 800.
- **Calculation trace:**
  - `gross = booking.amount_gross = 800` (already includes 750 accommodation + 50 cleaning)
  - `cleaningFee = getCleaningFee(booking, defaultFee)` = 50 (falls back to default since `booking.cleaning_fee = 0`)
  - `cleaningInGross = (0 > 0) || ('Direct' === 'Airbnb')` = false
  - `taxableAmount = 800 + 50 = 850`
  - `taxAmount = 850 * 6% = 51` (WRONG, should be 48)
- **Steps to reproduce:**
  1. Configure a property in Dresden with 6% gross_percentage Beherbergungssteuer
  2. Create a direct booking: 750 EUR accommodation, 50 EUR cleaning
  3. Run Smoobu sync (cleaning_fee gets overwritten to 0)
  4. Go to Rechnungen page or trigger auto-generate invoices
  5. City tax shows 51 EUR instead of 48 EUR
- **Expected:** City tax = 800 * 6% = 48 EUR
- **Actual:** City tax = 850 * 6% = 51 EUR
- **Files affected:**
  - `src/lib/calculators/accommodation-tax.ts` lines 131-144 (tax calculation)
  - `src/lib/auto-generate-invoices.ts` (consumes the wrong tax amount)
  - `src/app/dashboard/rechnungen/page.tsx` `fillFromBooking()` (consumes the wrong tax amount)
  - `src/components/dashboard/booking-detail-sheet.tsx` (displays the wrong tax amount)
  - `src/app/dashboard/steuer/page.tsx` (displays the wrong tax amount)
  - `src/app/dashboard/reporting/page.tsx` (displays the wrong tax amount)

---

#### Fix Recommendations (for developer)

**Fix for BUG-10 (preferred primary fix):**
In `src/lib/smoobu.ts` `createReservation`, add `'cleaning-fee': params.cleaningFee ?? 0` to the request body so Smoobu stores the cleaning fee correctly. This prevents the sync from overwriting `cleaning_fee` to 0.

Additionally, in `src/app/api/smoobu/sync/route.ts`, protect direct bookings (channel_id = 0) from having their `cleaning_fee` overwritten to 0 during sync if the existing DB value is > 0.

**Fix for BUG-11 (defense-in-depth):**
The `cleaningInGross` heuristic in `calculateAccommodationTax` is fragile. For direct bookings (channel = 'Direct'), cleaning is ALWAYS included in `amount_gross` (see `create/route.ts` line 83: `totalPrice = accommodationPrice + cleaningFee`). Add `booking.channel === 'Direct'` to the `cleaningInGross` condition:
```
const cleaningInGross = (booking.cleaning_fee ?? 0) > 0 || booking.channel === 'Airbnb' || booking.channel === 'Direct'
```

---

#### Summary

| # | Severity | Description | Priority | Status |
|---|----------|-------------|----------|--------|
| BUG-10 | High | `createReservation` does not send cleaningFee to Smoobu; sync overwrites it to 0 | High | NEW |
| BUG-11 | High | City tax gross_percentage double-counts cleaning fee for direct bookings after sync | High | NEW |

**Total bugs found:** 2 (both High severity)
**Acceptance criteria tested:** City tax calculation for direct bookings -- FAIL
**Production-ready decision:** NOT READY -- both bugs must be fixed. Every direct booking invoice is affected.

---

**Next steps:** The developer needs to fix BUG-10 and BUG-11 before deployment. After fixes, run `/qa` again to verify the city tax calculation produces the correct amount (48 EUR for 800 EUR brutto at 6%).

---

### QA Round 2 (2026-03-15) -- MwSt-Berechnung falsch (Rundungsfehler durch Unit-Price-Rounding)

**QA Date:** 2026-03-15
**Scope:** User-reported bug: 1500 EUR Bruttobetrag zeigt Umsatzsteuer 7% von 98,24 EUR statt korrekt 98,13 EUR.

**Root Cause Analysis:** The VAT (MwSt) calculation uses a per-unit rounding approach that introduces cumulative rounding errors. Instead of computing VAT directly from the total gross amount, the code first divides gross by number of nights, rounds the per-night net price to 2 decimal places, then multiplies back and derives VAT as the balancing difference. This "round-then-multiply" pattern amplifies rounding errors proportional to the number of nights.

---

#### BUG-12 (HIGH): VAT calculated incorrectly via per-unit-price rounding ("round-then-multiply" error)

- **Severity:** High
- **Priority:** High (every invoice is affected)
- **Description:** The `fillFromBooking()` function in `rechnungen/page.tsx` (lines 276-278) and the `auto-generate-invoices.ts` (lines 167-169) calculate accommodation VAT using this flawed approach:
  ```
  accomUnitPrice = round(accommodationPerNight / 1.07)    // round per-night NET
  accomVat = round(accomTotal - nights * accomUnitPrice)   // VAT = gross - (nights * rounded net)
  ```
  The per-night net price is rounded to 2 decimal places BEFORE multiplication by the number of nights. This means the total net (`nights * accomUnitPrice`) can deviate from the true net (`accomTotal / 1.07`) by up to `0.005 * nights` EUR, and consequently the VAT amount is wrong by the same margin.

  **Correct formula** (already used in `create-booking-wizard.tsx` lines 277-278):
  ```
  vat7Net = round(totalGross / 1.07)           // compute net from TOTAL gross
  vat7Amount = round(totalGross - vat7Net)      // VAT = gross - net (no per-unit rounding)
  ```

- **Calculation example (user-reported):**
  - Bruttobetrag: 1500 EUR, USt-Satz: 7%
  - Correct: VAT = 1500 - round(1500 / 1.07) = 1500 - 1401.87 = **98.13 EUR**
  - Bug produces: **98.24 EUR** (11 cents too high, depending on nights/cleaning split)

- **Files affected (all need the same fix):**
  1. `src/app/dashboard/rechnungen/page.tsx` -- `fillFromBooking()` lines 276-278 (accommodation) and lines 290-292 (cleaning)
  2. `src/app/dashboard/rechnungen/page.tsx` -- `createSplitInvoices()` lines 419-421 (accommodation) and lines 430-432 (cleaning)
  3. `src/lib/auto-generate-invoices.ts` -- lines 167-169 (accommodation) and lines 181-183 (cleaning)
  4. `src/app/dashboard/rechnungen/page.tsx` -- `updateLineItem()` line 520 uses a different formula (`net * rate/100`) which is also inconsistent but less wrong for single-quantity items

- **Steps to reproduce:**
  1. Have a booking with gross amount 1500 EUR and any number of nights > 1
  2. Go to Rechnungen page, create or auto-generate an invoice for this booking
  3. Check the MwSt-Aufschluesselung table in the PDF
  4. VAT amount deviates from the mathematically correct value (gross * 7/107)

- **Expected:** USt 7% = 98.13 EUR (for 1500 EUR gross)
- **Actual:** USt 7% = 98.24 EUR (or similar wrong value depending on nights)

---

#### BUG-12 Fix Recommendation (for developer)

The fix should compute VAT from the TOTAL gross amount per line item, not from rounded per-unit prices. The per-unit net price should be calculated AFTER determining the correct total VAT, or alternatively the VAT should be computed directly as `gross - round(gross / 1.07)`.

**Pattern to follow** (already correct in `create-booking-wizard.tsx`):
```typescript
// For accommodation (total gross = accomTotal, e.g. 1450 EUR):
const accomNet = Math.round((accomTotal / 1.07) * 100) / 100
const accomVat = Math.round((accomTotal - accomNet) * 100) / 100
const accomUnitPrice = Math.round((accomNet / nights) * 100) / 100
// NOTE: nights * accomUnitPrice may not equal accomNet exactly (display rounding),
// but the VAT is correct because it was computed from the total, not from units.

// For cleaning (total gross = cleaningFee, e.g. 50 EUR):
const cleanNet = Math.round((cleaningFee / 1.07) * 100) / 100
const cleanVat = Math.round((cleaningFee - cleanNet) * 100) / 100
```

Apply this pattern in all three locations listed above. Also ensure `updateLineItem()` (line 520) uses consistent logic: for multi-quantity items, compute `totalGross = quantity * unitPriceGross`, then `vatAmount = totalGross - round(totalGross / (1 + rate/100))`.

---

#### Summary (Round 2)

| # | Severity | Description | Priority | Status |
|---|----------|-------------|----------|--------|
| BUG-12 | High | VAT calculated incorrectly via per-unit-price rounding in 3 code locations | High | NEW |

**Total bugs found this round:** 1 (High severity)
**Acceptance criteria tested:** "Automatische USt-Berechnung je Position" -- FAIL
**Production-ready decision:** NOT READY -- BUG-12 must be fixed. Every invoice with multi-night stays is affected.

---

**Next steps:** The developer needs to fix BUG-12 in all three affected files. The correct pattern already exists in `create-booking-wizard.tsx` (lines 277-278) and should be replicated. After fixes, run `/qa` again to verify VAT calculation produces the correct amounts.

### QA Round 3 (2026-03-15) -- Netto-Betrag in MwSt-Tabelle falsch (Rundungsfehler durch quantity * rounded unit_price)

**QA Date:** 2026-03-15
**Scope:** User-reported bug: 800 EUR Brutto-Buchung zeigt Nettobetrag 747,65 EUR statt korrekt 747,66 EUR (800 / 1.07 = 747.6635... -> gerundet 747.66).

**Root Cause Analysis:** BUG-12 was partially fixed -- the VAT amount per line item is now correctly derived from the total gross (not per-unit). However, the MwSt summary table (Steuersatz / MwSt / Netto / Gesamt) still recalculates the net amount by multiplying `quantity * unit_price` (rounded per-night net). This re-introduces the same class of rounding error that BUG-12 described, but now specifically in the net column of the tax summary.

---

#### BUG-13 (HIGH): MwSt summary net amount computed from quantity * rounded unit_price instead of (total - vat_amount)

- **Severity:** High
- **Priority:** High (every multi-night invoice is affected)
- **Description:** After the BUG-12 fix, the line item VAT (`vat_amount`) and gross (`total`) are now correct. But the MwSt-Aufschluesselung (tax summary table) still derives the net amount by summing `quantity * unit_price` across line items. Since `unit_price` is the rounded per-night net price, multiplying it back by the number of nights does NOT recover the correct total net.

  The correct net for a line item is simply `total - vat_amount` (both of which are already correctly stored). Alternatively, a dedicated `net_total` field could be stored per line item.

- **Concrete calculation trace (user-reported, 800 EUR, 4 nights, 50 EUR cleaning):**
  - accommodationGross = 800 - 50 = 750
  - accomNetTotal = round(750 / 1.07 * 100) / 100 = 700.93
  - accomUnitPrice = round(700.93 / 4 * 100) / 100 = round(17523.25) / 100 = 175.23
  - accomVat = round(750 - 700.93) = 49.07 (CORRECT)
  - cleanUnitPrice = round(50 / 1.07 * 100) / 100 = 46.73
  - cleanVat = round(50 - 46.73) = 3.27 (CORRECT)
  - **MwSt summary net (current, WRONG):** 4 * 175.23 + 1 * 46.73 = 700.92 + 46.73 = **747.65**
  - **MwSt summary net (correct):** (750 - 49.07) + (50 - 3.27) = 700.93 + 46.73 = **747.66**
  - Alternatively: round(800 / 1.07 * 100) / 100 = **747.66**

- **Files affected (all compute net from quantity * unit_price):**
  1. `src/lib/auto-generate-invoices.ts` line 217 -- `vat7Net = SUM(quantity * unit_price)` used to store `vat_7_net` in the DB
  2. `src/app/dashboard/rechnungen/page.tsx` line 547 -- `vat7Net = SUM(quantity * unitPrice)` used when saving invoices manually
  3. `src/lib/pdf/invoice.tsx` line 256 -- `netForItem = quantity * unitPrice` used when rendering the PDF tax summary table

- **Steps to reproduce:**
  1. Have a booking with gross amount 800 EUR, 4 nights, cleaning fee 50 EUR
  2. Go to Rechnungen page, create or auto-generate an invoice
  3. Download the PDF
  4. Check the MwSt-Aufschluesselung table: Netto column shows 747.65 instead of 747.66
  5. The difference is 1 cent, but it violates the mathematical identity: Netto = Brutto / 1.07

- **Expected:** Netto 7% = 747.66 EUR (i.e. 800 / 1.07 rounded to 2 decimals)
- **Actual:** Netto 7% = 747.65 EUR

---

#### BUG-13 Fix Recommendation (for developer)

The net amount in the tax summary should be derived from the line item data that is already correct, NOT recalculated from rounded unit prices. Three options (in order of preference):

**Option A (simplest, recommended):** Change the net calculation in all three locations from `quantity * unit_price` to `total - vat_amount`:
```typescript
// Instead of:
const netForItem = item.quantity * item.unit_price   // WRONG: uses rounded unit price
// Use:
const netForItem = item.total - item.vat_amount      // CORRECT: both values are already correctly computed
```

Apply in:
- `src/lib/auto-generate-invoices.ts` line 217: `vat7Items.reduce((s, i) => s + (i.total - i.vat_amount), 0)`
- `src/app/dashboard/rechnungen/page.tsx` line 547: `vat7Items.reduce((s, i) => s + (i.total - i.vatAmount), 0)`
- `src/lib/pdf/invoice.tsx` line 256: `const netForItem = item.total - item.vatAmount`

**Option B:** Store a `net_total` field per line item (more explicit, but requires schema change).

**Option C:** Do NOT round `unit_price` at all -- store it with full precision. This makes the display less clean but eliminates all rounding issues.

Option A is the cleanest fix because `total` and `vat_amount` are already correctly computed from the gross total (the BUG-12 fix ensured this). Deriving net from them preserves the identity: net = gross - vat.

---

#### Summary (Round 3)

| # | Severity | Description | Priority | Status |
|---|----------|-------------|----------|--------|
| BUG-13 | High | MwSt summary net computed from quantity * rounded unit_price; should use (total - vat_amount) | High | NEW |

**Total bugs found this round:** 1 (High severity)
**Acceptance criteria tested:** "Nettobetrag, USt-Satz, USt-Betrag, Bruttobetrag" -- FAIL
**Production-ready decision:** NOT READY -- BUG-13 must be fixed. Every multi-night invoice shows incorrect net in the MwSt table.

---

**Next steps:** The developer needs to fix BUG-13 in all three affected files by changing the net calculation from `quantity * unit_price` to `total - vat_amount`. After fixes, run `/qa` again to verify the Netto column shows 747.66 for an 800 EUR booking.

## Deployment
_To be added by /deploy_

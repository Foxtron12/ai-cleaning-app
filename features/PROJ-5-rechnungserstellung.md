# PROJ-5: Rechnungserstellung (PDF)

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

## Deployment
_To be added by /deploy_

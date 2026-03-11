# PROJ-6: Beherbergungssteuer-Tracking

## Status: In Review
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: PROJ-1 (Dashboard-Übersicht) - Layout
- Requires: PROJ-2 (Buchungsmanagement) - Buchungsdaten
- Requires: PROJ-3 (Financial Reporting) - Reporting-Struktur

## Beschreibung
Automatisches Tracking und Berechnung der Beherbergungssteuer (Übernachtungssteuer, Kurtaxe, City Tax) basierend auf den Buchungsdaten. Erstellt monatliche/quartalsweise Berichte für die Steuermeldung beim Finanzamt/der Kommune. Berücksichtigt Ausnahmen (Geschäftsreisende, Kinder unter 18 Jahren).

## Hintergrund: Beherbergungssteuer in Deutschland
- Wird von Städten und Gemeinden individuell erhoben (keine bundesweite Regelung)
- Verschiedene Berechnungsmodelle je Stadt:
  - **Prozentual auf Nettopreis:** % des Netto-Übernachtungspreises (z.B. Berlin 5%, Hamburg 5%)
  - **Prozentual auf Bruttopreis:** % des Bruttopreises inkl. Nebenleistungen (z.B. Dresden 6% inkl. Reinigung)
  - **Pauschalbetrag:** Fester Betrag pro Person pro Nacht (z.B. München verschiedene Gemeinden)
  - **Kurtaxe:** Fester Betrag pro Person pro Nacht (Urlaubsregionen)
- **Ausnahmen:** Geschäftsreisende (mit Arbeitgebernachweis), Kinder unter 18 Jahren
- **Meldepflicht:** Monatlich oder quartalsweise an die zuständige Behörde

## User Stories
- Als Vermieter möchte ich automatisch sehen, wie viel Beherbergungssteuer ich pro Monat eingenommen habe, damit ich die Beträge korrekt abführen kann.
- Als Vermieter möchte ich pro Buchung sehen, ob Beherbergungssteuer anfällt und wie viel, damit ich transparent bin.
- Als Vermieter möchte ich Buchungen als "geschäftlich" markieren können, damit diese aus der Beherbergungssteuer-Berechnung ausgenommen werden.
- Als Vermieter möchte ich einen Monats-/Quartalsbericht für das Finanzamt exportieren, damit ich meine Meldepflicht erfüllen kann.
- Als Vermieter möchte ich meinen stadtspezifischen Steuersatz einmalig konfigurieren, damit alle Berechnungen automatisch korrekt sind.

## Acceptance Criteria

### Konfiguration
- [ ] Steuermodell-Auswahl: "Prozentual auf Nettopreis", "Prozentual auf Bruttopreis (inkl. Nebenleistungen)" oder "Pauschalbetrag pro Person pro Nacht"
- [ ] Steuersatz-Konfiguration (Prozentzahl oder EUR-Betrag)
- [ ] Berechnungsgrundlage konfigurierbar: nur Übernachtung netto, oder Brutto inkl. Reinigung/Nebenleistungen (stadtabhängig)
- [ ] Stadtname/Gemeinde als Label
- [ ] Freier Betrag bis zu dem keine Steuer anfällt (falls vorhanden)
- [ ] Altersgrenze für Kinder-Ausnahme (Standard: unter 18 Jahre)

### Buchungsebene
- [ ] Pro Buchung: Beherbergungssteuer-Betrag berechnet und angezeigt
- [ ] Markierung "Geschäftsreise" per Checkbox → schließt Buchung aus Steuerberechnung aus
- [ ] Hinweis wenn Reisezweck unbekannt (Pflicht: Vermieter muss erfragen)
- [ ] Anzahl steuerpflichtige Erwachsene und Kinder (unter 18) separat

### Reporting
- [ ] Monatliche Übersicht: Anzahl steuerpflichtige Nächte, Steuerbetrag gesamt
- [ ] Quartalsbericht-Export als PDF (für Steuermeldung)
- [ ] Jahresübersicht: Beherbergungssteuer-Gesamtsumme
- [ ] Auflistung aller steuerrelevanten Buchungen im Zeitraum
- [ ] Separate Ausweisung von steuerbefreiten Buchungen (Geschäftsreisen, Kinder)

### Report-Format für Steuermeldung
- [ ] Gemeinde/Stadtverwaltung als Empfänger konfigurierbar
- [ ] Meldezeitraum
- [ ] Anzahl Übernachtungen gesamt
- [ ] Anzahl steuerbefreite Übernachtungen (mit Grund)
- [ ] Anzahl steuerpflichtige Übernachtungen
- [ ] Steuerbetrag gesamt

## Beherbergungssteuer-Sätze (Referenz, konfigurierbar)
| Stadt | Modell | Satz | Berechnungsgrundlage |
|-------|--------|------|---------------------|
| Dresden | Prozentual | 6% | **Bruttopreis inkl. Reinigungsleistung** |
| Berlin | Prozentual | 5% | Nettomietpreis |
| Hamburg | Prozentual | 5% | Entgelt |
| Köln | Prozentual | 5% | Entgelt |
| Freiburg | Prozentual | 5% | Entgelt |
| Dortmund | Prozentual | ~4% | Entgelt |
| München (Gemeinden) | Kurtaxe | variiert | je Gemeinde |
| Usedom, Rügen, etc. | Kurtaxe | variiert | je Gemeinde |

## Edge Cases
- Gemischte Reise (geschäftlich + privat): nur privater Anteil ist steuerpflichtig
- Buchung über mehrere Monate: Steuer wird dem Check-in-Monat zugeordnet
- Nachträgliche Änderung des Reisezwecks: Neuberechnung der Steuer
- Stadtspezifische Sonderregeln (z.B. Hamburg: Tourismustaxe mit anderen Ausnahmen)
- Kinder: Altersnachweis vom Gast erforderlich – Feld für Geburtstage der Kinder

---

## Tech Design (Solution Architect)

> Basis-Architektur: siehe PROJ-1 (Gesamtarchitektur, Datenmodell, Datenfluss)

### Erweiterung: OTA-Steuerübernahme (Airbnb/Booking.com/FeWo-direkt)

#### Kernkonzept
Manche OTAs (z.B. Airbnb in Dresden) führen die Beherbergungssteuer direkt an die Stadt ab.
In diesen Fällen muss der Vermieter die Steuer für diese Buchungen NICHT in seiner Steuermeldung aufführen.
In allen anderen Städten/Kanälen liegt die Abführungspflicht beim Vermieter.

Jede Buchung wird klassifiziert als:
- **Selbst abzuführen** → Vermieter ist verantwortlich → zählt zur Steuermeldung
- **Von OTA abgeführt** → OTA hat es bereits gezahlt → nur informativ angezeigt

#### Datenmodell-Änderung

Neue Spalte in `properties`-Tabelle:
```
ota_remits_tax: text[] (Standard: leer / '{}')
```
- Array von OTA-Channel-Namen, die die Steuer direkt abführen
- Beispiel Dresden: `['Airbnb']`
- Beispiel andere Stadt: `[]` (leer = Vermieter führt alles selbst ab)
- Matching: Case-insensitive Vergleich mit `bookings.channel`

Unterstützte OTAs (Checkbox-Liste): Airbnb, Booking.com, FeWo-direkt/Vrbo

#### Komponenten-Baum
```
properties/page.tsx → Steuer-Konfiguration
├── [bestehend] Steuer aktiviert (Toggle)
├── [bestehend] Stadt / Modell / Satz
└── [NEU] "OTA führt Steuer direkt ab:" (Checkbox-Liste)
    ├── [ ] Airbnb
    ├── [ ] Booking.com
    └── [ ] FeWo-direkt / Vrbo
    (nur sichtbar wenn Steuer aktiviert)

Steuer-Seite (/dashboard/steuer)
├── Konfigurations-Banner (falls Stadt/Satz nicht eingerichtet)
├── Zeitraum-Auswahl (Monat / Quartal / Jahr)
├── Steuer-KPIs (4x Card)
│   ├── Selbst abzuführen (EUR) ← Hauptwert für Steuermeldung
│   ├── Von OTA abgeführt (EUR) ← informativ
│   ├── Steuerbefreite Nächte (Geschäftsreisen)
│   └── Gesamt-Steueraufkommen (EUR)
├── Monats-Aufschlüsselung (shadcn Table)
│   └── Pro Buchung: Gast, Nächte, Betrag, Steuer, Badge "OTA zahlt" wenn remittedByOta
└── "Steuermeldung exportieren"-Button (PDF)
```

#### Berechnungslogik
- Modell/Satz: wie bisher (stadtspezifisch konfiguriert)
- Calculator: `src/lib/calculators/accommodation-tax.ts`
- **Neu:** TaxResult bekommt Feld `remittedByOta: boolean`
  - `true` wenn: `property.ota_remits_tax` den Channel der Buchung enthält (case-insensitive)
  - `false` sonst (Standard)
- Steuerbetrag wird IMMER berechnet (Informationswert), nur die Klassifizierung ändert sich

#### Auswirkungen auf andere Seiten

**Steuer-Report PDF:**
- Nur "selbst abzuführen"-Buchungen im Report-Body
- Fußnote: "X Buchungen über [OTA] (EUR Y) wurden direkt vom Portal an die Stadt abgeführt."

**Rechnungen (/dashboard/rechnungen):**
- Wenn `remittedByOta = true`: Kein Steuer-Posten auf der Rechnung
- Stattdessen Hinweis: "Beherbergungssteuer wird durch [OTA-Name] erhoben"
- Wenn `remittedByOta = false`: Steuer-Zeile wie bisher

**Reporting (/dashboard/reporting):**
- Steuer-Beträge aufgeschlüsselt nach "selbst abzuführen" vs. "von OTA abgeführt"

#### Betroffene Dateien

| Datei | Änderung |
|---|---|
| Supabase Migration | `ALTER TABLE properties ADD COLUMN ota_remits_tax text[] DEFAULT '{}'` |
| `src/lib/database.types.ts` | Neues Feld `ota_remits_tax: string[] \| null` |
| `src/lib/calculators/accommodation-tax.ts` | Neues Feld `remittedByOta` im TaxResult |
| `src/app/dashboard/properties/page.tsx` | Checkbox-Liste unter Steuer-Konfiguration |
| `src/app/dashboard/steuer/page.tsx` | 4 KPI-Cards, OTA-Badge, PDF-Fußnote |
| `src/app/dashboard/rechnungen/page.tsx` | Steuer-Zeile conditional |
| `src/app/dashboard/reporting/page.tsx` | Aufschlüsselung selbst/OTA |

#### Tech-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| `text[]` statt `boolean` | Flexibel für mehrere OTAs, erweiterbar ohne Migration |
| Per-Unterkunft (nicht automatisch pro Stadt) | Städte können OTA-Vereinbarungen ändern; manuelle Kontrolle vermeidet Überraschungen |
| Betrag weiterhin berechnen | Informationswert bleibt erhalten, kein Datenverlust |
| Default: leer (= Vermieter zahlt alles) | Sicherer Default – lieber zu viel melden als zu wenig |
| Checkbox-Liste (nicht Toggles) | Kompakter, skaliert besser bei weiteren OTAs |

## QA Test Results

### QA Round 1 (2026-03-10) -- City Tax Rules + Toggle + Nullable Config

**QA Date:** 2026-03-10
**Scope:** Code review of: city-tax-rules.ts, properties/page.tsx toggle+autocomplete, accommodation-tax.ts nullable config, steuer/page.tsx and reporting/page.tsx null handling.
**Result:** 5 bugs found (0 Critical, 0 High, 2 Medium, 3 Low/Info). See archive below.

<details>
<summary>Round 1 Details (click to expand)</summary>

#### 1. Build & Lint

| Check | Result |
|-------|--------|
| `npm run build` | PASS |
| `npm run lint` | BLOCKED - Next.js 16 framework issue |

#### 2. Bugs Found

| # | Severity | Description | File | Priority |
|---|----------|-------------|------|----------|
| BUG-1 | Minor | `findCityTaxRule` partial match could return wrong city for ambiguous substrings | city-tax-rules.ts | Low |
| BUG-2 | Minor | Rate display shows "%" suffix for per_person_per_night (EUR) and tiered (0) models | steuer/page.tsx | Medium |
| BUG-3 | Info | `NO_TAX_RESULT` exported but never used | accommodation-tax.ts | Low |
| BUG-4 | Info | `npm run lint` broken on Next.js 16 | package.json | Low |
| BUG-5 | Minor | Tag input onBlur discards unsaved tag text (pre-existing) | properties/page.tsx | Low |

</details>

---

### QA Round 2 (2026-03-11) -- OTA Remittance Update

**QA Date:** 2026-03-11
**Scope:** OTA-Steueruebernahme feature: `ota_remits_tax` field on properties, `remittedByOta` in TaxResult, OTA checkbox UI, steuer/rechnungen/reporting/buchungen/booking-detail-sheet integration, CSV export updates.

**Changed Files:**
- `src/lib/calculators/accommodation-tax.ts` -- new `remittedByOta` field + `isRemittedByOta` helper
- `src/lib/database.types.ts` -- `ota_remits_tax: string[] | null` on properties
- `src/app/dashboard/properties/page.tsx` -- OTA checkbox-list UI
- `src/app/dashboard/steuer/page.tsx` -- 4 KPI cards, OTA badge, summary refactor
- `src/app/dashboard/buchungen/page.tsx` -- pass `otaRemitsTax` to calculator
- `src/app/dashboard/rechnungen/page.tsx` -- pass `otaRemitsTax` to calculator
- `src/app/dashboard/reporting/page.tsx` -- pass `otaRemitsTax` to calculator
- `src/components/dashboard/booking-detail-sheet.tsx` -- pass `otaRemitsTax` to calculator
- `src/lib/auto-generate-invoices.ts` -- pass `otaRemitsTax` to calculator

---

#### 1. Build

| Check | Result |
|-------|--------|
| `npm run build` | PASS - Compiled successfully, all 33 routes generated, no TypeScript errors |

---

#### 2. Acceptance Criteria from Tech Design

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| AC-1 | `ota_remits_tax: text[]` added to properties type | PASS | `database.types.ts` line 436: `ota_remits_tax: string[] \| null` in Row, Insert, Update |
| AC-2 | Checkbox-list for Airbnb, Booking.com, FeWo-direkt on properties page | PASS | `OTA_OPTIONS` constant with 3 entries, rendered as Checkbox components, only visible when `tax_enabled` |
| AC-3 | OTA checkboxes hidden when tax toggle is off | PASS | Gated by `form.tax_enabled` conditional block |
| AC-4 | Toggle off clears `ota_remits_tax` to `[]` | PASS | `handleTaxToggle` sets `ota_remits_tax: []` when disabled |
| AC-5 | Save persists `ota_remits_tax` to DB | PASS | `saveProperty` includes `ota_remits_tax` in update payload |
| AC-6 | `TaxResult.remittedByOta: boolean` field added | PASS | Interface updated, all constructors include the field |
| AC-7 | `TaxResult.remittedByOtaName?: string` field added | PASS | Set by `isRemittedByOta` helper when match found |
| AC-8 | `isRemittedByOta` matches channel case-insensitively | PASS | Uses `.toLowerCase()` on both sides and `.includes()` |
| AC-9 | Tax still calculated when OTA remits (informational) | PASS | `remittedByOta` is set AFTER tax calculation, amount preserved |
| AC-10 | Old Airbnb hardcoded exemption removed | PASS | Diff shows removal of `if (booking.channel === 'Airbnb')` block |
| AC-11 | Steuer page: 4 KPI cards (Selbst abzufuehren, Von OTA, Steuerbefreit, Gesamt) | PASS | 4 Card components with correct labels and values |
| AC-12 | Steuer page: OTA badge on remitted bookings in table | PASS | `tax.remittedByOta` shows rose badge with OTA name |
| AC-13 | Steuer page: Business checkbox hidden for OTA-remitted bookings | PASS | `!tax.remittedByOta &&` gates the Checkbox render |
| AC-14 | Steuer page: Footer row shows `selfRemitTax` (not total) | PASS | Footer uses `totalSummary.selfRemitTax` |
| AC-15 | CSV export includes OTA breakdown in summary | PASS | Summary section has "GESAMT selbst abzufuehren", "GESAMT von OTA abgefuehrt", "GESAMT Steueraufkommen" |
| AC-16 | All 6 callers pass `otaRemitsTax` to `calculateAccommodationTax` | PASS | Verified: buchungen, rechnungen, reporting, steuer, booking-detail-sheet, auto-generate-invoices |
| AC-17 | `computeSummary` uses `remittedByOta` instead of Airbnb string match | PASS | Filters by `d.tax.remittedByOta` instead of `d.tax.exemptReason === 'Airbnb fuehrt ab'` |
| AC-18 | `SinglePropertySummary` shows OTA line (line 2) | PASS | Shows "abzgl. von OTA abgefuehrt" with nights and EUR |
| AC-19 | `CompactSummary` shows 4 columns matching KPI cards | PASS | Selbst abzufuehren, Von OTA, Steuerbefreit, Gesamt |
| AC-20 | `formatRate` helper handles per_person and per_room models | PASS | Returns `X.XX EUR` for flat models, `X%` for percentage |
| AC-21 | City header uses `formatRate` instead of raw `%` | PASS | Line 462: `formatRate(cityGroup.config)` |

**Acceptance Criteria: 21/21 PASS**

---

#### 3. Bug Analysis

##### BUG-6 (HIGH): Rechnungen page does not suppress tax line for OTA-remitted bookings

- **Severity:** High
- **Priority:** High
- **Description:** The spec states: "Wenn `remittedByOta = true`: Kein Steuer-Posten auf der Rechnung. Stattdessen Hinweis: 'Beherbergungssteuer wird durch [OTA-Name] erhoben'." However, `rechnungen/page.tsx` `fillFromBooking()` does NOT check `taxResult.remittedByOta`. It unconditionally adds the Beherbergungssteuer line item if `cityTax > 0`. The same issue exists in `auto-generate-invoices.ts` line 157: it adds the tax line if `cityTax > 0` without checking `remittedByOta`.
- **Steps to reproduce:**
  1. Configure a property with Airbnb checked in "OTA fuehrt Steuer direkt ab"
  2. Have an Airbnb booking for that property
  3. Create or auto-generate an invoice for that booking
  4. The invoice will incorrectly include a Beherbergungssteuer line item
- **Expected:** No tax line item; instead a note "Beherbergungssteuer wird durch Airbnb erhoben"
- **Actual:** Tax line item is included, inflating the invoice total
- **Files affected:** `src/app/dashboard/rechnungen/page.tsx` (line 250-263), `src/lib/auto-generate-invoices.ts` (line 157-173)

##### BUG-7 (HIGH): Booking-detail-sheet does not reflect OTA remittance in label

- **Severity:** Medium
- **Priority:** Medium
- **Description:** The booking-detail-sheet shows `Beherbergungssteuer (Airbnb)` only when `taxResult?.exemptReason === 'Airbnb fuehrt ab'` (line 203). But this exemption reason no longer exists -- the Airbnb hardcoded exemption was removed. Now the label check is dead code. For OTA-remitted bookings, the label should instead check `taxResult?.remittedByOta` and show the OTA name. Currently it will just show "Beherbergungssteuer" with the full tax amount, with no indication that the OTA is paying it.
- **Steps to reproduce:** Open booking detail sheet for an Airbnb booking where Airbnb is configured to remit tax.
- **Expected:** Label should indicate "Beherbergungssteuer (von Airbnb abgefuehrt)" or similar
- **Actual:** Shows "Beherbergungssteuer" with no OTA indication
- **File:** `src/components/dashboard/booking-detail-sheet.tsx` (line 203)

##### BUG-8 (MEDIUM): Missing Supabase migration for `ota_remits_tax` column

- **Severity:** Medium
- **Priority:** High
- **Description:** The `database.types.ts` file includes `ota_remits_tax: string[] | null` on the properties table, but there is no corresponding SQL migration file (`ALTER TABLE properties ADD COLUMN ota_remits_tax text[] DEFAULT '{}'`). The spec explicitly lists this migration as required. Without it, the column does not exist in the production database and all saves/reads of this field will fail silently (Supabase ignores unknown columns in updates, but the read value will be missing).
- **Steps to reproduce:** Deploy the code without running the migration. Save OTA checkboxes on properties page. The value will not persist.
- **Expected:** A migration file exists and has been applied
- **Actual:** No migration file found (searched `*.sql` for `ota_remits_tax`)

##### BUG-9 (LOW): `saveProperty` does not update `ota_remits_tax` in local state

- **Severity:** Low
- **Priority:** Low
- **Description:** In `properties/page.tsx` `saveProperty()`, the local state update (lines 288-300) sets `accommodation_tax_city`, `accommodation_tax_model`, `accommodation_tax_rate`, and `tags`, but does NOT include `ota_remits_tax`. This means after saving, if the user navigates to steuer/page.tsx and the bookings query joins properties, the `ota_remits_tax` field on the property object in local state will still have the old value until a full page reload. However, since properties/page.tsx re-initializes forms from `properties` state on load, this mainly affects other pages that read the joined property data.
- **Steps to reproduce:** Save OTA checkboxes. Navigate to steuer page without reloading. The OTA filtering may not reflect the change.
- **Impact:** Low -- a page reload fixes it. The DB is correct.
- **File:** `src/app/dashboard/properties/page.tsx` (line 288-300)

##### Previous bugs from Round 1 still open:
- **BUG-2** (Medium): Rate display "%" for flat/tiered models -- NOW FIXED by `formatRate` helper. Status: **RESOLVED**.
- **BUG-1** (Low): `findCityTaxRule` partial match -- still present, unchanged.
- **BUG-3** (Info): `NO_TAX_RESULT` dead code -- still present, unchanged.
- **BUG-5** (Low): Tag input onBlur -- still present, unchanged.

---

#### 4. Security Audit (Red-Team)

| Check | Result | Notes |
|-------|--------|-------|
| `ota_remits_tax` saved via Supabase parameterized update | PASS | No injection vector; values are from a fixed constant list |
| OTA values are from `OTA_OPTIONS` constant, not freetext | PASS | Checkbox UI only allows predefined values |
| `isRemittedByOta` uses `.includes()` on channel string | INFO | Could match partial channel names (e.g., a channel named "AirbnbPlus" would match "Airbnb"). Acceptable given real-world channel names. |
| No cross-tenant data leakage in steuer page | PASS | Queries use Supabase client-side with RLS active |
| OTA checkboxes do not expose sensitive data | PASS | Only stores OTA names, no credentials |
| CSV export does not include sensitive fields | PASS | Only tax/booking data |
| `remittedByOtaName` renders in UI via React (no dangerouslySetInnerHTML) | PASS | No XSS risk |

---

#### 5. Regression Check

| Feature | Check | Result |
|---------|-------|--------|
| PROJ-2 Buchungen | XLSX export passes `otaRemitsTax` | PASS |
| PROJ-3 Reporting | `getBruttoWithoutCityTax` passes `otaRemitsTax` | PASS |
| PROJ-5 Rechnungen | `fillFromBooking` passes `otaRemitsTax` to calculator | PASS (but see BUG-6 for missing conditional) |
| PROJ-5 Auto-generate | Passes `otaRemitsTax` to calculator | PASS (but see BUG-6) |
| Steuer page | Business travel toggle still works | PASS |
| Steuer page | Tag filtering still works | PASS |
| Properties page | Tax toggle + city autocomplete still work | PASS |
| Build | No TypeScript errors | PASS |

---

#### 6. Summary of All Open Bugs

| # | Severity | Description | File | Priority | Status |
|---|----------|-------------|------|----------|--------|
| BUG-6 | High | Rechnungen/auto-generate do not suppress tax line for OTA-remitted bookings | rechnungen/page.tsx, auto-generate-invoices.ts | High | NEW |
| BUG-7 | Medium | Booking-detail-sheet label check for "Airbnb fuehrt ab" is dead code after refactor | booking-detail-sheet.tsx:203 | Medium | NEW |
| BUG-8 | Medium | Missing Supabase migration for `ota_remits_tax` column | (no file) | High | NEW |
| BUG-9 | Low | `saveProperty` does not update `ota_remits_tax` in local state after save | properties/page.tsx:288 | Low | NEW |
| BUG-1 | Minor | `findCityTaxRule` partial match ambiguity | city-tax-rules.ts | Low | Open |
| BUG-3 | Info | `NO_TAX_RESULT` exported but unused | accommodation-tax.ts | Low | Open |
| BUG-5 | Minor | Tag input onBlur discards text | properties/page.tsx | Low | Open |
| BUG-2 | Minor | Rate display assumed percentage model | steuer/page.tsx | Medium | RESOLVED (formatRate helper added) |

---

#### 7. Production-Ready Decision

**NOT READY** -- 1 High-severity bug (BUG-6: invoices include tax line for OTA-remitted bookings) and 1 Medium bug with High priority (BUG-8: missing DB migration) must be resolved before deployment.

**Required before deploy:**
1. **BUG-8:** Create and apply the Supabase migration: `ALTER TABLE properties ADD COLUMN ota_remits_tax text[] DEFAULT '{}'`
2. **BUG-6:** Add `remittedByOta` check in `rechnungen/page.tsx` `fillFromBooking()` and `auto-generate-invoices.ts` to either skip the tax line or add a note instead
3. **BUG-7:** Update booking-detail-sheet label to use `taxResult?.remittedByOta` instead of the removed exemptReason string

**Recommended (not blocking):**
4. BUG-9: Include `ota_remits_tax` in local state update after save

## Deployment
_To be added by /deploy_

# PROJ-6: Beherbergungssteuer-Tracking

## Status: Planned
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

#### Komponenten-Baum
```
Steuer-Seite
├── Konfigurations-Banner (falls Stadt/Satz nicht eingerichtet)
├── Zeitraum-Auswahl (Monat / Quartal / Jahr)
├── Steuer-KPIs (3x Card)
│   ├── Steuerpflichtige Nächte
│   ├── Steuerbefreite Nächte (Geschäftsreisen)
│   └── Steuerbetrag gesamt (EUR)
├── Monats-Aufschlüsselung (shadcn Table)
│   └── Pro Buchung: Gast, Nächte, Betrag, Steuer, Geschäftsreise-Checkbox
└── "Steuermeldung exportieren"-Button (PDF)
```

#### Berechnungslogik (Dresden-Default)
- Modell: Prozentual auf Bruttopreis inkl. Reinigungsleistung
- Satz: 6%
- Basis: (Übernachtungspreis + Reinigungsgebühr) × 6%
- Befreiung: Geschäftsreisende (trip_purpose = "business")
- Kinder unter 18: befreit (Altersgrenze konfigurierbar)
- Calculator: `src/lib/calculators/accommodation-tax.ts`

#### Datenquelle
- Liest Buchungen aus `bookings`-Tabelle (Supabase)
- Berechnung on-the-fly via Calculator (kein separates Steuer-Table)
- Steuer-Konfiguration aus `settings.accommodation_tax`
- PDF-Export via `@react-pdf/renderer` mit Vorlage `src/lib/pdf/tax-report.tsx`

## QA Test Results

**QA Date:** 2026-03-10
**Scope:** Code review of recent changes: city-tax-rules.ts, properties/page.tsx toggle+autocomplete, accommodation-tax.ts nullable config, steuer/page.tsx and reporting/page.tsx null handling.

---

### 1. Build & Lint

| Check | Result |
|-------|--------|
| `npm run build` | PASS - Compiled successfully, all pages generated, no TypeScript errors |
| `npm run lint` | BLOCKED - `next lint` fails with "Invalid project directory" on Next.js 16.1.6. Known framework issue, not a project bug. |

---

### 2. Code Quality: `src/lib/data/city-tax-rules.ts`

#### 2a. City Spot-Check (15 required cities)

| City | Present | Rate | Basis | Model | Correct |
|------|---------|------|-------|-------|---------|
| Aachen | Yes | 2.50 | P | per_person_per_night | PASS |
| Berlin | Yes | 7.5 | N | net_percentage | PASS |
| Dresden | Yes | 6 | B | gross_percentage | PASS |
| Hamburg | Yes | 0 (tiered) | S | tiered | PASS |
| Hannover | Yes | 0 (tiered) | S | tiered | PASS |
| Duesseldorf | Yes | 3.00 | P | per_person_per_night | PASS |
| Frankfurt am Main | Yes | 2.00 | P | per_person_per_night | PASS |
| Freiburg im Breisgau | Yes | 5 | N | net_percentage | PASS |
| Koeln | Yes | 5 | B | gross_percentage | PASS |
| Leipzig | Yes | 5 | B | gross_percentage | PASS |
| Potsdam | Yes | 7.5 | N | net_percentage | PASS |
| Schwerin | Yes | 7 | N | net_percentage | PASS |
| Huertgenwald | Yes | 0 (tiered) | S | tiered | PASS |
| Wiesbaden | Yes | 5.00 | P | per_person_per_night | PASS |
| Lutherstadt Wittenberg | Yes | 2.00 | P | per_person_per_night | PASS |

**Total cities: 79** -- claimed ~80, actual 79. Acceptable.

#### 2b. Tiered Cities Check

| City | Has tiers array | Tiers look correct |
|------|-----------------|-------------------|
| Hamburg | Yes (6 tiers) | PASS |
| Hannover | Yes (4 tiers) | PASS |
| Damp | Yes (3 tiers, last upTo: Infinity) | PASS |
| Gera | Yes (3 tiers) | PASS |
| Huertgenwald | Yes (7 tiers) | PASS |
| Kirchheim (Hessen) | Yes (3 tiers) | PASS |
| Lautertal (Odenwald) | Yes (3 tiers) | PASS |
| Raunheim | Yes (3 tiers) | PASS |
| Eisenach | Yes (1 tier, simplified) | PASS |

All 9 tiered cities have proper `tiers` arrays.

#### 2c. Helper Functions

| Function | Check | Result |
|----------|-------|--------|
| `findCityTaxRule` | Exact match first, then partial match fallback | PASS |
| `formatTaxRuleDescription` | Handles tiered, per_person, percentage models | PASS |
| `mapToDbTaxModel` | Maps tiered -> per_person_per_night for DB | PASS |
| `getCityNames` | Returns all city names | PASS |

#### 2d. Bug: `findCityTaxRule` partial match can return wrong city

- **Severity:** Minor
- **Priority:** Low
- **Description:** The `findCityTaxRule` function uses `.includes(lower)` for the fallback match. Searching for "Bonn" would first try exact match (finds "Bonn"). But searching for "Leer" would exact-match "Leer (Ostfriesland)" -- no, actually it would not because exact match compares the full lowercase string. Searching for "leer" would NOT exact-match "leer (ostfriesland)", then the `.includes` fallback would correctly find it. However, searching for "heim" would match the first of Heimbach, Kirchheim, Raunheim, etc. This is acceptable for autocomplete context since the CityCombobox uses its own filter, but the helper function used in `handleTaxToggle` for auto-filling from property city name could theoretically match the wrong city if the property city value is a substring of multiple city names.
- **Steps to reproduce:** Property has `city = "Heim"` (unlikely but possible) -> `findCityTaxRule("Heim")` returns Heimbach instead of no match.
- **Impact:** Very low -- property city names from Smoobu are full city names, not substrings.

---

### 3. Code Quality: `src/app/dashboard/properties/page.tsx`

| Check | Result | Notes |
|-------|--------|-------|
| Switch toggle controls visibility of tax fields | PASS | `form.tax_enabled` gates rendering of city/model/rate fields (line 430) |
| CityCombobox properly filters cities | PASS | Uses `useMemo` with lowercase includes filter |
| CityCombobox auto-fills model and rate on selection | PASS | `handleCitySelect` sets model (via `mapToDbTaxModel`) and rate from static rule |
| Save function clears tax fields when toggle is off | PASS | Lines 265-267: sets city/model/rate to `null` when `!form.tax_enabled` |
| Toggle on auto-fills from property city | PASS | `handleTaxToggle` calls `findCityTaxRule` on the property's city |
| Manual city entry falls back to DB rules | PASS | Line 241: checks `rulesByCity` for DB-stored rules |
| "Keine" hint text shown when toggle is off | PASS | Lines 482-486 |
| No unused imports | PASS | All imports are used |
| Click-outside to close dropdown | PASS | Event listener on `mousedown` |
| Allows manual city entry not in list | PASS | Button at bottom of dropdown for manual entry |

#### Bug: CityCombobox does not update the input display when a value is pre-selected

- **Severity:** Info
- **Priority:** Low
- **Description:** When `open` is false, the input shows `value` (the selected city name). When `open` is true, it shows `search`. On focus, `search` is set to `value`. This works correctly. No bug here after closer inspection.

#### Bug: `onBlur` on tag input closes it, but does not save the tag

- **Severity:** Minor (pre-existing, not part of this change)
- **Priority:** Low
- **Description:** In the tag input form (line 393-396), `onBlur` sets `showTagInput` to false without calling `addTag`. If the user types a tag name and clicks away, the tag is lost. The user must press Enter.
- **Impact:** Minor UX inconvenience, pre-existing behavior.

---

### 4. Code Quality: `src/lib/calculators/accommodation-tax.ts`

| Check | Result | Notes |
|-------|--------|-------|
| `getTaxConfigForProperty` returns null when both model and rate are null | PASS | Lines 49-51: `if (!property.accommodation_tax_model && !property.accommodation_tax_rate) return null` |
| `NO_TAX_RESULT` defined correctly | PASS | taxableAmount: 0, taxAmount: 0, isExempt: true, exemptReason set |
| Existing calculation logic unchanged | PASS | `calculateAccommodationTax` still takes non-null `TaxConfig` |
| All callers check for null before calling `calculateAccommodationTax` | PASS | Verified: booking-detail-sheet, buchungen, rechnungen, steuer, reporting all use `config ? calculateAccommodationTax(...) : null/fallback` pattern |

#### Bug: `NO_TAX_RESULT` is exported but never imported anywhere

- **Severity:** Info
- **Priority:** Low
- **Description:** The `NO_TAX_RESULT` constant is defined and exported (line 74) but no file imports it. The steuer/page.tsx (line 180) manually constructs an equivalent inline object instead of using the constant. This is dead code but harmless.
- **Steps to reproduce:** Grep for `NO_TAX_RESULT` -- only found at its definition.

---

### 5. Code Quality: `src/app/dashboard/steuer/page.tsx` (Null Handling)

| Check | Result | Notes |
|-------|--------|-------|
| `TaxDataItem.config` allows null | PASS | Line 40: `config: TaxConfig | null` |
| `taxData` computation handles null config | PASS | Lines 175-180: falls back to zero-tax result object |
| `groupedByCity` handles null config | PASS | Lines 215-217: uses optional chaining `config?.city` |
| `SinglePropertySummary` handles null config | PASS | Line 628-638: checks `config &&` before rendering rate info |
| `computeSummary` works with null config items | PASS | Does not access `config` directly |
| CSV export handles null config | PASS | Line 276: `d.config ? ... : '--'` |
| City header shows 0% for null config | PASS | Line 443: `cityGroup.config?.rate ?? 0` |

#### Bug: Rate display "0%" for per_person_per_night and tiered cities in city header

- **Severity:** Minor
- **Priority:** Medium
- **Description:** In the city header (line 443), the rate is shown as `cityGroup.config?.rate ?? 0` followed by `%`. For cities using `per_person_per_night` model (e.g., Duesseldorf 3.00 EUR), this would display "3%" instead of "3.00 EUR". For tiered cities (rate=0), it displays "0%". The `formatModelLabel` is called separately but the rate+% label is misleading.
- **Steps to reproduce:** Have a property in Duesseldorf or Hamburg, view the Steuer page grouped view.
- **Impact:** Misleading display of tax rate for non-percentage models.

#### Bug: Same issue in `CompactSummary` and `SinglePropertySummary`

- **Severity:** Minor
- **Priority:** Medium
- **Description:** `CompactSummary` (line 688) shows `Steuer ({rate}%)` and `SinglePropertySummary` (line 653) shows `eingezogene Beherbergungssteuer ({config?.rate ?? 0}%)`. Both assume the rate is always a percentage, which is incorrect for `per_person_per_night` (EUR) and `tiered` (0) models.
- **Impact:** Same as above -- cosmetic but misleading for non-percentage tax models.

---

### 6. Code Quality: `src/app/dashboard/reporting/page.tsx` (Null Handling)

| Check | Result | Notes |
|-------|--------|-------|
| `getBruttoWithoutCityTax` handles null config | PASS | Line 73-74: `config ? calculateAccommodationTax(...) : null`, then `taxResult?.taxAmount ?? 0` |
| `monthlyData` handles null taxConfig | PASS | Line 312-313: `taxConfig ? ... : null`, then `taxResult?.isExempt ? 0 : taxResult?.taxAmount` |
| No potential null pointer exceptions | PASS | All config accesses use optional chaining or ternary checks |

#### Bug: Potential NaN in monthly tax calculation

- **Severity:** Minor
- **Priority:** Low
- **Description:** Line 322: `existing.tax += (taxResult?.isExempt ? 0 : taxResult?.taxAmount) ?? 0`. When `taxResult` is null (property has no tax config), `taxResult?.isExempt` is `undefined` (falsy), so the ternary evaluates to `taxResult?.taxAmount` which is also `undefined`. The `?? 0` at the end catches this and returns 0. So the logic is technically correct but the intent is unclear -- a null taxResult should yield 0, not go through the isExempt check. No actual bug, just fragile code.

---

### 7. Security Audit (Red-Team)

| Check | Result | Notes |
|-------|--------|-------|
| No secrets in city-tax-rules.ts | PASS | Static public data only |
| Properties page saves via Supabase client with RLS | PASS | Uses `supabase.from('properties').update(...)` -- RLS should gate per-user |
| No SQL injection vectors | PASS | All queries use Supabase parameterized builder |
| No XSS in city names | PASS | City names are static constants, not user input rendered as HTML |
| No sensitive data exposure | PASS | Tax rules are public knowledge |
| CityCombobox user input is not persisted unsanitized | PASS | Manual city entry is just a string stored in form state, saved via parameterized Supabase update |

---

### 8. Summary of Findings

| # | Severity | Description | File | Priority |
|---|----------|-------------|------|----------|
| BUG-1 | Minor | `findCityTaxRule` partial match could return wrong city for ambiguous substrings | city-tax-rules.ts:693 | Low |
| BUG-2 | Minor | Rate display shows "%" suffix for per_person_per_night (EUR) and tiered (0) models in steuer page headers | steuer/page.tsx:443,653,688 | Medium |
| BUG-3 | Info | `NO_TAX_RESULT` exported but never used -- steuer/page.tsx constructs equivalent inline | accommodation-tax.ts:74 | Low |
| BUG-4 | Info | `npm run lint` broken on Next.js 16 -- `next lint` interprets "lint" as directory | package.json | Low |
| BUG-5 | Minor | Tag input onBlur discards unsaved tag text (pre-existing) | properties/page.tsx:393 | Low |

**Overall Assessment:** The changes are solid. The nullable tax config pattern is consistently applied across all callers. The static city data is comprehensive and well-structured. The main actionable issue is BUG-2 (rate display assumes percentage model) which should be fixed before deploying PROJ-6 to avoid confusing users in cities with flat-rate or tiered models.

## Deployment
_To be added by /deploy_

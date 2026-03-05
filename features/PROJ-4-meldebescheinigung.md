# PROJ-4: Meldebescheinigung

## Status: In Review
**Created:** 2026-03-03
**Last Updated:** 2026-03-05

## Dependencies
- Requires: PROJ-1 (Dashboard-Übersicht) - Layout
- Requires: PROJ-2 (Buchungsmanagement) - Gastdaten als Quelle

## Beschreibung
Erstellung von Meldescheinen (Beherbergungsstatistik-Meldeschein) für Gäste, basierend auf den Buchungsdaten. Gemäß § 2 Abs. 2 Beherbergungsstatistikgesetz (BeherbStatG) sind Vermieter zur Erfassung von Gästedaten verpflichtet. Der Meldeschein wird als PDF generiert und kann ausgedruckt oder digital an Gäste weitergegeben werden.

## User Stories
- Als Vermieter möchte ich für eine Buchung mit einem Klick einen vorausgefüllten Meldeschein erstellen, damit ich keine Daten manuell eingeben muss.
- Als Vermieter möchte ich den Meldeschein als PDF herunterladen, damit ich ihn ausdrucken oder digital versenden kann.
- Als Vermieter möchte ich fehlende Felder (die der Gast selbst ausfüllen muss, z.B. Geburtsort) im Formular nachtragen können, bevor ich das PDF generiere.
- Als Vermieter möchte ich alle erstellten Meldescheine chronologisch einsehen, damit ich sie archivieren und nachweisen kann.
- Als Vermieter möchte ich manuell einen Meldeschein erstellen (für Gäste ohne Smoobu-Buchung, z.B. Direktbuchungen über Telefon).

## Acceptance Criteria
- [ ] Meldeschein-Formular mit allen Pflichtfeldern gemäß § 2 BeherbStatG:
  - Familienname, Vorname
  - Geburtsdatum
  - Staatsangehörigkeit / Nationalität
  - Anschrift (Straße, PLZ, Ort, Land)
  - Ankunftsdatum, Abreisedatum
  - Anzahl der Personen (Erwachsene, Kinder)
  - Unterschriftsfeld (Platzhalter im PDF)
- [ ] Aus Buchung vorausfüllen: alle verfügbaren Felder werden automatisch aus den Buchungsdaten befüllt
- [ ] Fehlende Pflichtfelder werden rot markiert, Hinweis welche Daten noch fehlen
- [ ] PDF-Generierung: sauberes, offiziell aussehendes Dokument mit Vermieter-Briefkopf
- [ ] PDF enthält: Unterkunftsname, Adresse, Zeitraum, alle Gästeinformationen, Unterschriftsfeld
- [ ] Meldeschein-Archiv: Liste aller erstellten Meldescheine mit Datum, Gastname, Zeitraum
- [ ] Status pro Meldeschein: "Erstellt", "Druckbereit", "Unterschrieben" (manuell setzbar)
- [ ] Download-Button für PDF

## Pflichtfelder (rechtlich)
Gemäß BeherbStatG und typischen kommunalen Anforderungen:
- Name, Vorname (Pflicht)
- Geburtsdatum (Pflicht für Ausländer, empfohlen für Inländer)
- Staatsangehörigkeit (Pflicht)
- Wohnanschrift (Pflicht)
- Ankunfts- und Abreisedatum (Pflicht)
- Reisezweck (geschäftlich/privat – relevant für Beherbergungssteuerbefreiung)
- Unterschrift (Pflicht)

## Edge Cases
- Buchung mit mehreren Personen: Hauptgast + Mitreisende (Mitreisende können manuell hinzugefügt werden)
- Ausländische Gäste: Feld für Nationalität ist Pflichtfeld, Adressfeld für internationale Adressen
- Kinder unter 18 Jahren: müssen separat erfasst werden (Anzahl + Alter)
- Meldeschein für Geschäftsreisende: markiert als "geschäftlich" → Beherbergungssteuer entfällt
- Fehlende API-Daten (z.B. Airbnb liefert keine vollständige Adresse): Formular zeigt fehlende Felder als ausfüllbar
- Archiv-Aufbewahrungspflicht: Hinweis, dass Meldescheine 1 Jahr aufzubewahren sind

## Vermieter-Konfiguration (einmalig)
- Unterkunftsname, Adresse, Telefon, E-Mail (erscheint im PDF-Briefkopf)
- Logo-Upload für professionellen Meldeschein

---

## Tech Design (Solution Architect) – Update 2026-03-05

> Basis-Architektur: siehe PROJ-1 (Gesamtarchitektur, Datenmodell, Datenfluss)

### Änderungen gegenüber Ursprungsdesign

#### A) Unterschriftfeld – komplett entfernen

Keine Unterschrift-Funktionalität mehr. Betrifft:
- PDF-Vorlage (`src/lib/pdf/meldeschein.tsx`): Unterschrift-Bereich und zugehörige Styles entfernen
- Formular-Dialog: `<SignaturePad />` Komponente entfernen
- Archiv-Tabelle: "Signatur"-Spalte entfernen
- Status-Optionen: "Unterschrieben" entfernen → nur noch "Erstellt" / "Archiviert"
- `signature`-Feld in der DB bleibt bestehen, wird aber nicht mehr befüllt

#### B) Auto-Generierung bei vollständigen Buchungsdaten

**Logik:** Sobald eine Buchung die Mindest-Pflichtfelder enthält, wird automatisch ein `registration_form`-Eintrag erstellt (kein PDF, nur DB-Record).

**Mindest-Pflichtfelder für Auto-Generierung:**
- Vorname + Nachname
- Check-in + Check-out

Weitere Felder (Nationalität, Adresse, Reisezweck) werden gespeichert sofern vorhanden, sind aber nicht Voraussetzung.

**Trigger-Zeitpunkte:**
1. Nach Smoobu-Sync (`/api/smoobu/sync`)
2. Beim Laden der Meldescheine-Seite (für bereits existierende Buchungen)

**Neues API-Endpoint:** `POST /api/meldescheine/auto-generate`
- Liest alle Buchungen aus `bookings`
- Vergleicht mit existierenden `registration_forms` (per `booking_id`)
- Erstellt fehlende Einträge für Buchungen mit ausreichenden Daten
- Gibt Anzahl neu erstellter Meldescheine zurück

**PDF-Generierung bleibt on-demand:** Erst beim Klick auf "Download" wird das PDF im Browser erzeugt. Keine PDFs werden serverseitig gespeichert.

#### Komponenten-Baum (aktualisiert)
```
Meldescheine-Seite
├── Auto-Generierung beim Seitenload (ruft /api/meldescheine/auto-generate)
│   └── Toast: "X neue Meldescheine automatisch erstellt"
├── "Neu erstellen"-Button (manuell, für Direktbuchungen ohne Smoobu)
├── Archiv-Tabelle (shadcn Table)
│   ├── Spalten: Gast | Zeitraum | Reisezweck | Status | Aktionen
│   └── Zeilen-Aktionen: PDF herunterladen, Status ändern
└── Meldeschein-Formular (shadcn Dialog)
    ├── Buchungs-Auswahl (Dropdown bestehender Buchungen)
    ├── Gastdaten (vorausgefüllt, editierbar)
    │   ├── Name, Vorname, Geburtsdatum
    │   ├── Staatsangehörigkeit
    │   ├── Wohnanschrift (Straße, PLZ, Ort, Land)
    │   └── Reisezweck (privat/geschäftlich)
    ├── Mitreisende-Sektion (dynamisch: + Weitere Person)
    ├── Aufenthaltsdaten (Check-in, Check-out)
    ├── Fehlende Pflichtfelder: rot markiert
    └── "Speichern & PDF generieren"-Button [KEIN Unterschriftfeld mehr]
```

#### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `src/lib/pdf/meldeschein.tsx` | Unterschriftbereich + signatureArea-Styles entfernen |
| `src/app/dashboard/meldescheine/page.tsx` | SignaturePad entfernen, Signatur-Spalte entfernen, Auto-Gen beim Load aufrufen |
| `src/app/api/meldescheine/auto-generate/route.ts` | Neues Endpoint erstellen |
| `src/app/api/smoobu/sync/route.ts` | Auto-Gen nach Sync aufrufen |

#### Datenquelle
- Liest Gastdaten aus `bookings`-Tabelle (Supabase)
- Speichert Meldescheine in `registration_forms`-Tabelle (Supabase)
- PDF-Generierung via `@react-pdf/renderer` mit Vorlage in `src/lib/pdf/meldeschein.tsx`
- Vermieter-Briefkopf aus `settings`-Tabelle

## QA Test Results

**Tested:** 2026-03-05
**App URL:** http://localhost:3000/dashboard/meldescheine
**Tester:** QA Engineer (AI)
**Build Status:** PASS (npm run build compiles without errors)

### Acceptance Criteria Status

#### AC-1: Meldeschein-Formular mit allen Pflichtfeldern
- [x] Familienname, Vorname -- present in form (lines 428-434)
- [x] Geburtsdatum -- present in form (line 437)
- [x] Staatsangehörigkeit / Nationalitaet -- present, marked as mandatory (lines 441-448)
- [x] Anschrift (Strasse, PLZ, Ort, Land) -- present (lines 453-465)
- [x] Ankunftsdatum, Abreisedatum -- present (lines 470-476)
- [x] Anzahl der Personen (Erwachsene, Kinder) -- present (lines 478-484)
- [x] Unterschriftsfeld (Platzhalter im PDF) -- present as print-only signature lines in PDF (lines 250-257 of meldeschein.tsx), no digital signature per tech design update

#### AC-2: Aus Buchung vorausfuellen
- [x] Booking dropdown to select a booking (lines 402-422)
- [x] `fillFromBooking()` auto-populates firstname, lastname, nationality, address, dates, adults, children, trip purpose (lines 171-187)
- [x] Auto-open dialog when `?booking=` URL param is set (lines 138-146)

#### AC-3: Fehlende Pflichtfelder rot markiert
- [x] `missingFields` array checks Vorname, Familienname, Staatsangehoerigkeit, Wohnanschrift, Ankunft, Abreise (lines 209-216)
- [x] Warning text displayed listing missing fields (lines 564-568)
- [x] Nationality and street inputs get `border-destructive` class when empty (lines 446, 458)
- [ ] BUG: PLZ, Ort, and Land input fields are NOT marked red when empty, although they are part of the full address per BeherbStatG. Only street is validated as mandatory.

#### AC-4: PDF-Generierung mit Vermieter-Briefkopf
- [x] PDF is generated client-side using @react-pdf/renderer (line 309)
- [x] PDF includes property name, address, and landlord name (lines 141-157 of meldeschein.tsx)
- [ ] BUG: `handleDownloadExisting` (line 352) does NOT pass `landlordAddress` to the PDF data, only `landlordName`. The creation path (line 304) correctly includes it. Existing Meldescheine re-downloaded will be missing the landlord address.
- [ ] BUG: No logo in PDF -- the spec mentions "Logo-Upload fuer professionellen Meldeschein" but there is no logo rendering in the PDF template. Settings table has `landlord_logo_url` but it is unused.

#### AC-5: PDF enthaelt alle Informationen
- [x] Unterkunftsname and Adresse (lines 141-150 meldeschein.tsx)
- [x] Zeitraum (check-in/check-out) (lines 163-171)
- [x] Gaesteinformationen (name, birthdate, nationality, address) (lines 197-230)
- [x] Unterschriftsfeld as print placeholder (lines 250-257)
- [x] Mitreisende section when co-travellers exist (lines 233-247)
- [x] Legal note about 1-year retention period (lines 260-266)

#### AC-6: Meldeschein-Archiv
- [x] Table with columns: Gast, Zeitraum, Reisezweck, Erstellt, Status, Aktionen (lines 606-664)
- [x] Ordered by created_at descending (line 118)
- [x] Empty state shown when no forms exist (lines 600-603)
- [x] Loading skeleton shown during fetch (lines 594-599)

#### AC-7: Status pro Meldeschein
- [x] Status dropdown per row with "Erstellt" / "Archiviert" (lines 640-651)
- [ ] BUG: Tech design says statuses are "Erstellt" / "Archiviert", but `src/lib/types.ts` line 35 defines `RegistrationFormStatus = 'created' | 'printed' | 'signed'`. The types file is inconsistent with the implementation. This could cause issues if other features rely on the type definition.

#### AC-8: Download-Button fuer PDF
- [x] Download button (ghost variant) in each archive table row (lines 653-660)
- [x] Triggers `handleDownloadExisting` which fetches full record and generates PDF (lines 324-362)

### Edge Cases Status

#### EC-1: Buchung mit mehreren Personen (Mitreisende)
- [x] "Person" button adds co-traveller rows dynamically (lines 505-519)
- [x] Each co-traveller has firstname, lastname, birthdate, nationality fields (lines 521-559)
- [x] Co-travellers saved to DB as JSON (line 262)
- [x] Co-travellers rendered in PDF (lines 233-247 of meldeschein.tsx)
- [ ] BUG: No way to REMOVE a co-traveller once added. There is no delete/remove button on co-traveller rows.

#### EC-2: Auslaendische Gaeste
- [x] Nationality is a free-text field, accepts any nationality (line 442)
- [x] Address fields include country (line 464)
- [x] International addresses supported via free-text inputs

#### EC-3: Kinder unter 18 Jahren
- [x] Children count field present (line 483)
- [ ] BUG: Spec says "muessen separat erfasst werden (Anzahl + Alter)" but only a count is captured. No age input for children.

#### EC-4: Geschaeftsreisende
- [x] Trip purpose dropdown with Privat/Geschaeftlich/Unbekannt options (lines 488-499)
- [x] Trip purpose displayed in archive table (lines 629-631)
- [x] Trip purpose included in PDF (lines 184-194 of meldeschein.tsx)

#### EC-5: Fehlende API-Daten
- [x] Formular shows empty fields as editable when API data is incomplete (line 173-186, defaults to empty strings)
- [x] Missing fields clearly marked with red border and text warning

#### EC-6: Archiv-Aufbewahrungspflicht
- [x] PDF contains legal note: "Die Aufbewahrungsfrist betraegt ein Jahr nach Abreise des Gastes." (line 263 of meldeschein.tsx)

#### EC-7: Duplicate Meldeschein prevention
- [x] Manual creation checks for existing Meldeschein per booking_id before insert (lines 230-239)
- [x] Auto-generate compares existing booking_ids before creating new records (lines 27-32 of auto-generate-meldeschein.ts)

#### EC-8: Auto-generation on page load
- [x] Auto-generate called on page load (line 150)
- [x] Info banner shown when Meldescheine were auto-created (lines 153-154, 381-385)
- [x] Forms list refreshed after auto-generation (lines 156-160)
- [x] Auto-generation also triggered after Smoobu sync (line 154 of sync/route.ts)

### Cross-Browser and Responsive Testing

#### Cross-Browser
- Code review only (no live browser testing). All UI uses standard shadcn/ui components (Dialog, Table, Select, Input, Button) which have cross-browser support.
- PDF generation uses @react-pdf/renderer which renders client-side -- relies on browser Blob/URL API which is supported in all modern browsers.

#### Responsive (375px / 768px / 1440px)
- [x] Page header uses `flex-col` on mobile, `sm:flex-row` on larger screens (line 387)
- [x] Dialog has `max-w-2xl max-h-[90vh] overflow-y-auto` for scroll on small screens (line 396)
- [x] Co-traveller grid uses `grid-cols-2 sm:grid-cols-4` for responsive layout (line 521)
- [ ] BUG: The form grid uses fixed `grid-cols-2` (line 426) which will cause cramped inputs on 375px mobile. Should be `grid-cols-1 sm:grid-cols-2`.
- [ ] BUG: Archive table is not wrapped in a horizontal scroll container. On 375px, the 6-column table will overflow. A `<ScrollArea>` or `overflow-x-auto` wrapper is missing.

### Security Audit Results

#### SEC-1: Authentication on API endpoints
- [ ] **CRITICAL:** `POST /api/meldescheine/auto-generate` has NO authentication check. Any unauthenticated HTTP client can call this endpoint and trigger mass creation of registration_form records. The endpoint uses `createServiceClient()` which bypasses RLS entirely.

#### SEC-2: Authentication on Smoobu sync endpoint
- [ ] **CRITICAL:** `POST /api/smoobu/sync` has NO authentication check. Any unauthenticated caller can trigger a full Smoobu sync including auto-generation of Meldescheine. Uses service role key.

#### SEC-3: Settings query -- API key exposure
- [x] Settings query on the frontend explicitly selects only `id, landlord_name, landlord_street, landlord_zip, landlord_city` -- the `smoobu_api_key` is NOT selected (line 126). Good.

#### SEC-4: select('*') in handleDownloadExisting
- [ ] **MEDIUM:** `handleDownloadExisting` uses `.select('*')` on `registration_forms` (line 327). While registration_forms does not contain highly sensitive fields, this is against best practices. The `signature` field (even though null) and other internal fields like `booking_id`, `property_id` are fetched unnecessarily to the client.

#### SEC-5: Input validation (server-side)
- [ ] **HIGH:** The auto-generate endpoint has NO Zod input validation. While it currently takes no body parameters, there is no validation layer. More critically, the manual form save goes directly from client to Supabase via the anon key -- there is NO server-side validation of the form data. All validation is client-side only (the `missingFields` check). A malicious user could bypass client-side checks and insert arbitrary data directly via the Supabase client.

#### SEC-6: XSS via PDF
- [x] @react-pdf/renderer uses its own rendering engine (not browser DOM), so XSS via PDF content is not a concern. User input in the PDF is rendered as plain text.

#### SEC-7: Rate limiting
- [ ] **MEDIUM:** No rate limiting on `/api/meldescheine/auto-generate`. Repeated rapid calls could create duplicate processing load, though the idempotent design (checking existing booking_ids) prevents duplicate records.

#### SEC-8: Data exposure in bookings query
- [ ] **LOW:** The bookings query on the frontend uses `select('*, properties(*)')` (line 121) which fetches ALL booking columns including potentially sensitive financial data (prices, commissions, host payouts) to populate the booking dropdown. Only guest name and dates are actually needed for the dropdown.

### Regression Testing

#### PROJ-3: Financial Reporting (Deployed)
- Not directly affected by PROJ-4 changes. No shared components modified.

#### PROJ-2: Buchungsmanagement (In Review)
- Auto-generate references `bookings` table but only reads -- no write impact on bookings.
- Smoobu sync route was modified to call `autoGenerateMeldescheine()` (line 154 of sync/route.ts). This is additive and should not break existing sync behavior.

### Bugs Found

#### BUG-1: landlordAddress missing in handleDownloadExisting
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Create a Meldeschein via the dialog (new creation path)
  2. Close the dialog
  3. Click the download button on the archived Meldeschein
  4. Expected: PDF shows landlord address in the header
  5. Actual: PDF is missing landlord address because `handleDownloadExisting` (line 352) only passes `landlordName` but not `landlordAddress`
- **Priority:** Fix before deployment

#### BUG-2: No authentication on /api/meldescheine/auto-generate
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Open a terminal (no login required)
  2. Run: `curl -X POST http://localhost:3000/api/meldescheine/auto-generate`
  3. Expected: 401 Unauthorized
  4. Actual: 200 OK with `{ success: true, created: N }` -- the endpoint executes using the service role key
- **Priority:** Fix before deployment

#### BUG-3: No authentication on /api/smoobu/sync
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Run: `curl -X POST http://localhost:3000/api/smoobu/sync`
  2. Expected: 401 Unauthorized
  3. Actual: Triggers full Smoobu sync with service role key, no auth required
- **Priority:** Fix before deployment

#### BUG-4: RegistrationFormStatus type mismatch
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open `src/lib/types.ts` line 35
  2. Observe: `RegistrationFormStatus = 'created' | 'printed' | 'signed'`
  3. Open `src/app/dashboard/meldescheine/page.tsx` line 68-71
  4. Observe: STATUS_LABELS only has `created` and `archived`
  5. Expected: Types match the implementation
  6. Actual: The type definition includes `printed` and `signed` which are no longer used, and `archived` is missing from the type
- **Priority:** Fix in next sprint

#### BUG-5: No way to remove co-travellers
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open the Meldeschein dialog
  2. Click "+ Person" to add a co-traveller
  3. Realize you added one by mistake
  4. Expected: A remove/delete button per co-traveller row
  5. Actual: No way to remove a co-traveller once added -- must close and reopen the dialog
- **Priority:** Fix before deployment

#### BUG-6: Form grid not responsive on 375px
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open /dashboard/meldescheine on a 375px viewport
  2. Open the "Neu erstellen" dialog
  3. Expected: Form fields stack vertically on mobile
  4. Actual: `grid-cols-2` causes cramped, hard-to-tap inputs on narrow screens
- **Priority:** Fix in next sprint

#### BUG-7: Archive table overflows on mobile
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open /dashboard/meldescheine on a 375px viewport
  2. View the archive table with entries
  3. Expected: Horizontal scroll or responsive column hiding
  4. Actual: 6-column table overflows the viewport with no scroll wrapper
- **Priority:** Fix in next sprint

#### BUG-8: No server-side validation for form data
- **Severity:** High
- **Steps to Reproduce:**
  1. The Meldeschein form writes directly to Supabase via the anon key client (line 246-273)
  2. Client-side validation (missingFields check) can be bypassed
  3. A user could call `supabase.from('registration_forms').insert(...)` directly from the browser console with arbitrary data
  4. Expected: Server-side Zod validation before insert
  5. Actual: Only client-side validation exists
- **Priority:** Fix before deployment (add RLS policies or server-side API route with Zod)

#### BUG-9: Logo not rendered in PDF
- **Severity:** Low
- **Steps to Reproduce:**
  1. Configure a landlord_logo_url in settings
  2. Generate a Meldeschein PDF
  3. Expected: Logo appears in PDF header per spec "Logo-Upload fuer professionellen Meldeschein"
  4. Actual: No logo rendering in PDF template. Settings table has the field but it is unused.
- **Priority:** Nice to have

#### BUG-10: Children age not captured
- **Severity:** Low
- **Steps to Reproduce:**
  1. Spec says "Kinder unter 18 Jahren: muessen separat erfasst werden (Anzahl + Alter)"
  2. Only a numeric "children" count field exists
  3. Expected: Age or birthdate input for each child
  4. Actual: Only total count
- **Priority:** Nice to have

### Summary

- **Acceptance Criteria:** 6/8 passed (AC-3 partial fail -- address sub-fields not all validated; AC-4 partial fail -- landlordAddress missing in re-download; AC-7 note -- type mismatch)
- **Bugs Found:** 10 total (2 critical, 1 high, 2 medium, 5 low)
- **Security:** 2 Critical (unauthenticated API endpoints), 1 High (no server-side validation), 2 Medium/Low (select *, bookings over-fetch)
- **Production Ready:** NO
- **Recommendation:** Fix the 2 critical security bugs (BUG-2, BUG-3: add auth to API routes) and the 1 high-severity bug (BUG-8: server-side validation or RLS) before deployment. Also fix BUG-1 (landlordAddress in re-download) and BUG-5 (remove co-traveller) as medium-priority items.

## Deployment
_To be added by /deploy_

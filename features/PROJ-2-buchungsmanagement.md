# PROJ-2: Buchungsmanagement

## Status: In Review
**Created:** 2026-03-03
**Last Updated:** 2026-03-05

## Dependencies
- Requires: PROJ-1 (Dashboard-Übersicht) - Navigation und Layout
- Requires: PROJ-7 (Smoobu API-Integration) - Verfügbarkeitsprüfung, Preisabruf, Buchungsübertragung
- Requires: PROJ-5 (Rechnungserstellung) - Automatische Rechnungserstellung nach Buchungsanlage
- Requires: PROJ-8 (Direktbuchungen + Stripe) - Stripe-Zahlungslink nach Buchungsanlage

## Beschreibung
Liste aller Buchungen mit Filtermöglichkeiten und Detailansicht. Enthält zusätzlich einen mehrstufigen Wizard zum Anlegen von Direktbuchungen: Verfügbarkeit und Preise werden live über Smoobu geprüft, der Gast wird mit allen Pflichtdaten erfasst, die Buchung wird an Smoobu übermittelt, ein Stripe-Zahlungslink wird generiert und eine Rechnung automatisch erstellt.

## User Stories

### Buchungsliste & Detailansicht
- Als Vermieter möchte ich alle Buchungen in einer Tabelle sehen, damit ich eine Übersicht habe.
- Als Vermieter möchte ich Buchungen nach Monat, Buchungskanal und Status filtern können, damit ich schnell finde was ich suche.
- Als Vermieter möchte ich auf eine Buchung klicken und alle Details sehen (Gastname, Adresse, Dates, Betrag, Kanal, Provision), damit ich alle Infos an einem Ort habe.
- Als Vermieter möchte ich den Buchungsstatus sehen (Bevorstehend / Check-in heute / Aktiv / Abgeschlossen / Storniert), damit ich weiß wo welche Gäste stehen.
- Als Vermieter möchte ich direkt aus der Buchungsdetailansicht eine Meldebescheinigung oder Rechnung für diesen Gast erstellen können.

### Direktbuchung anlegen (Wizard)
- Als Vermieter möchte ich über einen "Buchung anlegen"-Button einen Wizard öffnen, damit ich Direktbuchungen schnell erfassen kann.
- Als Vermieter möchte ich Check-in, Check-out, Personenanzahl und einen optionalen Promo-Code eingeben und damit die Verfügbarkeit sowie Preise direkt von Smoobu abrufen, damit ich keine Preise manuell nachschlagen muss.
- Als Vermieter möchte ich die von Smoobu gelieferten Preise (Übernachtung, Reinigungsgebühr) einsehen und bei Bedarf manuell anpassen, damit ich Sonderkonditionen abbilden kann.
- Als Vermieter möchte ich die Beherbergungssteuer automatisch berechnet sehen, damit ich keinen Rechenfehler mache.
- Als Vermieter möchte ich alle Gastdaten (Pflichtfelder: Vorname, Nachname, vollständige Adresse, Telefon, E-Mail) in Schritt 2 eingeben, damit die Buchung rechtssicher ist.
- Als Vermieter möchte ich nach Bestätigung die Buchung direkt an Smoobu übertragen, damit sie im Kalender erscheint.
- Als Vermieter möchte ich nach Buchungsanlage einen Stripe-Zahlungslink generieren und kopieren können, damit ich ihn manuell an den Gast weiterleiten kann.
- Als Vermieter möchte ich nach Buchungsanlage automatisch eine Rechnung erstellt bekommen (via PROJ-5), damit ich nicht manuell eine erstellen muss.

## Acceptance Criteria

### Buchungsliste
- [ ] Buchungsliste als sortierbare Tabelle mit: Gastname, Check-in, Check-out, Nächte, Betrag brutto, Buchungskanal, Status
- [ ] Filterung nach: Zeitraum (Monat/Quartal/Jahr/Custom), Buchungskanal, Status
- [ ] Suchfeld für Gastname oder Buchungs-ID
- [ ] Klick auf Buchung öffnet Detailansicht (Sheet von rechts)
- [ ] Detailansicht zeigt vollständige Gastdaten: Vorname, Nachname, E-Mail, Telefon, vollständige Adresse, Nationalität, Anzahl Erwachsene/Kinder
- [ ] Detailansicht zeigt Finanzdaten: Übernachtungskosten, Reinigungsgebühr, Beherbergungssteuer, Bruttobetrag, Provision (€ und %), Nettobetrag, Kaution
- [ ] Buchungsstatus-Badge mit Farbe (grün=aktiv, blau=bevorstehend, grau=abgeschlossen, rot=storniert)
- [ ] Button "Meldebescheinigung erstellen" → navigiert zu PROJ-4 mit vorausgefüllten Daten
- [ ] Button "Rechnung erstellen" → navigiert zu PROJ-5 mit vorausgefüllten Daten
- [ ] Pagination oder Infinite Scroll bei vielen Buchungen
- [ ] CSV-Export der gefilterten Buchungsliste

### Wizard Schritt 1 – Buchungsdetails & Preischeck
- [ ] Dialog öffnet sich über Button "Buchung anlegen" (oben rechts auf der Buchungsseite)
- [ ] Felder: Check-in (Datum), Check-out (Datum), Anzahl Personen (Erwachsene + Kinder getrennt), Promo-Code (optional)
- [ ] Button "Verfügbarkeit & Preise prüfen" sendet Anfrage an Smoobu API
- [ ] Bei Verfügbarkeit: zeigt aufgeschlüsselte Preisliste aus Smoobu (Übernachtungskosten gesamt, Reinigungsgebühr, ggf. weitere Positionen)
- [ ] Reinigungsgebühr wird aus Smoobu übernommen; falls nicht geliefert: Pflichtfeld zur manuellen Eingabe
- [ ] Alle Preisposten sind manuell überschreibbar (editierbare Felder mit Original-Wert als Placeholder)
- [ ] Beherbergungssteuer wird automatisch berechnet (Prozentsatz gemäß Property-Konfiguration aus PROJ-6) und als separater Posten angezeigt
- [ ] Gesamtpreis wird live aktualisiert bei manuellen Änderungen
- [ ] Bei Nichtverfügbarkeit: Fehlermeldung "Zeitraum nicht verfügbar" mit Hinweis auf belegten Zeitraum
- [ ] Bei ungültigem Promo-Code: Inline-Fehlermeldung, Weiterfahren ohne Rabatt möglich

### Wizard Schritt 2 – Gastdaten
- [ ] Pflichtfelder: Vorname, Nachname, E-Mail, Telefon, Straße + Hausnummer, PLZ, Ort, Land
- [ ] Optionale Felder: Nationalität, Geburtsdatum, Reisepass-/Ausweisnummer, Notiz
- [ ] Validierung: E-Mail-Format, Telefon nicht leer, PLZ numerisch (für DE)
- [ ] Formular blockiert Weiter-Button solange Pflichtfelder nicht ausgefüllt

### Wizard Schritt 3 – Übersicht & Bestätigung
- [ ] Zusammenfassung: Zeitraum, Anzahl Personen, Gastname, alle Preisposten, Gesamtbetrag
- [ ] Button "Buchung anlegen" löst folgende Aktionen aus:
  1. Buchung an Smoobu API übermitteln (POST) → Smoobu-Buchungs-ID wird gespeichert
  2. Buchung in lokaler Supabase-Datenbank speichern
  3. Automatische Rechnungserstellung via PROJ-5
  4. Stripe-Zahlungslink generieren via PROJ-8
- [ ] Nach Erfolg: Bestätigungsansicht mit Stripe-Zahlungslink (kopierbarer Link + QR-Code optional)
- [ ] Zahlungslink kann erneut aufgerufen werden aus der Buchungsdetailansicht

## Edge Cases
- Stornierte Buchungen werden angezeigt aber klar als storniert markiert
- Buchungen ohne vollständige Gastdaten (z.B. via Smoobu-Sync) zeigen "–" für fehlende Felder
- Buchungen über Airbnb haben evtl. keine direkte Provision (Airbnb behält Provision ein, liefert Host-Payout)
- Direktbuchungen haben 0% Provision
- Smoobu-API nicht erreichbar beim Preischeck: Fehlermeldung mit Retry-Option, kein Weiterfahren im Wizard
- Smoobu-API nimmt Buchungs-POST nicht an: Fehlermeldung, lokale Buchung wird nicht gespeichert (Transaktion wird zurückgerollt)
- Preis-Diskrepanz: Smoobu liefert anderen Preis als erwartet → Nutzer sieht den Smoobu-Preis und kann manuell anpassen
- Promo-Code unbekannt bei Smoobu: Buchung läuft ohne Rabatt, Hinweis an Nutzer
- PROJ-5 / PROJ-8 noch nicht verfügbar: Buchung wird trotzdem angelegt; Rechnung und Zahlungslink werden als "ausstehend" markiert und können nachträglich erstellt werden

## Demo-Daten Anforderungen
- Mind. 15 Buchungen verteilt über 3 Monate
- Mix aus Airbnb (40%), Booking.com (35%), Direkt (25%)
- Verschiedene Aufenthaltslängen (1, 3, 5, 7, 14 Nächte)
- Verschiedene Statuse (bevorstehend, aktiv, abgeschlossen, 1 storniert)
- Realistische Preise (z.B. 80-200 EUR/Nacht)
- Mind. 2 Direktbuchungen mit vollständigen Gastdaten (Wizard-Ergebnis simulieren)

---

## Tech Design (Solution Architect)

### Was bereits existiert (wird wiederverwendet)

| Komponente | Datei | Status |
|---|---|---|
| `SmoobuClient` Klasse | `src/lib/smoobu.ts` | Vorhanden, braucht 2 neue Methoden |
| `BookingDetailSheet` | `src/components/dashboard/booking-detail-sheet.tsx` | Vorhanden, braucht Stripe-Link-Feld |
| `BookingTable`, `BookingStatusBadge` | `src/components/dashboard/` | Vollständig vorhanden |
| Beherbergungssteuer-Rechner | `src/lib/calculators/accommodation-tax.ts` | Vollständig vorhanden |
| `/api/smoobu/sync` | Sync-Route | Vorhanden |
| `bookings`-Tabelle | Supabase | Vorhanden (alle Gastfelder schon da) |

### Komponenten-Baum
```
Buchungen-Seite (/dashboard/buchungen)
├── Header
│   ├── "Buchung anlegen"-Button  ← NEU
│   └── CSV-Export-Button
├── Filterleiste (vorhanden)
│   ├── DateRangePicker
│   ├── Kanal-Filter, Status-Filter
│   └── Suchfeld
├── BookingTable (vorhanden, wiederverwendet)
│   └── Zeile → öffnet BookingDetailSheet
├── BookingDetailSheet (vorhanden, erweitert)  ← Stripe-Link-Feld NEU
│   ├── Gastdaten (Vorname, Nachname, vollst. Adresse, Telefon, E-Mail)
│   ├── Finanzdaten (+ Beherbergungssteuer als eigene Zeile)
│   ├── Stripe-Zahlungslink (kopierbarer Link, falls vorhanden)
│   └── Aktionen: Meldeschein, Rechnung
├── Pagination (vorhanden)
└── CreateBookingWizard  ← NEU (shadcn Dialog)
    ├── WizardStep1: Zeitraum, Personen, Promo-Code + Smoobu-Preischeck
    ├── WizardStep2: Gastdaten-Formular (react-hook-form + Zod)
    ├── WizardStep3: Read-only Zusammenfassung + Bestätigung
    └── WizardSuccess: Stripe-Link anzeigen + kopieren
```

### Neue API-Routen

#### GET /api/smoobu/rates
- Empfängt: Check-in, Check-out, Personen, optional Promo-Code
- Fragt Smoobu Rates-API ab
- Gibt zurück: Verfügbar ja/nein, Übernachtungskosten, Reinigungsgebühr, weitere Positionen
- Reinigungsgebühr wird via bestehender `parsePriceDetails()` extrahiert

#### POST /api/bookings/create
Führt folgende Schritte aus:
1. POST zur Smoobu API (`/reservations`) → erhält Smoobu-ID
2. Buchung in Supabase `bookings`-Tabelle speichern
3. Triggert PROJ-5 Invoice-Erstellung (sobald verfügbar, sonst skip)
4. Triggert PROJ-8 Stripe-Link-Generierung (sobald verfügbar, sonst skip)

Fehlerverhalten: Smoobu-POST fehlschlägt → keine lokale Speicherung, Rollback.

### Wizard Datenfluss
```
Nutzer: Zeitraum + Personen eingeben
  → GET /api/smoobu/rates
  → Preisanzeige (editierbar) + Beherbergungssteuer (auto)
  → "Weiter" → Gastdaten-Formular (Zod-Validierung)
  → "Weiter" → Read-only Zusammenfassung
  → "Buchung anlegen" → POST /api/bookings/create
  → Erfolgsscreen: Stripe-Link (kopierbarer Text)
```

### Datenbankänderung
Die `bookings`-Tabelle bekommt eine neue Spalte:
- `stripe_payment_link TEXT NULL` — speichert generierten Stripe-Link

Alle anderen Gastfelder existieren bereits in der Tabelle.

### Keine neuen Pakete nötig
`react-hook-form`, `zod`, shadcn Dialog, `date-fns`, SmoobuClient — alle bereits installiert.

## QA Test Results

**Tested:** 2026-03-05
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Focus:** Smoobu API Key configuration inconsistency, general bugs, security audit

---

### Critical Finding: Smoobu API Key Source Inconsistency

The most significant bug found is an inconsistency in how the Smoobu API key is sourced across different API routes:

| Route | API Key Source | Impact |
|-------|---------------|--------|
| `POST /api/smoobu/sync` | `process.env.SMOOBU_API_KEY` (env var) | Works only if `.env.local` is set |
| `GET /api/smoobu/test` | `process.env.SMOOBU_API_KEY` (env var) | Works only if `.env.local` is set |
| `GET /api/smoobu/rates` | `settings.smoobu_api_key` (Supabase DB) | Works only if DB has key |
| `POST /api/bookings/create` | `settings.smoobu_api_key` (Supabase DB) | Works only if DB has key |

The Settings page (`/dashboard/einstellungen`) does NOT expose a field for the user to enter/view the `smoobu_api_key` in the database. The settings form reads and writes all settings fields via a generic `updateField`, BUT there is no `<Input>` rendered for `smoobu_api_key`. This means:

1. The rates and booking-create endpoints read from DB, but there is no UI to populate that DB field.
2. The sync and test endpoints read from env vars, which works in development but the DB field remains empty.
3. A user who configures `SMOOBU_API_KEY` in `.env.local` can sync bookings successfully, but cannot use the Create Booking Wizard or check rates -- those will always fail with "Smoobu API-Key nicht konfiguriert".

---

### Acceptance Criteria Status

#### AC: Buchungsliste
- [x] Buchungsliste als sortierbare Tabelle mit Gastname, Check-in, Check-out, Naechte, Betrag brutto, Buchungskanal, Status
- [x] Filterung nach Zeitraum (Monat/Quartal/Jahr/All), Buchungskanal, Status
- [ ] BUG: Filterung nach Custom-Datumsbereich nicht implementiert (spec says "Monat/Quartal/Jahr/Custom")
- [x] Suchfeld fuer Gastname oder Buchungs-ID
- [x] Klick auf Buchung oeffnet Detailansicht (Sheet von rechts)
- [x] Detailansicht zeigt vollstaendige Gastdaten
- [x] Detailansicht zeigt Finanzdaten inkl. Beherbergungssteuer
- [x] Buchungsstatus-Badge mit Farbe
- [x] Button "Meldeschein erstellen" navigiert mit vorausgefuellten Daten
- [x] Button "Rechnung erstellen" navigiert mit vorausgefuellten Daten
- [x] Pagination bei vielen Buchungen
- [ ] BUG: Export ist XLSX statt CSV (spec says "CSV-Export der gefilterten Buchungsliste")

#### AC: Wizard Schritt 1 -- Buchungsdetails & Preischeck
- [x] Dialog oeffnet sich ueber Button "Buchung anlegen"
- [x] Felder: Check-in, Check-out, Erwachsene, Kinder, Promo-Code
- [ ] BUG: "Verfuegbarkeit & Preise pruefen" will ALWAYS fail because rates route reads `smoobu_api_key` from DB settings which is never populated via UI (see Critical Finding above)
- [x] Bei Verfuegbarkeit: zeigt Preisliste (Uebernachtungskosten, Reinigungsgebuehr)
- [ ] BUG: Reinigungsgebuehr kommt immer als `null` von Smoobu rates endpoint (getRates never extracts cleaningFee, always returns `null`); spec requires a Pflichtfeld for manual input if not provided by Smoobu, but UI just sets it to 0 silently
- [x] Alle Preisposten sind manuell ueberschreibbar
- [x] Beherbergungssteuer wird automatisch berechnet
- [x] Gesamtpreis wird live aktualisiert
- [x] Bei Nichtverfuegbarkeit: Fehlermeldung
- [ ] BUG: "Bei ungueltigem Promo-Code: Inline-Fehlermeldung" -- Promo-Code is sent to Smoobu rates but there is no Smoobu endpoint that validates promo codes; it is silently ignored

#### AC: Wizard Schritt 2 -- Gastdaten
- [x] Pflichtfelder: Vorname, Nachname, E-Mail, Telefon, Strasse, PLZ, Ort, Land
- [x] Optionale Felder: Nationalitaet, Geburtsdatum, Ausweis-Nr., Notiz
- [x] E-Mail-Format Validierung
- [x] Telefon nicht leer Validierung
- [ ] BUG: PLZ Validierung does NOT enforce "numerisch (fuer DE)" as spec requires. Schema only checks `min(1)` (not empty), any string is accepted.
- [x] Formular blockiert Weiter-Button solange Pflichtfelder nicht ausgefuellt

#### AC: Wizard Schritt 3 -- Uebersicht & Bestaetigung
- [x] Zusammenfassung: Zeitraum, Personen, Gastname, Preisposten, Gesamtbetrag
- [ ] BUG: "Buchung anlegen" will ALWAYS fail because create route reads `smoobu_api_key` from DB (see Critical Finding)
- [x] Nach Erfolg: Bestaetigungsansicht (when API key is present)
- [ ] BUG: Stripe-Zahlungslink always shows "not available" (expected, PROJ-8 not yet built), but spec says "kopierbarer Link + QR-Code optional" -- QR Code never implemented
- [ ] BUG: Zahlungslink "kann erneut aufgerufen werden aus der Buchungsdetailansicht" -- only shown for channel=Direct, which is correct, but always shows placeholder text since stripe_payment_link column not yet in DB schema

### Edge Cases Status

#### EC-1: Stornierte Buchungen
- [x] Stornierte Buchungen werden angezeigt und als storniert markiert

#### EC-2: Buchungen ohne vollstaendige Gastdaten
- [x] Fehlende Felder zeigen "dash" Platzhalter

#### EC-3: Airbnb Provision
- [x] Korrekt behandelt (commission_amount = 0 bei Host-Payout)

#### EC-4: Direktbuchungen 0% Provision
- [x] commission_amount wird auf 0 gesetzt im Create-Route

#### EC-5: Smoobu-API nicht erreichbar beim Preischeck
- [x] Fehlermeldung mit Retry-Option ("Verfuegbarkeit & Preise pruefen" Button bleibt anklickbar)

#### EC-6: Smoobu-API Buchungs-POST fehlschlaegt
- [x] Fehlermeldung, keine lokale Speicherung (502 returned, Supabase insert never reached)

#### EC-7: PROJ-5/PROJ-8 nicht verfuegbar
- [x] Buchung wird trotzdem angelegt; Hinweis dass Stripe/Rechnung spaeter verfuegbar
- [ ] BUG: Spec says Rechnung/Zahlungslink sollen als "ausstehend" markiert werden -- stattdessen zeigt es nur allgemeinen Hinweistext

#### EC-8: Promo-Code unbekannt bei Smoobu
- [ ] BUG: Kein Hinweis an Nutzer bei ungueltigem Promo-Code (Smoobu rates API ignoriert den Parameter stillschweigend)

---

### Security Audit Results

#### SEC-1: No Authentication on API Routes
- [ ] **CRITICAL:** `POST /api/bookings/create` has NO authentication check. Any unauthenticated request can create bookings in Smoobu and the local database.
- [ ] **CRITICAL:** `GET /api/smoobu/rates` has NO authentication check. Any unauthenticated request can query Smoobu rates, consuming API quota.
- [ ] **CRITICAL:** `POST /api/smoobu/sync` has NO authentication check. Anyone can trigger a full sync operation.
- [ ] **CRITICAL:** `GET /api/smoobu/test` has NO authentication check.
- The only route with any auth is `POST /api/webhooks/smoobu` which checks a webhook secret.

#### SEC-2: Smoobu API Key Stored in Plaintext
- [ ] **HIGH:** The `smoobu_api_key` is stored in the `settings` table in Supabase in plaintext. The settings page loads ALL settings fields including this key to the client-side via the anon key Supabase client. This means the API key is exposed in the browser network tab to any user who can access the dashboard. The spec in PROJ-1 says "smoobu_api_key (verschluesselt)" but no encryption is implemented.

#### SEC-3: Service Role Key vs Anon Key
- [x] API routes correctly use `createServiceClient()` for server-side operations
- [ ] **MEDIUM:** The bookings page fetches `bookings` and `properties` using the anon key client directly from the browser. Without RLS policies, this exposes all data. The project rules mandate RLS but it's unclear if RLS is enabled/configured.

#### SEC-4: Input Validation
- [x] Zod validation on both API routes (rates + create)
- [x] Date range validation (checkOut must be after checkIn)
- [ ] **MEDIUM:** The `guestNote` and `guestIdNumber` fields are not sanitized for XSS before being stored and later rendered. The `guestNote` in BookingDetailSheet is rendered directly in `<p>` tags. React escapes by default, but if this data later flows into PDF generation or email, it could be exploited.

#### SEC-5: Rate Limiting
- [ ] **MEDIUM:** No rate limiting on any API routes. An attacker could spam `/api/bookings/create` to create thousands of bookings in Smoobu or exhaust the Smoobu API rate limit (50 req/min).

#### SEC-6: Error Information Leakage
- [ ] **LOW:** API routes return raw error messages from Smoobu API (`error.message`). These could leak internal implementation details (API URLs, response structures) to attackers.

#### SEC-7: CSRF Protection
- [x] Next.js API routes are protected against CSRF by default (SameSite cookies, no cookie-based auth)

---

### Bugs Found

#### BUG-1: Smoobu API Key Configuration Mismatch (Wizard Cannot Function)
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Configure `SMOOBU_API_KEY` in `.env.local`
  2. Run Smoobu sync from Einstellungen page -- works fine
  3. Open Buchungen page, click "Buchung anlegen"
  4. Fill in dates, click "Verfuegbarkeit & Preise pruefen"
  5. Expected: Rates are fetched from Smoobu
  6. Actual: Error "Smoobu API-Key nicht konfiguriert" because `/api/smoobu/rates` reads from `settings.smoobu_api_key` (database) which is never populated
- **Root Cause:** Sync route uses `process.env.SMOOBU_API_KEY`, while rates and create routes use `settings.smoobu_api_key` from Supabase. The settings UI has no input field for the API key.
- **Priority:** Fix before deployment -- this makes the entire Wizard non-functional

#### BUG-2: No Authentication on API Routes
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Open browser or curl without any session
  2. Send `POST /api/bookings/create` with valid JSON body
  3. Expected: 401 Unauthorized
  4. Actual: Booking is created (if Smoobu API key is configured)
- **Priority:** Fix before deployment

#### BUG-3: Smoobu API Key Exposed in Plaintext to Browser
- **Severity:** High
- **Steps to Reproduce:**
  1. Open `/dashboard/einstellungen`
  2. Open browser DevTools > Network tab
  3. Observe the Supabase query fetches `SELECT *` from settings table
  4. Expected: API key is encrypted or not sent to client
  5. Actual: `smoobu_api_key` is returned in plaintext (if populated)
- **Priority:** Fix before deployment

#### BUG-4: Custom Date Range Filter Missing
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open Buchungen page
  2. Look at time range filter dropdown
  3. Expected: "Custom" option with date picker for arbitrary range
  4. Actual: Only predefined ranges (Dieser Monat, Letzter Monat, Quartal, Jahr, Alle)
- **Priority:** Fix in next sprint

#### BUG-5: Export is XLSX Instead of CSV
- **Severity:** Low
- **Steps to Reproduce:**
  1. Click "XLSX Export" button on Buchungen page
  2. Expected: CSV file as per spec ("CSV-Export der gefilterten Buchungsliste")
  3. Actual: XLSX file is downloaded
- **Note:** XLSX is arguably better than CSV, but deviates from the spec. Suggest updating spec to accept XLSX, or offering both formats.
- **Priority:** Nice to have

#### BUG-6: PLZ Validation Not Numeric for DE
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open Create Booking Wizard, proceed to Step 2
  2. Enter "ABCDE" in PLZ field
  3. Expected: Validation error "PLZ numerisch (fuer DE)"
  4. Actual: Accepted without error
- **Priority:** Fix in next sprint

#### BUG-7: Cleaning Fee Always null from Rates Endpoint
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Call `GET /api/smoobu/rates` with valid parameters
  2. Observe response: `cleaningFee` is always `null`
  3. Expected: Cleaning fee from Smoobu or a required manual input field
  4. Actual: Wizard silently sets cleaning fee to 0, user might not notice
- **Root Cause:** `SmoobuClient.getRates()` returns `cleaningFee: null` because Smoobu `/rates` endpoint does not provide cleaning fees. The wizard sets it to 0 without prompting the user. The spec says "Reinigungsgebuehr wird aus Smoobu uebernommen; falls nicht geliefert: Pflichtfeld zur manuellen Eingabe"
- **Priority:** Fix before deployment -- users will create bookings with 0 cleaning fee

#### BUG-8: No Rate Limiting on API Endpoints
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send 1000 rapid POST requests to `/api/bookings/create`
  2. Expected: Rate limiting kicks in after N requests
  3. Actual: All requests processed, potentially creating thousands of bookings
- **Priority:** Fix before deployment

#### BUG-9: Promo Code Silently Ignored
- **Severity:** Low
- **Steps to Reproduce:**
  1. Enter a promo code in Wizard Step 1
  2. Click "Verfuegbarkeit & Preise pruefen"
  3. Expected: Validation feedback if promo code is invalid
  4. Actual: Promo code parameter is sent to Smoobu but the Smoobu rates API does not process it; no user feedback
- **Priority:** Nice to have

#### BUG-10: Accommodation Tax Label Shows Hardcoded "%" Even for Non-Percentage Models
- **Severity:** Low
- **Steps to Reproduce:**
  1. Configure a property with `per_person_per_night` tax model
  2. Open Create Booking Wizard, check rates
  3. Observe tax label shows "Beherbergungssteuer (2%)" instead of "Beherbergungssteuer (2 EUR/Person/Nacht)"
  4. Expected: Correct unit based on tax model
  5. Actual: Always shows "%"
- **Priority:** Nice to have

---

### Summary
- **Acceptance Criteria:** 20/30 passed (10 failed)
- **Bugs Found:** 10 total (2 critical, 1 high, 3 medium, 4 low)
- **Security:** 4 issues found (2 critical: no auth, API key exposure; 2 medium: no rate limiting, potential RLS gap)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (API key mismatch) and BUG-2 (no auth) before any deployment. BUG-3 (API key exposure) and BUG-7 (cleaning fee) should also be addressed in the same fix cycle.

## Deployment
_To be added by /deploy_

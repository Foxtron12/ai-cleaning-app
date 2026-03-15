# PROJ-14: Rechnungs-Erweiterungen

## Status: In Review
**Created:** 2026-03-15
**Last Updated:** 2026-03-15

## Dependencies
- Requires: PROJ-5 (Rechnungserstellung PDF) - Basis-Rechnungsfunktionalität
- Requires: PROJ-2 (Buchungsmanagement) - Buchungsdaten als Quelle

---

## Beschreibung

Drei gezielte Erweiterungen des bestehenden Rechnungs-Workflows (PROJ-5):
1. **Notizfeld / Freitext-Anschreiben** – ein optionales Freitext-Feld pro Rechnung, das auf dem PDF erscheint
2. **Zahlungsplan / Ratenzahlung** – eine Rechnung mit tabellarisch aufgeteilten monatlichen Zahlungsterminen
3. **Leistungszeitraum** – explizite Anreise/Abreise-Felder auf dem Rechnungsformular, die aus der Buchung vorausgefüllt werden

---

## User Stories

1. Als Vermieter möchte ich auf einer Rechnung eine persönliche Notiz oder ein Anschreiben hinterlassen können (z.B. „Vielen Dank für Ihren Aufenthalt – wir freuen uns auf Ihren nächsten Besuch!"), damit die Rechnung eine persönliche Note erhält.
2. Als Vermieter möchte ich bei langen Buchungen (mehrere Monate) einen Zahlungsplan auf der Rechnung anzeigen können, der den Gesamtbetrag in gleichmäßige monatliche Raten aufteilt, damit der Gast weiß, wann welcher Betrag fällig ist.
3. Als Vermieter möchte ich den Leistungszeitraum (Anreise- und Abreisedatum) direkt auf dem Rechnungsformular sehen und bearbeiten können, damit das Datum automatisch aus der Buchung übernommen wird und korrekt auf dem PDF steht.

---

## Acceptance Criteria

### AC-1: Notizfeld / Freitext-Anschreiben

- [ ] Im Rechnungsformular (Dialog für manuelle Erstellung und auto-generierte Rechnungen beim Bearbeiten) gibt es ein optionales Freitext-Feld „Notiz / Anschreiben"
- [ ] Das Feld ist ein mehrzeiliges `Textarea` (mind. 3 Zeilen sichtbar, unbegrenzte Länge)
- [ ] Der Inhalt wird in der `invoices`-Tabelle als `notes`-Spalte (text, nullable) gespeichert
- [ ] Wenn das Feld gefüllt ist, erscheint der Text im PDF:
  - Zwischen dem Rechnungstitel und der Positionen-Tabelle
  - Als Fließtext mit normaler Schriftgröße
- [ ] Wenn das Feld leer ist, erscheint kein leerer Abstand im PDF
- [ ] Beim Bearbeiten einer bestehenden Rechnung wird der gespeicherte Notiztext vorausgefüllt
- [ ] Für neue Rechnungen ist das Feld standardmäßig leer (keine Standard-Vorlage)

### AC-2: Zahlungsplan / Ratenzahlung

- [ ] Im Rechnungsformular gibt es eine optionale Checkbox „Zahlungsplan (monatliche Raten)"
- [ ] Wenn aktiviert, wird der Zahlungsplan berechnet:
  - Der Gesamtbetrag der Rechnung wird gleichmäßig auf die Monate des Buchungszeitraums aufgeteilt
  - **Formel:** `Betrag pro Monat = Gesamtbetrag / Anzahl Monate` (gerundet auf 2 Dezimalstellen)
  - **Rundungsrest:** Der letzte Monat erhält den Rest, sodass die Summe aller Raten exakt dem Gesamtbetrag entspricht
  - Fälligkeitsdatum pro Rate: 1. des jeweiligen Monats (erster Monat: 1. des Check-in-Monats)
- [ ] Der Zahlungsplan wird im PDF als Tabelle nach den Rechnungspositionen angezeigt:
  ```
  Zahlungsplan:
  01.01.2025   300,00 EUR
  01.02.2025   300,00 EUR
  01.03.2025   299,00 EUR  ← Rest
  ─────────────────────────
  Gesamt:      899,00 EUR
  ```
- [ ] Der Zahlungsplan wird in der `invoices`-Tabelle als `payment_schedule` (JSONB, nullable) gespeichert: Array aus `{ due_date: string, amount: number }`
- [ ] Wenn kein Zahlungsplan aktiv ist, ändert sich am PDF nichts (kein leerer Abschnitt)
- [ ] Der Zahlungsplan ist nur aktivierbar, wenn Anreise UND Abreise bekannt sind
- [ ] Wenn der Buchungszeitraum weniger als 2 Monate umfasst, ist die Checkbox deaktiviert (mit Tooltip: „Ratenzahlung ab 2 Monaten Aufenthaltsdauer")

### AC-3: Gastadresse aus Smoobu-Buchungsdaten vorausfüllen

- [ ] Wenn über den Button „Rechnung erstellen" im Buchungs-Detail-Sheet eine Rechnung angelegt wird, werden die Gastadressdaten aus der Buchung übernommen:
  - Straße + Hausnummer (`booking.guest_address` / `bookings.guest_street`)
  - PLZ (`booking.guest_zip`)
  - Ort (`booking.guest_city`)
  - Land (`booking.guest_country` / `booking.guest_country_iso`)
- [ ] Die Felder sind im Rechnungsformular vorausgefüllt und manuell editierbar
- [ ] Wenn keine Adresse in der Buchung vorhanden ist (z.B. Airbnb liefert keine vollständige Adresse), bleiben die Felder leer und werden rot markiert als „bitte manuell ergänzen"
- [ ] Die Adresse wird im `invoices`-Eintrag im `guest_snapshot`-JSONB gespeichert (wie heute bereits die anderen Gastdaten)

### AC-4: Leistungszeitraum (Anreise / Abreise)

- [ ] Im Rechnungsformular gibt es explizite Felder „Anreise" und „Abreise" (Datumsfelder)
- [ ] Bei Erstellung aus einer Buchung werden diese automatisch aus `booking.check_in` und `booking.check_out` vorausgefüllt
- [ ] Die Felder sind manuell editierbar (für Sonderfälle ohne Buchungsdaten)
- [ ] Anreise/Abreise werden in der `invoices`-Tabelle als `check_in` und `check_out` (date, nullable) gespeichert
- [ ] Im PDF erscheinen Anreise und Abreise in der Meta-Spalte rechts oben (bereits im bestehenden Layout vorgesehen)
- [ ] Die Auto-Generierung (`auto-generate-invoices.ts`) befüllt diese Felder aus den Buchungsdaten
- [ ] Der Button „Rechnung erstellen" im Buchungs-Detail-Sheet öffnet den Rechnungsdialog mit vorausgefüllten Leistungszeitraum-Feldern

---

## Edge Cases

1. **Buchungszeitraum über Monatsgrenze:** Check-in 20. Januar, Check-out 10. März → 3 Raten (Jan, Feb, Mär) – Monate werden nach Check-in-Datum gezählt, nicht nach exakten Tagen
2. **Ganzzahliger Betrag durch Monatsanzahl teilbar:** Keine Rundungsdifferenz → alle Raten gleich
3. **Sehr lange Notiz:** Sehr langer Text soll im PDF korrekt umgebrochen werden (kein Überlauf)
4. **Leistungszeitraum ohne Buchung:** Manuelle Rechnung ohne Buchungsbezug – Felder bleiben leer und müssen manuell ausgefüllt werden
5. **Bestehende Rechnungen:** Bestehende `invoices`-Einträge ohne `notes`, `payment_schedule`, `check_in`, `check_out` funktionieren weiterhin korrekt (alle Felder nullable)
6. **Storno-Rechnung:** Bei Stornorechnung wird kein Zahlungsplan angezeigt (immer einmaliger Betrag)

---

## Datenbankänderungen

Neue Spalten in der `invoices`-Tabelle:

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| `notes` | text, nullable | Freitext-Anschreiben/Notiz |
| `payment_schedule` | jsonb, nullable | Array aus `{ due_date, amount }` |
| `check_in` | date, nullable | Anreisedatum (Leistungszeitraum) |
| `check_out` | date, nullable | Abreisedatum (Leistungszeitraum) |

> **Hinweis:** `check_in` / `check_out` sind möglicherweise bereits vorhanden (PROJ-5 Tech Design erwähnt diese Felder). Vor Migration prüfen.

---

## Betroffene Dateien (Orientierung für Entwickler)

| Datei | Änderung |
|-------|----------|
| `src/app/dashboard/rechnungen/page.tsx` | Notizfeld, Zahlungsplan-Checkbox, Leistungszeitraum-Felder im Formular |
| `src/lib/pdf/invoice.tsx` | Notiz-Abschnitt im PDF, Zahlungsplan-Tabelle im PDF |
| `src/lib/auto-generate-invoices.ts` | `check_in`, `check_out`, `notes` (leer) aus Buchung befüllen |
| Supabase Migration | 4 neue Spalten in `invoices` |

---

## Tech Design (Solution Architect)
**Hinzugefügt:** 2026-03-15

### Bestandsaufnahme – Was bereits existiert

**AC-3 (Gastadresse) → BEREITS IMPLEMENTIERT:**
`fillFromBooking()` liest bereits `guest_street`, `guest_zip`, `guest_city`, `guest_country` aus der Buchung und setzt `guestAddress`. Der `guest_snapshot` im Invoice speichert `street`, `city`, `zip`, `country`. Keine Änderung nötig.

**AC-4 (Leistungszeitraum) → BEREITS IMPLEMENTIERT:**
`service_period_start` / `service_period_end` existieren in der `invoices`-Tabelle und werden aus `booking.check_in` / `check_out` befüllt. Das PDF zeigt Anreise/Abreise in der Meta-Spalte. Keine Änderung nötig.

**→ Verbleibende Arbeit: nur AC-1 (Notizfeld) und AC-2 (Zahlungsplan)**

---

### AC-1: Notizfeld / Freitext-Anschreiben

**Komponenten-Baum (Ergänzung im Rechnungs-Dialog):**
```
Rechnungs-Dialog (bestehend)
├── Buchungs-Auswahl (bestehend)
├── Gastdaten (bestehend)
├── [NEU] Notiz / Anschreiben (Textarea, optional)
├── Positionen-Tabelle (bestehend)
└── Speichern-Button (bestehend)
```

**PDF-Layout (Ergänzung):**
```
Rechnung
├── Header (Logo, Adresse, Meta) – bestehend
├── Titel "Rechnung" – bestehend
├── [NEU] Notiz-Text (Fließtext, nur wenn gefüllt)
├── Positionen-Tabelle – bestehend
├── Summen + MwSt – bestehend
└── Footer – bestehend
```

**Datenmodell:**
- Neue Spalte `notes` (text, nullable) in der `invoices`-Tabelle
- Wird im Formular als `Textarea` angezeigt
- Beim Speichern wird der Text in die DB geschrieben
- Im PDF: Render nur wenn `notes` nicht leer (kein leerer Abstand)
- Auto-Generierung: `notes` bleibt leer (null)

---

### AC-2: Zahlungsplan / Ratenzahlung

**Komponenten-Baum (Ergänzung im Rechnungs-Dialog):**
```
Rechnungs-Dialog (bestehend)
├── ...
├── Positionen-Tabelle (bestehend)
├── [NEU] Checkbox "Zahlungsplan (monatliche Raten)"
│   ├── Disabled + Tooltip wenn Zeitraum < 2 Monate
│   └── Wenn aktiv: Zahlungsplan-Vorschau
│       ├── Tabelle: Fälligkeitsdatum | Betrag
│       └── Summenzeile
└── Speichern-Button (bestehend)
```

**PDF-Layout (Ergänzung):**
```
Rechnung (PDF)
├── ...
├── Summen + MwSt – bestehend
├── [NEU] Zahlungsplan-Tabelle (nur wenn aktiv)
│   ├── Spalten: Fälligkeitsdatum | Betrag
│   ├── Zeilen pro Monat
│   └── Summenzeile
├── Zahlung / Offener Saldo – bestehend
└── Footer – bestehend
```

**Datenmodell:**
- Neue Spalte `payment_schedule` (jsonb, nullable) in der `invoices`-Tabelle
- Format: Array aus Objekten mit `due_date` (string "YYYY-MM-DD") und `amount` (number)
- Beispiel: `[{ "due_date": "2025-01-01", "amount": 300 }, { "due_date": "2025-02-01", "amount": 300 }, { "due_date": "2025-03-01", "amount": 299 }]`

**Berechnungslogik (Übersicht):**
1. Anzahl Monate = Differenz zwischen Check-in-Monat und Check-out-Monat + 1
2. Betrag pro Monat = Gesamtbetrag / Anzahl Monate (gerundet auf 2 Dezimalen)
3. Letzte Rate = Gesamtbetrag - (Ratenbetrag × (Monate - 1)) → fängt Rundungsdifferenz ab
4. Fälligkeitsdatum = 1. des jeweiligen Monats

**Bedingungen:**
- Zahlungsplan nur aktivierbar wenn Leistungszeitraum (Anreise + Abreise) bekannt
- Zahlungsplan nur aktivierbar wenn Zeitraum ≥ 2 Monate
- Bei Storno-Rechnungen: kein Zahlungsplan möglich
- Auto-Generierung: `payment_schedule` bleibt null

---

### DB-Migration

Neue Spalten in der `invoices`-Tabelle:

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| `notes` | text, nullable | Freitext-Anschreiben |
| `payment_schedule` | jsonb, nullable | Array aus `{ due_date, amount }` |

> `check_in` / `check_out` entfallen – existieren bereits als `service_period_start` / `service_period_end`.

---

### Gesamtübersicht betroffene Dateien

| Datei | AC | Änderung |
|-------|-----|----------|
| `src/app/dashboard/rechnungen/page.tsx` | AC-1 + AC-2 | Textarea für Notiz, Checkbox + Zahlungsplan-Vorschau, `notes` + `payment_schedule` beim Speichern/Laden |
| `src/lib/pdf/invoice.tsx` | AC-1 + AC-2 | Notiz-Text rendern, Zahlungsplan-Tabelle rendern |
| `src/lib/database.types.ts` | AC-1 + AC-2 | 2 neue Felder im Invoice-Typ |
| Supabase Migration | AC-1 + AC-2 | 2 neue Spalten |

### Keine neuen Packages
- Alles mit bestehenden UI-Komponenten und `@react-pdf/renderer` machbar

### Tech-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| `notes` als `text` (nicht JSONB) | Einfacher Freitext, keine Struktur nötig |
| `payment_schedule` als `jsonb` | Flexibles Array-Format, kein festes Schema, einfach erweiterbar |
| Zahlungsplan berechnet im Frontend | Kein Roundtrip nötig, Ergebnis wird in DB gespeichert |
| AC-3 und AC-4 nicht nochmal anfassen | Bereits korrekt implementiert – kein Doppelaufwand |

---

## Deployment
_To be added by /deploy_

---

## QA Test Results

**Tested:** 2026-03-15
**App URL:** http://localhost:3000/dashboard/rechnungen
**Tester:** QA Engineer (AI)
**Build:** PASS (production build succeeds without errors)

### Acceptance Criteria Status

#### AC-1: Notizfeld / Freitext-Anschreiben
- [x] Im Rechnungsformular gibt es ein optionales Freitext-Feld "Notiz / Anschreiben" (Textarea, line 1204-1215)
- [x] Das Feld ist ein mehrzeiliges Textarea mit `rows={3}` (mindestens 3 Zeilen sichtbar)
- [x] Der Inhalt wird als `notes`-Spalte (text, nullable) gespeichert (Migration vorhanden, line 653 `notes: notes.trim() || null`)
- [x] Wenn das Feld gefuellt ist, erscheint der Text im PDF zwischen Titel und Positionen (invoice.tsx line 346-350)
- [x] Wenn das Feld leer ist, wird kein leerer Abstand gerendert (bedingte Render-Logik `data.notes ? ... : null`)
- [ ] BUG-1: Beim Bearbeiten/Laden einer bestehenden Rechnung wird das Notizfeld NICHT vorausgefuellt -- es gibt keinen Bearbeitungs-Flow fuer bestehende Rechnungen, nur Neuanlage
- [x] Fuer neue Rechnungen ist das Feld standardmaessig leer (line 1023 `setNotes('')`)

#### AC-2: Zahlungsplan / Ratenzahlung
- [x] Im Rechnungsformular gibt es eine Checkbox "Zahlungsplan (monatliche Raten)" (line 1258-1263)
- [x] Berechnung korrekt: Gesamtbetrag / Anzahl Monate, Rundungsrest auf letzte Rate (line 1242-1252)
- [x] Zahlungsplan wird im PDF als Tabelle nach Rechnungspositionen angezeigt (invoice.tsx line 401-430)
- [x] Zahlungsplan wird als `payment_schedule` (JSONB, nullable) gespeichert (line 654)
- [x] Wenn kein Zahlungsplan aktiv ist, aendert sich am PDF nichts (bedingte Render-Logik)
- [x] Zahlungsplan nur aktivierbar wenn Anreise UND Abreise bekannt sind (line 1220-1231)
- [x] Checkbox deaktiviert wenn Zeitraum < 2 Monate, mit Tooltip (line 1262, 1267-1278)
- [x] Fuer die PDF-Summenzeile stimmt die Berechnung: Summe aller Raten == Gesamtbetrag (invoice.tsx line 424-428)
- [x] Zahlungsplan-Vorschau im Dialog korrekt (line 1282-1296)

#### AC-3: Gastadresse aus Smoobu-Buchungsdaten vorausfuellen
- [x] Gastadresse wird aus der Buchung uebernommen (line 266-269: `guest_street`, `guest_zip`, `guest_city`, `guest_country`)
- [x] Felder sind im Rechnungsformular vorausgefuellt und manuell editierbar (line 1064-1065)
- [ ] BUG-2: Die Gastadresse wird im `guest_snapshot` bei manueller Rechnungserstellung als einzelner String "address" gespeichert (line 613: `address: guestAddress`), nicht als separate Felder (street, city, zip, country). Die Split-Invoice-Logik (line 421-428) speichert sie dagegen korrekt als separate Felder. Dies fuehrt dazu, dass beim PDF-Download die strukturierte Adress-Darstellung (Strasse / PLZ Ort / Land) nicht funktioniert fuer manuell erstellte Rechnungen.
- [ ] BUG-3: Wenn keine Adresse in der Buchung vorhanden ist, werden die Felder NICHT rot markiert als "bitte manuell ergaenzen" -- es gibt keine visuelle Pflichtfeld-Markierung im Rechnungsformular fuer die Gastadresse

#### AC-4: Leistungszeitraum (Anreise / Abreise)
- [x] Leistungszeitraum wird aus `service_period_start` / `service_period_end` gespeichert (existierte bereits, line 665-666)
- [x] Bei Erstellung aus einer Buchung werden diese automatisch aus `booking.check_in` / `booking.check_out` vorausgefuellt
- [x] Im PDF erscheinen Anreise und Abreise in der Meta-Spalte rechts oben (invoice.tsx line 312-319)
- [x] Auto-Generierung befuellt diese Felder aus den Buchungsdaten
- [ ] BUG-4: Es gibt KEINE expliziten Datums-Eingabefelder fuer Anreise/Abreise im Rechnungsformular. Der Leistungszeitraum wird implizit aus der gewahlten Buchung uebernommen, ist aber nicht manuell editierbar im Dialog. Die AC verlangt: "Die Felder sind manuell editierbar (fuer Sonderfaelle ohne Buchungsdaten)"

### Edge Cases Status

#### EC-1: Buchungszeitraum ueber Monatsgrenze
- [x] Zahlungsplan zaehlt Monate korrekt (Differenz der Monate + 1)

#### EC-2: Ganzzahliger Betrag teilbar
- [x] Keine Rundungsdifferenz -- alle Raten gleich (letzte Rate faengt Rest ab)

#### EC-3: Sehr lange Notiz
- [x] PDF-Text verwendet `lineHeight: 1.5` und fontSize 9 -- Fliesstext bricht korrekt um (react-pdf handles line wrapping)

#### EC-4: Leistungszeitraum ohne Buchung
- [x] Ohne Buchung bleiben `service_period_start/end` null (line 665-666)

#### EC-5: Bestehende Rechnungen ohne neue Felder
- [x] `notes` und `payment_schedule` sind nullable in der DB und im TypeScript-Interface (InvoiceRow line 92-93)

#### EC-6: Storno-Rechnung
- [ ] BUG-5: Es gibt keine explizite Pruefung, die den Zahlungsplan bei Storno-Rechnungen deaktiviert. Die Checkbox bleibt aktiv, solange eine Buchung mit >= 2 Monaten gewaehlt ist, auch wenn die Rechnung den Status "cancelled" hat.

### Security Audit Results
- [x] Authentication: Seite nur mit Login erreichbar (Dashboard-Layout prueft Auth)
- [x] Authorization: RLS auf `invoices`-Tabelle schuetzt vor Zugriff auf fremde Daten
- [x] Input Validation: `notes` wird per `trim() || null` bereinigt, kein XSS-Risiko (Text wird im PDF gerendert, nicht als HTML)
- [x] Keine Secrets exponiert in Client-Bundle
- [x] `payment_schedule` wird serverseitig korrekt als JSONB gespeichert
- [x] Supabase parametrisierte Queries verhindern SQL-Injection

### Cross-Browser & Responsive
- [x] Desktop (1440px): Dialog und Formular korrekt dargestellt (grid-cols-12 fuer Positionen)
- [ ] BUG-6: Mobil (375px): Die Positionen-Tabelle im Dialog verwendet `grid-cols-12` (line 1089) ohne responsive Breakpoints. Auf 375px werden die Spalten extrem schmal und kaum bedienbar. Es fehlt ein `sm:grid-cols-12 grid-cols-1` oder aehnliches responsive Layout.

### Bugs Found

#### BUG-1: Kein Bearbeitungs-Flow fuer bestehende Rechnungen (Notiz nicht vorausfuellbar)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Erstelle eine Rechnung mit Notiz
  2. Versuche die bestehende Rechnung zu bearbeiten
  3. Expected: Notizfeld ist vorausgefuellt
  4. Actual: Es gibt keinen Bearbeitungs-Flow -- nur Neuanlage und Loeschen
- **Priority:** Nice to have -- AC sagt "Beim Bearbeiten einer bestehenden Rechnung", aber die App hat keinen Edit-Flow

#### BUG-2: guest_snapshot bei manueller Rechnung speichert Adresse als einzelnen String statt separate Felder
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Erstelle manuell eine Rechnung aus einer Buchung mit Gastadresse
  2. Lade das PDF herunter
  3. Expected: Strukturierte Adress-Darstellung (Strasse, PLZ Ort, Land getrennt)
  4. Actual: Adresse wird als einzeilige Zeichenkette angezeigt (`guestAddress` statt `street/zip/city/country`)
- **Location:** `rechnungen/page.tsx` line 610-617 -- `guestSnapshotData` hat `address: guestAddress` statt separate Felder
- **Priority:** Fix before deployment -- Inkonsistenz mit Split-Invoice-Logik und beeintraechtigt PDF-Darstellung

#### BUG-3: Fehlende visuelle Pflichtfeld-Markierung fuer Gastadresse
- **Severity:** Low
- **Steps to Reproduce:**
  1. Oeffne Rechnungs-Dialog ohne Buchung oder mit Buchung ohne Adresse
  2. Expected: Adressfelder rot markiert mit Hinweis "bitte manuell ergaenzen"
  3. Actual: Felder bleiben normal, kein Hinweis
- **Priority:** Nice to have

#### BUG-4: Leistungszeitraum nicht manuell editierbar im Rechnungsformular
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Oeffne Rechnungs-Dialog
  2. Expected: Explizite Datums-Eingabefelder fuer Anreise und Abreise, manuell editierbar
  3. Actual: Leistungszeitraum wird implizit aus der Buchung uebernommen, keine editierbaren Felder
- **Priority:** Fix in next sprint -- betrifft Sonderfaelle ohne Buchungsdaten

#### BUG-5: Zahlungsplan bei Storno-Rechnungen nicht deaktiviert
- **Severity:** Low
- **Steps to Reproduce:**
  1. Waehle eine Buchung mit >= 2 Monaten
  2. Aktiviere Zahlungsplan
  3. Speichere die Rechnung, setze Status auf "Storniert"
  4. Expected: Zahlungsplan nicht darstellbar/deaktiviert bei Storno
  5. Actual: Zahlungsplan bleibt im PDF sichtbar
- **Priority:** Nice to have -- Storno-Rechnungen sind selten

#### BUG-6: Positionen-Tabelle nicht responsiv auf Mobil (375px)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Oeffne Rechnungs-Dialog auf einem 375px-Bildschirm
  2. Expected: Positionen sind lesbar und bedienbar
  3. Actual: grid-cols-12 quetscht alles zusammen, Felder kaum nutzbar
- **Priority:** Fix in next sprint

### Summary
- **Acceptance Criteria:** 20/26 Sub-Kriterien bestanden, 6 fehlgeschlagen
- **Edge Cases:** 5/6 bestanden
- **Bugs Found:** 6 total (0 critical, 0 high, 3 medium, 3 low)
- **Security:** PASS -- keine Sicherheitsluecken gefunden
- **Production Ready:** NEIN -- BUG-2 (Medium) sollte vor Deployment gefixt werden
- **Recommendation:** BUG-2 (guest_snapshot-Adresse) ist der wichtigste Fix, da er die PDF-Darstellung betrifft. BUG-4 und BUG-6 koennen im naechsten Sprint behoben werden.

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

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

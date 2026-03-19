# PROJ-18: Stornorechnung & Gutschrift

## Status: In Progress
**Created:** 2026-03-19
**Last Updated:** 2026-03-19

## Dependencies
- Requires: PROJ-5 (Rechnungserstellung) – Basis-Rechnungssystem, PDF-Generierung, Rechnungsarchiv
- Requires: PROJ-6 (Beherbergungssteuer-Tracking) – BhSt-Neuberechnung bei Aufenthaltsverkürzung
- Requires: PROJ-10 (Auth & Multi-Tenancy) – User-Isolation, RLS

## Beschreibung

GoBD-konforme Erweiterung des Rechnungssystems um Stornorechnungen und Gutschriften. Bestehende Rechnungen dürfen nicht gelöscht oder verändert werden – Korrekturen erfolgen ausschließlich über Stornorechnungen (100%-Storno) oder Gutschriften (Teilerstattung). Beide Dokumenttypen erhalten eigene fortlaufende Nummernkreise und erscheinen im Rechnungsarchiv.

### Praxis-Workflows

**Stornorechnung:** Eine Rechnung wurde verschickt, ein Fehler wird festgestellt → Storno der gesamten Rechnung → neue korrekte Rechnung wird erstellt. Die alte Rechnung wird zu 100% storniert, der Buchungsbetrag auf 0 gesetzt, dann nimmt er den Wert der neuen Rechnung an.

**Gutschrift:** Eine Rechnung wurde bezahlt, die Leistung wurde (teilweise) erbracht → nachträgliche Teilerstattung nötig (z.B. Mangel, verkürzter Aufenthalt) → Gutschrift über den Erstattungsbetrag. Die Originalrechnung bleibt gültig.

## User Stories

### Stornorechnung
- Als Vermieter möchte ich eine bestehende Rechnung vollständig stornieren können, damit ich eine fehlerhafte Rechnung GoBD-konform korrigieren kann.
- Als Vermieter möchte ich, dass die Stornorechnung automatisch alle Positionen der Originalrechnung als negative Beträge übernimmt, damit ich keinen manuellen Aufwand habe.
- Als Vermieter möchte ich, dass die Stornorechnung eine eigene fortlaufende Nummer (ST-2026-001) erhält, damit mein Nummernkreis für Stornos übersichtlich bleibt.
- Als Vermieter möchte ich, dass nach dem Storno der Buchungsbetrag auf 0 gesetzt wird und ich anschließend eine neue korrekte Rechnung erstellen kann.
- Als Vermieter möchte ich die Stornorechnung als PDF herunterladen können, um sie dem Gast und meiner Buchhaltung bereitzustellen.

### Gutschrift
- Als Vermieter möchte ich eine Gutschrift für eine bestehende Rechnung erstellen können, damit ich Teilerstattungen (z.B. bei Mängeln oder verkürztem Aufenthalt) dokumentieren kann.
- Als Vermieter möchte ich die Art der Gutschrift auswählen können (einfache Erstattung vs. Aufenthaltsverkürzung), damit die Beherbergungssteuer korrekt behandelt wird.
- Als Vermieter möchte ich bei einer Gutschrift die Positionen manuell eintragen können (Beschreibung + Betrag), damit ich den Erstattungsgrund dokumentieren kann.
- Als Vermieter möchte ich, dass der Buchungsbetrag automatisch um den Gutschriftsbetrag reduziert wird, damit meine Finanzdaten konsistent bleiben.
- Als Vermieter möchte ich die Gutschrift als PDF herunterladen können mit einer eigenen Nummer (GS-2026-001).

## Acceptance Criteria

### Nummernkreise
- [ ] Stornorechnungen erhalten eigenen Nummernkreis: `ST-{Jahr}-{Nummer}` (z.B. ST-2026-001)
- [ ] Gutschriften erhalten eigenen Nummernkreis: `GS-{Jahr}-{Nummer}` (z.B. GS-2026-001)
- [ ] Beide Nummernkreise sind fortlaufend und lückenlos (GoBD)
- [ ] Settings-Tabelle enthält eigene Zähler: `storno_next_number`, `gutschrift_next_number`
- [ ] Nummern werden beim Erstellen automatisch vergeben und der Zähler inkrementiert

### Stornorechnung – Funktional
- [ ] Button "Storno erstellen" ist verfügbar bei Rechnungen mit Status "created" oder "paid"
- [ ] Bestätigungsdialog vor Erstellung ("Möchten Sie Rechnung RE-2026-005 vollständig stornieren?")
- [ ] Stornorechnung wird automatisch generiert: alle Positionen der Originalrechnung mit negativen Beträgen
- [ ] Stornorechnung referenziert die Originalrechnung (`cancelled_invoice_id` = Original-ID)
- [ ] Originalrechnung bekommt Status `cancelled`
- [ ] Buchungsbetrag (`bookings.amount_gross`) wird auf 0 gesetzt
- [ ] Nach Storno kann eine neue Rechnung für dieselbe Buchung erstellt werden (normaler RE-Nummernkreis)
- [ ] Stornorechnung hat Status `created` (nicht editierbar, da automatisch generiert)

### Gutschrift – Funktional
- [ ] Button "Gutschrift erstellen" ist verfügbar bei Rechnungen mit Status "created" oder "paid"
- [ ] Dialog zur Gutschrift-Erstellung mit folgenden Feldern:
  - Art der Gutschrift: Dropdown (Einfache Erstattung / Aufenthaltsverkürzung)
  - Positionen: Manuelle Eingabe (Beschreibung + Bruttobetrag), beliebig viele Zeilen
  - Grund/Info: Textfeld (wird als Notiz auf der Gutschrift angezeigt)
- [ ] Bei "Einfache Erstattung": Buchungsbetrag (`amount_gross`) wird um Gutschriftssumme reduziert, Beherbergungssteuer bleibt unverändert
- [ ] Bei "Aufenthaltsverkürzung": Eingabefeld für neue Nächteanzahl, Buchungsbetrag wird reduziert UND Beherbergungssteuer wird auf Basis der neuen Nächteanzahl neu berechnet
- [ ] Gutschrift referenziert die Originalrechnung (`cancelled_invoice_id` = Original-ID)
- [ ] Originalrechnung behält ihren Status (bleibt "created" oder "paid")
- [ ] Gutschrift hat Status `created`
- [ ] Gutschriftsbetrag darf nicht höher sein als der Rechnungsbetrag

### PDF-Layout
- [ ] Stornorechnung-PDF: Titel "Stornorechnung" statt "Rechnung"
- [ ] Stornorechnung-PDF: Hinweistext "Storno zu Rechnung RE-2026-005 vom [Datum]"
- [ ] Stornorechnung-PDF: Alle Beträge als negative Werte dargestellt
- [ ] Stornorechnung-PDF: MwSt-Aufschlüsselung mit negativen Werten
- [ ] Gutschrift-PDF: Titel "Gutschrift" statt "Rechnung"
- [ ] Gutschrift-PDF: Hinweistext "Gutschrift zu Rechnung RE-2026-005 vom [Datum]"
- [ ] Gutschrift-PDF: Manuell eingetragene Positionen mit negativen Beträgen
- [ ] Gutschrift-PDF: Grund/Info-Text wird angezeigt (sofern eingetragen)
- [ ] Beide PDF-Typen verwenden dasselbe Basis-Layout wie normale Rechnungen (Header, Footer, Logo)

### Rechnungsarchiv (UI)
- [ ] Stornorechnungen und Gutschriften erscheinen im Rechnungsarchiv
- [ ] Eigener Typ-Badge: "Storno" (rot), "Gutschrift" (orange), "Rechnung" (standard)
- [ ] Filter-Option nach Dokumenttyp (Rechnung / Storno / Gutschrift)
- [ ] PDF-Download für alle drei Typen
- [ ] Stornierte Originalrechnungen zeigen visuell den Status "Storniert" (z.B. durchgestrichen oder Badge)

### Datenintegrität
- [ ] Stornorechnungen und Gutschriften können nicht gelöscht werden (GoBD)
- [ ] Stornorechnungen können nicht bearbeitet werden (automatisch generiert)
- [ ] Gutschriften können nicht bearbeitet werden nach Erstellung
- [ ] Eine bereits stornierte Rechnung kann nicht erneut storniert werden
- [ ] Für eine Buchung kann es maximal eine aktive Stornorechnung geben
- [ ] Gutschriften können nur erstellt werden, wenn der resultierende Buchungsbetrag >= 0 bleibt

### Buchungsbetrag-Aktualisierung
- [ ] Bei Storno: `bookings.amount_gross` wird auf 0 gesetzt
- [ ] Bei Gutschrift (einfache Erstattung): `bookings.amount_gross` wird um Gutschriftssumme reduziert
- [ ] Bei Gutschrift (Aufenthaltsverkürzung): `bookings.amount_gross` wird reduziert UND `bookings.check_out` / Nächteanzahl wird angepasst, BhSt wird neu berechnet
- [ ] Änderungen am Buchungsbetrag werden in der Buchungsübersicht und im Financial Reporting reflektiert

## Edge Cases

### Stornorechnung
- Rechnung im Status "draft" → Kein Storno möglich (Entwürfe können direkt gelöscht/überschrieben werden)
- Rechnung bereits storniert (Status "cancelled") → Button nicht verfügbar, Hinweis "Bereits storniert"
- Buchung hat bereits eine Gutschrift → Storno trotzdem möglich (storniert die Originalrechnung, nicht die Gutschrift)
- Nach Storno: Neue Rechnung hat anderen Betrag → Buchungsbetrag nimmt den neuen Rechnungsbetrag an
- Storno einer Rechnung mit Zahlungsplan → Stornorechnung hat keinen Zahlungsplan (einmaliger Negativbetrag)

### Gutschrift
- Gutschriftsbetrag > Rechnungsbetrag → Validierungsfehler ("Gutschrift darf nicht höher als Rechnungsbetrag sein")
- Mehrere Gutschriften für dieselbe Rechnung → Erlaubt, solange Summe aller Gutschriften ≤ Originalrechnungsbetrag
- Gutschrift für eine Rechnung die bereits eine Gutschrift hat → Prüfung: verbleibender Restbetrag wird als Maximum angezeigt
- Aufenthaltsverkürzung auf 0 Nächte → Nicht erlaubt (Minimum 1 Nacht, sonst Storno verwenden)
- Aufenthaltsverkürzung: neue Nächteanzahl ≥ aktuelle Nächteanzahl → Validierungsfehler
- Gutschrift nach Storno → Nicht möglich (Rechnung ist bereits storniert)
- Beherbergungssteuer-befreite Buchung (z.B. Geschäftsreise) → BhSt-Neuberechnung ergibt weiterhin 0
- Kleinunternehmerregelung → Gutschrift ohne MwSt-Ausweis (wie bei normaler Rechnung)

### Allgemein
- Make.com-Versand für Storno/Gutschrift → Sollte möglich sein (gleicher Webhook, anderer Dokumenttyp)
- Lexoffice-Integration (PROJ-9, Zukunft) → Storno/Gutschrift müssen exportierbar sein
- Reporting (PROJ-3) → Stornos und Gutschriften müssen in den Finanzzahlen berücksichtigt werden (negative Beträge)

## Datenmodell-Erweiterungen

### Neue Spalte in `invoices`-Tabelle
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `invoice_type` | text, NOT NULL, default 'invoice' | Dokumenttyp: 'invoice', 'storno', 'credit_note' |

### Neue Spalten in `settings`-Tabelle
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `storno_next_number` | integer, default 1 | Fortlaufende Nummer für Stornorechnungen |
| `gutschrift_next_number` | integer, default 1 | Fortlaufende Nummer für Gutschriften |

### Bestehende Felder (werden genutzt)
- `invoices.cancelled_invoice_id` → Referenz auf Originalrechnung (bereits vorhanden)
- `invoices.status` → 'cancelled' für stornierte Originalrechnungen (bereits vorhanden)
- `invoices.notes` → Grund/Info-Text bei Gutschriften (bereits vorhanden)

## USt-Behandlung

### Stornorechnung
- Spiegelt exakt die MwSt der Originalrechnung mit negativem Vorzeichen
- Alle line_items werden 1:1 übernommen, Beträge negiert
- vat_7_net, vat_7_amount, vat_19_net, vat_19_amount: alle negativ

### Gutschrift – Einfache Erstattung
- USt-Satz richtet sich nach der Art der erstatteten Leistung
- Bei pauschaler Erstattung (z.B. "Entschädigung Wasserschaden"): 7% USt (Beherbergungsleistung)
- Manuelle Positionen: Nutzer wählt USt-Satz pro Position (0%, 7%, 19%)
- Beherbergungssteuer wird NICHT angepasst

### Gutschrift – Aufenthaltsverkürzung
- Erstattungsbetrag = Differenz zwischen altem und neuem Buchungsbetrag
- USt wird aus dem Erstattungsbetrag korrekt berechnet (7% für Übernachtung)
- Beherbergungssteuer wird auf Basis der neuen Nächteanzahl neu berechnet
- BhSt-Differenz erscheint als separate Position auf der Gutschrift

---

## Tech Design (Solution Architect)

**Added:** 2026-03-19

### Komponentenstruktur

```
Rechnungsarchiv (bestehende Seite – erweitert)
+-- Filter-Leiste [ERWEITERT]
|   +-- Dokumenttyp-Filter: Alle / Rechnung / Storno / Gutschrift [NEU]
+-- Rechnungstabelle [ERWEITERT]
|   +-- Typ-Badge je Zeile [NEU]
|   |   +-- "Rechnung" (standard), "Storno" (rot), "Gutschrift" (orange)
|   +-- Status-Badge "Storniert" für stornierte Originalrechnungen [AKTUALISIERT]
|   +-- Aktionen je Zeile
|       +-- PDF Download [vorhanden]
|       +-- "Storno erstellen" [NEU – nur wenn Status: created/paid + not cancelled]
|       +-- "Gutschrift erstellen" [NEU – nur wenn Status: created/paid]
+-- StornoBestätigungsDialog [NEU] (shadcn alert-dialog)
|   +-- Warnung: "Rechnung RE-2026-005 vollständig stornieren?"
|   +-- Bestätigen / Abbrechen
+-- GutschriftDialog [NEU] (shadcn dialog)
    +-- Art-Dropdown: Einfache Erstattung / Aufenthaltsverkürzung
    +-- [wenn Aufenthaltsverkürzung] Neue Nächteanzahl
    +-- Positionen-Liste (dynamisch): Beschreibung + Bruttobetrag + USt-Satz
    +-- Grund/Info: Textfeld
    +-- Summen-Vorschau + Validierungshinweis (max. Erstattungsbetrag)
    +-- "Gutschrift erstellen" Button
```

### Datenbankänderungen

**`invoices` – neue Spalte:**
- `invoice_type`: text, NOT NULL, default `'invoice'` → Werte: `invoice`, `storno`, `credit_note`

**`settings` – neue Spalten:**
- `storno_next_number`: integer, default 1 → Zähler für ST-JJJJ-NNN
- `gutschrift_next_number`: integer, default 1 → Zähler für GS-JJJJ-NNN

**Bestehende Felder (wiederverwendet):** `cancelled_invoice_id`, `status`, `notes`, `line_items`

### Neue API-Endpunkte

| Route | Zweck |
|-------|-------|
| `POST /api/rechnungen/[id]/storno` | Stornorechnung erstellen (negierte Positionen, Originalstatus → cancelled, amount_gross → 0) |
| `POST /api/rechnungen/[id]/gutschrift` | Gutschrift erstellen (manuelle Positionen, amount_gross reduzieren, ggf. BhSt neu berechnen) |

Beide Routen arbeiten atomar (Datenbanktransaktion) für GoBD-konforme Nummernvergabe.

### PDF-Generierung (Erweiterung bestehend)

Bestehender Generator erhält `invoice_type`-Parameter:
- **Storno:** Titel "Stornorechnung", Hinweistext mit Original-Referenz, alle Beträge negativ
- **Gutschrift:** Titel "Gutschrift", Hinweistext mit Original-Referenz, Positionen negativ
- Header/Footer/Logo: identisch mit normalen Rechnungen

### Tech-Entscheidungen

| Entscheidung | Begründung |
|-------------|-----------|
| Gleiche `invoices`-Tabelle + `invoice_type` | Einfacher als eigenes Schema; einheitliches Archiv |
| Zwei getrennte API-Routen | Unterschiedliche Geschäftslogik → keine Fallunterscheidungs-Komplexität |
| Datenbanktranskation für Nummernvergabe | GoBD: lückenlose Nummernkreise, crash-sicher |
| BhSt-Neuberechnung nur bei "Aufenthaltsverkürzung" | Nur echte Aufenthaltsänderungen wirken auf BhSt |
| Keine neuen Pakete | Alle shadcn/ui-Komponenten bereits installiert |

### Auswirkungen auf bestehende Features

| Feature | Auswirkung |
|---------|-----------|
| PROJ-3 Financial Reporting | Storno/Gutschrift als negative Beträge berücksichtigen |
| PROJ-6 Beherbergungssteuer | BhSt-Neuberechnung bei Aufenthaltsverkürzung durch Gutschrift-API |
| PROJ-2 Buchungsmanagement | `amount_gross` ändert sich → Detailansicht zeigt neuen Betrag |

---

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

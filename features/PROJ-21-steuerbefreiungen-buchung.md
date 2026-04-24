# PROJ-21: Steuerbefreiungen pro Buchung (USt + BhSt)

## Status: In Progress
**Created:** 2026-04-24
**Last Updated:** 2026-04-24

## Dependencies
- Requires: PROJ-2 (Buchungsmanagement) — Detail-Ansicht der Buchung
- Requires: PROJ-5 (Rechnungserstellung) — USt-Ausweis auf Rechnung
- Requires: PROJ-6 (Beherbergungssteuer) — BhSt-Befreiungslogik

## Beschreibung
Nutzer sollen **pro Buchung** entscheiden können, ob
1. **keine Umsatzsteuer (USt)** auf der Rechnung ausgewiesen wird — z. B. bei Kleinunternehmer-Sonderfällen, langfristiger Vermietung, bestimmten Firmenkunden.
2. **keine Beherbergungssteuer (BhSt)** berechnet wird — unabhängig vom Monat, in dem die Buchung liegt.

Grund: Der aktuelle BhSt-Befreiungs-Schalter liegt nur auf der BhSt-Report-Seite und ist dort nur für vergangene/aktuelle Monate erreichbar. Eine Mai-Buchung kann im April also nicht als befreit markiert werden → Rechnung enthält die BhSt dann fälschlich.

## User Stories
- Als Vermieter möchte ich eine Buchung direkt im Detail-Sheet als **"USt-frei"** markieren können, damit die generierte Rechnung komplett ohne Umsatzsteuer erstellt wird.
- Als Vermieter möchte ich eine **zukünftige Buchung** sofort als **BhSt-befreit** markieren können — ohne warten zu müssen, bis der Monat in der Report-Seite auswählbar ist.
- Als Vermieter möchte ich, dass der BhSt-Status sich automatisch in der Rechnung spiegelt (kein manuelles Nachpflegen der Beträge).

## Acceptance Criteria

### USt-Befreiung pro Buchung
- [ ] Neues boolean-Feld `vat_exempt` auf `bookings` (Standard: `false`)
- [ ] Toggle "Umsatzsteuerfrei" im Buchungs-Detail-Sheet (neben dem BhSt-Status)
- [ ] Bei `vat_exempt = true` werden in der Rechnung:
  - USt-Beträge (7 % Übernachtung, 19 % Reinigung) auf `0` gesetzt
  - Netto = Brutto (keine Herausrechnung)
  - USt-Summen-Tabelle im PDF ausgeblendet oder mit 0 % ausgewiesen
- [ ] Kein Rechtstext/§-Hinweis auf der Rechnung nötig (bewusste Entscheidung)
- [ ] Änderung greift nur für **noch nicht erstellte** Rechnungen; bereits erstellte Rechnungen bleiben unverändert (Audit-Schutz)

### BhSt-Befreiung: Toggle auf Buchungs-Ebene
- [ ] Toggle "BhSt-befreit" im Buchungs-Detail-Sheet (liest/schreibt den bestehenden Befreiungs-Status aus PROJ-6)
- [ ] Funktioniert für Buchungen in **jedem** Monat (Vergangenheit, aktuell, Zukunft)
- [ ] Status wird in der Buchungsliste als kleines Label sichtbar ("BhSt befreit")
- [ ] Rechnungs-Erstellung respektiert den Status (BhSt wird bei Befreiung nicht in Brutto/Netto eingerechnet)

### BhSt-Seite: Zukunfts-Monate
- [ ] Monats-Dropdown auf `/dashboard/steuer` zeigt zusätzlich die nächsten **+12 Monate** in die Zukunft
- [ ] Sortierung: aktueller Monat oben, dann Zukunft absteigend, dann Vergangenheit
- [ ] Leere Zukunfts-Monate werden als „0 Buchungen" sauber angezeigt (kein Fehler)

## Non-Goals
- Keine teil-USt-Befreiung (nur 7 % weg, 19 % bleibt) — nur Alles-oder-Nichts pro Buchung
- Keine automatische Erkennung/Vorschlag „ist wahrscheinlich USt-frei"
- Keine historische Nachpflege bereits gedruckter Rechnungen
- Kein Property-Level-Setting „Standort ist immer USt-frei" (kann später kommen)

---

## Tech Design (Solution Architect)

### A) Component Structure

```
Buchungs-Detail-Sheet (bestehend)
├── Kopfbereich (Gast, Zeitraum, Status)
├── Finanz-Block (Brutto, Netto, Provisionen)
├── [NEU] Steuer-Block
│   ├── Toggle: "Beherbergungssteuer befreit"
│   │   └── kleiner Hinweistext: "z. B. Dienstreise mit Nachweis"
│   └── Toggle: "Umsatzsteuerfrei"
│       └── kleiner Hinweistext: "Rechnung wird ohne USt erstellt"
├── Rechnungs-Aktionen (bestehend, reagiert auf neue Flags)
└── Dokumente-Upload (aus PROJ-17)

Buchungs-Liste (bestehend)
└── Zeile
    └── [NEU] Badge-Zeile: ggf. "BhSt befreit" · "USt-frei"

BhSt-Report-Seite (/dashboard/steuer)
└── Monats-Dropdown
    ├── [NEU] +12 Zukunfts-Monate
    ├── aktueller Monat
    └── 24 Vergangenheits-Monate
```

### B) Data Model (plain language)

**Erweiterung der `bookings`-Tabelle um ein Feld:**

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `vat_exempt` | boolean | `false` | Wenn `true`: Rechnung für diese Buchung wird komplett ohne Umsatzsteuer erstellt |

**Kein neues Feld für BhSt-Befreiung nötig** — die bestehende Logik nutzt `trip_purpose = 'business'`. Der neue Toggle im Buchungs-Detail schreibt einfach denselben Wert. Dadurch bleiben alte Daten und die BhSt-Report-Seite kompatibel.

**Keine Änderung an `invoices`** — die Rechnung rechnet zum Erzeugungszeitpunkt die korrekten Beträge aus und speichert sie wie bisher in `vat_7_amount`, `vat_19_amount`, `total_vat`. Bei `vat_exempt = true` werden diese Felder mit `0` gefüllt.

### C) Tech-Entscheidungen (Begründung)

1. **Neues Boolean `vat_exempt` statt enum/reason-Feld:**
   Der Nutzer hat explizit „kein Rechtstext auf Rechnung" gewählt. Ein einfaches Boolean hält die Logik schlank und erlaubt später problemlos eine Erweiterung um ein optionales `vat_exempt_reason`-Feld, falls das Finanzamt doch einen Text verlangt.

2. **BhSt-Befreiung bleibt auf `trip_purpose`:**
   Migration vermeiden, Kompatibilität mit PROJ-6/PROJ-13. Der neue Toggle ist reines UI-Sugar um ein existierendes Feld. Vorteil: 0 Risiko für bereits erstellte Reports.

3. **Rechnungs-Snapshot bleibt unverändert:**
   Wird `vat_exempt` nach Rechnungs-Erstellung geändert, bleibt die alte Rechnung wie sie ist. Das ist **rechtlich sauber** (Rechnungen dürfen nicht rückwirkend verändert werden) und vermeidet Komplexität.

4. **Zukunfts-Monate im Dropdown begrenzt auf +12:**
   Praktikabel (Smoobu-Buchungen reichen selten weiter), hält die Liste lesbar. Falls später mehr nötig: leicht erweiterbar.

5. **Sichtbarkeit in Buchungsliste per Badge:**
   Nutzer sieht auf einen Blick, welche Buchungen Sonderstatus haben — verhindert Fehl-Rechnungen aus Versehen.

### D) Dependencies (Packages)

Keine neuen Packages nötig. Verwendet:
- `@supabase/supabase-js` (bestehend) — Update des neuen Flags
- `shadcn/ui Switch` (bestehend) — Toggle-Komponenten
- `date-fns` (bestehend) — Zukunfts-Monate im Dropdown generieren

### E) Migration

Eine kleine Supabase-Migration:
- Spalte `vat_exempt boolean not null default false` auf Tabelle `bookings` ergänzen
- RLS-Policies bleiben unverändert (Spalte ist durch bestehende Booking-Policies abgedeckt)

### F) Auswirkungen auf bestehende Features

| Feature | Auswirkung |
|---|---|
| PROJ-5 (Rechnung) | Rechnungs-Erzeugung muss `vat_exempt` prüfen → Netto=Brutto, USt-Beträge = 0 |
| PROJ-6 (BhSt) | Monats-Dropdown erweitert; Logik unverändert |
| PROJ-14 (Rechnungs-Erweiterungen) | Keine Kollision — neuer Toggle ergänzt, ersetzt nichts |
| PROJ-17 (Dokumenten-Upload) | Keine Kollision — ergänzt sich gut (Befreiungs-Nachweis kann hochgeladen werden) |
| PROJ-2 (Buchungsliste) | Zwei neue Mini-Badges pro Zeile |

---

## Offene Fragen
- Keine — alle durch Nutzer-Rückfrage geklärt.

## Test-Hinweise (für /qa später)
- Buchung im Mai 2026 als BhSt-befreit markieren (während heute April ist), Rechnung erstellen → keine BhSt in Netto/Brutto
- Buchung als USt-frei markieren → Rechnung zeigt keine USt-Tabelle, Netto = Brutto
- Bestehende Rechnung darf nicht rückwirkend verändert werden, wenn Flags später gesetzt werden
- BhSt-Dropdown zeigt auch Monate ohne Buchungen korrekt (keine Fehler)

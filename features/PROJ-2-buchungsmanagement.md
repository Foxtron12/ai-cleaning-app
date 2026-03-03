# PROJ-2: Buchungsmanagement

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: PROJ-1 (Dashboard-Übersicht) - Navigation und Layout

## Beschreibung
Liste aller Buchungen mit Filtermöglichkeiten, Detailansicht pro Buchung (Gastdaten, Finanzdaten, Status). In Phase 1 mit Demo-Daten. Enthält alle relevanten Buchungsfelder aus der Smoobu API-Struktur, damit die API-Anbindung (PROJ-7) nahtlos eingebaut werden kann.

## User Stories
- Als Vermieter möchte ich alle Buchungen in einer Tabelle sehen, damit ich eine Übersicht habe.
- Als Vermieter möchte ich Buchungen nach Monat, Buchungskanal und Status filtern können, damit ich schnell finde was ich suche.
- Als Vermieter möchte ich auf eine Buchung klicken und alle Details sehen (Gastname, Adresse, Dates, Betrag, Kanal, Provision), damit ich alle Infos an einem Ort habe.
- Als Vermieter möchte ich den Buchungsstatus sehen (Bevorstehend / Check-in heute / Aktiv / Abgeschlossen / Storniert), damit ich weiß wo welche Gäste stehen.
- Als Vermieter möchte ich direkt aus der Buchungsdetailansicht eine Meldebescheinigung oder Rechnung für diesen Gast erstellen können.

## Acceptance Criteria
- [ ] Buchungsliste als sortierbare Tabelle mit: Gastname, Check-in, Check-out, Nächte, Betrag brutto, Buchungskanal, Status
- [ ] Filterung nach: Zeitraum (Monat/Quartal/Jahr/Custom), Buchungskanal, Status
- [ ] Suchfeld für Gastname oder Buchungs-ID
- [ ] Klick auf Buchung öffnet Detailansicht (Drawer oder eigene Seite)
- [ ] Detailansicht zeigt vollständige Gastdaten: Name, E-Mail, Telefon, Adresse, Nationalität, Anzahl Erwachsene/Kinder
- [ ] Detailansicht zeigt Finanzdaten: Bruttobetrag, Provision (€ und %), Reinigungsgebühr, Nettobetrag, Kaution
- [ ] Buchungsstatus-Badge mit Farbe (grün=aktiv, blau=bevorstehend, grau=abgeschlossen, rot=storniert)
- [ ] Button "Meldebescheinigung erstellen" → navigiert zu PROJ-4 mit vorausgefüllten Daten
- [ ] Button "Rechnung erstellen" → navigiert zu PROJ-5 mit vorausgefüllten Daten
- [ ] Pagination oder Infinite Scroll bei vielen Buchungen
- [ ] CSV-Export der gefilterten Buchungsliste

## Edge Cases
- Stornierte Buchungen werden angezeigt aber klar als storniert markiert
- Buchungen ohne vollständige Gastdaten zeigen "–" für fehlende Felder (API-Realität: nicht alle Kanäle liefern alle Daten)
- Buchungen über Airbnb haben evtl. keine direkte Provision (Airbnb behält Provision ein, liefert Host-Payout)
- Direktbuchungen haben 0% Provision

## Demo-Daten Anforderungen
- Mind. 15 Buchungen verteilt über 3 Monate
- Mix aus Airbnb (40%), Booking.com (35%), Direkt (25%)
- Verschiedene Aufenthaltslängen (1, 3, 5, 7, 14 Nächte)
- Verschiedene Statuse (bevorstehend, aktiv, abgeschlossen, 1 storniert)
- Realistische Preise (z.B. 80-200 EUR/Nacht)

---

## Tech Design (Solution Architect)

> Basis-Architektur: siehe PROJ-1 (Gesamtarchitektur, Datenmodell, Datenfluss)

#### Komponenten-Baum
```
Buchungen-Seite
├── Filterleiste
│   ├── DateRangePicker (Monat/Quartal/Jahr/Custom)
│   ├── Select: Buchungskanal
│   ├── Select: Status
│   └── Input: Suche (Gastname / ID)
├── Buchungstabelle (shadcn Table, sortierbar)
│   └── Zeile klicken → öffnet Detail-Sheet
├── Buchungs-Detail-Sheet (shadcn Sheet, von rechts)
│   ├── Gastdaten (Name, E-Mail, Telefon, Adresse, Nationalität)
│   ├── Finanzdaten (Brutto, Provision €/%, Reinigung, Netto, Kaution)
│   ├── Status-Badge (farbig)
│   └── Aktionen: "Meldeschein erstellen", "Rechnung erstellen"
├── Pagination (shadcn Pagination)
└── CSV-Export-Button
```

#### Datenquelle
- Liest `bookings`-Tabelle aus Supabase
- Filter/Sortierung via Supabase-Query (serverseitig)
- Sheet-Detail: lädt vollständige Buchung inkl. aller Gastfelder

#### Shared Component
- `BookingTable` wird auch in PROJ-3 (Reporting) und PROJ-6 (Steuer) wiederverwendet

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

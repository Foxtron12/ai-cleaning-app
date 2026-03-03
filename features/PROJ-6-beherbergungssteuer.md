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
_To be added by /qa_

## Deployment
_To be added by /deploy_

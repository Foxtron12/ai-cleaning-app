# PROJ-3: Financial Reporting

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: PROJ-1 (Dashboard-Übersicht) - Layout
- Requires: PROJ-2 (Buchungsmanagement) - Buchungsdaten-Struktur

## Beschreibung
Detaillierter Finanzbericht für den Vermieter: Umsatz pro Monat/Quartal/Jahr, aufgeschlüsselt nach Buchungskanal, Provisionen, Beherbergungssteuer, Reinigungsgebühren und Nettobetrag. Dient als Grundlage für Steuerberater und eigene Buchhaltung.

## User Stories
- Als Vermieter möchte ich sehen, wie viel ich pro Monat eingenommen habe (brutto und netto nach Provisionen), damit ich meinen tatsächlichen Gewinn kenne.
- Als Vermieter möchte ich eine Aufschlüsselung nach Buchungskanal sehen (Airbnb, Booking.com, Direkt), damit ich weiß, welcher Kanal am profitabelsten ist.
- Als Vermieter möchte ich die gesamten Provisionen pro Quartal sehen, damit ich Kosten der Buchungsportale kenne.
- Als Vermieter möchte ich einen Jahresüberblick haben, damit ich die Steuererklärung vorbereiten kann.
- Als Vermieter möchte ich den Report als Excel oder CSV exportieren, damit ich ihn an meinen Steuerberater weitergeben kann.

## Acceptance Criteria
- [ ] Zeitraum-Auswahl: Monat, Quartal, Jahr, Custom-Zeitraum
- [ ] Übersichtstabelle mit Spalten: Monat, Buchungen (#), Umsatz Brutto, Provisionen (€), Reinigungsgebühren, Beherbergungssteuer, Umsatz Netto
- [ ] Balkendiagramm: Monatlicher Brutto- vs. Nettoumsatz (letzte 12 Monate)
- [ ] Aufschlüsselung nach Buchungskanal: Tabelle und Donut-Chart
- [ ] Gesamt-KPIs im Berichtszeitraum: Durchschnittliche Nächte, Durchschnittspreis/Nacht (ADR), RevPAR, Auslastung %
- [ ] Buchungsliste unterhalb des Reports (gleiche Daten wie PROJ-2, gefiltert nach gewähltem Zeitraum)
- [ ] Export als CSV
- [ ] Export als PDF (Report-Ansicht)
- [ ] Alle Beträge in EUR mit zwei Dezimalstellen

## Berechnungslogik
- **Provision Airbnb:** Bruttobetrag - Host-Auszahlung (Smoobu liefert beide Werte)
- **Provision Booking.com:** Bruttobetrag × Provisionsrate (typisch 15-18%, konfigurierbar)
- **Provision Direkt:** 0%
- **Beherbergungssteuer:** Abhängig von Stadt (konfigurierbar, Standard 5% des Nettomietpreises)
- **Nettobetrag:** Brutto - Provision - Beherbergungssteuer - Reinigungsgebühr (wenn nicht separat abgerechnet)

## Edge Cases
- Stornierte Buchungen werden im Report nicht gezählt (oder separat als "Stornierungen" gezeigt)
- Buchungen, die über zwei Monate gehen (Check-in Januar, Check-out Februar): gesamte Buchung wird dem Check-in-Monat zugeordnet
- Fehlende Provisionsdaten: Hinweis-Badge "Provision nicht bekannt – manuell prüfen"
- Leerer Zeitraum (keine Buchungen): leere States mit Hinweis

---

## Tech Design (Solution Architect)

> Basis-Architektur: siehe PROJ-1 (Gesamtarchitektur, Datenmodell, Datenfluss)

#### Komponenten-Baum
```
Reporting-Seite
├── Zeitraum-Tabs (Monat / Quartal / Jahr / Custom)
├── Gesamt-KPIs (4x Card: ADR, RevPAR, Auslastung, Ø Nächte)
├── Charts-Reihe
│   ├── Balken-Chart: Brutto vs. Netto pro Monat (12 Monate)
│   └── Donut-Chart: Umsatz nach Buchungskanal
├── Monatsübersichts-Tabelle
│   └── Spalten: Monat, Buchungen, Brutto, Provision, Reinigung, Steuer, Netto
├── Buchungsliste (gefiltert, wiederverwendet aus PROJ-2)
└── Export-Buttons (CSV + PDF)
```

#### Berechnungen
- Alle Aggregationen via `src/lib/calculators/reporting.ts`
- Supabase-Query gruppiert nach Monat
- Provisionsberechnung kanalabhängig (Airbnb: Brutto - Payout, Booking.com: Brutto × Rate)
- Beherbergungssteuer via `accommodation-tax.ts` Calculator
- PDF-Export via `@react-pdf/renderer` (Report-Layout)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

# PROJ-5: Rechnungserstellung (PDF)

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

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

## Tech Design (Solution Architect)

> Basis-Architektur: siehe PROJ-1 (Gesamtarchitektur, Datenmodell, Datenfluss)

#### Komponenten-Baum
```
Rechnungen-Seite
├── "Neu erstellen"-Button
├── Rechnungsarchiv-Tabelle (shadcn Table)
│   └── Zeilen-Aktionen: PDF, Status ändern, Stornorechnung
└── Rechnungsformular (shadcn Dialog oder Sheet)
    ├── Buchungs-Auswahl (Dropdown) → füllt Felder vor
    ├── Vermieter-Briefkopf (aus Settings, nicht editierbar)
    ├── Gastadresse (vorausgefüllt, editierbar)
    ├── Rechnungsnummer (auto, überschreibbar)
    ├── Positionen-Tabelle (editierbar)
    │   ├── Beherbergung: X Nächte × Y EUR (7% USt)
    │   ├── Endreinigung: Z EUR (19% USt)
    │   └── + Position hinzufügen
    ├── USt-Aufschlüsselung (7% Summe + 19% Summe)
    ├── Gesamt: Netto, USt, Brutto
    ├── Zahlungsinformationen (IBAN aus Settings)
    └── "PDF generieren"-Button
```

#### Datenquelle
- Liest Buchungsdaten aus `bookings`-Tabelle
- Liest Vermieter-Stammdaten aus `settings`-Tabelle
- Speichert Rechnungen in `invoices`-Tabelle (Supabase)
- Rechnungsnummer: auto-increment aus `settings.invoicing.next_number`
- line_items als JSONB-Feld (flexibel, beliebig viele Positionen)
- PDF via `@react-pdf/renderer` mit Vorlage in `src/lib/pdf/invoice.tsx`
- Rechnungen sind unveränderlich nach Finalisierung (GoBD) → nur Status-Updates erlaubt

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

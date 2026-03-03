# PROJ-4: Meldebescheinigung

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

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

## Tech Design (Solution Architect)

> Basis-Architektur: siehe PROJ-1 (Gesamtarchitektur, Datenmodell, Datenfluss)

#### Komponenten-Baum
```
Meldescheine-Seite
├── "Neu erstellen"-Button
├── Archiv-Tabelle (shadcn Table)
│   └── Zeilen-Aktionen: PDF herunterladen, Status ändern
└── Meldeschein-Formular (shadcn Dialog oder Sheet)
    ├── Buchungs-Auswahl (Dropdown bestehender Buchungen)
    ├── Gastdaten (vorausgefüllt, editierbar)
    │   ├── Name, Vorname, Geburtsdatum
    │   ├── Staatsangehörigkeit
    │   ├── Wohnanschrift (Straße, PLZ, Ort, Land)
    │   └── Reisezweck (privat/geschäftlich)
    ├── Mitreisende-Sektion (dynamisch: + Weitere Person)
    ├── Aufenthaltsdaten (Check-in, Check-out)
    ├── Fehlende Pflichtfelder: rot markiert
    └── "PDF generieren"-Button
```

#### Datenquelle
- Liest Gastdaten aus `bookings`-Tabelle (Supabase)
- Speichert Meldescheine in `registration_forms`-Tabelle (Supabase)
- PDF-Generierung via `@react-pdf/renderer` mit Vorlage in `src/lib/pdf/meldeschein.tsx`
- Vermieter-Briefkopf aus `settings`-Tabelle

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

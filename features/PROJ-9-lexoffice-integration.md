# PROJ-9: Lexoffice / Buchhaltungs-Integration

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: PROJ-5 (Rechnungserstellung) - App erstellt Rechnungen intern
- Requires: PROJ-7 (Smoobu API) - Live-Buchungsdaten als Grundlage

## Beschreibung
Automatische Übertragung erstellter Rechnungen und Belege an Lexoffice (oder alternativ sevDesk). Rechnungen werden zunächst in der App erstellt (PROJ-5) und können dann mit einem Klick an Lexoffice exportiert werden, um sie in der Buchhaltung zu haben. Alternativ: Rechnungen werden direkt über die Lexoffice API erstellt (Lexoffice als Rechnungs-Backend).

## Recherche-Ergebnisse (März 2026)

### Lexoffice API
- **Auth:** OAuth 2.0 Bearer Token (API Key)
- **Invoice Creation:** Vollständig via API möglich, inkl. Finalisierung
- **PDF Generation:** Ja – `GET /v1/invoices/{id}/document` nach Finalisierung
- **Rate Limit:** 2 Requests/Sekunde (limitierend!)
- **Kein Sandbox:** Nur Live-Account (Achtung: finalisierte Rechnungen unlöschbar)
- **USt-Split:** Unterstützt mehrere USt-Sätze (7%, 19%) auf einer Rechnung ✓
- **Alle Pläne:** API-Zugang ab ~8 EUR/Monat

### sevDesk API (Alternative)
- Ähnlicher Funktionsumfang wie Lexoffice
- Rate Limit liberaler (~5 req/sec)
- Stärker bei DATEV-Export
- Ebenso kein Sandbox

### Integration via Zapier/Make.com (No-Code)
- **Smoobu → Zapier → Lexoffice:** Offizielle Zapier-Module für beide
- **Make.com:** Flexibler, native Module für beide Plattformen
- **Vorteil:** Kein Custom-Code, schnell zu implementieren
- **Nachteil:** Laufende Kosten (~20-50 EUR/Monat für Make), limitierte Kontrolle

## User Stories
- Als Vermieter möchte ich eine fertige App-Rechnung mit einem Klick an Lexoffice exportieren, damit sie automatisch in meiner Buchhaltung landet.
- Als Vermieter möchte ich meinen Lexoffice API-Key einmalig eingeben, damit der Export automatisch funktioniert.
- Als Vermieter möchte ich wählen, ob Rechnungen sofort finalisiert oder als Entwurf in Lexoffice landen, damit ich noch Kontrolle habe.
- Als Vermieter möchte ich sehen, welche Rechnungen bereits nach Lexoffice übertragen wurden, damit ich keine doppelt anlege.

## Acceptance Criteria
- [ ] Settings-Seite: Lexoffice API-Key eingeben und Verbindung testen
- [ ] Pro Rechnung (PROJ-5): Button "Nach Lexoffice exportieren"
- [ ] Export erstellt: Lexoffice-Kontakt (Gast) falls nicht vorhanden, dann Rechnung mit korrekten Positionen (7% + 19% USt.)
- [ ] Konfigurierbar: "Als Entwurf" oder "Direkt finalisieren"
- [ ] Erfolg: Lexoffice-Rechnungsnummer wird in App gespeichert, Link zur Lexoffice-Rechnung
- [ ] Status "Exportiert" auf Rechnung sichtbar
- [ ] Rate-Limit-Handling: 2 req/sec einhalten (sequentiell, mit Verzögerung)
- [ ] Fehlerbehandlung: bei Lexoffice-Fehler → Fehlermeldung mit Details, erneuter Export möglich

## Implementierungs-Variante A: App → Lexoffice Push
Rechnungen werden in der App erstellt (PROJ-5) und auf Knopfdruck in Lexoffice dupliziert.

**Vorteile:** App ist unabhängig von Lexoffice, lokale PDF-Generierung möglich
**Nachteile:** Doppelte Datenhaltung, Risiko von Inkonsistenz

## Implementierungs-Variante B: App nutzt Lexoffice als Rechnungs-Backend
App erstellt Rechnungen direkt über Lexoffice API. PDF kommt von Lexoffice.

**Vorteile:** Single Source of Truth, Lexoffice-Briefkopf automatisch korrekt
**Nachteile:** Abhängigkeit von Lexoffice, Rate-Limit (2 req/sec) limitiert Speed, kein Offline

**Empfehlung:** Variante A für MVP – App ist unabhängig, Lexoffice-Export ist optional.

## Edge Cases
- Lexoffice-Kontakt existiert bereits (selbe E-Mail) → Update statt Duplikat
- Rate-Limit erreicht → Queue mit Retry, Nutzer sieht Fortschrittsanzeige
- Lexoffice-Plan ohne API → klare Fehlermeldung mit Upgrade-Hinweis
- Rechnung bereits finalisiert → kann nicht zurückgezogen werden (Hinweis + Storno-Möglichkeit)
- Verbindung während Export unterbrochen → Transaktion rollback, Neuversuch möglich

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

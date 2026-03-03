# PROJ-8: Direktbuchungen + Stripe-Zahlung

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: PROJ-1 (Dashboard-Übersicht) - Layout
- Requires: PROJ-2 (Buchungsmanagement) - Buchungsdaten-Modell
- Requires: PROJ-5 (Rechnungserstellung) - Automatische Rechnung nach Buchung

## Beschreibung
Möglichkeit, Direktbuchungen im Dashboard zu erfassen und optional Zahlungen über Stripe abzuwickeln. Für Gäste, die direkt anfragen (Telefon, E-Mail, persönlich), kann der Vermieter eine Buchung anlegen und dem Gast einen Zahlungslink schicken. Keine eigene Buchungswebseite in diesem Feature – nur das Verwalten von Direktbuchungen im Admin-Dashboard.

## User Stories
- Als Vermieter möchte ich eine Direktbuchung manuell anlegen (Zeitraum, Gästename, Betrag), damit diese im Dashboard erscheint.
- Als Vermieter möchte ich für eine Direktbuchung automatisch eine Rechnung erstellen und per Stripe-Zahlungslink bezahlen lassen, damit ich keine Überweisung abwarten muss.
- Als Vermieter möchte ich sehen, welche Direktbuchungen noch offen (unbezahlt) sind, damit ich nachhaken kann.
- Als Vermieter möchte ich Stripe-Zahlungsstatus sehen (ausstehend, bezahlt, fehlgeschlagen), damit ich den Überblick habe.

## Acceptance Criteria
- [ ] Formular: Direktbuchung erstellen (Gastname, E-Mail, Zeitraum, Betrag, Endreinigung, Notiz)
- [ ] Direktbuchungen werden im Buchungsmanagement (PROJ-2) als Kanal "Direkt" angezeigt
- [ ] Automatische Rechnungserstellung (via PROJ-5) nach Direktbuchungs-Erstellung
- [ ] Stripe Checkout Link erstellen: Button "Zahlungslink erstellen" generiert einen Stripe Checkout Session Link
- [ ] Zahlungslink kann kopiert und per E-Mail/WhatsApp an Gast gesendet werden
- [ ] Stripe Webhook empfängt Zahlungsbestätigung und aktualisiert Buchungs-Status auf "Bezahlt"
- [ ] Stripe API-Key konfigurierbar in Settings
- [ ] Zahlungsstatus sichtbar: Ausstehend / Bezahlt / Fehlgeschlagen
- [ ] Stripe Checkout konfiguriert mit: Betrag, Buchungsbeschreibung, Gastname, Rechnungsnummer
- [ ] Stripe-Einzel-Dashboard-Link zum Überprüfen der Zahlung

## Stripe-Integration Details
- **Stripe Checkout:** Einfachste Integration, hosted Payment Page
- **Währung:** EUR
- **Zahlungsmethoden:** Kreditkarte, SEPA Lastschrift (für DE-Gäste), Apple Pay, Google Pay
- **Webhooks:** `payment_intent.succeeded`, `checkout.session.completed`
- **Keine Stripe Connect nötig:** Einfache Einzelkonto-Integration (kein Marktplatz)

## Edge Cases
- Gast zahlt nicht über Stripe-Link → Manuell als "Bar/Überweisung bezahlt" markierbar
- Stripe-Zahlung schlägt fehl → Hinweis in Dashboard, neuer Link generierbar
- Teilzahlung (Anzahlung + Restzahlung) → zwei separate Zahlungslinks
- Stornierung nach Zahlung → Stripe Refund direkt über Stripe Dashboard (nicht im App-Scope)

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

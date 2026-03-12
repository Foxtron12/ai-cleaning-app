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
- [ ] Stripe Secret Key pro User in Integrations-Tab hinterlegen (verschlüsselt, analog zu Smoobu)
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

### Was bereits existiert (wird wiederverwendet)
- `CreateBookingWizard` Step 4 hat bereits Placeholder-UI für Stripe-Link (zeigt "verfügbar sobald PROJ-8 implementiert ist")
- `bookings/create/route.ts` gibt bereits `stripePaymentLink: null` zurück – Feldname passt
- Stripe SDK installiert, Webhook-Route `/api/webhooks/stripe` existiert (bisher nur SaaS-Payments)
- Kein neues npm-Paket notwendig

### Komponenten-Struktur
```
CreateBookingWizard (bestehend, Step 4 erweitern)
+-- StripePaymentLink (Link + Copy-Button) ← bereits da, nur echte URL nötig
+-- EmailTextGenerator (NEU)
    +-- Generierter E-Mail-Text (deutsches Template, kein KI)
    +-- "Text kopieren"-Button

BookingDetailSheet (bestehend, erweitern)
+-- Zahlungsstatus-Badge (NEU): Ausstehend / Bezahlt / Fehlgeschlagen / Manuell
+-- Stripe-Link anzeigen (wenn vorhanden, mit Copy-Button)
+-- Button: "Neuen Zahlungslink erstellen" (NEU)
+-- Button: "Manuell als bezahlt markieren" (NEU, für Bar/Überweisung)
+-- E-Mail-Text anzeigen/kopieren (NEU, nur für Direktbuchungen mit Stripe-Link)
```

### Datenmodell-Änderungen
**Tabelle `bookings` – 3 neue Spalten:**

| Spalte | Typ | Beschreibung |
|---|---|---|
| `stripe_checkout_session_id` | Text, nullable | Stripe Session-ID – für Webhook-Matching |
| `stripe_payment_link` | Text, nullable | Die Checkout-URL, die an den Gast gesendet wird |
| `payment_status` | Text, default `'pending'` | `pending` / `paid` / `failed` / `manual` |

Nur Direktbuchungen (channel = `'Direct'`) bekommen Payment-Felder befüllt. Smoobu-Sync-Buchungen bleiben `null`.

### Neue & angepasste API-Routen

**1. `POST /api/bookings/[id]/create-payment-link`** (NEU)
- Erstellt Stripe Checkout Session (mode: `payment`, einmalig)
- Speichert `stripe_checkout_session_id` + `stripe_payment_link` in DB
- Gibt neuen Link zurück
- Genutzt: bei Buchungserstellung + im BookingDetailSheet ("Neuen Link erstellen")

**2. `PATCH /api/bookings/[id]/mark-paid`** (NEU)
- Setzt `payment_status = 'manual'`
- Für Bar- oder Überweisungszahlungen außerhalb Stripe

**3. `POST /api/bookings/create`** (MODIFIZIERT)
- Ruft nach Erstellung intern `create-payment-link` auf
- Gibt `stripePaymentLink` mit echtem Wert zurück (statt null)

**4. `POST /api/webhooks/stripe`** (ERWEITERT)
- Erkennt Booking-Zahlungen an `metadata.type === 'booking_payment'`
- Bei `checkout.session.completed`: setzt `payment_status = 'paid'` auf Buchung
- Bestehende SaaS-Subscription-Logik bleibt unverändert

### E-Mail-Text-Generator
- Rein client-seitig, kein API-Aufruf, kein KI
- Deutsches Template mit: Gastname, Objekt, Zeitraum, Gesamtbetrag, Stripe-Link
- Angezeigt in CreateBookingWizard Step 4 und BookingDetailSheet
- Copy-to-Clipboard-Button

### Stripe Checkout Session – Konfiguration
- Mode: `payment` (einmalig, keine Subscription)
- Betrag: Gesamtpreis in Cent (EUR)
- Beschreibung: z.B. "Buchung Musterstraße 1 – 15.03. bis 20.03.2026"
- Zahlungsmethoden: Kreditkarte, SEPA-Lastschrift, Apple Pay, Google Pay
- Metadata: `{ type: 'booking_payment', booking_id, user_id }` → für Webhook-Zuordnung
- Ablauf: 30 Tage (konfigurierbar)

### Stripe API-Key – Pro User (Multi-Tenant)
Jeder User verbindet seinen **eigenen Stripe-Account**. Der Secret Key wird verschlüsselt in der `integrations`-Tabelle gespeichert (wie der Smoobu API-Key).

| Was | Wo |
|---|---|
| Stripe Secret Key | `integrations` Tabelle, `provider = 'stripe'`, verschlüsselt |
| Stripe Webhook Secret | Globale Server-Env-Variable (eine Webhook-URL für alle User) |

**UI:** Integrations-Tab bekommt ein Stripe-Feld analog zu Smoobu.
**Fallback:** Wenn kein Key hinterlegt → "Zahlungslink erstellen"-Button deaktiviert mit Hinweis "Stripe-API-Key in Integrationen hinterlegen".

### Abhängigkeiten / Pakete
Keine neuen Pakete. Stripe ist bereits installiert.

### Build-Reihenfolge
1. DB Migration – 3 Spalten zu `bookings` hinzufügen
2. Backend – `create-payment-link` + `mark-paid` + Webhook-Erweiterung + `bookings/create` anpassen
3. Frontend – EmailTextGenerator in Wizard Step 4 + Zahlungsstatus im BookingDetailSheet

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

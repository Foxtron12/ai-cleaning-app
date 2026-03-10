# PROJ-12: Access Payment Gate (Einmalzahlung)

## Status: Planned
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- PROJ-10 (User Authentication & Multi-Tenancy) – Zahlung wird pro User-Account verknüpft

## Beschreibung
Nach der Registrierung hat ein Nutzer nur eingeschränkten Zugang (Demo-Modus oder gesperrte Features),
bis eine einmalige Zahlung via Stripe erfolgt ist. Nach Zahlung erhält der Nutzer lebenslangen Vollzugriff.

Dieses Feature ist auf den aktuellen Use Case optimiert: ein einzelner Zahlender Nutzer.
Das Modell ist aber so gebaut, dass weitere Nutzer denselben Flow durchlaufen können.

**Kein Abo, kein wiederkehrender Charge.** Stripe Checkout mit `payment_mode: 'payment'`.

## User Stories
- Als neuer Nutzer möchte ich nach der Registrierung zur Zahlungsseite weitergeleitet werden, damit ich Zugang zur vollen App erhalte.
- Als Nutzer möchte ich sicher per Kreditkarte oder SEPA bezahlen können (Stripe Checkout).
- Als Nutzer möchte ich nach erfolgreicher Zahlung sofort zum Dashboard weitergeleitet werden.
- Als App-Betreiber möchte ich, dass Zahlung serverseitig via Stripe Webhook verifiziert wird – nicht nur client-seitig.
- Als App-Betreiber möchte ich die Möglichkeit haben, einen Nutzer manuell als "bezahlt" zu markieren (für Ausnahmen / Tests).

## Acceptance Criteria
- [ ] Nach Registrierung + E-Mail-Verifizierung: Weiterleitung zu `/onboarding/payment` wenn noch nicht bezahlt
- [ ] `/onboarding/payment`-Seite erklärt was enthalten ist und hat "Jetzt kaufen"-Button
- [ ] Klick auf "Jetzt kaufen" erstellt Stripe Checkout Session (server-seitig via API-Route)
- [ ] Stripe Checkout: einmaliger Betrag (konfigurierbar per Env-Variable), `payment_mode: 'payment'`
- [ ] Nach erfolgreicher Stripe-Zahlung: Stripe sendet `checkout.session.completed` Webhook
- [ ] Webhook-Handler (`/api/webhooks/stripe`) setzt `is_paid = true` in `profiles`-Tabelle
- [ ] Stripe Webhook-Signatur wird verifiziert (Stripe-Signing-Secret, kein Fake möglich)
- [ ] Nach erfolgreicher Zahlung: Nutzer landet auf `/dashboard` (success_url)
- [ ] Bei abgebrochener Zahlung: Nutzer landet zurück auf `/onboarding/payment` (cancel_url)
- [ ] Alle geschützten Routen prüfen `is_paid` – nicht bezahlte Nutzer werden zu `/onboarding/payment` umgeleitet
- [ ] Admin kann `is_paid` manuell in Supabase setzen (kein dediziertes Admin-UI nötig für MVP)
- [ ] Bereits bezahlte Nutzer werden von `/onboarding/payment` direkt zu `/dashboard` weitergeleitet

## Edge Cases
- Was passiert, wenn der Stripe Webhook doppelt gefeuert wird? → Idempotente Handler: `is_paid = true` mehrfach setzen ist harmlos
- Was passiert, wenn der Webhook vor dem Nutzer-Redirect ankommt? → Kein Problem: Webhook ist async, Erfolgs-Redirect kommt vom Stripe success_url
- Was passiert, wenn ein Nutzer die success_url direkt aufruft ohne zu zahlen? → `is_paid` wurde nicht gesetzt, Middleware leitet zurück zu `/onboarding/payment`
- Was passiert, wenn der Stripe Checkout abläuft (Session Expiry)? → Nutzer kommt zurück zur Payment-Seite, kann neuen Checkout starten
- Was passiert bei einer Stripe-Rückerstattung? → MVP: kein automatischer Entzug des Zugangs; manuell über Supabase zu regeln
- Was passiert, wenn kein Stripe-Account konfiguriert ist (lokale Entwicklung)? → Env-Variable `NEXT_PUBLIC_STRIPE_ENABLED=false` zeigt "Zugang manuell aktiviert"-Hinweis

## Technische Anforderungen
- Stripe `@stripe/stripe-js` (Client) + `stripe` (Server) Pakete
- Neue API-Route: `POST /api/payments/create-checkout-session`
- Neue API-Route: `POST /api/webhooks/stripe` (öffentlich, Signatur-Verifizierung)
- `profiles`-Tabelle bekommt Spalte: `is_paid` (boolean, default: false), `stripe_customer_id` (text)
- Betrag und Produkt-Name als Env-Variablen: `STRIPE_PRICE_AMOUNT`, `STRIPE_PRODUCT_NAME`
- Stripe Keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (niemals im Client)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (für Stripe.js Client)
- Middleware prüft `is_paid` nach `is_authenticated` – zweistufige Guard-Chain

## Konfigurations-Variablen (.env.local)
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_AMOUNT=19900          # Cent, also 199,00 EUR
STRIPE_PRODUCT_NAME="Vermieter Dashboard – Lebenslanger Zugang"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_ENABLED=true
```

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

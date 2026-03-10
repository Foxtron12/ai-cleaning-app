# PROJ-12: Access Payment Gate (Subscription pro Standort)

## Status: Deployed
**Created:** 2026-03-05
**Last Updated:** 2026-03-10

## Dependencies
- PROJ-10 (User Authentication & Multi-Tenancy) – Zahlung wird pro User-Account verknüpft

## Beschreibung
Nach der Registrierung hat ein Nutzer eingeschränkten Zugang (Free-Browse-Modus ohne Properties).
Sobald mindestens ein Standort angelegt wird, muss ein Abo abgeschlossen werden.

Das Abo ist ein **Stripe Subscription** mit **per-property Pricing**: der Preis wird pro Standort berechnet.
Die Quantity wird beim Checkout automatisch aus der Anzahl der Properties des Nutzers ermittelt.
Produkt und Preis werden live aus Stripe via `STRIPE_PRICE_ID` geladen.

**Subscription-Modell** mit `mode: 'subscription'`. Jederzeit kündbar.

## User Stories
- Als neuer Nutzer möchte ich das Dashboard ohne Zahlung erkunden können, solange ich noch keine Standorte angelegt habe (Free-Browse-Modus).
- Als Nutzer mit Standorten möchte ich zur Zahlungsseite weitergeleitet werden, damit ich Zugang zur vollen App erhalte.
- Als Nutzer möchte ich sehen, wie viel mein Abo pro Standort kostet, bevor ich abonniere.
- Als Nutzer möchte ich sicher per Kreditkarte oder SEPA bezahlen können (Stripe Checkout).
- Als Nutzer möchte ich nach erfolgreicher Zahlung sofort zum Dashboard weitergeleitet werden.
- Als App-Betreiber möchte ich, dass Zahlung serverseitig via Stripe Webhook verifiziert wird – nicht nur client-seitig.
- Als App-Betreiber möchte ich, dass bei Abo-Verlängerung der Zugang automatisch erhalten bleibt und bei Kündigung/Zahlungsausfall entzogen wird.
- Als App-Betreiber möchte ich die Möglichkeit haben, einen Nutzer manuell als "bezahlt" zu markieren (für Ausnahmen / Tests), ohne dass ein Webhook das überschreibt.

## Acceptance Criteria
- [ ] Nutzer mit 0 Properties können das Dashboard frei nutzen (Free-Browse-Modus)
- [ ] Nutzer mit ≥1 Property werden zu `/onboarding/payment` umgeleitet, wenn `is_paid = false`
- [ ] `/onboarding/payment` zeigt Produkt-Info (live aus Stripe), Preis pro Standort, Gesamtpreis und "Jetzt abonnieren"-Button
- [ ] Klick auf "Jetzt abonnieren" erstellt Stripe Checkout Session mit `mode: 'subscription'` und `quantity` = Anzahl Properties
- [ ] Stripe Checkout Session nutzt `STRIPE_PRICE_ID` (konfigurierbar per Env-Variable)
- [ ] Nach erfolgreicher Stripe-Zahlung: Webhook `checkout.session.completed` setzt `is_paid = true`, speichert `stripe_customer_id` und `stripe_subscription_id`
- [ ] Stripe Webhook-Signatur wird verifiziert (Stripe-Signing-Secret)
- [ ] Nach erfolgreicher Zahlung: Nutzer landet auf `/dashboard` (success_url)
- [ ] Bei abgebrochener Zahlung: Nutzer landet zurück auf `/onboarding/payment` (cancel_url)
- [ ] Alle geschützten Routen prüfen `is_paid` (nur enforced wenn Properties > 0)
- [ ] Webhook `invoice.payment_succeeded` verlängert Zugang bei Abo-Renewal
- [ ] Webhook `invoice.payment_failed` entzieht Zugang nach letztem Retry
- [ ] Webhook `customer.subscription.deleted` entzieht Zugang (nur bei Stripe-verknüpften Nutzern, nicht bei manuell gesetztem `is_paid`)
- [ ] Admin kann `is_paid` manuell in Supabase setzen – Webhook überschreibt dies nicht
- [ ] Bereits bezahlte Nutzer werden von `/onboarding/payment` direkt zu `/dashboard` weitergeleitet
- [ ] `POST /api/payments/sync-subscription` synchronisiert Property-Quantity mit Stripe (mit Rate-Limiting)

## Edge Cases
- Was passiert, wenn der Stripe Webhook doppelt gefeuert wird? → Idempotente Handler: `is_paid = true` mehrfach setzen ist harmlos
- Was passiert, wenn der Webhook vor dem Nutzer-Redirect ankommt? → Kein Problem: Webhook ist async, Erfolgs-Redirect kommt vom Stripe success_url
- Was passiert, wenn ein Nutzer die success_url direkt aufruft ohne zu zahlen? → `is_paid` wurde nicht gesetzt, Middleware leitet zurück zu `/onboarding/payment`
- Was passiert, wenn der Stripe Checkout abläuft (Session Expiry)? → Nutzer kommt zurück zur Payment-Seite, kann neuen Checkout starten
- Was passiert bei einer Stripe-Rückerstattung? → Kein automatischer Entzug; manuell über Supabase zu regeln
- Was passiert, wenn kein Stripe-Account konfiguriert ist (lokale Entwicklung)? → Env-Variable `NEXT_PUBLIC_STRIPE_ENABLED=false` zeigt "Zugang manuell aktiviert"-Hinweis
- Was passiert bei fehlgeschlagener Abo-Verlängerung? → `invoice.payment_failed` Handler entzieht Zugang erst nach letztem Retry (`next_payment_attempt === null`)
- Was passiert bei Abo-Kündigung? → `customer.subscription.deleted` Handler setzt `is_paid = false`, aber nur für Nutzer mit `stripe_subscription_id` (schützt Admin-Overrides)
- Was passiert, wenn sich die Anzahl der Properties zwischen Page-Load und Checkout ändert? → Quantity wird beim Checkout-API-Call ermittelt, nicht vom Client. Sync-Endpoint gleicht nachträglich ab.

## Technische Anforderungen
- `stripe` (Server SDK) – kein Client-SDK nötig (hosted Checkout)
- API-Route: `POST /api/payments/create-checkout-session` – erstellt Subscription-Checkout mit Quantity
- API-Route: `POST /api/payments/sync-subscription` – synchronisiert Property-Quantity mit Stripe
- API-Route: `POST /api/webhooks/stripe` (öffentlich, Signatur-Verifizierung)
- `profiles`-Tabelle: `is_paid` (boolean), `stripe_customer_id` (text), `stripe_subscription_id` (text)
- Preis wird als Stripe Price-Objekt verwaltet (`STRIPE_PRICE_ID`), Produkt-Info live aus Stripe geladen
- Stripe Keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (niemals im Client)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (für Stripe.js Client)
- Middleware prüft `is_paid` nach `is_authenticated` – zweistufige Guard-Chain (nur enforced bei Properties > 0)

## Konfigurations-Variablen (.env.local)
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...          # Stripe Price ID (recurring, per unit)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_ENABLED=true
```

---

## Tech Design (Solution Architect)

### Flow
```
Nutzer registriert sich → Dashboard frei nutzbar (0 Properties)
        ↓ Nutzer legt Property an
Middleware: eingeloggt? ✓ → Properties > 0? ✓ → bezahlt? ✗
        ↓
/onboarding/payment (Preis live aus Stripe, Quantity = Anzahl Properties)
        ↓ Klick "Jetzt abonnieren"
Server → Stripe Checkout Session (mode: subscription, quantity: N)
        ↓
Browser → Stripe (hosted Zahlungsseite)
        ↓ Zahlung erfolgreich
Stripe Webhook → /api/webhooks/stripe → is_paid = true, stripe_subscription_id gespeichert
        ↓ parallel
Stripe redirect → /dashboard (success_url)
        ↓
Middleware: eingeloggt? ✓ → bezahlt? ✓ → Zugang
        ↓ monatlich
invoice.payment_succeeded → Zugang bleibt
invoice.payment_failed (final) → Zugang entzogen
customer.subscription.deleted → Zugang entzogen
```

### Seitenstruktur
```
/onboarding/payment           ← neue Seite
+-- PaymentGatePage
    +-- ProductCard           (was enthalten ist, Preis)
    +-- FeatureList           (3–4 Bullet Points)
    +-- CheckoutButton        ("Jetzt kaufen" → API → Stripe-Redirect)
    +-- DevModeNotice         (nur wenn STRIPE_ENABLED=false)

Middleware (erweitert)
+-- Stufe 1: Auth Guard       (vorhanden – /dashboard → /login)
+-- Stufe 2: Payment Guard    (neu – /dashboard → /onboarding/payment wenn !is_paid)
```

### Neue API-Routen
- `POST /api/payments/create-checkout-session` – erstellt Stripe Subscription Checkout Session mit Quantity, gibt session.url zurück
- `POST /api/payments/sync-subscription` – synchronisiert Property-Quantity mit Stripe Subscription (Rate-Limited)
- `POST /api/webhooks/stripe` – öffentlich, Signatur-verifiziert, verarbeitet 6 Event-Typen

### Datenbankänderungen
Tabelle `profiles` bekommt drei neue Spalten:
- `is_paid` (boolean, default false) – Quelle der Wahrheit für Zugang
- `stripe_customer_id` (text, nullable) – Verknüpfung zu Stripe Customer
- `stripe_subscription_id` (text, nullable) – Verknüpfung zu Stripe Subscription

### Middleware-Erweiterung
- Für `/dashboard`-Routen: nach Auth-Check `is_paid` aus `profiles` lesen
- `is_paid = false` UND Properties > 0 → Redirect zu `/onboarding/payment`
- `is_paid = false` UND Properties = 0 → Free-Browse-Modus (kein Redirect)
- `/onboarding/payment` selbst nicht durch Payment Guard geschützt
- `/api/webhooks/stripe` bleibt öffentlich

### Tech-Entscheidungen
- **Stripe Subscription:** Recurring Revenue, per-property Pricing, Quantity-basiert
- **Stripe Checkout (hosted):** PCI-Compliance durch Stripe, SEPA + Kreditkarte out-of-the-box
- **Webhook statt Client-Verifizierung:** Signing Secret macht Fälschung unmöglich
- **Keine @stripe/stripe-js:** Checkout-Redirect braucht kein Client SDK, spart Bundle
- **Idempotenter Webhook:** is_paid=true mehrfach setzen ist harmlos
- **Admin-Override-Schutz:** Cancellation/Failed-Payment Webhooks prüfen `stripe_subscription_id IS NOT NULL`
- **Dev-Modus Flag:** NEXT_PUBLIC_STRIPE_ENABLED=false für lokales Testen

### Neue Pakete
- `stripe` (Server SDK)

### Neue Env-Variablen
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID              # Stripe Price ID (recurring, per unit)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_STRIPE_ENABLED   # true/false
```

## QA Test Results

**Tested:** 2026-03-10
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (no live Stripe account available for end-to-end testing)

### Acceptance Criteria Status

#### AC-1: Redirect to /onboarding/payment after registration if not paid
- [x] Middleware checks `is_paid` for all `/dashboard` routes and redirects to `/onboarding/payment`
- [x] Auth guard redirects unauthenticated users to `/login` first
- **Status: PASS**

#### AC-2: /onboarding/payment page explains product and has "Jetzt kaufen" button
- [x] ProductCard renders product name, price, feature list (4 bullet points), and CheckoutButton
- [x] Price is formatted correctly as EUR with comma separator
- [x] Badge shows "Einmalzahlung", description says "Kein Abo"
- **Status: PASS**

#### AC-3: "Jetzt kaufen" creates Stripe Checkout Session server-side
- [x] CheckoutButton calls `POST /api/payments/create-checkout-session`
- [x] API route verifies authentication before creating session
- [x] API route checks if already paid before creating session
- [x] Loading state shown during redirect
- **Status: PASS**

#### AC-4: Stripe Checkout one-time payment, configurable amount
- [x] `mode: "payment"` (not subscription)
- [x] Amount from `STRIPE_PRICE_AMOUNT` env var (default 19900 = 199.00 EUR)
- [x] Product name from `STRIPE_PRODUCT_NAME` env var
- [x] Supports both `card` and `sepa_debit` payment methods
- **Status: PASS**

#### AC-5: Webhook receives checkout.session.completed
- [x] Webhook handler at `/api/webhooks/stripe` processes `checkout.session.completed` events
- [x] Also handles `checkout.session.async_payment_succeeded` for SEPA debit
- [x] Other event types are acknowledged but not processed (returns `{ received: true }`)
- **Status: PASS**

#### AC-6: Webhook sets is_paid = true in profiles table
- [x] Service client used to bypass RLS (correct for webhook without user session)
- [x] Updates `is_paid` and `stripe_customer_id` in profiles table
- [x] Uses `client_reference_id` (user.id) to identify the user
- [x] Checks `session.payment_status === 'paid'` before granting access (BUG-1 FIXED)
- **Status: PASS**

#### AC-7: Stripe Webhook signature verification
- [x] `stripe.webhooks.constructEvent()` used with `STRIPE_WEBHOOK_SECRET`
- [x] Missing signature returns 400
- [x] Invalid signature returns 400 with error log
- **Status: PASS**

#### AC-8: Success URL redirects to /dashboard
- [x] `success_url: ${siteUrl}/dashboard?payment=success`
- [x] Uses `NEXT_PUBLIC_SITE_URL` env var for base URL
- **Status: PASS**

#### AC-9: Cancel URL redirects to /onboarding/payment
- [x] `cancel_url: ${siteUrl}/onboarding/payment?payment=cancelled`
- **Status: PASS**

#### AC-10: All protected routes check is_paid
- [x] Middleware payment guard covers all `/dashboard` routes via `pathname.startsWith('/dashboard')`
- [x] Middleware payment guard covers all `/api/` routes (excluding webhooks and payment routes) (BUG-2 FIXED)
- [x] Unpaid users redirected to `/onboarding/payment` (pages) or receive 403 (API)
- **Status: PASS**

#### AC-11: Admin can set is_paid manually in Supabase
- [x] No dedicated admin UI needed for MVP (by design)
- [x] `is_paid` column exists in profiles table
- **Status: PASS**

#### AC-12: Already paid users redirected from /onboarding/payment to /dashboard
- [x] Middleware redirects paid users away from `/onboarding/payment`
- [x] Page-level check in page.tsx also redirects paid users (defense in depth)
- **Status: PASS**

### Edge Cases Status

#### EC-1: Stripe Webhook fired twice (idempotency)
- [x] Setting `is_paid = true` multiple times is harmless (UPDATE, not toggle)
- [x] `stripe_customer_id` is also overwritten identically
- **Status: PASS**

#### EC-2: Webhook arrives before user redirect
- [x] No race condition: webhook updates DB independently, redirect uses `success_url`
- **Status: PASS**

#### EC-3: User calls success_url directly without paying
- [x] `is_paid` remains false, middleware redirects back to `/onboarding/payment`
- **Status: PASS**

#### EC-4: Stripe Checkout session expires
- [x] User can start a new checkout from `/onboarding/payment`
- **Status: PASS**

#### EC-5: Stripe refund
- [x] MVP: no automatic access revocation (documented as expected behavior)
- **Status: PASS (by design)**

#### EC-6: Stripe disabled (dev mode)
- [x] `NEXT_PUBLIC_STRIPE_ENABLED=false` shows DevModeNotice component
- [x] CheckoutButton shows toast instead of calling API
- [x] API route returns 400 if Stripe not enabled
- **Status: PASS**

#### EC-7: SEPA debit pending payment
- [x] Webhook checks `payment_status === 'paid'` -- SEPA with `unpaid` status is skipped (BUG-1 FIXED)
- [x] `checkout.session.async_payment_succeeded` event handled for delayed SEPA confirmation
- [x] `checkout.session.async_payment_failed` event logged for failed SEPA payments
- **Status: PASS**

### Security Audit Results

- [x] **Authentication:** create-checkout-session requires authenticated user (Supabase session check)
- [x] **Authentication:** Webhook uses Stripe signature verification (not user auth)
- [x] **Authorization:** Webhook uses service client to bypass RLS (necessary and correct)
- [x] **Authorization:** Checkout session tied to authenticated user via `client_reference_id`
- [x] **Authorization:** API routes gated by payment check -- unpaid users receive 403 (BUG-2 FIXED)
- [x] **Secrets:** STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are server-only (no NEXT_PUBLIC_ prefix)
- [x] **Secrets:** No hardcoded keys in source code
- [x] **Env documentation:** All Stripe env vars documented in .env.local.example
- [x] **Security headers:** X-Frame-Options, nosniff, HSTS, Referrer-Policy all configured in next.config.ts
- [x] **PCI compliance:** Stripe hosted checkout handles card data (app never touches PAN)
- [x] **Webhook endpoint public:** Correctly listed in publicApiRoutes in middleware
- [x] **Rate limiting:** create-checkout-session has per-user rate limiting (5 req/min) (BUG-3 FIXED)
- [x] **Input validation:** STRIPE_PRICE_AMOUNT validated as positive integer (BUG-4 FIXED)
- [x] **CSRF:** Low risk -- endpoint only creates a Stripe session, does not cause payment or data mutation

### Cross-Browser Testing
- Note: Code review only. No visual rendering issues expected -- uses standard shadcn/ui components (Card, Badge, Button, Alert).
- [x] No browser-specific APIs used
- [x] `window.location.href` for redirect works in all browsers
- [x] No CSS features that would break cross-browser

### Responsive Testing
- [x] Layout uses `min-h-screen flex flex-col items-center justify-center p-4` -- centers on all viewports
- [x] Card uses `max-w-md w-full` -- responsive by default
- [x] Button uses `w-full` -- fills card width
- Note: No breakpoint-specific styles needed for this simple layout

### Bugs Found and Fixed

#### BUG-1: SEPA debit payments may grant access before payment clears -- FIXED
- **Severity:** Medium
- **Fix applied:** Added `payment_status !== 'paid'` check in webhook handler. Added handling for `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` events.
- **File:** `src/app/api/webhooks/stripe/route.ts`

#### BUG-2: API routes not gated by payment check -- FIXED
- **Severity:** Medium
- **Fix applied:** Added payment guard in middleware for all `/api/` routes except webhooks, payment, and admin routes. Unpaid users receive 403 JSON response.
- **File:** `src/middleware.ts`

#### BUG-3: No rate limiting on create-checkout-session -- FIXED
- **Severity:** Low
- **Fix applied:** Added in-memory per-user rate limiting (5 requests per 60-second window). Returns 429 when exceeded.
- **File:** `src/app/api/payments/create-checkout-session/route.ts`

#### BUG-4: STRIPE_PRICE_AMOUNT not validated -- FIXED
- **Severity:** Low
- **Fix applied:** Added validation that price amount is a positive integer. Falls back to 19900 (199.00 EUR) for invalid values including negative numbers and NaN.
- **File:** `src/app/api/payments/create-checkout-session/route.ts`

### Build Verification
- [x] `npm run build` completes successfully with no errors after all fixes
- [x] All new routes appear in build output: `/api/payments/create-checkout-session`, `/api/webhooks/stripe`, `/onboarding/payment`
- [x] `stripe` package v20.4.1 installed in dependencies

### Regression Check
- [x] PROJ-10 (Auth): Middleware auth guard still works -- unauthenticated users redirected to /login
- [x] PROJ-10 (Auth): Login/register redirect for authenticated users still works
- [x] Existing API routes: webhook public route list includes both `/api/webhooks/` paths
- [x] Payment-exempt API routes correctly excluded from payment guard
- [x] No changes to existing dashboard pages

### Summary
- **Acceptance Criteria:** 12/12 passed
- **Bugs Found:** 4 total -- ALL FIXED (0 critical, 0 high, 2 medium, 2 low)
- **Security:** All findings addressed
- **Production Ready:** YES

## Deployment

**Deployed:** 2026-03-10
**Git Tag:** v1.12.0-PROJ-12
**Commit:** 9c1aa84
**DB Migrations:** Applied via Supabase MCP – `proj_12_add_is_paid_and_stripe_customer_id_to_profiles`

### Post-Deployment Checklist
- [ ] Add Stripe env vars in Vercel Dashboard (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_ENABLED=true`)
- [ ] Register Stripe Webhook endpoint in Stripe Dashboard: `https://<your-app>.vercel.app/api/webhooks/stripe`
  - Events to subscribe: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] Copy Signing Secret from Stripe Dashboard → set as `STRIPE_WEBHOOK_SECRET` in Vercel
- [ ] Redeploy after adding env vars (required for them to take effect)
- [ ] Test payment flow end-to-end with Stripe test card `4242 4242 4242 4242`

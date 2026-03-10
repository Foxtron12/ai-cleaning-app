# PROJ-10: User Authentication & Multi-Tenancy

## Status: In Review
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- Alle bestehenden Features (PROJ-1 bis PROJ-9) müssen auf user_id-Isolation umgestellt werden
- Voraussetzung für PROJ-11 (PMS Integration) und PROJ-12 (Payment Gate)

## Beschreibung
Die App wird von einem Single-User-System zu einer Multi-Tenant-SaaS-Plattform umgebaut.
Jeder Nutzer hat ein eigenes, vollständig isoliertes Dashboard, eigene Buchungen, Meldescheine,
Einstellungen und PMS-Anbindungen. Datenisolation erfolgt über Supabase Row Level Security (RLS).

## User Stories
- Als neuer Nutzer möchte ich mich mit E-Mail und Passwort registrieren, damit ich Zugang zur App erhalte.
- Als registrierter Nutzer möchte ich mich einloggen und ausloggen können.
- Als Nutzer möchte ich mein Passwort zurücksetzen können, wenn ich es vergessen habe.
- Als Nutzer möchte ich, dass ausschließlich meine eigenen Daten sichtbar sind – keine Daten anderer Nutzer.
- Als Nutzer möchte ich mein Profil pflegen können (Name, Firmenname, Adresse für Meldescheine/Rechnungen).
- Als App-Betreiber möchte ich, dass unbefugte Datenzugriffe auf DB-Ebene durch RLS unmöglich sind.

## Acceptance Criteria
- [ ] Supabase Auth ist aktiv – E-Mail/Passwort-Registrierung und Login funktionieren
- [ ] E-Mail-Verifizierung ist nach Registrierung erforderlich (Supabase built-in)
- [ ] Passwort-Reset-Flow via E-Mail funktioniert
- [ ] Alle geschützten Routen leiten nicht-authentifizierte Nutzer zu `/login` weiter (Next.js Middleware)
- [ ] Jede DB-Tabelle hat eine `user_id` Spalte (UUID, FK zu `auth.users`)
- [ ] RLS-Policies für SELECT, INSERT, UPDATE, DELETE auf allen Tabellen: nur eigene Daten
- [ ] User-Profil-Tabelle (`profiles`) enthält: display_name, company_name, address, tax_id, logo_url
- [ ] Profil wird beim ersten Login auto-erstellt (Trigger oder API-Route)
- [ ] Dashboard zeigt nach Login den Nutzer-Namen an
- [ ] Session bleibt nach Browser-Neustart erhalten (Supabase persistiert Session)
- [ ] Logout leert Session und leitet zu `/login` weiter

### Admin-Support-Zugang
- [ ] Admin-Endpoint `POST /api/admin/impersonate` existiert
- [ ] Endpoint ist durch `ADMIN_SECRET` env-Variable abgesichert (Header: `x-admin-secret`)
- [ ] Endpoint akzeptiert `{ user_id: "..." }` im Body
- [ ] Gibt einen einmaligen Magic-Link zurück, der den Admin als dieser Nutzer einloggt
- [ ] Ohne korrektes `ADMIN_SECRET` → HTTP 401, kein weiterer Hinweis
- [ ] Magic-Link läuft nach 1 Stunde ab (Supabase Standard)

## Edge Cases
- Was passiert, wenn ein Nutzer eine nicht verifizierte E-Mail hat und sich einloggt? → Login blockiert, Hinweis "Bitte E-Mail bestätigen" anzeigen
- Was passiert bei doppelter Registrierung mit derselben E-Mail? → Supabase gibt Fehler zurück, UI zeigt "E-Mail bereits registriert"
- Was passiert, wenn ein abgelaufenes Token zum Passwort-Reset genutzt wird? → Fehlermeldung + Link zum erneuten Anfordern
- Was passiert mit bestehenden Testdaten in der DB? → Clean Slate: DB wird komplett neu aufgesetzt mit `user_id` von Anfang an. Keine Testdaten werden übernommen.
- Was passiert, wenn jemand direkt eine API-Route mit fremder Buchungs-ID aufruft? → RLS blockiert den Zugriff auf DB-Ebene, 403-Fehler in der API-Route
- Was passiert, wenn die Session ausläuft während der Nutzer arbeitet? → Supabase Client refresht automatisch; bei Fehler → Redirect zu `/login`

## Technische Anforderungen
- Supabase Auth (keine eigene Auth-Implementierung)
- Next.js Middleware (`middleware.ts`) für Route Protection
- `@supabase/ssr` Package für Server-Side Session-Handling (App Router kompatibel)
- RLS muss auf JEDER Tabelle aktiviert sein – keine Ausnahmen
- Keine API-Route darf ohne Session-Check arbeiten
- Passwörter werden NICHT in eigenem Code gespeichert (Supabase übernimmt Hashing)
- CSRF-Schutz: Supabase Auth Tokens sind bereits CSRF-sicher
- Sensitive Profildaten (Steuer-ID) sind nur per RLS für den eigenen Nutzer lesbar

## Betroffene bestehende Features (Migration erforderlich)
- **PROJ-7** (Smoobu Sync): Buchungen müssen mit `user_id` gespeichert werden
- **PROJ-2** (Buchungsmanagement): Alle Queries müssen auf user_id filtern
- **PROJ-3** (Financial Reporting): Reports nur für eigene Buchungen
- **PROJ-4** (Meldebescheinigung): Meldescheine nur für eigene Buchungen
- **PROJ-1** (Dashboard): KPI-Cards zeigen nur eigene Daten

---

## Tech Design (Solution Architect)

### Komponenten-Struktur

```
App (Route-Struktur)
│
├── /login                          ← Neu
│   └── LoginForm
│       ├── E-Mail + Passwort Input
│       ├── "Passwort vergessen"-Link
│       └── Link → /register
│
├── /register                       ← Neu
│   └── RegisterForm
│       ├── Name + E-Mail + Passwort
│       └── Link → /login
│
├── /auth/forgot-password           ← Neu
│   └── ForgotPasswordForm
│
├── /auth/reset-password            ← Neu (Callback-URL aus E-Mail)
│   └── ResetPasswordForm
│
├── /auth/callback                  ← Neu (API-Route, kein UI)
│   └── Verarbeitet Supabase E-Mail-Links (Verifikation, Reset)
│
├── middleware.ts                   ← Neu (läuft auf JEDEM Request)
│   └── Prüft Session → Redirect zu /login wenn nicht eingeloggt
│       Schützt alle /dashboard/* Routen automatisch
│
└── /dashboard/* (bestehend, angepasst)
    ├── App-Sidebar → Nutzer-Name + Logout-Button   ← Update
    └── /einstellungen → neuer "Profil"-Tab          ← Update
        └── ProfileForm
            └── Name, Firma, Adresse, Steuer-ID, Logo
```

### Datenmodell

**Neue Tabelle: `profiles`**
```
profiles
├── id            UUID  → identisch mit auth.users.id (Primärschlüssel)
├── display_name  Text
├── company_name  Text
├── street        Text
├── zip           Text
├── city          Text
├── country       Text  (default: "DE")
├── tax_id        Text  (z.B. DE123456789)
├── logo_url      Text  (Supabase Storage URL)
├── created_at    Timestamp
└── updated_at    Timestamp
```

**Alle bestehenden Tabellen bekommen `user_id`**
```
bookings, properties, settings, meldescheine, city_tax_rules
└── + user_id   UUID   FK → auth.users(id)
                        NOT NULL
                        INDEX für Query-Performance
```

**RLS-Policies (identisch auf jeder Tabelle)**
```
SELECT:  nur Zeilen wo user_id = aktueller eingeloggter Nutzer
INSERT:  user_id wird automatisch auf aktuellen Nutzer gesetzt
UPDATE:  nur eigene Zeilen änderbar
DELETE:  nur eigene Zeilen löschbar
```

**Automatischer Profil-Trigger**
```
PostgreSQL Trigger auf auth.users:
Wenn neuer Nutzer angelegt wird → leeres Profil in profiles auto-erstellt
→ kein manueller API-Call nötig, keine Race Conditions
```

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| `@supabase/ssr` statt `@supabase/supabase-js` | Next.js App Router braucht Cookie-basierte Sessions für Server Components und Middleware. Das alte Paket unterstützt das nicht korrekt. |
| Next.js `middleware.ts` als zentraler Gate-Keeper | Eine einzige Datei schützt alle `/dashboard/*` Routen. Neue Seiten sind automatisch geschützt ohne zusätzlichen Code. |
| RLS in der Datenbank (nicht nur im Code) | Selbst wenn jemand eine API-URL direkt aufruft: die DB verweigert den Zugriff. Zweifache Sicherheit. |
| Supabase Built-in Auth | Kein eigener Auth-Server. Supabase übernimmt Passwort-Hashing, E-Mail-Versand, Token-Refresh und Sicherheitsupdates. |
| PostgreSQL Trigger für Profil-Anlage | Garantiert, dass jeder Nutzer immer ein Profil hat – ohne manuelle API-Calls oder Race Conditions. |
| Clean-Slate-Ansatz (kein Daten-Migration) | Alle bestehenden Daten sind Testdaten. Das Schema wird neu aufgesetzt mit `user_id` von Anfang an. Einfacher, sauberer, keine Kompromisse. |

### Neue Pakete

| Paket | Zweck |
|---|---|
| `@supabase/ssr` | Cookie-basierte Sessions für Next.js App Router (Middleware + Server Components) |

### Betroffene bestehende Dateien

| Datei | Änderung |
|---|---|
| `src/lib/supabase.ts` | Komplett erneuert für `@supabase/ssr` – 3 neue Clients: Browser, Server, Middleware |
| `src/app/api/smoobu/sync/route.ts` | Session-Check am Anfang ergänzen |
| `src/app/api/meldescheine/*.ts` | Session-Check + user_id aus Session |
| `src/app/api/bookings/create/route.ts` | Session-Check + user_id aus Session |
| `src/components/dashboard/app-sidebar.tsx` | Nutzer-Name + Logout-Button ergänzen |
| `src/app/dashboard/einstellungen/page.tsx` | "Profil"-Tab ergänzen |
| `src/app/api/admin/impersonate/route.ts` | Neu: Magic-Link-Endpoint für Admin-Support |

### Admin-Support-Workflow (Option 1 + 2)

**Option 1 – Supabase Studio (immer verfügbar, kein Code)**
```
dashboard.supabase.com → Projekt → Table Editor oder SQL Editor
→ Voller Zugriff auf alle Tabellen (Service Role bypasses RLS)
→ Gut für: Daten lesen, SQL-Fixes, manuelle Korrekturen
```

**Option 2 – Magic-Link Impersonation (für UI-Support)**
```
Schritt 1: Admin ruft Endpoint auf (z.B. via curl oder Postman):
  POST /api/admin/impersonate
  Header: x-admin-secret: <ADMIN_SECRET aus .env>
  Body:   { "user_id": "uuid-des-kunden" }

Schritt 2: Endpoint gibt Magic-Link zurück
  → Admin öffnet Link im Browser
  → Ist jetzt als dieser Nutzer eingeloggt
  → Kann Dashboard, Buchungen, Sync etc. aus Kundenperspektive sehen

Schritt 3: Nach Support → normaler Logout → zurück zum eigenen Account
```

**Sicherheitsregeln:**
- `ADMIN_SECRET` ist min. 32 Zeichen, zufällig generiert, nur in `.env.local` / Vercel-Secrets
- Endpoint loggt jede Nutzung (Timestamp + user_id) in Supabase-Tabelle `admin_audit_log`
- Kein `ADMIN_SECRET` → kein Zugang, egal von welcher IP

## QA Test Results

**Tested:** 2026-03-10
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** Compiles successfully (Next.js 16.1.6, Turbopack)

### Acceptance Criteria Status

#### AC-1: Supabase Auth -- E-Mail/Passwort-Registrierung und Login
- [x] `/register` page exists with Name, E-Mail, Passwort fields
- [x] `/login` page exists with E-Mail, Passwort fields
- [x] Registration uses `supabase.auth.signUp()` with `display_name` in metadata
- [x] Login uses `supabase.auth.signInWithPassword()`
- [x] Post-login redirect uses `window.location.href` (correct per frontend rules)

#### AC-2: E-Mail-Verifizierung nach Registrierung
- [x] After registration, success screen shows "Bestaetigungs-E-Mail gesendet"
- [x] Login page handles "email not confirmed" error with German message

#### AC-3: Passwort-Reset-Flow via E-Mail
- [x] `/auth/forgot-password` page exists with email input
- [x] `/auth/reset-password` page exists with password + confirm fields
- [x] Password confirmation validation (mismatch check)
- [x] Minimum 6 character validation
- [x] Expired/invalid token handling with error message
- [ ] BUG-1: Forgot-password redirectTo bypasses `/auth/callback` (see bugs)

#### AC-4: Route Protection via Middleware
- [x] `middleware.ts` exists and protects all `/dashboard/*` routes
- [x] Unauthenticated users redirected to `/login`
- [x] Authenticated users redirected away from `/login` and `/register`
- [x] API routes return 401 JSON for unauthenticated requests
- [x] Public API routes exempted (`/api/admin/impersonate`, `/api/webhooks/`)

#### AC-5: user_id Spalte auf allen DB-Tabellen
- [x] `bookings` has `user_id` (verified in database.types.ts)
- [x] `properties` has `user_id`
- [x] `settings` has `user_id`
- [x] `registration_forms` (meldescheine) has `user_id`
- [x] `city_tax_rules` has `user_id`

#### AC-6: RLS-Policies (nur eigene Daten)
- [x] All API routes filter by `user_id` from session (code-level isolation)
- [x] Settings query: `.eq('user_id', user.id)` in einstellungen page
- [x] Bookings insert: `user_id: user.id` in create route
- [x] Meldescheine: `.eq('user_id', user.id)` in all CRUD operations
- [x] Smoobu sync: `.eq('user_id', userId)` on all queries
- NOTE: RLS policies themselves are in Supabase (not verifiable from code alone -- requires DB inspection)

#### AC-7: User-Profil-Tabelle (profiles)
- [x] `profiles` table exists with: display_name, company_name, street, zip, city, country, tax_id, logo_url
- [x] created_at, updated_at timestamps present

#### AC-8: Profil auto-erstellt beim ersten Login
- NOTE: Spec says PostgreSQL trigger on auth.users. Cannot verify trigger existence from code. The `/api/profile` GET route queries profiles table -- if trigger does not exist, first profile fetch will return null/error.
- [x] Profile API handles missing profile gracefully (upsert on PUT)

#### AC-9: Dashboard zeigt Nutzer-Namen an
- [ ] BUG-2: Sidebar shows user EMAIL, not display_name (see bugs)

#### AC-10: Session bleibt nach Browser-Neustart erhalten
- [x] Uses `@supabase/ssr` with cookie-based sessions (persisted by default)
- [x] Middleware refreshes session on every request via `getUser()`

#### AC-11: Logout leert Session und leitet zu /login weiter
- [x] `signOut()` called in sidebar logout handler
- [x] Redirects to `/login` via `window.location.href`

#### AC-12: Admin-Endpoint POST /api/admin/impersonate
- [x] Endpoint exists at correct path
- [x] Secured by `ADMIN_SECRET` env variable via `x-admin-secret` header
- [x] Uses timing-safe comparison (`timingSafeEqual`)
- [x] Accepts `{ user_id: "..." }` with UUID validation (Zod)
- [x] Returns magic link via `supabase.auth.admin.generateLink()`
- [x] Without correct secret: returns HTTP 401 with no hints
- [x] Audit log written to `admin_audit_log` table
- [ ] BUG-3: Audit log failure blocks magic link delivery (see bugs)

### Edge Cases Status

#### EC-1: Unverified email login attempt
- [x] Handled: login checks for "email not confirmed" and shows German error message

#### EC-2: Duplicate registration (same email)
- [x] Handled: checks for "already registered" / "user already exists" and shows German error

#### EC-3: Expired password reset token
- [x] Handled: reset-password page checks for "expired" / "invalid" in error message

#### EC-4: Direct API access with foreign booking ID
- [x] All API routes check `user_id` from session, not from request body
- [x] Meldescheine [id] route: `.eq('user_id', user.id)` on PATCH and DELETE

#### EC-5: Session expiry during work
- [x] Middleware refreshes session on every request
- [x] API routes return 401 if session expired

#### EC-6: Existing test data migration
- [x] Clean slate approach documented -- no migration needed

### Security Audit Results

- [x] Authentication: All `/dashboard/*` routes protected by middleware
- [x] Authentication: All API routes check session (except whitelisted public routes)
- [x] Authorization: All DB queries scoped to `user_id` from session
- [x] Input validation: Zod schemas on all API routes (profile, meldescheine, bookings, impersonate)
- [x] Admin impersonation: timing-safe comparison prevents timing attacks
- [x] Admin impersonation: UUID validation on user_id prevents injection
- [x] Security headers: X-Frame-Options DENY, X-Content-Type-Options nosniff, HSTS, Referrer-Policy (in next.config.ts)
- [x] Secrets: .env.local.example has dummy values, ADMIN_SECRET documented
- [x] Service role key: only used server-side in `createServiceClient()`
- [x] No hardcoded secrets in source code
- [ ] BUG-4: No rate limiting on authentication endpoints (see bugs)
- [ ] BUG-5: NEXT_PUBLIC_SITE_URL fallback to empty string in impersonate route (see bugs)

### Regression Check

- [x] Build compiles successfully -- no TypeScript errors
- [x] All existing routes still present in build output
- [x] PROJ-2 (Buchungsmanagement): bookings/create route has session check + user_id
- [x] PROJ-4 (Meldebescheinigung): all meldescheine routes have session check + user_id
- [x] PROJ-7 (Smoobu Sync): sync route has session check + user_id scoping
- [x] PROJ-3 (Financial Reporting): settings queries scoped to user_id

### Bugs Found

#### BUG-1: Forgot-password redirectTo bypasses /auth/callback
- **Severity:** Medium
- **File:** `src/app/auth/forgot-password/page.tsx` (line 23-25)
- **Steps to Reproduce:**
  1. Go to `/auth/forgot-password`
  2. Enter email and submit
  3. The `redirectTo` is set to `window.location.origin + '/auth/reset-password'`
  4. Expected: redirect should go through `/auth/callback?type=recovery` for code exchange
  5. Actual: redirects directly to `/auth/reset-password`
- **Impact:** Depending on Supabase project auth flow configuration (implicit vs PKCE), the user may arrive at the reset-password page without a valid session. The `/auth/callback` route already has logic for `type === 'recovery'` that redirects to `/auth/reset-password` after exchanging the code. This bypass means that code path is never used for password resets.
- **Fix:** Change redirectTo to `window.location.origin + '/auth/callback?type=recovery'`
- **Priority:** Fix before deployment (password reset may not work in production with PKCE flow)

#### BUG-2: Sidebar shows user email instead of display name
- **Severity:** Low
- **File:** `src/components/dashboard/app-sidebar.tsx` (lines 82-87)
- **Steps to Reproduce:**
  1. Log in to the dashboard
  2. Look at the sidebar footer
  3. Expected: User's display_name shown (from profile or auth metadata)
  4. Actual: User's email address shown
- **Impact:** Acceptance criterion "Dashboard zeigt nach Login den Nutzer-Namen an" is not met
- **Fix:** Fetch display_name from `user.user_metadata.display_name` or from the profiles table
- **Priority:** Fix in next sprint

#### BUG-3: Audit log failure blocks magic link delivery in impersonate endpoint
- **Severity:** Medium
- **File:** `src/app/api/admin/impersonate/route.ts` (lines 63-71)
- **Steps to Reproduce:**
  1. Call POST `/api/admin/impersonate` with valid admin secret and user_id
  2. If `admin_audit_log` table has RLS enabled or insert fails for any reason
  3. Expected: Magic link should still be returned (audit is secondary)
  4. Actual: Returns HTTP 500, magic link is lost but was already generated
- **Impact:** Admin cannot impersonate users if audit log write fails. The magic link was already created (valid for 1 hour) but is never returned to the caller. This creates a dangling valid magic link with no audit trail.
- **Fix:** Log audit failure as a warning but still return the magic link. Alternatively, write audit log BEFORE generating the magic link.
- **Priority:** Fix before deployment

#### BUG-4: No rate limiting on authentication endpoints
- **Severity:** Medium
- **File:** `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/register/page.tsx`
- **Steps to Reproduce:**
  1. Send rapid repeated login requests to `/login` form or directly to Supabase auth
  2. No server-side rate limiting exists in middleware or API layer
- **Impact:** Brute force attacks on login are only limited by Supabase's built-in rate limiting (which may or may not be configured). The security rules file (.claude/rules/security.md) explicitly requires "rate limiting on authentication endpoints."
- **Note:** Supabase has built-in rate limiting at the GoTrue level (default: 30 requests/hour for auth endpoints), but there is no application-level rate limiting.
- **Priority:** Fix in next sprint (Supabase provides baseline protection)

#### BUG-5: NEXT_PUBLIC_SITE_URL fallback to empty string in impersonate route
- **Severity:** Low
- **File:** `src/app/api/admin/impersonate/route.ts` (line 52)
- **Steps to Reproduce:**
  1. Deploy without setting `NEXT_PUBLIC_SITE_URL` environment variable
  2. Call impersonate endpoint
  3. Expected: Magic link redirects to correct domain
  4. Actual: `redirectTo` becomes `/dashboard` (relative path), which may cause Supabase to use its default site URL
- **Impact:** Magic link may redirect to wrong URL in production if env var not set
- **Fix:** Throw an error if `NEXT_PUBLIC_SITE_URL` is not set, or use `request.headers.get('host')` as fallback
- **Priority:** Fix before deployment

#### BUG-6: Profile country field not shown in profile tab UI
- **Severity:** Low
- **File:** `src/app/dashboard/einstellungen/page.tsx`
- **Steps to Reproduce:**
  1. Go to Einstellungen > Profil tab
  2. The profile schema includes `country` field (default "DE")
  3. Expected: Country input field visible in the profile form
  4. Actual: No country field in the UI -- only street, zip, city are shown
- **Impact:** Users cannot edit their country. The API schema accepts it but the UI does not expose it.
- **Priority:** Nice to have (default "DE" covers most users per PRD)

### Summary
- **Acceptance Criteria:** 10/12 passed (AC-9 failed, AC-3 partial)
- **Bugs Found:** 6 total (0 critical, 0 high, 3 medium, 3 low)
- **Security:** Mostly solid -- timing-safe admin auth, session checks on all routes, Zod validation everywhere. Missing app-level rate limiting (mitigated by Supabase).
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (password reset flow), BUG-3 (audit log blocking magic link), and BUG-5 (site URL fallback) before deployment. BUG-2, BUG-4, and BUG-6 can be addressed in next sprint.

## Deployment
_To be added by /deploy_

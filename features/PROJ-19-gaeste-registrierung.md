# PROJ-19: Gaeste-Registrierungsformular (Self-Service Meldeschein)

**Status:** In Review – Ready for re-QA (2026-05-06 fixes applied)
**Created:** 2026-03-23
**Priority:** P1

## Fix Pass — 2026-05-06 (Backend)

The following bugs from the 2026-05-06 QA + verification pass were addressed:

| Bug | Status | Fix |
|-----|--------|-----|
| BUG-2 (`send-link` newToken status not set to `sent`) | FIXED | `send-link/route.ts`: `tokenId` is now captured for both existing and freshly created tokens; status update applies to both. |
| BUG-3 (no `co_travellers` size limit) | FIXED | Zod schema in `[token]/route.ts` now enforces `.max(50)` on `co_travellers` and reasonable `.max(...)` caps on every string field. |
| BUG-4 (no birthdate format validation) | FIXED | New `isoDate` regex (`YYYY-MM-DD`) validates `birthdate` for guest and co-travellers; empty string is accepted. |
| BUG-5 (no CSRF on public POST) | FIXED (2026-05-06 follow-up) | `[token]/route.ts` POST now enforces same-origin via `isAllowedOrigin()` — Origin and Referer (when present) must match the request Host or `NEXT_PUBLIC_SITE_URL`. Returns 403 on mismatch. UUID token remains the bearer; this is defense-in-depth against drive-by CSRF where a token leaks via a referrer. Risk model: an attacker who already holds the token can still submit (e.g. via curl), but cannot trick a guest's browser into auto-submitting from an attacker-controlled page. |
| BUG-6 (Zod vs HTML required mismatch) | FIXED | `nationality`, `street`, `zip`, `city`, `country` are now `min(1)` in Zod, matching the HTML `required` attributes. |
| N1 (empty `{{preCheckInLink}}`) | FIXED | `[token]/route.ts` POST now passes `registrationLink: ${siteUrl}/guest/register/${token}` to `fireAutoMessageTrigger`. |
| N2 (dead `/area/` link in default Check-out template) | FIXED (2026-05-06 follow-up — deprecate) | Pragmatic decision: removed the trailing `PS:` block with `{{guestAreaLateCheckOutLink}}` from the default "Check-out Erinnerung" template (`message-template-defaults.ts`). Variable still listed in `TEMPLATE_VARIABLES` for backward compat but labeled "(veraltet)" with description "VERALTET — Gäste-Portal noch nicht verfügbar; Variable wird leer ersetzt." `auto-message.ts` and `message-conversation.tsx` now pass `undefined` for this var, so any user-customized template still containing the placeholder renders it as empty string instead of generating a 404 link. The `/guest/area/[token]` page remains a future feature (out of scope for this pass). |
| N3 (event naming mismatch — fires before arrival) | PARTIALLY FIXED | UI label in `nachrichten/page.tsx` updated to "Online-Check-In abgeschlossen" with description noting it can fire pre-arrival. Event id unchanged for backwards compat. |
| N4 (silent DB write failures in guest POST) | FIXED | `registration_forms` insert/update now check `error` and return 500 on failure. Booking + token-status updates log non-fatal errors. |

## Summary

Guests can fill out the Meldeschein (registration form) themselves via a public link, without needing a login. The host generates a token-based link from the booking detail sheet and can send it via Smoobu Messages or copy the link manually. The guest fills in personal data (name, birthdate, nationality, address, trip purpose, co-travellers), and the data flows back into the registration_forms table, updates the booking, and optionally syncs to Smoobu.

## Components

- **Public guest form:** `/guest/register/[token]` (DE + EN i18n)
- **API - GET booking data:** `/api/guest-registration/[token]` (public, token-based)
- **API - POST form submission:** `/api/guest-registration/[token]` (public, token-based)
- **API - Generate token:** `/api/guest-registration/generate-token` (authenticated)
- **API - Send link via Smoobu:** `/api/guest-registration/send-link` (authenticated)
- **Dashboard widget:** `GuestRegistrationLinkManager` in booking detail sheet
- **DB migration:** `guest_registration_tokens` table with RLS
- **i18n translations:** DE + EN
- **Message templates:** DE + EN for Smoobu message

## Acceptance Criteria

- AC-1: Host can generate a registration link from the booking detail sheet
- AC-2: Link is idempotent (calling generate again returns existing token)
- AC-3: Guest can access public form without login
- AC-4: Form is pre-filled from booking data
- AC-5: Guest can add/remove co-travellers
- AC-6: Form supports DE and EN with language toggle
- AC-7: Submitted data flows into registration_forms with guest_submitted=true
- AC-8: Submitted data updates the booking record
- AC-9: Data syncs to Smoobu (best-effort, non-fatal on error)
- AC-10: Host can send link via Smoobu Messages (OTA channel)
- AC-11: Token expires 30 days after check-out
- AC-12: Expired tokens show an expiry message
- AC-13: Invalid tokens show an error message
- AC-14: Re-submission updates existing form (not duplicates)
- AC-15: Status badge shows pending/sent/completed in dashboard
- AC-16: Rate limiting on public endpoints (15 req/min)

---

## QA Test Results

**Tested:** 2026-03-23
**App URL:** http://localhost:3099
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Host can generate a registration link from the booking detail sheet
- [x] `GuestRegistrationLinkManager` component is rendered in `booking-detail-sheet.tsx`
- [x] "Gaeste-Registrierungslink erstellen" button calls `/api/guest-registration/generate-token`
- [x] API validates auth, validates booking ownership via RLS, creates token with UUID

#### AC-2: Link is idempotent
- [x] `generate-token` checks for existing token before inserting
- [x] Returns existing token data if one already exists

#### AC-3: Guest can access public form without login
- [ ] **BUG: CRITICAL** -- Middleware blocks ALL unauthenticated API requests to `/api/guest-registration/*` with 401 (see BUG-1)

#### AC-4: Form is pre-filled from booking data
- [x] Code pre-fills firstname, lastname, nationality, street, city, zip, country, trip_purpose from booking data
- [x] If an existing form submission exists, pre-fills from that instead

#### AC-5: Guest can add/remove co-travellers
- [x] `addCoTraveller()` / `removeCoTraveller()` functions work correctly
- [x] Each co-traveller has firstname, lastname, birthdate, nationality fields
- [x] Empty co-travellers are filtered out before submission

#### AC-6: Form supports DE and EN with language toggle
- [x] Language toggle button switches between DE and EN
- [x] All form labels, buttons, and messages have translations in both languages
- [x] Initial locale is auto-detected from guest's language field in booking data

#### AC-7: Submitted data flows into registration_forms
- [x] POST handler inserts/updates registration_forms with `guest_submitted: true`
- [x] Form data includes all fields plus co_travellers array

#### AC-8: Submitted data updates the booking record
- [x] Booking is updated with street, city, zip, country, nationality, trip_purpose
- [x] Only non-empty fields are updated (conditional update)

#### AC-9: Data syncs to Smoobu
- [x] Smoobu sync is wrapped in try/catch (non-fatal)
- [x] Uses `SmoobuClient.updateReservation()` with guest data

#### AC-10: Host can send link via Smoobu Messages
- [x] `send-link` endpoint uses `SmoobuClient.sendMessage()` with localized template
- [ ] **BUG: MEDIUM** -- When a new token is created (not existing), the status is never updated to 'sent' (see BUG-2)

#### AC-11: Token expires 30 days after check-out
- [x] `generate-token` sets `expires_at = check_out + 30 days`
- [x] `send-link` also uses the same expiry logic for new tokens

#### AC-12: Expired tokens show an expiry message
- [x] GET handler returns 410 for expired tokens
- [x] Client renders `expiredTitle` / `expiredMessage` on 410

#### AC-13: Invalid tokens show an error message
- [x] GET handler returns 404 for unknown tokens
- [x] GET handler returns 400 for non-UUID tokens
- [x] Client renders `invalidTitle` / `invalidMessage` on 404

#### AC-14: Re-submission updates existing form
- [x] POST handler checks for existing form by booking_id
- [x] Uses `update` if existing, `insert` if new

#### AC-15: Status badge shows pending/sent/completed
- [x] `STATUS_CONFIG` maps all three statuses to label, variant, and icon
- [x] Badge is rendered in the link manager UI

#### AC-16: Rate limiting on public endpoints
- [x] In-memory rate limiter: 15 requests per 60 seconds per IP
- [x] Cleanup interval removes stale entries
- [x] Returns 429 when limit exceeded

### Security Audit Results

- [ ] **CRITICAL: Authentication bypass impossible** -- The opposite problem exists: the middleware at `src/middleware.ts` line 47-52 blocks ALL unauthenticated requests to `/api/guest-registration/*` because the route is not in `publicApiRoutes`. The feature is entirely broken for guests.
- [x] Authorization: Token generation requires authenticated user; booking ownership is verified via RLS
- [x] Input validation: Zod schema validates all POST data server-side
- [ ] **MEDIUM: No size limit on co_travellers array** -- The Zod schema allows unbounded arrays, enabling a denial-of-service via massive payloads (see BUG-3)
- [ ] **LOW: No birthdate format validation** -- `birthdate` is `z.string().optional()` with no date format check; arbitrary strings can be stored (see BUG-4)
- [x] No XSS: React escapes all output; no `dangerouslySetInnerHTML` in guest form
- [x] No SQL injection: Supabase parameterized queries used throughout
- [x] Secrets: API keys decrypted server-side only; no secrets exposed to client
- [x] CORS: Standard Next.js API route behavior (same-origin)
- [x] Service client usage: Public endpoints correctly use `createServiceClient()` to bypass RLS (necessary since guests are unauthenticated), but token-based access control is enforced
- [ ] **LOW: No CSRF protection on public form** -- The POST endpoint has no CSRF token. While the token-based access provides some mitigation (attacker needs the UUID), this is a minor concern for a public form (see BUG-5)
- [x] Financial data not exposed: GET endpoint only returns guest info and property name, no pricing or financial data
- [ ] **LOW: Server-side validation inconsistent with client-side requirements** -- nationality and street are `required` in HTML but `optional` in Zod schema (see BUG-6)

### Bugs Found

#### BUG-1: Middleware blocks public guest registration API (CRITICAL BLOCKER)
- **Severity:** Critical
- **File:** `src/middleware.ts` line 47-52
- **Steps to Reproduce:**
  1. As an unauthenticated user, navigate to `/guest/register/[any-valid-token]`
  2. The page loads (200) but the client-side fetch to `/api/guest-registration/[token]` returns 401
  3. The form never loads; an error state is shown
  4. Expected: GET and POST to `/api/guest-registration/[token]` should work without authentication
  5. Actual: Middleware returns `{"error":"Nicht authentifiziert"}` with status 401
- **Verified:** Confirmed via `curl` -- `curl http://localhost:3099/api/guest-registration/00000000-0000-0000-0000-000000000000` returns 401
- **Fix:** Add `/api/guest-registration/` to the `publicApiRoutes` array in `src/middleware.ts`
- **Priority:** Must fix before deployment -- entire feature is non-functional

#### BUG-2: Token status not updated to 'sent' for newly created tokens in send-link
- **Severity:** Medium
- **File:** `src/app/api/guest-registration/send-link/route.ts` lines 112-118
- **Steps to Reproduce:**
  1. Call `/api/guest-registration/send-link` for a booking that has no existing token
  2. A new token is created (lines 58-76), message is sent via Smoobu
  3. Expected: Token status is updated to 'sent'
  4. Actual: `tokenId` is derived from `existingToken?.id` which is `undefined` for new tokens; the `if (tokenId)` check fails and status remains 'pending'
- **Fix:** Capture the new token's ID and use it for the status update
- **Priority:** Fix before deployment

#### BUG-3: No size limit on co_travellers array in Zod schema
- **Severity:** Medium
- **File:** `src/app/api/guest-registration/[token]/route.ts` line 50
- **Steps to Reproduce:**
  1. POST to `/api/guest-registration/[token]` with a `co_travellers` array containing 100,000 entries
  2. Expected: Request rejected or array limited to a reasonable size (e.g., 20)
  3. Actual: All entries are accepted and written to the database
- **Fix:** Add `.max(50)` or similar to the `z.array(coTravellerSchema)` in the schema
- **Priority:** Fix in next sprint

#### BUG-4: No birthdate format validation in Zod schema
- **Severity:** Low
- **File:** `src/app/api/guest-registration/[token]/route.ts` line 43
- **Steps to Reproduce:**
  1. POST with `birthdate: "not-a-date"` or `birthdate: "<script>alert(1)</script>"`
  2. Expected: Validation rejects non-date strings
  3. Actual: Any string is accepted and stored
- **Fix:** Add `.regex(/^\d{4}-\d{2}-\d{2}$/)` or use `z.string().date()` for the birthdate field
- **Priority:** Nice to have

#### BUG-5: No CSRF protection on public guest form POST endpoint
- **Severity:** Low
- **File:** `src/app/api/guest-registration/[token]/route.ts`
- **Description:** The POST endpoint has no CSRF token. An attacker who knows a registration token UUID could craft a form on another site that auto-submits data. The risk is mitigated by the fact that tokens are UUIDs (hard to guess) and the worst case is overwriting guest registration data.
- **Priority:** Nice to have

#### BUG-6: Client-side required fields not enforced server-side
- **Severity:** Low
- **File:** `src/app/api/guest-registration/[token]/route.ts` (Zod schema) vs `src/app/guest/register/[token]/page.tsx` (HTML form)
- **Description:** The guest form marks `nationality` and `street` as required (HTML `required` attribute and red asterisk), but the Zod schema on the server has them as `z.string().optional()`. A direct API call can bypass client validation and submit without these fields.
- **Fix:** Either make these fields required in the Zod schema (`z.string().min(1)`) or remove the required indicators from the client form
- **Priority:** Fix in next sprint

### Cross-Browser Testing
- Cannot fully test due to BUG-1 (API blocked by middleware). Page layout and loading spinner render correctly.
- Layout uses `max-w-lg` with responsive padding (`px-4 py-8 sm:py-12`) which should work on all breakpoints.
- Form grid uses `grid-cols-1 sm:grid-cols-2` for responsive layout.

### Responsive Testing
- Guest layout: `max-w-lg` (512px) centered -- will fit on 375px mobile, 768px tablet, 1440px desktop
- Button width: `w-full` on submit -- good for mobile
- Language toggle: positioned with `flex items-start justify-between` -- should not overflow on small screens

### Summary
- **Acceptance Criteria:** 14/16 passed (2 failed due to BUG-1 and BUG-2)
- **Bugs Found:** 6 total (1 critical, 1 medium+1 medium, 3 low)
- **Security:** 1 critical issue (middleware blocking), 1 medium (unbounded array), 3 low
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (critical, must-fix) and BUG-2 (medium, should-fix) before deployment. BUG-3 through BUG-6 can be addressed in next sprint.

---

## QA Test Results — 2026-05-06 (Re-Test)

**Tested:** 2026-05-06
**Tester:** QA Engineer (AI, Code Walkthrough)
**Scope:** Re-verify previous bugs + investigate intersection with PROJ-20 auto-message triggering (`guest_checkin_completed`).

### Acceptance Criteria Re-Verification

| ID | Status | Evidence |
|----|--------|----------|
| AC-1 Generate Link | PASS | `src/app/api/guest-registration/generate-token/route.ts` (auth + Zod) |
| AC-2 Idempotent | PASS | generate-token line 41-55 (existing token check) |
| AC-3 Public access | **PASS (FIXED)** | `src/middleware.ts:37` now lists `/api/guest-registration/` in `publicApiRoutes` — previous BUG-1 resolved |
| AC-4 Pre-fill from booking | PASS | `[token]/route.ts` GET line 92-155 |
| AC-5 Add/remove co-travellers | PASS | `page.tsx:590-602` |
| AC-6 DE/EN i18n | PASS | locale toggle present |
| AC-7 → registration_forms with `guest_submitted=true` | PASS | `[token]/route.ts:245` |
| AC-8 Updates booking | PASS | `[token]/route.ts:308-322` (only non-empty fields) |
| AC-9 Smoobu sync (best-effort) | PASS | `[token]/route.ts:333-359` (try/catch, non-fatal) |
| AC-10 Send link via Smoobu | WARN | Endpoint works, but new-token branch still does NOT update status → see Bug-2 (UNFIXED) |
| AC-11 30-day expiry after check-out | PASS | generate-token line 58-59 |
| AC-12 Expired tokens 410 | PASS | line 87-89 |
| AC-13 Invalid tokens 404/400 | PASS | line 69-72 / 82-83 |
| AC-14 Re-submission updates | PASS | line 249-275 |
| AC-15 Status badge pending/sent/completed | PASS | `guest-registration-link-manager.tsx:23` |
| AC-16 Rate limiting 15/min | PASS | line 9-29 |

### Re-Verification of Previously Found Bugs

| Old Bug | Status | Notes |
|---------|--------|-------|
| BUG-1 (middleware blocked guest API) | **FIXED** | `/api/guest-registration/` is now in `publicApiRoutes` |
| BUG-2 (`send-link` does not flag new token as `sent`) | **NOT FIXED** | `send-link/route.ts:112` still uses `existingToken?.id`; the freshly created token's ID is discarded |
| BUG-3 (no `co_travellers` size limit) | NOT FIXED | `[token]/route.ts:52` still `z.array(...).optional()` without `.max()` |
| BUG-4 (no birthdate format validation) | NOT FIXED | line 37, 44 still `z.string().optional()` |
| BUG-5 (no CSRF on public POST) | NOT FIXED (low risk; UUID still acts as bearer) |
| BUG-6 (Zod vs HTML required mismatch) | NOT FIXED | `street` and `nationality` still optional in Zod, required in form (line 46/45) |

### New Bugs Found — 2026-05-06

#### Bug #N1 — `guest_checkin_completed` auto-message has empty `{{preCheckInLink}}` (Severity: Medium)
- **File:** `src/app/api/guest-registration/[token]/route.ts:362-374`
- **Repro:**
  1. Configure auto-trigger for `guest_checkin_completed` using template "Anreise (Check-In abgeschlossen)" (default template includes `{{preCheckInLink}}`).
  2. Guest completes the form via the registration link.
  3. POST handler fires `fireAutoMessageTrigger(...)` with `eventType: 'guest_checkin_completed'` but **does not pass `registrationLink`**.
- **Expected:** `{{preCheckInLink}}` placeholder is replaced with the registration URL so the guest can re-open the form / view their info.
- **Actual:** `replaceTemplateVariables` (line 178 of `message-template-defaults.ts`) replaces missing `preCheckInLink` with empty string → guest receives a message containing a stray empty line where the link should be.
- **Recommended Priority:** Fix in next sprint. Pass `registrationLink: \`${siteUrl}/guest/register/${token}\`` (token from URL) into the trigger call.

#### Bug #N2 — `guestAreaLateCheckOutLink` points to a non-existent route (Severity: Medium)
- **File:** `src/lib/auto-message.ts:89` and template `Check-out Erinnerung` in `message-template-defaults.ts:103`
- **Detail:** `guestAreaLateCheckOutLink` is constructed via `registrationLink.replace('/register/', '/area/')`, but no `/guest/area/[token]` route exists in `src/app/guest/`.
- **Impact:** Default check-out reminder email contains a 404 link.
- **Recommended Priority:** Fix in next sprint (either build the gäste-area page or remove the link from the default template).

#### Bug #N3 — `guest_checkin_completed` trigger fires even before check-in date (Severity: Low / By Design?)
- **File:** `src/app/api/guest-registration/[token]/route.ts:361-374`
- **Detail:** As soon as the guest submits the form, `guest_checkin_completed` fires — even if the form is filled out 4 weeks before arrival. There's no check that today is the check-in date or later. The label in the UI says "Anreise-Info (Check-In abgeschlossen)" which implies arrival, not online-check-in completion.
- **Impact:** "Welcome at the property"-style messages may be sent days/weeks before the guest actually arrives. Reading the default template, this seems intentional ("Online check-in abgeschlossen") but the UX label is misleading.
- **Recommended Priority:** Clarify naming in next sprint or rename event to `online_checkin_completed`.

### Security Audit Re-Check

- **Public POST endpoint** (`/api/guest-registration/[token]`) uses **Service Role** Supabase client, bypassing RLS. This is unavoidable for guest access but the code correctly scopes everything by `regToken` (booking_id, user_id from token row). No data-leak risk found.
- **No verification that `booking.user_id === regToken.user_id`** — if somehow a token row has stale `user_id` (e.g., booking was reassigned), the form could write under the wrong tenant. Theoretical only; tokens are bound to bookings on insert.
- ID-scan upload: file size/type validated server-side (line 280-281). Storage path `{userId}/{bookingId}/...` correctly tenant-scoped.
- Guest registration POST does not log failures — silent insert/update failures are not surfaced to the guest (lines 251, 257, 318, 325 — `await` results not checked). Severity: Low — guest sees "success" even if DB writes failed.
  - **Bug #N4 (Severity: Medium)** — `[token]/route.ts:251-275` and `:318-322`: Supabase write results not error-checked. A failed write returns success to the guest. Add `.then(({error}) => ...)` and return 500 on hard failures.

### Regression Check (other features in INDEX.md)
- PROJ-15 (Meldeschein-Verbesserungen) — registration_forms schema unchanged.
- PROJ-17 (Buchungs-Dokumenten-Upload) — booking-documents row inserted from guest POST when ID scan provided. Path is correct, RLS scoped by user_id.
- PROJ-11 (PMS-Integration) — `updateReservation` Smoobu sync untouched, still wrapped in try/catch.
- No regression detected.

### Updated Summary (2026-05-06)
- **Acceptance Criteria:** 15/16 PASS, 1 WARN (AC-10 due to BUG-2)
- **Old Bugs Status:** BUG-1 FIXED. BUG-2/3/4/5/6 still open.
- **New Bugs:** N1 (empty preCheckInLink in checkin-completed auto-msg) Medium, N2 (dead /area/ link) Medium, N3 (naming/timing) Low, N4 (silent DB write failures) Medium.
- **Production Ready:** NOT BLOCKING (BUG-1 was the blocker, now fixed); Medium-tier polish items remain.

---

## QA Consolidation — 2026-05-06 (Verification Pass)

**Verified by:** QA Engineer (AI, code re-walkthrough)

### Re-Verification of all open bugs

| Bug | Status today | Evidence |
|-----|--------------|----------|
| BUG-1 (middleware) | FIXED (still) | `src/middleware.ts:37` lists `/api/guest-registration/` |
| BUG-2 (`send-link` newToken status) | **STILL PRESENT** | `send-link/route.ts:112` — `tokenId = existingToken?.id` discards new token id |
| BUG-3 (`co_travellers` no max) | STILL PRESENT | `[token]/route.ts` Zod schema |
| BUG-4 (birthdate format) | STILL PRESENT | same file |
| BUG-5 (no CSRF) | STILL PRESENT (low risk) | UUID still acts as bearer |
| BUG-6 (Zod vs HTML required) | STILL PRESENT | nationality/street still optional in Zod |
| N1 (empty `{{preCheckInLink}}`) | **STILL PRESENT** | `[token]/route.ts:362-374` — `fireAutoMessageTrigger` called WITHOUT `registrationLink` arg. `auto-message.ts:88` then sets `preCheckInLink: undefined` → `replaceTemplateVariables` substitutes empty string |
| N2 (dead `/area/` link) | STILL PRESENT | `auto-message.ts:89` rewrites `/register/` → `/area/`; no such route exists in `src/app/guest/` |
| N3 (naming `guest_checkin_completed` fires before arrival) | STILL PRESENT | by design / unclear UX |
| N4 (silent DB write failures in guest POST) | STILL PRESENT | several `await supabase.from(...)...` without `.then(({error}))` |

### Cross-feature verdict (with PROJ-20)
- **N1 (PROJ-19) is the same root cause as the user's complaint that "manche Nachrichten unbrauchbar versandt werden":** the auto-message body sent after online-checkin contains a stray empty placeholder where the registration-link should be. Cheap fix: pass `registrationLink: ` token URL into the trigger call.

### Summary
- **Acceptance Criteria:** still 15/16 PASS, 1 WARN.
- **Open bugs:** 4 medium (BUG-2, N1, N2, N4), 2 low (BUG-3, BUG-4), 2 nice-to-have (BUG-5, BUG-6), 1 by-design (N3).
- **Production Ready:** READY for guest-form usage; auto-message **side effects** (N1) need to be fixed in conjunction with PROJ-20 #N2 / #N1.

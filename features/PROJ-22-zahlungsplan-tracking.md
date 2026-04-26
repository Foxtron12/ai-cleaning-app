# PROJ-22: Zahlungs-Tracking (Fällige Raten + Einzelrechnungen)

## Status: Planned
**Created:** 2026-04-26
**Last Updated:** 2026-04-26

## Dependencies
- Requires: PROJ-14 (Rechnungs-Erweiterungen) – `payment_schedule` JSONB existiert bereits auf `invoices`
- Requires: PROJ-5 (Rechnungserstellung) – Basis-Rechnungsfunktionalität
- Requires: PROJ-10 (Auth & Multi-Tenancy) – Datenisolation pro User

---

## Beschreibung

Bei Rechnungen mit Zahlungsplan (PROJ-14 AC-2) wird der Gesamtbetrag in monatliche Raten aufgeteilt und im PDF als Tabelle angezeigt. Es fehlt aber eine **Übersicht, welche Rate als nächstes fällig ist** und ein **Status pro Rate** (offen / bezahlt). Der Vermieter braucht einen Erinnerungsmechanismus: „Hey, du musst die Rate für RE-2026-001 (Mai) an Familie Müller schicken."

Diese Erweiterung baut auf dem bestehenden `payment_schedule` JSONB auf und führt **kein neues Schema** ein. Pro Rate wird ein optionales `paid_at`-Feld ergänzt. Ein neues Dashboard-Widget „Fällige Raten" zeigt anstehende und überfällige Raten quer über alle Rechnungen.

**Entscheidung gegen separates PDF pro Rate:** Eine Teilrechnung pro Monat würde eigene Rechnungsnummern, Storno-Workflow pro Rate und steuerliche Klarstellung verlangen — das ist Variante 2 und kein MVP-Bedarf. Der Gast erhält weiter EIN PDF mit der vollen Raten-Tabelle; der Vermieter trackt intern, was bezahlt ist.

---

## User Stories

1. Als Vermieter mit Langzeitbuchungen (3-6 Monate) möchte ich auf dem Dashboard eine Liste aller in den nächsten 14 Tagen fälligen Raten sehen, damit ich rechtzeitig Zahlungserinnerungen versende.
2. Als Vermieter möchte ich pro Rate markieren können, ob sie bezahlt ist, damit ich nicht mehrfach an dieselbe Rate erinnere.
3. Als Vermieter möchte ich überfällige Raten visuell hervorgehoben sehen (rot), damit ich keine Forderung verschlafe.
4. Als Vermieter möchte ich aus der Raten-Übersicht direkt zur Rechnung springen können, um den Gast zu kontaktieren oder das PDF erneut zu öffnen.

---

## Acceptance Criteria

### AC-1: Erweiterung `payment_schedule` um `paid_at`

- [ ] `PaymentScheduleEntry` wird erweitert um `paid_at: string | null` (ISO-Date, nullable)
- [ ] Bestehende Einträge ohne `paid_at` werden als „offen" interpretiert (kein Migrations-Backfill nötig)
- [ ] Beim Speichern einer Rechnung mit Zahlungsplan wird `paid_at: null` für alle neuen Raten gesetzt
- [ ] Im PDF (`src/lib/pdf/invoice.tsx`) **kein** sichtbarer Status — der Gast sieht weiter nur due_date + amount

### AC-2: Dashboard-Widget „Fällige Zahlungen"

- [ ] Auf der Dashboard-Übersicht (`src/app/dashboard/page.tsx`) erscheint eine neue Card „Fällige Zahlungen"
- [ ] Die Card zeigt eine Tabelle mit Spalten: **Fällig am** • **Gast** • **Rechnung** • **Betrag** • **Typ** • **Aktion**
- [ ] Zwei Quellen werden zu einer Liste vereinigt:
  - **Raten** aus `payment_schedule` (eine Zeile pro `paid_at = null` Rate, Typ-Badge „Rate X/Y")
  - **Einzelrechnungen** ohne `payment_schedule`, Status in (`created`, `sent`), Typ-Badge „Rechnung"
- [ ] Es werden nur Einträge gelistet, deren `due_date`:
  - In der Vergangenheit liegt (überfällig) ODER
  - Innerhalb der nächsten 30 Tage liegt
- [ ] Sortierung: aufsteigend nach `due_date` (überfällig zuerst)
- [ ] **Visualisierung:**
  - Überfällige Raten: rote Badge „Überfällig (X Tage)"
  - Heute fällige: gelbe Badge „Heute fällig"
  - Zukünftige (≤ 30 Tage): graue Badge „Fällig in X Tagen"
- [ ] Klick auf die Zeile öffnet das Rechnungs-Detail (Navigation zu `/dashboard/rechnungen?invoice=<id>`)
- [ ] Pro Zeile gibt es einen Button „Als bezahlt markieren" (Checkmark-Icon)
- [ ] Wenn keine Raten fällig: Empty State „Keine fälligen Raten in den nächsten 30 Tagen"
- [ ] Maximal 10 Zeilen sichtbar; bei mehr: Link „Alle anzeigen" → öffnet Vollansicht in `/dashboard/rechnungen` mit Filter `view=raten`

### AC-3: Rate als bezahlt / unbezahlt markieren

- [ ] Im Dashboard-Widget UND im Rechnungs-Detail-Sheet kann pro Rate `paid_at` umgeschaltet werden
- [ ] Beim Markieren als bezahlt: `paid_at = today` (ISO-Date)
- [ ] Beim Zurücksetzen: `paid_at = null`
- [ ] Update erfolgt optimistisch im UI mit Toast-Bestätigung
- [ ] Bei DB-Fehler: Rollback im UI + Error-Toast
- [ ] Aktion ist auditierbar via `updated_at` der `invoices`-Zeile (kein eigener Audit-Log nötig)

### AC-4: Raten-Übersicht im Rechnungs-Detail

- [ ] Im Rechnungs-Detail-Sheet (bestehender Sheet in `src/app/dashboard/rechnungen/page.tsx`) wird der Zahlungsplan-Block erweitert:
  - Pro Rate: Datum • Betrag • Status-Badge (Offen / Bezahlt am DD.MM.YYYY) • Toggle-Button
  - Wenn alle Raten bezahlt: Banner „Vollständig bezahlt" (grün)
  - Wenn überfällige Raten existieren: Banner „X Rate(n) überfällig" (rot)
- [ ] Bei Storno-/Gutschrift-Rechnungen (PROJ-18): Zahlungsplan-Block wird ausgeblendet (kein Tracking auf Stornos)

### AC-5: Filter „Nur Rechnungen mit offenen Raten" in Rechnungs-Liste

- [ ] In der Rechnungs-Liste (`/dashboard/rechnungen`) gibt es einen neuen Filter-Toggle „Mit offenen Raten"
- [ ] Aktiv: zeigt nur Rechnungen, die mindestens eine Rate mit `paid_at = null` haben
- [ ] Filter ist mit bestehenden Filtern kombinierbar (Status, Datum, Property)

---

## Edge Cases

1. **Rechnung ohne Zahlungsplan:** Widget ignoriert sie komplett (kein `payment_schedule` → keine Raten).
2. **Stornorechnung mit Zahlungsplan:** Zahlungsplan wird beim Stornieren entfernt oder ausgeblendet (siehe AC-4).
3. **Rate bereits bezahlt vor Fälligkeit:** Wird sofort aus „Fällige Raten" entfernt.
4. **Mehrere offene Raten einer Rechnung:** Jede Rate erscheint als eigene Zeile im Widget.
5. **Rate manuell rückgängig gemacht (`paid_at` zurück auf null):** Erscheint wieder im Widget, falls Fälligkeitsdatum im Range.
6. **Migration alter `payment_schedule`-Einträge:** Einträge ohne `paid_at` gelten als offen — keine SQL-Migration nötig, JSONB ist schema-flexibel.
7. **Zeitzone:** Alle Datumsvergleiche in lokaler Zeit (Europe/Berlin), `due_date` ist date-only ohne Zeit.

---

## Out of Scope (für PROJ-22)

- Automatischer E-Mail-Versand von Zahlungserinnerungen (separates Feature, eventuell PROJ-23 mit Resend/Postmark)
- Separate PDF pro Rate (Variante 2) — bewusst nicht gewählt
- Stripe-Zahlungslink pro Rate (separates Feature, baut auf PROJ-8 auf)
- Mahnstufen / Zinsberechnung für überfällige Raten
- Webhook bei Stripe-Payment für Auto-Markierung als bezahlt

---

## Technische Notizen

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `src/app/dashboard/rechnungen/page.tsx` | `PaymentScheduleEntry` um `paid_at` erweitern, Detail-Sheet-Block + Filter |
| `src/app/dashboard/page.tsx` | Neue Card „Fällige Raten" |
| `src/components/dashboard/upcoming-installments-card.tsx` | NEU – Widget-Komponente |
| `src/lib/installments.ts` | NEU – Helper: `getUpcomingInstallments(invoices, daysAhead)`, `togglePaid(invoiceId, dueDate)` |

### Datenmodell-Erweiterung

Bestehender Typ:
```ts
interface PaymentScheduleEntry {
  due_date: string  // ISO-Date
  amount: number
}
```

Neuer Typ:
```ts
interface PaymentScheduleEntry {
  due_date: string
  amount: number
  paid_at: string | null  // ISO-Date wenn bezahlt
}
```

**Keine SQL-Migration nötig** – JSONB akzeptiert das neue Feld direkt. Alte Einträge ohne `paid_at` werden im UI als `null` (offen) interpretiert.

### Query-Strategie

Da `payment_schedule` ein JSONB-Array ist, geschieht das Filtern client-seitig: alle Rechnungen des Users laden (bereits durch RLS isoliert), JSONB durchgehen, fällige Raten ableiten. Bei > 500 aktiven Rechnungen mit Plan später optional Server-Aggregation via SQL-View.

---

## Done Definition

- [ ] AC-1 bis AC-5 alle implementiert
- [ ] Widget rendert korrekt im Empty State, mit 1, mit 10+ Raten
- [ ] Toggle „Bezahlt" funktioniert optimistisch + persistent
- [ ] Keine Regression im bestehenden PDF-Output (Gast sieht keinen Status)
- [ ] Stornorechnungen blenden Raten-Tracking sauber aus
- [ ] Mobile-Layout (375px) für Widget responsive

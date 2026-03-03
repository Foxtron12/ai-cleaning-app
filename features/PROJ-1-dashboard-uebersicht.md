# PROJ-1: Dashboard-Übersicht

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- None (Basis-Feature, wird von allen anderen genutzt)

## Beschreibung
Zentrales Dashboard als Einstiegspunkt für den Vermieter. Zeigt auf einen Blick: aktuelle Buchungslage, Auslastung, monatliche Einnahmen und kommende Check-ins/Check-outs. Liest echte Daten aus Supabase (synchronisiert von Smoobu API).

## User Stories
- Als Vermieter möchte ich auf meinem Dashboard sofort sehen, wie viele Nächte diesen Monat gebucht sind, damit ich meine Auslastung kenne.
- Als Vermieter möchte ich sehen, welche Gäste in den nächsten 7 Tagen ein- und auschecken, damit ich vorbereitet bin.
- Als Vermieter möchte ich meinen monatlichen Brutto- und Nettoumsatz auf einen Blick sehen, damit ich weiß wie gut der Monat läuft.
- Als Vermieter möchte ich eine Übersicht der Buchungsquellen (Airbnb, Booking.com, Direkt) sehen, damit ich weiß wo meine Gäste herkommen.
- Als Vermieter möchte ich eine Kalenderansicht mit belegten/freien Tagen sehen, damit ich schnell Verfügbarkeiten erkenne.

## Acceptance Criteria
- [ ] Dashboard zeigt KPI-Karten: Buchungen diesen Monat, Auslastung in %, Brutto-Umsatz, Netto-Umsatz (nach Provisionen)
- [ ] "Anstehende Aktivitäten"-Sektion zeigt Check-ins und Check-outs der nächsten 7 Tage
- [ ] Monatskalender zeigt belegte (farbig) und freie (grau) Tage
- [ ] Buchungsquellen-Übersicht als Donut-Chart oder Legende (Airbnb / Booking.com / Direkt / Sonstige)
- [ ] Sidebar-Navigation zu allen Hauptbereichen (Buchungen, Reporting, Meldeschein, Rechnungen)
- [ ] Daten kommen live aus Supabase (von Smoobu synchronisiert)
- [ ] Responsive Design: mobile (375px), tablet (768px), desktop (1440px)
- [ ] Ladezeit unter 500ms (Supabase cached data)

## Edge Cases
- Keine Buchungen in einem Monat: leere States mit "Keine Buchungen" Hinweis
- Alle Tage belegt: Kalender zeigt 100% Auslastung korrekt
- Smoobu API nicht erreichbar: Dashboard zeigt gecachte Daten aus Supabase
- Navigation funktioniert auch auf Mobilgeräten (Hamburger-Menü oder Bottom-Nav)

## Technical Requirements
- Next.js App Router, TypeScript
- shadcn/ui Komponenten: Card, Badge, Button, Sidebar, Sheet, Table
- Chart-Library: shadcn/ui Charts (recharts-basiert)
- Supabase als Datenbank (Buchungen, Rechnungen, Meldescheine, Settings)
- Smoobu API-Sync via Server Actions / API Routes
- Layout-Komponente für alle Dashboard-Seiten

---

## Tech Design (Solution Architect)

### Gesamtarchitektur MVP (gilt für PROJ-1 bis PROJ-6 + PROJ-7)

#### Grundprinzip: Smoobu → Supabase → Dashboard
Smoobu API liefert die echten Buchungsdaten. Diese werden in Supabase gecacht.
Das Dashboard liest ausschließlich aus Supabase (schnell, offline-fähig).
Rechnungen, Meldescheine und Einstellungen werden direkt in Supabase gespeichert.

#### Datenfluss
```
Smoobu API ──(Sync)──→ Supabase ──(Read)──→ Next.js Dashboard
                           ↑
              Rechnungen, Meldescheine, Settings werden
              direkt in Supabase erstellt/gespeichert
```

#### App-Struktur (Seiten)
```
src/app/
├── layout.tsx                    Root Layout
├── page.tsx                      Redirect → /dashboard
└── dashboard/
    ├── layout.tsx                Sidebar + Header (geteilt)
    ├── page.tsx                  PROJ-1: KPIs, Kalender, Aktivitäten
    ├── buchungen/
    │   └── page.tsx              PROJ-2: Buchungsliste + Detail-Sheet
    ├── reporting/
    │   └── page.tsx              PROJ-3: Charts + Finanztabelle
    ├── meldescheine/
    │   └── page.tsx              PROJ-4: Archiv + Formular + PDF
    ├── rechnungen/
    │   └── page.tsx              PROJ-5: Archiv + Formular + PDF
    ├── steuer/
    │   └── page.tsx              PROJ-6: Steuer-Tracking + Export
    └── einstellungen/
        └── page.tsx              Settings: Vermieter, Steuer, Bank, API-Keys
```

#### Komponenten-Baum (diese Seite)
```
Dashboard-Seite
├── KPI-Cards (4x shadcn Card)
│   ├── Buchungen diesen Monat
│   ├── Auslastung in %
│   ├── Brutto-Umsatz (EUR)
│   └── Netto-Umsatz (EUR)
├── Aktivitäten-Block
│   ├── Check-ins nächste 7 Tage (Liste)
│   └── Check-outs nächste 7 Tage (Liste)
├── Charts-Reihe
│   ├── Donut-Chart (Buchungsquellen)
│   └── Balken-Chart (Monatsumsatz 6 Monate)
└── Monatskalender (belegte/freie Tage)
```

#### Datenmodell – Supabase-Tabellen

**bookings** (Kerntabelle, synchronisiert von Smoobu)
- id, external_id (Smoobu Reservation ID)
- property_name
- guest: firstname, lastname, email, phone
- guest address: street, city, zip, country, nationality
- check_in, check_out, nights
- adults, children
- channel (Airbnb / Booking.com / Direkt / Sonstige)
- amount_gross, amount_host_payout, commission_amount
- cleaning_fee, security_deposit, currency
- status (upcoming / active / completed / cancelled)
- trip_purpose (leisure / business / unknown)
- notes, synced_at

**invoices** (erstellt aus Buchungen)
- id, invoice_number (RE-2026-001)
- booking_id (FK), guest snapshot, landlord snapshot
- line_items (JSONB: description, qty, unit_price, vat_rate)
- subtotal_net, total_vat, total_gross
- status (draft / created / paid / cancelled)
- issued_date, due_date, paid_date

**registration_forms** (Meldescheine)
- id, booking_id (FK)
- property snapshot, guest data, co_travellers (JSONB)
- check_in, check_out, trip_purpose
- status (created / printed / signed)

**settings** (eine Zeile pro Vermieter)
- landlord: name, address, phone, email, logo_url
- tax: tax_number, vat_id, is_kleinunternehmer
- bank: iban, bic, bank_name
- accommodation_tax: city (Dresden), model (gross_percentage), rate (6%), basis
- channels: booking_com_commission_rate (15%)
- invoicing: prefix (RE), next_number, payment_days (14)
- smoobu_api_key (verschlüsselt)

#### Smoobu API-Sync
- Settings-Seite: API-Key eingeben + "Verbindung testen"
- Initial-Sync: alle Buchungen der letzten 12 Monate importieren
- Laufende Sync: alle 15 Minuten neue/geänderte Buchungen abfragen
- Webhook-Endpoint `/api/webhooks/smoobu` für Echtzeit-Updates
- Rate Limit: max 50 req/min, exponentielles Backoff bei 429

#### Technische Entscheidungen

| Entscheidung | Warum |
|---|---|
| Supabase von Anfang an | Echte Daten, persistent, RLS-ready, kein Datenquelle-Wechsel nötig |
| Smoobu → Supabase Caching | Dashboard lädt schnell (< 500ms), auch wenn Smoobu langsam/offline |
| shadcn/ui Sidebar (installiert) | Responsive, kollabiert auf Mobile, kein Custom-Code |
| shadcn/ui Charts (recharts) | Nahtlos ins Design integriert, leichtgewichtig |
| @react-pdf/renderer | React-Komponenten als PDF, läuft im Browser, kein Server nötig |
| date-fns | Leichtgewichtig, tree-shakeable, DE-Locale verfügbar |
| Sheet für Details (installiert) | Drawer von rechts, Listenkontext bleibt erhalten |
| Server Actions für Sync | Next.js-nativ, kein extra API-Layer, typsicher |

#### Zu installierende Pakete
- `@react-pdf/renderer` – PDF-Generierung
- `date-fns` – Datumsberechnung
- `npx shadcn@latest add chart` – Charts-Komponenten

#### Neue Dateistruktur
```
src/
├── lib/
│   ├── types.ts                    TypeScript-Typen
│   ├── supabase.ts                 Supabase Client (existiert)
│   ├── smoobu.ts                   Smoobu API Client
│   ├── calculators/
│   │   ├── accommodation-tax.ts    Beherbergungssteuer
│   │   ├── invoice.ts              USt-Berechnung
│   │   └── reporting.ts            Aggregation
│   └── pdf/
│       ├── meldeschein.tsx         PDF-Vorlage
│       ├── invoice.tsx             PDF-Vorlage
│       └── tax-report.tsx          PDF-Vorlage
├── hooks/
│   ├── use-settings.ts             Einstellungen lesen/schreiben
│   ├── use-bookings.ts             Buchungen filtern/sortieren
│   └── use-tax-calculator.ts       Steuer berechnen
├── components/dashboard/
│   ├── kpi-card.tsx
│   ├── booking-table.tsx
│   ├── booking-detail-sheet.tsx
│   ├── month-calendar.tsx
│   ├── channel-chart.tsx
│   └── revenue-chart.tsx
└── app/
    ├── api/webhooks/smoobu/route.ts    Webhook-Empfänger
    └── dashboard/...                   Seiten (siehe oben)
```

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

# Product Requirements Document

## Vision
Ein zentrales Verwaltungs-Dashboard für Ferienvermieter, das alle buchungsrelevanten Daten aus Smoobu aggregiert und darauf basierend automatisch Meldebescheinigungen, Rechnungen und Steuerreports erstellt. Ziel ist es, den administrativen Aufwand bei der Ferienwohnungsvermietung drastisch zu reduzieren und eine rechtssichere Dokumentation (Meldepflicht, Beherbergungssteuer, Buchhaltung) zu gewährleisten.

## Target Users
**Primärer Nutzer: Privater Ferienvermieter (DE)**
- Verwaltet 1-10 Ferienwohnungen in Deutschland
- Nutzt Smoobu als Property-Management-System
- Hat Buchungen über verschiedene Kanäle (Airbnb, Booking.com, Direkt)
- Muss gesetzliche Pflichten erfüllen: Meldeschein, Beherbergungssteuer, Rechnungslegung
- Pain Points: Manuelle Dateneingabe, fehlende Übersicht über Netto-Einnahmen nach Provisionen, zeitaufwendige Meldeschein-Erstellung, keine automatische Rechnungserstellung

## Core Features (Roadmap)

| Priority | Feature | Status | Spec |
|----------|---------|--------|------|
| P0 (MVP) | Dashboard-Übersicht | Planned | PROJ-1 |
| P0 (MVP) | Buchungsmanagement (Live-Daten) | Planned | PROJ-2 |
| P0 (MVP) | Financial Reporting | Planned | PROJ-3 |
| P0 (MVP) | Meldebescheinigung | Planned | PROJ-4 |
| P0 (MVP) | Rechnungserstellung (PDF) | Planned | PROJ-5 |
| P0 (MVP) | Beherbergungssteuer-Tracking (Dresden 6%) | Planned | PROJ-6 |
| P0 (MVP) | Smoobu API-Integration | Planned | PROJ-7 |
| P1 | Direktbuchungen + Stripe-Zahlung | Planned | PROJ-8 |
| P2 | Lexoffice/Buchhaltungs-Integration | Planned | PROJ-9 |

## Success Metrics
- Zeitersparnis: Meldeschein in < 30 Sekunden statt 5 Minuten
- Rechnungen werden automatisch nach Check-out generiert (kein manueller Aufwand)
- Beherbergungssteuer-Report für Finanzamt on-click verfügbar
- Provisionsübersicht zeigt sofort Netto-Einnahmen pro Buchung
- Fehlerquote bei Meldescheinen: 0% durch automatisches Befüllen aus API-Daten

## Constraints
- **MVP-Scope:** Dashboard mit Live-Daten aus Smoobu API, Supabase als Datenbank
- **Tech:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Supabase
- **Standort:** Dresden (Beherbergungssteuer: 6% Bruttopreis inkl. Reinigung)
- **Rechtliches:** Deutsche Rechnungspflichtangaben (§ 14 UStG), Meldepflicht (BeherbStatG)
- **Single Developer:** Klare Priorisierung, kein Over-Engineering
- **Budget:** Supabase Free Tier, Vercel Free Tier für MVP

## Non-Goals (Phase 1 MVP)
- Kein Multi-Tenant / Mandanten-Verwaltung (ein User, eine Vermietungseinheit)
- Keine Gäste-Login-Funktion
- Kein automatischer E-Mail-Versand
- Keine mobile App (responsive Web reicht)
- Keine automatische Steuerübermittlung an Finanzämter
- Keine Stripe-Zahlung (kommt in PROJ-8)
- Keine Lexoffice-Integration (kommt in PROJ-9)

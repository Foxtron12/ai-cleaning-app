# Feature Index

> Central tracking for all features. Updated by skills automatically.

## Status Legend
- **Planned** - Requirements written, ready for development
- **In Progress** - Currently being built
- **In Review** - QA testing in progress
- **Deployed** - Live in production

## Features

| ID | Feature | Status | Spec | Created |
|----|---------|--------|------|---------|
| PROJ-1 | Dashboard-Übersicht | Planned | [PROJ-1-dashboard-uebersicht.md](PROJ-1-dashboard-uebersicht.md) | 2026-03-03 |
| PROJ-2 | Buchungsmanagement | In Review | [PROJ-2-buchungsmanagement.md](PROJ-2-buchungsmanagement.md) | 2026-03-03 |
| PROJ-3 | Financial Reporting | Deployed | [PROJ-3-financial-reporting.md](PROJ-3-financial-reporting.md) | 2026-03-03 |
| PROJ-4 | Meldebescheinigung | In Review | [PROJ-4-meldebescheinigung.md](PROJ-4-meldebescheinigung.md) | 2026-03-03 |
| PROJ-5 | Rechnungserstellung (PDF) | Planned | [PROJ-5-rechnungserstellung.md](PROJ-5-rechnungserstellung.md) | 2026-03-03 |
| PROJ-6 | Beherbergungssteuer-Tracking | Planned | [PROJ-6-beherbergungssteuer.md](PROJ-6-beherbergungssteuer.md) | 2026-03-03 |
| PROJ-7 | Smoobu API-Integration | Planned | [PROJ-7-smoobu-api.md](PROJ-7-smoobu-api.md) | 2026-03-03 |
| PROJ-8 | Direktbuchungen + Stripe-Zahlung | Planned | [PROJ-8-direktbuchungen-stripe.md](PROJ-8-direktbuchungen-stripe.md) | 2026-03-03 |
| PROJ-9 | Lexoffice / Buchhaltungs-Integration | Planned | [PROJ-9-lexoffice-integration.md](PROJ-9-lexoffice-integration.md) | 2026-03-03 |

| PROJ-10 | User Authentication & Multi-Tenancy | Deployed | [PROJ-10-auth-multi-tenancy.md](PROJ-10-auth-multi-tenancy.md) | 2026-03-05 |
| PROJ-11 | Self-Service PMS Integration | In Progress | [PROJ-11-pms-integration.md](PROJ-11-pms-integration.md) | 2026-03-05 |
| PROJ-12 | Access Payment Gate (Subscription pro Standort) | Deployed | [PROJ-12-payment-gate.md](PROJ-12-payment-gate.md) | 2026-03-05 |

<!-- Add features above this line -->

## Next Available ID: PROJ-13

## Build Order (Empfehlung)

### Phase 1 – MVP (Live-Daten aus Smoobu, Supabase DB)
1. **PROJ-7** → Smoobu API-Sync + Supabase DB-Schema (Fundament)
2. **PROJ-1** → Dashboard-Übersicht (Layout, Sidebar, KPI-Cards)
3. **PROJ-2** → Buchungsmanagement (Liste, Filter, Detail-Sheet) — Wizard-Basis ohne Stripe/Rechnung
4. **PROJ-3** → Financial Reporting (Charts, Export)
5. **PROJ-4** → Meldebescheinigung (PDF-Generierung)
6. **PROJ-5** → Rechnungserstellung (PDF, § 14 UStG konform)
7. **PROJ-6** → Beherbergungssteuer-Tracking

### Phase 2 – Direktbuchungs-Workflow
8. **PROJ-8** → Stripe-Zahlung (Zahlungslink-Generierung für PROJ-2 Wizard)
> Nach PROJ-5 + PROJ-8: PROJ-2 Wizard ist vollständig (Rechnung + Stripe-Link nach Buchungsanlage)

### Phase 3 – Erweiterungen
9. **PROJ-9** → Lexoffice-Integration (Rechnungen in Buchhaltung)

### Phase 4 – Multi-Tenancy & SaaS
> PROJ-10 muss VOR allen anderen Features deployed werden, da es die Datenisolation für alle sicherstellt.
> Empfehlung: PROJ-10 → PROJ-12 → PROJ-11 → dann restliche Features auf Multi-User umstellen

10. **PROJ-10** → User Authentication & Multi-Tenancy (Supabase Auth, RLS auf allen Tabellen, Profil-Seite)
11. **PROJ-12** → Access Payment Gate (Stripe Einmalzahlung, Zugangs-Guard)
12. **PROJ-11** → Self-Service PMS Integration (Smoobu Webhook + API-Key UI, Apaleo/Mews Scaffold)

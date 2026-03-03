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
| PROJ-2 | Buchungsmanagement | Planned | [PROJ-2-buchungsmanagement.md](PROJ-2-buchungsmanagement.md) | 2026-03-03 |
| PROJ-3 | Financial Reporting | Planned | [PROJ-3-financial-reporting.md](PROJ-3-financial-reporting.md) | 2026-03-03 |
| PROJ-4 | Meldebescheinigung | Planned | [PROJ-4-meldebescheinigung.md](PROJ-4-meldebescheinigung.md) | 2026-03-03 |
| PROJ-5 | Rechnungserstellung (PDF) | Planned | [PROJ-5-rechnungserstellung.md](PROJ-5-rechnungserstellung.md) | 2026-03-03 |
| PROJ-6 | Beherbergungssteuer-Tracking | Planned | [PROJ-6-beherbergungssteuer.md](PROJ-6-beherbergungssteuer.md) | 2026-03-03 |
| PROJ-7 | Smoobu API-Integration | Planned | [PROJ-7-smoobu-api.md](PROJ-7-smoobu-api.md) | 2026-03-03 |
| PROJ-8 | Direktbuchungen + Stripe-Zahlung | Planned | [PROJ-8-direktbuchungen-stripe.md](PROJ-8-direktbuchungen-stripe.md) | 2026-03-03 |
| PROJ-9 | Lexoffice / Buchhaltungs-Integration | Planned | [PROJ-9-lexoffice-integration.md](PROJ-9-lexoffice-integration.md) | 2026-03-03 |

<!-- Add features above this line -->

## Next Available ID: PROJ-10

## Build Order (Empfehlung)

### Phase 1 – MVP (Live-Daten aus Smoobu, Supabase DB)
1. **PROJ-7** → Smoobu API-Sync + Supabase DB-Schema (Fundament)
2. **PROJ-1** → Dashboard-Übersicht (Layout, Sidebar, KPI-Cards)
3. **PROJ-2** → Buchungsmanagement (Liste, Filter, Detail-Sheet)
4. **PROJ-3** → Financial Reporting (Charts, Export)
5. **PROJ-4** → Meldebescheinigung (PDF-Generierung)
6. **PROJ-5** → Rechnungserstellung (PDF, § 14 UStG konform)
7. **PROJ-6** → Beherbergungssteuer-Tracking (Dresden 6%)

### Phase 2 – Erweiterungen
8. **PROJ-8** → Direktbuchungen + Stripe-Zahlung
9. **PROJ-9** → Lexoffice-Integration (Rechnungen in Buchhaltung)

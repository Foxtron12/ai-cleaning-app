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
| PROJ-5 | Rechnungserstellung (PDF) | In Progress | [PROJ-5-rechnungserstellung.md](PROJ-5-rechnungserstellung.md) | 2026-03-03 |
| PROJ-6 | Beherbergungssteuer-Tracking | In Review | [PROJ-6-beherbergungssteuer.md](PROJ-6-beherbergungssteuer.md) | 2026-03-03 |
| PROJ-7 | Smoobu API-Integration | Planned | [PROJ-7-smoobu-api.md](PROJ-7-smoobu-api.md) | 2026-03-03 |
| PROJ-8 | Direktbuchungen + Stripe-Zahlung | In Progress | [PROJ-8-direktbuchungen-stripe.md](PROJ-8-direktbuchungen-stripe.md) | 2026-03-03 |
| PROJ-9 | Lexoffice / Buchhaltungs-Integration | Planned | [PROJ-9-lexoffice-integration.md](PROJ-9-lexoffice-integration.md) | 2026-03-03 |

| PROJ-10 | User Authentication & Multi-Tenancy | Deployed | [PROJ-10-auth-multi-tenancy.md](PROJ-10-auth-multi-tenancy.md) | 2026-03-05 |
| PROJ-11 | Self-Service PMS Integration | Deployed | [PROJ-11-pms-integration.md](PROJ-11-pms-integration.md) | 2026-03-05 |
| PROJ-12 | Access Payment Gate (Subscription pro Standort) | Deployed | [PROJ-12-payment-gate.md](PROJ-12-payment-gate.md) | 2026-03-05 |

| PROJ-13 | Beherbergungssteuer-Vordrucke (Automatisches Befüllen) | In Review | [PROJ-13-bhst-vordrucke.md](PROJ-13-bhst-vordrucke.md) | 2026-03-12 |
| PROJ-14 | Rechnungs-Erweiterungen (Notizfeld, Zahlungsplan, Leistungszeitraum, Gastadresse) | In Review | [PROJ-14-rechnungs-erweiterungen.md](PROJ-14-rechnungs-erweiterungen.md) | 2026-03-15 |
| PROJ-15 | Meldeschein-Verbesserungen (Alle löschen, strengere Pflichtfelder) | In Review | [PROJ-15-meldeschein-verbesserungen.md](PROJ-15-meldeschein-verbesserungen.md) | 2026-03-15 |
| PROJ-16 | BhSt UI & Export-Verbesserungen (Monatsnamen, Zeitraum-Auswahl, Excel-Export) | In Review | [PROJ-16-bhst-verbesserungen.md](PROJ-16-bhst-verbesserungen.md) | 2026-03-15 |
| PROJ-17 | Buchungs-Dokumenten-Upload (BhSt-Befreiungsbelege, Supabase Storage) | In Review | [PROJ-17-buchungs-dokumenten-upload.md](PROJ-17-buchungs-dokumenten-upload.md) | 2026-03-15 |
| PROJ-18 | Stornorechnung & Gutschrift | In Progress | [PROJ-18-stornorechnung-gutschrift.md](PROJ-18-stornorechnung-gutschrift.md) | 2026-03-19 |

| PROJ-19 | Gäste-Registrierungsformular (Self-Service Meldeschein) | In Review | [PROJ-19-gaeste-registrierung.md](PROJ-19-gaeste-registrierung.md) | 2026-03-23 |

| PROJ-20 | Messaging-Tab (Smoobu-Nachrichten) | In Review | [PROJ-20-messaging.md](PROJ-20-messaging.md) | 2026-03-23 |

| PROJ-21 | Steuerbefreiungen pro Buchung (USt + BhSt) | In Progress | [PROJ-21-steuerbefreiungen-buchung.md](PROJ-21-steuerbefreiungen-buchung.md) | 2026-04-24 |

| PROJ-22 | Zahlungsplan-Tracking (Fällige Raten) | Planned | [PROJ-22-zahlungsplan-tracking.md](PROJ-22-zahlungsplan-tracking.md) | 2026-04-26 |

<!-- Add features above this line -->

## Next Available ID: PROJ-23

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

/**
 * Beherbergungssteuer-Regeln für deutsche Städte
 * Stand: März 2026 – Ohne Gewähr auf Vollständigkeit oder tagesaktuelle Richtigkeit
 *
 * Basis-Typen:
 * - B = Brutto (inkl. 7% USt)
 * - N = Netto (ohne USt)
 * - P = Pauschale (fester Betrag pro Person/Nacht)
 * - S = Staffelung (Pauschalbetrag je nach Preisstufe)
 */

export type TaxBasis = 'B' | 'N' | 'P' | 'S'

export type TaxModelType =
  | 'gross_percentage'
  | 'net_percentage'
  | 'per_person_per_night'
  | 'tiered'

export interface TieredRate {
  /** Upper bound of price range (inclusive). Use Infinity for "and above" */
  upTo: number
  /** Tax amount in EUR for this tier */
  amount: number
}

export interface CityTaxRuleData {
  city: string
  /** Tax rate as percentage (for percentage models) or EUR (for flat/tiered) */
  rate: number
  basis: TaxBasis
  model: TaxModelType
  /** Whether business travelers are exempt */
  businessExempt: boolean
  /** Additional notes (e.g. max cap, special rules) */
  notes?: string
  /** Tiered rates for S (Staffelung) model */
  tiers?: TieredRate[]
  /** Max cap in EUR per person/night (e.g. Essen: max 9€) */
  maxCap?: number
}

/**
 * All known German cities with Beherbergungssteuer.
 * Sorted alphabetically.
 */
export const CITY_TAX_RULES: CityTaxRuleData[] = [
  // === Große Städte und Hauptorte ===
  {
    city: 'Aachen',
    rate: 2.50,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
    notes: 'Ab 01.01.2026',
  },
  {
    city: 'Berlin',
    rate: 7.5,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
    notes: 'Seit 01.01.2025. Herausrechnung: Brutto ÷ 1,075 (ÜnSt) ÷ 1,07 (USt)',
  },
  {
    city: 'Bonn',
    rate: 7,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Ab 01.01.2026. Pauschalabzug: 7€ Frühstück, je 10€ Mittag/Abend',
  },
  {
    city: 'Bremen',
    rate: 5.5,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
    notes: 'Ab 01.01.2026',
  },
  {
    city: 'Bremerhaven',
    rate: 5.5,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
    notes: 'Ab 01.01.2026',
  },
  {
    city: 'Dortmund',
    rate: 7.5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Seit 01.04.2023. Pauschalabzug: 7€ Frühstück, je 10€ Mittag/Abend',
  },
  {
    city: 'Dresden',
    rate: 6,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Inkl. Reinigungsgebühr. Pauschalabzug: 7€ Frühstück, je 10€ Mittag/Abend',
  },
  {
    city: 'Düsseldorf',
    rate: 3.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
    notes: 'Max. 21 Tage. Kinder unter 18 befreit',
  },
  {
    city: 'Erfurt',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Seit 01.01.2024. Ausnahme: Minderjährige, med. Behandlung',
  },
  {
    city: 'Essen',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    maxCap: 9,
    notes: 'Seit 01.08.2025. Max. 9€ pro Person/Nacht. Separat ausgewiesene Endreinigung zählt nicht',
  },
  {
    city: 'Flensburg',
    rate: 7.5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: true,
    notes: 'Pauschalabzug: 7€ Frühstück, je 10€ Mittag/Abend',
  },
  {
    city: 'Frankfurt am Main',
    rate: 2.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
    notes: 'Tourismusbeitrag seit 01.10.2024',
  },
  {
    city: 'Freiburg im Breisgau',
    rate: 5,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
    notes: 'Pauschalabzug: 10€ Frühstück, je 25€ Mittag/Abend',
  },
  {
    city: 'Hamburg',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: false,
    notes: 'Kultur- und Tourismustaxe. Netto-Basis.',
    tiers: [
      { upTo: 10, amount: 0 },
      { upTo: 25, amount: 0.60 },
      { upTo: 50, amount: 1.20 },
      { upTo: 100, amount: 2.40 },
      { upTo: 150, amount: 3.60 },
      { upTo: 200, amount: 4.80 },
      // above 200: +1.20 per 50€ bracket – handled in calculator
    ],
  },
  {
    city: 'Hannover',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: false,
    notes: 'Brutto-Basis. Deckel: 12€ (ab >450€)',
    tiers: [
      { upTo: 10, amount: 0.50 },
      { upTo: 25, amount: 1.50 },
      { upTo: 50, amount: 3.00 },
      { upTo: 100, amount: 4.00 },
      // above 100: +1.00 per 50€ bracket, max 12€
    ],
  },
  {
    city: 'Heidelberg',
    rate: 3.50,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
    notes: 'Ab 01.10.2025',
  },
  {
    city: 'Köln',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Seit 01.07.2024. Pauschalabzüge für Verpflegung',
  },
  {
    city: 'Konstanz',
    rate: 5.6,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Pauschalabzug: 10€ Frühstück, je 25€ Mittag/Abend',
  },
  {
    city: 'Leipzig',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Vermittlungsgebühren sind Teil der Bemessungsgrundlage',
  },
  {
    city: 'Lübeck',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Ludwigshafen am Rhein',
    rate: 5,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
    notes: 'Ab 01.01.2026. Ohne Nebenleistungen',
  },
  {
    city: 'Mannheim',
    rate: 4.5,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
    notes: 'Ab 01.01.2026, 5,0% ab 01.01.2027',
  },
  {
    city: 'Münster',
    rate: 4.5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Pauschalabzug: 10€ Frühstück, je 15€ Mittag/Abend',
  },
  {
    city: 'Osnabrück',
    rate: 3.5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Ab 01.10.2025',
  },
  {
    city: 'Potsdam',
    rate: 7.5,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
    notes: 'Ab 01.04.2025. Inkl. Reinigungsgebühr. Pauschalabzug: 7€ Frühstück, je 10€ Mittag/Abend',
  },
  {
    city: 'Saarbrücken',
    rate: 3.5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Ab 01.04.2026',
  },
  {
    city: 'Schwerin',
    rate: 7,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
    notes: 'Ab 01.05.2025. Befreit: Kinder-/Jugendgruppenreisen, Kliniken, Reha',
  },
  {
    city: 'Trier',
    rate: 3.5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
    notes: 'Basis je nach Satzungsversion unklar',
  },

  // === Weitere Städte und Gemeinden ===
  {
    city: 'Bad Säckingen',
    rate: 2.50,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Bergisch Gladbach',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Borgwedel',
    rate: 1.50,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Chemnitz',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: true,
  },
  {
    city: 'Cuxhaven',
    rate: 2.75,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Dahlem',
    rate: 1.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Damp',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: true,
    tiers: [
      { upTo: 20, amount: 1.00 },
      { upTo: 50.99, amount: 1.50 },
      { upTo: Infinity, amount: 2.00 },
    ],
  },
  {
    city: 'Darmstadt',
    rate: 2,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Duisburg',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Eisenach',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: false,
    notes: 'Staffelung nach Hotelkategorie (1-2€)',
    tiers: [
      { upTo: Infinity, amount: 1.50 },
    ],
  },
  {
    city: 'Gera',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: true,
    tiers: [
      { upTo: 40, amount: 1.00 },
      { upTo: 80, amount: 1.50 },
      { upTo: Infinity, amount: 2.00 },
    ],
  },
  {
    city: 'Greifswald',
    rate: 3.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
  },
  {
    city: 'Halbe',
    rate: 2.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
    notes: 'Brandenburg',
  },
  {
    city: 'Halle (Saale)',
    rate: 4,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Hameln',
    rate: 4,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Hannoversch Münden',
    rate: 3.5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Heimbach',
    rate: 7,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Hürtgenwald',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: true,
    tiers: [
      { upTo: 9.99, amount: 0 },
      { upTo: 19.99, amount: 0.50 },
      { upTo: 39.99, amount: 1.00 },
      { upTo: 59.99, amount: 2.00 },
      { upTo: 79.99, amount: 3.00 },
      { upTo: 99.99, amount: 4.00 },
      { upTo: Infinity, amount: 5.00 },
    ],
  },
  {
    city: 'Karlsruhe',
    rate: 4.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
    notes: 'Ab 2026: 4,00€, ab 2028: 4,50€',
  },
  {
    city: 'Kassel',
    rate: 5,
    basis: 'N',
    model: 'net_percentage',
    businessExempt: false,
  },
  {
    city: 'Kirchheim (Hessen)',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: true,
    tiers: [
      { upTo: 30, amount: 1.00 },
      { upTo: 100, amount: 1.10 },
      { upTo: Infinity, amount: 1.50 },
    ],
  },
  {
    city: 'Kleve',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: true,
  },
  {
    city: 'Königswinter',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Lautertal (Odenwald)',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: true,
    tiers: [
      { upTo: 30, amount: 1.00 },
      { upTo: 100, amount: 2.00 },
      { upTo: Infinity, amount: 3.00 },
    ],
  },
  {
    city: 'Leer (Ostfriesland)',
    rate: 3,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Lörrach',
    rate: 0.80,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Lüneburg',
    rate: 4,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: true,
    notes: 'Max. erste 7 aufeinanderfolgende Tage',
  },
  {
    city: 'Magdeburg',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Markkleeberg',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Meißen',
    rate: 1.50,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
  },
  {
    city: 'Naumburg/Bad Kösen',
    rate: 2.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
    notes: 'Hauptsaison (Apr–Okt) 2,00€; Nebensaison (Nov–Mär) 1,50€',
  },
  {
    city: 'Nideggen',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Pirna',
    rate: 3.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
  },
  {
    city: 'Raunheim',
    rate: 0,
    basis: 'S',
    model: 'tiered',
    businessExempt: true,
    tiers: [
      { upTo: 50, amount: 1.00 },
      { upTo: 99.99, amount: 2.00 },
      { upTo: Infinity, amount: 3.00 },
    ],
  },
  {
    city: 'Rheinhausen (Breisgau)',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: true,
  },
  {
    city: 'Ringsheim',
    rate: 4,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: true,
  },
  {
    city: 'Rüdesheim',
    rate: 2.50,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Saalburg-Ebersdorf',
    rate: 1.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Samtgemeinde Lühe',
    rate: 3,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Stade',
    rate: 4,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Stralsund',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Stuttgart',
    rate: 3.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: false,
    notes: 'Einführung ab Juli 2026',
  },
  {
    city: 'Überlingen',
    rate: 3.30,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
    notes: 'Hauptsaison Kurbezirk 1: 3,30€ / Kurbezirk 2: 2,40€; Nebensaison: 2,60€ / 1,95€',
  },
  {
    city: 'Weimar',
    rate: 1.50,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
    notes: '<50 Zimmer: 1,50€ (EZ) / 1,10€ (DZ+); ≥50 Zimmer: 3,00€ (EZ) / 2,25€ (DZ+)',
  },
  {
    city: 'Weiskirchen',
    rate: 1.40,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
    notes: 'Saarland. Befreit ab Nacht 3',
  },
  {
    city: 'Wertheim',
    rate: 1.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Wiesbaden',
    rate: 5.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Wismar',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: false,
  },
  {
    city: 'Lutherstadt Wittenberg',
    rate: 2.00,
    basis: 'P',
    model: 'per_person_per_night',
    businessExempt: true,
  },
  {
    city: 'Wuppertal',
    rate: 5,
    basis: 'B',
    model: 'gross_percentage',
    businessExempt: true,
  },
]

/** Helper: find a city rule by name (case-insensitive partial match) */
export function findCityTaxRule(cityName: string): CityTaxRuleData | undefined {
  const lower = cityName.toLowerCase().trim()
  return CITY_TAX_RULES.find((r) => r.city.toLowerCase() === lower)
    ?? CITY_TAX_RULES.find((r) => r.city.toLowerCase().includes(lower))
}

/** Helper: get all city names for autocomplete */
export function getCityNames(): string[] {
  return CITY_TAX_RULES.map((r) => r.city)
}

/** Format tax rule for display */
export function formatTaxRuleDescription(rule: CityTaxRuleData): string {
  const basisLabels: Record<TaxBasis, string> = {
    B: 'Brutto',
    N: 'Netto',
    P: 'Pauschale',
    S: 'Staffelung',
  }

  if (rule.model === 'tiered') {
    return `Staffelung (${basisLabels[rule.basis]})`
  }

  if (rule.model === 'per_person_per_night') {
    return `${rule.rate.toFixed(2)} € pro Person/Nacht`
  }

  return `${rule.rate}% vom ${basisLabels[rule.basis]}-Preis`
}

/**
 * Map CityTaxRuleData model to the DB-compatible accommodation_tax_model.
 * 'tiered' is mapped to 'per_person_per_night' as closest match for DB storage.
 */
export function mapToDbTaxModel(model: TaxModelType): string {
  switch (model) {
    case 'gross_percentage': return 'gross_percentage'
    case 'net_percentage': return 'net_percentage'
    case 'per_person_per_night': return 'per_person_per_night'
    case 'tiered': return 'per_person_per_night'
    default: return 'gross_percentage'
  }
}

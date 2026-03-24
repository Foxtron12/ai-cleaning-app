/**
 * Default message templates for PROJ-20 Messaging.
 * These are seeded when a user first accesses the messaging feature.
 */

export interface DefaultTemplate {
  name: string
  body: string
  language: 'de' | 'en'
  sort_order: number
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Check-in Information',
    body: `Liebe/r {gastname},

herzlich willkommen in "{property}"!

Ihr Check-in ist am {checkin}. Hier die wichtigsten Infos:
- Schluesseluebergabe: [PLATZHALTER]
- WLAN-Passwort: [PLATZHALTER]
- Ansprechpartner: [PLATZHALTER]

Falls Sie den Meldeschein noch nicht ausgefuellt haben:
{registrierungslink}

Wir freuen uns auf Sie!`,
    language: 'de',
    sort_order: 1,
  },
  {
    name: 'Check-out Erinnerung',
    body: `Liebe/r {gastname},

Ihr Aufenthalt in "{property}" endet am {checkout}.

Bitte beachten Sie:
- Check-out bis [PLATZHALTER] Uhr
- Schluessel [PLATZHALTER]

Vielen Dank fuer Ihren Besuch!`,
    language: 'de',
    sort_order: 2,
  },
  {
    name: 'Registrierungslink',
    body: `Liebe/r {gastname},

bitte fuellen Sie vor Ihrer Anreise den Meldeschein aus (gesetzliche Pflicht):
{registrierungslink}

Das Formular dauert nur 1-2 Minuten.

Viele Gruesse`,
    language: 'de',
    sort_order: 3,
  },
  {
    name: 'Check-in Bestaetigung',
    body: `Liebe/r {gastname},

vielen Dank fuer Ihre Registrierung fuer "{property}"!

Hier die wichtigsten Infos fuer Ihren Aufenthalt:
- Check-in: {checkin}
- Check-out: {checkout}
- Schluesseluebergabe: [PLATZHALTER]
- WLAN-Passwort: [PLATZHALTER]

Wir freuen uns auf Sie!`,
    language: 'de',
    sort_order: 4,
  },
  {
    name: 'Check-in Information (EN)',
    body: `Dear {gastname},

Welcome to "{property}"!

Your check-in is on {checkin}. Here is the key information:
- Key handover: [PLACEHOLDER]
- WiFi password: [PLACEHOLDER]
- Contact person: [PLACEHOLDER]

If you haven't filled out the registration form yet:
{registrierungslink}

We look forward to your stay!`,
    language: 'en',
    sort_order: 5,
  },
]

/**
 * Available template variables and their descriptions.
 */
export const TEMPLATE_VARIABLES = [
  { key: '{gastname}', label: 'Gastname', description: 'Vor- und Nachname des Gastes' },
  { key: '{property}', label: 'Objekt', description: 'Name der Ferienwohnung' },
  { key: '{checkin}', label: 'Check-in', description: 'Check-in Datum (TT.MM.JJJJ)' },
  { key: '{checkout}', label: 'Check-out', description: 'Check-out Datum (TT.MM.JJJJ)' },
  { key: '{registrierungslink}', label: 'Registrierungslink', description: 'Link zum Meldeschein-Formular' },
] as const

/**
 * Replace template variables with actual booking data.
 */
export function replaceTemplateVariables(
  template: string,
  variables: {
    gastname?: string
    property?: string
    checkin?: string
    checkout?: string
    registrierungslink?: string
  }
): string {
  let result = template
  if (variables.gastname) result = result.replace(/\{gastname\}/g, variables.gastname)
  if (variables.property) result = result.replace(/\{property\}/g, variables.property)
  if (variables.checkin) result = result.replace(/\{checkin\}/g, variables.checkin)
  if (variables.checkout) result = result.replace(/\{checkout\}/g, variables.checkout)
  if (variables.registrierungslink) {
    result = result.replace(/\{registrierungslink\}/g, variables.registrierungslink)
  } else {
    result = result.replace(/\{registrierungslink\}/g, '')
  }
  return result
}

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
    name: 'Buchungsbestaetigung',
    body: `Hi {{guestFirstName}},

vielen Dank fuer deine Buchung bei {{companyName}}!
Ich freue mich, deine Reservierung vom {{checkInDate}} bis {{checkOutDate}} fuer {{numberOfGuests}} Gaeste zu bestaetigen.

Wichtig: Bitte nutze vor deiner Anreise unseren Online-Check-in. Dieser ist notwendig, damit du alle Informationen zum Check-in erhaeltst.

Du kannst den Online-Check-in bereits jetzt schon ausfuellen, damit du am Anreisetag ganz entspannt anreisen kannst. Klicke dafuer einfach auf folgenden Link:

{{preCheckInLink}}

Wir freuen uns darauf, dich bald bei uns begruessen zu duerfen!

Beste Gruesse
Richard von {{companyName}}

Hast du noch Fragen? Schreib uns gerne hier im Chat.`,
    language: 'de',
    sort_order: 1,
  },
  {
    name: 'Online Check-In Erinnerung',
    body: `Hey {{guestFirstName}},

morgen ist dein Check-in! 😊
Dein Online-Check-in ist aktuell noch nicht abgeschlossen. Bitte schliesse ihn jetzt ab, damit du alle wichtigen Informationen fuer deine Anreise und den Check-in erhaeltst.

👉 Hier geht's direkt zum Online-Check-in: {{preCheckInLink}}

Nach dem Abschluss wirst du automatisch in deinen persoenlichen Gaeste-Online-Bereich weitergeleitet. Dort findest du alle Infos zur Anreise, zur Unterkunft und zum Check-in.

Wir freuen uns auf dich – fuehl dich ganz wie zuhause!
Dein {{companyName}} Team`,
    language: 'de',
    sort_order: 2,
  },
  {
    name: 'Anreise (Check-In abgeschlossen)',
    body: `Hey {{guestFirstName}},

super, danke! ✅ Dein Online-Check-in ist abgeschlossen.

Klicke einfach auf den folgenden Link, um deinen persoenlichen Gaeste-Online-Bereich jederzeit aufzurufen. Dort findest du alle Infos zur Anreise, zum Check-in, zu den Zugangsdaten, den WLAN-Daten und weiteren wichtigen Hinweisen fuer deinen Aufenthalt:

👉 {{preCheckInLink}}

Wir wuenschen dir eine gute Anreise und einen richtig schoenen Aufenthalt bei {{companyName}}!
Dein {{companyName}} Team`,
    language: 'de',
    sort_order: 3,
  },
  {
    name: 'Follow-up (Tag nach Check-in)',
    body: `Hey {{guestFirstName}},

ich hoffe, du bist gut angekommen und hattest eine angenehme erste Nacht bei uns. 😊
Ist alles so, wie du es dir vorgestellt hast – und findest du dich in der Unterkunft gut zurecht?

Wenn irgendetwas ist oder du Fragen hast, melde dich jederzeit gerne bei uns hier im Chat – wir sind fuer dich da.

Viele Gruesse
dein Team von {{companyName}}`,
    language: 'de',
    sort_order: 4,
  },
  {
    name: 'Check-out Erinnerung',
    body: `Hey {{guestFirstName}},

morgen ist dein Check-out – wir hoffen, du hattest eine richtig schoene Zeit bei uns und konntest deinen Aufenthalt geniessen. 👋
Du kannst ganz entspannt bis 10:00 Uhr in der Wohnung bleiben.

Damit beim Check-out alles reibungslos klappt, beachte bitte kurz diese Punkte:
→ Lege die benutzten Handtuecher im Badezimmer auf den Boden.
→ Entsorge deinen Muell in den vorgesehenen Muelleimern – um den Rest kuemmern wir uns.
→ Schalte bitte alle Lampen und Geraete aus. Falls die Spuelmaschine noch laeuft, ist das kein Problem.
→ Ziehe die Tuer beim Verlassen bitte einfach zu und achte darauf, dass sie vollstaendig geschlossen ist.
→ Lege den Schluessel nach dem Check-out wieder an den Ort zurueck, an dem du ihn bekommen hast (z. B. Schluesselkasten oder in der Wohnung).

Wenn du noch Fragen hast, sind wir jederzeit per Nachricht oder Anruf fuer dich da.

Und denk dran: Bei {{companyName}} bist du jederzeit wieder willkommen – ein Apartment ist immer bereit fuer dich. ✨

Bis hoffentlich ganz bald
dein Team von {{companyName}} 👋

PS: Wenn du spaeter auschecken moechtest, kannst du – je nach Verfuegbarkeit – ganz einfach ueber dein Gaeste-Portal einen Late-Check-out buchen:
{{guestAreaLateCheckOutLink}}`,
    language: 'de',
    sort_order: 5,
  },
  {
    name: 'Bewertung (nach Check-out)',
    body: `Hallo {{guestFirstName}},

vielen Dank, dass du bei {{companyName}} zu Gast warst – es hat uns sehr gefreut, dich in einem unserer Apartments begruessen zu duerfen!

Wenn du mit deinem Aufenthalt zufrieden warst, wuerden wir uns sehr ueber eine positive Bewertung freuen. Damit hilfst du uns und auch zukuenftigen Gaesten, sich ein gutes Bild von {{companyName}} zu machen.

Falls du Anregungen oder Wuensche hast, was wir noch besser machen koennen, schreib uns gerne direkt – wir moechten unseren Service stetig weiterentwickeln und deinen naechsten Aufenthalt noch angenehmer gestalten.

Wir wuenschen dir weiterhin schoene Reisen und wuerden uns freuen, dich bald wieder bei uns begruessen zu duerfen. 😊

Herzliche Gruesse
dein Team von {{companyName}}

PS: Als wiederkehrender Gast bekommst du bei Direktbuchung 10 % Rabatt – melde dich einfach kurz vor deiner naechsten Buchung bei uns!`,
    language: 'de',
    sort_order: 6,
  },
]

/**
 * Available template variables and their descriptions.
 */
export const TEMPLATE_VARIABLES = [
  { key: '{{guestFirstName}}', label: 'Vorname', description: 'Vorname des Gastes' },
  { key: '{{checkInDate}}', label: 'Check-in', description: 'Check-in Datum (TT.MM.JJJJ)' },
  { key: '{{checkOutDate}}', label: 'Check-out', description: 'Check-out Datum (TT.MM.JJJJ)' },
  { key: '{{numberOfGuests}}', label: 'Gaeste', description: 'Anzahl der Gaeste' },
  { key: '{{preCheckInLink}}', label: 'Online Check-In Link', description: 'Link zum Online Check-In Formular' },
  { key: '{{guestAreaLateCheckOutLink}}', label: 'Late-Checkout Link', description: 'Link zum Late-Checkout im Gaesteportal' },
  { key: '{{companyName}}', label: 'Firmenname', description: 'Name Ihres Unternehmens (aus Profil)' },
] as const

/**
 * Replace template variables with actual booking data.
 */
export function replaceTemplateVariables(
  template: string,
  variables: {
    guestFirstName?: string
    checkInDate?: string
    checkOutDate?: string
    numberOfGuests?: string
    preCheckInLink?: string
    guestAreaLateCheckOutLink?: string
    companyName?: string
  }
): string {
  let result = template

  if (variables.companyName) {
    result = result.replace(/\{\{companyName\}\}/g, variables.companyName)
  }
  if (variables.guestFirstName) {
    result = result.replace(/\{\{guestFirstName\}\}/g, variables.guestFirstName)
  }
  if (variables.checkInDate) {
    result = result.replace(/\{\{checkInDate\}\}/g, variables.checkInDate)
  }
  if (variables.checkOutDate) {
    result = result.replace(/\{\{checkOutDate\}\}/g, variables.checkOutDate)
  }
  if (variables.numberOfGuests) {
    result = result.replace(/\{\{numberOfGuests\}\}/g, variables.numberOfGuests)
  }
  if (variables.preCheckInLink) {
    result = result.replace(/\{\{preCheckInLink\}\}/g, variables.preCheckInLink)
  } else {
    result = result.replace(/\{\{preCheckInLink\}\}/g, '')
  }
  if (variables.guestAreaLateCheckOutLink) {
    result = result.replace(/\{\{guestAreaLateCheckOutLink\}\}/g, variables.guestAreaLateCheckOutLink)
  } else {
    result = result.replace(/\{\{guestAreaLateCheckOutLink\}\}/g, '')
  }

  return result
}

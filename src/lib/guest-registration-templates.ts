import type { Locale } from './i18n/guest-registration'

interface MessageTemplate {
  subject: string
  body: string
}

export function getRegistrationMessage(
  locale: Locale,
  guestName: string,
  propertyName: string,
  registrationUrl: string
): MessageTemplate {
  if (locale === 'en') {
    return {
      subject: `Registration Form – ${propertyName}`,
      body: [
        `Dear ${guestName},`,
        '',
        `We look forward to your stay at "${propertyName}".`,
        '',
        'Please complete the registration form before your arrival (required by German law):',
        registrationUrl,
        '',
        'It only takes 1–2 minutes.',
        '',
        'Best regards',
      ].join('\n'),
    }
  }

  return {
    subject: `Meldeschein – ${propertyName}`,
    body: [
      `Liebe/r ${guestName},`,
      '',
      `wir freuen uns auf Ihren Aufenthalt in unserer Ferienwohnung "${propertyName}".`,
      '',
      'Bitte füllen Sie vorab den Meldeschein aus (gesetzliche Pflicht in Deutschland):',
      registrationUrl,
      '',
      'Das Formular dauert nur 1–2 Minuten.',
      '',
      'Viele Grüße',
    ].join('\n'),
  }
}

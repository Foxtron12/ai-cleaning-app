/**
 * Mahnwesen-Templates: Texte für Zahlungserinnerung, 1. Mahnung, 2. Mahnung.
 * Werden sowohl als E-Mail-Text (HTML, Copy-to-Clipboard) als auch im PDF verwendet.
 */

export type DunningType = 'reminder' | 'dunning1' | 'dunning2'

export interface DunningData {
  /** Anrede: "Sehr geehrte Frau Müller" / "Sehr geehrter Herr Schmidt" / "Sehr geehrte Damen und Herren" */
  salutation: string
  /** Rechnungsnummer */
  invoiceNumber: string
  /** Rechnungsdatum (dd.MM.yyyy) */
  invoiceDate: string
  /** Fälligkeitsdatum (dd.MM.yyyy) */
  dueDate: string
  /** Rechnungsbetrag gesamt (formatiert, z.B. "1.234,56 €") */
  totalAmount: string
  /** Offener Betrag (formatiert) */
  openAmount: string
  /** Firmenname des Vermieters */
  companyName: string
  /** IBAN */
  iban?: string
  /** BIC */
  bic?: string
  /** Bankname */
  bankName?: string
  /** Zahlungslink URL */
  paymentLink?: string
  /** Gast-Email */
  guestEmail?: string
  /** Property Name */
  propertyName?: string
}

export const DUNNING_LABELS: Record<DunningType, string> = {
  reminder: 'Zahlungserinnerung',
  dunning1: '1. Mahnung',
  dunning2: '2. Mahnung',
}

/** Generate the plain-text body for the dunning document */
export function getDunningText(type: DunningType, data: DunningData): string {
  const bank = [
    data.bankName ? `Bank: ${data.bankName}` : '',
    data.iban ? `IBAN: ${data.iban}` : '',
    data.bic ? `BIC: ${data.bic}` : '',
  ].filter(Boolean).join('\n')

  const paymentOptions = data.paymentLink
    ? `\nAlternativ können Sie den Betrag bequem über unseren Online-Zahlungslink begleichen – dort stehen Ihnen neben der Banküberweisung auch weitere Zahlungsmethoden wie PayPal, Klarna, Kreditkarte oder Apple Pay zur Verfügung.`
    : ''

  switch (type) {
    case 'reminder':
      return `${data.salutation},

wir möchten Sie freundlich daran erinnern, dass die Rechnung Nr. ${data.invoiceNumber} vom ${data.invoiceDate} über einen Betrag von ${data.totalAmount} noch nicht beglichen wurde. Das Zahlungsziel war der ${data.dueDate}.

Wir bitten Sie, den offenen Betrag in Höhe von ${data.openAmount} zeitnah per Überweisung auf das nachfolgend genannte Konto zu begleichen.

${bank}
${paymentOptions}

Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie diese Erinnerung bitte als gegenstandslos. Bei Rückfragen stehen wir Ihnen selbstverständlich gerne zur Verfügung.

Mit freundlichen Grüßen

${data.companyName}`

    case 'dunning1':
      return `${data.salutation},

leider konnten wir bis heute keinen Zahlungseingang zur Rechnung Nr. ${data.invoiceNumber} vom ${data.invoiceDate} über ${data.totalAmount} feststellen. Die Zahlung war am ${data.dueDate} fällig.

Wir bitten Sie, den offenen Betrag in Höhe von ${data.openAmount} umgehend per Überweisung auf das nachfolgend genannte Konto zu begleichen.

${bank}
${paymentOptions}

Sollte sich Ihre zwischenzeitlich erfolgte Zahlung mit dieser Mahnung überschnitten haben, bitten wir Sie, dieses Schreiben als gegenstandslos zu betrachten. Für Rückfragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen

${data.companyName}`

    case 'dunning2':
      return `${data.salutation},

trotz unserer bisherigen Zahlungserinnerung und Mahnung ist die Rechnung Nr. ${data.invoiceNumber} vom ${data.invoiceDate} über ${data.totalAmount} weiterhin offen. Die Zahlung war am ${data.dueDate} fällig.

Wir fordern Sie hiermit letztmalig auf, den offenen Betrag in Höhe von ${data.openAmount} innerhalb von 7 Tagen ab Zugang dieses Schreibens per Überweisung auf das nachfolgend genannte Konto zu begleichen.

${bank}
${paymentOptions}

Sollte der Betrag nicht fristgerecht bei uns eingehen, werden wir die Forderung ohne weitere Ankündigung an ein Inkassounternehmen übergeben. In diesem Fall kommen weitere Kosten (Inkassogebühren, Verzugszinsen, ggf. Gerichtskosten) auf Sie zu, die wir Ihnen ebenfalls in Rechnung stellen werden.

Wir möchten eine einvernehmliche Lösung und bitten Sie daher, die Zahlung jetzt vorzunehmen oder sich umgehend mit uns in Verbindung zu setzen, falls es Unstimmigkeiten gibt.

Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, bitten wir Sie, es als gegenstandslos zu betrachten.

Mit freundlichen Grüßen

${data.companyName}`
  }
}

/** Generate HTML email for dunning (styled for Gmail paste) */
export function generateDunningEmailHtml(type: DunningType, data: DunningData): string {
  const label = DUNNING_LABELS[type]
  const bodyText = getDunningText(type, data)
  // Convert plain text to HTML paragraphs
  const htmlBody = bodyText
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // Keep line breaks within a paragraph (e.g. bank details)
      const inner = p.replace(/\n/g, '<br>')
      return `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.7;color:#163040;">${inner}</p>`
    })
    .join('\n')

  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  ${label} – Rechnung ${data.invoiceNumber}
</div>
<center style="width:100%;background:#E7EFF4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E7EFF4;">
    <tr>
      <td align="center" style="padding:22px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <!-- HEADER -->
          <tr>
            <td style="background:#3C5A6B;border-radius:16px 16px 0 0;padding:16px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
                    <div style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;opacity:.95;">NORA STAYS</div>
                    <div style="font-size:22px;font-weight:900;line-height:1.15;margin-top:4px;">${label}</div>
                  </td>
                  <td align="right" valign="middle" style="font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
                    <div style="font-size:14px;font-weight:800;">Rechnung ${data.invoiceNumber}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="background:#F2F6F9;border:1px solid #C9D6DF;border-top:none;border-radius:0 0 16px 16px;padding:22px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;">
                    ${htmlBody}
                    ${data.paymentLink ? `
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto;">
                      <tr>
                        <td align="center" style="background:#3C5A6B;border-radius:10px;">
                          <a href="${data.paymentLink}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:900;color:#FFFFFF;text-decoration:none;letter-spacing:.4px;">
                            Jetzt bezahlen &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="padding:14px 22px 0;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:11px;color:#888;text-align:center;">
                &copy; 2026 ${data.companyName}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</center>`
}

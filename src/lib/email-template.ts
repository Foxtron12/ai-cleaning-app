/**
 * HTML E-Mail-Template für Buchungsbestätigungen mit Zahlungslink.
 * Basiert auf dem NORA Stays Branding.
 */

interface BookingEmailParams {
  guestFirstname: string
  guestLastname: string
  propertyName: string
  checkIn: string
  checkOut: string
  adults: number
  bookingId: string
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

function calcNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn)
  const end = new Date(checkOut)
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export function generateBookingEmailHtml({
  guestFirstname,
  guestLastname,
  propertyName,
  checkIn,
  checkOut,
  adults,
  bookingId,
}: BookingEmailParams): string {
  const baseUrl = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin)
    : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
  const payLink = `${baseUrl}/pay/${bookingId}`
  const arrivalDate = formatDate(checkIn)
  const departureDate = formatDate(checkOut)
  const nights = calcNights(checkIn, checkOut)

  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  Vielen Dank f\u00fcr Ihre Buchung \u2013 ${propertyName}
</div>
<center style="width:100%;background:#E7EFF4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E7EFF4;">
    <tr>
      <td align="center" style="padding:22px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;">

          <!-- HEADER -->
          <tr>
            <td style="background:#3C5A6B;border-radius:16px 16px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:16px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="stack" valign="middle" style="padding:0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td valign="middle" style="padding:0 12px 0 0;">
                                <img src="https://onecdn.io/media/7c7dc80b-0d3c-41a3-a99b-ae4254d97289/md2x" width="26" height="26" alt="" style="width:26px;height:26px;">
                              </td>
                              <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
                                <div style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;opacity:.95;">
                                  NORA STAYS
                                </div>
                                <div style="font-size:22px;font-weight:900;line-height:1.15;margin-top:4px;">
                                  Buchungsbest\u00e4tigung
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td class="stack right" align="right" valign="middle" style="padding:0;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
                          <div style="font-size:14px;font-weight:800;line-height:1.2;">
                            ${propertyName}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CARD -->
          <tr>
            <td style="background:#F2F6F9;border:1px solid #C9D6DF;border-top:none;border-radius:0 0 16px 16px;overflow:hidden;">

              <!-- BODY TEXT -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:22px 22px 10px 22px;font-family:Arial,Helvetica,sans-serif;color:#163040;line-height:1.75;">
                    <div style="font-size:18px;font-weight:900;margin:0 0 12px 0;">
                      Guten Tag ${guestFirstname} ${guestLastname},
                    </div>
                    <div style="font-size:14px;margin:0 0 14px 0;">
                      vielen Dank f\u00fcr Ihre Buchung der Unterkunft <strong>${propertyName}</strong> \u2013 wir freuen uns sehr \u00fcber Ihre Reservierung!
                    </div>
                  </td>
                </tr>
              </table>

              <!-- BOOKING DETAILS BOX -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:0 22px 10px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #C9D6DF;border-radius:14px;overflow:hidden;background:#FFFFFF;">
                      <tr>
                        <td style="background:#3C5A6B;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
                          <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.9;">
                            Ihre Buchungsdetails
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px;font-family:Arial,Helvetica,sans-serif;color:#163040;line-height:1.7;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td valign="top" style="width:50%;padding:0 12px 0 0;">
                                <div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#3C5A6B;font-weight:900;margin-bottom:6px;">
                                  Reisezeitraum
                                </div>
                                <div style="font-size:14px;">
                                  <strong>Anreise:</strong> ${arrivalDate}<br>
                                  <strong>Abreise:</strong> ${departureDate}<br>
                                  <strong>N\u00e4chte:</strong> ${nights}
                                </div>
                              </td>
                              <td valign="top" style="width:50%;padding:0;">
                                <div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#3C5A6B;font-weight:900;margin-bottom:6px;">
                                  G\u00e4ste
                                </div>
                                <div style="font-size:14px;">
                                  ${adults} Person(en)
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- PAYMENT BUTTON -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:8px 22px 10px 22px;font-family:Arial,Helvetica,sans-serif;color:#163040;line-height:1.75;">
                    <div style="font-size:14px;font-weight:900;color:#3C5A6B;margin:0 0 10px 0;">
                      Online bezahlen
                    </div>
                    <div style="font-size:14px;margin:0 0 14px 0;">
                      Im Anhang finden Sie Ihre Rechnung als PDF. Sie k\u00f6nnen Ihre Zahlung bequem \u00fcber folgenden Link vornehmen:
                    </div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background:#3C5A6B;border-radius:10px;">
                          <a href="${payLink}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:900;color:#FFFFFF;text-decoration:none;letter-spacing:.4px;">
                            Jetzt bezahlen &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CANCELLATION POLICY -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:14px 22px 22px 22px;font-family:Arial,Helvetica,sans-serif;color:#163040;line-height:1.75;">
                    <div style="font-size:14px;font-weight:900;color:#3C5A6B;margin:0 0 10px 0;">
                      Stornobedingungen
                    </div>
                    <div style="font-size:13px;color:#4A6B7C;line-height:1.7;">
                      Eine kostenfreie Stornierung ist bis 3 Tage vor Anreise m\u00f6glich. Bei einer Stornierung innerhalb dieser Frist erfolgt die vollst\u00e4ndige R\u00fcckerstattung auf die urspr\u00fcnglich verwendete Zahlungsmethode \u2013 in der Regel innerhalb von 7 Werktagen.
                    </div>
                    <div style="height:14px;line-height:14px;font-size:1px;">&nbsp;</div>
                    <div style="font-size:14px;">
                      Bei Fragen stehen wir Ihnen jederzeit gerne zur Verf\u00fcgung.
                    </div>
                    <div style="height:10px;line-height:10px;font-size:1px;">&nbsp;</div>
                    <div style="font-size:14px;">
                      Herzliche Gr\u00fc\u00dfe<br>
                      <strong>Ihr NORA Stays Team</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- FOOTER -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#3C5A6B;border-radius:0 0 16px 16px;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
                    <div style="font-size:12px;line-height:1.6;opacity:.95;">
                      Kontakt: <a href="mailto:reservations@norastays.com" style="color:#FFFFFF;text-decoration:underline;">reservations@norastays.com</a>
                      &nbsp;&nbsp;|&nbsp;&nbsp;
                      <a href="tel:+4935189672422" style="color:#FFFFFF;text-decoration:underline;">+49 351 89672422</a>
                    </div>
                    <div style="font-size:11px;margin-top:6px;opacity:.85;">
                      &copy; 2026 Spacious Living Operations GmbH &middot; NORA Stays
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</center>`
}

/**
 * Copies HTML content to clipboard so it can be pasted as rich text in Gmail.
 */
export async function copyHtmlToClipboard(html: string): Promise<void> {
  try {
    const blob = new Blob([html], { type: 'text/html' })
    const item = new ClipboardItem({ 'text/html': blob })
    await navigator.clipboard.write([item])
  } catch {
    // Fallback: copy as plain text
    await navigator.clipboard.writeText(html)
  }
}

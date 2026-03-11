import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 80,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#333',
  },
  // Logo
  logoContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  logo: {
    maxWidth: 160,
    maxHeight: 60,
  },
  // Header: guest address left, meta right
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  senderLine: {
    fontSize: 7,
    color: '#888',
    marginBottom: 6,
  },
  guestAddress: {
    width: '50%',
  },
  guestName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  metaBlock: {
    width: '42%',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  metaLabel: {
    width: 100,
    textAlign: 'right',
    color: '#555',
    marginRight: 6,
    fontSize: 9,
  },
  metaValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  // Title + intro
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  introText: {
    fontSize: 9,
    color: '#555',
    marginBottom: 12,
  },
  // Line items table (2 columns: Leistung, Betrag)
  table: {
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 4,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  colLeistung: { width: '75%' },
  colBetrag: { width: '25%', textAlign: 'right' },
  // Subtotal / payment / saldo section
  summaryRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  summaryLabel: {
    width: '75%',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  summaryValue: {
    width: '25%',
    textAlign: 'right',
    fontSize: 10,
  },
  summaryBold: {
    fontFamily: 'Helvetica-Bold',
  },
  // Tax table
  taxTable: {
    marginTop: 16,
    marginBottom: 16,
  },
  taxHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    paddingBottom: 3,
    marginBottom: 3,
    fontSize: 8,
    color: '#555',
  },
  taxRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    fontSize: 9,
  },
  taxTotalRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    fontSize: 9,
    borderTopWidth: 0.5,
    borderTopColor: '#999',
    marginTop: 2,
    fontFamily: 'Helvetica-Bold',
  },
  taxColRate: { width: '25%' },
  taxColMwst: { width: '25%', textAlign: 'right' },
  taxColNetto: { width: '25%', textAlign: 'right' },
  taxColGesamt: { width: '25%', textAlign: 'right' },
  // Kleinunternehmer note
  kleinunternehmerNote: {
    marginTop: 8,
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
  },
  // Thank you text
  thankYouText: {
    marginTop: 20,
    fontSize: 9,
    color: '#555',
  },
  // Footer (3 columns, absolute bottom)
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 6,
    fontSize: 7,
    color: '#666',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerCol: {
    width: '33%',
  },
  footerColRight: {
    width: '33%',
    textAlign: 'right',
  },
})

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' EUR'
}

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
  vatAmount: number
  total: number
}

export interface InvoicePDFData {
  invoiceNumber: string
  issuedDate: string
  dueDate: string
  servicePeriod: string
  checkIn: string
  checkOut: string
  // Landlord
  landlordName: string
  landlordAddress: string
  landlordStreet: string
  landlordZipCity: string
  landlordCountry: string
  taxNumber?: string
  vatId?: string
  phone?: string
  email?: string
  website?: string
  // Guest
  guestName: string
  guestAddress: string
  // Booking meta
  bookingReference?: string
  guestCount?: number
  // Payment
  paymentChannel?: string
  amountPaid: number
  // Line items
  lineItems: InvoiceLineItem[]
  // Totals
  subtotalNet: number
  vat7Net: number
  vat7Amount: number
  vat19Net: number
  vat19Amount: number
  totalVat: number
  totalGross: number
  // Bank
  bankIban?: string
  bankBic?: string
  bankName?: string
  paymentDays: number
  // Options
  isKleinunternehmer: boolean
  // New layout fields
  logoUrl?: string
  companyRegister?: string
  managingDirector?: string
  thankYouText?: string
}

export function InvoicePDF({ data }: { data: InvoicePDFData }) {
  const openBalance = Math.max(0, data.totalGross - data.amountPaid)

  // Build tax rows (group by vatRate)
  const taxGroups: Record<number, { net: number; vat: number; gross: number }> = {}
  if (!data.isKleinunternehmer) {
    for (const item of data.lineItems) {
      if (item.vatRate > 0) {
        if (!taxGroups[item.vatRate]) {
          taxGroups[item.vatRate] = { net: 0, vat: 0, gross: 0 }
        }
        const netForItem = item.quantity * item.unitPrice
        taxGroups[item.vatRate].net += netForItem
        taxGroups[item.vatRate].vat += item.vatAmount
        taxGroups[item.vatRate].gross += item.total
      }
    }
  }
  const taxEntries = Object.entries(taxGroups).map(([rate, vals]) => ({
    rate: Number(rate),
    ...vals,
  }))
  const totalNet = taxEntries.reduce((s, t) => s + t.net, 0)
  const totalVatSum = taxEntries.reduce((s, t) => s + t.vat, 0)
  const totalGrossSum = taxEntries.reduce((s, t) => s + t.gross, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo */}
        {data.logoUrl ? (
          <View style={styles.logoContainer}>
            <Image src={data.logoUrl} style={styles.logo} />
          </View>
        ) : (
          <View style={{ marginBottom: 24 }} />
        )}

        {/* Header: guest address left, invoice meta right */}
        <View style={styles.headerRow}>
          <View style={styles.guestAddress}>
            <Text style={styles.senderLine}>
              {data.landlordName} · {data.landlordStreet} · {data.landlordZipCity}
            </Text>
            <Text style={styles.guestName}>{data.guestName}</Text>
            {data.guestAddress ? (
              <Text style={{ fontSize: 10 }}>{data.guestAddress}</Text>
            ) : null}
          </View>
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rechnungsnr.:</Text>
              <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Datum:</Text>
              <Text style={styles.metaValue}>{data.issuedDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Anreise:</Text>
              <Text style={styles.metaValue}>{data.checkIn}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Abreise:</Text>
              <Text style={styles.metaValue}>{data.checkOut}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Gast:</Text>
              <Text style={styles.metaValue}>{data.guestName}</Text>
            </View>
            {data.bookingReference ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Reservierung:</Text>
                <Text style={styles.metaValue}>{data.bookingReference}</Text>
              </View>
            ) : null}
            {data.guestCount && data.guestCount > 0 ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Anzahl der Gäste:</Text>
                <Text style={styles.metaValue}>{data.guestCount}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Rechnung</Text>
        <Text style={styles.introText}>
          für Ihren Aufenthalt erlauben wir uns folgende Punkte in Rechnung zu stellen:
        </Text>

        {/* Line items: simple 2-column table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colLeistung}>Leistung</Text>
            <Text style={styles.colBetrag}>Betrag</Text>
          </View>
          {data.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colLeistung}>{item.description}</Text>
              <Text style={styles.colBetrag}>{formatEur(item.total)}</Text>
            </View>
          ))}
        </View>

        {/* Zwischensumme */}
        <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#333', marginTop: 2, paddingTop: 4 }]}>
          <Text style={styles.summaryLabel}>Zwischensumme (inkl. MwSt.)</Text>
          <Text style={[styles.summaryValue, styles.summaryBold]}>{formatEur(data.totalGross)}</Text>
        </View>

        {/* Payment line */}
        {data.amountPaid > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { fontFamily: 'Helvetica' }]}>
              {data.issuedDate}{' '}
              Zahlung{data.paymentChannel ? ` (${data.paymentChannel})` : ''}
            </Text>
            <Text style={styles.summaryValue}>{formatEur(data.amountPaid)}</Text>
          </View>
        )}

        {/* Offener Saldo */}
        <View style={[styles.summaryRow, { marginTop: 2 }]}>
          <Text style={styles.summaryLabel}>Offener Saldo</Text>
          <Text style={[styles.summaryValue, styles.summaryBold]}>{formatEur(openBalance)}</Text>
        </View>

        {/* Tax summary table */}
        {!data.isKleinunternehmer && taxEntries.length > 0 && (
          <View style={styles.taxTable}>
            <View style={styles.taxHeaderRow}>
              <Text style={styles.taxColRate}>Steuersatz</Text>
              <Text style={styles.taxColMwst}>MwSt.</Text>
              <Text style={styles.taxColNetto}>Netto</Text>
              <Text style={styles.taxColGesamt}>Gesamt</Text>
            </View>
            {taxEntries.map((entry, i) => (
              <View key={i} style={styles.taxRow}>
                <Text style={styles.taxColRate}>{entry.rate} %</Text>
                <Text style={styles.taxColMwst}>{formatEur(entry.vat)}</Text>
                <Text style={styles.taxColNetto}>{formatEur(entry.net)}</Text>
                <Text style={styles.taxColGesamt}>{formatEur(entry.gross)}</Text>
              </View>
            ))}
            <View style={styles.taxTotalRow}>
              <Text style={styles.taxColRate}>Gesamt</Text>
              <Text style={styles.taxColMwst}>{formatEur(totalVatSum)}</Text>
              <Text style={styles.taxColNetto}>{formatEur(totalNet)}</Text>
              <Text style={styles.taxColGesamt}>{formatEur(totalGrossSum)}</Text>
            </View>
          </View>
        )}

        {data.isKleinunternehmer && (
          <Text style={styles.kleinunternehmerNote}>
            Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
          </Text>
        )}

        {/* Thank you text */}
        {data.thankYouText ? (
          <Text style={styles.thankYouText}>{data.thankYouText}</Text>
        ) : null}

        {/* Footer: 3 columns */}
        <View style={styles.footer}>
          {/* Col 1: Company + Address */}
          <View style={styles.footerCol}>
            <Text>{data.landlordName}</Text>
            <Text>{data.landlordStreet}</Text>
            <Text>{data.landlordZipCity}</Text>
            {data.landlordCountry ? <Text>{data.landlordCountry}</Text> : null}
          </View>
          {/* Col 2: Register + GF + Tax */}
          <View style={styles.footerCol}>
            {data.companyRegister ? (
              <Text>Handelsregistereintrag: {data.companyRegister}</Text>
            ) : null}
            {data.managingDirector ? (
              <Text>Geschäftsführer: {data.managingDirector}</Text>
            ) : null}
            {data.taxNumber ? <Text>St.Nr.: {data.taxNumber}</Text> : null}
            {data.vatId ? <Text>USt.-ID.: {data.vatId}</Text> : null}
          </View>
          {/* Col 3: Bank */}
          <View style={styles.footerColRight}>
            {data.bankName ? <Text>Bankverbindung: {data.bankName}</Text> : null}
            {data.bankIban ? <Text>IBAN: {data.bankIban}</Text> : null}
            {data.bankBic ? <Text>BIC: {data.bankBic}</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  )
}

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { DunningType } from '@/lib/dunning-templates'
import { DUNNING_LABELS, getDunningText } from '@/lib/dunning-templates'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 80,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#333',
  },
  logoContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  logo: {
    maxWidth: 160,
    maxHeight: 60,
  },
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
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 16,
  },
  bodyText: {
    fontSize: 10,
    lineHeight: 1.7,
    marginBottom: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 8,
    fontSize: 7,
    color: '#888',
  },
  footerCol: {
    width: '33%',
  },
  footerColRight: {
    width: '33%',
    textAlign: 'right',
  },
})

export interface DunningPDFData {
  type: DunningType
  // Guest
  guestName: string
  guestStreet?: string
  guestZipCity?: string
  guestCountry?: string
  // Invoice reference
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  totalAmount: string
  openAmount: string
  // Today's date
  documentDate: string
  // Landlord
  landlordName: string
  landlordStreet: string
  landlordZipCity: string
  landlordCountry: string
  taxNumber?: string
  vatId?: string
  companyRegister?: string
  managingDirector?: string
  // Bank
  bankName?: string
  bankIban?: string
  bankBic?: string
  // Logo
  logoUrl?: string
  // Payment link
  paymentLink?: string
}

export function DunningPDF({ data }: { data: DunningPDFData }) {
  const label = DUNNING_LABELS[data.type]
  const senderLine = [data.landlordName, data.landlordStreet, data.landlordZipCity]
    .filter(Boolean)
    .join(' · ')

  // Build dunning text for the PDF
  const dunningBody = getDunningText(data.type, {
    salutation: '', // We render salutation separately in the PDF header
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    totalAmount: data.totalAmount,
    openAmount: data.openAmount,
    companyName: data.landlordName,
    iban: data.bankIban,
    bic: data.bankBic,
    bankName: data.bankName,
    paymentLink: data.paymentLink,
  })

  // Remove the salutation line and company signature from the text (we render those separately)
  const lines = dunningBody.split('\n')
  // Skip first line (empty salutation) and last 2 lines (company name)
  const bodyLines = lines.slice(1, -2).join('\n').trim()

  // Split into paragraphs
  const paragraphs = bodyLines.split('\n\n').map((p) => p.trim()).filter(Boolean)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo */}
        {data.logoUrl ? (
          <View style={styles.logoContainer}>
            <Image src={data.logoUrl} style={styles.logo} />
          </View>
        ) : null}

        {/* Header: Guest address + meta */}
        <View style={styles.headerRow}>
          <View style={styles.guestAddress}>
            <Text style={styles.senderLine}>{senderLine}</Text>
            <Text style={styles.guestName}>{data.guestName}</Text>
            {data.guestStreet ? <Text>{data.guestStreet}</Text> : null}
            {data.guestZipCity ? <Text>{data.guestZipCity}</Text> : null}
            {data.guestCountry ? <Text>{data.guestCountry}</Text> : null}
          </View>
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Datum:</Text>
              <Text style={styles.metaValue}>{data.documentDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rechnungsnr.:</Text>
              <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rechnungsdatum:</Text>
              <Text style={styles.metaValue}>{data.invoiceDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Fällig am:</Text>
              <Text style={styles.metaValue}>{data.dueDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Offener Betrag:</Text>
              <Text style={styles.metaValue}>{data.openAmount}</Text>
            </View>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{label}</Text>

        {/* Salutation */}
        <Text style={styles.bodyText}>Sehr geehrte(r) {data.guestName},</Text>

        {/* Body paragraphs */}
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.bodyText}>{p}</Text>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerCol}>
            <Text>{data.landlordName}</Text>
            <Text>{data.landlordStreet}</Text>
            <Text>{data.landlordZipCity}</Text>
            {data.landlordCountry ? <Text>{data.landlordCountry}</Text> : null}
          </View>
          <View style={styles.footerCol}>
            {data.companyRegister ? <Text>Handelsregistereintrag: {data.companyRegister}</Text> : null}
            {data.managingDirector ? <Text>Geschäftsführer: {data.managingDirector}</Text> : null}
            {data.taxNumber ? <Text>St.Nr.: {data.taxNumber}</Text> : null}
            {data.vatId ? <Text>USt.-ID.: {data.vatId}</Text> : null}
          </View>
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

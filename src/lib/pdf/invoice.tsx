import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 24,
  },
  landlordInfo: {
    fontSize: 8,
    color: '#666',
    marginBottom: 12,
  },
  addressBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  guestAddress: {
    width: '50%',
  },
  invoiceMeta: {
    width: '40%',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 3,
  },
  metaLabel: {
    width: 120,
    textAlign: 'right',
    color: '#555',
    marginRight: 8,
  },
  metaValue: {
    width: 100,
    fontFamily: 'Helvetica-Bold',
  },
  table: {
    marginTop: 8,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 4,
    marginBottom: 6,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  colDescription: { width: '40%' },
  colQty: { width: '10%', textAlign: 'center' },
  colUnit: { width: '15%', textAlign: 'right' },
  colVat: { width: '10%', textAlign: 'center' },
  colVatAmount: { width: '10%', textAlign: 'right' },
  colTotal: { width: '15%', textAlign: 'right' },
  totalsSection: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 3,
  },
  totalLabel: {
    width: 160,
    textAlign: 'right',
    marginRight: 8,
    color: '#555',
  },
  totalValue: {
    width: 100,
    textAlign: 'right',
  },
  totalBold: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
  separator: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginVertical: 4,
    width: 268,
    alignSelf: 'flex-end',
  },
  paymentInfo: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
  },
  paymentTitle: {
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 8,
    fontSize: 7,
    color: '#888',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kleinunternehmerNote: {
    marginTop: 12,
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
  },
  serviceNote: {
    marginTop: 8,
    fontSize: 9,
    color: '#555',
  },
})

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
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
  // Landlord
  landlordName: string
  landlordAddress: string
  taxNumber?: string
  vatId?: string
  phone?: string
  email?: string
  website?: string
  // Guest
  guestName: string
  guestAddress: string
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
  // Payment
  bankIban?: string
  bankBic?: string
  bankName?: string
  paymentDays: number
  // Options
  isKleinunternehmer: boolean
}

export function InvoicePDF({ data }: { data: InvoicePDFData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Landlord header line */}
        <Text style={styles.landlordInfo}>
          {data.landlordName} · {data.landlordAddress}
          {data.phone ? ` · Tel: ${data.phone}` : ''}
          {data.email ? ` · ${data.email}` : ''}
        </Text>

        {/* Address block */}
        <View style={styles.addressBlock}>
          <View style={styles.guestAddress}>
            <Text style={{ fontSize: 8, color: '#888', marginBottom: 4, textDecoration: 'underline' }}>
              {data.landlordName} · {data.landlordAddress}
            </Text>
            <Text style={{ fontSize: 11 }}>{data.guestName}</Text>
            <Text>{data.guestAddress}</Text>
          </View>
          <View style={styles.invoiceMeta}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rechnungsnummer:</Text>
              <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rechnungsdatum:</Text>
              <Text style={styles.metaValue}>{data.issuedDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Leistungszeitraum:</Text>
              <Text style={styles.metaValue}>{data.servicePeriod}</Text>
            </View>
            {data.taxNumber && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Steuernummer:</Text>
                <Text style={styles.metaValue}>{data.taxNumber}</Text>
              </View>
            )}
            {data.vatId && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>USt-IdNr.:</Text>
                <Text style={styles.metaValue}>{data.vatId}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Rechnung {data.invoiceNumber}</Text>

        <Text style={styles.serviceNote}>
          Sehr geehrte(r) {data.guestName}, für Ihren Aufenthalt im Zeitraum {data.servicePeriod} berechnen wir wie folgt:
        </Text>

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Beschreibung</Text>
            <Text style={styles.colQty}>Menge</Text>
            <Text style={styles.colUnit}>Einzelpreis</Text>
            <Text style={styles.colVat}>USt</Text>
            <Text style={styles.colVatAmount}>USt-Betrag</Text>
            <Text style={styles.colTotal}>Gesamt</Text>
          </View>
          {data.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnit}>{formatEur(item.unitPrice)}</Text>
              <Text style={styles.colVat}>{data.isKleinunternehmer ? '–' : `${item.vatRate}%`}</Text>
              <Text style={styles.colVatAmount}>
                {data.isKleinunternehmer ? '–' : formatEur(item.vatAmount)}
              </Text>
              <Text style={styles.colTotal}>{formatEur(item.total)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Nettobetrag:</Text>
            <Text style={styles.totalValue}>{formatEur(data.subtotalNet)}</Text>
          </View>
          {!data.isKleinunternehmer && (
            <>
              {data.vat7Amount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>USt 7% (auf {formatEur(data.vat7Net)}):</Text>
                  <Text style={styles.totalValue}>{formatEur(data.vat7Amount)}</Text>
                </View>
              )}
              {data.vat19Amount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>USt 19% (auf {formatEur(data.vat19Net)}):</Text>
                  <Text style={styles.totalValue}>{formatEur(data.vat19Amount)}</Text>
                </View>
              )}
            </>
          )}
          <View style={styles.separator} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, styles.totalBold]}>Gesamtbetrag:</Text>
            <Text style={[styles.totalValue, styles.totalBold]}>
              {formatEur(data.totalGross)}
            </Text>
          </View>
        </View>

        {data.isKleinunternehmer && (
          <Text style={styles.kleinunternehmerNote}>
            Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
          </Text>
        )}

        {/* Payment info */}
        {data.bankIban && (
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentTitle}>Zahlungsinformationen</Text>
            <Text>Bitte überweisen Sie den Betrag innerhalb von {data.paymentDays} Tagen auf folgendes Konto:</Text>
            <Text style={{ marginTop: 4 }}>
              IBAN: {data.bankIban}
              {data.bankBic ? `  ·  BIC: ${data.bankBic}` : ''}
              {data.bankName ? `  ·  ${data.bankName}` : ''}
            </Text>
            <Text style={{ marginTop: 4 }}>
              Fällig bis: {data.dueDate}
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>{data.landlordName}</Text>
          <Text>{data.landlordAddress}</Text>
          {data.taxNumber && <Text>St.Nr.: {data.taxNumber}</Text>}
          {data.bankIban && <Text>IBAN: {data.bankIban}</Text>}
        </View>
      </Page>
    </Document>
  )
}

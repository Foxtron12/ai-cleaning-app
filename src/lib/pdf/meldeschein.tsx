import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
    marginBottom: 16,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: '40%',
    color: '#555',
  },
  value: {
    width: '60%',
    fontFamily: 'Helvetica-Bold',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 20,
  },
  col: {
    flex: 1,
  },
  signatureArea: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 4,
    marginTop: 10,
    textAlign: 'center',
    fontSize: 9,
    color: '#555',
  },
  signatureImage: {
    width: 200,
    height: 75,
    marginBottom: 4,
  },
  signedLabel: {
    fontSize: 8,
    color: '#16a34a',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#888',
    textAlign: 'center',
  },
  legalNote: {
    marginTop: 16,
    fontSize: 8,
    color: '#888',
    lineHeight: 1.4,
  },
})

export interface MeldescheinData {
  // Property
  propertyName: string
  propertyAddress: string
  // Guest
  firstname: string
  lastname: string
  birthdate?: string
  nationality?: string
  street?: string
  city?: string
  zip?: string
  country?: string
  // Stay
  checkIn: string
  checkOut: string
  adults: number
  children: number
  tripPurpose: string
  // Co-travellers
  coTravellers?: Array<{
    firstname: string
    lastname: string
    birthdate?: string
    nationality?: string
  }>
  // Landlord
  landlordName?: string
  landlordAddress?: string
  // Signature
  signature?: string
}

export function MeldescheinPDF({ data }: { data: MeldescheinData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Meldeschein</Text>
          <Text style={styles.subtitle}>
            gemäß § 29 BMG / Beherbergungsstatistikgesetz
          </Text>
        </View>

        {/* Beherbergungsstätte */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beherbergungsstätte</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{data.propertyName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Adresse:</Text>
            <Text style={styles.value}>{data.propertyAddress}</Text>
          </View>
          {data.landlordName && (
            <View style={styles.row}>
              <Text style={styles.label}>Vermieter:</Text>
              <Text style={styles.value}>{data.landlordName}</Text>
            </View>
          )}
        </View>

        {/* Aufenthalt */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aufenthaltsdaten</Text>
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <View style={styles.row}>
                <Text style={styles.label}>Ankunft:</Text>
                <Text style={styles.value}>{data.checkIn}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Abreise:</Text>
                <Text style={styles.value}>{data.checkOut}</Text>
              </View>
            </View>
            <View style={styles.col}>
              <View style={styles.row}>
                <Text style={styles.label}>Erwachsene:</Text>
                <Text style={styles.value}>{data.adults}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Kinder:</Text>
                <Text style={styles.value}>{data.children}</Text>
              </View>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Reisezweck:</Text>
            <Text style={styles.value}>
              {data.tripPurpose === 'business'
                ? 'Geschäftlich'
                : data.tripPurpose === 'leisure'
                ? 'Privat'
                : '–'}
            </Text>
          </View>
        </View>

        {/* Hauptgast */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hauptgast (meldepflichtige Person)</Text>
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <View style={styles.row}>
                <Text style={styles.label}>Familienname:</Text>
                <Text style={styles.value}>{data.lastname || '_______________'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Vorname:</Text>
                <Text style={styles.value}>{data.firstname || '_______________'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Geburtsdatum:</Text>
                <Text style={styles.value}>{data.birthdate || '_______________'}</Text>
              </View>
            </View>
            <View style={styles.col}>
              <View style={styles.row}>
                <Text style={styles.label}>Staatsangehörigkeit:</Text>
                <Text style={styles.value}>{data.nationality || '_______________'}</Text>
              </View>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Wohnanschrift:</Text>
            <Text style={styles.value}>
              {[data.street, [data.zip, data.city].filter(Boolean).join(' '), data.country]
                .filter(Boolean)
                .join(', ') || '_______________________________________________'}
            </Text>
          </View>
        </View>

        {/* Mitreisende */}
        {data.coTravellers && data.coTravellers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mitreisende</Text>
            {data.coTravellers.map((ct, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.label}>{i + 1}.</Text>
                <Text style={styles.value}>
                  {ct.firstname} {ct.lastname}
                  {ct.birthdate ? `, geb. ${ct.birthdate}` : ''}
                  {ct.nationality ? `, ${ct.nationality}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Unterschrift */}
        <View style={styles.signatureArea}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Ort, Datum</Text>
          </View>
          <View style={styles.signatureBlock}>
            {data.signature ? (
              <>
                <Image src={data.signature} style={styles.signatureImage} />
                <Text style={styles.signatureLine}>Elektronische Unterschrift des Gastes</Text>
                <Text style={styles.signedLabel}>
                  Elektronisch signiert am {new Date().toLocaleDateString('de-DE')}
                </Text>
              </>
            ) : (
              <Text style={styles.signatureLine}>Unterschrift des Gastes</Text>
            )}
          </View>
        </View>

        {/* Rechtshinweis */}
        <View style={styles.legalNote}>
          <Text>
            Dieser Meldeschein ist gemäß § 29 Abs. 2 BMG vom Gast bei der Ankunft
            auszufüllen und zu unterschreiben. Die Aufbewahrungsfrist beträgt ein
            Jahr nach Abreise des Gastes.
          </Text>
        </View>

        <Text style={styles.footer}>
          Erstellt am {new Date().toLocaleDateString('de-DE')}
        </Text>
      </Page>
    </Document>
  )
}

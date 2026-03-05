import type {
  SmoobuApartment,
  SmoobuReservation,
  SmoobuReservationsResponse,
  BookingChannel,
  BookingInsert,
  PropertyInsert,
} from './types'

const SMOOBU_BASE_URL = 'https://login.smoobu.com/api'
const MAX_REQUESTS_PER_MINUTE = 50
const RETRY_DELAY_MS = 2000

interface SmoobuClientOptions {
  apiKey: string
}

export class SmoobuClient {
  private apiKey: string
  private requestCount = 0
  private resetTime = Date.now() + 60000

  constructor(options: SmoobuClientOptions) {
    this.apiKey = options.apiKey
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    // Simple rate limiting
    if (Date.now() > this.resetTime) {
      this.requestCount = 0
      this.resetTime = Date.now() + 60000
    }
    if (this.requestCount >= MAX_REQUESTS_PER_MINUTE) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      this.requestCount = 0
    }
    this.requestCount++

    const response = await fetch(`${SMOOBU_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })

    if (response.status === 429) {
      // Rate limited – wait and retry once
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      return this.fetch<T>(path, init)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Smoobu API error ${response.status}: ${text}`)
    }

    return response.json() as Promise<T>
  }

  /** Test API connection – returns apartment count */
  async testConnection(): Promise<{ success: boolean; apartmentCount: number }> {
    try {
      const apartments = await this.getApartments()
      return { success: true, apartmentCount: apartments.length }
    } catch {
      return { success: false, apartmentCount: 0 }
    }
  }

  /** Fetch all apartments/properties with full details (incl. location) */
  async getApartments(): Promise<SmoobuApartment[]> {
    // List endpoint only returns { id, name } – no location data
    const data = await this.fetch<{ apartments: Array<{ id: number; name: string }> }>('/apartments')
    const list = data.apartments ?? []

    // Fetch each apartment individually for full details (location, timezone, etc.)
    const detailed = await Promise.all(
      list.map(async (apt) => {
        try {
          return await this.fetch<SmoobuApartment>(`/apartments/${apt.id}`)
        } catch {
          // Fallback to list data if detail fetch fails
          return { id: apt.id, name: apt.name } as SmoobuApartment
        }
      })
    )
    return detailed
  }

  /** Fetch reservations with date range */
  async getReservations(params: {
    from?: string
    to?: string
    apartmentId?: number
    page?: number
    pageSize?: number
    modifiedFrom?: string
  }): Promise<SmoobuReservationsResponse> {
    const searchParams = new URLSearchParams()
    if (params.from) searchParams.set('from', params.from)
    if (params.to) searchParams.set('to', params.to)
    if (params.apartmentId) searchParams.set('apartment_id', String(params.apartmentId))
    if (params.page) searchParams.set('page', String(params.page))
    if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))
    if (params.modifiedFrom) searchParams.set('modifiedFrom', params.modifiedFrom)

    return this.fetch<SmoobuReservationsResponse>(`/reservations?${searchParams}`)
  }

  /** Check rates & availability for a property + date range */
  async getRates(params: {
    apartmentId: number
    arrivalDate: string
    departureDate: string
    adults?: number
    children?: number
    promoCode?: string
  }): Promise<{
    available: boolean
    price: number | null
    priceDetails: string | null
    cleaningFee: number | null
    currency: string
  }> {
    // Smoobu rates endpoint uses apartments[] array notation
    const searchParams = new URLSearchParams()
    searchParams.set('apartments[]', String(params.apartmentId))
    searchParams.set('start_date', params.arrivalDate)
    searchParams.set('end_date', params.departureDate)

    // Response is wrapped: { "data": { "<apartmentId>": { "<date>": { available, price, ... } } } }
    const response = await this.fetch<{ data: Record<string, Record<string, unknown>> }>(
      `/rates?${searchParams}`
    )

    const apartmentData = response.data?.[String(params.apartmentId)]

    if (!apartmentData) {
      return { available: false, price: null, priceDetails: null, cleaningFee: null, currency: 'EUR' }
    }

    // Filter to date-keyed entries only, excluding the departure date (not a chargeable night)
    const dateEntries = Object.entries(apartmentData).filter(([key]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(key) && key < params.departureDate
    )

    if (dateEntries.length === 0) {
      return { available: false, price: null, priceDetails: null, cleaningFee: null, currency: 'EUR' }
    }

    // available is 0 or 1 (integer), not boolean
    const allAvailable = dateEntries.every(
      ([, val]) => (val as Record<string, unknown>)?.available === 1
    )

    if (!allAvailable) {
      return { available: false, price: null, priceDetails: null, cleaningFee: null, currency: 'EUR' }
    }

    // Sum up nightly prices
    const totalPrice = dateEntries.reduce((sum, [, val]) => {
      const price = (val as Record<string, unknown>)?.price
      return sum + (typeof price === 'number' ? price : 0)
    }, 0)

    return {
      available: true,
      price: totalPrice,
      priceDetails: null,
      cleaningFee: null,
      currency: 'EUR',
    }
  }

  /** Create a reservation in Smoobu */
  async createReservation(params: {
    apartmentId: number
    arrivalDate: string
    departureDate: string
    firstName: string
    lastName: string
    email: string
    phone?: string
    adults?: number
    children?: number
    price: number
    cleaningFee?: number
    note?: string
  }): Promise<{ id: number }> {
    const body = {
      apartmentId: params.apartmentId,
      arrivalDate: params.arrivalDate,
      departureDate: params.departureDate,
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      phone: params.phone ?? '',
      adults: params.adults ?? 1,
      children: params.children ?? 0,
      price: params.price,
      notice: params.note ?? '',
    }

    const result = await this.fetch<{ id: number }>('/reservations', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    return result
  }

  /** Fetch ALL reservations (paginated) for a date range */
  async getAllReservations(from: string, to: string): Promise<SmoobuReservation[]> {
    const allBookings: SmoobuReservation[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const response = await this.getReservations({
        from,
        to,
        page,
        pageSize: 100,
      })

      allBookings.push(...response.bookings)
      hasMore = page < response.page_count
      page++
    }

    return allBookings
  }
}

/** Parsed line items from Smoobu's price-details string */
export interface ParsedPriceDetail {
  label: string
  amount: number
}

/**
 * Parse the Smoobu "price-details" free-text string into structured items.
 * Format: "Label - EUR 123.45\r\nLabel2 - EUR 67.89"
 */
export function parsePriceDetails(priceDetails: string | null | undefined): ParsedPriceDetail[] {
  if (!priceDetails) return []

  return priceDetails
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Match patterns like "Reinigungsgebühr - EUR 50" or "Cancellation Host Fee - EUR 22.13"
      const match = line.match(/^(.+?)\s*-\s*EUR\s*([\d.,]+)$/i)
      if (!match) return null
      const label = match[1].trim()
      const amount = parseFloat(match[2].replace(',', '.'))
      return isNaN(amount) ? null : { label, amount }
    })
    .filter((item): item is ParsedPriceDetail => item !== null)
}

/**
 * Extract cleaning fee from parsed price-details.
 * Looks for common labels: Reinigungsgebühr, Cleaning Fee, cleaning-fee
 */
export function extractCleaningFeeFromDetails(details: ParsedPriceDetail[]): number | null {
  const item = details.find((d) =>
    /reinigung|cleaning/i.test(d.label)
  )
  return item?.amount ?? null
}

/**
 * Extract city tax from parsed price-details.
 * Looks for: Übernachtungssteuer, City Tax, Kurtaxe, Beherbergungssteuer
 */
export function extractCityTaxFromDetails(details: ParsedPriceDetail[]): number | null {
  const item = details.find((d) =>
    /bernachtungssteuer|city.?tax|kurtaxe|beherbergungssteuer|tourist.?tax/i.test(d.label)
  )
  return item?.amount ?? null
}

/**
 * Extract "Payment charge is EUR X.XX" from Booking.com notes.
 * Returns the amount or 0 if not found.
 */
export function extractPaymentChargeFromNotes(notice: string | null | undefined): number {
  if (!notice) return 0
  const match = notice.match(/Payment charge is EUR\s*([\d.,]+)/i)
  if (!match) return 0
  const amount = parseFloat(match[1].replace(',', '.'))
  return isNaN(amount) ? 0 : amount
}

/** Map Smoobu channel name to our BookingChannel type */
function mapChannel(channelName: string): BookingChannel {
  const normalized = channelName.toLowerCase()
  if (normalized.includes('airbnb')) return 'Airbnb'
  if (normalized.includes('booking.com') || normalized.includes('booking')) return 'Booking.com'
  if (normalized.includes('vrbo') || normalized.includes('homeaway')) return 'VRBO'
  if (normalized.includes('expedia')) return 'Expedia'
  if (normalized.includes('google')) return 'Google'
  if (normalized.includes('direct') || normalized.includes('manual') || normalized.includes('homepage')) return 'Direct'
  return 'Other'
}

/** Map Smoobu apartment to our Property insert format */
export function mapSmoobuApartment(apartment: SmoobuApartment): PropertyInsert {
  return {
    external_id: apartment.id,
    name: apartment.name,
    street: apartment.location?.street ?? null,
    city: apartment.location?.city ?? null,
    zip: apartment.location?.zip ?? null,
    country: apartment.location?.country ?? 'DE',
    timezone: apartment.timeZone ?? apartment.timezone ?? 'Europe/Berlin',
    currency: apartment.currency ?? 'EUR',
    // Tax city from Smoobu location (resolved via city_tax_rules on sync)
    accommodation_tax_city: apartment.location?.city ?? null,
    accommodation_tax_model: null,
    accommodation_tax_rate: null,
    synced_at: new Date().toISOString(),
  }
}

/** Map Smoobu reservation to our Booking insert format */
export function mapSmoobuReservation(
  reservation: SmoobuReservation,
  propertyId: string
): BookingInsert {
  // Parse guest name from combined field or separate fields
  let firstname = reservation.firstname ?? ''
  let lastname = reservation.lastname ?? ''
  if (!firstname && !lastname && reservation['guest-name']) {
    const parts = reservation['guest-name'].split(' ')
    firstname = parts[0] ?? ''
    lastname = parts.slice(1).join(' ') ?? ''
  }

  // Calculate commission: prefer commission-included, fall back to commission, then calculate
  let commissionAmount = reservation['commission-included'] ?? reservation.commission ?? null
  if (commissionAmount === null && reservation.price && reservation['host-payout']) {
    commissionAmount = reservation.price - reservation['host-payout']
  }

  // Booking.com: add "Payment charge" from notes to commission
  const channel = mapChannel(reservation.channel?.name ?? 'Direct')
  if (channel === 'Booking.com') {
    const paymentCharge = extractPaymentChargeFromNotes(reservation.notice)
    if (paymentCharge > 0) {
      commissionAmount = (commissionAmount ?? 0) + paymentCharge
    }
  }

  // Parse price-details to extract cleaning fee if the API field is missing
  const priceDetailsRaw = reservation['price-details'] ?? null
  const parsedDetails = parsePriceDetails(priceDetailsRaw)
  const apiCleaningFee = reservation['cleaning-fee'] ?? 0
  const parsedCleaningFee = extractCleaningFeeFromDetails(parsedDetails)
  const cleaningFee = apiCleaningFee > 0 ? apiCleaningFee : (parsedCleaningFee ?? 0)

  return {
    external_id: reservation.id,
    property_id: propertyId,
    guest_firstname: firstname || null,
    guest_lastname: lastname || null,
    guest_email: reservation.email ?? null,
    guest_phone: reservation.phone ?? null,
    guest_street: reservation.address?.street ?? null,
    guest_city: reservation.address?.city ?? null,
    guest_zip: reservation.address?.postalCode ?? null,
    guest_country: reservation.address?.country ?? null,
    guest_nationality: reservation.nationality ?? null,
    guest_language: reservation.language ?? null,
    check_in: reservation.arrival,
    check_out: reservation.departure,
    adults: reservation.adults ?? 1,
    children: reservation.children ?? 0,
    channel,
    channel_id: reservation.channel?.id ?? null,
    amount_gross: reservation.price ?? null,
    amount_host_payout: reservation['host-payout'] ?? null,
    commission_amount: commissionAmount,
    cleaning_fee: cleaningFee,
    extra_fees: reservation['extra-fees'] ?? 0,
    security_deposit: reservation.deposit ?? 0,
    currency: reservation.currency ?? 'EUR',
    prepayment: reservation.prepayment ?? 0,
    balance: reservation.balance ?? 0,
    price_details: priceDetailsRaw,
    status: 'upcoming', // Will be recalculated
    trip_purpose: 'unknown',
    guest_note: reservation.notice ?? null,
    synced_at: new Date().toISOString(),
  }
}

/** Calculate booking status based on dates */
export function calculateBookingStatus(
  checkIn: string,
  checkOut: string,
  cancelled?: boolean
): 'upcoming' | 'active' | 'completed' | 'cancelled' {
  if (cancelled) return 'cancelled'
  const today = new Date().toISOString().split('T')[0]
  if (checkOut <= today) return 'completed'
  if (checkIn <= today && checkOut > today) return 'active'
  return 'upcoming'
}

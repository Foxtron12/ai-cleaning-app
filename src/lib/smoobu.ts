import type {
  SmoobuApartment,
  SmoobuReservation,
  SmoobuReservationsResponse,
  SmoobuGuest,
  SmoobuThread,
  SmoobuMessage,
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
    street?: string
    city?: string
    postalCode?: string
    country?: string
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
      country: params.country ?? '',
      address: {
        street: params.street ?? '',
        location: params.city ?? '',
        postalCode: params.postalCode ?? '',
        country: params.country ?? '',
      },
    }

    const result = await this.fetch<{ id: number }>('/reservations', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    return result
  }

  /** Fetch a single reservation with full guest details (address, email, phone, nationality) */
  async getReservation(id: number): Promise<SmoobuReservation> {
    return this.fetch<SmoobuReservation>(`/reservations/${id}`)
  }

  /** Update guest data on an existing reservation in Smoobu */
  async updateReservation(id: number, params: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    street?: string
    city?: string
    postalCode?: string
    country?: string
  }): Promise<void> {
    const body: Record<string, unknown> = {}
    if (params.firstName !== undefined) body.firstName = params.firstName
    if (params.lastName !== undefined) body.lastName = params.lastName
    if (params.email !== undefined) body.email = params.email
    if (params.phone !== undefined) body.phone = params.phone
    if (params.street || params.city || params.postalCode || params.country) {
      body.address = {
        street: params.street ?? '',
        location: params.city ?? '',
        postalCode: params.postalCode ?? '',
        country: params.country ?? '',
      }
    }
    await this.fetch<unknown>(`/reservations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }

  /** Cancel a reservation in Smoobu */
  async cancelReservation(id: number): Promise<void> {
    await this.fetch<unknown>(`/reservations/${id}`, { method: 'DELETE' })
  }

  /** Fetch message threads from Smoobu.
   *  Smoobu doesn't have a dedicated threads endpoint, so we build threads
   *  from recent reservations and their message counts.
   */
  async getThreads(params?: {
    page?: number
    apartmentIds?: number[]
  }): Promise<{ threads: SmoobuThread[]; page: number; page_count: number }> {
    // Get recent reservations (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const from = sixMonthsAgo.toISOString().split('T')[0]
    const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const reservations = await this.getReservations({
      from,
      to,
      apartmentId: params?.apartmentIds?.[0],
      page: params?.page ?? 1,
      pageSize: 50,
    })

    // Filter out blocked bookings
    const validBookings = reservations.bookings.filter(
      (b) => !b['is-blocked-booking']
    )

    // For each reservation, try to get messages to build thread preview
    const threads: SmoobuThread[] = await Promise.all(
      validBookings.map(async (booking) => {
        let lastMessage: SmoobuThread['last_message'] = null
        let unreadCount = 0

        try {
          const messages = await this.getMessages(booking.id, 1)
          if (messages.length > 0) {
            const latest = messages[0]
            lastMessage = {
              subject: latest.subject,
              body: latest.body,
              sent_at: latest.sent_at,
              type: latest.type,
            }
          }
        } catch {
          // Messages endpoint may not be available for all reservations
        }

        const guestName = [booking.firstname, booking.lastname]
          .filter(Boolean)
          .join(' ') || booking['guest-name'] || 'Unbekannter Gast'

        return {
          booking_id: booking.id,
          guest_name: guestName,
          apartment: {
            id: booking.apartment.id,
            name: booking.apartment.name,
          },
          channel: booking.channel?.name ?? 'Direct',
          last_message: lastMessage,
          unread_count: unreadCount,
          arrival: booking.arrival,
          departure: booking.departure,
        }
      })
    )

    // Sort by last message date (newest first), bookings without messages last
    threads.sort((a, b) => {
      if (a.last_message && b.last_message) {
        return new Date(b.last_message.sent_at).getTime() - new Date(a.last_message.sent_at).getTime()
      }
      if (a.last_message) return -1
      if (b.last_message) return 1
      // Fall back to arrival date
      return new Date(b.arrival).getTime() - new Date(a.arrival).getTime()
    })

    return {
      threads,
      page: params?.page ?? 1,
      page_count: reservations.page_count,
    }
  }

  /** Fetch messages for a specific reservation from Smoobu */
  async getMessages(reservationId: number, page?: number): Promise<SmoobuMessage[]> {
    const searchParams = new URLSearchParams()
    if (page) searchParams.set('page', String(page))

    const response = await this.fetch<{
      messages?: Array<{
        id?: number
        subject?: string
        message_body?: string
        body?: string
        sent_at?: string
        created_at?: string
        date?: string
        type?: string
        sender?: string
        direction?: string
      }>
    }>(`/reservations/${reservationId}/messages${searchParams.toString() ? `?${searchParams}` : ''}`)

    const messages = response.messages ?? []

    return messages.map((msg, index) => {
      // Determine if message is from guest or host
      const isHost = msg.type === 'host' ||
        msg.sender === 'host' ||
        msg.direction === 'outgoing'

      return {
        id: msg.id ?? index,
        subject: msg.subject ?? '',
        body: msg.message_body ?? msg.body ?? '',
        sent_at: msg.sent_at ?? msg.created_at ?? msg.date ?? new Date().toISOString(),
        type: (isHost ? 'host' : 'guest') as 'guest' | 'host',
      }
    })
  }

  /** Send a message to a guest via the OTA channel (Airbnb thread, Booking.com, email for direct) */
  async sendMessage(reservationId: number, subject: string, messageBody: string): Promise<void> {
    await this.fetch<unknown>(`/reservations/${reservationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ subject, messageBody }),
    })
  }

  /** Fetch a single guest's details (address, emails, phone numbers) */
  async getGuest(guestId: number): Promise<SmoobuGuest> {
    return this.fetch<SmoobuGuest>(`/guests/${guestId}`)
  }

  /** Fetch ALL reservations (paginated) for a date range, then enrich with guest details */
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

    // The list/detail reservation endpoints don't return guest address data.
    // Fetch guest details via /guests/{guestId} to get address, emails, phone.
    // Collect unique guestIds first, then batch-fetch to avoid duplicate calls.
    const guestCache = new Map<number, SmoobuGuest>()
    const uniqueGuestIds = [...new Set(
      allBookings.map((b) => b.guestId).filter((id): id is number => id != null && id > 0)
    )]

    const BATCH_SIZE = 10
    for (let i = 0; i < uniqueGuestIds.length; i += BATCH_SIZE) {
      const batch = uniqueGuestIds.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (guestId) => {
          try {
            const guest = await this.getGuest(guestId)
            return { guestId, guest }
          } catch {
            return { guestId, guest: null }
          }
        })
      )
      for (const { guestId, guest } of results) {
        if (guest) guestCache.set(guestId, guest)
      }
    }

    // Enrich bookings with guest address data
    return allBookings.map((booking) => {
      const guest = booking.guestId ? guestCache.get(booking.guestId) : null
      if (!guest) return booking

      return {
        ...booking,
        // Map guest API fields onto reservation fields used by mapSmoobuReservation
        address: guest.address ?? booking.address,
        email: guest.emails?.[0] ?? booking.email,
        phone: guest.telephoneNumbers?.[0] ?? booking.phone,
        firstname: guest.firstName ?? booking.firstname,
        lastname: guest.lastName ?? booking.lastname,
      }
    })
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
  // "Direct booking" must be checked BEFORE "booking" to avoid false match
  if (normalized.includes('direct') || normalized.includes('manual') || normalized.includes('homepage') || normalized.includes('website')) return 'Direct'
  if (normalized.includes('booking.com') || normalized.includes('booking')) return 'Booking.com'
  if (normalized.includes('vrbo') || normalized.includes('homeaway')) return 'VRBO'
  if (normalized.includes('expedia')) return 'Expedia'
  if (normalized.includes('google')) return 'Google'
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

  // OTA channels (Airbnb, Booking.com) handle payment on-platform → mark as paid
  const isPlatformPaid = channel === 'Airbnb' || channel === 'Booking.com'

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
    payment_status: isPlatformPaid ? 'paid' : null,
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

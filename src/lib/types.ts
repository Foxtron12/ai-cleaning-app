import type { Database } from './database.types'

// Table row types (from Supabase)
export type Property = Database['public']['Tables']['properties']['Row']
export type PropertyInsert = Database['public']['Tables']['properties']['Insert']
export type Booking = Database['public']['Tables']['bookings']['Row']
export type BookingInsert = Database['public']['Tables']['bookings']['Insert']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
export type RegistrationForm = Database['public']['Tables']['registration_forms']['Row']
export type RegistrationFormInsert = Database['public']['Tables']['registration_forms']['Insert']
export type Settings = Database['public']['Tables']['settings']['Row']
export type SettingsUpdate = Database['public']['Tables']['settings']['Update']
export type CityTaxRule = Database['public']['Tables']['city_tax_rules']['Row']
export type CityTaxRuleInsert = Database['public']['Tables']['city_tax_rules']['Insert']
export type Integration = Database['public']['Tables']['integrations']['Row']
export type IntegrationInsert = Database['public']['Tables']['integrations']['Insert']

// Integration provider type
export type IntegrationProvider = 'smoobu' | 'apaleo' | 'mews' | 'stripe'

// Integration status type
export type IntegrationStatus = 'connected' | 'error' | 'unconfigured'

// Booking with joined property
export type BookingWithProperty = Booking & {
  properties: Property | null
}

// Channel type
export type BookingChannel = 'Airbnb' | 'Booking.com' | 'VRBO' | 'Expedia' | 'Direct' | 'Google' | 'Other'

// Booking status
export type BookingStatus = 'upcoming' | 'active' | 'completed' | 'cancelled'

// Trip purpose
export type TripPurpose = 'leisure' | 'business' | 'unknown'

// Invoice status
export type InvoiceStatus = 'draft' | 'created' | 'paid' | 'cancelled'

// Registration form status (aligned with tech design: only created / archived)
export type RegistrationFormStatus = 'created' | 'archived'

// Accommodation tax model
export type AccommodationTaxModel = 'net_percentage' | 'gross_percentage' | 'per_person_per_night' | 'per_room_per_night'

// Invoice line item (stored as JSONB)
export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number // 0, 7, or 19
  vat_amount: number
  total: number
}

// Landlord snapshot (stored as JSONB in invoices)
export interface LandlordSnapshot {
  name: string
  street: string
  city: string
  zip: string
  country: string
  phone?: string
  email?: string
  website?: string
  tax_number?: string
  vat_id?: string
  bank_iban?: string
  bank_bic?: string
  bank_name?: string
  company_register?: string
  managing_director?: string
  invoice_thank_you_text?: string
  logo_url?: string
}

// Guest snapshot (stored as JSONB in invoices)
export interface GuestSnapshot {
  firstname: string
  lastname: string
  street?: string
  city?: string
  zip?: string
  country?: string
}

// Co-traveller (stored as JSONB in registration_forms)
export interface CoTraveller {
  firstname: string
  lastname: string
  birthdate?: string
  nationality?: string
}

// Smoobu API response types
export interface SmoobuApartment {
  id: number
  name: string
  location?: {
    street?: string
    city?: string
    zip?: string
    country?: string
  }
  timezone?: string
  timeZone?: string // Smoobu API uses camelCase
  currency?: string
}

export interface SmoobuReservation {
  id: number
  'reference-id'?: string | null
  type?: string
  apartment: {
    id: number
    name: string
  }
  channel: {
    id: number
    channel_id?: number
    name: string
  }
  arrival: string
  departure: string
  'guest-name'?: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string | null
  adults?: number
  children?: number
  'check-in'?: string
  'check-out'?: string
  price?: number
  'price-details'?: string
  'city-tax'?: number | null
  'price-paid'?: string
  'commission-included'?: number
  'host-payout'?: number
  commission?: number
  'cleaning-fee'?: number
  'extra-fees'?: number
  deposit?: number | null
  'deposit-paid'?: string
  currency?: string
  prepayment?: number | null
  'prepayment-paid'?: string
  balance?: number
  notice?: string
  'assistant-notice'?: string
  'guest-app-url'?: string
  language?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    country?: string
  }
  nationality?: string
  status?: string
  'is-blocked-booking'?: boolean
  guestId?: number
  'created-at'?: string
  modifiedAt?: string
}

export interface SmoobuReservationsResponse {
  page_count: number
  page_size: number
  page: number
  bookings: SmoobuReservation[]
}

export interface SmoobuApartmentsResponse {
  apartments: Record<string, SmoobuApartment>
}

export interface SmoobuGuest {
  id: number
  firstName?: string
  lastName?: string
  companyName?: string
  emails?: string[]
  telephoneNumbers?: string[]
  address?: {
    street?: string
    postalCode?: string
    city?: string
    country?: string
  }
  notes?: string
}

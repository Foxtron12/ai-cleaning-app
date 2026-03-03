export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          adults: number | null
          amount_gross: number | null
          amount_host_payout: number | null
          balance: number | null
          channel: string
          channel_id: number | null
          check_in: string
          check_out: string
          children: number | null
          cleaning_fee: number | null
          commission_amount: number | null
          created_at: string | null
          currency: string | null
          external_id: number | null
          extra_fees: number | null
          guest_city: string | null
          guest_country: string | null
          guest_email: string | null
          guest_firstname: string | null
          guest_language: string | null
          guest_lastname: string | null
          guest_nationality: string | null
          guest_note: string | null
          guest_phone: string | null
          guest_street: string | null
          guest_zip: string | null
          host_note: string | null
          id: string
          nights: number | null
          prepayment: number | null
          price_details: string | null
          property_id: string | null
          security_deposit: number | null
          status: string
          synced_at: string | null
          trip_purpose: string | null
          updated_at: string | null
        }
        Insert: {
          adults?: number | null
          amount_gross?: number | null
          amount_host_payout?: number | null
          balance?: number | null
          channel?: string
          channel_id?: number | null
          check_in: string
          check_out: string
          children?: number | null
          cleaning_fee?: number | null
          commission_amount?: number | null
          created_at?: string | null
          currency?: string | null
          external_id?: number | null
          extra_fees?: number | null
          guest_city?: string | null
          guest_country?: string | null
          guest_email?: string | null
          guest_firstname?: string | null
          guest_language?: string | null
          guest_lastname?: string | null
          guest_nationality?: string | null
          guest_note?: string | null
          guest_phone?: string | null
          guest_street?: string | null
          guest_zip?: string | null
          host_note?: string | null
          id?: string
          nights?: number | null
          prepayment?: number | null
          price_details?: string | null
          property_id?: string | null
          security_deposit?: number | null
          status?: string
          synced_at?: string | null
          trip_purpose?: string | null
          updated_at?: string | null
        }
        Update: {
          adults?: number | null
          amount_gross?: number | null
          amount_host_payout?: number | null
          balance?: number | null
          channel?: string
          channel_id?: number | null
          check_in?: string
          check_out?: string
          children?: number | null
          cleaning_fee?: number | null
          commission_amount?: number | null
          created_at?: string | null
          currency?: string | null
          external_id?: number | null
          extra_fees?: number | null
          guest_city?: string | null
          guest_country?: string | null
          guest_email?: string | null
          guest_firstname?: string | null
          guest_language?: string | null
          guest_lastname?: string | null
          guest_nationality?: string | null
          guest_note?: string | null
          guest_phone?: string | null
          guest_street?: string | null
          guest_zip?: string | null
          host_note?: string | null
          id?: string
          nights?: number | null
          prepayment?: number | null
          price_details?: string | null
          property_id?: string | null
          security_deposit?: number | null
          status?: string
          synced_at?: string | null
          trip_purpose?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          booking_id: string | null
          cancelled_invoice_id: string | null
          created_at: string | null
          due_date: string | null
          guest_snapshot: Json
          id: string
          invoice_number: string
          is_kleinunternehmer: boolean | null
          issued_date: string | null
          landlord_snapshot: Json
          lexoffice_id: string | null
          line_items: Json
          paid_date: string | null
          payment_method: string | null
          payment_note: string | null
          property_id: string | null
          service_period_end: string | null
          service_period_start: string | null
          status: string
          subtotal_net: number
          total_gross: number
          total_vat: number
          updated_at: string | null
          vat_19_amount: number | null
          vat_19_net: number | null
          vat_7_amount: number | null
          vat_7_net: number | null
        }
        Insert: {
          booking_id?: string | null
          cancelled_invoice_id?: string | null
          created_at?: string | null
          due_date?: string | null
          guest_snapshot?: Json
          id?: string
          invoice_number: string
          is_kleinunternehmer?: boolean | null
          issued_date?: string | null
          landlord_snapshot?: Json
          lexoffice_id?: string | null
          line_items?: Json
          paid_date?: string | null
          payment_method?: string | null
          payment_note?: string | null
          property_id?: string | null
          service_period_end?: string | null
          service_period_start?: string | null
          status?: string
          subtotal_net?: number
          total_gross?: number
          total_vat?: number
          updated_at?: string | null
          vat_19_amount?: number | null
          vat_19_net?: number | null
          vat_7_amount?: number | null
          vat_7_net?: number | null
        }
        Update: {
          booking_id?: string | null
          cancelled_invoice_id?: string | null
          created_at?: string | null
          due_date?: string | null
          guest_snapshot?: Json
          id?: string
          invoice_number?: string
          is_kleinunternehmer?: boolean | null
          issued_date?: string | null
          landlord_snapshot?: Json
          lexoffice_id?: string | null
          line_items?: Json
          paid_date?: string | null
          payment_method?: string | null
          payment_note?: string | null
          property_id?: string | null
          service_period_end?: string | null
          service_period_start?: string | null
          status?: string
          subtotal_net?: number
          total_gross?: number
          total_vat?: number
          updated_at?: string | null
          vat_19_amount?: number | null
          vat_19_net?: number | null
          vat_7_amount?: number | null
          vat_7_net?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_cancelled_invoice_id_fkey"
            columns: ["cancelled_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          accommodation_tax_city: string | null
          accommodation_tax_model: string | null
          accommodation_tax_rate: number | null
          booking_com_commission_rate: number | null
          city: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          external_id: number
          id: string
          name: string
          street: string | null
          synced_at: string | null
          timezone: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          accommodation_tax_city?: string | null
          accommodation_tax_model?: string | null
          accommodation_tax_rate?: number | null
          booking_com_commission_rate?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          external_id: number
          id?: string
          name: string
          street?: string | null
          synced_at?: string | null
          timezone?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          accommodation_tax_city?: string | null
          accommodation_tax_model?: string | null
          accommodation_tax_rate?: number | null
          booking_com_commission_rate?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          external_id?: number
          id?: string
          name?: string
          street?: string | null
          synced_at?: string | null
          timezone?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      registration_forms: {
        Row: {
          adults: number | null
          booking_id: string | null
          check_in: string
          check_out: string
          children: number | null
          co_travellers: Json | null
          created_at: string | null
          guest_birthdate: string | null
          guest_city: string | null
          guest_country: string | null
          guest_firstname: string
          guest_lastname: string
          guest_nationality: string | null
          guest_street: string | null
          guest_zip: string | null
          id: string
          property_id: string | null
          property_snapshot: Json
          signature: string | null
          status: string
          trip_purpose: string | null
          updated_at: string | null
        }
        Insert: {
          adults?: number | null
          booking_id?: string | null
          check_in: string
          check_out: string
          children?: number | null
          co_travellers?: Json | null
          created_at?: string | null
          guest_birthdate?: string | null
          guest_city?: string | null
          guest_country?: string | null
          guest_firstname: string
          guest_lastname: string
          guest_nationality?: string | null
          guest_street?: string | null
          guest_zip?: string | null
          id?: string
          property_id?: string | null
          property_snapshot?: Json
          signature?: string | null
          status?: string
          trip_purpose?: string | null
          updated_at?: string | null
        }
        Update: {
          adults?: number | null
          booking_id?: string | null
          check_in?: string
          check_out?: string
          children?: number | null
          co_travellers?: Json | null
          created_at?: string | null
          guest_birthdate?: string | null
          guest_city?: string | null
          guest_country?: string | null
          guest_firstname?: string
          guest_lastname?: string
          guest_nationality?: string | null
          guest_street?: string | null
          guest_zip?: string | null
          id?: string
          property_id?: string | null
          property_snapshot?: Json
          signature?: string | null
          status?: string
          trip_purpose?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_forms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_forms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          bank_bic: string | null
          bank_iban: string | null
          bank_name: string | null
          created_at: string | null
          finanzamt: string | null
          id: string
          invoice_next_number: number | null
          invoice_payment_days: number | null
          invoice_prefix: string | null
          is_kleinunternehmer: boolean | null
          landlord_city: string | null
          landlord_country: string | null
          landlord_email: string | null
          landlord_logo_url: string | null
          landlord_name: string | null
          landlord_phone: string | null
          landlord_street: string | null
          landlord_website: string | null
          landlord_zip: string | null
          smoobu_api_key: string | null
          smoobu_last_sync: string | null
          tax_number: string | null
          updated_at: string | null
          vat_id: string | null
        }
        Insert: {
          bank_bic?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          created_at?: string | null
          finanzamt?: string | null
          id?: string
          invoice_next_number?: number | null
          invoice_payment_days?: number | null
          invoice_prefix?: string | null
          is_kleinunternehmer?: boolean | null
          landlord_city?: string | null
          landlord_country?: string | null
          landlord_email?: string | null
          landlord_logo_url?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          landlord_street?: string | null
          landlord_website?: string | null
          landlord_zip?: string | null
          smoobu_api_key?: string | null
          smoobu_last_sync?: string | null
          tax_number?: string | null
          updated_at?: string | null
          vat_id?: string | null
        }
        Update: {
          bank_bic?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          created_at?: string | null
          finanzamt?: string | null
          id?: string
          invoice_next_number?: number | null
          invoice_payment_days?: number | null
          invoice_prefix?: string | null
          is_kleinunternehmer?: boolean | null
          landlord_city?: string | null
          landlord_country?: string | null
          landlord_email?: string | null
          landlord_logo_url?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          landlord_street?: string | null
          landlord_website?: string | null
          landlord_zip?: string | null
          smoobu_api_key?: string | null
          smoobu_last_sync?: string | null
          tax_number?: string | null
          updated_at?: string | null
          vat_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

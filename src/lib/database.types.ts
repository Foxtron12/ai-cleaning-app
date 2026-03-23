export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          metadata: Json | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      booking_documents: {
        Row: {
          booking_id: string
          created_at: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          storage_path: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          storage_path: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          accommodation_tax_amount: number | null
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
          company_city: string | null
          company_country: string | null
          company_name: string | null
          company_street: string | null
          company_vat_id: string | null
          company_zip: string | null
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
          invoice_recipient: string | null
          nights: number | null
          payment_status: string | null
          prepayment: number | null
          price_details: string | null
          property_id: string | null
          security_deposit: number | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_link: string | null
          synced_at: string | null
          trip_purpose: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          accommodation_tax_amount?: number | null
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
          company_city?: string | null
          company_country?: string | null
          company_name?: string | null
          company_street?: string | null
          company_vat_id?: string | null
          company_zip?: string | null
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
          invoice_recipient?: string | null
          nights?: number | null
          payment_status?: string | null
          prepayment?: number | null
          price_details?: string | null
          property_id?: string | null
          security_deposit?: number | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_link?: string | null
          synced_at?: string | null
          trip_purpose?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          accommodation_tax_amount?: number | null
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
          company_city?: string | null
          company_country?: string | null
          company_name?: string | null
          company_street?: string | null
          company_vat_id?: string | null
          company_zip?: string | null
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
          invoice_recipient?: string | null
          nights?: number | null
          payment_status?: string | null
          prepayment?: number | null
          price_details?: string | null
          property_id?: string | null
          security_deposit?: number | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_link?: string | null
          synced_at?: string | null
          trip_purpose?: string | null
          updated_at?: string | null
          user_id?: string | null
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
      city_tax_rules: {
        Row: {
          city: string
          created_at: string | null
          description: string | null
          id: string
          person_limit: number | null
          tax_model: string
          tax_rate: number
          tax_treatment: string
          updated_at: string | null
          user_id: string | null
          vat_type: string
        }
        Insert: {
          city: string
          created_at?: string | null
          description?: string | null
          id?: string
          person_limit?: number | null
          tax_model?: string
          tax_rate?: number
          tax_treatment?: string
          updated_at?: string | null
          user_id?: string | null
          vat_type?: string
        }
        Update: {
          city?: string
          created_at?: string | null
          description?: string | null
          id?: string
          person_limit?: number | null
          tax_model?: string
          tax_rate?: number
          tax_treatment?: string
          updated_at?: string | null
          user_id?: string | null
          vat_type?: string
        }
        Relationships: []
      }
      guest_registration_tokens: {
        Row: {
          booking_id: string
          completed_at: string | null
          created_at: string | null
          expires_at: string
          id: string
          status: string
          token: string
          user_id: string
        }
        Insert: {
          booking_id: string
          completed_at?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          status?: string
          token?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          status?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_registration_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          id: string
          user_id: string
          name: string
          body: string
          language: string
          is_default: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          body: string
          language?: string
          is_default?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          body?: string
          language?: string
          is_default?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          api_key_encrypted: string | null
          created_at: string
          error_message: string | null
          id: string
          last_synced_at: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
          webhook_secret_encrypted: string | null
          webhook_token: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          status?: string
          updated_at?: string
          user_id: string
          webhook_secret_encrypted?: string | null
          webhook_token?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
          webhook_secret_encrypted?: string | null
          webhook_token?: string | null
        }
        Relationships: []
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
          invoice_type: string
          is_kleinunternehmer: boolean | null
          issued_date: string | null
          landlord_snapshot: Json
          lexoffice_id: string | null
          line_items: Json
          notes: string | null
          notes_footer: string | null
          paid_date: string | null
          payment_method: string | null
          payment_note: string | null
          payment_schedule: Json | null
          property_id: string | null
          service_period_end: string | null
          service_period_start: string | null
          status: string
          subtotal_net: number
          total_gross: number
          total_vat: number
          updated_at: string | null
          user_id: string | null
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
          invoice_type?: string
          is_kleinunternehmer?: boolean | null
          issued_date?: string | null
          landlord_snapshot?: Json
          lexoffice_id?: string | null
          line_items?: Json
          notes?: string | null
          notes_footer?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_note?: string | null
          payment_schedule?: Json | null
          property_id?: string | null
          service_period_end?: string | null
          service_period_start?: string | null
          status?: string
          subtotal_net?: number
          total_gross?: number
          total_vat?: number
          updated_at?: string | null
          user_id?: string | null
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
          invoice_type?: string
          is_kleinunternehmer?: boolean | null
          issued_date?: string | null
          landlord_snapshot?: Json
          lexoffice_id?: string | null
          line_items?: Json
          notes?: string | null
          notes_footer?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_note?: string | null
          payment_schedule?: Json | null
          property_id?: string | null
          service_period_end?: string | null
          service_period_start?: string | null
          status?: string
          subtotal_net?: number
          total_gross?: number
          total_vat?: number
          updated_at?: string | null
          user_id?: string | null
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
      profiles: {
        Row: {
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          display_name: string | null
          id: string
          is_paid: boolean
          logo_url: string | null
          street: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tax_id: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          is_paid?: boolean
          logo_url?: string | null
          street?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tax_id?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_paid?: boolean
          logo_url?: string | null
          street?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tax_id?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: []
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
          default_cleaning_fee: number | null
          external_id: number
          id: string
          name: string
          ota_remits_tax: string[] | null
          street: string | null
          synced_at: string | null
          tags: string[] | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
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
          default_cleaning_fee?: number | null
          external_id: number
          id?: string
          name: string
          ota_remits_tax?: string[] | null
          street?: string | null
          synced_at?: string | null
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
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
          default_cleaning_fee?: number | null
          external_id?: number
          id?: string
          name?: string
          ota_remits_tax?: string[] | null
          street?: string | null
          synced_at?: string | null
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
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
          guest_submitted: boolean | null
          guest_zip: string | null
          id: string
          property_id: string | null
          property_snapshot: Json
          signature: string | null
          status: string
          trip_purpose: string | null
          updated_at: string | null
          user_id: string | null
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
          guest_submitted?: boolean | null
          guest_zip?: string | null
          id?: string
          property_id?: string | null
          property_snapshot?: Json
          signature?: string | null
          status?: string
          trip_purpose?: string | null
          updated_at?: string | null
          user_id?: string | null
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
          guest_submitted?: boolean | null
          guest_zip?: string | null
          id?: string
          property_id?: string | null
          property_snapshot?: Json
          signature?: string | null
          status?: string
          trip_purpose?: string | null
          updated_at?: string | null
          user_id?: string | null
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
          company_register: string | null
          created_at: string | null
          finanzamt: string | null
          gutschrift_next_number: number
          id: string
          invoice_next_number: number | null
          invoice_payment_days: number | null
          invoice_prefix: string | null
          invoice_start_date: string | null
          invoice_thank_you_text: string | null
          is_kleinunternehmer: boolean | null
          kassenzeichen_dresden: string | null
          landlord_city: string | null
          landlord_country: string | null
          landlord_email: string | null
          landlord_logo_url: string | null
          landlord_name: string | null
          landlord_phone: string | null
          landlord_street: string | null
          landlord_website: string | null
          landlord_zip: string | null
          make_invoice_webhook_url: string | null
          managing_director: string | null
          personenkonto_chemnitz: string | null
          smoobu_api_key: string | null
          smoobu_last_sync: string | null
          storno_next_number: number
          tax_number: string | null
          updated_at: string | null
          user_id: string | null
          vat_id: string | null
        }
        Insert: {
          bank_bic?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          company_register?: string | null
          created_at?: string | null
          finanzamt?: string | null
          gutschrift_next_number?: number
          id?: string
          invoice_next_number?: number | null
          invoice_payment_days?: number | null
          invoice_prefix?: string | null
          invoice_start_date?: string | null
          invoice_thank_you_text?: string | null
          is_kleinunternehmer?: boolean | null
          kassenzeichen_dresden?: string | null
          landlord_city?: string | null
          landlord_country?: string | null
          landlord_email?: string | null
          landlord_logo_url?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          landlord_street?: string | null
          landlord_website?: string | null
          landlord_zip?: string | null
          make_invoice_webhook_url?: string | null
          managing_director?: string | null
          personenkonto_chemnitz?: string | null
          smoobu_api_key?: string | null
          smoobu_last_sync?: string | null
          storno_next_number?: number
          tax_number?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_id?: string | null
        }
        Update: {
          bank_bic?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          company_register?: string | null
          created_at?: string | null
          finanzamt?: string | null
          gutschrift_next_number?: number
          id?: string
          invoice_next_number?: number | null
          invoice_payment_days?: number | null
          invoice_prefix?: string | null
          invoice_start_date?: string | null
          invoice_thank_you_text?: string | null
          is_kleinunternehmer?: boolean | null
          kassenzeichen_dresden?: string | null
          landlord_city?: string | null
          landlord_country?: string | null
          landlord_email?: string | null
          landlord_logo_url?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          landlord_street?: string | null
          landlord_website?: string | null
          landlord_zip?: string | null
          make_invoice_webhook_url?: string | null
          managing_director?: string | null
          personenkonto_chemnitz?: string | null
          smoobu_api_key?: string | null
          smoobu_last_sync?: string | null
          storno_next_number?: number
          tax_number?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_id?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          action: string | null
          created_at: string | null
          error: string | null
          id: string
          payload: Json
          processed: boolean | null
          provider: string
          reservation_id: number | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
          provider?: string
          reservation_id?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
          provider?: string
          reservation_id?: number | null
          user_id?: string | null
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

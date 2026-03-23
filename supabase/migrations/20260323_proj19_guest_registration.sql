-- ============================================================================
-- PROJ-19: Gäste-Registrierungsformular – Datenbank-Migration
-- ============================================================================
-- Neue Tabelle guest_registration_tokens für tokenbasierte Gast-Formulare.
-- Erweitert registration_forms um guest_submitted Flag.
-- ============================================================================

-- 1. Neue Tabelle: guest_registration_tokens
CREATE TABLE IF NOT EXISTS guest_registration_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'completed')),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_guest_reg_tokens_token ON guest_registration_tokens(token);
CREATE INDEX IF NOT EXISTS idx_guest_reg_tokens_booking ON guest_registration_tokens(booking_id);

-- 3. RLS
ALTER TABLE guest_registration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own tokens"
  ON guest_registration_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own tokens"
  ON guest_registration_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own tokens"
  ON guest_registration_tokens FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own tokens"
  ON guest_registration_tokens FOR DELETE
  USING (user_id = auth.uid());

-- 4. Erweitere registration_forms um guest_submitted Flag
ALTER TABLE registration_forms
  ADD COLUMN IF NOT EXISTS guest_submitted BOOLEAN DEFAULT false;

-- PROJ-20: Auto-message triggers and logs
-- Stores per-user configuration for automatic messages after events (e.g. guest check-in)
-- and an audit trail of all auto-sent messages.

-- ─── auto_message_triggers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_message_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('guest_checkin_completed')),
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auto_message_triggers_user_event_unique UNIQUE(user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_auto_message_triggers_user_id ON auto_message_triggers(user_id);

ALTER TABLE auto_message_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own triggers"
  ON auto_message_triggers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own triggers"
  ON auto_message_triggers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own triggers"
  ON auto_message_triggers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own triggers"
  ON auto_message_triggers FOR DELETE
  USING (auth.uid() = user_id);

-- ─── auto_message_logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES auto_message_triggers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  message_subject TEXT,
  message_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_message_logs_user_id ON auto_message_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_message_logs_booking_id ON auto_message_logs(booking_id);

ALTER TABLE auto_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs"
  ON auto_message_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service can insert logs"
  ON auto_message_logs FOR INSERT
  WITH CHECK (true);

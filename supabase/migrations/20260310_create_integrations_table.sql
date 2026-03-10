-- PROJ-11: Self-Service PMS Integration
-- Migration: Create integrations table for per-user PMS connections

-- Create the integrations table
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('smoobu', 'apaleo', 'mews')),
  api_key_encrypted TEXT,
  webhook_token TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'unconfigured' CHECK (status IN ('connected', 'error', 'unconfigured')),
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user can only have one integration per provider
  UNIQUE(user_id, provider)
);

-- Enable Row Level Security
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own integrations
CREATE POLICY "Users can view own integrations"
  ON integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON integrations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_integrations_user_id ON integrations(user_id);
CREATE INDEX idx_integrations_webhook_token ON integrations(webhook_token) WHERE webhook_token IS NOT NULL;
CREATE INDEX idx_integrations_provider ON integrations(provider);

-- Comment
COMMENT ON TABLE integrations IS 'Per-user PMS integrations (Smoobu, Apaleo, Mews). API keys are AES-256-GCM encrypted at the application layer.';

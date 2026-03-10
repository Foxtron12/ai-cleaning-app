-- PROJ-12: Add payment gate columns to profiles
-- Already applied via Supabase MCP on 2026-03-10

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Index for middleware payment guard (frequent lookup)
CREATE INDEX IF NOT EXISTS idx_profiles_is_paid ON public.profiles (id, is_paid);

COMMENT ON COLUMN public.profiles.is_paid IS 'Whether user has completed one-time payment (PROJ-12)';
COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe Customer ID for reuse across sessions (PROJ-12)';

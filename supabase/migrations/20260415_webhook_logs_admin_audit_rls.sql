-- Enable RLS on webhook_logs and admin_audit_log tables
-- These tables were created directly in Supabase Studio without tracked migrations

-- ============================================================
-- webhook_logs: user_id-scoped, readable by owner, writable by service role only
-- ============================================================
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own webhook logs
CREATE POLICY "Users can view own webhook logs"
  ON webhook_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role inserts webhook logs (no INSERT/UPDATE/DELETE for anon/authenticated)
-- Service role bypasses RLS, so no explicit INSERT policy needed

-- ============================================================
-- admin_audit_log: admin-only table, no user access
-- ============================================================
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for regular users — only service role (which bypasses RLS) can read/write
-- This ensures audit logs are not accessible via the anon key or authenticated client

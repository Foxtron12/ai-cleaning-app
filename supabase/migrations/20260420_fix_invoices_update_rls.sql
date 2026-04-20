-- Fix: Add UPDATE RLS policy for invoices table.
-- Without this, client-side status changes (e.g. "Versendet") are silently rejected by RLS.

-- Drop first to make migration idempotent
DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;

CREATE POLICY "Users can update own invoices"
  ON invoices
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

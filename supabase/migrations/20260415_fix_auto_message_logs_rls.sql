-- Fix: auto_message_logs INSERT policy was too permissive (WITH CHECK (true))
-- Now restricted to only allow inserts for the authenticated user's own rows
DROP POLICY IF EXISTS "Service can insert logs" ON auto_message_logs;

CREATE POLICY "Users can insert own logs"
  ON auto_message_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

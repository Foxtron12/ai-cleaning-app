-- PROJ-20: Extend auto_message_triggers with more event types and delay
-- Add delay_minutes column and expand event_type CHECK constraint.

-- Drop the existing CHECK constraint and replace with expanded one
ALTER TABLE auto_message_triggers DROP CONSTRAINT IF EXISTS auto_message_triggers_event_type_check;
ALTER TABLE auto_message_triggers ADD CONSTRAINT auto_message_triggers_event_type_check
  CHECK (event_type IN (
    'guest_checkin_completed',
    'new_booking',
    'days_before_checkin',
    'after_checkout'
  ));

-- Add delay column (minutes). 0 = sofort, 60 = 1h, 1440 = 24h, etc.
ALTER TABLE auto_message_triggers ADD COLUMN IF NOT EXISTS delay_minutes INTEGER NOT NULL DEFAULT 0;

-- Add days_offset column for "X days before check-in" trigger
ALTER TABLE auto_message_triggers ADD COLUMN IF NOT EXISTS days_offset INTEGER NOT NULL DEFAULT 0;

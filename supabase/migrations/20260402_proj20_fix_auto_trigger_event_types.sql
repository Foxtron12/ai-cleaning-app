-- PROJ-20: Fix auto_message_triggers CHECK constraint
-- The previous migration only allowed: guest_checkin_completed, new_booking, days_before_checkin, after_checkout
-- But the UI and cron use: checkin_reminder, follow_up, checkout_reminder, review_request
-- This migration expands the constraint to include all event types.

ALTER TABLE auto_message_triggers DROP CONSTRAINT IF EXISTS auto_message_triggers_event_type_check;
ALTER TABLE auto_message_triggers ADD CONSTRAINT auto_message_triggers_event_type_check
  CHECK (event_type IN (
    'new_booking',
    'checkin_reminder',
    'guest_checkin_completed',
    'follow_up',
    'checkout_reminder',
    'review_request',
    -- Legacy (kept for backwards compatibility)
    'days_before_checkin',
    'after_checkout'
  ));

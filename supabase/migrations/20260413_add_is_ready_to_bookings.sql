-- Add manual readiness flag to bookings (traffic-light indicator)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_ready boolean DEFAULT false;

-- Neuer Buchungsstatus 'mid_stay_cancelled' fuer Mid-Stay-Stornierungen
-- (Gast hat einen Teil der Naechte gehabt, dann storniert).
-- Anders als 'cancelled' bleibt die City Tax anteilig faellig und die
-- Buchung erscheint weiter auf der Steuer-Uebersicht.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY['upcoming'::text, 'active'::text, 'completed'::text, 'cancelled'::text, 'mid_stay_cancelled'::text]));

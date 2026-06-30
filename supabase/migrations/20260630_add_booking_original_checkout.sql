-- Snapshot des urspruenglichen check_out bei Buchungskuerzung.
-- Zweck: BhSt-Verteilung fuer bereits gemeldete Monate einfrieren.
-- Alte Monate behalten ihre Original-Anteile, neuer letzter Monat absorbiert die Differenz.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS original_check_out date;

COMMENT ON COLUMN bookings.original_check_out IS
  'Vor-Kuerzungs-check_out. Wird via Trigger gesetzt, wenn check_out verkuerzt wird. NULL = nie gekuerzt.';

CREATE OR REPLACE FUNCTION snapshot_original_checkout_on_shortening()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.check_out IS NOT NULL
     AND OLD.check_out IS NOT NULL
     AND NEW.check_out < OLD.check_out
     AND OLD.original_check_out IS NULL THEN
    NEW.original_check_out := OLD.check_out;
  ELSIF OLD.original_check_out IS NOT NULL
        AND NEW.check_out IS NOT NULL
        AND NEW.check_out >= OLD.original_check_out THEN
    NEW.original_check_out := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_snapshot_original_checkout ON bookings;
CREATE TRIGGER bookings_snapshot_original_checkout
BEFORE UPDATE OF check_out ON bookings
FOR EACH ROW
EXECUTE FUNCTION snapshot_original_checkout_on_shortening();

-- Backfill: pacura med Buchung Altenberger Str. 18 wurde am 25.06.2026 von 30.06 auf 26.06 gekuerzt.
UPDATE bookings
SET original_check_out = '2026-06-30'
WHERE id = 'd76a7912-fe99-4a2e-a1ab-cf7989d37e21'
  AND check_out = '2026-06-26'
  AND original_check_out IS NULL;

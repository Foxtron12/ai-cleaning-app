-- Add per-property BhSt operator override fields
-- Allows properties to use different operator data on BhSt forms
-- (e.g. when a property runs under a different business name)

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS bhst_name text,
  ADD COLUMN IF NOT EXISTS bhst_street text,
  ADD COLUMN IF NOT EXISTS bhst_zip text,
  ADD COLUMN IF NOT EXISTS bhst_city text,
  ADD COLUMN IF NOT EXISTS bhst_kassenzeichen text;

COMMENT ON COLUMN properties.bhst_name IS 'Override: Betreibername für BhSt-Vordruck (falls abweichend von globalen Einstellungen)';
COMMENT ON COLUMN properties.bhst_street IS 'Override: Straße für BhSt-Vordruck';
COMMENT ON COLUMN properties.bhst_zip IS 'Override: PLZ für BhSt-Vordruck';
COMMENT ON COLUMN properties.bhst_city IS 'Override: Ort für BhSt-Vordruck';
COMMENT ON COLUMN properties.bhst_kassenzeichen IS 'Override: Kassenzeichen/Personenkonto für BhSt-Vordruck';

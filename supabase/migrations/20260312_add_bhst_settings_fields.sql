-- PROJ-13: Beherbergungssteuer-Vordrucke
-- Migration: Add Kassenzeichen (Dresden) and Personenkonto (Chemnitz) to settings

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS kassenzeichen_dresden TEXT;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS personenkonto_chemnitz TEXT;

COMMENT ON COLUMN settings.kassenzeichen_dresden IS 'Kassenzeichen der Stadt Dresden fuer Beherbergungssteuer-Anmeldung';
COMMENT ON COLUMN settings.personenkonto_chemnitz IS 'Personenkonto der Stadt Chemnitz fuer Beherbergungssteuer-Anmeldung';

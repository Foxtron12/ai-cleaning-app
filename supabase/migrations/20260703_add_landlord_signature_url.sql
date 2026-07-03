-- Unterschrift-URL fuer BhSt-PDF-Generierung
-- Der Nutzer kann in den Einstellungen ein PNG mit seiner Unterschrift hochladen.
-- Die BhSt-Generate-Route zeichnet das Bild im Unterschrift-Feld der PDF ein.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS landlord_signature_url text;

COMMENT ON COLUMN settings.landlord_signature_url IS
  'URL zu einem Unterschriftsbild (PNG mit transparentem Hintergrund empfohlen). Wird bei der BhSt-PDF-Generierung automatisch in das Unterschrift-Feld eingefuegt.';

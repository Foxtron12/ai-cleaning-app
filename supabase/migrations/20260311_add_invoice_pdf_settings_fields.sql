-- PROJ-5: Rechnungserstellung PDF Layout Redesign
-- Migration: Add new settings fields for enhanced invoice PDF layout
-- Fields: company_register, managing_director, invoice_thank_you_text

-- Add company register (Handelsregistereintrag, e.g. "HRB43938")
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS company_register TEXT;

-- Add managing director (Geschaeftsfuehrer)
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS managing_director TEXT;

-- Add invoice thank-you text (Dankestext am Rechnungsende)
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS invoice_thank_you_text TEXT;

-- Note: logo_url is already covered by the existing landlord_logo_url column.
-- No additional column needed.

COMMENT ON COLUMN settings.company_register IS 'Handelsregistereintrag (e.g. HRB43938, AG Dresden)';
COMMENT ON COLUMN settings.managing_director IS 'Geschaeftsfuehrer / Managing Director name';
COMMENT ON COLUMN settings.invoice_thank_you_text IS 'Custom thank-you text shown at the bottom of invoice PDFs';

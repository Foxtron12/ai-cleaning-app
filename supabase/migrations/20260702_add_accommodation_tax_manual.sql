-- Manueller City-Tax-Override auf Buchungen
-- Wenn true, wird accommodation_tax_amount als gesetzter Wert behandelt und
-- ueberschreibt die automatische 6%-Berechnung in calculateAccommodationTax.
-- Use Case: Mid-Stay-Storno via OTA — Gast hat schon Naechte gehabt, City Tax
-- ist anteilig faellig und muss manuell eingetragen werden.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS accommodation_tax_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN bookings.accommodation_tax_manual IS
  'Wenn true, wird accommodation_tax_amount als manueller Override behandelt und schlaegt automatische 6%-Berechnung durch.';

-- PROJ-21: Steuerbefreiungen pro Buchung (USt + BhSt)
-- Fuegt ein boolean-Flag vat_exempt zur bookings-Tabelle hinzu.
-- Wenn true: Rechnung fuer diese Buchung wird komplett ohne Umsatzsteuer erstellt
-- (Netto = Brutto, keine USt-Herausrechnung, USt-Summen = 0).

-- 1) Column hinzufuegen (nullable + default false, damit bestehende Zeilen sicher false bekommen)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS vat_exempt boolean NOT NULL DEFAULT false;

-- 2) Kommentar fuer Schema-Dokumentation
COMMENT ON COLUMN public.bookings.vat_exempt IS
  'PROJ-21: Wenn true, wird die Rechnung fuer diese Buchung ohne Umsatzsteuer erstellt (Netto=Brutto, USt=0). Aenderungen greifen nur fuer noch nicht erstellte Rechnungen.';

-- 3) Optionaler Index fuer Filterung (Liste "alle USt-freien Buchungen")
-- Partial index: nur TRUE-Zeilen werden indiziert (bleibt klein)
CREATE INDEX IF NOT EXISTS idx_bookings_vat_exempt
  ON public.bookings (user_id)
  WHERE vat_exempt = true;

-- RLS: Keine Aenderungen noetig. Die bestehenden Policies auf bookings
-- (SELECT/INSERT/UPDATE/DELETE je auth.uid() = user_id) decken die neue Spalte
-- automatisch ab, da Supabase Policies auf Zeilen- und nicht auf Spaltenebene wirken.

-- ============================================================================
-- PROJ-18: Stornorechnung & Gutschrift – Datenbank-Migration
-- ============================================================================
-- Erweitert invoices um invoice_type und settings um Storno/Gutschrift-Zähler.
-- GoBD-konform: Stornos & Gutschriften bekommen eigene fortlaufende Nummernkreise.
-- ============================================================================

-- 1. Neue Spalte invoice_type in invoices
-- Werte: 'invoice' (Standard), 'storno', 'credit_note'
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'invoice';

-- CHECK-Constraint: nur erlaubte Werte
ALTER TABLE invoices
  ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('invoice', 'storno', 'credit_note'));

-- 2. Neue Zähler-Spalten in settings
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS storno_next_number integer NOT NULL DEFAULT 1;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS gutschrift_next_number integer NOT NULL DEFAULT 1;

-- 3. Index auf invoice_type für Filterung im Rechnungsarchiv
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON invoices(invoice_type);

-- 4. Index auf cancelled_invoice_id für schnelle Referenz-Lookups
CREATE INDEX IF NOT EXISTS idx_invoices_cancelled_invoice_id ON invoices(cancelled_invoice_id);

-- 5. RLS bleibt bestehen (invoices + settings haben bereits RLS + user_id-Policies).
--    Keine neuen Policies nötig, da invoice_type nur ein neues Feld in derselben Tabelle ist.
--    Die bestehenden "Users see own invoices" und "Users manage own settings" Policies
--    schützen auch die neuen Spalten.

-- Verify: RLS is enabled on both tables (should already be true)
-- ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

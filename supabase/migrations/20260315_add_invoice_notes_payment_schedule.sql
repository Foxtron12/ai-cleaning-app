-- PROJ-14: Add notes and payment_schedule columns to invoices table
-- notes: free-text field for personal notes/cover letter on invoice PDF
-- payment_schedule: JSONB array of { due_date, amount } for monthly installment plans

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes_footer text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_schedule jsonb;

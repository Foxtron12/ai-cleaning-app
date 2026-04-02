-- Add brand_name field to profiles for messaging templates ({{companyName}} placeholder)
-- Separates legal company name (company_name) from marketing brand name (brand_name)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_name text;

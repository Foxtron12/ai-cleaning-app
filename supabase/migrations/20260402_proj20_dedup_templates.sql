-- PROJ-20: Deduplicate message_templates and prevent future duplicates
-- Keeps only the newest template per (user_id, name), deletes the rest.
-- Adds a UNIQUE constraint so duplicates can never be inserted again.

-- 1. Delete duplicates, keep newest per (user_id, name)
DELETE FROM message_templates
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, name) id
  FROM message_templates
  ORDER BY user_id, name, created_at DESC
);

-- 2. Remove old legacy template names no longer in DEFAULT_TEMPLATES
DELETE FROM message_templates
WHERE name IN ('Buchungsbestaetigung', 'Check-in Bestaetigung', 'Check-in Information', 'Check-in Information (EN)', 'Registrierungslink')
AND is_default = true;

-- 3. Prevent future duplicates
ALTER TABLE message_templates
  DROP CONSTRAINT IF EXISTS message_templates_user_name_unique;
ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_user_name_unique UNIQUE(user_id, name);

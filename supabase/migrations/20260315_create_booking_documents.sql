-- PROJ-17: Buchungs-Dokumenten-Upload
-- Migration: Create booking_documents table + Storage bucket + policies

-- ─── 1. Create booking_documents table ──────────────────────────────────────
CREATE TABLE booking_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Enable Row Level Security ──────────────────────────────────────────
ALTER TABLE booking_documents ENABLE ROW LEVEL SECURITY;

-- ─── 3. RLS Policies ───────────────────────────────────────────────────────
CREATE POLICY "Users can view own booking documents"
  ON booking_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own booking documents"
  ON booking_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own booking documents"
  ON booking_documents FOR DELETE
  USING (auth.uid() = user_id);

-- No UPDATE policy needed – documents are immutable (upload or delete, no edit)

-- ─── 4. Indexes ────────────────────────────────────────────────────────────
CREATE INDEX idx_booking_documents_booking_id ON booking_documents(booking_id);
CREATE INDEX idx_booking_documents_user_id ON booking_documents(user_id);

-- ─── 5. Supabase Storage Bucket ────────────────────────────────────────────
-- Create private bucket (no public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-documents',
  'booking-documents',
  false,
  10485760,  -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
);

-- ─── 6. Storage Policies ───────────────────────────────────────────────────
-- Users can upload files under their own user_id folder
CREATE POLICY "Users can upload own booking documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'booking-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read files under their own user_id folder
CREATE POLICY "Users can read own booking documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'booking-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete files under their own user_id folder
CREATE POLICY "Users can delete own booking documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'booking-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 7. Comment ────────────────────────────────────────────────────────────
COMMENT ON TABLE booking_documents IS 'Metadata for documents uploaded to bookings (e.g. BhSt exemption certificates). Files stored in Supabase Storage bucket booking-documents.';

-- ============================================================
-- Adiciona foto_url à tabela inspection_checklists
-- (as demais tabelas já possuem coluna de foto)
--
-- tire_services      → foto_pneus_url  (já existe)
-- traffic_fines      → comprovante_url (já existe)
-- damage_reports     → foto_url        (já existe)
-- smoke_tests        → evidencias_url  (já existe)
-- inspection_items   → foto_url        (já existe)
-- inspection_checklists → foto_url     ← novo
-- ============================================================

ALTER TABLE public.inspection_checklists
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- ── Storage buckets para os novos uploads do app motorista ───

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('tire-photos',      'tire-photos',      true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/heic']),
  ('fine-photos',      'fine-photos',      true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('checklist-photos', 'checklist-photos', true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/heic']),
  ('smoke-photos',     'smoke-photos',     true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- ── Políticas de storage (DROP IF EXISTS + CREATE para ser idempotente) ───────
-- PostgreSQL não suporta CREATE POLICY IF NOT EXISTS;
-- usamos DROP primeiro para tornar o script re-executável.

-- tire-photos
DROP POLICY IF EXISTS "tire_photos_read"   ON storage.objects;
DROP POLICY IF EXISTS "tire_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "tire_photos_delete" ON storage.objects;

CREATE POLICY "tire_photos_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'tire-photos');

CREATE POLICY "tire_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tire-photos');

CREATE POLICY "tire_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tire-photos');

-- fine-photos
DROP POLICY IF EXISTS "fine_photos_read"   ON storage.objects;
DROP POLICY IF EXISTS "fine_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "fine_photos_delete" ON storage.objects;

CREATE POLICY "fine_photos_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'fine-photos');

CREATE POLICY "fine_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fine-photos');

CREATE POLICY "fine_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fine-photos');

-- checklist-photos
DROP POLICY IF EXISTS "checklist_photos_read"   ON storage.objects;
DROP POLICY IF EXISTS "checklist_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "checklist_photos_delete" ON storage.objects;

CREATE POLICY "checklist_photos_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'checklist-photos');

CREATE POLICY "checklist_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-photos');

CREATE POLICY "checklist_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'checklist-photos');

-- smoke-photos
DROP POLICY IF EXISTS "smoke_photos_read"   ON storage.objects;
DROP POLICY IF EXISTS "smoke_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "smoke_photos_delete" ON storage.objects;

CREATE POLICY "smoke_photos_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'smoke-photos');

CREATE POLICY "smoke_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'smoke-photos');

CREATE POLICY "smoke_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'smoke-photos');

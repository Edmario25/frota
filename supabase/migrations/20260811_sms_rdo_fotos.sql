-- SMS: fotos em desvios/DDS/admissao + RDO aprimorado
-- Rodar no Supabase SQL Editor

-- 1. Bucket para midias SMS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sms-midias', 'sms-midias', true, 20971520,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
) ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "sms_midias_select" ON storage.objects;
CREATE POLICY "sms_midias_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'sms-midias');

DROP POLICY IF EXISTS "sms_midias_insert" ON storage.objects;
CREATE POLICY "sms_midias_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'sms-midias' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "sms_midias_delete" ON storage.objects;
CREATE POLICY "sms_midias_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'sms-midias' AND auth.role() = 'authenticated');

-- 2. fotos em DDS (desvios ja tem fotos na V2)
ALTER TABLE public.sms_dds_sessoes
  ADD COLUMN IF NOT EXISTS fotos text[] DEFAULT '{}';

-- 3. documentos em admissao
ALTER TABLE public.sms_admissoes
  ADD COLUMN IF NOT EXISTS documentos_urls text[] DEFAULT '{}';

-- 4. RDO aprimorado
ALTER TABLE public.sms_rdo
  ADD COLUMN IF NOT EXISTS numero_relatorio text,
  ADD COLUMN IF NOT EXISTS clima_manha      text,
  ADD COLUMN IF NOT EXISTS clima_tarde      text,
  ADD COLUMN IF NOT EXISTS mao_de_obra      jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS equipamentos     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS atividades       jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS fotos            text[] DEFAULT '{}';

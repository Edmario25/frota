-- Adicionar coluna de foto na tabela de manutenções
ALTER TABLE public.maintenance_records ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Criar bucket para fotos de manutenção (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('maintenance-photos', 'maintenance-photos', true, 52428800, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Criar bucket para fotos de abastecimento (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fuel-photos', 'fuel-photos', true, 52428800, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Policies para maintenance-photos
CREATE POLICY "maintenance_photos_select" ON storage.objects FOR SELECT USING (bucket_id = 'maintenance-photos');
CREATE POLICY "maintenance_photos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'maintenance-photos' AND auth.role() = 'authenticated');
CREATE POLICY "maintenance_photos_delete" ON storage.objects FOR DELETE USING (bucket_id = 'maintenance-photos' AND auth.role() = 'authenticated');

-- Policies para fuel-photos
CREATE POLICY "fuel_photos_select" ON storage.objects FOR SELECT USING (bucket_id = 'fuel-photos');
CREATE POLICY "fuel_photos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fuel-photos' AND auth.role() = 'authenticated');
CREATE POLICY "fuel_photos_delete" ON storage.objects FOR DELETE USING (bucket_id = 'fuel-photos' AND auth.role() = 'authenticated');

-- Criar buckets para fotos no Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('damage-photos', 'damage-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('wash-photos', 'wash-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('vehicle-photos', 'vehicle-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Políticas RLS para bucket de fotos de avarias
DROP POLICY IF EXISTS "Damage photos are publicly accessible" ON storage;
DROP POLICY IF EXISTS "Damage photos are publicly accessible" ON storage.objects;
CREATE POLICY "Damage photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'damage-photos');

DROP POLICY IF EXISTS "Users can upload damage photos for their own vehicles" ON storage;
DROP POLICY IF EXISTS "Users can upload damage photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can upload damage photos for their own vehicles"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'damage-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can update damage photos for their own vehicles" ON storage;
DROP POLICY IF EXISTS "Users can update damage photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can update damage photos for their own vehicles"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'damage-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

-- Políticas RLS para bucket de fotos de lavagem
DROP POLICY IF EXISTS "Wash photos are publicly accessible" ON storage;
DROP POLICY IF EXISTS "Wash photos are publicly accessible" ON storage.objects;
CREATE POLICY "Wash photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'wash-photos');

DROP POLICY IF EXISTS "Users can upload wash photos for their own vehicles" ON storage;
DROP POLICY IF EXISTS "Users can upload wash photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can upload wash photos for their own vehicles"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'wash-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can update wash photos for their own vehicles" ON storage;
DROP POLICY IF EXISTS "Users can update wash photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can update wash photos for their own vehicles"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'wash-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

-- Políticas RLS para bucket de fotos de veículos
DROP POLICY IF EXISTS "Vehicle photos are publicly accessible" ON storage;
DROP POLICY IF EXISTS "Vehicle photos are publicly accessible" ON storage.objects;
CREATE POLICY "Vehicle photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "Users can upload vehicle photos for their own vehicles" ON storage;
DROP POLICY IF EXISTS "Users can upload vehicle photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can upload vehicle photos for their own vehicles"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'vehicle-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can update vehicle photos for their own vehicles" ON storage;
DROP POLICY IF EXISTS "Users can update vehicle photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can update vehicle photos for their own vehicles"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'vehicle-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

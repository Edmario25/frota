-- Criar bucket para fotos de funcionários
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('employee-photos', 'employee-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Políticas RLS para bucket de fotos de funcionários
DROP POLICY IF EXISTS "Employee photos are publicly accessible" ON storage;
DROP POLICY IF EXISTS "Employee photos are publicly accessible" ON storage.objects;
CREATE POLICY "Employee photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'employee-photos');

DROP POLICY IF EXISTS "Users can upload their own employee photos" ON storage;
DROP POLICY IF EXISTS "Users can upload their own employee photos" ON storage.objects;
CREATE POLICY "Users can upload their own employee photos"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'employee-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] = auth.uid()::text)
  )
);

DROP POLICY IF EXISTS "Users can update their own employee photos" ON storage;
DROP POLICY IF EXISTS "Users can update their own employee photos" ON storage.objects;
CREATE POLICY "Users can update their own employee photos"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'employee-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] = auth.uid()::text)
  )
);

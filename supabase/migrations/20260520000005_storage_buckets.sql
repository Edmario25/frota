-- =====================================================================
-- STORAGE BUCKETS — system-assets e fundo-fixo-recibos
-- =====================================================================

-- 1. Criar buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'system-assets',
    'system-assets',
    true,
    10485760, -- 10 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
  ),
  (
    'fundo-fixo-recibos',
    'fundo-fixo-recibos',
    true,
    20971520, -- 20 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- POLÍTICAS — system-assets (logo e ícone do sistema)
-- =====================================================================

-- Leitura pública
DROP POLICY IF EXISTS "system_assets_public_select" ON storage.objects;
CREATE POLICY "system_assets_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'system-assets');

-- Upload: apenas gestor_contrato / admin
DROP POLICY IF EXISTS "system_assets_admin_insert" ON storage.objects;
CREATE POLICY "system_assets_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'system-assets'
    AND public.is_gestor_contrato()
  );

-- Atualização: apenas gestor_contrato / admin
DROP POLICY IF EXISTS "system_assets_admin_update" ON storage.objects;
CREATE POLICY "system_assets_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'system-assets'
    AND public.is_gestor_contrato()
  );

-- Deleção: apenas gestor_contrato / admin
DROP POLICY IF EXISTS "system_assets_admin_delete" ON storage.objects;
CREATE POLICY "system_assets_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'system-assets'
    AND public.is_gestor_contrato()
  );

-- =====================================================================
-- POLÍTICAS — fundo-fixo-recibos (recibos e NFs dos lançamentos)
-- =====================================================================

-- Leitura pública
DROP POLICY IF EXISTS "fundo_recibos_public_select" ON storage.objects;
CREATE POLICY "fundo_recibos_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fundo-fixo-recibos');

-- Upload: qualquer usuário autenticado com acesso ao fundo fixo
-- (gestor_contrato, gestor_obra ou funcionário com cargo autorizado)
DROP POLICY IF EXISTS "fundo_recibos_authenticated_insert" ON storage.objects;
CREATE POLICY "fundo_recibos_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'fundo-fixo-recibos'
    AND auth.role() = 'authenticated'
    AND (
      public.is_gestor_contrato()
      OR public.is_gestor_obra()
      OR (
        public.is_funcionario()
        AND EXISTS (
          SELECT 1 FROM public.employees e
          JOIN public.cargos c ON c.id = e.cargo_id
          WHERE e.user_id = auth.uid()
            AND c.acesso_fundo_fixo = true
        )
      )
    )
  );

-- Atualização: próprio upload ou gestores
DROP POLICY IF EXISTS "fundo_recibos_authenticated_update" ON storage.objects;
CREATE POLICY "fundo_recibos_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'fundo-fixo-recibos'
    AND auth.role() = 'authenticated'
    AND (
      public.is_gestor_contrato()
      OR public.is_gestor_obra()
      OR owner = auth.uid()
    )
  );

-- Deleção: gestores ou dono do arquivo
DROP POLICY IF EXISTS "fundo_recibos_authenticated_delete" ON storage.objects;
CREATE POLICY "fundo_recibos_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'fundo-fixo-recibos'
    AND (
      public.is_gestor_contrato()
      OR public.is_gestor_obra()
      OR owner = auth.uid()
    )
  );

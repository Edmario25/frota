-- Fundo Fixo: alinhamento das regras antigas ao motor atual de acesso.
--
-- Os fundos e lancamentos existentes nao sao alterados. Esta migration somente
-- troca as politicas RLS que ainda dependiam exclusivamente de
-- is_gestor_contrato(), funcao que nao considera o papel legado "admin" nem
-- os perfis do Controle de Acesso.

CREATE OR REPLACE FUNCTION public.fundo_fixo_pode_visualizar_obra(p_obra uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.access_is_admin()
    OR public.get_user_role(auth.uid())::text IN ('gestor_contrato', 'gestor_frota')
    OR public.pode('fundo_fixo.visualizar', p_obra)
    OR (
      public.get_user_role(auth.uid())::text = 'gestor_obra'
      AND p_obra = public.get_user_obra_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.cargos c ON c.id = e.cargo_id
      WHERE e.user_id = auth.uid()
        AND c.acesso_fundo_fixo = true
        AND p_obra = public.get_user_obra_id()
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.fundo_fixo_pode_gerir_obra(p_obra uuid, p_acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.access_is_admin()
    OR public.get_user_role(auth.uid())::text IN ('gestor_contrato', 'gestor_frota')
    OR public.pode('fundo_fixo.' || p_acao, p_obra)
    OR (
      public.get_user_role(auth.uid())::text = 'gestor_obra'
      AND p_obra = public.get_user_obra_id()
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.fundo_fixo_pode_visualizar(p_fundo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fundo_fixo f
    WHERE f.id = p_fundo_id
      AND public.fundo_fixo_pode_visualizar_obra(f.obra_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.fundo_fixo_pode_gerir(p_fundo_id uuid, p_acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fundo_fixo f
    WHERE f.id = p_fundo_id
      AND public.fundo_fixo_pode_gerir_obra(f.obra_id, p_acao)
  )
$$;

GRANT EXECUTE ON FUNCTION public.fundo_fixo_pode_visualizar_obra(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fundo_fixo_pode_gerir_obra(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fundo_fixo_pode_visualizar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fundo_fixo_pode_gerir(uuid, text) TO authenticated;

-- Remover somente as politicas de acesso do modulo. Dados e trilha de
-- auditoria permanecem intactos.
DROP POLICY IF EXISTS "fundo_fixo_admin_all" ON public.fundo_fixo;
DROP POLICY IF EXISTS "fundo_fixo_gestor_obra_all" ON public.fundo_fixo;
DROP POLICY IF EXISTS "fundo_fixo_funcionario_select" ON public.fundo_fixo;
DROP POLICY IF EXISTS "fundo_lanc_admin_all" ON public.fundo_fixo_lancamentos;
DROP POLICY IF EXISTS "fundo_lanc_gestor_obra_all" ON public.fundo_fixo_lancamentos;
DROP POLICY IF EXISTS "fundo_lanc_funcionario_select" ON public.fundo_fixo_lancamentos;
DROP POLICY IF EXISTS "fundo_lanc_funcionario_insert" ON public.fundo_fixo_lancamentos;

CREATE POLICY "fundo_fixo_visualizar_por_escopo"
ON public.fundo_fixo FOR SELECT TO authenticated
USING (public.fundo_fixo_pode_visualizar_obra(obra_id));

CREATE POLICY "fundo_fixo_criar_por_escopo"
ON public.fundo_fixo FOR INSERT TO authenticated
WITH CHECK (public.fundo_fixo_pode_gerir_obra(obra_id, 'criar'));

CREATE POLICY "fundo_fixo_editar_por_escopo"
ON public.fundo_fixo FOR UPDATE TO authenticated
USING (public.fundo_fixo_pode_gerir_obra(obra_id, 'editar'))
WITH CHECK (public.fundo_fixo_pode_gerir_obra(obra_id, 'editar'));

CREATE POLICY "fundo_fixo_excluir_por_escopo"
ON public.fundo_fixo FOR DELETE TO authenticated
USING (public.fundo_fixo_pode_gerir_obra(obra_id, 'excluir'));

CREATE POLICY "fundo_lanc_visualizar_por_escopo"
ON public.fundo_fixo_lancamentos FOR SELECT TO authenticated
USING (public.fundo_fixo_pode_visualizar(fundo_fixo_id));

CREATE POLICY "fundo_lanc_criar_por_escopo"
ON public.fundo_fixo_lancamentos FOR INSERT TO authenticated
WITH CHECK (
  public.fundo_fixo_pode_gerir(fundo_fixo_id, 'criar')
  OR (
    tipo = 'saida'
    AND EXISTS (
      SELECT 1 FROM public.fundo_fixo f
      WHERE f.id = fundo_fixo_id
        AND (
          public.pode('fundo_fixo.solicitar', f.obra_id)
          OR EXISTS (
            SELECT 1
            FROM public.employees e
            JOIN public.cargos c ON c.id = e.cargo_id
            WHERE e.user_id = auth.uid()
              AND c.acesso_fundo_fixo = true
              AND f.obra_id = public.get_user_obra_id()
          )
        )
    )
  )
);

CREATE POLICY "fundo_lanc_editar_por_escopo"
ON public.fundo_fixo_lancamentos FOR UPDATE TO authenticated
USING (public.fundo_fixo_pode_gerir(fundo_fixo_id, 'editar'))
WITH CHECK (public.fundo_fixo_pode_gerir(fundo_fixo_id, 'editar'));

CREATE POLICY "fundo_lanc_excluir_por_escopo"
ON public.fundo_fixo_lancamentos FOR DELETE TO authenticated
USING (public.fundo_fixo_pode_gerir(fundo_fixo_id, 'excluir'));

COMMENT ON FUNCTION public.fundo_fixo_pode_visualizar_obra(uuid) IS
  'Compatibiliza o Fundo Fixo com perfis e escopos atuais, sem ocultar dados cadastrados antes da migracao.';

-- Restringe equipes e membros ao escopo de obra do usuario.

CREATE OR REPLACE FUNCTION public.can_manage_obra_data(target_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR (
      public.get_user_role(auth.uid()) = 'gestor_obra'
      AND target_obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_obra_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_obra_data(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_obra_data(uuid) TO authenticated;

DROP POLICY IF EXISTS equipes_all ON public.obra_equipes;
DROP POLICY IF EXISTS obra_equipes_select_scoped ON public.obra_equipes;
DROP POLICY IF EXISTS obra_equipes_manage_scoped ON public.obra_equipes;

CREATE POLICY obra_equipes_select_scoped
  ON public.obra_equipes FOR SELECT TO authenticated
  USING (
    obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
  );

CREATE POLICY obra_equipes_manage_scoped
  ON public.obra_equipes FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS equipe_membros_all ON public.obra_equipe_membros;
DROP POLICY IF EXISTS obra_equipe_membros_select_scoped ON public.obra_equipe_membros;
DROP POLICY IF EXISTS obra_equipe_membros_manage_scoped ON public.obra_equipe_membros;

CREATE POLICY obra_equipe_membros_select_scoped
  ON public.obra_equipe_membros FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.obra_equipes equipe
      WHERE equipe.id = equipe_id
        AND equipe.obra_id = ANY(
          COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[])
        )
    )
  );

CREATE POLICY obra_equipe_membros_manage_scoped
  ON public.obra_equipe_membros FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.obra_equipes equipe
      WHERE equipe.id = equipe_id
        AND public.can_manage_obra_data(equipe.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.obra_equipes equipe
      WHERE equipe.id = equipe_id
        AND public.can_manage_obra_data(equipe.obra_id)
    )
  );

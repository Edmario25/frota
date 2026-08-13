-- ============================================================
-- Fix: cargo_permissions — corrige join profiles→employees
-- O link correto é employees.user_id = auth.uid()
-- Rode este arquivo após o 20260811_cargo_permissions.sql
-- ============================================================

-- ─── 1. Recriar tabela (caso não tenha criado no arquivo anterior) ───

CREATE TABLE IF NOT EXISTS public.employee_obra_assignments (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id     uuid NOT NULL REFERENCES public.obras(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  PRIMARY KEY (employee_id, obra_id)
);

ALTER TABLE public.employee_obra_assignments ENABLE ROW LEVEL SECURITY;

-- ─── 2. Dropar políticas antigas (se existirem) ──────────────────────

DROP POLICY IF EXISTS "eoa_select_gestores"    ON public.employee_obra_assignments;
DROP POLICY IF EXISTS "eoa_select_gestor_obra" ON public.employee_obra_assignments;
DROP POLICY IF EXISTS "eoa_write_gestores"     ON public.employee_obra_assignments;

-- ─── 3. Recriar políticas com join correto ───────────────────────────

-- Gestores de contrato/admin veem todos os vínculos
CREATE POLICY "eoa_select_gestores" ON public.employee_obra_assignments
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota'));

-- Qualquer autenticado pode ver (simplificado — RLS por obra será nas tabelas de negócio)
CREATE POLICY "eoa_select_all_auth" ON public.employee_obra_assignments
  FOR SELECT TO authenticated
  USING (true);

-- Gestores podem inserir/atualizar/deletar
CREATE POLICY "eoa_write_gestores" ON public.employee_obra_assignments
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- ─── 4. Recriar função get_user_permissions (join correto) ──────────

DROP FUNCTION IF EXISTS public.get_user_permissions();

CREATE OR REPLACE FUNCTION public.get_user_permissions()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT to_jsonb(c.*) - 'id' - 'created_at' - 'updated_at'
  FROM public.cargos c
  WHERE c.id = (
    SELECT e.cargo_id
    FROM public.employees e
    WHERE e.user_id = auth.uid()
    LIMIT 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permissions() TO authenticated;

-- ─── 5. Recriar função get_user_obra_ids (join correto) ─────────────

DROP FUNCTION IF EXISTS public.get_user_obra_ids();

CREATE OR REPLACE FUNCTION public.get_user_obra_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT CASE
    WHEN (
      SELECT c.acessa_todas_obras
      FROM public.cargos c
      WHERE c.id = (
        SELECT e.cargo_id
        FROM public.employees e
        WHERE e.user_id = auth.uid()
        LIMIT 1
      )
    ) = true
    THEN ARRAY(SELECT id FROM public.obras)
    ELSE ARRAY(
      SELECT eoa.obra_id
      FROM public.employee_obra_assignments eoa
      WHERE eoa.employee_id = (
        SELECT e.id
        FROM public.employees e
        WHERE e.user_id = auth.uid()
        LIMIT 1
      )
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_obra_ids() TO authenticated;

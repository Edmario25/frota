-- ============================================================
-- Fix: RLS de escala_periodos para funcionários
--
-- Recria as políticas da tabela escala_periodos para garantir
-- que o motorista (funcionário) consegue ver sua própria escala.
-- Usa DROP IF EXISTS + CREATE para ser idempotente.
-- ============================================================

-- ── Políticas de escala_periodos ─────────────────────────────

-- Admin e gestor_frota: acesso total
DROP POLICY IF EXISTS "Admins and gestors can manage escala_periodos" ON public.escala_periodos;
CREATE POLICY "Admins and gestors can manage escala_periodos"
ON public.escala_periodos
FOR ALL
USING  (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Funcionário: vê APENAS seus próprios períodos
DROP POLICY IF EXISTS "Employees can view their own escala_periodos" ON public.escala_periodos;
CREATE POLICY "Employees can view their own escala_periodos"
ON public.escala_periodos
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  )
);

-- Gestor de obra: gerencia períodos dos funcionários da sua obra
DROP POLICY IF EXISTS "Gestor obra can manage escala for their employees" ON public.escala_periodos;
CREATE POLICY "Gestor obra can manage escala for their employees"
ON public.escala_periodos
FOR ALL
USING (
  is_gestor_obra() AND is_employee_in_same_obra(employee_id)
)
WITH CHECK (
  is_gestor_obra() AND is_employee_in_same_obra(employee_id)
);

-- ── Garante que escala_tipos é legível por todos os autenticados ──────────

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.escala_tipos;
CREATE POLICY "Allow read access to all authenticated users"
ON public.escala_tipos
FOR SELECT
USING (true);

-- ── Função check_user_app_access (usada em useCurrentEmployee) ────────────
-- Verifica se um usuário tem acesso ao app do motorista.
-- Retorna true se o employee tem acesso_app_motorista = true.
-- DROP primeiro porque CREATE OR REPLACE não pode alterar assinatura existente.

DROP FUNCTION IF EXISTS public.check_user_app_access(uuid);
CREATE FUNCTION public.check_user_app_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT acesso_app_motorista FROM public.employees WHERE user_id = p_user_id LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_user_app_access(uuid) TO authenticated;

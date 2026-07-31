-- =====================================================================
-- Fix: is_gestor_contrato() não estava definida em nenhuma migration.
-- Criava dependência de função criada manualmente → quebra ao rodar migrations.
-- Solução: definir a função explicitamente e usar role check direto nas policies.
-- =====================================================================

-- ─── 1. Definir is_gestor_contrato() como SECURITY DEFINER ───────────
CREATE OR REPLACE FUNCTION public.is_gestor_contrato()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_user_role(auth.uid()) = 'gestor_contrato'::app_role;
$$;

GRANT EXECUTE ON FUNCTION public.is_gestor_contrato() TO authenticated;

-- ─── 2. Recriar policy de obras para gestor_contrato ─────────────────
-- Usa get_user_role direto (não depende de is_gestor_contrato existir no DB)
DROP POLICY IF EXISTS "gestor_contrato_obras_all" ON public.obras;

CREATE POLICY "gestor_contrato_obras_all"
ON public.obras FOR ALL
USING (
  get_user_role(auth.uid()) = 'gestor_contrato'::app_role
  OR get_user_role(auth.uid()) = 'admin'::app_role
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_contrato'::app_role
  OR get_user_role(auth.uid()) = 'admin'::app_role
);

-- ─── 3. Recriar policy de obra_funcionarios para gestor_contrato ──────
DROP POLICY IF EXISTS "gestor_contrato_obra_funcionarios_all" ON public.obra_funcionarios;

CREATE POLICY "gestor_contrato_obra_funcionarios_all"
ON public.obra_funcionarios FOR ALL
USING (
  get_user_role(auth.uid()) = 'gestor_contrato'::app_role
  OR get_user_role(auth.uid()) = 'admin'::app_role
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_contrato'::app_role
  OR get_user_role(auth.uid()) = 'admin'::app_role
);

-- ─── 4. Recriar policy de obra_veiculos para gestor_contrato ─────────
DROP POLICY IF EXISTS "gestor_contrato_obra_veiculos_all" ON public.obra_veiculos;

CREATE POLICY "gestor_contrato_obra_veiculos_all"
ON public.obra_veiculos FOR ALL
USING (
  get_user_role(auth.uid()) = 'gestor_contrato'::app_role
  OR get_user_role(auth.uid()) = 'admin'::app_role
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_contrato'::app_role
  OR get_user_role(auth.uid()) = 'admin'::app_role
);

-- ─── 5. Também garantir gestor_frota acesso completo a obras ─────────
-- (estava no sistema antigo como 'admin', vamos manter compatibilidade)
DROP POLICY IF EXISTS "gestor_frota_obras_all" ON public.obras;

CREATE POLICY "gestor_frota_obras_all"
ON public.obras FOR ALL
USING (get_user_role(auth.uid()) = 'gestor_frota'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'gestor_frota'::app_role);

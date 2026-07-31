-- =====================================================================
-- Fix: RLS recursion na tabela obra_funcionarios
--
-- Problema: migration 000007 criou política que consulta obra_funcionarios
-- dentro do USING de obra_funcionarios (auto-referência → recursão → vazio).
--
-- Solução: criar função SECURITY DEFINER get_my_obra_ids() que bypassa RLS
-- e retorna os obra_ids do usuário logado. Usar essa função em todas as
-- políticas que precisam verificar associação do usuário à obra.
-- =====================================================================

-- ─── 1. Função SECURITY DEFINER: retorna obra_ids do usuário logado ──
CREATE OR REPLACE FUNCTION public.get_my_obra_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT of1.obra_id
  FROM obra_funcionarios of1
  JOIN employees e ON e.id = of1.employee_id
  WHERE e.user_id = auth.uid()
    AND of1.status = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_obra_ids() TO authenticated;

-- ─── 2. obras: gestor_obra pode ver obras onde está vinculado ─────────
-- (substitui política criada em 000007 e nas migrations anteriores)
DROP POLICY IF EXISTS "Gestores obra veem obras vinculadas"   ON public.obras;
DROP POLICY IF EXISTS "Gestores obra veem suas obras"         ON public.obras;
DROP POLICY IF EXISTS "Gestores de obra podem ver suas obras" ON public.obras;

CREATE POLICY "gestor_obra_select_obras"
ON public.obras FOR SELECT
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND (
    -- modo antigo: é responsável técnico
    responsavel_tecnico_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
    -- modo novo: está vinculado à obra via obra_funcionarios
    OR id IN (SELECT public.get_my_obra_ids())
  )
);

-- UPDATE nas obras onde é responsável técnico ou membro
DROP POLICY IF EXISTS "Gestores obra editam obras vinculadas" ON public.obras;
DROP POLICY IF EXISTS "Gestores obra editam suas obras"       ON public.obras;
DROP POLICY IF EXISTS "Gestores de obra podem editar suas obras" ON public.obras;

CREATE POLICY "gestor_obra_update_obras"
ON public.obras FOR UPDATE
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND (
    responsavel_tecnico_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
    OR id IN (SELECT public.get_my_obra_ids())
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
);

-- ─── 3. obra_funcionarios: gestor_obra pode gerenciar vínculos das suas obras ──
-- Substitui política auto-referencial (recursiva) criada em 000007
DROP POLICY IF EXISTS "Gestor obra gerencia vinculações suas obras" ON public.obra_funcionarios;

CREATE POLICY "gestor_obra_obra_funcionarios"
ON public.obra_funcionarios FOR ALL
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND obra_id IN (SELECT public.get_my_obra_ids())
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND obra_id IN (SELECT public.get_my_obra_ids())
);

-- ─── 4. obra_veiculos: gestor_obra pode gerenciar veículos das suas obras ──
DROP POLICY IF EXISTS "Gestor obra gerencia veiculos suas obras" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Gestores de obra podem gerenciar veículos de suas obras" ON public.obra_veiculos;

CREATE POLICY "gestor_obra_obra_veiculos"
ON public.obra_veiculos FOR ALL
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND obra_id IN (SELECT public.get_my_obra_ids())
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND obra_id IN (SELECT public.get_my_obra_ids())
);

-- ─── 5. gestor_contrato: acesso total a obras, obra_funcionarios, obra_veiculos ──
-- (garante que não conflita com as novas políticas)
DROP POLICY IF EXISTS "gestor_contrato_obras_all"          ON public.obras;
DROP POLICY IF EXISTS "Gestores gerais acessam todas obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as obras" ON public.obras;

CREATE POLICY "gestor_contrato_obras_all"
ON public.obras FOR ALL
USING (public.is_gestor_contrato() OR get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (public.is_gestor_contrato() OR get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Admin gerencia vinculações funcionarios" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "gestor_contrato_obra_funcionarios_all" ON public.obra_funcionarios;

CREATE POLICY "gestor_contrato_obra_funcionarios_all"
ON public.obra_funcionarios FOR ALL
USING (public.is_gestor_contrato() OR get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (public.is_gestor_contrato() OR get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Admin gerencia vinculações veiculos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações de veículos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "gestor_contrato_obra_veiculos_all" ON public.obra_veiculos;

CREATE POLICY "gestor_contrato_obra_veiculos_all"
ON public.obra_veiculos FOR ALL
USING (public.is_gestor_contrato() OR get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (public.is_gestor_contrato() OR get_user_role(auth.uid()) = 'admin'::app_role);

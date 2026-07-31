-- =====================================================================
-- FIX COMPLETO: obras, obra_funcionarios, obra_veiculos
-- Execute este arquivo INTEIRO de uma vez no SQL Editor do Supabase.
-- Resolve tanto a recursão do gestor_obra quanto o acesso do gestor_contrato.
-- =====================================================================

-- ─── 1. FUNÇÕES HELPER ──────────────────────────────────────────────

-- is_gestor_contrato(): verifica se usuário tem role gestor_contrato
CREATE OR REPLACE FUNCTION public.is_gestor_contrato()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_user_role(auth.uid()) = 'gestor_contrato'::app_role;
$$;
GRANT EXECUTE ON FUNCTION public.is_gestor_contrato() TO authenticated;

-- is_gestor_obra(): verifica se usuário tem role gestor_obra
CREATE OR REPLACE FUNCTION public.is_gestor_obra()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_user_role(auth.uid()) = 'gestor_obra'::app_role;
$$;
GRANT EXECUTE ON FUNCTION public.is_gestor_obra() TO authenticated;

-- get_my_obra_ids(): retorna obra_ids do usuário logado (SECURITY DEFINER — bypassa RLS)
CREATE OR REPLACE FUNCTION public.get_my_obra_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT of1.obra_id
  FROM obra_funcionarios of1
  JOIN employees e ON e.id = of1.employee_id
  WHERE e.user_id = auth.uid()
    AND of1.status = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_obra_ids() TO authenticated;


-- ─── 2. OBRAS: remover TODAS as policies existentes ─────────────────

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'obras' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.obras', pol.policyname);
  END LOOP;
END $$;

-- gestor_contrato e admin: acesso total
CREATE POLICY "obras_gestor_contrato_all"
ON public.obras FOR ALL
USING (
  get_user_role(auth.uid()) = 'gestor_contrato'::app_role
  OR get_user_role(auth.uid()) = 'admin'::app_role
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_contrato'::app_role
  OR get_user_role(auth.uid()) = 'admin'::app_role
);

-- gestor_frota: acesso total
CREATE POLICY "obras_gestor_frota_all"
ON public.obras FOR ALL
USING (get_user_role(auth.uid()) = 'gestor_frota'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'gestor_frota'::app_role);

-- gestor_obra: ver obras onde está vinculado (via responsavel_tecnico OU obra_funcionarios)
CREATE POLICY "obras_gestor_obra_select"
ON public.obras FOR SELECT
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND (
    responsavel_tecnico_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR id IN (SELECT public.get_my_obra_ids())
  )
);

-- gestor_obra: editar apenas obras onde é responsável técnico ou membro
CREATE POLICY "obras_gestor_obra_update"
ON public.obras FOR UPDATE
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND (
    responsavel_tecnico_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR id IN (SELECT public.get_my_obra_ids())
  )
)
WITH CHECK (get_user_role(auth.uid()) = 'gestor_obra'::app_role);


-- ─── 3. OBRA_FUNCIONARIOS: remover TODAS as policies existentes ──────

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'obra_funcionarios' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.obra_funcionarios', pol.policyname);
  END LOOP;
END $$;

-- gestor_contrato / admin / frota: acesso total
CREATE POLICY "obra_func_admin_all"
ON public.obra_funcionarios FOR ALL
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_contrato'::app_role, 'admin'::app_role, 'gestor_frota'::app_role])
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_contrato'::app_role, 'admin'::app_role, 'gestor_frota'::app_role])
);

-- gestor_obra: ver/gerenciar vínculos das obras onde é membro (usa SECURITY DEFINER — sem recursão)
CREATE POLICY "obra_func_gestor_obra_all"
ON public.obra_funcionarios FOR ALL
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND obra_id IN (SELECT public.get_my_obra_ids())
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND obra_id IN (SELECT public.get_my_obra_ids())
);

-- funcionario: ver apenas seus próprios vínculos
CREATE POLICY "obra_func_funcionario_select"
ON public.obra_funcionarios FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);


-- ─── 4. OBRA_VEICULOS: remover TODAS as policies existentes ─────────

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'obra_veiculos' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.obra_veiculos', pol.policyname);
  END LOOP;
END $$;

-- gestor_contrato / admin / frota: acesso total
CREATE POLICY "obra_veic_admin_all"
ON public.obra_veiculos FOR ALL
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_contrato'::app_role, 'admin'::app_role, 'gestor_frota'::app_role])
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_contrato'::app_role, 'admin'::app_role, 'gestor_frota'::app_role])
);

-- gestor_obra: ver/gerenciar veículos das obras onde é membro
CREATE POLICY "obra_veic_gestor_obra_all"
ON public.obra_veiculos FOR ALL
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND obra_id IN (SELECT public.get_my_obra_ids())
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND obra_id IN (SELECT public.get_my_obra_ids())
);

-- funcionario: ver veículos das obras onde trabalha
CREATE POLICY "obra_veic_funcionario_select"
ON public.obra_veiculos FOR SELECT
USING (
  obra_id IN (SELECT public.get_my_obra_ids())
);

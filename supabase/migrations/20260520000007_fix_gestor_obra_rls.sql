-- =====================================================================
-- Fix: gestor_obra deve ver obras onde está vinculado via obra_funcionarios
-- (além das obras onde é responsavel_tecnico)
-- =====================================================================

-- 1. Obras: gestor_obra pode ver obras onde está em obra_funcionarios
DROP POLICY IF EXISTS "Gestores obra veem obras vinculadas" ON public.obras;
CREATE POLICY "Gestores obra veem obras vinculadas"
ON public.obras FOR SELECT
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND (
    -- Via responsavel_tecnico_id (modo antigo)
    responsavel_tecnico_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
    OR responsavel_tecnico_id IS NULL
    -- Via obra_funcionarios (modo novo - vinculação por equipe)
    OR id IN (
      SELECT of1.obra_id
      FROM public.obra_funcionarios of1
      JOIN public.employees e ON e.id = of1.employee_id
      WHERE e.user_id = auth.uid()
        AND of1.status = true
    )
  )
);

-- 2. gestor_obra também pode gerenciar (ALL) obras onde está vinculado
DROP POLICY IF EXISTS "Gestores obra editam obras vinculadas" ON public.obras;
CREATE POLICY "Gestores obra editam obras vinculadas"
ON public.obras FOR UPDATE
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND (
    responsavel_tecnico_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
    OR id IN (
      SELECT of1.obra_id
      FROM public.obra_funcionarios of1
      JOIN public.employees e ON e.id = of1.employee_id
      WHERE e.user_id = auth.uid()
        AND of1.status = true
    )
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
);

-- 3. obra_funcionarios: gestor_obra pode ver/gerenciar vínculos da sua obra
DROP POLICY IF EXISTS "Gestor obra gerencia vinculações suas obras" ON public.obra_funcionarios;
CREATE POLICY "Gestor obra gerencia vinculações suas obras"
ON public.obra_funcionarios FOR ALL
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND obra_id IN (
    SELECT of2.obra_id
    FROM public.obra_funcionarios of2
    JOIN public.employees e ON e.id = of2.employee_id
    WHERE e.user_id = auth.uid()
      AND of2.status = true
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
  AND obra_id IN (
    SELECT of2.obra_id
    FROM public.obra_funcionarios of2
    JOIN public.employees e ON e.id = of2.employee_id
    WHERE e.user_id = auth.uid()
      AND of2.status = true
  )
);

-- 4. gestor_contrato: acesso total a obras e obra_funcionarios
--    (garante que o sistema antigo com get_user_role = 'admin' ainda funciona)
DROP POLICY IF EXISTS "gestor_contrato_obras_all" ON public.obras;
CREATE POLICY "gestor_contrato_obras_all"
ON public.obras FOR ALL
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR public.is_gestor_contrato()
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR public.is_gestor_contrato()
);

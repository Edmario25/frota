-- =====================================================================
-- RLS: permite que qualquer usuário autenticado leia obras
-- Necessário para o App Apontador de Campo acessar obra_funcionarios → obras
-- =====================================================================

-- 1. Garante que a tabela tem RLS ativado
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;

-- 2. Policy de leitura para todos os autenticados
DROP POLICY IF EXISTS "obras_select_authenticated" ON public.obras;
CREATE POLICY "obras_select_authenticated"
  ON public.obras
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. obra_funcionarios: usuário pode ver suas próprias alocações
ALTER TABLE public.obra_funcionarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obra_funcionarios_select_own" ON public.obra_funcionarios;
CREATE POLICY "obra_funcionarios_select_own"
  ON public.obra_funcionarios
  FOR SELECT
  TO authenticated
  USING (
    -- Admin/supervisor vê tudo
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'supervisor')
    )
    OR
    -- Apontador vê só as suas
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

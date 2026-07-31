-- Segunda migração: Atualizar políticas RLS com controle de acesso refinado

-- Remover políticas antigas de obras
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores de obra podem ver suas obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores de obra podem editar suas obras" ON public.obras;
DROP POLICY IF EXISTS "Colaboradores nao podem acessar obras" ON public.obras;
DROP POLICY IF EXISTS "Apenas gestores gerais podem criar obras" ON public.obras;

-- Novas políticas para obras com controle de acesso refinado

-- 1. Gestores Gerais (admin) - acesso total
DROP POLICY IF EXISTS "Gestores gerais acessam todas obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores gerais acessam todas obras" ON public.obras;
CREATE POLICY "Gestores gerais acessam todas obras"
ON public.obras FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

-- 2. Gestores de Obra - apenas obras onde são responsáveis técnicos
DROP POLICY IF EXISTS "Gestores obra veem suas obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores obra veem suas obras" ON public.obras;
CREATE POLICY "Gestores obra veem suas obras"
ON public.obras FOR SELECT 
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  (responsavel_tecnico_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  ) OR responsavel_tecnico_id IS NULL) -- Permite ver obras sem responsável para poder assumir
);

DROP POLICY IF EXISTS "Gestores obra editam suas obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores obra editam suas obras" ON public.obras;
CREATE POLICY "Gestores obra editam suas obras"
ON public.obras FOR UPDATE 
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  responsavel_tecnico_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role])
);

-- 3. Colaboradores não acessam gestão de obras
-- (eles poderão ver informações limitadas via outras consultas)

-- Remover políticas antigas de vinculações
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Gestores de obra podem gerenciar vinculações de suas obras" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Colaboradores podem ver apenas suas vinculações" ON public.obra_funcionarios;

-- Novas políticas para obra_funcionarios
DROP POLICY IF EXISTS "Admin gerencia vinculações funcionarios" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Admin gerencia vinculações funcionarios" ON public.obra_funcionarios;
CREATE POLICY "Admin gerencia vinculações funcionarios"
ON public.obra_funcionarios FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Gestor obra gerencia vinculações suas obras" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Gestor obra gerencia vinculações suas obras" ON public.obra_funcionarios;
CREATE POLICY "Gestor obra gerencia vinculações suas obras"
ON public.obra_funcionarios FOR ALL 
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  obra_id IN (
    SELECT id FROM obras WHERE responsavel_tecnico_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  obra_id IN (
    SELECT id FROM obras WHERE responsavel_tecnico_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Funcionario ve suas vinculações" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Funcionario ve suas vinculações" ON public.obra_funcionarios;
CREATE POLICY "Funcionario ve suas vinculações"
ON public.obra_funcionarios FOR SELECT 
USING (
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

-- Remover políticas antigas de obra_veiculos  
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações de veículos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Gestores de obra podem gerenciar veículos de suas obras" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Colaboradores podem ver veículos das obras onde trabalham" ON public.obra_veiculos;

-- Novas políticas para obra_veiculos
DROP POLICY IF EXISTS "Admin gerencia vinculações veiculos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Admin gerencia vinculações veiculos" ON public.obra_veiculos;
CREATE POLICY "Admin gerencia vinculações veiculos"
ON public.obra_veiculos FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Gestor obra gerencia veiculos suas obras" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Gestor obra gerencia veiculos suas obras" ON public.obra_veiculos;
CREATE POLICY "Gestor obra gerencia veiculos suas obras"
ON public.obra_veiculos FOR ALL 
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  obra_id IN (
    SELECT id FROM obras WHERE responsavel_tecnico_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  obra_id IN (
    SELECT id FROM obras WHERE responsavel_tecnico_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Funcionario ve veiculos suas obras" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Funcionario ve veiculos suas obras" ON public.obra_veiculos;
CREATE POLICY "Funcionario ve veiculos suas obras"
ON public.obra_veiculos FOR SELECT 
USING (
  obra_id IN (
    SELECT obra_id FROM obra_funcionarios 
    WHERE employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    ) AND status = true
  )
);

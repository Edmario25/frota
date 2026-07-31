-- Ajustar enum de roles para incluir gestor de obra específico
ALTER TYPE app_role ADD VALUE 'gestor_obra';

-- Modificar tabela obras para usar FK para responsável técnico
ALTER TABLE public.obras 
ADD COLUMN responsavel_tecnico_id UUID REFERENCES public.employees(id);

-- Migrar dados existentes (responsavel_tecnico texto -> responsavel_tecnico_id FK)
-- Por enquanto mantemos os dois campos para compatibilidade

-- Atualizar políticas RLS para obras com controle de acesso refinado

-- Remover políticas antigas
DROP POLICY IF EXISTS "Todos podem visualizar obras" ON public.obras;
DROP POLICY IF EXISTS "Admins e gestores podem gerenciar obras" ON public.obras;
DROP POLICY IF EXISTS "Todos podem criar obras" ON public.obras;

-- Novas políticas para controle de acesso às obras

-- 1. Gestores Gerais (admin) - acesso total
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as obras" ON public.obras;
CREATE POLICY "Gestores gerais podem gerenciar todas as obras"
ON public.obras FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

-- 2. Gestores de Obra - apenas obras onde são responsáveis técnicos
DROP POLICY IF EXISTS "Gestores de obra podem ver suas obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores de obra podem ver suas obras" ON public.obras;
CREATE POLICY "Gestores de obra podem ver suas obras"
ON public.obras FOR SELECT 
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  responsavel_tecnico_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Gestores de obra podem editar suas obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores de obra podem editar suas obras" ON public.obras;
CREATE POLICY "Gestores de obra podem editar suas obras"
ON public.obras FOR UPDATE 
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  responsavel_tecnico_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  responsavel_tecnico_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

-- 3. Colaboradores não acessam obras diretamente
DROP POLICY IF EXISTS "Colaboradores nao podem acessar obras" ON public.obras;
DROP POLICY IF EXISTS "Colaboradores nao podem acessar obras" ON public.obras;
CREATE POLICY "Colaboradores nao podem acessar obras"
ON public.obras FOR SELECT 
USING (
  get_user_role(auth.uid()) != 'funcionario'::app_role
);

-- 4. Apenas admins podem criar obras
DROP POLICY IF EXISTS "Apenas gestores gerais podem criar obras" ON public.obras;
DROP POLICY IF EXISTS "Apenas gestores gerais podem criar obras" ON public.obras;
CREATE POLICY "Apenas gestores gerais podem criar obras"
ON public.obras FOR INSERT 
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

-- Atualizar políticas de vinculações de funcionários

-- Remover políticas antigas de obra_funcionarios
DROP POLICY IF EXISTS "Todos podem visualizar vinculações de funcionários" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Admins e gestores podem gerenciar vinculações de funcionários" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Todos podem criar vinculações de funcionários" ON public.obra_funcionarios;

-- Novas políticas para obra_funcionarios
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações" ON public.obra_funcionarios;
CREATE POLICY "Gestores gerais podem gerenciar todas as vinculações"
ON public.obra_funcionarios FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Gestores de obra podem gerenciar vinculações de suas obras" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Gestores de obra podem gerenciar vinculações de suas obras" ON public.obra_funcionarios;
CREATE POLICY "Gestores de obra podem gerenciar vinculações de suas obras"
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

DROP POLICY IF EXISTS "Colaboradores podem ver apenas suas vinculações" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "Colaboradores podem ver apenas suas vinculações" ON public.obra_funcionarios;
CREATE POLICY "Colaboradores podem ver apenas suas vinculações"
ON public.obra_funcionarios FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'funcionario'::app_role AND
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

-- Atualizar políticas de vinculações de veículos

-- Remover políticas antigas de obra_veiculos
DROP POLICY IF EXISTS "Todos podem visualizar vinculações de veículos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Admins e gestores podem gerenciar vinculações de veículos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Todos podem criar vinculações de veículos" ON public.obra_veiculos;

-- Novas políticas para obra_veiculos
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações de veículos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações de veículos" ON public.obra_veiculos;
CREATE POLICY "Gestores gerais podem gerenciar todas as vinculações de veículos"
ON public.obra_veiculos FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Gestores de obra podem gerenciar veículos de suas obras" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Gestores de obra podem gerenciar veículos de suas obras" ON public.obra_veiculos;
CREATE POLICY "Gestores de obra podem gerenciar veículos de suas obras"
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

DROP POLICY IF EXISTS "Colaboradores podem ver veículos das obras onde trabalham" ON public.obra_veiculos;
DROP POLICY IF EXISTS "Colaboradores podem ver veículos das obras onde trabalham" ON public.obra_veiculos;
CREATE POLICY "Colaboradores podem ver veículos das obras onde trabalham"
ON public.obra_veiculos FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'funcionario'::app_role AND
  obra_id IN (
    SELECT obra_id FROM obra_funcionarios 
    WHERE employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    ) AND status = true
  )
);

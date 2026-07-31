-- Criar tabelas para cargos e departamentos
CREATE TABLE public.cargos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  nivel_hierarquico INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.departamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar trigger para updated_at
CREATE TRIGGER update_cargos_updated_at
  BEFORE UPDATE ON public.cargos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_departamentos_updated_at
  BEFORE UPDATE ON public.departamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Modificar tabela employees para usar referencias e adicionar tipo de acesso
ALTER TABLE public.employees 
ADD COLUMN cargo_id UUID,
ADD COLUMN departamento_id UUID,
ADD COLUMN tipo_acesso TEXT DEFAULT 'colaborador' CHECK (tipo_acesso IN ('admin', 'colaborador'));

-- Adicionar foreign keys
ALTER TABLE public.employees 
ADD CONSTRAINT fk_employees_cargo 
FOREIGN KEY (cargo_id) REFERENCES public.cargos(id);

ALTER TABLE public.employees 
ADD CONSTRAINT fk_employees_departamento 
FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id);

ALTER TABLE public.departamentos 
ADD CONSTRAINT fk_departamentos_responsavel 
FOREIGN KEY (responsavel_id) REFERENCES public.employees(id);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para cargos
DROP POLICY IF EXISTS "All authenticated users can view cargos" ON public.cargos;
DROP POLICY IF EXISTS "All authenticated users can view cargos" ON public.cargos;
CREATE POLICY "All authenticated users can view cargos"
ON public.cargos FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Admins and gestors can manage cargos" ON public.cargos;
DROP POLICY IF EXISTS "Admins and gestors can manage cargos" ON public.cargos;
CREATE POLICY "Admins and gestors can manage cargos"
ON public.cargos FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Políticas RLS para departamentos
DROP POLICY IF EXISTS "All authenticated users can view departamentos" ON public.departamentos;
DROP POLICY IF EXISTS "All authenticated users can view departamentos" ON public.departamentos;
CREATE POLICY "All authenticated users can view departamentos"
ON public.departamentos FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Admins and gestors can manage departamentos" ON public.departamentos;
DROP POLICY IF EXISTS "Admins and gestors can manage departamentos" ON public.departamentos;
CREATE POLICY "Admins and gestors can manage departamentos"
ON public.departamentos FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Inserir alguns cargos e departamentos padrão
INSERT INTO public.cargos (nome, descricao, nivel_hierarquico) VALUES 
('Analista', 'Analista Jr/Pl/Sr', 1),
('Coordenador', 'Coordenador de equipe', 2),
('Gerente', 'Gerente de área', 3),
('Diretor', 'Diretor executivo', 4),
('Motorista', 'Motorista profissional', 1),
('Assistente', 'Assistente administrativo', 1);

INSERT INTO public.departamentos (nome, descricao) VALUES 
('Recursos Humanos', 'Departamento de gestão de pessoas'),
('Financeiro', 'Departamento financeiro e contábil'),
('Operações', 'Departamento operacional'),
('Tecnologia', 'Departamento de TI e sistemas'),
('Frota', 'Gestão de frota e veículos'),
('Administrativo', 'Departamento administrativo geral');

-- Criar tabela de tipos de escala (ex: 20x7, 14x14, etc.)
CREATE TABLE public.escala_tipos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  dias_trabalho INTEGER NOT NULL,
  dias_folga INTEGER NOT NULL,
  permite_sobreposicao BOOLEAN NOT NULL DEFAULT false,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar coluna de escala na tabela employees
ALTER TABLE public.employees 
ADD COLUMN escala_tipo_id UUID REFERENCES public.escala_tipos(id);

-- Criar tabela de períodos de escala (para controlar folgas agendadas)
CREATE TABLE public.escala_periodos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  escala_tipo_id UUID NOT NULL REFERENCES public.escala_tipos(id),
  data_inicio_trabalho DATE NOT NULL,
  data_fim_trabalho DATE NOT NULL,
  data_inicio_folga DATE NOT NULL,
  data_fim_folga DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado',
  conflito_detectado BOOLEAN DEFAULT false,
  conflito_autorizado BOOLEAN DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.escala_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_periodos ENABLE ROW LEVEL SECURITY;

-- Policies for escala_tipos
DROP POLICY IF EXISTS "Admins and gestors can manage escala_tipos" ON public.escala_tipos;
DROP POLICY IF EXISTS "Admins and gestors can manage escala_tipos" ON public.escala_tipos;
CREATE POLICY "Admins and gestors can manage escala_tipos"
ON public.escala_tipos
FOR ALL
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "All authenticated users can view escala_tipos" ON public.escala_tipos;
DROP POLICY IF EXISTS "All authenticated users can view escala_tipos" ON public.escala_tipos;
CREATE POLICY "All authenticated users can view escala_tipos"
ON public.escala_tipos
FOR SELECT
USING (true);

-- Policies for escala_periodos
DROP POLICY IF EXISTS "Admins and gestors can manage escala_periodos" ON public.escala_periodos;
DROP POLICY IF EXISTS "Admins and gestors can manage escala_periodos" ON public.escala_periodos;
CREATE POLICY "Admins and gestors can manage escala_periodos"
ON public.escala_periodos
FOR ALL
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Employees can view their own escala_periodos" ON public.escala_periodos;
DROP POLICY IF EXISTS "Employees can view their own escala_periodos" ON public.escala_periodos;
CREATE POLICY "Employees can view their own escala_periodos"
ON public.escala_periodos
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Gestor obra can manage escala for their employees" ON public.escala_periodos;
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

-- Trigger to update updated_at
CREATE TRIGGER update_escala_tipos_updated_at
BEFORE UPDATE ON public.escala_tipos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_escala_periodos_updated_at
BEFORE UPDATE ON public.escala_periodos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

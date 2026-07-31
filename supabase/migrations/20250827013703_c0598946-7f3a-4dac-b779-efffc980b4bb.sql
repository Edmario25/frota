-- Criar tabela para checklists de veículos pesados
CREATE TABLE public.heavy_vehicle_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  data_inspecao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  inspetor_nome TEXT NOT NULL,
  inspetor_funcao TEXT NOT NULL,
  km_atual INTEGER,
  observacoes_gerais TEXT,
  status_geral TEXT NOT NULL DEFAULT 'pendente',
  assinatura_inspetor TEXT,
  assinatura_responsavel TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.heavy_vehicle_inspections ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Admins and gestors can manage heavy vehicle inspections" ON public.heavy_vehicle_inspections;
DROP POLICY IF EXISTS "Admins and gestors can manage heavy vehicle inspections" ON public.heavy_vehicle_inspections;
CREATE POLICY "Admins and gestors can manage heavy vehicle inspections"
ON public.heavy_vehicle_inspections 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "All authenticated users can create heavy vehicle inspections" ON public.heavy_vehicle_inspections;
DROP POLICY IF EXISTS "All authenticated users can create heavy vehicle inspections" ON public.heavy_vehicle_inspections;
CREATE POLICY "All authenticated users can create heavy vehicle inspections"
ON public.heavy_vehicle_inspections 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can view heavy vehicle inspections" ON public.heavy_vehicle_inspections;
DROP POLICY IF EXISTS "All authenticated users can view heavy vehicle inspections" ON public.heavy_vehicle_inspections;
CREATE POLICY "All authenticated users can view heavy vehicle inspections"
ON public.heavy_vehicle_inspections 
FOR SELECT 
USING (true);

-- Criar tabela para itens de inspeção de veículos pesados
CREATE TABLE public.heavy_vehicle_inspection_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID NOT NULL,
  categoria TEXT NOT NULL,
  item_nome TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('C', 'NC', 'NA')), -- Conforme, Não Conforme, Não Aplicável
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS para itens
ALTER TABLE public.heavy_vehicle_inspection_items ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para itens
DROP POLICY IF EXISTS "Admins and gestors can manage heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
DROP POLICY IF EXISTS "Admins and gestors can manage heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
CREATE POLICY "Admins and gestors can manage heavy vehicle inspection items"
ON public.heavy_vehicle_inspection_items 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "All authenticated users can create heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
DROP POLICY IF EXISTS "All authenticated users can create heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
CREATE POLICY "All authenticated users can create heavy vehicle inspection items"
ON public.heavy_vehicle_inspection_items 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can view heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
DROP POLICY IF EXISTS "All authenticated users can view heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
CREATE POLICY "All authenticated users can view heavy vehicle inspection items"
ON public.heavy_vehicle_inspection_items 
FOR SELECT 
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_heavy_vehicle_inspections_updated_at
BEFORE UPDATE ON public.heavy_vehicle_inspections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

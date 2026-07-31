-- Criar tabelas para sistema de manutenção e controles adicionais

-- Tabela para checklists de inspeção
CREATE TABLE public.inspection_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  tipo_servico TEXT NOT NULL CHECK (tipo_servico IN ('entrada', 'saida')),
  data_inspecao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  km_atual INTEGER,
  responsavel_checklist TEXT,
  funcao TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para itens do checklist
CREATE TABLE public.inspection_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES public.inspection_checklists(id) ON DELETE CASCADE,
  item_nome TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('conforme', 'nao_conforme', 'nao_aplicavel')),
  observacoes TEXT,
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para registros de lavagem
CREATE TABLE public.wash_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  data_lavagem DATE NOT NULL,
  tipo_lavagem TEXT NOT NULL CHECK (tipo_lavagem IN ('interna', 'externa', 'completa')),
  responsavel_lavagem TEXT,
  foto_antes_url TEXT,
  foto_depois_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para controle de avarias
CREATE TABLE public.damage_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  data_avaria TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  local_ocorrencia TEXT,
  descricao_avaria TEXT NOT NULL,
  responsavel_registro TEXT,
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para acessórios e segurança
CREATE TABLE public.vehicle_accessories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  data_instalacao DATE,
  tipo_acessorio TEXT NOT NULL CHECK (tipo_acessorio IN ('pelicula', 'substituicao_vidros', 'rastreadores', 'alarme_antifurto')),
  fornecedor_empresa TEXT,
  foto_comprovante_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para controle de pneus/borracharia
CREATE TABLE public.tire_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  data_servico DATE NOT NULL,
  tipo_servico TEXT NOT NULL CHECK (tipo_servico IN ('calibragem', 'troca_pneu', 'reparo', 'rodizio')),
  quantidade_pneus INTEGER,
  local_servico TEXT,
  responsavel TEXT,
  foto_pneus_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para multas
CREATE TABLE public.traffic_fines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  employee_id UUID,
  data_multa DATE NOT NULL,
  local_infracao TEXT NOT NULL,
  tipo_infracao TEXT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'paga', 'contestada')),
  comprovante_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para score do motorista
CREATE TABLE public.driver_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  data_avaliacao DATE NOT NULL,
  pontuacao INTEGER NOT NULL CHECK (pontuacao >= 0 AND pontuacao <= 10),
  justificativa TEXT,
  comentarios TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.inspection_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wash_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tire_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_scores ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para inspection_checklists
DROP POLICY IF EXISTS "All authenticated users can view inspection checklists" ON public.inspection_checklists;
DROP POLICY IF EXISTS "All authenticated users can view inspection checklists" ON public.inspection_checklists;
CREATE POLICY "All authenticated users can view inspection checklists"
ON public.inspection_checklists 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can create inspection checklists" ON public.inspection_checklists;
DROP POLICY IF EXISTS "All authenticated users can create inspection checklists" ON public.inspection_checklists;
CREATE POLICY "All authenticated users can create inspection checklists"
ON public.inspection_checklists 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and gestors can manage inspection checklists" ON public.inspection_checklists;
DROP POLICY IF EXISTS "Admins and gestors can manage inspection checklists" ON public.inspection_checklists;
CREATE POLICY "Admins and gestors can manage inspection checklists"
ON public.inspection_checklists 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Políticas RLS para inspection_items
DROP POLICY IF EXISTS "All authenticated users can view inspection items" ON public.inspection_items;
DROP POLICY IF EXISTS "All authenticated users can view inspection items" ON public.inspection_items;
CREATE POLICY "All authenticated users can view inspection items"
ON public.inspection_items 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can create inspection items" ON public.inspection_items;
DROP POLICY IF EXISTS "All authenticated users can create inspection items" ON public.inspection_items;
CREATE POLICY "All authenticated users can create inspection items"
ON public.inspection_items 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and gestors can manage inspection items" ON public.inspection_items;
DROP POLICY IF EXISTS "Admins and gestors can manage inspection items" ON public.inspection_items;
CREATE POLICY "Admins and gestors can manage inspection items"
ON public.inspection_items 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Políticas similares para as outras tabelas
CREATE POLICY "All authenticated users can view wash records" ON public.wash_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "All authenticated users can create wash records" ON public.wash_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins and gestors can manage wash records" ON public.wash_records FOR ALL TO authenticated USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

CREATE POLICY "All authenticated users can view damage reports" ON public.damage_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "All authenticated users can create damage reports" ON public.damage_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins and gestors can manage damage reports" ON public.damage_reports FOR ALL TO authenticated USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

CREATE POLICY "All authenticated users can view vehicle accessories" ON public.vehicle_accessories FOR SELECT TO authenticated USING (true);
CREATE POLICY "All authenticated users can create vehicle accessories" ON public.vehicle_accessories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins and gestors can manage vehicle accessories" ON public.vehicle_accessories FOR ALL TO authenticated USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

CREATE POLICY "All authenticated users can view tire services" ON public.tire_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "All authenticated users can create tire services" ON public.tire_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins and gestors can manage tire services" ON public.tire_services FOR ALL TO authenticated USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

CREATE POLICY "All authenticated users can view traffic fines" ON public.traffic_fines FOR SELECT TO authenticated USING (true);
CREATE POLICY "All authenticated users can create traffic fines" ON public.traffic_fines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins and gestors can manage traffic fines" ON public.traffic_fines FOR ALL TO authenticated USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

CREATE POLICY "All authenticated users can view driver scores" ON public.driver_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "All authenticated users can create driver scores" ON public.driver_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins and gestors can manage driver scores" ON public.driver_scores FOR ALL TO authenticated USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Triggers para atualizar updated_at
CREATE TRIGGER update_inspection_checklists_updated_at BEFORE UPDATE ON public.inspection_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wash_records_updated_at BEFORE UPDATE ON public.wash_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_damage_reports_updated_at BEFORE UPDATE ON public.damage_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicle_accessories_updated_at BEFORE UPDATE ON public.vehicle_accessories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tire_services_updated_at BEFORE UPDATE ON public.tire_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_traffic_fines_updated_at BEFORE UPDATE ON public.traffic_fines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_driver_scores_updated_at BEFORE UPDATE ON public.driver_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

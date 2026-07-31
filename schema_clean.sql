-- ============================================================
-- SCHEMA LIMPO - FROTA
-- Gerado a partir do schema final do Supabase Cloud
-- ============================================================

-- 1. RESET
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- 2. ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor_frota', 'gestor_obra', 'funcionario');
CREATE TYPE public.employee_status AS ENUM ('ativo', 'inativo', 'ferias', 'licenca');
CREATE TYPE public.vehicle_type AS ENUM ('compacto', 'suv', 'caminhonete', 'sedan');
CREATE TYPE public.vehicle_status AS ENUM ('disponivel', 'em_uso', 'manutencao', 'inativo');
CREATE TYPE public.ownership_type AS ENUM ('proprio', 'alugado');
CREATE TYPE public.maintenance_type AS ENUM ('preventiva', 'corretiva', 'emergencial');
CREATE TYPE public.maintenance_status AS ENUM ('agendada', 'em_andamento', 'concluida', 'cancelada');
CREATE TYPE public.obra_status AS ENUM ('planejada', 'em_andamento', 'pausada', 'concluida', 'cancelada');
CREATE TYPE public.vinculo_veiculo_tipo AS ENUM ('exclusivo', 'compartilhado');

-- 3. TABELAS (ordem de dependência)

CREATE TABLE public.cargos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  nivel_hierarquico integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cargos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rental_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text UNIQUE,
  telefone text,
  email text,
  endereco text,
  contato_responsavel text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_companies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.escala_tipos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  dias_trabalho integer NOT NULL,
  dias_folga integer NOT NULL,
  permite_sobreposicao boolean NOT NULL DEFAULT false,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escala_tipos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fornecedores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  cpf text,
  telefone text,
  email text,
  endereco text,
  cidade text,
  estado text,
  tipo_fornecedor text NOT NULL DEFAULT 'geral' CHECK (tipo_fornecedor = ANY (ARRAY['materiais','servicos','equipamentos','combustivel','pecas','geral'])),
  categoria text,
  observacoes text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fornecedores_pkey PRIMARY KEY (id)
);

-- employees sem FK de departamento (resolvido depois)
CREATE TABLE public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  nome text NOT NULL,
  cpf text NOT NULL UNIQUE,
  telefone text,
  email text NOT NULL,
  foto_url text,
  status public.employee_status NOT NULL DEFAULT 'ativo',
  data_admissao date,
  cargo_id uuid REFERENCES public.cargos(id),
  departamento_id uuid, -- FK adicionada após criação de departamentos
  escala_tipo_id uuid REFERENCES public.escala_tipos(id),
  tipo_acesso text DEFAULT 'colaborador' CHECK (tipo_acesso = ANY (ARRAY['gestor_geral','gestor_obra','colaborador'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_pkey PRIMARY KEY (id)
);

CREATE TABLE public.departamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  responsavel_id uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departamentos_pkey PRIMARY KEY (id)
);

-- Agora adicionar FK de employees → departamentos
ALTER TABLE public.employees
  ADD CONSTRAINT fk_employees_departamento FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id);

CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text,
  foto_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
  -- FK para auth.users omitida (removida pelas migrations para gestão pela aplicação)
);

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role public.app_role NOT NULL DEFAULT 'funcionario',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);

CREATE TABLE public.vehicles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placa text NOT NULL UNIQUE,
  modelo text NOT NULL,
  marca text NOT NULL,
  ano integer NOT NULL,
  cor text,
  tipo public.vehicle_type NOT NULL,
  status public.vehicle_status NOT NULL DEFAULT 'disponivel',
  quilometragem_atual integer NOT NULL DEFAULT 0,
  quilometragem_maxima_mensal integer DEFAULT 2000,
  data_ultima_revisao date,
  responsavel_id uuid REFERENCES public.employees(id),
  observacoes text,
  tipo_propriedade public.ownership_type DEFAULT 'proprio',
  rental_company_id uuid REFERENCES public.rental_companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.obras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo_interno text,
  endereco text,
  cidade text,
  estado text,
  coordenadas_gps text,
  cliente_nome text NOT NULL,
  cliente_cnpj text,
  data_inicio_prevista date,
  data_termino_prevista date,
  status public.obra_status NOT NULL DEFAULT 'planejada',
  responsavel_tecnico text,
  responsavel_tecnico_id uuid REFERENCES public.employees(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obras_pkey PRIMARY KEY (id)
);

CREATE TABLE public.vehicle_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  tipo_documento text NOT NULL,
  nome_arquivo text NOT NULL,
  url_arquivo text NOT NULL,
  data_vencimento date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_documents_pkey PRIMARY KEY (id)
);

CREATE TABLE public.vehicle_km_cycles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  cycle_start_date date NOT NULL,
  cycle_end_date date NOT NULL,
  km_inicial integer NOT NULL,
  km_final integer,
  limite_km_mensal integer NOT NULL,
  km_rodados integer DEFAULT 0,
  status text DEFAULT 'ativo' CHECK (status = ANY (ARRAY['ativo','fechado'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_km_cycles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.vehicle_accessories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  data_instalacao date,
  tipo_acessorio text NOT NULL CHECK (
    (tipo_acessorio = ANY (ARRAY['Película (Insulfilm)','Substituição de Vidros','Rastreadores','Alarme/Anti-furto']))
    OR POSITION(',' IN tipo_acessorio) > 0
  ),
  fornecedor_empresa text,
  foto_comprovante_url text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_accessories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.maintenance_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  tipo public.maintenance_type NOT NULL,
  status public.maintenance_status NOT NULL DEFAULT 'agendada',
  data_agendada date NOT NULL,
  data_realizada date,
  quilometragem integer,
  descricao text NOT NULL,
  custo numeric,
  oficina text,
  responsavel text,
  observacoes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_records_pkey PRIMARY KEY (id)
);

CREATE TABLE public.mileage_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  quilometragem_inicial integer NOT NULL,
  quilometragem_final integer,
  data_inicial timestamptz NOT NULL DEFAULT now(),
  data_final timestamptz,
  destino text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mileage_records_pkey PRIMARY KEY (id)
);

CREATE TABLE public.schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  data_inicio timestamptz NOT NULL,
  data_fim timestamptz NOT NULL,
  local_trabalho text,
  descricao text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedules_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inspection_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  tipo_servico text NOT NULL CHECK (tipo_servico = ANY (ARRAY['entrada','saida','diario','semanal','mensal'])),
  data_inspecao timestamptz NOT NULL DEFAULT now(),
  km_atual integer,
  responsavel_checklist text,
  funcao text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_checklists_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inspection_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.inspection_checklists(id),
  item_nome text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['conforme','nao_conforme','nao_aplicavel'])),
  observacoes text,
  foto_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.damage_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  data_avaria timestamptz NOT NULL DEFAULT now(),
  local_ocorrencia text,
  descricao_avaria text NOT NULL,
  responsavel_registro text,
  foto_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT damage_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE public.wash_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  data_lavagem date NOT NULL,
  tipo_lavagem text NOT NULL CHECK (tipo_lavagem = ANY (ARRAY['interna','externa','completa'])),
  responsavel_lavagem text,
  foto_antes_url text,
  foto_depois_url text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wash_records_pkey PRIMARY KEY (id)
);

CREATE TABLE public.driver_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  data_avaliacao date NOT NULL,
  pontuacao integer NOT NULL CHECK (pontuacao >= 0 AND pontuacao <= 10),
  justificativa text,
  comentarios text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_scores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tire_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  data_servico date NOT NULL,
  tipo_servico text NOT NULL CHECK (tipo_servico = ANY (ARRAY['calibragem','troca_pneu','reparo','rodizio'])),
  quantidade_pneus integer,
  local_servico text,
  responsavel text,
  foto_pneus_url text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tire_services_pkey PRIMARY KEY (id)
);

CREATE TABLE public.traffic_fines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  employee_id uuid,
  data_multa date NOT NULL,
  local_infracao text NOT NULL,
  tipo_infracao text NOT NULL,
  valor numeric NOT NULL,
  situacao text NOT NULL DEFAULT 'pendente' CHECK (situacao = ANY (ARRAY['pendente','paga','contestada'])),
  comprovante_url text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT traffic_fines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.smoke_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  condutor text NOT NULL,
  obra text,
  responsavel_elaboracao text NOT NULL,
  cargo text NOT NULL,
  ano_fabricacao integer NOT NULL,
  data_afericao date NOT NULL,
  resultado text NOT NULL CHECK (resultado = ANY (ARRAY['aprovado','reprovado'])),
  observacoes text,
  motor_tipo text,
  quilometragem_atual integer,
  data_hora_teste timestamptz DEFAULT now(),
  distancia_observador integer,
  indice_ringelmann integer CHECK (indice_ringelmann >= 1 AND indice_ringelmann <= 5),
  densidade_percentual integer,
  dentro_limite boolean,
  evidencias_url text,
  condicoes_teste text DEFAULT 'Veículo em movimento com carga no motor, fumaça contínua por no mínimo 5 segundos',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT smoke_tests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.heavy_vehicle_inspections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  data_inspecao timestamptz NOT NULL DEFAULT now(),
  inspetor_nome text NOT NULL,
  inspetor_funcao text NOT NULL,
  km_atual integer,
  observacoes_gerais text,
  status_geral text NOT NULL DEFAULT 'pendente',
  assinatura_inspetor text,
  assinatura_responsavel text,
  fotos_checklist text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT heavy_vehicle_inspections_pkey PRIMARY KEY (id)
);

CREATE TABLE public.heavy_vehicle_inspection_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.heavy_vehicle_inspections(id),
  categoria text NOT NULL,
  item_nome text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['C','NC','NA'])),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT heavy_vehicle_inspection_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.obra_funcionarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  funcao_obra text NOT NULL,
  data_entrada date NOT NULL DEFAULT CURRENT_DATE,
  data_saida date,
  status boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obra_funcionarios_pkey PRIMARY KEY (id)
);

CREATE TABLE public.obra_veiculos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  tipo_vinculo public.vinculo_veiculo_tipo NOT NULL DEFAULT 'compartilhado',
  responsavel_id uuid REFERENCES public.employees(id),
  data_entrada date NOT NULL DEFAULT CURRENT_DATE,
  data_saida date,
  status boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obra_veiculos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.obra_fornecedores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_fim date,
  tipo_contrato text,
  valor_contrato numeric,
  status boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obra_fornecedores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.escala_periodos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  escala_tipo_id uuid NOT NULL REFERENCES public.escala_tipos(id),
  data_inicio_trabalho date NOT NULL,
  data_fim_trabalho date NOT NULL,
  data_inicio_folga date NOT NULL,
  data_fim_folga date NOT NULL,
  status text NOT NULL DEFAULT 'agendado',
  conflito_detectado boolean DEFAULT false,
  conflito_autorizado boolean DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escala_periodos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_logs_pkey PRIMARY KEY (id)
);

-- 4. DADOS PADRÃO
INSERT INTO public.cargos (nome, descricao, nivel_hierarquico) VALUES
  ('Motorista', 'Motorista de veículos leves e pesados', 1),
  ('Operador', 'Operador de equipamentos', 1),
  ('Encarregado', 'Encarregado de equipe', 2),
  ('Supervisor', 'Supervisor de operações', 3),
  ('Gerente', 'Gerente de área', 4);

INSERT INTO public.escala_tipos (nome, dias_trabalho, dias_folga, permite_sobreposicao, descricao) VALUES
  ('20x7',  20, 7,  false, 'Trabalha 20 dias e folga 7 dias'),
  ('14x14', 14, 14, false, 'Trabalha 14 dias e folga 14 dias'),
  ('12x36', 1,  2,  false, 'Trabalha 12h e folga 36h (1 dia trabalho / 2 dias folga)'),
  ('5x2',   5,  2,  false, 'Segunda a sexta com folga no fim de semana');

-- 5. RLS - HABILITAR
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_km_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mileage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wash_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tire_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smoke_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heavy_vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heavy_vehicle_inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- 6. FUNÇÕES

-- get_user_role deve ser criada primeiro pois outras funções dependem dela
DROP FUNCTION IF EXISTS public.get_user_role CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID DEFAULT auth.uid())
RETURNS app_role
LANGUAGE SQL
SECURITY DEFINER
STABLE SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid ORDER BY created_at DESC LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.can_manage_employee CASCADE;
CREATE OR REPLACE FUNCTION public.can_manage_employee(employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN get_user_role(auth.uid()) = 'admin'::app_role THEN true
      -- Fleet managers can only manage employees in the same department
      WHEN get_user_role(auth.uid()) = 'gestor_frota'::app_role THEN
        EXISTS (
          SELECT 1 FROM employees e1, employees e2
          WHERE e1.user_id = auth.uid() 
            AND e2.id = employee_id
            AND e1.departamento_id = e2.departamento_id
            AND e1.departamento_id IS NOT NULL
        )
      ELSE false
    END;
$$;

DROP FUNCTION IF EXISTS public.close_expired_km_cycles CASCADE;
CREATE OR REPLACE FUNCTION close_expired_km_cycles()
RETURNS INTEGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  closed_count INTEGER := 0;
BEGIN
  UPDATE vehicle_km_cycles 
  SET status = 'fechado',
      km_final = km_inicial + km_rodados,
      updated_at = now()
  WHERE status = 'ativo' 
    AND cycle_end_date < CURRENT_DATE;
    
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

DROP FUNCTION IF EXISTS public.get_current_km_cycle CASCADE;
CREATE OR REPLACE FUNCTION get_current_km_cycle(p_vehicle_id UUID)
RETURNS TABLE(
  cycle_id UUID,
  cycle_start_date DATE,
  cycle_end_date DATE,
  km_inicial INTEGER,
  limite_km_mensal INTEGER,
  km_rodados INTEGER,
  days_remaining INTEGER,
  percentage_used NUMERIC
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_created_date DATE;
  v_current_km INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_cycle_record RECORD;
BEGIN
  -- Get vehicle creation date and current km
  SELECT created_at::DATE, quilometragem_atual 
  INTO v_created_date, v_current_km
  FROM vehicles 
  WHERE id = p_vehicle_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate current cycle dates based on vehicle creation date
  -- Find which month cycle we're in
  SELECT 
    v_created_date + (EXTRACT(YEAR FROM AGE(v_current_date, v_created_date)) * 12 + 
                     EXTRACT(MONTH FROM AGE(v_current_date, v_created_date)))::INTEGER * INTERVAL '1 month',
    v_created_date + (EXTRACT(YEAR FROM AGE(v_current_date, v_created_date)) * 12 + 
                     EXTRACT(MONTH FROM AGE(v_current_date, v_created_date)) + 1)::INTEGER * INTERVAL '1 month' - INTERVAL '1 day'
  INTO v_cycle_start, v_cycle_end;
  
  -- Get or create current cycle
  SELECT * INTO v_cycle_record
  FROM vehicle_km_cycles
  WHERE vehicle_id = p_vehicle_id 
    AND cycle_start_date = v_cycle_start
    AND status = 'ativo';
    
  IF NOT FOUND THEN
    -- Get previous cycle's final km or use vehicle's initial km
    DECLARE
      v_previous_km INTEGER := 0;
      v_limit INTEGER := 2000;
    BEGIN
      -- Get limit from vehicle
      SELECT quilometragem_maxima_mensal INTO v_limit 
      FROM vehicles WHERE id = p_vehicle_id;
      
      -- Get previous cycle final km
      SELECT COALESCE(km_final, km_inicial) INTO v_previous_km
      FROM vehicle_km_cycles 
      WHERE vehicle_id = p_vehicle_id 
        AND cycle_end_date < v_cycle_start 
      ORDER BY cycle_end_date DESC 
      LIMIT 1;
      
      IF v_previous_km IS NULL THEN
        -- First cycle, use vehicle's creation km
        SELECT quilometragem_atual INTO v_previous_km 
        FROM vehicles 
        WHERE id = p_vehicle_id;
      END IF;
      
      -- Create new cycle
      INSERT INTO vehicle_km_cycles (
        vehicle_id, cycle_start_date, cycle_end_date, 
        km_inicial, limite_km_mensal, km_rodados
      ) VALUES (
        p_vehicle_id, v_cycle_start, v_cycle_end,
        v_previous_km, COALESCE(v_limit, 2000), GREATEST(0, v_current_km - v_previous_km)
      )
      RETURNING * INTO v_cycle_record;
    END;
  ELSE
    -- Update existing cycle
    UPDATE vehicle_km_cycles 
    SET km_rodados = GREATEST(0, v_current_km - km_inicial),
        updated_at = now()
    WHERE id = v_cycle_record.id
    RETURNING * INTO v_cycle_record;
  END IF;
  
  -- Return cycle information
  RETURN QUERY SELECT 
    v_cycle_record.id,
    v_cycle_record.cycle_start_date,
    v_cycle_record.cycle_end_date,
    v_cycle_record.km_inicial,
    v_cycle_record.limite_km_mensal,
    v_cycle_record.km_rodados,
    (v_cycle_record.cycle_end_date - v_current_date)::INTEGER,
    CASE 
      WHEN v_cycle_record.limite_km_mensal > 0 
      THEN ROUND((v_cycle_record.km_rodados::NUMERIC / v_cycle_record.limite_km_mensal::NUMERIC) * 100, 2)
      ELSE 0::NUMERIC
    END;
END;
$$;

DROP FUNCTION IF EXISTS public.is_employee_in_same_obra CASCADE;
CREATE OR REPLACE FUNCTION public.is_employee_in_same_obra(target_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM obra_funcionarios of1
    WHERE of1.employee_id = target_employee_id
    AND of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  );
$$;

DROP FUNCTION IF EXISTS public.is_gestor_obra CASCADE;
CREATE OR REPLACE FUNCTION public.is_gestor_obra()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_user_role(auth.uid()) = 'gestor_obra'::app_role;
$$;

DROP FUNCTION IF EXISTS public.is_maintenance_for_obra_vehicle CASCADE;
CREATE OR REPLACE FUNCTION public.is_maintenance_for_obra_vehicle(target_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM obra_veiculos ov
    WHERE ov.vehicle_id = target_vehicle_id
    AND ov.status = true
    AND ov.obra_id IN (
      SELECT of.obra_id 
      FROM obra_funcionarios of
      JOIN employees e ON e.id = of.employee_id
      WHERE e.user_id = auth.uid() AND of.status = true
    )
  );
$$;

DROP FUNCTION IF EXISTS public.is_vehicle_in_same_obra CASCADE;
CREATE OR REPLACE FUNCTION public.is_vehicle_in_same_obra(target_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM obra_veiculos ov
    WHERE ov.vehicle_id = target_vehicle_id
    AND ov.status = true
    AND ov.obra_id IN (
      SELECT of.obra_id 
      FROM obra_funcionarios of
      JOIN employees e ON e.id = of.employee_id
      WHERE e.user_id = auth.uid() AND of.status = true
    )
  );
$$;

DROP FUNCTION IF EXISTS public.update_updated_at_column CASCADE;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.update_vehicle_km_cycle CASCADE;
CREATE OR REPLACE FUNCTION update_vehicle_km_cycle()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update current cycle when vehicle km changes
  PERFORM get_current_km_cycle(NEW.id);
  RETURN NEW;
END;
$$;

-- 7. TRIGGERS

-- Cria perfil automaticamente ao cadastrar novo usuário via Supabase Auth
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS trigger_update_vehicle_km_cycle ON vehicles;
CREATE TRIGGER trigger_update_vehicle_km_cycle
  AFTER UPDATE OF quilometragem_atual ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_km_cycle();

DROP TRIGGER IF EXISTS update_cargos_updated_at ON cargos;
CREATE TRIGGER update_cargos_updated_at
  BEFORE UPDATE ON public.cargos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_damage_reports_updated_at ON damage_reports;
CREATE TRIGGER update_damage_reports_updated_at BEFORE UPDATE ON public.damage_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_departamentos_updated_at ON departamentos;
CREATE TRIGGER update_departamentos_updated_at
  BEFORE UPDATE ON public.departamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_driver_scores_updated_at ON driver_scores;
CREATE TRIGGER update_driver_scores_updated_at BEFORE UPDATE ON public.driver_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_escala_periodos_updated_at ON escala_periodos;
CREATE TRIGGER update_escala_periodos_updated_at
BEFORE UPDATE ON public.escala_periodos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_escala_tipos_updated_at ON escala_tipos;
CREATE TRIGGER update_escala_tipos_updated_at
BEFORE UPDATE ON public.escala_tipos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_fornecedores_updated_at ON fornecedores;
CREATE TRIGGER update_fornecedores_updated_at
BEFORE UPDATE ON public.fornecedores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_heavy_vehicle_inspections_updated_at ON heavy_vehicle_inspections;
CREATE TRIGGER update_heavy_vehicle_inspections_updated_at
BEFORE UPDATE ON public.heavy_vehicle_inspections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_inspection_checklists_updated_at ON inspection_checklists;
CREATE TRIGGER update_inspection_checklists_updated_at BEFORE UPDATE ON public.inspection_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_records_updated_at ON maintenance_records;
CREATE TRIGGER update_maintenance_records_updated_at
  BEFORE UPDATE ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_mileage_records_updated_at ON mileage_records;
CREATE TRIGGER update_mileage_records_updated_at
  BEFORE UPDATE ON public.mileage_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_obra_fornecedores_updated_at ON obra_fornecedores;
CREATE TRIGGER update_obra_fornecedores_updated_at
BEFORE UPDATE ON public.obra_fornecedores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_rental_companies_updated_at ON rental_companies;
CREATE TRIGGER update_rental_companies_updated_at
BEFORE UPDATE ON public.rental_companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_schedules_updated_at ON schedules;
CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_smoke_tests_updated_at ON smoke_tests;
CREATE TRIGGER update_smoke_tests_updated_at
BEFORE UPDATE ON public.smoke_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tire_services_updated_at ON tire_services;
CREATE TRIGGER update_tire_services_updated_at BEFORE UPDATE ON public.tire_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_traffic_fines_updated_at ON traffic_fines;
CREATE TRIGGER update_traffic_fines_updated_at BEFORE UPDATE ON public.traffic_fines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_vehicle_accessories_updated_at ON vehicle_accessories;
CREATE TRIGGER update_vehicle_accessories_updated_at BEFORE UPDATE ON public.vehicle_accessories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_vehicles_updated_at ON vehicles;
CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_wash_records_updated_at ON wash_records;
CREATE TRIGGER update_wash_records_updated_at BEFORE UPDATE ON public.wash_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. POLÍTICAS RLS
DROP POLICY IF EXISTS "Admin gerencia vinculações funcionarios" ON public.obra_funcionarios;
CREATE POLICY "Admin gerencia vinculações funcionarios"
ON public.obra_funcionarios FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Admin gerencia vinculações veiculos" ON public.obra_veiculos;
CREATE POLICY "Admin gerencia vinculações veiculos"
ON public.obra_veiculos FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Admins and gestors can manage all employees" ON public.employees;
CREATE POLICY "Admins and gestors can manage all employees"
ON public.employees 
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage cargos" ON public.cargos;
CREATE POLICY "Admins and gestors can manage cargos"
ON public.cargos FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage departamentos" ON public.departamentos;
CREATE POLICY "Admins and gestors can manage departamentos"
ON public.departamentos FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
CREATE POLICY "Admins and gestors can manage employees"
ON public.employees
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage escala_periodos" ON public.escala_periodos;
CREATE POLICY "Admins and gestors can manage escala_periodos"
ON public.escala_periodos
FOR ALL
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage escala_tipos" ON public.escala_tipos;
CREATE POLICY "Admins and gestors can manage escala_tipos"
ON public.escala_tipos
FOR ALL
USING (
  get_user_role() IN ('admin', 'gestor_frota', 'gestor_obra')
)
WITH CHECK (
  get_user_role() IN ('admin', 'gestor_frota', 'gestor_obra')
);

DROP POLICY IF EXISTS "Admins and gestors can manage fornecedores" ON public.fornecedores;
CREATE POLICY "Admins and gestors can manage fornecedores"
ON public.fornecedores FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
CREATE POLICY "Admins and gestors can manage heavy vehicle inspection items"
ON public.heavy_vehicle_inspection_items 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage heavy vehicle inspections" ON public.heavy_vehicle_inspections;
CREATE POLICY "Admins and gestors can manage heavy vehicle inspections"
ON public.heavy_vehicle_inspections 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage inspection checklists" ON public.inspection_checklists;
CREATE POLICY "Admins and gestors can manage inspection checklists"
ON public.inspection_checklists 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage inspection items" ON public.inspection_items;
CREATE POLICY "Admins and gestors can manage inspection items"
ON public.inspection_items 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON public.maintenance_records;
CREATE POLICY "Admins and gestors can manage maintenance records"
ON public.maintenance_records 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage obra_fornecedores" ON public.obra_fornecedores;
CREATE POLICY "Admins and gestors can manage obra_fornecedores"
ON public.obra_fornecedores FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
CREATE POLICY "Admins and gestors can manage rental companies"
ON public.rental_companies 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage smoke tests" ON public.smoke_tests;
CREATE POLICY "Admins and gestors can manage smoke tests"
ON public.smoke_tests 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage vehicle km cycles" ON public.vehicle_km_cycles;
CREATE POLICY "Admins and gestors can manage vehicle km cycles"
ON public.vehicle_km_cycles 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins and gestors can manage vehicles" ON public.vehicles;
CREATE POLICY "Admins and gestors can manage vehicles"
ON public.vehicles 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Admins can manage all employees" ON public.employees;
CREATE POLICY "Admins can manage all employees"
ON public.employees 
FOR ALL 
TO authenticated
USING (get_user_role() = 'admin'::app_role)
WITH CHECK (get_user_role() = 'admin'::app_role);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Admins have full employee access" ON public.employees;
CREATE POLICY "Admins have full employee access"
ON public.employees
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "All authenticated users can create employees" ON public.employees;
CREATE POLICY "All authenticated users can create employees"
ON public.employees 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can create heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
CREATE POLICY "All authenticated users can create heavy vehicle inspection items"
ON public.heavy_vehicle_inspection_items 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can create heavy vehicle inspections" ON public.heavy_vehicle_inspections;
CREATE POLICY "All authenticated users can create heavy vehicle inspections"
ON public.heavy_vehicle_inspections 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can create inspection checklists" ON public.inspection_checklists;
CREATE POLICY "All authenticated users can create inspection checklists"
ON public.inspection_checklists 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can create inspection items" ON public.inspection_items;
CREATE POLICY "All authenticated users can create inspection items"
ON public.inspection_items 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can create maintenance records" ON public.maintenance_records;
CREATE POLICY "All authenticated users can create maintenance records"
ON public.maintenance_records 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can create rental companies"
ON public.rental_companies 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can create smoke tests" ON public.smoke_tests;
CREATE POLICY "All authenticated users can create smoke tests"
ON public.smoke_tests 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can create vehicles" ON public.vehicles;
CREATE POLICY "All authenticated users can create vehicles"
ON public.vehicles 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can insert obra_veiculos" ON public.obra_veiculos;
CREATE POLICY "All authenticated users can insert obra_veiculos"
ON public.obra_veiculos 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can view cargos" ON public.cargos;
CREATE POLICY "All authenticated users can view cargos"
ON public.cargos FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view departamentos" ON public.departamentos;
CREATE POLICY "All authenticated users can view departamentos"
ON public.departamentos FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view escala_tipos" ON public.escala_tipos;
CREATE POLICY "All authenticated users can view escala_tipos"
ON public.escala_tipos
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view fornecedores" ON public.fornecedores;
CREATE POLICY "All authenticated users can view fornecedores"
ON public.fornecedores FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view heavy vehicle inspection items" ON public.heavy_vehicle_inspection_items;
CREATE POLICY "All authenticated users can view heavy vehicle inspection items"
ON public.heavy_vehicle_inspection_items 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view heavy vehicle inspections" ON public.heavy_vehicle_inspections;
CREATE POLICY "All authenticated users can view heavy vehicle inspections"
ON public.heavy_vehicle_inspections 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view inspection checklists" ON public.inspection_checklists;
CREATE POLICY "All authenticated users can view inspection checklists"
ON public.inspection_checklists 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view inspection items" ON public.inspection_items;
CREATE POLICY "All authenticated users can view inspection items"
ON public.inspection_items 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON public.maintenance_records;
CREATE POLICY "All authenticated users can view maintenance records" 
ON public.maintenance_records 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view obra_fornecedores" ON public.obra_fornecedores;
CREATE POLICY "All authenticated users can view obra_fornecedores"
ON public.obra_fornecedores FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view obra_veiculos" ON public.obra_veiculos;
CREATE POLICY "All authenticated users can view obra_veiculos"
ON public.obra_veiculos
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can view rental companies" 
ON public.rental_companies 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view smoke tests" ON public.smoke_tests;
CREATE POLICY "All authenticated users can view smoke tests"
ON public.smoke_tests 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view vehicle km cycles" ON public.vehicle_km_cycles;
CREATE POLICY "All authenticated users can view vehicle km cycles"
ON public.vehicle_km_cycles 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;
CREATE POLICY "All authenticated users can view vehicles"
ON public.vehicles 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone authenticated can create employees" ON public.employees;
CREATE POLICY "Anyone authenticated can create employees"
ON public.employees 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone authenticated can view employees" ON public.employees;
CREATE POLICY "Anyone authenticated can view employees"
ON public.employees 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Apenas gestores gerais podem criar obras" ON public.obras;
CREATE POLICY "Apenas gestores gerais podem criar obras"
ON public.obras FOR INSERT 
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Colaboradores nao podem acessar obras" ON public.obras;
CREATE POLICY "Colaboradores nao podem acessar obras"
ON public.obras FOR SELECT 
USING (
  get_user_role(auth.uid()) != 'funcionario'::app_role
);

DROP POLICY IF EXISTS "Colaboradores podem ver apenas suas vinculações" ON public.obra_funcionarios;
CREATE POLICY "Colaboradores podem ver apenas suas vinculações"
ON public.obra_funcionarios FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'funcionario'::app_role AND
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

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

DROP POLICY IF EXISTS "Create maintenance records policy" ON maintenance_records;
CREATE POLICY "Create maintenance records policy"
ON maintenance_records 
FOR INSERT 
WITH CHECK (
  -- Admins e gestores podem criar registros para qualquer veículo
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só podem criar registros para seus próprios veículos
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "Damage photos are publicly accessible" ON storage.objects;
CREATE POLICY "Damage photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'damage-photos');

DROP POLICY IF EXISTS "damage_reports_delete_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_delete_new_2025"
ON damage_reports 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

DROP POLICY IF EXISTS "damage_reports_delete_policy" ON damage_reports;
CREATE POLICY "damage_reports_delete_policy"
ON damage_reports 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

DROP POLICY IF EXISTS "damage_reports_insert_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_insert_new_2025"
ON damage_reports 
FOR INSERT 
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "damage_reports_insert_policy" ON damage_reports;
CREATE POLICY "damage_reports_insert_policy"
ON damage_reports 
FOR INSERT 
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "damage_reports_select_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_select_new_2025"
ON damage_reports 
FOR SELECT 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "damage_reports_select_policy" ON damage_reports;
CREATE POLICY "damage_reports_select_policy"
ON damage_reports 
FOR SELECT 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "damage_reports_update_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_update_new_2025"
ON damage_reports 
FOR UPDATE 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "damage_reports_update_policy" ON damage_reports;
CREATE POLICY "damage_reports_update_policy"
ON damage_reports 
FOR UPDATE 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "Delete maintenance records policy" ON maintenance_records;
CREATE POLICY "Delete maintenance records policy"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

DROP POLICY IF EXISTS "Employee photos are publicly accessible" ON storage.objects;
CREATE POLICY "Employee photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'employee-photos');

DROP POLICY IF EXISTS "Employees can update own basic data" ON public.employees;
CREATE POLICY "Employees can update own basic data"
ON public.employees
FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) = 'funcionario'::app_role 
  AND user_id = auth.uid()
)
WITH CHECK (
  get_user_role(auth.uid()) = 'funcionario'::app_role 
  AND user_id = auth.uid()
  -- Note: This policy allows update but application logic should restrict
  -- which fields employees can actually modify
);

DROP POLICY IF EXISTS "Employees can update their own vehicle mileage" ON public.vehicles;
CREATE POLICY "Employees can update their own vehicle mileage"
ON public.vehicles 
FOR UPDATE 
USING (responsavel_id IN (
  SELECT id FROM employees WHERE user_id = auth.uid()
)) 
WITH CHECK (responsavel_id IN (
  SELECT id FROM employees WHERE user_id = auth.uid()
));

DROP POLICY IF EXISTS "Employees can view assigned vehicles" ON public.vehicles;
CREATE POLICY "Employees can view assigned vehicles"
ON public.vehicles 
FOR SELECT 
TO authenticated
USING (
  -- Admins e gestores podem ver tudo  
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR
  -- Funcionários só veem veículos onde são responsáveis
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND responsavel_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS "Employees can view maintenance records of their assigned vehicles" ON maintenance_records;
CREATE POLICY "Employees can view maintenance records of their assigned vehicles" 
ON maintenance_records 
FOR SELECT 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "Employees can view own data" ON public.employees;
CREATE POLICY "Employees can view own data"
ON public.employees
FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) = 'funcionario'::app_role 
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "Employees can view their own data" ON public.employees;
CREATE POLICY "Employees can view their own data"
ON public.employees 
FOR SELECT 
TO authenticated
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR 
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Employees can view their own escala_periodos" ON public.escala_periodos;
CREATE POLICY "Employees can view their own escala_periodos"
ON public.escala_periodos
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Employees can view their own mileage records" ON public.mileage_records;
CREATE POLICY "Employees can view their own mileage records"
ON public.mileage_records 
FOR SELECT 
TO authenticated
USING (
  -- Admins e gestores podem ver tudo
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR 
  -- Funcionários só veem seus próprios registros
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS "Employees can view their own profile" ON public.employees;
CREATE POLICY "Employees can view their own profile"
ON public.employees 
FOR SELECT 
TO authenticated
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR 
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Employees can view their own schedules" ON public.schedules;
CREATE POLICY "Employees can view their own schedules"
ON public.schedules 
FOR SELECT 
TO authenticated
USING (
  -- Admins e gestores podem ver tudo
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR 
  -- Funcionários só veem suas próprias escalas
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.employees;
CREATE POLICY "Enable all operations for authenticated users"
ON public.employees 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Fleet managers can create departmental employees" ON public.employees;
CREATE POLICY "Fleet managers can create departmental employees"
ON public.employees
FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_frota'::app_role 
  AND departamento_id IN (
    SELECT departamento_id 
    FROM employees 
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Fleet managers can create employees" ON public.employees;
CREATE POLICY "Fleet managers can create employees"
ON public.employees
FOR INSERT
TO authenticated
WITH CHECK (get_user_role(auth.uid()) = 'gestor_frota'::app_role);

DROP POLICY IF EXISTS "Fleet managers can delete departmental employees" ON public.employees;
CREATE POLICY "Fleet managers can delete departmental employees"
ON public.employees
FOR DELETE
TO authenticated
USING (
  get_user_role(auth.uid()) = 'gestor_frota'::app_role 
  AND can_manage_employee(id)
);

DROP POLICY IF EXISTS "Fleet managers can delete employees" ON public.employees;
CREATE POLICY "Fleet managers can delete employees"
ON public.employees
FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'gestor_frota'::app_role);

DROP POLICY IF EXISTS "Fleet managers can update basic employee info" ON public.employees;
CREATE POLICY "Fleet managers can update basic employee info"
ON public.employees
FOR UPDATE
TO authenticated
USING (get_user_role(auth.uid()) = 'gestor_frota'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'gestor_frota'::app_role);

DROP POLICY IF EXISTS "Fleet managers can update departmental employees" ON public.employees;
CREATE POLICY "Fleet managers can update departmental employees"
ON public.employees
FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) = 'gestor_frota'::app_role 
  AND can_manage_employee(id)
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_frota'::app_role 
  AND can_manage_employee(id)
);

DROP POLICY IF EXISTS "Fleet managers can view basic employee info" ON public.employees;
CREATE POLICY "Fleet managers can view basic employee info"
ON public.employees
FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) = 'gestor_frota'::app_role
  -- They can see: nome, email, status, departamento_id, cargo_id, data_admissao, tipo_acesso
  -- But cannot access: cpf, telefone via this policy
);

DROP POLICY IF EXISTS "Fleet managers can view departmental employees" ON public.employees;
CREATE POLICY "Fleet managers can view departmental employees"
ON public.employees
FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) = 'gestor_frota'::app_role 
  AND can_manage_employee(id)
);

DROP POLICY IF EXISTS "Funcionario ve suas vinculações" ON public.obra_funcionarios;
CREATE POLICY "Funcionario ve suas vinculações"
ON public.obra_funcionarios FOR SELECT 
USING (
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

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

DROP POLICY IF EXISTS "Gestores de obra podem ver suas obras" ON public.obras;
CREATE POLICY "Gestores de obra podem ver suas obras"
ON public.obras FOR SELECT 
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  responsavel_tecnico_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Gestores gerais acessam todas obras" ON public.obras;
CREATE POLICY "Gestores gerais acessam todas obras"
ON public.obras FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as obras" ON public.obras;
CREATE POLICY "Gestores gerais podem gerenciar todas as obras"
ON public.obras FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações" ON public.obra_funcionarios;
CREATE POLICY "Gestores gerais podem gerenciar todas as vinculações"
ON public.obra_funcionarios FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Gestores gerais podem gerenciar todas as vinculações de veículos" ON public.obra_veiculos;
CREATE POLICY "Gestores gerais podem gerenciar todas as vinculações de veículos"
ON public.obra_veiculos FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

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

DROP POLICY IF EXISTS "Gestores obra veem suas obras" ON public.obras;
CREATE POLICY "Gestores obra veem suas obras"
ON public.obras FOR SELECT 
USING (
  get_user_role(auth.uid()) = ANY(ARRAY['gestor_obra'::app_role, 'gestor_frota'::app_role]) AND
  (responsavel_tecnico_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  ) OR responsavel_tecnico_id IS NULL) -- Permite ver obras sem responsável para poder assumir
);

DROP POLICY IF EXISTS "maint_records_delete_2025" ON maintenance_records;
CREATE POLICY "maint_records_delete_2025"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

DROP POLICY IF EXISTS "maint_records_insert_2025" ON maintenance_records;
CREATE POLICY "maint_records_insert_2025"
ON maintenance_records 
FOR INSERT 
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "maint_records_select_2025" ON maintenance_records;
CREATE POLICY "maint_records_select_2025"
ON maintenance_records 
FOR SELECT 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "maint_records_update_2025" ON maintenance_records;
CREATE POLICY "maint_records_update_2025"
ON maintenance_records 
FOR UPDATE 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
CREATE POLICY "maintenance_delete_policy"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

DROP POLICY IF EXISTS "maintenance_insert_policy" ON maintenance_records;
CREATE POLICY "maintenance_insert_policy"
ON maintenance_records 
FOR INSERT 
WITH CHECK (
  -- Admins e gestores podem criar registros para qualquer veículo
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só podem criar registros para seus próprios veículos
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "maintenance_select_policy" ON maintenance_records;
CREATE POLICY "maintenance_select_policy"
ON maintenance_records 
FOR SELECT 
USING (
  -- Admins e gestores veem todos os registros
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só veem registros dos veículos atribuídos a eles
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "maintenance_update_policy" ON maintenance_records;
CREATE POLICY "maintenance_update_policy"
ON maintenance_records 
FOR UPDATE 
USING (
  -- Admins e gestores podem editar qualquer registro
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só podem editar registros dos seus veículos
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  -- Mesma lógica para verificação de alteração
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "Only admins can view system logs" ON public.system_logs;
CREATE POLICY "Only admins can view system logs"
ON public.system_logs
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
CREATE POLICY "Project managers can create obra employees"
ON public.employees
FOR INSERT
WITH CHECK (
  is_gestor_obra()
);

DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
CREATE POLICY "Project managers can delete obra employees"
ON public.employees
FOR DELETE
USING (
  is_gestor_obra() AND is_employee_in_same_obra(id)
);

DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
CREATE POLICY "Project managers can update obra employees"
ON public.employees
FOR UPDATE
USING (
  is_gestor_obra() AND is_employee_in_same_obra(id)
)
WITH CHECK (
  is_gestor_obra() AND is_employee_in_same_obra(id)
);

DROP POLICY IF EXISTS "Project managers can update obra vehicles" ON public.vehicles;
CREATE POLICY "Project managers can update obra vehicles"
ON public.vehicles
FOR UPDATE
USING (
  is_gestor_obra() AND is_vehicle_in_same_obra(id)
)
WITH CHECK (
  is_gestor_obra() AND is_vehicle_in_same_obra(id)
);

DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
CREATE POLICY "Project managers can view obra employees"
ON public.employees
FOR SELECT
USING (
  is_gestor_obra() AND is_employee_in_same_obra(id)
);

DROP POLICY IF EXISTS "Project managers can view obra vehicle maintenance" ON public.maintenance_records;
CREATE POLICY "Project managers can view obra vehicle maintenance"
ON public.maintenance_records
FOR SELECT
USING (
  is_gestor_obra() AND is_maintenance_for_obra_vehicle(vehicle_id)
);

DROP POLICY IF EXISTS "Project managers can view obra vehicles" ON public.vehicles;
CREATE POLICY "Project managers can view obra vehicles"
ON public.vehicles
FOR SELECT
USING (
  is_gestor_obra() AND is_vehicle_in_same_obra(id)
);

DROP POLICY IF EXISTS "Update maintenance records policy" ON maintenance_records;
CREATE POLICY "Update maintenance records policy"
ON maintenance_records 
FOR UPDATE 
USING (
  -- Admins e gestores podem editar qualquer registro
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só podem editar registros dos seus veículos
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  -- Mesma lógica para verificação de alteração
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "Users can update damage photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can update damage photos for their own vehicles"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'damage-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can update their own employee data" ON public.employees;
CREATE POLICY "Users can update their own employee data"
ON public.employees 
FOR UPDATE 
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own employee photos" ON storage.objects;
CREATE POLICY "Users can update their own employee photos"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'employee-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] = auth.uid()::text)
  )
);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update vehicle photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can update vehicle photos for their own vehicles"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'vehicle-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can update wash photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can update wash photos for their own vehicles"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'wash-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can upload damage photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can upload damage photos for their own vehicles"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'damage-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can upload their own employee photos" ON storage.objects;
CREATE POLICY "Users can upload their own employee photos"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'employee-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] = auth.uid()::text)
  )
);

DROP POLICY IF EXISTS "Users can upload vehicle photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can upload vehicle photos for their own vehicles"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'vehicle-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can upload wash photos for their own vehicles" ON storage.objects;
CREATE POLICY "Users can upload wash photos for their own vehicles"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'wash-photos' AND
  (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR
    ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND
     (storage.foldername(name))[1] IN (
       SELECT v.id::text
       FROM vehicles v 
       JOIN employees e ON v.responsavel_id = e.id 
       WHERE e.user_id = auth.uid()
     ))
  )
);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Vehicle photos are publicly accessible" ON storage.objects;
CREATE POLICY "Vehicle photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "View maintenance records policy" ON maintenance_records;
CREATE POLICY "View maintenance records policy"
ON maintenance_records 
FOR SELECT 
USING (
  -- Admins e gestores veem todos os registros
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só veem registros dos veículos atribuídos a eles
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "Wash photos are publicly accessible" ON storage.objects;
CREATE POLICY "Wash photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'wash-photos');

DROP POLICY IF EXISTS "wash_records_delete_new_2025" ON wash_records;
CREATE POLICY "wash_records_delete_new_2025"
ON wash_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

DROP POLICY IF EXISTS "wash_records_delete_policy" ON wash_records;
CREATE POLICY "wash_records_delete_policy"
ON wash_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

DROP POLICY IF EXISTS "wash_records_insert_new_2025" ON wash_records;
CREATE POLICY "wash_records_insert_new_2025"
ON wash_records 
FOR INSERT 
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "wash_records_insert_policy" ON wash_records;
CREATE POLICY "wash_records_insert_policy"
ON wash_records 
FOR INSERT 
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "wash_records_select_new_2025" ON wash_records;
CREATE POLICY "wash_records_select_new_2025"
ON wash_records 
FOR SELECT 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "wash_records_select_policy" ON wash_records;
CREATE POLICY "wash_records_select_policy"
ON wash_records 
FOR SELECT 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "wash_records_update_new_2025" ON wash_records;
CREATE POLICY "wash_records_update_new_2025"
ON wash_records 
FOR UPDATE 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "wash_records_update_policy" ON wash_records;
CREATE POLICY "wash_records_update_policy"
ON wash_records 
FOR UPDATE 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);


-- 9. STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('vehicle-photos',  'vehicle-photos',  true, 54525952),
  ('damage-photos',   'damage-photos',   true, 54525952),
  ('wash-photos',     'wash-photos',     true, 54525952)
ON CONFLICT (id) DO NOTHING;

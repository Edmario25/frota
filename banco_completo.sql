-- ============================================================
-- BANCO COMPLETO - Sistema de Gestão de Frota
-- Versão: 1.0.0
-- Data: 2026-05-18
-- Execute em blocos separados se o Supabase Studio reclamar de tamanho.
-- ============================================================


-- ============================================================
-- SEÇÃO 1: LIMPEZA COMPLETA (DROP tudo em ordem reversa)
-- ============================================================

SET session_replication_role = replica; -- desabilita triggers durante limpeza

-- Tabelas de junção e dependentes primeiro
DROP TABLE IF EXISTS public.system_logs CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.escala_periodos CASCADE;
DROP TABLE IF EXISTS public.schedules CASCADE;
DROP TABLE IF EXISTS public.driver_scores CASCADE;
DROP TABLE IF EXISTS public.damage_reports CASCADE;
DROP TABLE IF EXISTS public.smoke_tests CASCADE;
DROP TABLE IF EXISTS public.tire_services CASCADE;
DROP TABLE IF EXISTS public.heavy_vehicle_inspection_items CASCADE;
DROP TABLE IF EXISTS public.heavy_vehicle_inspections CASCADE;
DROP TABLE IF EXISTS public.inspection_items CASCADE;
DROP TABLE IF EXISTS public.inspection_checklists CASCADE;
DROP TABLE IF EXISTS public.wash_records CASCADE;
DROP TABLE IF EXISTS public.traffic_fines CASCADE;
DROP TABLE IF EXISTS public.vehicle_km_cycles CASCADE;
DROP TABLE IF EXISTS public.vehicle_accessories CASCADE;
DROP TABLE IF EXISTS public.vehicle_documents CASCADE;
DROP TABLE IF EXISTS public.mileage_records CASCADE;
DROP TABLE IF EXISTS public.maintenance_records CASCADE;
DROP TABLE IF EXISTS public.obra_fornecedores CASCADE;
DROP TABLE IF EXISTS public.obra_veiculos CASCADE;
DROP TABLE IF EXISTS public.obra_funcionarios CASCADE;
DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP TABLE IF EXISTS public.fornecedores CASCADE;
DROP TABLE IF EXISTS public.obras CASCADE;
DROP TABLE IF EXISTS public.departamentos CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.rental_companies CASCADE;
DROP TABLE IF EXISTS public.escala_tipos CASCADE;
DROP TABLE IF EXISTS public.cargos CASCADE;

-- Funções
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_employee_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_obra_id() CASCADE;
DROP FUNCTION IF EXISTS public.is_gestor_contrato() CASCADE;
DROP FUNCTION IF EXISTS public.is_gestor_obra() CASCADE;
DROP FUNCTION IF EXISTS public.is_funcionario() CASCADE;
DROP FUNCTION IF EXISTS public.is_vehicle_in_same_obra(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_employee_in_same_obra(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_maintenance_for_obra_vehicle(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_employee(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.close_expired_km_cycles() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_km_cycle(uuid) CASCADE;

-- Tipos
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.employee_status CASCADE;
DROP TYPE IF EXISTS public.maintenance_status CASCADE;
DROP TYPE IF EXISTS public.maintenance_type CASCADE;
DROP TYPE IF EXISTS public.obra_status CASCADE;
DROP TYPE IF EXISTS public.ownership_type CASCADE;
DROP TYPE IF EXISTS public.vehicle_status CASCADE;
DROP TYPE IF EXISTS public.vehicle_type CASCADE;
DROP TYPE IF EXISTS public.vinculo_veiculo_tipo CASCADE;

SET session_replication_role = DEFAULT;


-- ============================================================
-- SEÇÃO 2: ENUMS
-- ============================================================

CREATE TYPE public.app_role AS ENUM (
  'gestor_contrato',
  'gestor_obra',
  'funcionario',
  'admin',        -- legado
  'gestor_frota'  -- legado
);

CREATE TYPE public.employee_status AS ENUM (
  'ativo',
  'inativo',
  'ferias',
  'licenca'
);

CREATE TYPE public.maintenance_status AS ENUM (
  'agendada',
  'em_andamento',
  'concluida',
  'cancelada'
);

CREATE TYPE public.maintenance_type AS ENUM (
  'preventiva',
  'corretiva',
  'emergencial'
);

CREATE TYPE public.obra_status AS ENUM (
  'planejada',
  'em_andamento',
  'pausada',
  'concluida'
);

CREATE TYPE public.ownership_type AS ENUM (
  'proprio',
  'alugado'
);

CREATE TYPE public.vehicle_status AS ENUM (
  'disponivel',
  'em_uso',
  'manutencao',
  'inativo'
);

CREATE TYPE public.vehicle_type AS ENUM (
  'leve',
  'pesado'
);

CREATE TYPE public.vinculo_veiculo_tipo AS ENUM (
  'exclusivo',
  'compartilhado'
);


-- ============================================================
-- SEÇÃO 3: TABELAS
-- Ordem respeitando dependências de FK.
-- Circular: employees ↔ departamentos → resolvida criando
-- employees sem departamento_id, depois departamentos,
-- depois ALTER TABLE employees ADD COLUMN.
-- ============================================================

-- 3.1 cargos (sem FKs)
CREATE TABLE public.cargos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  descricao         text,
  nivel_hierarquico integer,
  nivel_acesso      text NOT NULL DEFAULT 'funcionario'
                    CHECK (nivel_acesso IN ('funcionario', 'gestor_obra', 'gestor_contrato')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 3.2 escala_tipos (sem FKs)
CREATE TABLE public.escala_tipos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 text NOT NULL,
  descricao            text,
  dias_trabalho        integer NOT NULL,
  dias_folga           integer NOT NULL,
  permite_sobreposicao boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 3.3 rental_companies (sem FKs)
CREATE TABLE public.rental_companies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                text NOT NULL,
  cnpj                text,
  contato_responsavel text,
  telefone            text,
  email               text,
  endereco            text,
  observacoes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3.4 employees (SEM departamento_id por enquanto — circular FK)
CREATE TABLE public.employees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  cpf            text NOT NULL UNIQUE,
  email          text NOT NULL UNIQUE,
  telefone       text,
  cargo_id       uuid CONSTRAINT fk_employees_cargo REFERENCES public.cargos(id) ON DELETE SET NULL,
  -- departamento_id adicionado via ALTER TABLE abaixo
  data_admissao  date,
  status         public.employee_status NOT NULL DEFAULT 'ativo',
  tipo_acesso    text,
  escala_tipo_id uuid CONSTRAINT employees_escala_tipo_id_fkey REFERENCES public.escala_tipos(id) ON DELETE SET NULL,
  foto_url       text,
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 3.5 departamentos (FK para employees)
CREATE TABLE public.departamentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  descricao      text,
  responsavel_id uuid CONSTRAINT fk_departamentos_responsavel REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 3.6 Resolver circular FK — adicionar departamento_id em employees
ALTER TABLE public.employees
  ADD COLUMN departamento_id uuid CONSTRAINT fk_employees_departamento REFERENCES public.departamentos(id) ON DELETE SET NULL;

-- 3.7 fornecedores (sem FKs)
CREATE TABLE public.fornecedores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  tipo_fornecedor text NOT NULL DEFAULT 'produto',
  cnpj            text,
  cpf             text,
  telefone        text,
  email           text,
  endereco        text,
  cidade          text,
  estado          text,
  categoria       text,
  observacoes     text,
  status          text NOT NULL DEFAULT 'ativo',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.8 obras (FK para employees)
CREATE TABLE public.obras (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                   text NOT NULL,
  codigo_interno         text,
  cliente_nome           text NOT NULL,
  cliente_cnpj           text,
  status                 public.obra_status NOT NULL DEFAULT 'planejada',
  endereco               text,
  cidade                 text,
  estado                 text,
  coordenadas_gps        text,
  data_inicio_prevista   date,
  data_termino_prevista  date,
  responsavel_tecnico    text,
  responsavel_tecnico_id uuid CONSTRAINT obras_responsavel_tecnico_id_fkey REFERENCES public.employees(id) ON DELETE SET NULL,
  observacoes            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- 3.9 vehicles (FK para employees e rental_companies)
CREATE TABLE public.vehicles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa                       text NOT NULL UNIQUE,
  marca                       text NOT NULL,
  modelo                      text NOT NULL,
  ano                         integer NOT NULL,
  cor                         text,
  tipo                        public.vehicle_type NOT NULL,
  tipo_propriedade            public.ownership_type,
  status                      public.vehicle_status NOT NULL DEFAULT 'disponivel',
  quilometragem_atual         numeric NOT NULL DEFAULT 0,
  quilometragem_maxima_mensal numeric,
  data_ultima_revisao         date,
  responsavel_id              uuid CONSTRAINT vehicles_responsavel_id_fkey REFERENCES public.employees(id) ON DELETE SET NULL,
  rental_company_id           uuid CONSTRAINT vehicles_rental_company_id_fkey REFERENCES public.rental_companies(id) ON DELETE SET NULL,
  observacoes                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- 3.10 obra_funcionarios
CREATE TABLE public.obra_funcionarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid NOT NULL CONSTRAINT obra_funcionarios_obra_id_fkey REFERENCES public.obras(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL CONSTRAINT obra_funcionarios_employee_id_fkey REFERENCES public.employees(id) ON DELETE CASCADE,
  funcao_obra text NOT NULL,
  data_entrada date NOT NULL DEFAULT CURRENT_DATE,
  data_saida   date,
  status       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 3.11 obra_veiculos
CREATE TABLE public.obra_veiculos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id      uuid NOT NULL CONSTRAINT obra_veiculos_obra_id_fkey REFERENCES public.obras(id) ON DELETE CASCADE,
  vehicle_id   uuid NOT NULL CONSTRAINT obra_veiculos_vehicle_id_fkey REFERENCES public.vehicles(id) ON DELETE CASCADE,
  responsavel_id uuid CONSTRAINT obra_veiculos_responsavel_id_fkey REFERENCES public.employees(id) ON DELETE SET NULL,
  tipo_vinculo public.vinculo_veiculo_tipo NOT NULL DEFAULT 'exclusivo',
  data_entrada date NOT NULL DEFAULT CURRENT_DATE,
  data_saida   date,
  status       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 3.12 obra_fornecedores
CREATE TABLE public.obra_fornecedores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid NOT NULL CONSTRAINT obra_fornecedores_obra_id_fkey REFERENCES public.obras(id) ON DELETE CASCADE,
  fornecedor_id   uuid NOT NULL CONSTRAINT obra_fornecedores_fornecedor_id_fkey REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  tipo_contrato   text,
  valor_contrato  numeric,
  data_inicio     date NOT NULL DEFAULT CURRENT_DATE,
  data_fim        date,
  status          boolean NOT NULL DEFAULT true,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.13 maintenance_records
CREATE TABLE public.maintenance_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL CONSTRAINT maintenance_records_vehicle_id_fkey REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tipo            public.maintenance_type NOT NULL,
  status          public.maintenance_status NOT NULL DEFAULT 'agendada',
  descricao       text NOT NULL,
  data_agendada   date NOT NULL,
  data_realizada  date,
  quilometragem   numeric,
  custo           numeric,
  oficina         text,
  responsavel     text,
  observacoes     text,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.14 mileage_records
CREATE TABLE public.mileage_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            uuid NOT NULL CONSTRAINT mileage_records_vehicle_id_fkey REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL CONSTRAINT mileage_records_employee_id_fkey REFERENCES public.employees(id) ON DELETE CASCADE,
  quilometragem_inicial numeric NOT NULL,
  quilometragem_final   numeric,
  data_inicial          timestamptz NOT NULL DEFAULT now(),
  data_final            timestamptz,
  destino               text,
  observacoes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.15 traffic_fines
CREATE TABLE public.traffic_fines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id     uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  tipo_infracao   text NOT NULL,
  local_infracao  text NOT NULL,
  data_multa      date NOT NULL,
  valor           numeric NOT NULL,
  situacao        text NOT NULL DEFAULT 'pendente',
  comprovante_url text,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.16 vehicle_documents
CREATE TABLE public.vehicle_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL CONSTRAINT vehicle_documents_vehicle_id_fkey REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tipo_documento  text NOT NULL,
  nome_arquivo    text NOT NULL,
  url_arquivo     text NOT NULL,
  data_vencimento date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.17 vehicle_km_cycles
CREATE TABLE public.vehicle_km_cycles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        uuid NOT NULL CONSTRAINT vehicle_km_cycles_vehicle_id_fkey REFERENCES public.vehicles(id) ON DELETE CASCADE,
  km_inicial        numeric NOT NULL,
  km_final          numeric,
  km_rodados        numeric,
  limite_km_mensal  numeric NOT NULL,
  cycle_start_date  date NOT NULL,
  cycle_end_date    date NOT NULL,
  status            text DEFAULT 'ativo',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 3.18 vehicle_accessories
CREATE TABLE public.vehicle_accessories (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tipo_acessorio        text NOT NULL,
  data_instalacao       date,
  fornecedor_empresa    text,
  foto_comprovante_url  text,
  observacoes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.19 wash_records
CREATE TABLE public.wash_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id          uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id         uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tipo_lavagem        text NOT NULL,
  data_lavagem        date NOT NULL,
  responsavel_lavagem text,
  foto_antes_url      text,
  foto_depois_url     text,
  observacoes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3.20 inspection_checklists
CREATE TABLE public.inspection_checklists (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tipo_servico          text NOT NULL,
  data_inspecao         date NOT NULL DEFAULT CURRENT_DATE,
  km_atual              numeric,
  funcao                text,
  responsavel_checklist text,
  observacoes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.21 inspection_items
CREATE TABLE public.inspection_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  uuid NOT NULL CONSTRAINT inspection_items_checklist_id_fkey REFERENCES public.inspection_checklists(id) ON DELETE CASCADE,
  item_nome     text NOT NULL,
  status        text NOT NULL,
  foto_url      text,
  observacoes   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 3.22 heavy_vehicle_inspections
CREATE TABLE public.heavy_vehicle_inspections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  inspetor_nome         text NOT NULL,
  inspetor_funcao       text NOT NULL,
  data_inspecao         date NOT NULL DEFAULT CURRENT_DATE,
  km_atual              numeric,
  status_geral          text NOT NULL DEFAULT 'aprovado',
  observacoes_gerais    text,
  fotos_checklist       text,
  assinatura_inspetor   text,
  assinatura_responsavel text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.23 heavy_vehicle_inspection_items
CREATE TABLE public.heavy_vehicle_inspection_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.heavy_vehicle_inspections(id) ON DELETE CASCADE,
  categoria     text NOT NULL,
  item_nome     text NOT NULL,
  status        text NOT NULL,
  observacoes   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 3.24 smoke_tests
CREATE TABLE public.smoke_tests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id              uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id             uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  condutor                text NOT NULL,
  cargo                   text NOT NULL,
  ano_fabricacao          integer NOT NULL,
  motor_tipo              text,
  data_afericao           date NOT NULL,
  data_hora_teste         timestamptz,
  indice_ringelmann       numeric,
  densidade_percentual    numeric,
  dentro_limite           boolean,
  distancia_observador    numeric,
  condicoes_teste         text,
  quilometragem_atual     numeric,
  resultado               text NOT NULL,
  responsavel_elaboracao  text NOT NULL,
  obra                    text,
  evidencias_url          text,
  observacoes             text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- 3.25 driver_scores
CREATE TABLE public.driver_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  data_avaliacao  date NOT NULL,
  pontuacao       numeric NOT NULL,
  justificativa   text,
  comentarios     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.26 damage_reports
CREATE TABLE public.damage_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data_avaria           date NOT NULL DEFAULT CURRENT_DATE,
  descricao_avaria      text NOT NULL,
  local_ocorrencia      text,
  responsavel_registro  text,
  foto_url              text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.27 schedules
CREATE TABLE public.schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL CONSTRAINT schedules_employee_id_fkey REFERENCES public.employees(id) ON DELETE CASCADE,
  data_inicio    timestamptz NOT NULL,
  data_fim       timestamptz NOT NULL,
  descricao      text,
  local_trabalho text,
  created_by     uuid NOT NULL REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 3.28 escala_periodos
CREATE TABLE public.escala_periodos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL CONSTRAINT escala_periodos_employee_id_fkey REFERENCES public.employees(id) ON DELETE CASCADE,
  escala_tipo_id        uuid NOT NULL CONSTRAINT escala_periodos_escala_tipo_id_fkey REFERENCES public.escala_tipos(id) ON DELETE CASCADE,
  data_inicio_trabalho  date NOT NULL,
  data_fim_trabalho     date NOT NULL,
  data_inicio_folga     date NOT NULL,
  data_fim_folga        date NOT NULL,
  status                text NOT NULL DEFAULT 'ativo',
  conflito_detectado    boolean,
  conflito_autorizado   boolean,
  observacoes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.29 tire_services
CREATE TABLE public.tire_services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id      uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tipo_servico     text NOT NULL,
  data_servico     date NOT NULL,
  quantidade_pneus integer,
  responsavel      text,
  local_servico    text,
  foto_pneus_url   text,
  observacoes      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 3.30 profiles (espelha auth.users)
CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  email      text NOT NULL,
  telefone   text,
  foto_url   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.31 user_roles
CREATE TABLE public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL DEFAULT 'funcionario',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.32 system_logs
CREATE TABLE public.system_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name  text NOT NULL,
  action      text NOT NULL,
  record_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- SEÇÃO 4: ÍNDICES (performance)
-- ============================================================

CREATE INDEX idx_employees_user_id        ON public.employees(user_id);
CREATE INDEX idx_employees_cargo_id       ON public.employees(cargo_id);
CREATE INDEX idx_employees_departamento   ON public.employees(departamento_id);
CREATE INDEX idx_employees_status         ON public.employees(status);

CREATE INDEX idx_obras_status             ON public.obras(status);
CREATE INDEX idx_obras_resp_tec           ON public.obras(responsavel_tecnico_id);

CREATE INDEX idx_vehicles_status          ON public.vehicles(status);
CREATE INDEX idx_vehicles_placa           ON public.vehicles(placa);

CREATE INDEX idx_obra_funcionarios_obra   ON public.obra_funcionarios(obra_id);
CREATE INDEX idx_obra_funcionarios_emp    ON public.obra_funcionarios(employee_id);
CREATE INDEX idx_obra_funcionarios_status ON public.obra_funcionarios(status);

CREATE INDEX idx_obra_veiculos_obra       ON public.obra_veiculos(obra_id);
CREATE INDEX idx_obra_veiculos_vehicle    ON public.obra_veiculos(vehicle_id);
CREATE INDEX idx_obra_veiculos_status     ON public.obra_veiculos(status);

CREATE INDEX idx_maintenance_vehicle      ON public.maintenance_records(vehicle_id);
CREATE INDEX idx_maintenance_status       ON public.maintenance_records(status);
CREATE INDEX idx_maintenance_data         ON public.maintenance_records(data_agendada);

CREATE INDEX idx_mileage_vehicle          ON public.mileage_records(vehicle_id);
CREATE INDEX idx_mileage_employee         ON public.mileage_records(employee_id);

CREATE INDEX idx_user_roles_user          ON public.user_roles(user_id);
CREATE INDEX idx_profiles_user            ON public.profiles(user_id);

CREATE INDEX idx_escala_periodos_emp      ON public.escala_periodos(employee_id);
CREATE INDEX idx_escala_periodos_tipo     ON public.escala_periodos(escala_tipo_id);

CREATE INDEX idx_schedules_emp            ON public.schedules(employee_id);
CREATE INDEX idx_schedules_datas          ON public.schedules(data_inicio, data_fim);

CREATE INDEX idx_km_cycles_vehicle        ON public.vehicle_km_cycles(vehicle_id);
CREATE INDEX idx_km_cycles_status         ON public.vehicle_km_cycles(status);


-- ============================================================
-- SEÇÃO 5: GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated, service_role;


-- ============================================================
-- SEÇÃO 6: FUNÇÕES AUXILIARES PARA RLS
-- ============================================================

-- Trigger function para updated_at automático
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger function para criar profile + user_role ao registrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criar profile
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Criar role padrão
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'funcionario')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Retorna a role do usuário atual (ou de um uuid específico)
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid DEFAULT NULL)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = COALESCE(user_uuid, auth.uid())
  LIMIT 1;
$$;

-- Retorna o employee.id vinculado ao usuário atual
CREATE OR REPLACE FUNCTION public.get_user_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Retorna o obra.id onde o usuário atual é responsável técnico (gestor_obra)
CREATE OR REPLACE FUNCTION public.get_user_obra_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.obras
  WHERE responsavel_tecnico_id = public.get_user_employee_id()
  LIMIT 1;
$$;

-- Booleanos de conveniência para políticas RLS
CREATE OR REPLACE FUNCTION public.is_gestor_contrato()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('gestor_contrato', 'admin', 'gestor_frota')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_gestor_obra()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'gestor_obra'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_funcionario()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'funcionario'
  );
$$;

-- Verifica se um veículo pertence à obra do gestor_obra atual
CREATE OR REPLACE FUNCTION public.is_vehicle_in_same_obra(target_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.obra_veiculos ov
    WHERE ov.vehicle_id = target_vehicle_id
    AND ov.obra_id = public.get_user_obra_id()
    AND ov.status = true
  );
$$;

-- Verifica se um employee pertence à obra do gestor_obra atual
CREATE OR REPLACE FUNCTION public.is_employee_in_same_obra(target_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.obra_funcionarios of2
    WHERE of2.employee_id = target_employee_id
    AND of2.obra_id = public.get_user_obra_id()
    AND of2.status = true
  );
$$;

-- Verifica se manutenção é de veículo da obra do gestor_obra
CREATE OR REPLACE FUNCTION public.is_maintenance_for_obra_vehicle(target_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_vehicle_in_same_obra(target_vehicle_id);
$$;

-- Verifica se o usuário pode gerenciar um employee
CREATE OR REPLACE FUNCTION public.can_manage_employee(employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_gestor_contrato()
    OR (public.is_gestor_obra() AND public.is_employee_in_same_obra(employee_id))
    OR (public.get_user_employee_id() = employee_id)
  );
$$;

-- Fecha ciclos de KM expirados
CREATE OR REPLACE FUNCTION public.close_expired_km_cycles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.vehicle_km_cycles
  SET
    status = 'fechado',
    km_rodados = COALESCE(km_final, km_inicial) - km_inicial,
    updated_at = now()
  WHERE
    status = 'ativo'
    AND cycle_end_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Retorna o ciclo de KM atual de um veículo
CREATE OR REPLACE FUNCTION public.get_current_km_cycle(p_vehicle_id uuid)
RETURNS TABLE (
  cycle_id          uuid,
  cycle_start_date  date,
  cycle_end_date    date,
  km_inicial        numeric,
  km_rodados        numeric,
  limite_km_mensal  numeric,
  percentage_used   numeric,
  days_remaining    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id                                                      AS cycle_id,
    cycle_start_date,
    cycle_end_date,
    km_inicial,
    COALESCE(km_rodados, 0)                                 AS km_rodados,
    limite_km_mensal,
    ROUND(COALESCE(km_rodados, 0) / NULLIF(limite_km_mensal, 0) * 100, 2) AS percentage_used,
    (cycle_end_date - CURRENT_DATE)::integer                AS days_remaining
  FROM public.vehicle_km_cycles
  WHERE vehicle_id = p_vehicle_id
    AND status = 'ativo'
  ORDER BY cycle_start_date DESC
  LIMIT 1;
$$;


-- ============================================================
-- SEÇÃO 7: TRIGGERS
-- ============================================================

-- updated_at em todas as tabelas que têm a coluna
CREATE TRIGGER trg_cargos_updated_at
  BEFORE UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_escala_tipos_updated_at
  BEFORE UPDATE ON public.escala_tipos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rental_companies_updated_at
  BEFORE UPDATE ON public.rental_companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_departamentos_updated_at
  BEFORE UPDATE ON public.departamentos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_obras_updated_at
  BEFORE UPDATE ON public.obras
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_obra_funcionarios_updated_at
  BEFORE UPDATE ON public.obra_funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_obra_veiculos_updated_at
  BEFORE UPDATE ON public.obra_veiculos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_obra_fornecedores_updated_at
  BEFORE UPDATE ON public.obra_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_maintenance_records_updated_at
  BEFORE UPDATE ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_mileage_records_updated_at
  BEFORE UPDATE ON public.mileage_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_traffic_fines_updated_at
  BEFORE UPDATE ON public.traffic_fines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_vehicle_km_cycles_updated_at
  BEFORE UPDATE ON public.vehicle_km_cycles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_vehicle_accessories_updated_at
  BEFORE UPDATE ON public.vehicle_accessories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_wash_records_updated_at
  BEFORE UPDATE ON public.wash_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_inspection_checklists_updated_at
  BEFORE UPDATE ON public.inspection_checklists
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_heavy_vehicle_inspections_updated_at
  BEFORE UPDATE ON public.heavy_vehicle_inspections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_smoke_tests_updated_at
  BEFORE UPDATE ON public.smoke_tests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_driver_scores_updated_at
  BEFORE UPDATE ON public.driver_scores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_damage_reports_updated_at
  BEFORE UPDATE ON public.damage_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_escala_periodos_updated_at
  BEFORE UPDATE ON public.escala_periodos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_tire_services_updated_at
  BEFORE UPDATE ON public.tire_services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger para auto-criar profile + user_role no signup
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SEÇÃO 8: HABILITAR RLS
-- ============================================================

ALTER TABLE public.cargos                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_tipos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departamentos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_funcionarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_veiculos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_fornecedores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mileage_records              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_fines                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_km_cycles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_accessories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wash_records                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_checklists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heavy_vehicle_inspections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heavy_vehicle_inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smoke_tests                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_scores                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damage_reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_periodos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tire_services                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs                  ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SEÇÃO 9: POLÍTICAS RLS
-- 3 níveis:
--   gestor_contrato (+ legados admin, gestor_frota) — acesso total
--   gestor_obra                                     — scoped à sua obra
--   funcionario                                     — apenas dados pessoais
-- ============================================================

-- -----------------------------------------------------------
-- cargos
-- -----------------------------------------------------------
CREATE POLICY "cargos_gestor_contrato_all" ON public.cargos
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "cargos_outros_select" ON public.cargos
  FOR SELECT TO authenticated
  USING (NOT public.is_gestor_contrato());

-- -----------------------------------------------------------
-- escala_tipos
-- -----------------------------------------------------------
CREATE POLICY "escala_tipos_gestor_contrato_all" ON public.escala_tipos
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "escala_tipos_outros_select" ON public.escala_tipos
  FOR SELECT TO authenticated
  USING (NOT public.is_gestor_contrato());

-- -----------------------------------------------------------
-- rental_companies
-- -----------------------------------------------------------
CREATE POLICY "rental_companies_gestor_contrato_all" ON public.rental_companies
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "rental_companies_outros_select" ON public.rental_companies
  FOR SELECT TO authenticated
  USING (NOT public.is_gestor_contrato());

-- -----------------------------------------------------------
-- fornecedores
-- -----------------------------------------------------------
CREATE POLICY "fornecedores_gestor_contrato_all" ON public.fornecedores
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "fornecedores_gestor_obra_select" ON public.fornecedores
  FOR SELECT TO authenticated
  USING (public.is_gestor_obra());

CREATE POLICY "fornecedores_funcionario_select" ON public.fornecedores
  FOR SELECT TO authenticated
  USING (public.is_funcionario());

-- -----------------------------------------------------------
-- departamentos
-- -----------------------------------------------------------
CREATE POLICY "departamentos_gestor_contrato_all" ON public.departamentos
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "departamentos_outros_select" ON public.departamentos
  FOR SELECT TO authenticated
  USING (NOT public.is_gestor_contrato());

-- -----------------------------------------------------------
-- employees
-- -----------------------------------------------------------
CREATE POLICY "employees_gestor_contrato_all" ON public.employees
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

-- gestor_obra: vê todos os employees da sua obra
CREATE POLICY "employees_gestor_obra_select" ON public.employees
  FOR SELECT TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(id)
  );

-- gestor_obra: pode atualizar employees da sua obra
CREATE POLICY "employees_gestor_obra_update" ON public.employees
  FOR UPDATE TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(id)
  );

-- funcionário: vê e edita apenas o próprio registro
CREATE POLICY "employees_funcionario_own" ON public.employees
  FOR SELECT TO authenticated
  USING (public.is_funcionario() AND user_id = auth.uid());

CREATE POLICY "employees_funcionario_own_update" ON public.employees
  FOR UPDATE TO authenticated
  USING (public.is_funcionario() AND user_id = auth.uid())
  WITH CHECK (public.is_funcionario() AND user_id = auth.uid());

-- -----------------------------------------------------------
-- obras
-- -----------------------------------------------------------
CREATE POLICY "obras_gestor_contrato_all" ON public.obras
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

-- gestor_obra: vê apenas a própria obra
CREATE POLICY "obras_gestor_obra_select" ON public.obras
  FOR SELECT TO authenticated
  USING (
    public.is_gestor_obra()
    AND id = public.get_user_obra_id()
  );

-- funcionário: vê obras onde está alocado
CREATE POLICY "obras_funcionario_select" ON public.obras
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.obra_funcionarios of2
      WHERE of2.obra_id = id
      AND of2.employee_id = public.get_user_employee_id()
      AND of2.status = true
    )
  );

-- -----------------------------------------------------------
-- obra_funcionarios
-- -----------------------------------------------------------
CREATE POLICY "obra_funcionarios_gestor_contrato_all" ON public.obra_funcionarios
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "obra_funcionarios_gestor_obra_all" ON public.obra_funcionarios
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND obra_id = public.get_user_obra_id()
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND obra_id = public.get_user_obra_id()
  );

CREATE POLICY "obra_funcionarios_funcionario_select" ON public.obra_funcionarios
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- obra_veiculos
-- -----------------------------------------------------------
CREATE POLICY "obra_veiculos_gestor_contrato_all" ON public.obra_veiculos
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "obra_veiculos_gestor_obra_all" ON public.obra_veiculos
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND obra_id = public.get_user_obra_id()
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND obra_id = public.get_user_obra_id()
  );

CREATE POLICY "obra_veiculos_funcionario_select" ON public.obra_veiculos
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND obra_id IN (
      SELECT of2.obra_id FROM public.obra_funcionarios of2
      WHERE of2.employee_id = public.get_user_employee_id()
      AND of2.status = true
    )
  );

-- -----------------------------------------------------------
-- obra_fornecedores
-- -----------------------------------------------------------
CREATE POLICY "obra_fornecedores_gestor_contrato_all" ON public.obra_fornecedores
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "obra_fornecedores_gestor_obra_all" ON public.obra_fornecedores
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND obra_id = public.get_user_obra_id()
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND obra_id = public.get_user_obra_id()
  );

CREATE POLICY "obra_fornecedores_funcionario_select" ON public.obra_fornecedores
  FOR SELECT TO authenticated
  USING (public.is_funcionario());

-- -----------------------------------------------------------
-- vehicles
-- -----------------------------------------------------------
CREATE POLICY "vehicles_gestor_contrato_all" ON public.vehicles
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "vehicles_gestor_obra_all" ON public.vehicles
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(id)
  );

CREATE POLICY "vehicles_funcionario_select" ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND (
      responsavel_id = (
        SELECT id FROM public.employees
        WHERE user_id = auth.uid()
        LIMIT 1
      )
      OR public.is_vehicle_in_same_obra(id)
    )
  );

CREATE POLICY "vehicles_funcionario_update_km" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (
    public.is_funcionario()
    AND responsavel_id = (
      SELECT id FROM public.employees
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND responsavel_id = (
      SELECT id FROM public.employees
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- -----------------------------------------------------------
-- vehicle_documents
-- -----------------------------------------------------------
CREATE POLICY "vehicle_documents_gestor_contrato_all" ON public.vehicle_documents
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "vehicle_documents_gestor_obra_all" ON public.vehicle_documents
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  );

CREATE POLICY "vehicle_documents_funcionario_select" ON public.vehicle_documents
  FOR SELECT TO authenticated
  USING (public.is_funcionario() AND public.is_vehicle_in_same_obra(vehicle_id));

-- -----------------------------------------------------------
-- vehicle_km_cycles
-- -----------------------------------------------------------
CREATE POLICY "vehicle_km_cycles_gestor_contrato_all" ON public.vehicle_km_cycles
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "vehicle_km_cycles_gestor_obra_all" ON public.vehicle_km_cycles
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  );

CREATE POLICY "vehicle_km_cycles_funcionario_select" ON public.vehicle_km_cycles
  FOR SELECT TO authenticated
  USING (public.is_funcionario() AND public.is_vehicle_in_same_obra(vehicle_id));

-- -----------------------------------------------------------
-- vehicle_accessories
-- -----------------------------------------------------------
CREATE POLICY "vehicle_accessories_gestor_contrato_all" ON public.vehicle_accessories
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "vehicle_accessories_gestor_obra_all" ON public.vehicle_accessories
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  );

CREATE POLICY "vehicle_accessories_funcionario_select" ON public.vehicle_accessories
  FOR SELECT TO authenticated
  USING (public.is_funcionario() AND public.is_vehicle_in_same_obra(vehicle_id));

-- -----------------------------------------------------------
-- maintenance_records
-- -----------------------------------------------------------
CREATE POLICY "maintenance_gestor_contrato_all" ON public.maintenance_records
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "maintenance_gestor_obra_all" ON public.maintenance_records
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  );

CREATE POLICY "maintenance_funcionario_select" ON public.maintenance_records
  FOR SELECT TO authenticated
  USING (public.is_funcionario() AND public.is_vehicle_in_same_obra(vehicle_id));

-- -----------------------------------------------------------
-- mileage_records
-- -----------------------------------------------------------
CREATE POLICY "mileage_gestor_contrato_all" ON public.mileage_records
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "mileage_gestor_obra_all" ON public.mileage_records
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  );

-- funcionário: acesso completo aos próprios registros
CREATE POLICY "mileage_funcionario_own_all" ON public.mileage_records
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  )
  WITH CHECK (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- traffic_fines
-- -----------------------------------------------------------
CREATE POLICY "traffic_fines_gestor_contrato_all" ON public.traffic_fines
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "traffic_fines_gestor_obra_all" ON public.traffic_fines
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  );

CREATE POLICY "traffic_fines_funcionario_select" ON public.traffic_fines
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND (
      employee_id = public.get_user_employee_id()
      OR public.is_vehicle_in_same_obra(vehicle_id)
    )
  );

-- -----------------------------------------------------------
-- wash_records
-- -----------------------------------------------------------
CREATE POLICY "wash_records_gestor_contrato_all" ON public.wash_records
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "wash_records_gestor_obra_all" ON public.wash_records
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  );

CREATE POLICY "wash_records_funcionario_own" ON public.wash_records
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  )
  WITH CHECK (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- inspection_checklists
-- -----------------------------------------------------------
CREATE POLICY "inspection_checklists_gestor_contrato_all" ON public.inspection_checklists
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "inspection_checklists_gestor_obra_all" ON public.inspection_checklists
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  );

CREATE POLICY "inspection_checklists_funcionario_own" ON public.inspection_checklists
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  )
  WITH CHECK (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- inspection_items
-- -----------------------------------------------------------
CREATE POLICY "inspection_items_gestor_contrato_all" ON public.inspection_items
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "inspection_items_gestor_obra_all" ON public.inspection_items
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND EXISTS (
      SELECT 1 FROM public.inspection_checklists ic
      WHERE ic.id = checklist_id
      AND (
        public.is_vehicle_in_same_obra(ic.vehicle_id)
        OR public.is_employee_in_same_obra(ic.employee_id)
      )
    )
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND EXISTS (
      SELECT 1 FROM public.inspection_checklists ic
      WHERE ic.id = checklist_id
      AND (
        public.is_vehicle_in_same_obra(ic.vehicle_id)
        OR public.is_employee_in_same_obra(ic.employee_id)
      )
    )
  );

CREATE POLICY "inspection_items_funcionario_own" ON public.inspection_items
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.inspection_checklists ic
      WHERE ic.id = checklist_id
      AND ic.employee_id = public.get_user_employee_id()
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.inspection_checklists ic
      WHERE ic.id = checklist_id
      AND ic.employee_id = public.get_user_employee_id()
    )
  );

-- -----------------------------------------------------------
-- heavy_vehicle_inspections
-- -----------------------------------------------------------
CREATE POLICY "hvi_gestor_contrato_all" ON public.heavy_vehicle_inspections
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "hvi_gestor_obra_all" ON public.heavy_vehicle_inspections
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  );

CREATE POLICY "hvi_funcionario_own" ON public.heavy_vehicle_inspections
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  )
  WITH CHECK (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- heavy_vehicle_inspection_items
-- -----------------------------------------------------------
CREATE POLICY "hvii_gestor_contrato_all" ON public.heavy_vehicle_inspection_items
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "hvii_gestor_obra_all" ON public.heavy_vehicle_inspection_items
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND EXISTS (
      SELECT 1 FROM public.heavy_vehicle_inspections hvi
      WHERE hvi.id = inspection_id
      AND (
        public.is_vehicle_in_same_obra(hvi.vehicle_id)
        OR public.is_employee_in_same_obra(hvi.employee_id)
      )
    )
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND EXISTS (
      SELECT 1 FROM public.heavy_vehicle_inspections hvi
      WHERE hvi.id = inspection_id
      AND (
        public.is_vehicle_in_same_obra(hvi.vehicle_id)
        OR public.is_employee_in_same_obra(hvi.employee_id)
      )
    )
  );

CREATE POLICY "hvii_funcionario_own" ON public.heavy_vehicle_inspection_items
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.heavy_vehicle_inspections hvi
      WHERE hvi.id = inspection_id
      AND hvi.employee_id = public.get_user_employee_id()
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.heavy_vehicle_inspections hvi
      WHERE hvi.id = inspection_id
      AND hvi.employee_id = public.get_user_employee_id()
    )
  );

-- -----------------------------------------------------------
-- smoke_tests
-- -----------------------------------------------------------
CREATE POLICY "smoke_tests_gestor_contrato_all" ON public.smoke_tests
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "smoke_tests_gestor_obra_all" ON public.smoke_tests
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  );

CREATE POLICY "smoke_tests_funcionario_select" ON public.smoke_tests
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- driver_scores
-- -----------------------------------------------------------
CREATE POLICY "driver_scores_gestor_contrato_all" ON public.driver_scores
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "driver_scores_gestor_obra_all" ON public.driver_scores
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(employee_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(employee_id)
  );

CREATE POLICY "driver_scores_funcionario_own" ON public.driver_scores
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- damage_reports
-- -----------------------------------------------------------
CREATE POLICY "damage_reports_gestor_contrato_all" ON public.damage_reports
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "damage_reports_gestor_obra_all" ON public.damage_reports
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND (
      public.is_vehicle_in_same_obra(vehicle_id)
      OR public.is_employee_in_same_obra(employee_id)
    )
  );

CREATE POLICY "damage_reports_funcionario_own" ON public.damage_reports
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  )
  WITH CHECK (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- schedules
-- -----------------------------------------------------------
CREATE POLICY "schedules_gestor_contrato_all" ON public.schedules
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "schedules_gestor_obra_all" ON public.schedules
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(employee_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(employee_id)
  );

CREATE POLICY "schedules_funcionario_own" ON public.schedules
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- escala_periodos
-- -----------------------------------------------------------
CREATE POLICY "escala_periodos_gestor_contrato_all" ON public.escala_periodos
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "escala_periodos_gestor_obra_all" ON public.escala_periodos
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(employee_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_employee_in_same_obra(employee_id)
  );

CREATE POLICY "escala_periodos_funcionario_own" ON public.escala_periodos
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- tire_services
-- -----------------------------------------------------------
CREATE POLICY "tire_services_gestor_contrato_all" ON public.tire_services
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "tire_services_gestor_obra_all" ON public.tire_services
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND public.is_vehicle_in_same_obra(vehicle_id)
  );

CREATE POLICY "tire_services_funcionario_own" ON public.tire_services
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  )
  WITH CHECK (
    public.is_funcionario()
    AND employee_id = public.get_user_employee_id()
  );

-- -----------------------------------------------------------
-- profiles
-- -----------------------------------------------------------
CREATE POLICY "profiles_gestor_contrato_all" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "profiles_gestor_obra_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_gestor_obra());

CREATE POLICY "profiles_funcionario_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_funcionario() AND user_id = auth.uid());

CREATE POLICY "profiles_funcionario_own_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_funcionario() AND user_id = auth.uid())
  WITH CHECK (public.is_funcionario() AND user_id = auth.uid());

-- -----------------------------------------------------------
-- user_roles
-- -----------------------------------------------------------
CREATE POLICY "user_roles_gestor_contrato_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "user_roles_gestor_obra_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_gestor_obra());

CREATE POLICY "user_roles_funcionario_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_funcionario() AND user_id = auth.uid());

-- Permitir inserção na criação (trigger handle_new_user usa SECURITY DEFINER)
CREATE POLICY "user_roles_insert_own" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------
-- system_logs
-- -----------------------------------------------------------
CREATE POLICY "system_logs_gestor_contrato_all" ON public.system_logs
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

CREATE POLICY "system_logs_gestor_obra_select" ON public.system_logs
  FOR SELECT TO authenticated
  USING (public.is_gestor_obra());

-- Qualquer autenticado pode inserir log (auditoria)
CREATE POLICY "system_logs_insert_any" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);


-- ============================================================
-- SEÇÃO 10: STORAGE BUCKETS
-- ============================================================

-- Avatares (públicos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Fotos de funcionários (públicas)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-photos', 'employee-photos', true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Documentos de veículos (privados)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('vehicle-docs', 'vehicle-docs', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Inspeções (privados)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('inspections', 'inspections', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Avarias (privados)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('damage-reports', 'damage-reports', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Lavagens (privados)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('wash-records', 'wash-records', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Testes de fumaça (privados)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('smoke-tests', 'smoke-tests', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Multas (privados)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('traffic-fines', 'traffic-fines', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Políticas de storage — buckets públicos (leitura pública)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "employee_photos_public_read" ON storage.objects;
CREATE POLICY "employee_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'employee-photos');

-- Upload para autenticados (todos os buckets)
DROP POLICY IF EXISTS "storage_authenticated_upload" ON storage.objects;
CREATE POLICY "storage_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Update/delete para autenticados (dono do arquivo ou gestor_contrato)
DROP POLICY IF EXISTS "storage_authenticated_update" ON storage.objects;
CREATE POLICY "storage_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner OR public.is_gestor_contrato());

DROP POLICY IF EXISTS "storage_authenticated_delete" ON storage.objects;
CREATE POLICY "storage_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (auth.uid() = owner OR public.is_gestor_contrato());

-- Leitura de buckets privados (apenas autenticados)
DROP POLICY IF EXISTS "storage_private_read" ON storage.objects;
CREATE POLICY "storage_private_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('vehicle-docs','inspections','damage-reports','wash-records','smoke-tests','traffic-fines')
    AND auth.role() = 'authenticated'
  );


-- ============================================================
-- SEÇÃO 11: DADOS INICIAIS (SEED)
-- ============================================================

-- Escala padrão 5x2 (segunda a sexta)
INSERT INTO public.escala_tipos (nome, descricao, dias_trabalho, dias_folga, permite_sobreposicao)
VALUES ('5x2', 'Segunda a sexta, folga nos fins de semana', 5, 2, false)
ON CONFLICT DO NOTHING;

-- Escala 6x1
INSERT INTO public.escala_tipos (nome, descricao, dias_trabalho, dias_folga, permite_sobreposicao)
VALUES ('6x1', '6 dias de trabalho, 1 dia de folga', 6, 1, false)
ON CONFLICT DO NOTHING;

-- Escala 12x36
INSERT INTO public.escala_tipos (nome, descricao, dias_trabalho, dias_folga, permite_sobreposicao)
VALUES ('12x36', '12 horas de trabalho, 36 horas de folga', 1, 1, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
-- Próximo passo: Criar o primeiro usuário administrador via
-- Supabase Auth (painel ou API) e depois executar:
--
--   UPDATE public.user_roles
--   SET role = 'gestor_contrato'
--   WHERE user_id = '<uuid-do-admin>';
--
-- Ou usar a edge function create-user com tipo_acesso = 'gestor_contrato'.
-- ============================================================

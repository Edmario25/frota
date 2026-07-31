-- ============================================================
-- Migration: 20250823001223_77131604-4980-4626-a6f1-71a3ff9e7a36.sql
-- ============================================================
-- Create enums for better type safety
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor_frota', 'funcionario');
CREATE TYPE public.vehicle_type AS ENUM ('leve', 'pesado');
CREATE TYPE public.vehicle_status AS ENUM ('disponivel', 'em_uso', 'manutencao', 'inativo');
CREATE TYPE public.employee_status AS ENUM ('ativo', 'inativo', 'ferias', 'licenca');
CREATE TYPE public.maintenance_type AS ENUM ('preventiva', 'corretiva', 'emergencial');
CREATE TYPE public.maintenance_status AS ENUM ('agendada', 'em_andamento', 'concluida', 'cancelada');

-- User profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'funcionario',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  cargo TEXT NOT NULL,
  telefone TEXT,
  email TEXT NOT NULL,
  foto_url TEXT,
  status employee_status NOT NULL DEFAULT 'ativo',
  data_admissao DATE,
  departamento TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Vehicles table
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  placa TEXT NOT NULL UNIQUE,
  modelo TEXT NOT NULL,
  marca TEXT NOT NULL,
  ano INTEGER NOT NULL,
  cor TEXT,
  tipo vehicle_type NOT NULL,
  status vehicle_status NOT NULL DEFAULT 'disponivel',
  quilometragem_atual INTEGER NOT NULL DEFAULT 0,
  quilometragem_maxima_mensal INTEGER DEFAULT 2000,
  data_ultima_revisao DATE,
  responsavel_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Vehicle documents table
CREATE TABLE public.vehicle_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL, -- 'crlv', 'seguro', 'ipva', etc.
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_vencimento DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Schedules/Escalas table
CREATE TABLE public.schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  data_fim TIMESTAMP WITH TIME ZONE NOT NULL,
  local_trabalho TEXT,
  descricao TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Maintenance records table
CREATE TABLE public.maintenance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tipo maintenance_type NOT NULL,
  status maintenance_status NOT NULL DEFAULT 'agendada',
  data_agendada DATE NOT NULL,
  data_realizada DATE,
  quilometragem INTEGER,
  descricao TEXT NOT NULL,
  custo DECIMAL(10,2),
  oficina TEXT,
  responsavel TEXT,
  observacoes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Mileage records table
CREATE TABLE public.mileage_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  quilometragem_inicial INTEGER NOT NULL,
  quilometragem_final INTEGER,
  data_inicial TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_final TIMESTAMP WITH TIME ZONE,
  destino TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System logs table for audit trail
CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mileage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID DEFAULT auth.uid())
RETURNS app_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid ORDER BY created_at DESC LIMIT 1;
$$;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR ALL USING (public.get_user_role() = 'admin');

-- Create RLS policies for user_roles
CREATE POLICY "Admins can manage all user roles" ON public.user_roles
  FOR ALL USING (public.get_user_role() = 'admin');

CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

-- Create RLS policies for employees
CREATE POLICY "Employees can view their own data" ON public.employees
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins and gestors can view all employees" ON public.employees
  FOR SELECT USING (public.get_user_role() IN ('admin', 'gestor_frota'));

CREATE POLICY "Admins can manage all employees" ON public.employees
  FOR ALL USING (public.get_user_role() = 'admin');

-- Create RLS policies for vehicles
CREATE POLICY "All authenticated users can view vehicles" ON public.vehicles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and gestors can manage vehicles" ON public.vehicles
  FOR ALL USING (public.get_user_role() IN ('admin', 'gestor_frota'));

-- Create RLS policies for vehicle_documents
CREATE POLICY "All authenticated users can view vehicle documents" ON public.vehicle_documents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and gestors can manage vehicle documents" ON public.vehicle_documents
  FOR ALL USING (public.get_user_role() IN ('admin', 'gestor_frota'));

-- Create RLS policies for schedules
CREATE POLICY "Employees can view their own schedules" ON public.schedules
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins and gestors can view all schedules" ON public.schedules
  FOR SELECT USING (public.get_user_role() IN ('admin', 'gestor_frota'));

CREATE POLICY "Admins and gestors can manage schedules" ON public.schedules
  FOR ALL USING (public.get_user_role() IN ('admin', 'gestor_frota'));

-- Create RLS policies for maintenance_records
CREATE POLICY "All authenticated users can view maintenance records" ON public.maintenance_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and gestors can manage maintenance records" ON public.maintenance_records
  FOR ALL USING (public.get_user_role() IN ('admin', 'gestor_frota'));

-- Create RLS policies for mileage_records
CREATE POLICY "Employees can view their own mileage records" ON public.mileage_records
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "All authenticated users can create mileage records" ON public.mileage_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins and gestors can view all mileage records" ON public.mileage_records
  FOR SELECT USING (public.get_user_role() IN ('admin', 'gestor_frota'));

CREATE POLICY "Admins and gestors can manage mileage records" ON public.mileage_records
  FOR ALL USING (public.get_user_role() IN ('admin', 'gestor_frota'));

-- Create RLS policies for system_logs
CREATE POLICY "Admins can view all system logs" ON public.system_logs
  FOR SELECT USING (public.get_user_role() = 'admin');

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_maintenance_records_updated_at
  BEFORE UPDATE ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mileage_records_updated_at
  BEFORE UPDATE ON public.mileage_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'name', new.email),
    new.email
  );
  
  -- Assign default role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'funcionario');
  
  RETURN new;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_employees_user_id ON public.employees(user_id);
CREATE INDEX idx_employees_cpf ON public.employees(cpf);
CREATE INDEX idx_vehicles_placa ON public.vehicles(placa);
CREATE INDEX idx_vehicles_status ON public.vehicles(status);
CREATE INDEX idx_vehicles_responsavel ON public.vehicles(responsavel_id);
CREATE INDEX idx_schedules_employee ON public.schedules(employee_id);
CREATE INDEX idx_schedules_date ON public.schedules(data_inicio, data_fim);
CREATE INDEX idx_maintenance_vehicle ON public.maintenance_records(vehicle_id);
CREATE INDEX idx_maintenance_status ON public.maintenance_records(status);
CREATE INDEX idx_mileage_vehicle ON public.mileage_records(vehicle_id);
CREATE INDEX idx_mileage_employee ON public.mileage_records(employee_id);

-- ============================================================
-- Migration: 20250823001300_bac95752-9ed2-4e43-99a4-e6924e2aaf76.sql
-- ============================================================
-- Fix function security by setting proper search_path
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

CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID DEFAULT auth.uid())
RETURNS app_role
LANGUAGE SQL
SECURITY DEFINER
STABLE SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid ORDER BY created_at DESC LIMIT 1;
$$;

-- ============================================================
-- Migration: 20250823011357_faf4e052-0256-4410-9f0d-58226d6c754d.sql
-- ============================================================
-- Add rental companies table
CREATE TABLE public.rental_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  contato_responsavel TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rental_companies ENABLE ROW LEVEL SECURITY;

-- Create policies for rental companies
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
CREATE POLICY "Admins and gestors can manage rental companies"
ON public.rental_companies 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can view rental companies"
ON public.rental_companies 
FOR SELECT 
USING (true);

-- Add trigger for timestamps
CREATE TRIGGER update_rental_companies_updated_at
BEFORE UPDATE ON public.rental_companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create ownership type enum
CREATE TYPE public.ownership_type AS ENUM ('proprio', 'alugado');

-- Add new columns to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN tipo_propriedade ownership_type DEFAULT 'proprio',
ADD COLUMN rental_company_id UUID REFERENCES public.rental_companies(id);

-- Update existing vehicles to have default ownership type
UPDATE public.vehicles SET tipo_propriedade = 'proprio' WHERE tipo_propriedade IS NULL;


-- ============================================================
-- Migration: 20250823012039_691a7008-ec89-495c-9644-266f1617aa4a.sql
-- ============================================================
-- Update RLS policies for rental_companies to allow authenticated users to insert
DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;

DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can create rental companies" 
ON public.rental_companies 
FOR INSERT 
WITH CHECK (true);

-- Update policy for management to be more specific
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;

DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
CREATE POLICY "Admins and gestors can manage rental companies" 
ON public.rental_companies 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));


-- ============================================================
-- Migration: 20250823013034_1bda35ac-266c-428a-9750-74d88fccc9c7.sql
-- ============================================================
-- Update RLS policies for employees to allow authenticated users to insert
-- First, let's add a policy for creating employees
DROP POLICY IF EXISTS "All authenticated users can create employees" ON public.employees;
DROP POLICY IF EXISTS "All authenticated users can create employees" ON public.employees;
CREATE POLICY "All authenticated users can create employees"
ON public.employees 
FOR INSERT 
WITH CHECK (true);

-- Update existing policies to be more permissive for admins
DROP POLICY IF EXISTS "Admins can manage all employees" ON public.employees;

DROP POLICY IF EXISTS "Admins and gestors can manage all employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage all employees" ON public.employees;
CREATE POLICY "Admins and gestors can manage all employees" 
ON public.employees 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));


-- ============================================================
-- Migration: 20250823014033_b96f1cb9-a99d-4516-9005-727af383fae9.sql
-- ============================================================
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


-- ============================================================
-- Migration: 20250823014313_b3d8254c-34a5-4a08-9865-cef5b10f826e.sql
-- ============================================================
-- Remover campos antigos cargo e departamento da tabela employees
ALTER TABLE public.employees 
DROP COLUMN IF EXISTS cargo,
DROP COLUMN IF EXISTS departamento;

-- ============================================================
-- Migration: 20250823014556_f6dffd3a-45f3-4030-b53b-c9296becda21.sql
-- ============================================================
-- Verificar e corrigir as políticas RLS para employees
-- O problema é que as políticas podem estar muito restritivas

-- Primeiro, vamos remover as políticas existentes e recriar corretamente
DROP POLICY IF EXISTS "All authenticated users can create employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage all employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can view all employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can view their own data" ON public.employees;

-- Criar políticas mais permissivas para permitir cadastro
DROP POLICY IF EXISTS "Anyone authenticated can create employees" ON public.employees;
DROP POLICY IF EXISTS "Anyone authenticated can create employees" ON public.employees;
CREATE POLICY "Anyone authenticated can create employees"
ON public.employees 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone authenticated can view employees" ON public.employees;
DROP POLICY IF EXISTS "Anyone authenticated can view employees" ON public.employees;
CREATE POLICY "Anyone authenticated can view employees"
ON public.employees 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage all employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can manage all employees" ON public.employees;
CREATE POLICY "Admins can manage all employees"
ON public.employees 
FOR ALL 
TO authenticated
USING (get_user_role() = 'admin'::app_role)
WITH CHECK (get_user_role() = 'admin'::app_role);

DROP POLICY IF EXISTS "Users can update their own employee data" ON public.employees;
DROP POLICY IF EXISTS "Users can update their own employee data" ON public.employees;
CREATE POLICY "Users can update their own employee data"
ON public.employees 
FOR UPDATE 
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- ============================================================
-- Migration: 20250823014845_e0ba0544-cd58-4abd-aae5-02cba99a5c54.sql
-- ============================================================
-- Desabilitar temporariamente RLS para employees e recriar com políticas mais simples
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;

-- Reabilitar RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Remover todas as políticas existentes
DROP POLICY IF EXISTS "Anyone authenticated can create employees" ON public.employees;
DROP POLICY IF EXISTS "Anyone authenticated can view employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can manage all employees" ON public.employees;
DROP POLICY IF EXISTS "Users can update their own employee data" ON public.employees;

-- Criar política mais ampla para permitir operações
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.employees;
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.employees;
CREATE POLICY "Enable all operations for authenticated users"
ON public.employees 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);


-- ============================================================
-- Migration: 20250823015320_d90ecba0-3694-4c3d-9c29-feb8b3315982.sql
-- ============================================================
-- Migração de usuário de teste ignorada em produção.
-- O usuário admin deve ser criado via Supabase Auth (painel ou edge function create-user).


-- ============================================================
-- Migration: 20250823015609_12d64142-973c-4411-a022-d5cfc56ccd5b.sql
-- ============================================================
-- Remove a FK de profiles.user_id → auth.users para permitir perfis gerenciados pela aplicação
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- Inserção de usuário de teste ignorada em produção.


-- ============================================================
-- Migration: 20250823021350_1718c08b-be15-4cbc-b5b1-cb0cf3e35a11.sql
-- ============================================================
-- Corrigir políticas RLS para vehicles
-- Remover políticas existentes
DROP POLICY IF EXISTS "Admins and gestors can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;

-- Criar políticas mais permissivas
DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;
CREATE POLICY "All authenticated users can view vehicles"
ON public.vehicles 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can create vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "All authenticated users can create vehicles" ON public.vehicles;
CREATE POLICY "All authenticated users can create vehicles"
ON public.vehicles 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and gestors can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins and gestors can manage vehicles" ON public.vehicles;
CREATE POLICY "Admins and gestors can manage vehicles"
ON public.vehicles 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));


-- ============================================================
-- Migration: 20250823021545_b49c53c4-dc9e-4a78-9209-8abc2a1e8a58.sql
-- ============================================================
-- Corrigir políticas RLS para outras tabelas relacionadas à frota
-- Tabela rental_companies
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;

DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can view rental companies" 
ON public.rental_companies 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can create rental companies"
ON public.rental_companies 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
CREATE POLICY "Admins and gestors can manage rental companies"
ON public.rental_companies 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Tabela maintenance_records
DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON public.maintenance_records;
DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON public.maintenance_records;

DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON public.maintenance_records;
DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON public.maintenance_records;
CREATE POLICY "All authenticated users can view maintenance records" 
ON public.maintenance_records 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can create maintenance records" ON public.maintenance_records;
DROP POLICY IF EXISTS "All authenticated users can create maintenance records" ON public.maintenance_records;
CREATE POLICY "All authenticated users can create maintenance records"
ON public.maintenance_records 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON public.maintenance_records;
DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON public.maintenance_records;
CREATE POLICY "Admins and gestors can manage maintenance records"
ON public.maintenance_records 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));


-- ============================================================
-- Migration: 20250823023056_84c68359-66f3-4db4-a852-58302c4d4f51.sql
-- ============================================================
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


-- ============================================================
-- Migration: 20250823131753_54565193-6397-4c00-ba0d-2234e77c4a68.sql
-- ============================================================
-- Create table to track monthly KM cycles
CREATE TABLE public.vehicle_km_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  cycle_start_date DATE NOT NULL,
  cycle_end_date DATE NOT NULL,
  km_inicial INTEGER NOT NULL,
  km_final INTEGER,
  limite_km_mensal INTEGER NOT NULL,
  km_rodados INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'fechado')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vehicle_km_cycles ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Admins and gestors can manage vehicle km cycles" ON public.vehicle_km_cycles;
DROP POLICY IF EXISTS "Admins and gestors can manage vehicle km cycles" ON public.vehicle_km_cycles;
CREATE POLICY "Admins and gestors can manage vehicle km cycles"
ON public.vehicle_km_cycles 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "All authenticated users can view vehicle km cycles" ON public.vehicle_km_cycles;
DROP POLICY IF EXISTS "All authenticated users can view vehicle km cycles" ON public.vehicle_km_cycles;
CREATE POLICY "All authenticated users can view vehicle km cycles"
ON public.vehicle_km_cycles 
FOR SELECT 
USING (true);

-- Create indexes for better performance
CREATE INDEX idx_vehicle_km_cycles_vehicle_id ON public.vehicle_km_cycles(vehicle_id);
CREATE INDEX idx_vehicle_km_cycles_status ON public.vehicle_km_cycles(status);
CREATE INDEX idx_vehicle_km_cycles_dates ON public.vehicle_km_cycles(cycle_start_date, cycle_end_date);

-- Create function to calculate current cycle for a vehicle
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
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update km cycles when vehicle km is updated
CREATE OR REPLACE FUNCTION update_vehicle_km_cycle()
RETURNS TRIGGER AS $$
BEGIN
  -- Update current cycle when vehicle km changes
  PERFORM get_current_km_cycle(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_vehicle_km_cycle
  AFTER UPDATE OF quilometragem_atual ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_km_cycle();

-- Create function to close expired cycles
CREATE OR REPLACE FUNCTION close_expired_km_cycles()
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- Migration: 20250823131832_b9fd0146-2ed7-4ea4-ba55-dd52bf19afb4.sql
-- ============================================================
-- Fix security warnings by setting search_path for functions
DROP TRIGGER IF EXISTS trigger_update_vehicle_km_cycle ON vehicles;
DROP FUNCTION IF EXISTS get_current_km_cycle(UUID);
DROP FUNCTION IF EXISTS update_vehicle_km_cycle();
DROP FUNCTION IF EXISTS close_expired_km_cycles();

-- Recreate functions with proper security settings
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

-- ============================================================
-- Migration: 20250823132046_f05ad97c-deac-480f-bb7d-8f99ca1b2fef.sql
-- ============================================================
-- First drop the trigger and then the functions
DROP TRIGGER IF EXISTS trigger_update_vehicle_km_cycle ON vehicles;
DROP FUNCTION IF EXISTS get_current_km_cycle(UUID);
DROP FUNCTION IF EXISTS update_vehicle_km_cycle();
DROP FUNCTION IF EXISTS close_expired_km_cycles();

-- Recreate functions with proper security settings
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

-- Recreate the trigger
CREATE TRIGGER trigger_update_vehicle_km_cycle
  AFTER UPDATE OF quilometragem_atual ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_km_cycle();

-- ============================================================
-- Migration: 20250823211206_f7d85150-2970-4561-8fe4-d0859d548d01.sql
-- ============================================================
-- Fix ambiguous column reference in get_current_km_cycle function
DROP FUNCTION IF EXISTS public.get_current_km_cycle(uuid);

CREATE OR REPLACE FUNCTION public.get_current_km_cycle(p_vehicle_id uuid)
 RETURNS TABLE(cycle_id uuid, cycle_start_date date, cycle_end_date date, km_inicial integer, limite_km_mensal integer, km_rodados integer, days_remaining integer, percentage_used numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_date DATE;
  v_current_km INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_cycle_record RECORD;
BEGIN
  -- Get vehicle creation date and current km
  SELECT v.created_at::DATE, v.quilometragem_atual 
  INTO v_created_date, v_current_km
  FROM vehicles v
  WHERE v.id = p_vehicle_id;
  
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
  SELECT vkc.* INTO v_cycle_record
  FROM vehicle_km_cycles vkc
  WHERE vkc.vehicle_id = p_vehicle_id 
    AND vkc.cycle_start_date = v_cycle_start
    AND vkc.status = 'ativo';
    
  IF NOT FOUND THEN
    -- Get previous cycle's final km or use vehicle's initial km
    DECLARE
      v_previous_km INTEGER := 0;
      v_limit INTEGER := 2000;
    BEGIN
      -- Get limit from vehicle
      SELECT v.quilometragem_maxima_mensal INTO v_limit 
      FROM vehicles v WHERE v.id = p_vehicle_id;
      
      -- Get previous cycle final km
      SELECT COALESCE(vkc_prev.km_final, vkc_prev.km_inicial) INTO v_previous_km
      FROM vehicle_km_cycles vkc_prev
      WHERE vkc_prev.vehicle_id = p_vehicle_id 
        AND vkc_prev.cycle_end_date < v_cycle_start 
      ORDER BY vkc_prev.cycle_end_date DESC 
      LIMIT 1;
      
      IF v_previous_km IS NULL THEN
        -- First cycle, use vehicle's creation km
        SELECT v.quilometragem_atual INTO v_previous_km 
        FROM vehicles v
        WHERE v.id = p_vehicle_id;
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
    UPDATE vehicle_km_cycles vkc_update
    SET km_rodados = GREATEST(0, v_current_km - vkc_update.km_inicial),
        updated_at = now()
    WHERE vkc_update.id = v_cycle_record.id
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
$function$;

-- ============================================================
-- Migration: 20250823231114_22c918eb-b436-42b1-8f57-9a14fe0be7d8.sql
-- ============================================================
-- Inserção de perfil/role de administrador de teste ignorada em produção.


-- ============================================================
-- Migration: 20250823231140_6691a7da-4899-4db6-bb79-77251349fef7.sql
-- ============================================================
-- Garante unique constraint em profiles.user_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'profiles_user_id_key'
        AND table_name = 'profiles'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- Inserção de perfil/role de administrador de teste ignorada em produção.


-- ============================================================
-- Migration: 20250823231605_c9d57296-191c-4001-840d-2a7caee6e445.sql
-- ============================================================
-- Reset admin password in auth.users
-- Note: This will update the password hash to match "123456"

UPDATE auth.users 
SET 
  encrypted_password = crypt('123456', gen_salt('bf')),
  updated_at = NOW()
WHERE email = 'admin@teste.com';

-- ============================================================
-- Migration: 20250823231914_a4e93f37-51e6-4a8a-99bb-1fb67633e95e.sql
-- ============================================================
-- Confirm emails for registered employees
UPDATE auth.users
SET
  email_confirmed_at = NOW(),
  updated_at = NOW()
WHERE email IN ('edimario.ribeiro@conexx.net.br', 'arthur@conexx.net.br');


-- ============================================================
-- Migration: 20250823231940_d23604b4-c656-424e-b837-cc3bc638c2a5.sql
-- ============================================================
-- Confirm emails for registered employees (corrected)
UPDATE auth.users 
SET 
  email_confirmed_at = NOW(),
  updated_at = NOW()
WHERE email IN ('edimario.ribeiro@conexx.net.br', 'arthur@conexx.net.br') 
  AND email_confirmed_at IS NULL;

-- ============================================================
-- Migration: 20250823232714_057e3947-1551-4b15-9dfa-ce4acdf6af27.sql
-- ============================================================
-- Atualizar políticas RLS para funcionários verem apenas seus próprios dados

-- Atualizar política de schedules para funcionários verem apenas suas próprias escalas
DROP POLICY IF EXISTS "Employees can view their own schedules" ON public.schedules;
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

-- Política para mileage_records - funcionários só veem seus próprios registros
DROP POLICY IF EXISTS "Employees can view their own mileage records" ON public.mileage_records;
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

-- Nova política para vehicles - funcionários só veem veículos atribuídos a eles
DROP POLICY IF EXISTS "Employees can view assigned vehicles" ON public.vehicles;
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

-- Política para employees - funcionários só veem seu próprio cadastro
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
CREATE POLICY "Admins and gestors can manage employees"
ON public.employees 
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Employees can view their own profile" ON public.employees;
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


-- ============================================================
-- Migration: 20250823232814_0aa9229c-d6db-4f0c-a7eb-7f789e7e4e08.sql
-- ============================================================
-- Atualizar políticas RLS para funcionários verem apenas seus próprios dados

-- Atualizar política de schedules para funcionários verem apenas suas próprias escalas
DROP POLICY IF EXISTS "Employees can view their own schedules" ON public.schedules;
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

-- Política para mileage_records - funcionários só veem seus próprios registros
DROP POLICY IF EXISTS "Employees can view their own mileage records" ON public.mileage_records;
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

-- Nova política para vehicles - funcionários só veem veículos atribuídos a eles
DROP POLICY IF EXISTS "Employees can view assigned vehicles" ON public.vehicles;
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

-- Política para employees - funcionários só veem seu próprio cadastro
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
CREATE POLICY "Admins and gestors can manage employees"
ON public.employees
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Employees can view their own profile" ON public.employees;
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


-- ============================================================
-- Migration: 20250823232833_56095b35-e153-4f00-851c-32967c361f75.sql
-- ============================================================
-- Migração de atribuição de roles para usuários de teste ignorada em produção.
-- Usuários e roles devem ser criados via painel Supabase Auth ou edge function create-user.


-- ============================================================
-- Migration: 20250823232918_d7a44871-69dc-4df2-8912-fd232fe2ae7d.sql
-- ============================================================
-- Corrigir políticas RLS para funcionários - Parte 1: Remover políticas existentes

-- Remover todas as políticas existentes da tabela employees
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can view their own profile" ON public.employees;

-- Recriar políticas para employees de forma correta
DROP POLICY IF EXISTS "Admins and gestors can manage all employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage all employees" ON public.employees;
CREATE POLICY "Admins and gestors can manage all employees"
ON public.employees 
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Employees can view their own data" ON public.employees;
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


-- ============================================================
-- Migration: 20250823233020_fba5f6ed-c380-44ee-b71a-4ab91c8a3723.sql
-- ============================================================
-- Garantir que os funcionários tenham o role correto

-- Primeiro, verificar se arthur@conexx.net.br tem um role atribuído
-- Se não tiver, atribuir o role de funcionario

-- Inserir role de funcionario para arthur se não existir
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id,
  'funcionario'::app_role
FROM auth.users au 
WHERE au.email = 'arthur@conexx.net.br'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = au.id
  );

-- Inserir role de funcionario para edimario se não existir  
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id,
  'funcionario'::app_role
FROM auth.users au 
WHERE au.email = 'edimario.ribeiro@conexx.net.br'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = au.id
  );

-- Garantir que admin@teste.com tenha role de admin
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id,
  'admin'::app_role
FROM auth.users au 
WHERE au.email = 'admin@teste.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = au.id
  );

-- Remover qualquer role incorreto para os funcionários (caso tenham admin)
DELETE FROM public.user_roles 
WHERE user_id IN (
  SELECT au.id FROM auth.users au 
  WHERE au.email IN ('arthur@conexx.net.br', 'edimario.ribeiro@conexx.net.br')
) AND role != 'funcionario';

-- ============================================================
-- Migration: 20250825224627_bace1905-33fc-4edf-b55b-7517bbbe9cf0.sql
-- ============================================================
-- Corrigir a função get_current_km_cycle para calcular corretamente os km rodados
CREATE OR REPLACE FUNCTION public.get_current_km_cycle(p_vehicle_id uuid)
 RETURNS TABLE(cycle_id uuid, cycle_start_date date, cycle_end_date date, km_inicial integer, limite_km_mensal integer, km_rodados integer, days_remaining integer, percentage_used numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_date DATE;
  v_current_km INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_cycle_record RECORD;
BEGIN
  -- Get vehicle creation date and current km
  SELECT v.created_at::DATE, v.quilometragem_atual 
  INTO v_created_date, v_current_km
  FROM vehicles v
  WHERE v.id = p_vehicle_id;
  
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
  SELECT vkc.* INTO v_cycle_record
  FROM vehicle_km_cycles vkc
  WHERE vkc.vehicle_id = p_vehicle_id 
    AND vkc.cycle_start_date = v_cycle_start
    AND vkc.status = 'ativo';
    
  IF NOT FOUND THEN
    -- Get previous cycle's final km or use vehicle's initial km
    DECLARE
      v_previous_km INTEGER := 0;
      v_limit INTEGER := 2000;
    BEGIN
      -- Get limit from vehicle
      SELECT v.quilometragem_maxima_mensal INTO v_limit 
      FROM vehicles v WHERE v.id = p_vehicle_id;
      
      -- Get previous cycle final km
      SELECT COALESCE(vkc_prev.km_final, vkc_prev.km_inicial) INTO v_previous_km
      FROM vehicle_km_cycles vkc_prev
      WHERE vkc_prev.vehicle_id = p_vehicle_id 
        AND vkc_prev.cycle_end_date < v_cycle_start 
      ORDER BY vkc_prev.cycle_end_date DESC 
      LIMIT 1;
      
      -- If no previous cycle found, use current km as starting point
      IF v_previous_km IS NULL THEN
        v_previous_km := v_current_km;
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
    -- Update existing cycle with current km calculation
    UPDATE vehicle_km_cycles 
    SET km_rodados = GREATEST(0, v_current_km - km_inicial),
        updated_at = now()
    WHERE id = v_cycle_record.id
    RETURNING * INTO v_cycle_record;
  END IF;
  
  -- Return cycle information with recalculated km_rodados
  RETURN QUERY SELECT 
    v_cycle_record.id,
    v_cycle_record.cycle_start_date,
    v_cycle_record.cycle_end_date,
    v_cycle_record.km_inicial,
    v_cycle_record.limite_km_mensal,
    GREATEST(0, v_current_km - v_cycle_record.km_inicial) as km_rodados_calculated,
    (v_cycle_record.cycle_end_date - v_current_date)::INTEGER,
    CASE 
      WHEN v_cycle_record.limite_km_mensal > 0 
      THEN ROUND((GREATEST(0, v_current_km - v_cycle_record.km_inicial)::NUMERIC / v_cycle_record.limite_km_mensal::NUMERIC) * 100, 2)
      ELSE 0::NUMERIC
    END;
END;
$function$;

-- ============================================================
-- Migration: 20250825224651_72313b70-6b41-4404-929c-9f197579a071.sql
-- ============================================================
-- Corrigir a função get_current_km_cycle para calcular corretamente os km rodados
CREATE OR REPLACE FUNCTION public.get_current_km_cycle(p_vehicle_id uuid)
 RETURNS TABLE(cycle_id uuid, cycle_start_date date, cycle_end_date date, km_inicial integer, limite_km_mensal integer, km_rodados integer, days_remaining integer, percentage_used numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_date DATE;
  v_current_km INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_cycle_record RECORD;
BEGIN
  -- Get vehicle creation date and current km
  SELECT v.created_at::DATE, v.quilometragem_atual 
  INTO v_created_date, v_current_km
  FROM vehicles v
  WHERE v.id = p_vehicle_id;
  
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
  SELECT vkc.* INTO v_cycle_record
  FROM vehicle_km_cycles vkc
  WHERE vkc.vehicle_id = p_vehicle_id 
    AND vkc.cycle_start_date = v_cycle_start
    AND vkc.status = 'ativo';
    
  IF NOT FOUND THEN
    -- Get previous cycle's final km or use vehicle's initial km
    DECLARE
      v_previous_km INTEGER := 0;
      v_limit INTEGER := 2000;
    BEGIN
      -- Get limit from vehicle
      SELECT v.quilometragem_maxima_mensal INTO v_limit 
      FROM vehicles v WHERE v.id = p_vehicle_id;
      
      -- Get previous cycle final km
      SELECT COALESCE(vkc_prev.km_final, vkc_prev.km_inicial) INTO v_previous_km
      FROM vehicle_km_cycles vkc_prev
      WHERE vkc_prev.vehicle_id = p_vehicle_id 
        AND vkc_prev.cycle_end_date < v_cycle_start 
      ORDER BY vkc_prev.cycle_end_date DESC 
      LIMIT 1;
      
      -- If no previous cycle found, use current km as starting point
      IF v_previous_km IS NULL THEN
        v_previous_km := v_current_km;
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
    -- Update existing cycle with current km calculation
    UPDATE vehicle_km_cycles 
    SET km_rodados = GREATEST(0, v_current_km - km_inicial),
        updated_at = now()
    WHERE id = v_cycle_record.id
    RETURNING * INTO v_cycle_record;
  END IF;
  
  -- Return cycle information with recalculated km_rodados
  RETURN QUERY SELECT 
    v_cycle_record.id,
    v_cycle_record.cycle_start_date,
    v_cycle_record.cycle_end_date,
    v_cycle_record.km_inicial,
    v_cycle_record.limite_km_mensal,
    GREATEST(0, v_current_km - v_cycle_record.km_inicial) as km_rodados_calculated,
    (v_cycle_record.cycle_end_date - v_current_date)::INTEGER,
    CASE 
      WHEN v_cycle_record.limite_km_mensal > 0 
      THEN ROUND((GREATEST(0, v_current_km - v_cycle_record.km_inicial)::NUMERIC / v_cycle_record.limite_km_mensal::NUMERIC) * 100, 2)
      ELSE 0::NUMERIC
    END;
END;
$function$;

-- ============================================================
-- Migration: 20250825224916_dcbbd9ca-f761-4fb9-8544-09e41b472cd1.sql
-- ============================================================
-- Corrigir a função get_current_km_cycle para resolver a ambiguidade de km_inicial
CREATE OR REPLACE FUNCTION public.get_current_km_cycle(p_vehicle_id uuid)
 RETURNS TABLE(cycle_id uuid, cycle_start_date date, cycle_end_date date, km_inicial integer, limite_km_mensal integer, km_rodados integer, days_remaining integer, percentage_used numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_date DATE;
  v_current_km INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_cycle_record RECORD;
BEGIN
  -- Get vehicle creation date and current km
  SELECT v.created_at::DATE, v.quilometragem_atual 
  INTO v_created_date, v_current_km
  FROM vehicles v
  WHERE v.id = p_vehicle_id;
  
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
  SELECT vkc.* INTO v_cycle_record
  FROM vehicle_km_cycles vkc
  WHERE vkc.vehicle_id = p_vehicle_id 
    AND vkc.cycle_start_date = v_cycle_start
    AND vkc.status = 'ativo';
    
  IF NOT FOUND THEN
    -- Get previous cycle's final km or use vehicle's initial km
    DECLARE
      v_previous_km INTEGER := 0;
      v_limit INTEGER := 2000;
    BEGIN
      -- Get limit from vehicle
      SELECT v.quilometragem_maxima_mensal INTO v_limit 
      FROM vehicles v WHERE v.id = p_vehicle_id;
      
      -- Get previous cycle final km
      SELECT COALESCE(vkc_prev.km_final, vkc_prev.km_inicial) INTO v_previous_km
      FROM vehicle_km_cycles vkc_prev
      WHERE vkc_prev.vehicle_id = p_vehicle_id 
        AND vkc_prev.cycle_end_date < v_cycle_start 
      ORDER BY vkc_prev.cycle_end_date DESC 
      LIMIT 1;
      
      -- If no previous cycle found, use current km as starting point
      IF v_previous_km IS NULL THEN
        v_previous_km := v_current_km;
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
    -- Update existing cycle with current km calculation
    UPDATE vehicle_km_cycles 
    SET km_rodados = GREATEST(0, v_current_km - vehicle_km_cycles.km_inicial),
        updated_at = now()
    WHERE id = v_cycle_record.id
    RETURNING * INTO v_cycle_record;
  END IF;
  
  -- Return cycle information with recalculated km_rodados
  RETURN QUERY SELECT 
    v_cycle_record.id,
    v_cycle_record.cycle_start_date,
    v_cycle_record.cycle_end_date,
    v_cycle_record.km_inicial,
    v_cycle_record.limite_km_mensal,
    GREATEST(0, v_current_km - v_cycle_record.km_inicial) as km_rodados_calculated,
    (v_cycle_record.cycle_end_date - v_current_date)::INTEGER,
    CASE 
      WHEN v_cycle_record.limite_km_mensal > 0 
      THEN ROUND((GREATEST(0, v_current_km - v_cycle_record.km_inicial)::NUMERIC / v_cycle_record.limite_km_mensal::NUMERIC) * 100, 2)
      ELSE 0::NUMERIC
    END;
END;
$function$;

-- ============================================================
-- Migration: 20250825225524_87c60c82-63e4-4d89-b1a0-f6d5c8422c08.sql
-- ============================================================
-- Adicionar política para permitir que funcionários atualizem apenas a quilometragem dos seus próprios veículos
DROP POLICY IF EXISTS "Employees can update their own vehicle mileage" ON public.vehicles;
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


-- ============================================================
-- Migration: 20250825232721_f10464f9-75af-4128-8542-f1c53fc4fa89.sql
-- ============================================================
-- Atualizar política RLS para funcionários visualizarem apenas manutenções dos seus veículos
DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON maintenance_records;

DROP POLICY IF EXISTS "Employees can view maintenance records of their assigned vehicles" ON maintenance_records;
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


-- ============================================================
-- Migration: 20250825233049_5c38d938-f900-4931-8356-9b3b721345aa.sql
-- ============================================================
-- Inserir registros de manutenção de teste para os veículos existentes
INSERT INTO maintenance_records (
  vehicle_id, 
  tipo, 
  descricao, 
  data_agendada, 
  status, 
  created_by
) VALUES 
  -- Para o veículo do Arthur (SIS3I84)
  ('dc557d7d-b649-4d1f-85f8-b20289542d21', 'preventiva', 'Revisão dos 10.000 km', '2025-01-30', 'agendada', '2f009dd7-696b-4d9a-839c-8c044658c919'),
  ('dc557d7d-b649-4d1f-85f8-b20289542d21', 'corretiva', 'Troca de pastilhas de freio', '2025-01-25', 'em_andamento', '2f009dd7-696b-4d9a-839c-8c044658c919'),
  
  -- Para o veículo do Edimario (QQX1G30)  
  ('3a7b5098-7ef6-4258-a715-f7b08d37f9bd', 'preventiva', 'Alinhamento e balanceamento', '2025-02-01', 'agendada', 'ccba4073-b6b7-4d0f-bb06-3cd24e18c6cc'),
  ('3a7b5098-7ef6-4258-a715-f7b08d37f9bd', 'corretiva', 'Reparo no sistema de direção', '2025-01-20', 'concluida', 'ccba4073-b6b7-4d0f-bb06-3cd24e18c6cc');

-- ============================================================
-- Migration: 20250825233536_16f5e656-2d81-4092-b176-adfd663f6b29.sql
-- ============================================================
-- Corrigir política RLS para manutenção - colaboradores só veem manutenções dos seus veículos
DROP POLICY IF EXISTS "Employees can view maintenance records of their assigned vehicles" ON maintenance_records;
DROP POLICY IF EXISTS "All authenticated users can create maintenance records" ON maintenance_records;
DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON maintenance_records;

-- Política para visualização
DROP POLICY IF EXISTS "View maintenance records policy" ON maintenance_records;
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

-- Política para criação
DROP POLICY IF EXISTS "Create maintenance records policy" ON maintenance_records;
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

-- Política para atualização
DROP POLICY IF EXISTS "Update maintenance records policy" ON maintenance_records;
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

-- Política para exclusão (apenas admins e gestores)
DROP POLICY IF EXISTS "Delete maintenance records policy" ON maintenance_records;
DROP POLICY IF EXISTS "Delete maintenance records policy" ON maintenance_records;
CREATE POLICY "Delete maintenance records policy"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825233648_5d1cc4b4-b1f0-4375-b620-bda049220c60.sql
-- ============================================================
-- Corrigir política RLS para manutenção - colaboradores só veem manutenções dos seus veículos
DROP POLICY IF EXISTS "Employees can view maintenance records of their assigned vehicles" ON maintenance_records;
DROP POLICY IF EXISTS "All authenticated users can create maintenance records" ON maintenance_records;
DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON maintenance_records;

-- Política para visualização
DROP POLICY IF EXISTS "View maintenance records policy" ON maintenance_records;
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

-- Política para criação
DROP POLICY IF EXISTS "Create maintenance records policy" ON maintenance_records;
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

-- Política para atualização
DROP POLICY IF EXISTS "Update maintenance records policy" ON maintenance_records;
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

-- Política para exclusão (apenas admins e gestores)
DROP POLICY IF EXISTS "Delete maintenance records policy" ON maintenance_records;
DROP POLICY IF EXISTS "Delete maintenance records policy" ON maintenance_records;
CREATE POLICY "Delete maintenance records policy"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825233740_05f4dd3f-5c74-4363-8044-d19a84405160.sql
-- ============================================================
-- Primeiro, vamos ver as políticas existentes
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'maintenance_records';

-- Dropar TODAS as políticas existentes
DROP POLICY IF EXISTS "View maintenance records policy" ON maintenance_records;
DROP POLICY IF EXISTS "Create maintenance records policy" ON maintenance_records; 
DROP POLICY IF EXISTS "Update maintenance records policy" ON maintenance_records;
DROP POLICY IF EXISTS "Delete maintenance records policy" ON maintenance_records;

-- ============================================================
-- Migration: 20250825233805_6d70b7cd-3df1-4f50-aeec-25f47c148491.sql
-- ============================================================
-- Recriar políticas RLS para maintenance_records com permissões específicas por usuário

-- Política para visualização
DROP POLICY IF EXISTS "maintenance_select_policy" ON maintenance_records;
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

-- Política para criação
DROP POLICY IF EXISTS "maintenance_insert_policy" ON maintenance_records;
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

-- Política para atualização
DROP POLICY IF EXISTS "maintenance_update_policy" ON maintenance_records;
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
     JOIN employees e ON v.responsável_id = e.id 
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

-- Política para exclusão (apenas admins e gestores)
DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
CREATE POLICY "maintenance_delete_policy"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825233827_c041aea9-3338-45cb-a528-03d66b28150b.sql
-- ============================================================
-- Corrigir políticas RLS para maintenance_records (corrigir o erro de sintaxe)

-- Política para visualização
DROP POLICY IF EXISTS "maintenance_select_policy" ON maintenance_records;
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

-- Política para criação
DROP POLICY IF EXISTS "maintenance_insert_policy" ON maintenance_records;
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

-- Política para atualização
DROP POLICY IF EXISTS "maintenance_update_policy" ON maintenance_records;
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

-- Política para exclusão (apenas admins e gestores)
DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
CREATE POLICY "maintenance_delete_policy"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825233904_1a455dfc-8d9f-45e1-a3a7-097dae8433a8.sql
-- ============================================================
-- Corrigir políticas RLS para maintenance_records (corrigir o erro de sintaxe)

-- Política para visualização
DROP POLICY IF EXISTS "maintenance_select_policy" ON maintenance_records;
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

-- Política para criação
DROP POLICY IF EXISTS "maintenance_insert_policy" ON maintenance_records;
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

-- Política para atualização
DROP POLICY IF EXISTS "maintenance_update_policy" ON maintenance_records;
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

-- Política para exclusão (apenas admins e gestores)
DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
CREATE POLICY "maintenance_delete_policy"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825233927_e3123a36-9b01-482f-9386-3ccc4d35b69b.sql
-- ============================================================
-- Dropar TODAS as políticas existentes da tabela maintenance_records
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'maintenance_records' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON maintenance_records', pol.policyname);
    END LOOP;
END $$;

-- Agora criar novas políticas com nomes únicos
DROP POLICY IF EXISTS "maint_records_select_2025" ON maintenance_records;
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

DROP POLICY IF EXISTS "maint_records_insert_2025" ON maintenance_records;
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

DROP POLICY IF EXISTS "maint_records_update_2025" ON maintenance_records;
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

DROP POLICY IF EXISTS "maint_records_delete_2025" ON maintenance_records;
DROP POLICY IF EXISTS "maint_records_delete_2025" ON maintenance_records;
CREATE POLICY "maint_records_delete_2025"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825235110_ad2806c7-b2cc-4992-be8f-e9d334961371.sql
-- ============================================================
-- Atualizar políticas RLS para damage_reports - funcionários só veem avarias dos seus veículos
DROP POLICY IF EXISTS "All authenticated users can create damage reports" ON damage_reports;
DROP POLICY IF EXISTS "All authenticated users can view damage reports" ON damage_reports;
DROP POLICY IF EXISTS "Admins and gestors can manage damage reports" ON damage_reports;

-- Políticas para damage_reports
DROP POLICY IF EXISTS "damage_reports_select_policy" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_insert_policy" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_update_policy" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_delete_policy" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_delete_policy" ON damage_reports;
CREATE POLICY "damage_reports_delete_policy"
ON damage_reports 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

-- Atualizar políticas RLS para wash_records - funcionários só veem lavagens dos seus veículos
DROP POLICY IF EXISTS "All authenticated users can create wash records" ON wash_records;
DROP POLICY IF EXISTS "All authenticated users can view wash records" ON wash_records;
DROP POLICY IF EXISTS "Admins and gestors can manage wash records" ON wash_records;

-- Políticas para wash_records
DROP POLICY IF EXISTS "wash_records_select_policy" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_insert_policy" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_update_policy" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_delete_policy" ON wash_records;
DROP POLICY IF EXISTS "wash_records_delete_policy" ON wash_records;
CREATE POLICY "wash_records_delete_policy"
ON wash_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825235142_2bfd1a56-2302-4d38-a5c6-5ccfdd422bb9.sql
-- ============================================================
-- Atualizar políticas RLS para damage_reports - funcionários só veem avarias dos seus veículos
DROP POLICY IF EXISTS "All authenticated users can create damage reports" ON damage_reports;
DROP POLICY IF EXISTS "All authenticated users can view damage reports" ON damage_reports;
DROP POLICY IF EXISTS "Admins and gestors can manage damage reports" ON damage_reports;

-- Políticas para damage_reports
DROP POLICY IF EXISTS "damage_reports_select_policy" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_insert_policy" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_update_policy" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_delete_policy" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_delete_policy" ON damage_reports;
CREATE POLICY "damage_reports_delete_policy"
ON damage_reports 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

-- Atualizar políticas RLS para wash_records - funcionários só veem lavagens dos seus veículos
DROP POLICY IF EXISTS "All authenticated users can create wash records" ON wash_records;
DROP POLICY IF EXISTS "All authenticated users can view wash records" ON wash_records;
DROP POLICY IF EXISTS "Admins and gestors can manage wash records" ON wash_records;

-- Políticas para wash_records
DROP POLICY IF EXISTS "wash_records_select_policy" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_insert_policy" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_update_policy" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_delete_policy" ON wash_records;
DROP POLICY IF EXISTS "wash_records_delete_policy" ON wash_records;
CREATE POLICY "wash_records_delete_policy"
ON wash_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825235203_5894de56-2272-4b8d-8138-aa3697977b6c.sql
-- ============================================================
-- Verificar políticas existentes em damage_reports e wash_records
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('damage_reports', 'wash_records');

-- Dropar todas as políticas existentes
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Dropar políticas de damage_reports
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'damage_reports' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON damage_reports', pol.policyname);
    END LOOP;
    
    -- Dropar políticas de wash_records
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'wash_records' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON wash_records', pol.policyname);
    END LOOP;
END $$;

-- ============================================================
-- Migration: 20250825235234_c876592d-b187-46cf-a1d7-220a2a3e2558.sql
-- ============================================================
-- Recriar políticas RLS para damage_reports e wash_records

-- Políticas para damage_reports
DROP POLICY IF EXISTS "damage_reports_select_new_2025" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_insert_new_2025" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_update_new_2025" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_delete_new_2025" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_delete_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_delete_new_2025"
ON damage_reports 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

-- Políticas para wash_records
DROP POLICY IF EXISTS "wash_records_select_new_2025" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_insert_new_2025" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_update_new_2025" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_delete_new_2025" ON wash_records;
DROP POLICY IF EXISTS "wash_records_delete_new_2025" ON wash_records;
CREATE POLICY "wash_records_delete_new_2025"
ON wash_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825235256_08c03fec-21a5-41d4-80ef-cf15045c3b16.sql
-- ============================================================
-- Recriar políticas RLS para damage_reports e wash_records

-- Políticas para damage_reports
DROP POLICY IF EXISTS "damage_reports_select_new_2025" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_insert_new_2025" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_update_new_2025" ON damage_reports;
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

DROP POLICY IF EXISTS "damage_reports_delete_new_2025" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_delete_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_delete_new_2025"
ON damage_reports 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

-- Políticas para wash_records
DROP POLICY IF EXISTS "wash_records_select_new_2025" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_insert_new_2025" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_update_new_2025" ON wash_records;
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

DROP POLICY IF EXISTS "wash_records_delete_new_2025" ON wash_records;
DROP POLICY IF EXISTS "wash_records_delete_new_2025" ON wash_records;
CREATE POLICY "wash_records_delete_new_2025"
ON wash_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);


-- ============================================================
-- Migration: 20250825235643_b83b3d5e-8df6-4e8e-a416-94c0d42e8f03.sql
-- ============================================================
-- Criar buckets para fotos no Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('damage-photos', 'damage-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('wash-photos', 'wash-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('vehicle-photos', 'vehicle-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Políticas RLS para bucket de fotos de avarias
DROP POLICY IF EXISTS "Damage photos are publicly accessible" ON storage;
DROP POLICY IF EXISTS "Damage photos are publicly accessible" ON storage.objects;
CREATE POLICY "Damage photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'damage-photos');

DROP POLICY IF EXISTS "Users can upload damage photos for their own vehicles" ON storage;
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

DROP POLICY IF EXISTS "Users can update damage photos for their own vehicles" ON storage;
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

-- Políticas RLS para bucket de fotos de lavagem
DROP POLICY IF EXISTS "Wash photos are publicly accessible" ON storage;
DROP POLICY IF EXISTS "Wash photos are publicly accessible" ON storage.objects;
CREATE POLICY "Wash photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'wash-photos');

DROP POLICY IF EXISTS "Users can upload wash photos for their own vehicles" ON storage;
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

DROP POLICY IF EXISTS "Users can update wash photos for their own vehicles" ON storage;
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

-- Políticas RLS para bucket de fotos de veículos
DROP POLICY IF EXISTS "Vehicle photos are publicly accessible" ON storage;
DROP POLICY IF EXISTS "Vehicle photos are publicly accessible" ON storage.objects;
CREATE POLICY "Vehicle photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "Users can upload vehicle photos for their own vehicles" ON storage;
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

DROP POLICY IF EXISTS "Users can update vehicle photos for their own vehicles" ON storage;
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


-- ============================================================
-- Migration: 20250825235912_eff38541-22ff-44b7-8f56-9ae99247b773.sql
-- ============================================================
-- Criar bucket para fotos de funcionários
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('employee-photos', 'employee-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Políticas RLS para bucket de fotos de funcionários
DROP POLICY IF EXISTS "Employee photos are publicly accessible" ON storage;
DROP POLICY IF EXISTS "Employee photos are publicly accessible" ON storage.objects;
CREATE POLICY "Employee photos are publicly accessible"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'employee-photos');

DROP POLICY IF EXISTS "Users can upload their own employee photos" ON storage;
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

DROP POLICY IF EXISTS "Users can update their own employee photos" ON storage;
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


-- ============================================================
-- Migration: 20250826163147_efe32a17-2d4e-4543-9a8c-9117f3771de3.sql
-- ============================================================
-- Create smoke_test table for diesel vehicle smoke tests
CREATE TABLE public.smoke_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  
  -- Step 1 fields
  condutor TEXT NOT NULL,
  obra TEXT,
  responsavel_elaboracao TEXT NOT NULL,
  cargo TEXT NOT NULL,
  
  -- Step 2 fields  
  ano_fabricacao INTEGER NOT NULL,
  data_afericao DATE NOT NULL,
  resultado TEXT NOT NULL CHECK (resultado IN ('aprovado', 'reprovado')),
  observacoes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.smoke_tests ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Admins and gestors can manage smoke tests" ON public.smoke_tests;
DROP POLICY IF EXISTS "Admins and gestors can manage smoke tests" ON public.smoke_tests;
CREATE POLICY "Admins and gestors can manage smoke tests"
ON public.smoke_tests 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "All authenticated users can create smoke tests" ON public.smoke_tests;
DROP POLICY IF EXISTS "All authenticated users can create smoke tests" ON public.smoke_tests;
CREATE POLICY "All authenticated users can create smoke tests"
ON public.smoke_tests 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "All authenticated users can view smoke tests" ON public.smoke_tests;
DROP POLICY IF EXISTS "All authenticated users can view smoke tests" ON public.smoke_tests;
CREATE POLICY "All authenticated users can view smoke tests"
ON public.smoke_tests 
FOR SELECT 
USING (true);

-- Add trigger for timestamps
CREATE TRIGGER update_smoke_tests_updated_at
BEFORE UPDATE ON public.smoke_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- Migration: 20250826170725_b1adebd4-e474-4d6d-947e-eb24739d6cb5.sql
-- ============================================================
-- Update RLS policies for tire_services to allow employees to manage their assigned vehicles
DROP POLICY IF EXISTS "All authenticated users can create tire services" ON tire_services;

-- Create proper policies for tire services
CREATE POLICY "tire_services_insert_policy" ON tire_services
  FOR INSERT
  WITH CHECK (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_update_policy" ON tire_services
  FOR UPDATE
  USING (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_select_policy" ON tire_services
  FOR SELECT
  USING (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_delete_policy" ON tire_services
  FOR DELETE
  USING (
    get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  );

-- ============================================================
-- Migration: 20250826170753_18349a92-b52a-47e0-ae16-fab99e86b61c.sql
-- ============================================================
-- Update RLS policies for tire_services to allow employees to manage their assigned vehicles
DROP POLICY IF EXISTS "All authenticated users can create tire services" ON tire_services;

-- Create proper policies for tire services
CREATE POLICY "tire_services_insert_policy" ON tire_services
  FOR INSERT
  WITH CHECK (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_update_policy" ON tire_services
  FOR UPDATE
  USING (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_select_policy" ON tire_services
  FOR SELECT
  USING (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_delete_policy" ON tire_services
  FOR DELETE
  USING (
    get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  );

-- ============================================================
-- Migration: 20250826171013_bd2eb213-268d-40bf-ae9f-52ac88c35f98.sql
-- ============================================================
-- Remove existing RLS policies for tire_services
DROP POLICY IF EXISTS "Admins and gestors can manage tire services" ON tire_services;
DROP POLICY IF EXISTS "All authenticated users can create tire services" ON tire_services;
DROP POLICY IF EXISTS "All authenticated users can view tire services" ON tire_services;
DROP POLICY IF EXISTS "tire_services_insert_policy" ON tire_services;
DROP POLICY IF EXISTS "tire_services_update_policy" ON tire_services;
DROP POLICY IF EXISTS "tire_services_select_policy" ON tire_services;
DROP POLICY IF EXISTS "tire_services_delete_policy" ON tire_services;

-- Create proper policies for tire services
CREATE POLICY "tire_services_insert_new_2025" ON tire_services
  FOR INSERT
  WITH CHECK (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_update_new_2025" ON tire_services
  FOR UPDATE
  USING (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_select_new_2025" ON tire_services
  FOR SELECT
  USING (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_delete_new_2025" ON tire_services
  FOR DELETE
  USING (
    get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  );

-- ============================================================
-- Migration: 20250826171739_0685a065-da8b-43e6-98b2-0179252a22f8.sql
-- ============================================================
-- Update vehicle_accessories constraint to match frontend values
ALTER TABLE vehicle_accessories 
DROP CONSTRAINT IF EXISTS vehicle_accessories_tipo_acessorio_check;

-- Add updated constraint with correct values
ALTER TABLE vehicle_accessories 
ADD CONSTRAINT vehicle_accessories_tipo_acessorio_check 
CHECK (
  tipo_acessorio = ANY (ARRAY[
    'Película (Insulfilm)',
    'Substituição de Vidros',
    'Rastreadores', 
    'Alarme/Anti-furto'
  ])
  OR 
  -- Allow combinations of multiple types separated by comma
  position(',' in tipo_acessorio) > 0
);

-- ============================================================
-- Migration: 20250827013703_c0598946-7f3a-4dac-b779-efffc980b4bb.sql
-- ============================================================
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


-- ============================================================
-- Migration: 20250827014129_d6536b8c-264e-4ca1-9026-ed59bf67f2d7.sql
-- ============================================================
-- Adicionar coluna de fotos gerais na tabela de inspeções de veículos pesados
ALTER TABLE public.heavy_vehicle_inspections 
ADD COLUMN fotos_checklist TEXT;

-- ============================================================
-- Migration: 20250827130014_493a6f2f-bcc1-4120-8ac6-99a8bbbaa518.sql
-- ============================================================
-- Update the vehicle_type enum to include new types for light vehicles only
-- (Heavy vehicles will be managed separately in the heavy vehicles section)
-- Note: PostgreSQL does not support ALTER TYPE ... DROP VALUE
-- Workaround: convert column to TEXT, recreate enum with desired values, convert back

-- Step 1: add new values so existing rows can be updated to them
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'compacto';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'suv';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'caminhonete';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'sedan';

-- Step 2: update any existing 'leve' rows before removing that value
UPDATE vehicles
SET tipo = 'compacto'
WHERE tipo::text = 'leve';

-- Step 3: recreate the enum without 'leve' and 'pesado'
ALTER TABLE vehicles ALTER COLUMN tipo TYPE TEXT;
DROP TYPE vehicle_type;
CREATE TYPE vehicle_type AS ENUM ('compacto', 'suv', 'caminhonete', 'sedan');
ALTER TABLE vehicles ALTER COLUMN tipo TYPE vehicle_type USING tipo::vehicle_type;


-- ============================================================
-- Migration: 20250827130044_b9beaeda-e157-4aa7-8bd8-14ef688bf0aa.sql
-- ============================================================
-- Add new vehicle types for light vehicles
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'compacto';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'suv'; 
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'caminhonete';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'sedan';

-- Update existing 'leve' records to 'compacto' as default
UPDATE vehicles 
SET tipo = 'compacto' 
WHERE tipo = 'leve';

-- ============================================================
-- Migration: 20250906130348_ece04553-b3ef-4158-a784-2a9ccaf9fdea.sql
-- ============================================================
-- Fix employee data security by creating more granular RLS policies
-- Drop existing overly broad policies
DROP POLICY "Admins and gestors can manage all employees" ON public.employees;
DROP POLICY "Employees can view their own data" ON public.employees;

-- Create more secure policies with different access levels
-- 1. Admin users have full access (needed for HR functions)
DROP POLICY IF EXISTS "Admins have full employee access" ON public.employees;
DROP POLICY IF EXISTS "Admins have full employee access" ON public.employees;
CREATE POLICY "Admins have full employee access"
ON public.employees
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

-- 2. Fleet managers can view basic employee info but not sensitive personal data
DROP POLICY IF EXISTS "Fleet managers can view basic employee info" ON public.employees;
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

-- 3. Fleet managers can update non-sensitive employee fields
DROP POLICY IF EXISTS "Fleet managers can update basic employee info" ON public.employees;
DROP POLICY IF EXISTS "Fleet managers can update basic employee info" ON public.employees;
CREATE POLICY "Fleet managers can update basic employee info"
ON public.employees
FOR UPDATE
TO authenticated
USING (get_user_role(auth.uid()) = 'gestor_frota'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'gestor_frota'::app_role);

-- 4. Fleet managers can create new employees (but sensitive data will be restricted)
DROP POLICY IF EXISTS "Fleet managers can create employees" ON public.employees;
DROP POLICY IF EXISTS "Fleet managers can create employees" ON public.employees;
CREATE POLICY "Fleet managers can create employees"
ON public.employees
FOR INSERT
TO authenticated
WITH CHECK (get_user_role(auth.uid()) = 'gestor_frota'::app_role);

-- 5. Fleet managers can delete employees
DROP POLICY IF EXISTS "Fleet managers can delete employees" ON public.employees;
DROP POLICY IF EXISTS "Fleet managers can delete employees" ON public.employees;
CREATE POLICY "Fleet managers can delete employees"
ON public.employees
FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'gestor_frota'::app_role);

-- 6. Employees can view their own complete data
DROP POLICY IF EXISTS "Employees can view own data" ON public.employees;
DROP POLICY IF EXISTS "Employees can view own data" ON public.employees;
CREATE POLICY "Employees can view own data"
ON public.employees
FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) = 'funcionario'::app_role 
  AND user_id = auth.uid()
);

-- 7. Employees can update their own non-critical data
DROP POLICY IF EXISTS "Employees can update own basic data" ON public.employees;
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


-- ============================================================
-- Migration: 20250906130602_1ad5afa1-38ed-4ce0-a4cd-1baa6294ed3b.sql
-- ============================================================
-- Create more restrictive employee data access policies
-- Drop the overly permissive fleet manager policies
DROP POLICY "Fleet managers can view basic employee info" ON public.employees;
DROP POLICY "Fleet managers can update basic employee info" ON public.employees;
DROP POLICY "Fleet managers can create employees" ON public.employees;
DROP POLICY "Fleet managers can delete employees" ON public.employees;

-- Create a security definer function to check if a user can manage a specific employee
-- This allows for more granular access control
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

-- Fleet managers can only view employees in their own department
DROP POLICY IF EXISTS "Fleet managers can view departmental employees" ON public.employees;
DROP POLICY IF EXISTS "Fleet managers can view departmental employees" ON public.employees;
CREATE POLICY "Fleet managers can view departmental employees"
ON public.employees
FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) = 'gestor_frota'::app_role 
  AND can_manage_employee(id)
);

-- Fleet managers can only update employees in their department
DROP POLICY IF EXISTS "Fleet managers can update departmental employees" ON public.employees;
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

-- Fleet managers can create employees only in their own department
DROP POLICY IF EXISTS "Fleet managers can create departmental employees" ON public.employees;
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

-- Fleet managers can delete employees only in their department  
DROP POLICY IF EXISTS "Fleet managers can delete departmental employees" ON public.employees;
DROP POLICY IF EXISTS "Fleet managers can delete departmental employees" ON public.employees;
CREATE POLICY "Fleet managers can delete departmental employees"
ON public.employees
FOR DELETE
TO authenticated
USING (
  get_user_role(auth.uid()) = 'gestor_frota'::app_role 
  AND can_manage_employee(id)
);


-- ============================================================
-- Migration: 20250906133916_73711793-e35e-4543-a53c-34a378ccfbe9.sql
-- ============================================================
-- Fix security vulnerabilities in profiles table
-- Drop existing overly permissive policies that allow public access
DROP POLICY "Admins can view all profiles" ON public.profiles;
DROP POLICY "Users can update their own profile" ON public.profiles;
DROP POLICY "Users can view their own profile" ON public.profiles;

-- Create secure policies that require authentication
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Also fix any remaining vulnerabilities in system_logs table
-- Ensure only admins can access system logs
DROP POLICY IF EXISTS "Only admins can view system logs" ON public.system_logs;
DROP POLICY IF EXISTS "Only admins can view system logs" ON public.system_logs;
CREATE POLICY "Only admins can view system logs"
ON public.system_logs
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = 'admin'::app_role);


-- ============================================================
-- Migration: 20250913225725_6c36c377-97de-4ad0-b8a2-78dfff05afbd.sql
-- ============================================================
-- Adicionar novos campos para a Escala Ringelmann no teste de fumaça
ALTER TABLE smoke_tests 
ADD COLUMN motor_tipo text,
ADD COLUMN quilometragem_atual integer,
ADD COLUMN data_hora_teste timestamp with time zone DEFAULT now(),
ADD COLUMN distancia_observador integer,
ADD COLUMN indice_ringelmann integer CHECK (indice_ringelmann >= 1 AND indice_ringelmann <= 5),
ADD COLUMN densidade_percentual integer,
ADD COLUMN dentro_limite boolean,
ADD COLUMN evidencias_url text,
ADD COLUMN condicoes_teste text DEFAULT 'Veículo em movimento com carga no motor, fumaça contínua por no mínimo 5 segundos';

-- Atualizar registros existentes com valores padrão
UPDATE smoke_tests 
SET 
    motor_tipo = 'diesel',
    quilometragem_atual = 0,
    data_hora_teste = created_at,
    distancia_observador = 30,
    indice_ringelmann = 1,
    densidade_percentual = 20,
    dentro_limite = true
WHERE motor_tipo IS NULL;

-- ============================================================
-- Migration: 20250913233629_38d9be8f-5999-45ca-90e2-25f39a6849da.sql
-- ============================================================
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


-- ============================================================
-- Migration: 20250913233651_517596e0-60f5-44ac-aef3-58cc697d4f87.sql
-- ============================================================
-- Primeira migração: Adicionar novo valor ao enum
ALTER TYPE app_role ADD VALUE 'gestor_obra';

-- Adicionar coluna para FK do responsável técnico
ALTER TABLE public.obras 
ADD COLUMN responsavel_tecnico_id UUID REFERENCES public.employees(id);

-- ============================================================
-- Migration: 20250913233742_9b2c1fea-d954-4492-a58b-8efde594328c.sql
-- ============================================================
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


-- ============================================================
-- Migration: 20250914001006_c7d78013-df81-46cb-9a25-470198b2ebf6.sql
-- ============================================================
-- Atualizar a constraint do campo tipo_acesso na tabela employees
-- Remover a constraint antiga se existir
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_tipo_acesso_check;

-- Adicionar nova constraint com os valores atualizados
ALTER TABLE employees 
ADD CONSTRAINT employees_tipo_acesso_check 
CHECK (tipo_acesso IN ('gestor_geral', 'gestor_obra', 'colaborador'));

-- Atualizar registros existentes que possam ter valores antigos
UPDATE employees 
SET tipo_acesso = 'gestor_geral' 
WHERE tipo_acesso = 'admin';

UPDATE employees 
SET tipo_acesso = 'colaborador' 
WHERE tipo_acesso NOT IN ('gestor_geral', 'gestor_obra', 'colaborador');

-- ============================================================
-- Migration: 20250914003257_acff0e17-a39a-4254-bed5-bdf68b15a221.sql
-- ============================================================
-- Inserir vinculações de teste para debugar
INSERT INTO obra_funcionarios (obra_id, employee_id, funcao_obra, data_entrada, status) 
VALUES 
  ('ab0f3566-ed0c-4277-aa59-c88fb27ccdc3', '4719528b-e83c-4ac9-b2c5-50720a85bcb3', 'Coordenador', '2025-09-14', true),
  ('ab0f3566-ed0c-4277-aa59-c88fb27ccdc3', '64e46a1e-0031-492b-bf1e-0945fd5ef0f6', 'Assistente', '2025-09-14', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Migration: 20260121174216_9823eba2-6ff8-454c-8af4-32fecd1ef255.sql
-- ============================================================
-- Drop the existing constraint
ALTER TABLE inspection_checklists DROP CONSTRAINT IF EXISTS inspection_checklists_tipo_servico_check;

-- Add new constraint with all service types
ALTER TABLE inspection_checklists ADD CONSTRAINT inspection_checklists_tipo_servico_check 
CHECK (tipo_servico = ANY (ARRAY['entrada'::text, 'saida'::text, 'diario'::text, 'semanal'::text, 'mensal'::text]));

-- ============================================================
-- Migration: 20260121180018_9497c15e-1198-4dff-9003-ba900e747788.sql
-- ============================================================
-- Create fornecedores table
CREATE TABLE public.fornecedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  cpf TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  tipo_fornecedor TEXT NOT NULL DEFAULT 'geral',
  categoria TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create junction table for obra_fornecedores (many-to-many)
CREATE TABLE public.obra_fornecedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  tipo_contrato TEXT,
  valor_contrato NUMERIC(12,2),
  status BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(obra_id, fornecedor_id)
);

-- Enable RLS
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_fornecedores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fornecedores
DROP POLICY IF EXISTS "All authenticated users can view fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "All authenticated users can view fornecedores" ON public.fornecedores;
CREATE POLICY "All authenticated users can view fornecedores"
ON public.fornecedores FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Admins and gestors can manage fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Admins and gestors can manage fornecedores" ON public.fornecedores;
CREATE POLICY "Admins and gestors can manage fornecedores"
ON public.fornecedores FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- RLS Policies for obra_fornecedores
DROP POLICY IF EXISTS "All authenticated users can view obra_fornecedores" ON public.obra_fornecedores;
DROP POLICY IF EXISTS "All authenticated users can view obra_fornecedores" ON public.obra_fornecedores;
CREATE POLICY "All authenticated users can view obra_fornecedores"
ON public.obra_fornecedores FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Admins and gestors can manage obra_fornecedores" ON public.obra_fornecedores;
DROP POLICY IF EXISTS "Admins and gestors can manage obra_fornecedores" ON public.obra_fornecedores;
CREATE POLICY "Admins and gestors can manage obra_fornecedores"
ON public.obra_fornecedores FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Trigger for updated_at
CREATE TRIGGER update_fornecedores_updated_at
BEFORE UPDATE ON public.fornecedores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_obra_fornecedores_updated_at
BEFORE UPDATE ON public.obra_fornecedores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add check constraint for tipo_fornecedor
ALTER TABLE public.fornecedores ADD CONSTRAINT fornecedores_tipo_check 
CHECK (tipo_fornecedor = ANY (ARRAY['materiais'::text, 'servicos'::text, 'equipamentos'::text, 'combustivel'::text, 'pecas'::text, 'geral'::text]));


-- ============================================================
-- Migration: 20260121183322_8819f266-744e-4208-90c9-476dcf10e23c.sql
-- ============================================================
-- Adicionar política de INSERT para obra_veiculos
DROP POLICY IF EXISTS "All authenticated users can insert obra_veiculos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "All authenticated users can insert obra_veiculos" ON public.obra_veiculos;
CREATE POLICY "All authenticated users can insert obra_veiculos"
ON public.obra_veiculos 
FOR INSERT 
WITH CHECK (true);

-- Também adicionar SELECT para que todos possam visualizar
DROP POLICY IF EXISTS "All authenticated users can view obra_veiculos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "All authenticated users can view obra_veiculos" ON public.obra_veiculos;
CREATE POLICY "All authenticated users can view obra_veiculos"
ON public.obra_veiculos
FOR SELECT
USING (true);


-- ============================================================
-- Migration: 20260121222532_7ed9461b-fb29-4dd2-9029-35acd00489f5.sql
-- ============================================================
-- Criar política para Gestor de Obra ver funcionários da mesma obra
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
CREATE POLICY "Project managers can view obra employees"
ON public.employees
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND id IN (
    SELECT of1.employee_id 
    FROM obra_funcionarios of1
    WHERE of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  )
);

-- Criar política para Gestor de Obra criar funcionários
DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
CREATE POLICY "Project managers can create obra employees"
ON public.employees
FOR INSERT
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
);

-- Criar política para Gestor de Obra atualizar funcionários da mesma obra
DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
CREATE POLICY "Project managers can update obra employees"
ON public.employees
FOR UPDATE
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND id IN (
    SELECT of1.employee_id 
    FROM obra_funcionarios of1
    WHERE of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND id IN (
    SELECT of1.employee_id 
    FROM obra_funcionarios of1
    WHERE of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  )
);

-- Criar política para Gestor de Obra deletar funcionários da mesma obra
DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
CREATE POLICY "Project managers can delete obra employees"
ON public.employees
FOR DELETE
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND id IN (
    SELECT of1.employee_id 
    FROM obra_funcionarios of1
    WHERE of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  )
);


-- ============================================================
-- Migration: 20260121222943_32ceb4ba-4696-4dbe-9776-3134ce61f924.sql
-- ============================================================
-- Primeiro, remover as políticas problemáticas
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;

-- Criar função security definer para verificar se um funcionário pertence à mesma obra do usuário atual
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

-- Criar função para verificar se o usuário atual é gestor de obra
CREATE OR REPLACE FUNCTION public.is_gestor_obra()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_user_role(auth.uid()) = 'gestor_obra'::app_role;
$$;

-- Recriar políticas usando a função
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
CREATE POLICY "Project managers can view obra employees"
ON public.employees
FOR SELECT
USING (
  is_gestor_obra() AND is_employee_in_same_obra(id)
);

DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
CREATE POLICY "Project managers can create obra employees"
ON public.employees
FOR INSERT
WITH CHECK (
  is_gestor_obra()
);

DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
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

DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
CREATE POLICY "Project managers can delete obra employees"
ON public.employees
FOR DELETE
USING (
  is_gestor_obra() AND is_employee_in_same_obra(id)
);


-- ============================================================
-- Migration: 20260121223511_5be354ef-4519-4f7a-a325-a564ce002bae.sql
-- ============================================================
-- Criar função security definer para verificar se um veículo pertence à mesma obra do usuário atual
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

-- Criar política para Gestor de Obra ver veículos da mesma obra
DROP POLICY IF EXISTS "Project managers can view obra vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Project managers can view obra vehicles" ON public.vehicles;
CREATE POLICY "Project managers can view obra vehicles"
ON public.vehicles
FOR SELECT
USING (
  is_gestor_obra() AND is_vehicle_in_same_obra(id)
);

-- Criar política para Gestor de Obra atualizar veículos da mesma obra
DROP POLICY IF EXISTS "Project managers can update obra vehicles" ON public.vehicles;
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


-- ============================================================
-- Migration: 20260121230155_13601ad3-a1da-48a2-bc01-6e6bc201ce7e.sql
-- ============================================================
-- Create function to check if maintenance record is from vehicle in same obra
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

-- Add SELECT policy for gestor_obra on maintenance_records
DROP POLICY IF EXISTS "Project managers can view obra vehicle maintenance" ON public.maintenance_records;
DROP POLICY IF EXISTS "Project managers can view obra vehicle maintenance" ON public.maintenance_records;
CREATE POLICY "Project managers can view obra vehicle maintenance"
ON public.maintenance_records
FOR SELECT
USING (
  is_gestor_obra() AND is_maintenance_for_obra_vehicle(vehicle_id)
);


-- ============================================================
-- Migration: 20260121231414_0f735782-03a2-4be1-9ab3-309d5c80cb99.sql
-- ============================================================
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


-- ============================================================
-- Migration: 20260121234523_572d094b-d4c0-49f3-a99d-02a737bf4fa2.sql
-- ============================================================
-- Atualizar política de escala_tipos para incluir gestor_obra
DROP POLICY IF EXISTS "Admins and gestors can manage escala_tipos" ON public.escala_tipos;

DROP POLICY IF EXISTS "Admins and gestors can manage escala_tipos" ON public.escala_tipos;
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



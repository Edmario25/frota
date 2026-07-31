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
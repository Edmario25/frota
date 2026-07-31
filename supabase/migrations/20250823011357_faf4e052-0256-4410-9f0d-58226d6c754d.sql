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

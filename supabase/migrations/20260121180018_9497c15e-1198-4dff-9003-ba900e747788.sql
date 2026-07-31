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

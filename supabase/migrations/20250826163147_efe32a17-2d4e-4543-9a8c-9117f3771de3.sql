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

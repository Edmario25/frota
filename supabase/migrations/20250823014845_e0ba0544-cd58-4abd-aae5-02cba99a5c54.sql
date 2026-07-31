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

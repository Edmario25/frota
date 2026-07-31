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

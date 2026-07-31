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

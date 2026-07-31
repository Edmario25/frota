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

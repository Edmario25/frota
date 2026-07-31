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

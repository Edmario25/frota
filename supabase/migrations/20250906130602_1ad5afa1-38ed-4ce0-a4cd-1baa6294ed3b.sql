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

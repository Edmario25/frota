-- Atualizar políticas RLS para funcionários verem apenas seus próprios dados

-- Atualizar política de schedules para funcionários verem apenas suas próprias escalas
DROP POLICY IF EXISTS "Employees can view their own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Employees can view their own schedules" ON public.schedules;
CREATE POLICY "Employees can view their own schedules"
ON public.schedules 
FOR SELECT 
TO authenticated
USING (
  -- Admins e gestores podem ver tudo
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR 
  -- Funcionários só veem suas próprias escalas
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  ))
);

-- Política para mileage_records - funcionários só veem seus próprios registros
DROP POLICY IF EXISTS "Employees can view their own mileage records" ON public.mileage_records;
DROP POLICY IF EXISTS "Employees can view their own mileage records" ON public.mileage_records;
CREATE POLICY "Employees can view their own mileage records"
ON public.mileage_records 
FOR SELECT 
TO authenticated
USING (
  -- Admins e gestores podem ver tudo
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR 
  -- Funcionários só veem seus próprios registros
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  ))
);

-- Nova política para vehicles - funcionários só veem veículos atribuídos a eles
DROP POLICY IF EXISTS "Employees can view assigned vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Employees can view assigned vehicles" ON public.vehicles;
CREATE POLICY "Employees can view assigned vehicles"
ON public.vehicles 
FOR SELECT 
TO authenticated
USING (
  -- Admins e gestores podem ver tudo  
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR
  -- Funcionários só veem veículos onde são responsáveis
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND responsavel_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  ))
);

-- Política para employees - funcionários só veem seu próprio cadastro
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
CREATE POLICY "Admins and gestors can manage employees"
ON public.employees
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

DROP POLICY IF EXISTS "Employees can view their own profile" ON public.employees;
DROP POLICY IF EXISTS "Employees can view their own profile" ON public.employees;
CREATE POLICY "Employees can view their own profile"
ON public.employees 
FOR SELECT 
TO authenticated
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  OR 
  (get_user_role(auth.uid()) = 'funcionario'::app_role AND user_id = auth.uid())
);

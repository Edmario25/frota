-- Criar política para Gestor de Obra ver funcionários da mesma obra
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
CREATE POLICY "Project managers can view obra employees"
ON public.employees
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND id IN (
    SELECT of1.employee_id 
    FROM obra_funcionarios of1
    WHERE of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  )
);

-- Criar política para Gestor de Obra criar funcionários
DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
CREATE POLICY "Project managers can create obra employees"
ON public.employees
FOR INSERT
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
);

-- Criar política para Gestor de Obra atualizar funcionários da mesma obra
DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
CREATE POLICY "Project managers can update obra employees"
ON public.employees
FOR UPDATE
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND id IN (
    SELECT of1.employee_id 
    FROM obra_funcionarios of1
    WHERE of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND id IN (
    SELECT of1.employee_id 
    FROM obra_funcionarios of1
    WHERE of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  )
);

-- Criar política para Gestor de Obra deletar funcionários da mesma obra
DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
CREATE POLICY "Project managers can delete obra employees"
ON public.employees
FOR DELETE
USING (
  get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND id IN (
    SELECT of1.employee_id 
    FROM obra_funcionarios of1
    WHERE of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  )
);

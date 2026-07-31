-- Primeiro, remover as políticas problemáticas
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;

-- Criar função security definer para verificar se um funcionário pertence à mesma obra do usuário atual
CREATE OR REPLACE FUNCTION public.is_employee_in_same_obra(target_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM obra_funcionarios of1
    WHERE of1.employee_id = target_employee_id
    AND of1.status = true
    AND of1.obra_id IN (
      SELECT of2.obra_id 
      FROM obra_funcionarios of2
      JOIN employees e ON e.id = of2.employee_id
      WHERE e.user_id = auth.uid() AND of2.status = true
    )
  );
$$;

-- Criar função para verificar se o usuário atual é gestor de obra
CREATE OR REPLACE FUNCTION public.is_gestor_obra()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_user_role(auth.uid()) = 'gestor_obra'::app_role;
$$;

-- Recriar políticas usando a função
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can view obra employees" ON public.employees;
CREATE POLICY "Project managers can view obra employees"
ON public.employees
FOR SELECT
USING (
  is_gestor_obra() AND is_employee_in_same_obra(id)
);

DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can create obra employees" ON public.employees;
CREATE POLICY "Project managers can create obra employees"
ON public.employees
FOR INSERT
WITH CHECK (
  is_gestor_obra()
);

DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can update obra employees" ON public.employees;
CREATE POLICY "Project managers can update obra employees"
ON public.employees
FOR UPDATE
USING (
  is_gestor_obra() AND is_employee_in_same_obra(id)
)
WITH CHECK (
  is_gestor_obra() AND is_employee_in_same_obra(id)
);

DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
DROP POLICY IF EXISTS "Project managers can delete obra employees" ON public.employees;
CREATE POLICY "Project managers can delete obra employees"
ON public.employees
FOR DELETE
USING (
  is_gestor_obra() AND is_employee_in_same_obra(id)
);

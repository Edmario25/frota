-- Criar função security definer para verificar se um veículo pertence à mesma obra do usuário atual
CREATE OR REPLACE FUNCTION public.is_vehicle_in_same_obra(target_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM obra_veiculos ov
    WHERE ov.vehicle_id = target_vehicle_id
    AND ov.status = true
    AND ov.obra_id IN (
      SELECT of.obra_id 
      FROM obra_funcionarios of
      JOIN employees e ON e.id = of.employee_id
      WHERE e.user_id = auth.uid() AND of.status = true
    )
  );
$$;

-- Criar política para Gestor de Obra ver veículos da mesma obra
DROP POLICY IF EXISTS "Project managers can view obra vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Project managers can view obra vehicles" ON public.vehicles;
CREATE POLICY "Project managers can view obra vehicles"
ON public.vehicles
FOR SELECT
USING (
  is_gestor_obra() AND is_vehicle_in_same_obra(id)
);

-- Criar política para Gestor de Obra atualizar veículos da mesma obra
DROP POLICY IF EXISTS "Project managers can update obra vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Project managers can update obra vehicles" ON public.vehicles;
CREATE POLICY "Project managers can update obra vehicles"
ON public.vehicles
FOR UPDATE
USING (
  is_gestor_obra() AND is_vehicle_in_same_obra(id)
)
WITH CHECK (
  is_gestor_obra() AND is_vehicle_in_same_obra(id)
);

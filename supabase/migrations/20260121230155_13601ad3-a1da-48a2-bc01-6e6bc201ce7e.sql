-- Create function to check if maintenance record is from vehicle in same obra
CREATE OR REPLACE FUNCTION public.is_maintenance_for_obra_vehicle(target_vehicle_id uuid)
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

-- Add SELECT policy for gestor_obra on maintenance_records
DROP POLICY IF EXISTS "Project managers can view obra vehicle maintenance" ON public.maintenance_records;
DROP POLICY IF EXISTS "Project managers can view obra vehicle maintenance" ON public.maintenance_records;
CREATE POLICY "Project managers can view obra vehicle maintenance"
ON public.maintenance_records
FOR SELECT
USING (
  is_gestor_obra() AND is_maintenance_for_obra_vehicle(vehicle_id)
);

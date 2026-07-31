-- Atualizar política RLS para funcionários visualizarem apenas manutenções dos seus veículos
DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON maintenance_records;

DROP POLICY IF EXISTS "Employees can view maintenance records of their assigned vehicles" ON maintenance_records;
DROP POLICY IF EXISTS "Employees can view maintenance records of their assigned vehicles" ON maintenance_records;
CREATE POLICY "Employees can view maintenance records of their assigned vehicles" 
ON maintenance_records 
FOR SELECT 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

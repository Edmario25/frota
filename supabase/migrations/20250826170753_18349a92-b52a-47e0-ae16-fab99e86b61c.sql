-- Update RLS policies for tire_services to allow employees to manage their assigned vehicles
DROP POLICY IF EXISTS "All authenticated users can create tire services" ON tire_services;

-- Create proper policies for tire services
CREATE POLICY "tire_services_insert_policy" ON tire_services
  FOR INSERT
  WITH CHECK (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_update_policy" ON tire_services
  FOR UPDATE
  USING (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_select_policy" ON tire_services
  FOR SELECT
  USING (
    (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) 
    OR 
    (get_user_role(auth.uid()) = 'funcionario'::app_role AND vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN employees e ON v.responsavel_id = e.id
      WHERE e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tire_services_delete_policy" ON tire_services
  FOR DELETE
  USING (
    get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
  );
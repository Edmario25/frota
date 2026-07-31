-- Recriar políticas RLS para damage_reports e wash_records

-- Políticas para damage_reports
DROP POLICY IF EXISTS "damage_reports_select_new_2025" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_select_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_select_new_2025"
ON damage_reports 
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

DROP POLICY IF EXISTS "damage_reports_insert_new_2025" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_insert_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_insert_new_2025"
ON damage_reports 
FOR INSERT 
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "damage_reports_update_new_2025" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_update_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_update_new_2025"
ON damage_reports 
FOR UPDATE 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "damage_reports_delete_new_2025" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_delete_new_2025" ON damage_reports;
CREATE POLICY "damage_reports_delete_new_2025"
ON damage_reports 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

-- Políticas para wash_records
DROP POLICY IF EXISTS "wash_records_select_new_2025" ON wash_records;
DROP POLICY IF EXISTS "wash_records_select_new_2025" ON wash_records;
CREATE POLICY "wash_records_select_new_2025"
ON wash_records 
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

DROP POLICY IF EXISTS "wash_records_insert_new_2025" ON wash_records;
DROP POLICY IF EXISTS "wash_records_insert_new_2025" ON wash_records;
CREATE POLICY "wash_records_insert_new_2025"
ON wash_records 
FOR INSERT 
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "wash_records_update_new_2025" ON wash_records;
DROP POLICY IF EXISTS "wash_records_update_new_2025" ON wash_records;
CREATE POLICY "wash_records_update_new_2025"
ON wash_records 
FOR UPDATE 
USING (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

DROP POLICY IF EXISTS "wash_records_delete_new_2025" ON wash_records;
DROP POLICY IF EXISTS "wash_records_delete_new_2025" ON wash_records;
CREATE POLICY "wash_records_delete_new_2025"
ON wash_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

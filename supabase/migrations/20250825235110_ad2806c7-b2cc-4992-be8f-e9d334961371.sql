-- Atualizar políticas RLS para damage_reports - funcionários só veem avarias dos seus veículos
DROP POLICY IF EXISTS "All authenticated users can create damage reports" ON damage_reports;
DROP POLICY IF EXISTS "All authenticated users can view damage reports" ON damage_reports;
DROP POLICY IF EXISTS "Admins and gestors can manage damage reports" ON damage_reports;

-- Políticas para damage_reports
DROP POLICY IF EXISTS "damage_reports_select_policy" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_select_policy" ON damage_reports;
CREATE POLICY "damage_reports_select_policy"
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

DROP POLICY IF EXISTS "damage_reports_insert_policy" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_insert_policy" ON damage_reports;
CREATE POLICY "damage_reports_insert_policy"
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

DROP POLICY IF EXISTS "damage_reports_update_policy" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_update_policy" ON damage_reports;
CREATE POLICY "damage_reports_update_policy"
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

DROP POLICY IF EXISTS "damage_reports_delete_policy" ON damage_reports;
DROP POLICY IF EXISTS "damage_reports_delete_policy" ON damage_reports;
CREATE POLICY "damage_reports_delete_policy"
ON damage_reports 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

-- Atualizar políticas RLS para wash_records - funcionários só veem lavagens dos seus veículos
DROP POLICY IF EXISTS "All authenticated users can create wash records" ON wash_records;
DROP POLICY IF EXISTS "All authenticated users can view wash records" ON wash_records;
DROP POLICY IF EXISTS "Admins and gestors can manage wash records" ON wash_records;

-- Políticas para wash_records
DROP POLICY IF EXISTS "wash_records_select_policy" ON wash_records;
DROP POLICY IF EXISTS "wash_records_select_policy" ON wash_records;
CREATE POLICY "wash_records_select_policy"
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

DROP POLICY IF EXISTS "wash_records_insert_policy" ON wash_records;
DROP POLICY IF EXISTS "wash_records_insert_policy" ON wash_records;
CREATE POLICY "wash_records_insert_policy"
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

DROP POLICY IF EXISTS "wash_records_update_policy" ON wash_records;
DROP POLICY IF EXISTS "wash_records_update_policy" ON wash_records;
CREATE POLICY "wash_records_update_policy"
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

DROP POLICY IF EXISTS "wash_records_delete_policy" ON wash_records;
DROP POLICY IF EXISTS "wash_records_delete_policy" ON wash_records;
CREATE POLICY "wash_records_delete_policy"
ON wash_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

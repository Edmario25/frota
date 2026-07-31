-- Dropar TODAS as políticas existentes da tabela maintenance_records
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'maintenance_records' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON maintenance_records', pol.policyname);
    END LOOP;
END $$;

-- Agora criar novas políticas com nomes únicos
DROP POLICY IF EXISTS "maint_records_select_2025" ON maintenance_records;
DROP POLICY IF EXISTS "maint_records_select_2025" ON maintenance_records;
CREATE POLICY "maint_records_select_2025"
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

DROP POLICY IF EXISTS "maint_records_insert_2025" ON maintenance_records;
DROP POLICY IF EXISTS "maint_records_insert_2025" ON maintenance_records;
CREATE POLICY "maint_records_insert_2025"
ON maintenance_records 
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

DROP POLICY IF EXISTS "maint_records_update_2025" ON maintenance_records;
DROP POLICY IF EXISTS "maint_records_update_2025" ON maintenance_records;
CREATE POLICY "maint_records_update_2025"
ON maintenance_records 
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

DROP POLICY IF EXISTS "maint_records_delete_2025" ON maintenance_records;
DROP POLICY IF EXISTS "maint_records_delete_2025" ON maintenance_records;
CREATE POLICY "maint_records_delete_2025"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

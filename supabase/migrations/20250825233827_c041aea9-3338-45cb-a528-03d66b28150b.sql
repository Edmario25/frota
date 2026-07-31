-- Corrigir políticas RLS para maintenance_records (corrigir o erro de sintaxe)

-- Política para visualização
DROP POLICY IF EXISTS "maintenance_select_policy" ON maintenance_records;
DROP POLICY IF EXISTS "maintenance_select_policy" ON maintenance_records;
CREATE POLICY "maintenance_select_policy"
ON maintenance_records 
FOR SELECT 
USING (
  -- Admins e gestores veem todos os registros
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só veem registros dos veículos atribuídos a eles
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

-- Política para criação
DROP POLICY IF EXISTS "maintenance_insert_policy" ON maintenance_records;
DROP POLICY IF EXISTS "maintenance_insert_policy" ON maintenance_records;
CREATE POLICY "maintenance_insert_policy"
ON maintenance_records 
FOR INSERT 
WITH CHECK (
  -- Admins e gestores podem criar registros para qualquer veículo
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só podem criar registros para seus próprios veículos
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

-- Política para atualização
DROP POLICY IF EXISTS "maintenance_update_policy" ON maintenance_records;
DROP POLICY IF EXISTS "maintenance_update_policy" ON maintenance_records;
CREATE POLICY "maintenance_update_policy"
ON maintenance_records 
FOR UPDATE 
USING (
  -- Admins e gestores podem editar qualquer registro
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  -- Funcionários só podem editar registros dos seus veículos
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
)
WITH CHECK (
  -- Mesma lógica para verificação de alteração
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])) OR 
  ((get_user_role(auth.uid()) = 'funcionario'::app_role) AND 
   (vehicle_id IN (
     SELECT v.id 
     FROM vehicles v 
     JOIN employees e ON v.responsavel_id = e.id 
     WHERE e.user_id = auth.uid()
   )))
);

-- Política para exclusão (apenas admins e gestores)
DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
DROP POLICY IF EXISTS "maintenance_delete_policy" ON maintenance_records;
CREATE POLICY "maintenance_delete_policy"
ON maintenance_records 
FOR DELETE 
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role])
);

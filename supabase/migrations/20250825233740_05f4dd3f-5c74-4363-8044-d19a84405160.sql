-- Primeiro, vamos ver as políticas existentes
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'maintenance_records';

-- Dropar TODAS as políticas existentes
DROP POLICY IF EXISTS "View maintenance records policy" ON maintenance_records;
DROP POLICY IF EXISTS "Create maintenance records policy" ON maintenance_records; 
DROP POLICY IF EXISTS "Update maintenance records policy" ON maintenance_records;
DROP POLICY IF EXISTS "Delete maintenance records policy" ON maintenance_records;
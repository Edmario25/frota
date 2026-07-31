-- Verificar políticas existentes em damage_reports e wash_records
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('damage_reports', 'wash_records');

-- Dropar todas as políticas existentes
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Dropar políticas de damage_reports
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'damage_reports' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON damage_reports', pol.policyname);
    END LOOP;
    
    -- Dropar políticas de wash_records
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'wash_records' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON wash_records', pol.policyname);
    END LOOP;
END $$;
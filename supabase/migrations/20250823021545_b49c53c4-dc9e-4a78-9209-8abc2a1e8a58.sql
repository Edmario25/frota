-- Corrigir políticas RLS para outras tabelas relacionadas à frota
-- Tabela rental_companies
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;

DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can view rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can view rental companies" 
ON public.rental_companies 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can create rental companies"
ON public.rental_companies 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
CREATE POLICY "Admins and gestors can manage rental companies"
ON public.rental_companies 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

-- Tabela maintenance_records
DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON public.maintenance_records;
DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON public.maintenance_records;

DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON public.maintenance_records;
DROP POLICY IF EXISTS "All authenticated users can view maintenance records" ON public.maintenance_records;
CREATE POLICY "All authenticated users can view maintenance records" 
ON public.maintenance_records 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can create maintenance records" ON public.maintenance_records;
DROP POLICY IF EXISTS "All authenticated users can create maintenance records" ON public.maintenance_records;
CREATE POLICY "All authenticated users can create maintenance records"
ON public.maintenance_records 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON public.maintenance_records;
DROP POLICY IF EXISTS "Admins and gestors can manage maintenance records" ON public.maintenance_records;
CREATE POLICY "Admins and gestors can manage maintenance records"
ON public.maintenance_records 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

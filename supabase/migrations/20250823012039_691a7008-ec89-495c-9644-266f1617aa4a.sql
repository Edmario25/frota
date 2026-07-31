-- Update RLS policies for rental_companies to allow authenticated users to insert
DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;

DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "All authenticated users can create rental companies" ON public.rental_companies;
CREATE POLICY "All authenticated users can create rental companies" 
ON public.rental_companies 
FOR INSERT 
WITH CHECK (true);

-- Update policy for management to be more specific
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;

DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
DROP POLICY IF EXISTS "Admins and gestors can manage rental companies" ON public.rental_companies;
CREATE POLICY "Admins and gestors can manage rental companies" 
ON public.rental_companies 
FOR ALL 
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

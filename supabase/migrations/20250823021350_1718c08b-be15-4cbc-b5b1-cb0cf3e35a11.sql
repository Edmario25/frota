-- Corrigir políticas RLS para vehicles
-- Remover políticas existentes
DROP POLICY IF EXISTS "Admins and gestors can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;

-- Criar políticas mais permissivas
DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;
CREATE POLICY "All authenticated users can view vehicles"
ON public.vehicles 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "All authenticated users can create vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "All authenticated users can create vehicles" ON public.vehicles;
CREATE POLICY "All authenticated users can create vehicles"
ON public.vehicles 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and gestors can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins and gestors can manage vehicles" ON public.vehicles;
CREATE POLICY "Admins and gestors can manage vehicles"
ON public.vehicles 
FOR ALL 
TO authenticated
USING (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]))
WITH CHECK (get_user_role() = ANY (ARRAY['admin'::app_role, 'gestor_frota'::app_role]));

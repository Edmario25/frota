-- Adicionar política de INSERT para obra_veiculos
DROP POLICY IF EXISTS "All authenticated users can insert obra_veiculos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "All authenticated users can insert obra_veiculos" ON public.obra_veiculos;
CREATE POLICY "All authenticated users can insert obra_veiculos"
ON public.obra_veiculos 
FOR INSERT 
WITH CHECK (true);

-- Também adicionar SELECT para que todos possam visualizar
DROP POLICY IF EXISTS "All authenticated users can view obra_veiculos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "All authenticated users can view obra_veiculos" ON public.obra_veiculos;
CREATE POLICY "All authenticated users can view obra_veiculos"
ON public.obra_veiculos
FOR SELECT
USING (true);

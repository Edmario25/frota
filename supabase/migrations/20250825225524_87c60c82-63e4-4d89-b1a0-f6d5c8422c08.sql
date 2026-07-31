-- Adicionar política para permitir que funcionários atualizem apenas a quilometragem dos seus próprios veículos
DROP POLICY IF EXISTS "Employees can update their own vehicle mileage" ON public.vehicles;
DROP POLICY IF EXISTS "Employees can update their own vehicle mileage" ON public.vehicles;
CREATE POLICY "Employees can update their own vehicle mileage"
ON public.vehicles 
FOR UPDATE 
USING (responsavel_id IN (
  SELECT id FROM employees WHERE user_id = auth.uid()
)) 
WITH CHECK (responsavel_id IN (
  SELECT id FROM employees WHERE user_id = auth.uid()
));

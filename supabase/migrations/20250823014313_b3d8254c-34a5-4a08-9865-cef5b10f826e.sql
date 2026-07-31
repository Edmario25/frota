-- Remover campos antigos cargo e departamento da tabela employees
ALTER TABLE public.employees 
DROP COLUMN IF EXISTS cargo,
DROP COLUMN IF EXISTS departamento;
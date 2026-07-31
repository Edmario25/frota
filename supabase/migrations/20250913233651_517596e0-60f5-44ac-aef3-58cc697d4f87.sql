-- Primeira migração: Adicionar novo valor ao enum
ALTER TYPE app_role ADD VALUE 'gestor_obra';

-- Adicionar coluna para FK do responsável técnico
ALTER TABLE public.obras 
ADD COLUMN responsavel_tecnico_id UUID REFERENCES public.employees(id);
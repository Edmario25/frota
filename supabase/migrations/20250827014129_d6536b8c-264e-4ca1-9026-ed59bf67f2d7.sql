-- Adicionar coluna de fotos gerais na tabela de inspeções de veículos pesados
ALTER TABLE public.heavy_vehicle_inspections 
ADD COLUMN fotos_checklist TEXT;
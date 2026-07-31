-- Drop the existing constraint
ALTER TABLE inspection_checklists DROP CONSTRAINT IF EXISTS inspection_checklists_tipo_servico_check;

-- Add new constraint with all service types
ALTER TABLE inspection_checklists ADD CONSTRAINT inspection_checklists_tipo_servico_check 
CHECK (tipo_servico = ANY (ARRAY['entrada'::text, 'saida'::text, 'diario'::text, 'semanal'::text, 'mensal'::text]));
-- Update vehicle_accessories constraint to match frontend values
ALTER TABLE vehicle_accessories 
DROP CONSTRAINT IF EXISTS vehicle_accessories_tipo_acessorio_check;

-- Add updated constraint with correct values
ALTER TABLE vehicle_accessories 
ADD CONSTRAINT vehicle_accessories_tipo_acessorio_check 
CHECK (
  tipo_acessorio = ANY (ARRAY[
    'Película (Insulfilm)',
    'Substituição de Vidros',
    'Rastreadores', 
    'Alarme/Anti-furto'
  ])
  OR 
  -- Allow combinations of multiple types separated by comma
  position(',' in tipo_acessorio) > 0
);
-- Add new vehicle types for light vehicles
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'compacto';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'suv'; 
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'caminhonete';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'sedan';

-- Update existing 'leve' records to 'compacto' as default
UPDATE vehicles 
SET tipo = 'compacto' 
WHERE tipo = 'leve';
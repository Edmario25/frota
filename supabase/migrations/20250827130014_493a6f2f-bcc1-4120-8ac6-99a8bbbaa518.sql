-- Update the vehicle_type enum to include new types for light vehicles only
-- (Heavy vehicles will be managed separately in the heavy vehicles section)
-- Note: PostgreSQL does not support ALTER TYPE ... DROP VALUE
-- Workaround: convert column to TEXT, recreate enum with desired values, convert back

-- Step 1: add new values so existing rows can be updated to them
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'compacto';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'suv';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'caminhonete';
ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS 'sedan';

-- Step 2: update any existing 'leve' rows before removing that value
UPDATE vehicles
SET tipo = 'compacto'
WHERE tipo::text = 'leve';

-- Step 3: recreate the enum without 'leve' and 'pesado'
ALTER TABLE vehicles ALTER COLUMN tipo TYPE TEXT;
DROP TYPE vehicle_type;
CREATE TYPE vehicle_type AS ENUM ('compacto', 'suv', 'caminhonete', 'sedan');
ALTER TABLE vehicles ALTER COLUMN tipo TYPE vehicle_type USING tipo::vehicle_type;

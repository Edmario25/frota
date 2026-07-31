-- =====================================================================
-- Traccar GPS Integration
-- Adiciona traccar_device_id nas vehicles e chaves de config no system_settings
-- =====================================================================

-- 1. Adicionar coluna traccar_device_id na tabela vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS traccar_device_id integer DEFAULT NULL;

COMMENT ON COLUMN public.vehicles.traccar_device_id IS
  'ID do dispositivo no servidor Traccar (integer). NULL = sem GPS.';

-- 2. Garantir que a tabela system_settings existe (criada em migration anterior)
-- As chaves traccarUrl, traccarToken serão inseridas via app (upsert).
-- Aqui apenas garantimos que a tabela suporta as chaves sem restrição adicional.

-- Índice opcional para busca por vehicle traccar
CREATE INDEX IF NOT EXISTS idx_vehicles_traccar_device_id
  ON public.vehicles (traccar_device_id)
  WHERE traccar_device_id IS NOT NULL;

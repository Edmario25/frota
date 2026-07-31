-- Armazena a última leitura de distância do GPS (em metros)
-- Usada para calcular o delta (km rodados desde o último sync)
-- e somar ao quilometragem_atual sem sobrescrever o valor manual.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS traccar_last_distance bigint DEFAULT NULL;

COMMENT ON COLUMN public.vehicles.traccar_last_distance IS
  'Última leitura totalDistance do Traccar (metros). Usada para calcular delta de km a cada sync.';

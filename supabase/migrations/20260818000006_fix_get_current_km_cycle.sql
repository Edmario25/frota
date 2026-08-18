-- ─── Fix: get_current_km_cycle simplificada e robusta ────────────────────────
--
-- Problema: a versão anterior calculava v_cycle_start pela data de criação do
-- veículo e referenciava a coluna km_final (inexistente), causando erro silencioso
-- quando o ciclo ativo tinha cycle_start_date diferente do calculado.
--
-- Nova lógica:
--   1. Busca o ciclo ativo mais recente para o veículo
--   2. Se não existir, cria via create_vehicle_km_cycle(vehicle_id, CURRENT_DATE)
--   3. Atualiza km_rodados = max(0, quilometragem_atual - km_inicial)
--   4. Retorna os dados do ciclo

DROP FUNCTION IF EXISTS public.get_current_km_cycle(UUID);

CREATE OR REPLACE FUNCTION public.get_current_km_cycle(p_vehicle_id UUID)
RETURNS TABLE(
  cycle_id          UUID,
  cycle_start_date  DATE,
  cycle_end_date    DATE,
  km_inicial        INTEGER,
  limite_km_mensal  INTEGER,
  km_rodados        INTEGER,
  days_remaining    INTEGER,
  percentage_used   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_km   INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle        RECORD;
  v_new_id       UUID;
BEGIN
  -- Km atual do veículo
  SELECT COALESCE(quilometragem_atual, 0)
  INTO   v_current_km
  FROM   public.vehicles
  WHERE  id = p_vehicle_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Busca ciclo ativo mais recente
  SELECT * INTO v_cycle
  FROM   public.vehicle_km_cycles
  WHERE  vehicle_id = p_vehicle_id
    AND  status     = 'ativo'
  ORDER BY cycle_start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Cria ciclo iniciando hoje
    v_new_id := public.create_vehicle_km_cycle(p_vehicle_id, v_current_date);
    IF v_new_id IS NULL THEN
      RETURN; -- criação falhou (ex: outro ciclo ativo foi criado em race condition)
    END IF;

    SELECT * INTO v_cycle
    FROM   public.vehicle_km_cycles
    WHERE  id = v_new_id;
  END IF;

  -- Atualiza km_rodados com base no odômetro atual
  UPDATE public.vehicle_km_cycles
  SET    km_rodados = GREATEST(0, v_current_km - v_cycle.km_inicial),
         updated_at = now()
  WHERE  id = v_cycle.id
  RETURNING km_rodados INTO v_cycle.km_rodados;

  RETURN QUERY SELECT
    v_cycle.id,
    v_cycle.cycle_start_date,
    v_cycle.cycle_end_date,
    v_cycle.km_inicial,
    v_cycle.limite_km_mensal,
    v_cycle.km_rodados,
    (v_cycle.cycle_end_date - v_current_date)::INTEGER,
    CASE
      WHEN v_cycle.limite_km_mensal > 0
      THEN ROUND(
        (v_cycle.km_rodados::NUMERIC / v_cycle.limite_km_mensal::NUMERIC) * 100, 2
      )
      ELSE 0::NUMERIC
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_km_cycle(UUID) TO authenticated;

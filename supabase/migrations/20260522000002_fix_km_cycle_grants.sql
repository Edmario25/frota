-- ─────────────────────────────────────────────────────────────────
-- Correções para ciclos de KM e role gestor_contrato
-- ─────────────────────────────────────────────────────────────────

-- 1. Adiciona gestor_contrato ao enum (idempotente desde PG 12)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_contrato';

-- 2. Garante permissão de INSERT/UPDATE em vehicle_km_cycles
--    para os gestores (necessário caso SECURITY DEFINER não cubra todos os casos)
DROP POLICY IF EXISTS "gestores_can_manage_km_cycles" ON public.vehicle_km_cycles;
CREATE POLICY "gestores_can_manage_km_cycles"
ON public.vehicle_km_cycles FOR ALL
USING (
  get_user_role(auth.uid()) = ANY (ARRAY[
    'admin'::app_role,
    'gestor_frota'::app_role,
    'gestor_contrato'::app_role
  ])
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY (ARRAY[
    'admin'::app_role,
    'gestor_frota'::app_role,
    'gestor_contrato'::app_role
  ])
);

-- 3. Garante que usuários autenticados possam chamar as RPCs de ciclo
GRANT EXECUTE ON FUNCTION public.get_current_km_cycle(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_expired_km_cycles() TO authenticated;

-- 4. Recria get_current_km_cycle garantindo SECURITY DEFINER + owner postgres
-- (so INSERT inside the function always works regardless of caller's role)
DROP FUNCTION IF EXISTS public.get_current_km_cycle(UUID);
CREATE FUNCTION public.get_current_km_cycle(p_vehicle_id UUID)
RETURNS TABLE(
  cycle_id UUID,
  cycle_start_date DATE,
  cycle_end_date DATE,
  km_inicial INTEGER,
  limite_km_mensal INTEGER,
  km_rodados INTEGER,
  days_remaining INTEGER,
  percentage_used NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_created_date DATE;
  v_current_km   INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle_start  DATE;
  v_cycle_end    DATE;
  v_cycle_record RECORD;
BEGIN
  -- Busca data de criação e km atual do veículo
  SELECT created_at::DATE, quilometragem_atual
  INTO v_created_date, v_current_km
  FROM vehicles
  WHERE id = p_vehicle_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calcula período do ciclo a partir da data de criação do veículo
  SELECT
    v_created_date
      + (EXTRACT(YEAR  FROM AGE(v_current_date, v_created_date)) * 12
         + EXTRACT(MONTH FROM AGE(v_current_date, v_created_date)))::INTEGER
        * INTERVAL '1 month',
    v_created_date
      + (EXTRACT(YEAR  FROM AGE(v_current_date, v_created_date)) * 12
         + EXTRACT(MONTH FROM AGE(v_current_date, v_created_date)) + 1)::INTEGER
        * INTERVAL '1 month'
      - INTERVAL '1 day'
  INTO v_cycle_start, v_cycle_end;

  -- Tenta encontrar ciclo ativo existente
  SELECT * INTO v_cycle_record
  FROM vehicle_km_cycles
  WHERE vehicle_id     = p_vehicle_id
    AND cycle_start_date = v_cycle_start
    AND status         = 'ativo';

  IF NOT FOUND THEN
    -- Cria novo ciclo
    DECLARE
      v_previous_km INTEGER;
      v_limit       INTEGER := 2000;
    BEGIN
      SELECT quilometragem_maxima_mensal INTO v_limit
      FROM vehicles WHERE id = p_vehicle_id;

      -- km inicial = último km_final do ciclo anterior (ou km atual se for o primeiro)
      SELECT COALESCE(km_final, km_inicial) INTO v_previous_km
      FROM vehicle_km_cycles
      WHERE vehicle_id    = p_vehicle_id
        AND cycle_end_date < v_cycle_start
      ORDER BY cycle_end_date DESC
      LIMIT 1;

      IF v_previous_km IS NULL THEN
        SELECT quilometragem_atual INTO v_previous_km
        FROM vehicles WHERE id = p_vehicle_id;
      END IF;

      INSERT INTO vehicle_km_cycles (
        vehicle_id, cycle_start_date, cycle_end_date,
        km_inicial, limite_km_mensal, km_rodados
      ) VALUES (
        p_vehicle_id, v_cycle_start, v_cycle_end,
        v_previous_km,
        COALESCE(v_limit, 2000),
        GREATEST(0, v_current_km - v_previous_km)
      )
      RETURNING * INTO v_cycle_record;
    END;
  ELSE
    -- Atualiza km_rodados no ciclo existente
    UPDATE vehicle_km_cycles
    SET km_rodados = GREATEST(0, v_current_km - km_inicial),
        updated_at = now()
    WHERE id = v_cycle_record.id
    RETURNING * INTO v_cycle_record;
  END IF;

  RETURN QUERY SELECT
    v_cycle_record.id,
    v_cycle_record.cycle_start_date,
    v_cycle_record.cycle_end_date,
    v_cycle_record.km_inicial,
    v_cycle_record.limite_km_mensal,
    v_cycle_record.km_rodados,
    (v_cycle_record.cycle_end_date - v_current_date)::INTEGER,
    CASE
      WHEN v_cycle_record.limite_km_mensal > 0
      THEN ROUND(
        (v_cycle_record.km_rodados::NUMERIC / v_cycle_record.limite_km_mensal::NUMERIC) * 100,
        2
      )
      ELSE 0::NUMERIC
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_km_cycle(UUID) TO authenticated;

-- ─── Ciclos de KM por veículo: lógica baseada na data de cadastro ────────────
--
-- Regras:
--   • O ciclo começa no dia em que o veículo é cadastrado no sistema
--   • O fechamento ocorre na mesma data do mês subsequente - 1 dia
--     Ex.: cadastrado em 15/08 → ciclo 15/08 a 14/09 → próximo 15/09 a 14/10
--   • Ao inserir um veículo, o primeiro ciclo é criado automaticamente via trigger
--   • auto_renew_km_cycles() fecha ciclos vencidos e abre o próximo
--     (chamada no boot do módulo de frota e pode ser agendada via cron externo)

-- ─── 1. Função base: cria um único ciclo para um veículo ─────────────────────
CREATE OR REPLACE FUNCTION public.create_vehicle_km_cycle(
  p_vehicle_id  uuid,
  p_start_date  date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limite    integer;
  v_km_atual  numeric;
  v_cycle_id  uuid;
BEGIN
  -- Busca dados do veículo
  SELECT
    COALESCE(quilometragem_maxima_mensal, 2000),
    COALESCE(quilometragem_atual, 0)
  INTO v_limite, v_km_atual
  FROM public.vehicles
  WHERE id = p_vehicle_id;

  -- Não cria se já existe ciclo ativo
  IF EXISTS (
    SELECT 1 FROM public.vehicle_km_cycles
    WHERE vehicle_id = p_vehicle_id AND status = 'ativo'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.vehicle_km_cycles (
    vehicle_id,
    cycle_start_date,
    cycle_end_date,
    km_inicial,
    km_rodados,
    limite_km_mensal,
    status
  ) VALUES (
    p_vehicle_id,
    p_start_date,
    (p_start_date + interval '1 month' - interval '1 day')::date,
    v_km_atual,
    0,
    v_limite,
    'ativo'
  )
  RETURNING id INTO v_cycle_id;

  RETURN v_cycle_id;
END;
$$;

-- ─── 2. Trigger: cria primeiro ciclo ao cadastrar veículo ─────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_vehicle_create_first_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IN ('disponivel', 'em_uso') THEN
    PERFORM public.create_vehicle_km_cycle(NEW.id, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_create_first_cycle ON public.vehicles;
CREATE TRIGGER trg_vehicle_create_first_cycle
  AFTER INSERT ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_vehicle_create_first_cycle();

-- ─── 3. auto_renew_km_cycles: fecha vencidos e abre próximos ─────────────────
-- Substitui create_monthly_km_cycles() com a lógica correta de aniversário.
-- Retorna o número de ciclos novos criados.

CREATE OR REPLACE FUNCTION public.auto_renew_km_cycles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count  integer := 0;
  rec      RECORD;
BEGIN
  -- Fecha ciclos ativos cuja data de fim já passou
  FOR rec IN
    SELECT id, vehicle_id, cycle_end_date
    FROM   public.vehicle_km_cycles
    WHERE  status = 'ativo'
      AND  cycle_end_date < CURRENT_DATE
  LOOP
    UPDATE public.vehicle_km_cycles
    SET    status = 'encerrado'
    WHERE  id = rec.id;

    -- Próximo ciclo começa no dia seguinte ao fim do anterior
    -- mantendo o aniversário (ex.: 15/08→14/09 → próximo 15/09→14/10)
    PERFORM public.create_vehicle_km_cycle(
      rec.vehicle_id,
      rec.cycle_end_date + 1
    );
    v_count := v_count + 1;
  END LOOP;

  -- Cria primeiro ciclo para veículos disponíveis/em_uso sem ciclo ativo
  FOR rec IN
    SELECT id
    FROM   public.vehicles v
    WHERE  v.status IN ('disponivel', 'em_uso')
      AND  NOT EXISTS (
        SELECT 1 FROM public.vehicle_km_cycles c
        WHERE  c.vehicle_id = v.id AND c.status = 'ativo'
      )
  LOOP
    PERFORM public.create_vehicle_km_cycle(rec.id, CURRENT_DATE);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Mantém create_monthly_km_cycles() como alias para não quebrar chamadas antigas
CREATE OR REPLACE FUNCTION public.create_monthly_km_cycles()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.auto_renew_km_cycles();
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.create_vehicle_km_cycle(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_renew_km_cycles()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_monthly_km_cycles()           TO authenticated;

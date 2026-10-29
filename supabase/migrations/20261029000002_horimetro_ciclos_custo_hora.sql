-- ============================================================================
-- Ciclo mensal de horímetro e custo por hora
--
-- O custo por quilômetro existia porque `vehicle_km_cycles` guarda quanto cada
-- veículo rodou em cada mês. Para horímetro não havia equivalente: o horímetro
-- só era conhecido nos pontos em que alguma OS o registrou, e dividir custo por
-- um intervalo desconhecido daria um número errado com cara de certo.
--
-- Esta migration cria a série que faltava, espelhando o modelo de km, e passa a
-- separar os dois indicadores por tipo de medição:
--
--   custo por km   → veículos medidos em quilômetro
--   custo por hora → equipamentos medidos em horímetro
--
-- Misturar os dois num número só é o erro comum: uma escavadeira que roda 20 km
-- e trabalha 180 horas no mês destruiria o custo por km da frota.
--
-- Rodar inteiro, de uma vez. Idempotente.
-- ============================================================================

-- ─── 1. CICLO MENSAL DE HORÍMETRO ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicle_horimetro_cycles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id         uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  cycle_start_date   date NOT NULL,
  cycle_end_date     date NOT NULL,
  horimetro_inicial  numeric(12,1) NOT NULL,
  horimetro_final    numeric(12,1),
  limite_horas_mensal numeric(10,1),
  horas_rodadas      numeric(12,1) NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'fechado')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, cycle_start_date)
);

CREATE INDEX IF NOT EXISTS idx_horimetro_cycles_veic
  ON public.vehicle_horimetro_cycles(vehicle_id, cycle_start_date DESC);

ALTER TABLE public.vehicle_horimetro_cycles ENABLE ROW LEVEL SECURITY;

-- Mesma regra dos documentos do veículo (pode_geral), e não o get_user_role da
-- tabela antiga de km: permissão no sistema é por ação, não por cargo fixo.
DROP POLICY IF EXISTS horimetro_cycles_read ON public.vehicle_horimetro_cycles;
CREATE POLICY horimetro_cycles_read ON public.vehicle_horimetro_cycles FOR SELECT TO authenticated
  USING (public.pode_geral('frota.visualizar') OR public.pode_geral('manutencao.visualizar'));

DROP POLICY IF EXISTS horimetro_cycles_write ON public.vehicle_horimetro_cycles;
CREATE POLICY horimetro_cycles_write ON public.vehicle_horimetro_cycles FOR ALL TO authenticated
  USING (public.pode_geral('frota.editar') OR public.pode_geral('manutencao.editar'))
  WITH CHECK (public.pode_geral('frota.editar') OR public.pode_geral('manutencao.editar'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_horimetro_cycles TO authenticated;

DROP TRIGGER IF EXISTS trg_horimetro_cycles_updated ON public.vehicle_horimetro_cycles;
CREATE TRIGGER trg_horimetro_cycles_updated
BEFORE UPDATE ON public.vehicle_horimetro_cycles
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

COMMENT ON TABLE public.vehicle_horimetro_cycles IS 'Horas de motor por mês, espelhando vehicle_km_cycles. É a série que permite custo por hora de equipamento.';

-- ─── 2. O CICLO SE ALIMENTA SOZINHO ─────────────────────────────────────────
-- Trigger em vez de chamada no aplicativo: o horímetro entra por três portas
-- diferentes (cadastro, OS e rastreador), e cada uma lembrar de atualizar o
-- ciclo é a forma garantida de a série ficar furada.

CREATE OR REPLACE FUNCTION public.frota_fn_ciclo_horimetro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inicio    date := date_trunc('month', current_date)::date;
  v_fim       date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_anterior  numeric(12,1);
  v_inicial   numeric(12,1);
BEGIN
  IF COALESCE(NEW.horimetro_atual, 0) <= 0
     OR NEW.horimetro_atual IS NOT DISTINCT FROM OLD.horimetro_atual THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(c.horimetro_final, c.horimetro_inicial + c.horas_rodadas)
  INTO   v_anterior
  FROM   public.vehicle_horimetro_cycles c
  WHERE  c.vehicle_id = NEW.id AND c.cycle_start_date < v_inicio
  ORDER BY c.cycle_start_date DESC
  LIMIT 1;

  -- Primeiro ciclo do equipamento: parte da medição que ele tinha antes desta
  -- atualização, e não de zero — senão o primeiro mês contaria a vida inteira.
  v_inicial := COALESCE(v_anterior, OLD.horimetro_atual, NEW.horimetro_atual);

  INSERT INTO public.vehicle_horimetro_cycles AS c (
    vehicle_id, cycle_start_date, cycle_end_date,
    horimetro_inicial, limite_horas_mensal, horas_rodadas
  ) VALUES (
    NEW.id, v_inicio, v_fim,
    v_inicial, NEW.limite_horimetro_mensal,
    GREATEST(0, NEW.horimetro_atual - v_inicial)
  )
  ON CONFLICT (vehicle_id, cycle_start_date) DO UPDATE
  SET horas_rodadas = GREATEST(0, NEW.horimetro_atual - c.horimetro_inicial),
      horimetro_final = NEW.horimetro_atual,
      updated_at = now()
  WHERE c.status = 'ativo';

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vehicles_ciclo_horimetro ON public.vehicles;
CREATE TRIGGER trg_vehicles_ciclo_horimetro
AFTER UPDATE OF horimetro_atual ON public.vehicles
FOR EACH ROW
WHEN (NEW.tipo_medicao = 'horimetro')
EXECUTE FUNCTION public.frota_fn_ciclo_horimetro();

COMMENT ON FUNCTION public.frota_fn_ciclo_horimetro() IS 'Mantém o ciclo mensal de horas do equipamento a cada mudança do horímetro, venha ela do cadastro, da OS ou do rastreador.';

-- Fecha os ciclos de meses anteriores — chamar junto da virada do mês, ou
-- deixar para o próximo lançamento, que não os reabre.
CREATE OR REPLACE FUNCTION public.frota_fechar_ciclos_horimetro()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fechados integer;
BEGIN
  UPDATE public.vehicle_horimetro_cycles
  SET status = 'fechado',
      horimetro_final = COALESCE(horimetro_final, horimetro_inicial + horas_rodadas),
      updated_at = now()
  WHERE status = 'ativo'
    AND cycle_end_date < current_date;
  GET DIAGNOSTICS v_fechados = ROW_COUNT;
  RETURN v_fechados;
END $$;

-- ─── 3. HORAS RODADAS NO PERÍODO ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.frota_horas_rodadas(
  p_inicio date, p_fim date, p_vehicle_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(c.horas_rodadas), 0)::numeric
  FROM public.vehicle_horimetro_cycles c
  WHERE c.cycle_start_date <= p_fim
    AND c.cycle_end_date   >= p_inicio
    AND (p_vehicle_id IS NULL OR c.vehicle_id = p_vehicle_id);
$$;

COMMENT ON FUNCTION public.frota_horas_rodadas(date,date,uuid) IS 'Horas de motor no período pelos ciclos mensais. Ciclo que cruza a borda entra inteiro — mesma aproximação do km.';

-- ─── 4. INDICADORES COM CUSTO POR HORA ──────────────────────────────────────
-- O tipo de retorno muda, então a função sai e volta.

DROP FUNCTION IF EXISTS public.manutencao_indicadores(date, date, uuid);

CREATE FUNCTION public.manutencao_indicadores(
  p_inicio date DEFAULT (current_date - 90),
  p_fim    date DEFAULT current_date,
  p_obra_id uuid DEFAULT NULL
)
RETURNS TABLE (
  previstas            integer,
  concluidas           integer,
  concluidas_no_prazo  integer,
  aderencia_pct        numeric,
  vencidas_hoje        integer,
  custo_total          numeric,
  custo_preventiva     numeric,
  custo_corretiva      numeric,
  corretiva_pct_custo  numeric,
  ordens_preventivas   integer,
  ordens_corretivas    integer,
  km_rodado            numeric,
  custo_km_frota       numeric,
  custo_por_km         numeric,
  horas_rodadas        numeric,
  custo_hora_frota     numeric,
  custo_por_hora       numeric,
  horas_parado         numeric,
  veiculos             integer,
  disponibilidade_pct  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_horas_periodo numeric := GREATEST((p_fim - p_inicio) + 1, 1) * 24;
BEGIN
  RETURN QUERY
  WITH escopo AS (
    SELECT m.*, v.tipo_medicao
    FROM public.maintenance_records m
    JOIN public.vehicles v ON v.id = m.vehicle_id
    WHERE COALESCE(m.data_realizada, m.data_agendada) BETWEEN p_inicio AND p_fim
      AND (p_obra_id IS NULL OR m.obra_id = p_obra_id)
      AND m.status <> 'cancelada'
  ),
  plano AS (SELECT * FROM escopo WHERE plano_item_id IS NOT NULL),
  medicao AS (
    -- Cada indicador olha só os veículos da sua unidade: misturar escavadeira
    -- com caminhonete num custo por km só destrói os dois números.
    SELECT
      COALESCE(sum(public.frota_km_rodado(p_inicio, p_fim, v.id))
               FILTER (WHERE COALESCE(v.tipo_medicao, 'km') <> 'horimetro'), 0) AS km,
      COALESCE(sum(public.frota_horas_rodadas(p_inicio, p_fim, v.id))
               FILTER (WHERE v.tipo_medicao = 'horimetro'), 0)                  AS horas
    FROM public.vehicles v
    WHERE v.status IS DISTINCT FROM 'inativo'
  ),
  custo AS (
    SELECT
      COALESCE(sum(custo) FILTER (WHERE status = 'concluida'), 0)              AS total,
      COALESCE(sum(custo) FILTER (WHERE status = 'concluida'
               AND COALESCE(tipo_medicao, 'km') <> 'horimetro'), 0)            AS em_km,
      COALESCE(sum(custo) FILTER (WHERE status = 'concluida'
               AND tipo_medicao = 'horimetro'), 0)                             AS em_horas
    FROM escopo
  ),
  frota AS (
    SELECT count(*)::integer AS total FROM public.vehicles v WHERE v.status IS DISTINCT FROM 'inativo'
  )
  SELECT
    (SELECT count(*) FROM plano)::integer,
    (SELECT count(*) FROM plano WHERE status = 'concluida')::integer,
    (SELECT count(*) FROM plano WHERE status = 'concluida'
        AND data_realizada IS NOT NULL AND data_realizada <= data_agendada)::integer,
    CASE WHEN (SELECT count(*) FROM plano) = 0 THEN NULL
         ELSE round(100.0 * (SELECT count(*) FROM plano WHERE status = 'concluida'
                               AND data_realizada IS NOT NULL AND data_realizada <= data_agendada)
                        / (SELECT count(*) FROM plano), 1) END,
    (SELECT count(*) FROM public.v_manutencao_vencimentos WHERE situacao = 'vencida')::integer,
    (SELECT total FROM custo),
    COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida' AND tipo = 'preventiva'), 0),
    COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida' AND tipo <> 'preventiva'), 0),
    CASE WHEN (SELECT total FROM custo) = 0 THEN NULL
         ELSE round(100.0 * COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida' AND tipo <> 'preventiva'), 0)
                        / (SELECT total FROM custo), 1) END,
    (SELECT count(*) FROM escopo WHERE tipo = 'preventiva')::integer,
    (SELECT count(*) FROM escopo WHERE tipo <> 'preventiva')::integer,
    (SELECT km FROM medicao),
    (SELECT em_km FROM custo),
    CASE WHEN (SELECT km FROM medicao) > 0
         THEN round((SELECT em_km FROM custo) / (SELECT km FROM medicao), 2) END,
    (SELECT horas FROM medicao),
    (SELECT em_horas FROM custo),
    CASE WHEN (SELECT horas FROM medicao) > 0
         THEN round((SELECT em_horas FROM custo) / (SELECT horas FROM medicao), 2) END,
    COALESCE((SELECT sum(indisponibilidade_horas) FROM escopo), 0),
    (SELECT total FROM frota),
    CASE WHEN (SELECT total FROM frota) = 0 THEN NULL
         ELSE round(100.0 - 100.0 * COALESCE((SELECT sum(indisponibilidade_horas) FROM escopo), 0)
                    / ((SELECT total FROM frota) * v_horas_periodo), 1) END;
END $$;

REVOKE ALL ON FUNCTION public.manutencao_indicadores(date,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manutencao_indicadores(date,date,uuid) TO authenticated;

COMMENT ON FUNCTION public.manutencao_indicadores(date,date,uuid) IS 'Indicadores do período. Custo por km conta só veículo medido em km; custo por hora, só equipamento com horímetro — e cada um divide pelo custo da sua própria turma.';

-- ─── 5. RANKING POR VEÍCULO, NA UNIDADE DE CADA UM ──────────────────────────

DROP FUNCTION IF EXISTS public.manutencao_indicadores_veiculo(date, date);

CREATE FUNCTION public.manutencao_indicadores_veiculo(
  p_inicio date DEFAULT (current_date - 90),
  p_fim    date DEFAULT current_date
)
RETURNS TABLE (
  vehicle_id uuid, placa text, marca text, modelo text, tipo_medicao text,
  ordens integer, corretivas integer,
  custo numeric, km_rodado numeric, custo_por_km numeric,
  horas_rodadas numeric, custo_por_hora numeric,
  horas_parado numeric, vencidas integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    v.id, v.placa, v.marca, v.modelo, COALESCE(v.tipo_medicao, 'km'),
    COALESCE(m.ordens, 0)::integer,
    COALESCE(m.corretivas, 0)::integer,
    COALESCE(m.custo, 0),
    public.frota_km_rodado(p_inicio, p_fim, v.id),
    CASE WHEN COALESCE(v.tipo_medicao, 'km') <> 'horimetro'
          AND public.frota_km_rodado(p_inicio, p_fim, v.id) > 0
         THEN round(COALESCE(m.custo, 0) / public.frota_km_rodado(p_inicio, p_fim, v.id), 2) END,
    public.frota_horas_rodadas(p_inicio, p_fim, v.id),
    CASE WHEN v.tipo_medicao = 'horimetro'
          AND public.frota_horas_rodadas(p_inicio, p_fim, v.id) > 0
         THEN round(COALESCE(m.custo, 0) / public.frota_horas_rodadas(p_inicio, p_fim, v.id), 2) END,
    COALESCE(m.horas_parado, 0),
    COALESCE(w.vencidas, 0)::integer
  FROM public.vehicles v
  LEFT JOIN (
    SELECT vehicle_id,
           count(*)                                      AS ordens,
           count(*) FILTER (WHERE tipo <> 'preventiva')   AS corretivas,
           sum(custo) FILTER (WHERE status = 'concluida') AS custo,
           sum(indisponibilidade_horas)                   AS horas_parado
    FROM public.maintenance_records
    WHERE COALESCE(data_realizada, data_agendada) BETWEEN p_inicio AND p_fim
      AND status <> 'cancelada'
    GROUP BY vehicle_id
  ) m ON m.vehicle_id = v.id
  LEFT JOIN (
    SELECT vehicle_id, count(*) AS vencidas
    FROM public.v_manutencao_vencimentos WHERE situacao = 'vencida'
    GROUP BY vehicle_id
  ) w ON w.vehicle_id = v.id
  WHERE v.status IS DISTINCT FROM 'inativo'
  ORDER BY COALESCE(m.custo, 0) DESC, v.placa;
$$;

REVOKE ALL ON FUNCTION public.manutencao_indicadores_veiculo(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manutencao_indicadores_veiculo(date,date) TO authenticated;

-- ─── 6. PRIMEIRO CICLO DE QUEM JÁ TEM HORÍMETRO ─────────────────────────────
-- Sem isto, o indicador só começaria a existir no próximo lançamento de cada
-- equipamento. O ciclo nasce zerado: conta daqui para frente, não retroage.

INSERT INTO public.vehicle_horimetro_cycles (
  vehicle_id, cycle_start_date, cycle_end_date,
  horimetro_inicial, limite_horas_mensal, horas_rodadas
)
SELECT
  v.id,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  COALESCE(v.horimetro_atual, 0),
  v.limite_horimetro_mensal,
  0
FROM public.vehicles v
WHERE v.tipo_medicao = 'horimetro'
  AND v.status IS DISTINCT FROM 'inativo'
ON CONFLICT (vehicle_id, cycle_start_date) DO NOTHING;

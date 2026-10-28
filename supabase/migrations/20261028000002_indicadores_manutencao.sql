-- ============================================================================
-- Indicadores de manutenção e medição automática (Bloco 4)
--
-- Os três blocos anteriores produziram o dado: plano com vencimento, OS com
-- peça, mão de obra e indisponibilidade. Falta transformar isso em número que
-- diz se a manutenção está funcionando — e parar de depender de alguém digitar
-- a quilometragem.
--
-- Quatro indicadores, com a definição explícita de cada um (benchmark de
-- mercado varia demais entre fontes; o que vale é a série do próprio parque):
--
--   aderência ao plano  = preventivas do plano concluídas no prazo ÷ previstas
--   custo por km/hora   = custo de manutenção ÷ medição rodada no período
--   disponibilidade     = 1 − horas parado em oficina ÷ horas do período
--   corretiva × preventiva = proporção de corretiva, em quantidade e em custo
--
-- Rodar inteiro, de uma vez. Idempotente.
-- ============================================================================

-- ─── 1. MEDIÇÃO RODADA NO PERÍODO ───────────────────────────────────────────
-- Km vem dos ciclos mensais, que já existem e são fechados pelo sistema. Fora
-- do ciclo não há série histórica de odômetro, então o indicador por hora usa
-- o horímetro das próprias OS — é o dado disponível, e a tela diz isso.

CREATE OR REPLACE FUNCTION public.frota_km_rodado(
  p_inicio date, p_fim date, p_vehicle_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(c.km_rodados), 0)::numeric
  FROM public.vehicle_km_cycles c
  WHERE c.cycle_start_date <= p_fim
    AND c.cycle_end_date   >= p_inicio
    AND (p_vehicle_id IS NULL OR c.vehicle_id = p_vehicle_id);
$$;

COMMENT ON FUNCTION public.frota_km_rodado(date,date,uuid) IS 'Km rodado no período pelos ciclos mensais. Ciclo que cruza a borda do período entra inteiro — aproximação assumida.';

-- ─── 2. INDICADORES DO PERÍODO ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.manutencao_indicadores(
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
  custo_por_km         numeric,
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
    SELECT m.*
    FROM public.maintenance_records m
    WHERE COALESCE(m.data_realizada, m.data_agendada) BETWEEN p_inicio AND p_fim
      AND (p_obra_id IS NULL OR m.obra_id = p_obra_id)
      AND m.status <> 'cancelada'
  ),
  plano AS (  -- só o que nasceu de plano entra na aderência
    SELECT * FROM escopo WHERE plano_item_id IS NOT NULL
  ),
  frota AS (
    SELECT count(*)::integer AS total
    FROM public.vehicles v
    WHERE v.status <> 'inativo'
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
    COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida'), 0),
    COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida' AND tipo = 'preventiva'), 0),
    COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida' AND tipo <> 'preventiva'), 0),
    CASE WHEN COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida'), 0) = 0 THEN NULL
         ELSE round(100.0 * COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida' AND tipo <> 'preventiva'), 0)
                        / (SELECT sum(custo) FROM escopo WHERE status = 'concluida'), 1) END,
    (SELECT count(*) FROM escopo WHERE tipo = 'preventiva')::integer,
    (SELECT count(*) FROM escopo WHERE tipo <> 'preventiva')::integer,
    public.frota_km_rodado(p_inicio, p_fim, NULL),
    CASE WHEN public.frota_km_rodado(p_inicio, p_fim, NULL) > 0
         THEN round(COALESCE((SELECT sum(custo) FROM escopo WHERE status = 'concluida'), 0)
                    / public.frota_km_rodado(p_inicio, p_fim, NULL), 2) END,
    COALESCE((SELECT sum(indisponibilidade_horas) FROM escopo), 0),
    (SELECT total FROM frota),
    CASE WHEN (SELECT total FROM frota) = 0 THEN NULL
         ELSE round(100.0 - 100.0 * COALESCE((SELECT sum(indisponibilidade_horas) FROM escopo), 0)
                    / ((SELECT total FROM frota) * v_horas_periodo), 1) END;
END $$;

REVOKE ALL ON FUNCTION public.manutencao_indicadores(date,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manutencao_indicadores(date,date,uuid) TO authenticated;

COMMENT ON FUNCTION public.manutencao_indicadores(date,date,uuid) IS 'Indicadores do período. Aderência conta só manutenção nascida de plano; disponibilidade usa horas de oficina sobre a frota ativa — sem entrada/saída preenchidas, aparece como 100%, o que é ausência de dado, não excelência.';

-- ─── 3. RANKING POR VEÍCULO ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.manutencao_indicadores_veiculo(
  p_inicio date DEFAULT (current_date - 90),
  p_fim    date DEFAULT current_date
)
RETURNS TABLE (
  vehicle_id uuid, placa text, marca text, modelo text,
  ordens integer, corretivas integer,
  custo numeric, km_rodado numeric, custo_por_km numeric,
  horas_parado numeric, vencidas integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    v.id, v.placa, v.marca, v.modelo,
    COALESCE(m.ordens, 0)::integer,
    COALESCE(m.corretivas, 0)::integer,
    COALESCE(m.custo, 0),
    public.frota_km_rodado(p_inicio, p_fim, v.id),
    CASE WHEN public.frota_km_rodado(p_inicio, p_fim, v.id) > 0
         THEN round(COALESCE(m.custo, 0) / public.frota_km_rodado(p_inicio, p_fim, v.id), 2) END,
    COALESCE(m.horas_parado, 0),
    COALESCE(w.vencidas, 0)::integer
  FROM public.vehicles v
  LEFT JOIN (
    SELECT vehicle_id,
           count(*)                                        AS ordens,
           count(*) FILTER (WHERE tipo <> 'preventiva')     AS corretivas,
           sum(custo) FILTER (WHERE status = 'concluida')   AS custo,
           sum(indisponibilidade_horas)                     AS horas_parado
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
  WHERE v.status <> 'inativo'
  ORDER BY COALESCE(m.custo, 0) DESC, v.placa;
$$;

REVOKE ALL ON FUNCTION public.manutencao_indicadores_veiculo(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manutencao_indicadores_veiculo(date,date) TO authenticated;

-- ─── 4. MEDIÇÃO AUTOMÁTICA PELO RASTREADOR ──────────────────────────────────
-- O gatilho do plano lê `vehicles.quilometragem_atual` e `horimetro_atual`, que
-- hoje dependem de alguém digitar. O Traccar já reporta odômetro e horas na
-- mesma varredura que alimenta o controle de velocidade.
--
-- Regras defensivas: medição nunca anda para trás (troca de rastreador zera o
-- acumulado e derrubaria o plano) e salto absurdo é ignorado.

CREATE OR REPLACE FUNCTION public.frota_atualizar_medicao(
  p_device_id  integer,
  p_km_delta   numeric DEFAULT NULL,   -- km percorridos na janela processada
  p_horas_delta numeric DEFAULT NULL,  -- horas de motor na mesma janela
  p_km_absoluto numeric DEFAULT NULL   -- odômetro lido do próprio veículo, quando o equipamento reporta
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k_salto_km    constant numeric := 5000;   -- km a mais numa única leitura
  k_salto_horas constant numeric := 500;
  v_veiculo public.vehicles%ROWTYPE;
  v_atual_km numeric;
  v_atual_horas numeric;
  v_novo_km numeric;
  v_novas_horas numeric;
  v_aplicou text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_veiculo FROM public.vehicles WHERE traccar_device_id = p_device_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'veiculo_nao_vinculado');
  END IF;

  v_atual_km    := COALESCE(v_veiculo.quilometragem_atual, 0);
  v_atual_horas := COALESCE(v_veiculo.horimetro_atual, 0);

  -- Odômetro do veículo tem prioridade sobre a soma do rastreador: é o número
  -- que o mecânico lê no painel, e é por ele que a manutenção é cobrada.
  v_novo_km := CASE
                 WHEN p_km_absoluto IS NOT NULL THEN floor(p_km_absoluto)
                 WHEN p_km_delta IS NOT NULL AND p_km_delta > 0 THEN floor(v_atual_km + p_km_delta)
               END;

  IF v_novo_km IS NOT NULL
     AND v_novo_km > v_atual_km
     AND v_novo_km - v_atual_km <= k_salto_km THEN
    UPDATE public.vehicles SET quilometragem_atual = v_novo_km, updated_at = now()
    WHERE id = v_veiculo.id;
    v_aplicou := v_aplicou || 'km';
  END IF;

  IF p_horas_delta IS NOT NULL AND p_horas_delta > 0 THEN
    v_novas_horas := round(v_atual_horas + p_horas_delta, 1);
    IF v_novas_horas - v_atual_horas <= k_salto_horas THEN
      UPDATE public.vehicles SET horimetro_atual = v_novas_horas, updated_at = now()
      WHERE id = v_veiculo.id;
      v_aplicou := v_aplicou || 'horas';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'vehicle_id', v_veiculo.id, 'placa', v_veiculo.placa,
    'aplicou', to_jsonb(v_aplicou),
    'km_atual', (SELECT quilometragem_atual FROM public.vehicles WHERE id = v_veiculo.id),
    'horimetro_atual', (SELECT horimetro_atual FROM public.vehicles WHERE id = v_veiculo.id)
  );
END $$;

-- A assinatura anterior (km absoluto no 2º argumento) existia só neste arquivo;
-- se foi criada numa execução parcial, sai agora para não ficar ambígua.
DROP FUNCTION IF EXISTS public.frota_atualizar_medicao(integer, numeric, numeric);

REVOKE ALL ON FUNCTION public.frota_atualizar_medicao(integer,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.frota_atualizar_medicao(integer,numeric,numeric,numeric) TO authenticated;

COMMENT ON FUNCTION public.frota_atualizar_medicao(integer,numeric,numeric,numeric) IS 'Atualiza km e horímetro do veículo pelo rastreador, somando o percorrido na janela. Nunca retrocede e ignora salto acima de 5.000 km ou 500 h numa leitura — troca de equipamento zera o acumulado e derrubaria o plano de manutenção.';

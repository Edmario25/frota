-- ============================================================================
-- Ajustes do plano de manutenção para a frota inteira
--
-- Dois defeitos encontrados na revisão, e a unificação dos documentos:
--
--   1. Veículo baixado (status 'inativo') continuava gerando vencimento. A
--      baixa preserva o histórico de propósito, mas um caminhão devolvido à
--      locadora aparecendo como "vencido" todo dia tira a credibilidade do
--      painel — e painel em que ninguém confia deixa de ser aberto.
--
--   2. Duas tabelas de documento: vehicle_documents (antiga, só arquivo, sem
--      tela de cadastro) e vehicle_documentos (nova, com tela, histórico e
--      alerta). A liberação do veículo consultava a ANTIGA, então documento
--      cadastrado na tela nova avisava mas não bloqueava nada. Isso é pior do
--      que não ter a tela: cria sensação de controle sem o controle.
--
-- Rodar inteiro, de uma vez. Idempotente — a migração de documentos não
-- duplica registro em nenhuma segunda execução.
-- ============================================================================

-- ─── 1. VENCIMENTO NÃO PERSEGUE VEÍCULO BAIXADO ─────────────────────────────
-- A view é reescrita idêntica à original, com UMA linha a mais: o filtro do
-- veículo baixado. Nenhuma coluna muda — CREATE OR REPLACE VIEW recusaria.

CREATE OR REPLACE VIEW public.v_manutencao_vencimentos AS
WITH base AS (
  SELECT
    pv.vehicle_id,
    v.placa,
    v.marca,
    v.modelo,
    v.tipo_medicao,
    COALESCE(v.quilometragem_atual, 0)      AS km_atual,
    COALESCE(v.horimetro_atual, 0)::numeric AS horimetro_atual,
    p.id   AS plano_id,
    p.nome AS plano_nome,
    i.id   AS item_id,
    i.servico,
    i.intervalo_km,
    i.intervalo_horas,
    i.intervalo_dias,
    i.antecedencia_km,
    i.antecedencia_horas,
    i.antecedencia_dias,
    i.bloqueia_veiculo,
    ult.data_realizada AS ultima_data,
    ult.quilometragem  AS ultimo_km,
    ult.horimetro      AS ultimo_horimetro,
    COALESCE(ult.quilometragem, pv.base_km, 0)        AS ref_km,
    COALESCE(ult.horimetro, pv.base_horimetro, 0)     AS ref_horimetro,
    COALESCE(ult.data_realizada, pv.base_data)        AS ref_data
  FROM public.manutencao_plano_veiculos pv
  JOIN public.vehicles v              ON v.id = pv.vehicle_id
  JOIN public.manutencao_planos p     ON p.id = pv.plano_id AND p.ativo
  JOIN public.manutencao_plano_itens i ON i.plano_id = p.id AND i.ativo
  LEFT JOIN LATERAL (
    SELECT m.data_realizada, m.quilometragem, m.horimetro
    FROM   public.maintenance_records m
    WHERE  m.vehicle_id = pv.vehicle_id
      AND  m.plano_item_id = i.id
      AND  m.status = 'concluida'
    ORDER BY m.data_realizada DESC NULLS LAST
    LIMIT 1
  ) ult ON true
  WHERE v.status IS DISTINCT FROM 'inativo'   -- baixado não vence mais nada
), calculado AS (
  SELECT
    base.*,
    CASE WHEN intervalo_km    IS NOT NULL THEN ref_km + intervalo_km END          AS proximo_km,
    CASE WHEN intervalo_horas IS NOT NULL THEN ref_horimetro + intervalo_horas END AS proximo_horimetro,
    CASE WHEN intervalo_dias  IS NOT NULL THEN ref_data + intervalo_dias END      AS proxima_data
  FROM base
), restante AS (
  SELECT
    calculado.*,
    CASE WHEN proximo_km        IS NOT NULL THEN proximo_km - km_atual END               AS km_restante,
    CASE WHEN proximo_horimetro IS NOT NULL THEN proximo_horimetro - horimetro_atual END AS horas_restantes,
    CASE WHEN proxima_data      IS NOT NULL THEN proxima_data - current_date END         AS dias_restantes
  FROM calculado
)
SELECT
  vehicle_id, placa, marca, modelo, tipo_medicao,
  plano_id, plano_nome, item_id, servico, bloqueia_veiculo,
  km_atual, horimetro_atual,
  ultima_data, ultimo_km, ultimo_horimetro,
  ref_data, ref_km, ref_horimetro,
  proximo_km, proximo_horimetro, proxima_data,
  km_restante, horas_restantes, dias_restantes,
  -- Quanto falta, em percentual do gatilho mais adiantado (0 = vencendo agora).
  LEAST(
    COALESCE(CASE WHEN intervalo_km    > 0 THEN km_restante::numeric    / intervalo_km    END, 1),
    COALESCE(CASE WHEN intervalo_horas > 0 THEN horas_restantes         / intervalo_horas END, 1),
    COALESCE(CASE WHEN intervalo_dias  > 0 THEN dias_restantes::numeric / intervalo_dias  END, 1)
  ) AS folga_fracao,
  -- Qual gatilho chega primeiro, para a tela dizer "vence por km" ou "por hora".
  CASE
    WHEN km_restante IS NOT NULL AND km_restante <= 0 THEN 'km'
    WHEN horas_restantes IS NOT NULL AND horas_restantes <= 0 THEN 'horas'
    WHEN dias_restantes IS NOT NULL AND dias_restantes <= 0 THEN 'dias'
    WHEN COALESCE(CASE WHEN intervalo_km > 0 THEN km_restante::numeric / intervalo_km END, 1)
         <= LEAST(COALESCE(CASE WHEN intervalo_horas > 0 THEN horas_restantes / intervalo_horas END, 1),
                  COALESCE(CASE WHEN intervalo_dias  > 0 THEN dias_restantes::numeric / intervalo_dias END, 1))
         AND intervalo_km IS NOT NULL THEN 'km'
    WHEN COALESCE(CASE WHEN intervalo_horas > 0 THEN horas_restantes / intervalo_horas END, 1)
         <= COALESCE(CASE WHEN intervalo_dias > 0 THEN dias_restantes::numeric / intervalo_dias END, 1)
         AND intervalo_horas IS NOT NULL THEN 'horas'
    ELSE 'dias'
  END AS gatilho,
  CASE
    WHEN (km_restante IS NOT NULL AND km_restante <= 0)
      OR (horas_restantes IS NOT NULL AND horas_restantes <= 0)
      OR (dias_restantes IS NOT NULL AND dias_restantes <= 0) THEN 'vencida'
    WHEN (km_restante IS NOT NULL AND km_restante <= antecedencia_km)
      OR (horas_restantes IS NOT NULL AND horas_restantes <= antecedencia_horas)
      OR (dias_restantes IS NOT NULL AND dias_restantes <= antecedencia_dias) THEN 'a_vencer'
    ELSE 'em_dia'
  END AS situacao,
  (ultima_data IS NULL) AS sem_historico
FROM restante;

COMMENT ON VIEW public.v_manutencao_vencimentos IS 'Próximo vencimento de cada item de plano por veículo ativo, em km, horas e dias — vale o que vencer primeiro. Sem execução registrada, conta da linha de base. Veículo baixado (status inativo) fica de fora.';

-- ─── 2. UM ÚNICO CADASTRO DE DOCUMENTO ──────────────────────────────────────
-- Traz o que existe na tabela antiga para a nova, preservando o histórico, e
-- marca a antiga como encerrada para novos registros.

DO $$
DECLARE
  v_migrados integer := 0;
BEGIN
  IF to_regclass('public.vehicle_documents') IS NULL THEN
    RAISE NOTICE 'vehicle_documents não existe; nada a migrar.';
    RETURN;
  END IF;

  INSERT INTO public.vehicle_documentos (
    vehicle_id, tipo, descricao, data_vencimento, arquivo_url, vigente,
    observacoes, created_at
  )
  SELECT
    d.vehicle_id,
    -- O tipo antigo era texto livre: o que não casar vira 'outro', com o termo
    -- original preservado na descrição para ninguém perder a informação.
    CASE lower(trim(d.tipo_documento))
      WHEN 'crlv'              THEN 'crlv'
      WHEN 'licenciamento'     THEN 'crlv'
      WHEN 'seguro'            THEN 'seguro'
      WHEN 'ipva'              THEN 'ipva'
      WHEN 'tacografo'         THEN 'tacografo'
      WHEN 'tacógrafo'         THEN 'tacografo'
      WHEN 'inspecao'          THEN 'inspecao_veicular'
      WHEN 'inspecao_veicular' THEN 'inspecao_veicular'
      WHEN 'rntrc'             THEN 'rntrc'
      WHEN 'licenca_ambiental' THEN 'licenca_ambiental'
      ELSE 'outro'
    END,
    COALESCE(NULLIF(d.nome_arquivo, ''), d.tipo_documento),
    d.data_vencimento,
    NULLIF(d.url_arquivo, ''),
    -- Documento vencido entra como histórico, não como vigente: trazer um
    -- seguro de 2024 marcado como vigente encheria o painel de alarme falso.
    (d.data_vencimento >= current_date),
    'Migrado de vehicle_documents (tipo original: ' || d.tipo_documento || ')',
    d.created_at
  FROM public.vehicle_documents d
  JOIN public.vehicles v ON v.id = d.vehicle_id
  WHERE d.data_vencimento IS NOT NULL
    -- Idempotência: não reimporta o que já veio numa execução anterior.
    AND NOT EXISTS (
      SELECT 1 FROM public.vehicle_documentos n
      WHERE n.vehicle_id = d.vehicle_id
        AND n.data_vencimento = d.data_vencimento
        AND n.observacoes LIKE 'Migrado de vehicle_documents%'
    );

  GET DIAGNOSTICS v_migrados = ROW_COUNT;
  RAISE NOTICE 'Documentos migrados para vehicle_documentos: %', v_migrados;
END $$;

COMMENT ON TABLE public.vehicle_documentos IS 'Documentos do veículo. Fonte única: substitui vehicle_documents, que fica apenas como histórico de arquivos e não deve receber novos registros.';

DO $$
BEGIN
  IF to_regclass('public.vehicle_documents') IS NOT NULL THEN
    EXECUTE 'COMMENT ON TABLE public.vehicle_documents IS ''OBSOLETA desde 2026-10-28: use vehicle_documentos. Mantida para histórico de arquivos; a liberação de veículo não a consulta mais.''';
  END IF;
END $$;

-- ─── 3. DOCUMENTO VENCIDO, PARA A LIBERAÇÃO ─────────────────────────────────
-- A liberação precisa de uma pergunta só: este veículo tem documento vencido?
-- Uma view evita que a regra viva duplicada no frontend.

CREATE OR REPLACE VIEW public.v_documentos_vencidos AS
SELECT
  d.vehicle_id,
  count(*)::integer      AS documentos_vencidos,
  min(d.data_vencimento) AS vencido_desde
FROM public.vehicle_documentos d
JOIN public.vehicles v ON v.id = d.vehicle_id
WHERE d.vigente
  AND d.data_vencimento < current_date
  AND v.status IS DISTINCT FROM 'inativo'
GROUP BY d.vehicle_id;

COMMENT ON VIEW public.v_documentos_vencidos IS 'Um registro por veículo com documento vigente vencido. É o que a liberação de veículo consulta.';

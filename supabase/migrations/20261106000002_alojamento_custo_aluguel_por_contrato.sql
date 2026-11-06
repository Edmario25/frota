-- ============================================================================
-- O custo de aluguel do alojamento passa a sair dos contratos
--
-- A view v_alojamento_custos_obra lia o aluguel direto de `alojamentos`:
--
--     SELECT ... a.valor_mensal ... WHERE a.regime IN ('alugado',...)
--
-- Três consequências que esta migração corrige:
--
--   • Mês cheio sempre. Contrato que começa dia 20 lançava o aluguel inteiro
--     em um mês de onze dias de uso. A frota já rateia por dias desde
--     20260911000003; o alojamento ficou para trás.
--
--   • Reajuste reescrevendo o passado, como explicado em 20261106000001.
--
--   • Terreno de fora. Contrato de complexo (alojamento_id nulo) não existia,
--     então o aluguel do chão onde a estrutura própria foi construída não
--     chegava ao custo da obra.
--
-- A regra de rateio é a mesma da frota, de propósito: dias de vigência dentro
-- do mês dividido pelos dias do mês. Dois módulos calculando aluguel de
-- maneiras diferentes produziriam relatórios que não fecham entre si.
--
-- Idempotente. Rodar depois de 20261106000001.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_alojamento_custos_obra WITH (security_invoker = true) AS

-- Despesas lançadas à mão (água, energia, limpeza…)
SELECT
  d.id                         AS referencia_id,
  c.obra_id,
  d.competencia                AS data_lancamento,
  COALESCE(d.descricao, initcap(replace(d.categoria, '_', ' '))) AS descricao,
  d.valor,
  d.fornecedor,
  d.documento                  AS nota_fiscal,
  'despesa'::text              AS origem
FROM public.alojamento_despesas d
JOIN public.alojamento_complexos c ON c.id = d.complexo_id

UNION ALL

-- Manutenção concluída
SELECT
  ch.id, a.obra_id, ch.concluido_em::date,
  'Manutenção do alojamento: ' || ch.titulo,
  ch.custo, NULL, NULL, 'manutencao'
FROM public.alojamento_chamados ch
JOIN public.alojamentos a ON a.id = ch.alojamento_id
WHERE ch.status = 'concluido' AND ch.custo > 0

UNION ALL

-- Aluguel, mês a mês, pelo contrato vigente em cada mês
SELECT
  ct.id,
  cx.obra_id,
  m::date,
  CASE ct.objeto
    WHEN 'terreno'    THEN 'Aluguel de terreno: ' || cx.nome
    WHEN 'hospedagem' THEN 'Hospedagem: '         || COALESCE(un.nome, cx.nome)
    ELSE                   'Aluguel de alojamento: ' || COALESCE(un.nome, cx.nome)
  END
  -- Mês parcial aparece dito, não escondido num valor quebrado.
  || CASE
       WHEN GREATEST(ct.data_inicio, m::date) > m::date
         OR LEAST(COALESCE(ct.encerrado_em, ct.data_fim, (m + interval '1 month' - interval '1 day')::date),
                  (m + interval '1 month' - interval '1 day')::date)
            < (m + interval '1 month' - interval '1 day')::date
       THEN ' (proporcional)'
       ELSE ''
     END,
  -- Dias de vigência dentro do mês ÷ dias do mês. Mesma conta da frota.
  round(
    ct.valor_mensal
    * (
        LEAST(
          COALESCE(ct.encerrado_em, ct.data_fim, (m + interval '1 month' - interval '1 day')::date),
          (m + interval '1 month' - interval '1 day')::date
        )
        - GREATEST(ct.data_inicio, m::date)
        + 1
      )::numeric
    / EXTRACT(day FROM (m + interval '1 month' - interval '1 day'))::numeric
  , 2),
  COALESCE(f.nome, ct.nome_locador),
  ct.numero,
  'aluguel'
FROM public.alojamento_contratos_locacao ct
JOIN public.alojamento_complexos cx ON cx.id = ct.complexo_id
LEFT JOIN public.alojamentos  un ON un.id = ct.alojamento_id
LEFT JOIN public.fornecedores f  ON f.id  = ct.fornecedor_id
CROSS JOIN LATERAL generate_series(
  date_trunc('month', ct.data_inicio)::date,
  date_trunc('month', LEAST(COALESCE(ct.encerrado_em, ct.data_fim, current_date), current_date))::date,
  interval '1 month'
) m
WHERE ct.valor_mensal > 0
  -- Um contrato que ainda não começou não gera custo.
  AND ct.data_inicio <= current_date
  -- Protege contra mês em que a vigência não cobre nenhum dia.
  AND LEAST(
        COALESCE(ct.encerrado_em, ct.data_fim, (m + interval '1 month' - interval '1 day')::date),
        (m + interval '1 month' - interval '1 day')::date
      ) >= GREATEST(ct.data_inicio, m::date);

GRANT SELECT ON public.v_alojamento_custos_obra TO authenticated;

COMMENT ON VIEW public.v_alojamento_custos_obra IS
  'Custo do alojamento por obra: despesas lançadas, manutenção concluída e aluguel dos contratos. O aluguel é rateado por dias de vigência dentro do mês, como na frota, e cada mês usa o contrato que estava vigente nele.';

-- ─── Confere que o aluguel não ficou duplicado nem sumiu ────────────────────

DO $do$
DECLARE
  v_contratos integer;
  v_linhas    integer;
BEGIN
  SELECT count(*) INTO v_contratos FROM public.alojamento_contratos_locacao WHERE valor_mensal > 0;
  SELECT count(*) INTO v_linhas FROM public.v_alojamento_custos_obra WHERE origem = 'aluguel';
  RAISE NOTICE 'Contratos com valor: %. Linhas de aluguel geradas (um por mês de vigência): %', v_contratos, v_linhas;

  IF v_contratos > 0 AND v_linhas = 0 THEN
    RAISE WARNING 'Há contrato cadastrado e nenhuma linha de custo. Confira se data_inicio não está no futuro.';
  END IF;
END $do$;

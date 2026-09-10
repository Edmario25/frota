-- Integração dos custos de alojamento com fornecedores, orçamento e relatórios da obra.
ALTER TABLE public.alojamento_despesas
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_aloj_desp_fornecedor ON public.alojamento_despesas(fornecedor_id)
  WHERE fornecedor_id IS NOT NULL;

INSERT INTO public.orcamento_categorias(nome,cor,icone,ordem,ativo)
VALUES('Alojamento','#0891b2','bed-double',7,true)
ON CONFLICT(nome) DO UPDATE SET ativo=true;

ALTER TABLE public.lancamentos_custos DROP CONSTRAINT IF EXISTS lancamentos_custos_tipo_check;
ALTER TABLE public.lancamentos_custos ADD CONSTRAINT lancamentos_custos_tipo_check
  CHECK(tipo IN ('manual','subcontratada','almoxarifado','folha','equipamento','alojamento'));

-- Fonte financeira única, sem duplicar valores. Despesas manuais, aluguel contratual
-- e manutenção concluída passam a pertencer à obra vinculada ao complexo/unidade.
CREATE OR REPLACE VIEW public.v_alojamento_custos_obra WITH (security_invoker=true) AS
SELECT d.id AS referencia_id,c.obra_id,d.competencia AS data_lancamento,
       COALESCE(d.descricao,initcap(replace(d.categoria,'_',' '))) AS descricao,
       d.valor,d.fornecedor,d.documento AS nota_fiscal,'despesa'::text AS origem
FROM public.alojamento_despesas d
JOIN public.alojamento_complexos c ON c.id=d.complexo_id
UNION ALL
SELECT ch.id,a.obra_id,ch.concluido_em::date,
       'Manutenção do alojamento: '||ch.titulo,ch.custo,NULL,NULL,'manutencao'
FROM public.alojamento_chamados ch JOIN public.alojamentos a ON a.id=ch.alojamento_id
WHERE ch.status='concluido' AND ch.custo>0
UNION ALL
SELECT a.id,a.obra_id,m::date,'Aluguel de alojamento: '||a.nome,a.valor_mensal,NULL,NULL,'aluguel'
FROM public.alojamentos a
CROSS JOIN LATERAL generate_series(
  date_trunc('month',COALESCE(a.contrato_inicio,current_date))::date,
  date_trunc('month',LEAST(COALESCE(a.contrato_fim,current_date),current_date))::date,
  interval '1 month') m
WHERE a.valor_mensal>0 AND a.regime IN ('alugado','hospedagem','terceirizado')
  AND COALESCE(a.contrato_fim,current_date)>=COALESCE(a.contrato_inicio,current_date);

GRANT SELECT ON public.v_alojamento_custos_obra TO authenticated;

CREATE OR REPLACE VIEW public.v_orcado_realizado WITH (security_invoker=true) AS
WITH custos AS (
  SELECT obra_id,categoria_id,valor FROM public.lancamentos_custos WHERE cancelado_em IS NULL
  UNION ALL
  SELECT ac.obra_id,oc.id,ac.valor FROM public.v_alojamento_custos_obra ac
  JOIN public.orcamento_categorias oc ON oc.nome='Alojamento'
)
SELECT o.id AS obra_id,o.nome AS obra_nome,oc.id AS categoria_id,oc.nome AS categoria_nome,
  oc.cor AS categoria_cor,oc.ordem AS categoria_ordem,oi.id AS orcamento_item_id,
  coalesce(oi.valor_previsto,0) AS valor_previsto,coalesce(oi.alerta_perc,80) AS alerta_perc,
  coalesce(sum(c.valor),0) AS valor_realizado,
  CASE WHEN coalesce(oi.valor_previsto,0)>0 THEN round(coalesce(sum(c.valor),0)/oi.valor_previsto*100,2) ELSE 0 END AS perc_consumido,
  coalesce(oi.valor_previsto,0)-coalesce(sum(c.valor),0) AS saldo,
  oi.descricao,oi.observacoes
FROM public.obras o CROSS JOIN public.orcamento_categorias oc
LEFT JOIN public.orcamento_itens oi ON oi.obra_id=o.id AND oi.categoria_id=oc.id
LEFT JOIN custos c ON c.obra_id=o.id AND c.categoria_id=oc.id
WHERE oc.ativo OR oi.id IS NOT NULL OR c.obra_id IS NOT NULL
GROUP BY o.id,o.nome,oc.id,oc.nome,oc.cor,oc.ordem,oi.id,oi.valor_previsto,oi.alerta_perc,oi.descricao,oi.observacoes;

CREATE OR REPLACE VIEW public.v_custos_mensais WITH (security_invoker=true) AS
WITH custos AS (
  SELECT obra_id,categoria_id,data_lancamento,valor FROM public.lancamentos_custos WHERE cancelado_em IS NULL
  UNION ALL
  SELECT ac.obra_id,oc.id,ac.data_lancamento,ac.valor FROM public.v_alojamento_custos_obra ac
  JOIN public.orcamento_categorias oc ON oc.nome='Alojamento'
)
SELECT c.obra_id,to_char(c.data_lancamento,'YYYY-MM') AS mes,oc.id AS categoria_id,
  oc.nome AS categoria_nome,oc.cor AS categoria_cor,sum(c.valor) AS valor_mes,
  sum(sum(c.valor)) OVER(PARTITION BY c.obra_id,oc.id ORDER BY to_char(c.data_lancamento,'YYYY-MM')) AS valor_acumulado
FROM custos c JOIN public.orcamento_categorias oc ON oc.id=c.categoria_id
GROUP BY c.obra_id,mes,oc.id,oc.nome,oc.cor;

GRANT SELECT ON public.v_orcado_realizado,public.v_custos_mensais TO authenticated;

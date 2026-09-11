-- Ferramentas e equipamentos: apropriação financeira profissional por obra.
-- Compra registrada no almoxarifado nunca é contabilizada novamente aqui.

ALTER TABLE public.ferramentas_catalogo
  ADD COLUMN IF NOT EXISTS regime_financeiro text NOT NULL DEFAULT 'proprio',
  ADD COLUMN IF NOT EXISTS apropriacao_financeira text NOT NULL DEFAULT 'depreciacao',
  ADD COLUMN IF NOT EXISTS obra_aquisicao_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compra_registrada_almoxarifado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vida_util_meses integer,
  ADD COLUMN IF NOT EXISTS valor_residual numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_diaria numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_hora numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_mensal numeric(14,2),
  ADD COLUMN IF NOT EXISTS documento_fiscal text;

ALTER TABLE public.ferramentas_catalogo DROP CONSTRAINT IF EXISTS ferramentas_regime_financeiro_check;
ALTER TABLE public.ferramentas_catalogo ADD CONSTRAINT ferramentas_regime_financeiro_check
  CHECK (regime_financeiro IN ('proprio','alugado','comodato'));
ALTER TABLE public.ferramentas_catalogo DROP CONSTRAINT IF EXISTS ferramentas_apropriacao_financeira_check;
ALTER TABLE public.ferramentas_catalogo ADD CONSTRAINT ferramentas_apropriacao_financeira_check
  CHECK (apropriacao_financeira IN ('compra','depreciacao','diaria','mensal','horimetro','sem_custo'));
ALTER TABLE public.ferramentas_catalogo DROP CONSTRAINT IF EXISTS ferramentas_valores_financeiros_check;
ALTER TABLE public.ferramentas_catalogo ADD CONSTRAINT ferramentas_valores_financeiros_check CHECK (
  COALESCE(valor_aquisicao,0)>=0 AND COALESCE(valor_residual,0)>=0
  AND COALESCE(valor_diaria,0)>=0 AND COALESCE(valor_hora,0)>=0 AND COALESCE(valor_mensal,0)>=0
  AND (vida_util_meses IS NULL OR vida_util_meses>0)
  AND COALESCE(valor_residual,0)<=COALESCE(valor_aquisicao,valor_residual,0)
);

CREATE OR REPLACE VIEW public.v_ferramentas_situacao WITH (security_invoker=true) AS
SELECT f.id,f.nome,f.categoria,f.numero_serie,f.fabricante,f.modelo,f.capacidade,f.exige_certificacao,f.ativo,
 a.obra_id obra_atual_id,o.nome obra_atual_nome,a.frente frente_atual,a.condicao,a.data_alocacao,
 CASE WHEN NOT f.exige_certificacao THEN 'nao_exige'
  WHEN EXISTS(SELECT 1 FROM public.ferramentas_certificacoes c WHERE c.ferramenta_id=f.id AND c.data_vencimento<current_date) THEN 'vencido'
  WHEN EXISTS(SELECT 1 FROM public.ferramentas_certificacoes c WHERE c.ferramenta_id=f.id AND c.data_vencimento BETWEEN current_date AND current_date+30) THEN 'a_vencer'
  WHEN EXISTS(SELECT 1 FROM public.ferramentas_certificacoes c WHERE c.ferramenta_id=f.id) THEN 'valido' ELSE 'sem_cert' END cert_status,
 (SELECT min(c.data_vencimento) FROM public.ferramentas_certificacoes c WHERE c.ferramenta_id=f.id AND c.data_vencimento>=current_date) proximo_vencimento,
 f.descricao,f.tipo_item,f.codigo_patrimonio,f.unidade_medicao,f.horimetro_atual,f.data_aquisicao,f.valor_aquisicao,
 f.status_operacional,f.periodicidade_inspecao_dias,f.ultima_inspecao,f.proxima_inspecao,
 f.regime_financeiro,f.apropriacao_financeira,f.obra_aquisicao_id,f.fornecedor_id,f.compra_registrada_almoxarifado,
 f.vida_util_meses,f.valor_residual,f.valor_diaria,f.valor_hora,f.valor_mensal,f.documento_fiscal
FROM public.ferramentas_catalogo f
LEFT JOIN public.ferramentas_alocacao a ON a.ferramenta_id=f.id AND a.data_devolucao IS NULL
LEFT JOIN public.obras o ON o.id=a.obra_id WHERE f.ativo;
GRANT SELECT ON public.v_ferramentas_situacao TO authenticated;

CREATE TABLE IF NOT EXISTS public.ferramentas_custos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta_id uuid NOT NULL REFERENCES public.ferramentas_catalogo(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('manutencao','certificacao','inspecao','reparo','perda','baixa','uso_horimetro','outro')),
  data_custo date NOT NULL DEFAULT current_date,
  descricao text NOT NULL,
  quantidade numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantidade>0),
  valor_unitario numeric(14,4) NOT NULL CHECK (valor_unitario>=0),
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  documento_fiscal text,
  observacoes text,
  status text NOT NULL DEFAULT 'confirmado' CHECK (status IN ('pendente','confirmado','cancelado')),
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ferramentas_custos_obra_data_idx ON public.ferramentas_custos(obra_id,data_custo);
CREATE INDEX IF NOT EXISTS ferramentas_custos_ferramenta_idx ON public.ferramentas_custos(ferramenta_id,data_custo DESC);
DROP TRIGGER IF EXISTS trg_ferramentas_custos_updated_at ON public.ferramentas_custos;
CREATE TRIGGER trg_ferramentas_custos_updated_at BEFORE UPDATE ON public.ferramentas_custos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
ALTER TABLE public.ferramentas_custos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ferramentas_custos_select ON public.ferramentas_custos;
DROP POLICY IF EXISTS ferramentas_custos_manage ON public.ferramentas_custos;
CREATE POLICY ferramentas_custos_select ON public.ferramentas_custos FOR SELECT TO authenticated
  USING (public.can_access_obra_data(obra_id));
CREATE POLICY ferramentas_custos_manage ON public.ferramentas_custos FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id)) WITH CHECK (public.can_manage_obra_data(obra_id));
GRANT SELECT,INSERT,UPDATE ON public.ferramentas_custos TO authenticated;

CREATE OR REPLACE VIEW public.v_ferramentas_custos_obra WITH (security_invoker=true) AS
-- Compra direta: somente quando não veio do almoxarifado.
SELECT f.id::text||'-compra' referencia_id,f.obra_aquisicao_id obra_id,f.data_aquisicao data_lancamento,
  'Aquisição: '||f.nome descricao,f.valor_aquisicao valor,'aquisicao'::text origem,
  f.fornecedor_id,f.documento_fiscal
FROM public.ferramentas_catalogo f
WHERE f.apropriacao_financeira='compra' AND NOT f.compra_registrada_almoxarifado
  AND f.obra_aquisicao_id IS NOT NULL AND f.data_aquisicao IS NOT NULL AND f.valor_aquisicao>0
UNION ALL
-- Depreciação/locação mensal, proporcional aos dias efetivamente alocados.
SELECT a.id::text||'-'||to_char(m.mes,'YYYYMM'),a.obra_id,m.mes,
  CASE f.apropriacao_financeira WHEN 'depreciacao' THEN 'Depreciação: ' ELSE 'Locação: ' END||f.nome,
  round(CASE f.apropriacao_financeira
    WHEN 'depreciacao' THEN ((f.valor_aquisicao-f.valor_residual)/f.vida_util_meses)
    WHEN 'mensal' THEN f.valor_mensal
    WHEN 'diaria' THEN f.valor_diaria*(m.fim-m.inicio+1)::numeric
  END * CASE WHEN f.apropriacao_financeira='diaria' THEN 1
             ELSE (m.fim-m.inicio+1)::numeric/EXTRACT(day FROM (m.mes+interval '1 month'-interval '1 day')) END,2),
  f.apropriacao_financeira,f.fornecedor_id,f.documento_fiscal
FROM public.ferramentas_alocacao a
JOIN public.ferramentas_catalogo f ON f.id=a.ferramenta_id
CROSS JOIN LATERAL (
  SELECT gs::date mes,GREATEST(a.data_alocacao,
    CASE WHEN f.apropriacao_financeira='depreciacao' THEN COALESCE(f.data_aquisicao,a.data_alocacao) ELSE a.data_alocacao END,
    gs::date) inicio,
    LEAST(COALESCE(a.data_devolucao,current_date),(gs+interval '1 month'-interval '1 day')::date) fim
  FROM generate_series(date_trunc('month',GREATEST(a.data_alocacao,
      CASE WHEN f.apropriacao_financeira='depreciacao' THEN COALESCE(f.data_aquisicao,a.data_alocacao) ELSE a.data_alocacao END))::date,
    date_trunc('month',LEAST(COALESCE(a.data_devolucao,current_date),current_date))::date,interval '1 month') gs
) m
WHERE f.apropriacao_financeira IN ('depreciacao','mensal','diaria') AND m.fim>=m.inicio
  AND CASE f.apropriacao_financeira
    WHEN 'depreciacao' THEN f.valor_aquisicao>f.valor_residual AND f.vida_util_meses>0
      AND m.mes<date_trunc('month',f.data_aquisicao)+make_interval(months=>f.vida_util_meses)
    WHEN 'mensal' THEN f.valor_mensal>0
    WHEN 'diaria' THEN f.valor_diaria>0 END
UNION ALL
SELECT c.id::text,c.obra_id,c.data_custo,c.descricao,round(c.quantidade*c.valor_unitario,2),c.tipo,c.fornecedor_id,c.documento_fiscal
FROM public.ferramentas_custos c WHERE c.status='confirmado' AND c.valor_unitario>0;
GRANT SELECT ON public.v_ferramentas_custos_obra TO authenticated;

-- Recria a interface consolidada incluindo ferramentas sem alterar seu contrato.
CREATE OR REPLACE VIEW public.v_custos_automaticos_obra WITH (security_invoker=true) AS
SELECT ac.referencia_id::text,ac.obra_id,ac.data_lancamento,ac.descricao,ac.valor,'alojamento'::text tipo,ac.origem,
 (SELECT id FROM public.orcamento_categorias WHERE nome='Alojamento' LIMIT 1) categoria_id,ac.fornecedor,ac.nota_fiscal
FROM public.v_alojamento_custos_obra ac
UNION ALL SELECT mc.referencia_id::text,mc.obra_id,mc.data_lancamento,mc.descricao,mc.valor,'almoxarifado',mc.origem,mc.categoria_id,NULL,NULL FROM public.v_almoxarifado_custos_obra mc WHERE mc.valor<>0 AND mc.categoria_id IS NOT NULL
UNION ALL SELECT fc.referencia_id,fc.obra_id,fc.data_lancamento,fc.descricao,fc.valor,'frota',fc.origem,(SELECT id FROM public.orcamento_categorias WHERE nome='Frota' LIMIT 1),NULL,NULL FROM public.v_frota_custos_obra fc
UNION ALL SELECT sc.referencia_id,sc.obra_id,sc.data_lancamento,sc.descricao,sc.valor,'subcontratada',sc.origem,(SELECT id FROM public.orcamento_categorias WHERE nome='Subcontratadas' LIMIT 1),NULL,NULL FROM public.v_subcontratadas_custos_obra sc
UNION ALL SELECT mo.referencia_id,mo.obra_id,mo.data_lancamento,mo.descricao,mo.valor,'folha',mo.origem,(SELECT id FROM public.orcamento_categorias WHERE nome='Mão de Obra' LIMIT 1),NULL,NULL FROM public.v_mao_obra_custos_obra mo
UNION ALL SELECT ff.referencia_id,ff.obra_id,ff.data_lancamento,ff.descricao,ff.valor,'fundo_fixo',ff.origem,ff.categoria_id,ff.fornecedor,ff.nota_fiscal FROM public.v_fundo_fixo_custos_obra ff
UNION ALL SELECT fc.referencia_id,fc.obra_id,fc.data_lancamento,fc.descricao,fc.valor,'equipamento',fc.origem,
 (SELECT id FROM public.orcamento_categorias WHERE nome='Equipamentos' LIMIT 1),fo.nome,fc.documento_fiscal
 FROM public.v_ferramentas_custos_obra fc LEFT JOIN public.fornecedores fo ON fo.id=fc.fornecedor_id;
GRANT SELECT ON public.v_custos_automaticos_obra TO authenticated;

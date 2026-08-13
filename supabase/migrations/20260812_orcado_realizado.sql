-- ============================================================
-- Fase 7 — Orçado × Realizado
-- Orçamento por categoria + lançamentos reais de custo
-- ============================================================

-- ─── Categorias de custo ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamento_categorias (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text  NOT NULL UNIQUE,
  cor         text  NOT NULL DEFAULT '#64748b',  -- hex para gráficos
  icone       text,
  ordem       integer NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true
);

-- Inserir categorias padrão (idempotente)
INSERT INTO public.orcamento_categorias (nome, cor, icone, ordem) VALUES
  ('Mão de Obra',      '#3b82f6', 'users',       1),
  ('Materiais',        '#f59e0b', 'package',     2),
  ('Subcontratadas',   '#8b5cf6', 'building2',   3),
  ('Equipamentos',     '#10b981', 'wrench',       4),
  ('Administração',    '#ef4444', 'briefcase',    5),
  ('Outros',           '#6b7280', 'more-horizontal', 6)
ON CONFLICT (nome) DO NOTHING;

-- ─── Orçamento por obra e categoria ──────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamento_itens (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid         NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  categoria_id    uuid         NOT NULL REFERENCES public.orcamento_categorias(id),
  descricao       text,
  valor_previsto  numeric(16,2) NOT NULL DEFAULT 0,
  alerta_perc     integer      NOT NULL DEFAULT 80,  -- alerta quando atingir X%
  observacoes     text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (obra_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS orc_itens_obra_idx ON public.orcamento_itens (obra_id);

-- ─── Lançamentos reais de custo ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.lancamentos_custos (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid         NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  categoria_id    uuid         NOT NULL REFERENCES public.orcamento_categorias(id),
  descricao       text         NOT NULL,
  valor           numeric(16,2) NOT NULL,
  data_lancamento date         NOT NULL DEFAULT current_date,
  tipo            text         NOT NULL DEFAULT 'manual'
                               CHECK (tipo IN ('manual','subcontratada','almoxarifado','folha','equipamento')),
  referencia_id   uuid,        -- id do BM, movimento, etc. (para rastreio)
  fornecedor      text,
  nota_fiscal     text,
  observacoes     text,
  registrado_por  uuid         REFERENCES auth.users(id),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lancamentos_obra_idx      ON public.lancamentos_custos (obra_id, data_lancamento DESC);
CREATE INDEX IF NOT EXISTS lancamentos_categoria_idx ON public.lancamentos_custos (categoria_id);
CREATE INDEX IF NOT EXISTS lancamentos_tipo_idx      ON public.lancamentos_custos (tipo);

-- ─── Triggers updated_at ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_orc_itens_updated_at  ON public.orcamento_itens;
DROP TRIGGER IF EXISTS trg_lancamentos_updated_at ON public.lancamentos_custos;
CREATE TRIGGER trg_orc_itens_updated_at  BEFORE UPDATE ON public.orcamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_lancamentos_updated_at BEFORE UPDATE ON public.lancamentos_custos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── View: orçado × realizado por categoria (obra) ───────────
CREATE OR REPLACE VIEW public.v_orcado_realizado AS
SELECT
  oi.obra_id,
  o.nome                       AS obra_nome,
  oc.id                        AS categoria_id,
  oc.nome                      AS categoria_nome,
  oc.cor                       AS categoria_cor,
  oc.ordem                     AS categoria_ordem,
  oi.id                        AS orcamento_item_id,
  COALESCE(oi.valor_previsto, 0) AS valor_previsto,
  COALESCE(oi.alerta_perc, 80)   AS alerta_perc,
  COALESCE(SUM(lc.valor), 0)     AS valor_realizado,
  CASE
    WHEN COALESCE(oi.valor_previsto, 0) > 0
    THEN ROUND(COALESCE(SUM(lc.valor), 0) / oi.valor_previsto * 100, 2)
    ELSE 0
  END                           AS perc_consumido,
  GREATEST(0, COALESCE(oi.valor_previsto, 0) - COALESCE(SUM(lc.valor), 0)) AS saldo
FROM public.orcamento_categorias oc
CROSS JOIN public.obras o
LEFT JOIN public.orcamento_itens oi
  ON oi.categoria_id = oc.id AND oi.obra_id = o.id
LEFT JOIN public.lancamentos_custos lc
  ON lc.categoria_id = oc.id AND lc.obra_id = o.id
WHERE oc.ativo = true
GROUP BY oi.obra_id, o.nome, oc.id, oc.nome, oc.cor, oc.ordem,
         oi.id, oi.valor_previsto, oi.alerta_perc;

GRANT SELECT ON public.v_orcado_realizado TO authenticated;

-- ─── View: evolução mensal de custos (curva S) ───────────────
CREATE OR REPLACE VIEW public.v_custos_mensais AS
SELECT
  lc.obra_id,
  to_char(lc.data_lancamento, 'YYYY-MM') AS mes,
  oc.id                                  AS categoria_id,
  oc.nome                                AS categoria_nome,
  oc.cor                                 AS categoria_cor,
  SUM(lc.valor)                          AS valor_mes,
  SUM(SUM(lc.valor)) OVER (
    PARTITION BY lc.obra_id, oc.id
    ORDER BY to_char(lc.data_lancamento, 'YYYY-MM')
  )                                      AS valor_acumulado
FROM public.lancamentos_custos lc
JOIN public.orcamento_categorias oc ON oc.id = lc.categoria_id
GROUP BY lc.obra_id, mes, oc.id, oc.nome, oc.cor;

GRANT SELECT ON public.v_custos_mensais TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.orcamento_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos_custos   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orc_cat_select" ON public.orcamento_categorias;
DROP POLICY IF EXISTS "orc_cat_write"  ON public.orcamento_categorias;
CREATE POLICY "orc_cat_select" ON public.orcamento_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "orc_cat_write"  ON public.orcamento_categorias FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota'));

DROP POLICY IF EXISTS "orc_itens_select" ON public.orcamento_itens;
DROP POLICY IF EXISTS "orc_itens_write"  ON public.orcamento_itens;
CREATE POLICY "orc_itens_select" ON public.orcamento_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "orc_itens_write"  ON public.orcamento_itens FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "lancamentos_select" ON public.lancamentos_custos;
DROP POLICY IF EXISTS "lancamentos_write"  ON public.lancamentos_custos;
CREATE POLICY "lancamentos_select" ON public.lancamentos_custos FOR SELECT TO authenticated USING (true);
CREATE POLICY "lancamentos_write"  ON public.lancamentos_custos FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

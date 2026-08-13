-- ============================================================
-- Fase 5 — Cronograma Físico e Avanço de Obra
-- WBS hierárquico + apontamento de progresso + curva S
-- ============================================================

-- ─── Itens do cronograma (WBS) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.cronograma_itens (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  pai_id            uuid        REFERENCES public.cronograma_itens(id) ON DELETE CASCADE,
  codigo            text,                       -- "1", "1.1", "1.1.2"
  descricao         text        NOT NULL,
  unidade           text,                       -- "m²", "m³", "vb", "%"
  quantidade_total  numeric(14,3),
  data_inicio_plan  date,
  data_fim_plan     date,
  peso_percentual   numeric(6,3) NOT NULL DEFAULT 0, -- participação no total da obra
  ordem             integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cron_itens_obra_idx ON public.cronograma_itens (obra_id);
CREATE INDEX IF NOT EXISTS cron_itens_pai_idx  ON public.cronograma_itens (pai_id);

-- ─── Avanços de progresso ────────────────────────────────────
-- Um registro por item por data (UNIQUE) — o último é o status atual
CREATE TABLE IF NOT EXISTS public.cronograma_avancos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             uuid        NOT NULL REFERENCES public.cronograma_itens(id) ON DELETE CASCADE,
  data_referencia     date        NOT NULL,
  percentual_realizado numeric(6,3) NOT NULL DEFAULT 0 CHECK (percentual_realizado BETWEEN 0 AND 100),
  quantidade_realizada numeric(14,3),
  observacoes         text,
  registrado_por      uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, data_referencia)
);

CREATE INDEX IF NOT EXISTS cron_avancos_item_idx ON public.cronograma_avancos (item_id, data_referencia DESC);

-- ─── View: situação atual de cada item ───────────────────────
CREATE OR REPLACE VIEW public.v_cronograma_situacao AS
WITH ultimo_avanco AS (
  SELECT DISTINCT ON (item_id)
    item_id,
    percentual_realizado,
    quantidade_realizada,
    data_referencia       AS ultima_data_avanco
  FROM public.cronograma_avancos
  ORDER BY item_id, data_referencia DESC
)
SELECT
  ci.*,
  COALESCE(ua.percentual_realizado, 0) AS perc_realizado,
  ua.quantidade_realizada,
  ua.ultima_data_avanco,
  -- % planejado para HOJE baseado nas datas
  CASE
    WHEN ci.data_inicio_plan IS NULL OR ci.data_fim_plan IS NULL THEN 0
    WHEN current_date < ci.data_inicio_plan THEN 0
    WHEN current_date > ci.data_fim_plan    THEN 100
    ELSE ROUND(
      (current_date - ci.data_inicio_plan)::numeric /
      NULLIF((ci.data_fim_plan - ci.data_inicio_plan)::numeric, 0) * 100,
      2
    )
  END AS perc_plan_hoje,
  -- status derivado
  CASE
    WHEN ci.data_fim_plan IS NULL THEN 'sem_data'
    WHEN COALESCE(ua.percentual_realizado, 0) >= 100 THEN 'concluido'
    WHEN current_date > ci.data_fim_plan AND COALESCE(ua.percentual_realizado, 0) < 100 THEN 'atrasado'
    WHEN COALESCE(ua.percentual_realizado, 0) >= CASE
        WHEN current_date < ci.data_inicio_plan THEN 0
        WHEN current_date > ci.data_fim_plan    THEN 100
        ELSE ROUND((current_date - ci.data_inicio_plan)::numeric / NULLIF((ci.data_fim_plan - ci.data_inicio_plan)::numeric, 0) * 100, 2)
      END THEN 'em_dia'
    ELSE 'atencao'
  END AS status_item
FROM public.cronograma_itens ci
LEFT JOIN ultimo_avanco ua ON ua.item_id = ci.id;

GRANT SELECT ON public.v_cronograma_situacao TO authenticated;

-- ─── Triggers ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cron_itens_updated_at ON public.cronograma_itens;
CREATE TRIGGER trg_cron_itens_updated_at BEFORE UPDATE ON public.cronograma_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.cronograma_itens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_avancos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cron_itens_select" ON public.cronograma_itens;
DROP POLICY IF EXISTS "cron_itens_write"  ON public.cronograma_itens;
CREATE POLICY "cron_itens_select" ON public.cronograma_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "cron_itens_write"  ON public.cronograma_itens FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "cron_avancos_select" ON public.cronograma_avancos;
DROP POLICY IF EXISTS "cron_avancos_write"  ON public.cronograma_avancos;
CREATE POLICY "cron_avancos_select" ON public.cronograma_avancos FOR SELECT TO authenticated USING (true);
CREATE POLICY "cron_avancos_write"  ON public.cronograma_avancos FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

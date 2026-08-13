-- ============================================================
-- Fase 6 — Subcontratadas e Medição Física
-- ============================================================

-- ─── Subcontratadas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontratadas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  razao_social      text        NOT NULL,
  nome_fantasia     text,
  cnpj              text,
  escopo            text,
  valor_contrato    numeric(16,2),
  data_inicio       date,
  data_fim_prevista date,
  status            text        NOT NULL DEFAULT 'ativa'
                                CHECK (status IN ('ativa','suspensa','encerrada')),
  responsavel_contato text,
  telefone_contato  text,
  observacoes       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subcont_obra_idx   ON public.subcontratadas (obra_id);
CREATE INDEX IF NOT EXISTS subcont_status_idx ON public.subcontratadas (status);

-- ─── Boletins de Medição ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medicoes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontratada_id    uuid        NOT NULL REFERENCES public.subcontratadas(id) ON DELETE CASCADE,
  obra_id             uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  numero_bm           integer,            -- ex: BM-001
  periodo_referencia  text        NOT NULL,   -- "2026-07"
  data_medicao        date        NOT NULL DEFAULT current_date,
  valor_medido        numeric(16,2) NOT NULL DEFAULT 0,
  percentual_avanco   numeric(6,3),
  status              text        NOT NULL DEFAULT 'rascunho'
                                  CHECK (status IN ('rascunho','enviada','aprovada','rejeitada')),
  aprovado_por        uuid        REFERENCES auth.users(id),
  data_aprovacao      date,
  observacoes         text,
  observacoes_aprovador text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medicoes_subcont_idx ON public.medicoes (subcontratada_id);
CREATE INDEX IF NOT EXISTS medicoes_obra_idx    ON public.medicoes (obra_id, periodo_referencia);

-- ─── Itens do Boletim de Medição ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.medicoes_itens (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id          uuid        NOT NULL REFERENCES public.medicoes(id) ON DELETE CASCADE,
  cronograma_item_id  uuid        REFERENCES public.cronograma_itens(id),
  descricao           text        NOT NULL,
  unidade             text,
  quantidade_contrato numeric(14,3),
  quantidade_medida   numeric(14,3) NOT NULL DEFAULT 0,
  valor_unitario      numeric(14,4),
  valor_total         numeric(16,2)  GENERATED ALWAYS AS (quantidade_medida * valor_unitario) STORED,
  ordem               integer     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS med_itens_medicao_idx ON public.medicoes_itens (medicao_id);

-- ─── Auto-numerar BM por obra ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_numero_bm()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_bm IS NULL THEN
    SELECT COALESCE(MAX(numero_bm), 0) + 1
    INTO NEW.numero_bm
    FROM public.medicoes
    WHERE obra_id = NEW.obra_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_numero_bm ON public.medicoes;
CREATE TRIGGER trg_auto_numero_bm
  BEFORE INSERT ON public.medicoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_numero_bm();

-- ─── updated_at triggers ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_subcont_updated_at  ON public.subcontratadas;
DROP TRIGGER IF EXISTS trg_medicoes_updated_at ON public.medicoes;
CREATE TRIGGER trg_subcont_updated_at  BEFORE UPDATE ON public.subcontratadas
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_medicoes_updated_at BEFORE UPDATE ON public.medicoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── View: resumo financeiro por subcontratada ────────────────
CREATE OR REPLACE VIEW public.v_subcontratadas_resumo AS
SELECT
  s.*,
  o.nome                              AS obra_nome,
  COUNT(DISTINCT m.id)                AS total_medicoes,
  COALESCE(SUM(m.valor_medido) FILTER (WHERE m.status = 'aprovada'), 0) AS valor_medido_aprovado,
  COALESCE(SUM(m.valor_medido), 0)    AS valor_medido_total,
  CASE
    WHEN s.valor_contrato > 0
    THEN ROUND(COALESCE(SUM(m.valor_medido) FILTER (WHERE m.status = 'aprovada'), 0) / s.valor_contrato * 100, 2)
    ELSE 0
  END                                 AS perc_executado
FROM public.subcontratadas s
LEFT JOIN public.obras o ON o.id = s.obra_id
LEFT JOIN public.medicoes m ON m.subcontratada_id = s.id
GROUP BY s.id, o.nome;

GRANT SELECT ON public.v_subcontratadas_resumo TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.subcontratadas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicoes_itens  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subcont_select" ON public.subcontratadas;
DROP POLICY IF EXISTS "subcont_write"  ON public.subcontratadas;
CREATE POLICY "subcont_select" ON public.subcontratadas FOR SELECT TO authenticated USING (true);
CREATE POLICY "subcont_write"  ON public.subcontratadas FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "med_select" ON public.medicoes;
DROP POLICY IF EXISTS "med_write"  ON public.medicoes;
CREATE POLICY "med_select" ON public.medicoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "med_write"  ON public.medicoes FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "med_itens_select" ON public.medicoes_itens;
DROP POLICY IF EXISTS "med_itens_write"  ON public.medicoes_itens;
CREATE POLICY "med_itens_select" ON public.medicoes_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "med_itens_write"  ON public.medicoes_itens FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

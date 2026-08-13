-- ============================================================
-- Fase 4 — Ferramentas e Equipamentos
-- NR-11 / NR-18 — controle de certificações e içamento
-- ============================================================

-- ─── Catálogo de ferramentas/equipamentos ────────────────────
CREATE TABLE IF NOT EXISTS public.ferramentas_catalogo (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                text        NOT NULL,
  descricao           text,
  categoria           text,           -- "Içamento", "Corte", "Medição", "Elétrico", "Outro"
  numero_serie        text,
  fabricante          text,
  modelo              text,
  capacidade          text,           -- "5t", "500kg", etc. (para içamento)
  exige_certificacao  boolean     NOT NULL DEFAULT false,
  ativo               boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ferramentas_cat_nome_idx ON public.ferramentas_catalogo (nome);
CREATE INDEX IF NOT EXISTS ferramentas_cat_cat_idx  ON public.ferramentas_catalogo (categoria);

-- ─── Alocações por obra/frente ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.ferramentas_alocacao (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta_id   uuid        NOT NULL REFERENCES public.ferramentas_catalogo(id) ON DELETE CASCADE,
  obra_id         uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  frente          text,
  responsavel_id  uuid        REFERENCES public.employees(id),
  data_alocacao   date        NOT NULL DEFAULT current_date,
  data_devolucao  date,                   -- NULL = ainda alocado
  condicao        text        NOT NULL DEFAULT 'bom'
                              CHECK (condicao IN ('otimo','bom','regular','danificado')),
  observacoes     text,
  registrado_por  uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ferramentas_aloc_ferr_idx ON public.ferramentas_alocacao (ferramenta_id);
CREATE INDEX IF NOT EXISTS ferramentas_aloc_obra_idx ON public.ferramentas_alocacao (obra_id);
-- Apenas uma alocação ativa por ferramenta (sem data_devolucao)
CREATE UNIQUE INDEX IF NOT EXISTS ferramentas_aloc_ativa_idx
  ON public.ferramentas_alocacao (ferramenta_id)
  WHERE data_devolucao IS NULL;

-- ─── Certificações de segurança ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.ferramentas_certificacoes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta_id         uuid        NOT NULL REFERENCES public.ferramentas_catalogo(id) ON DELETE CASCADE,
  tipo_certificacao     text        NOT NULL,  -- "Lacre", "Cert. de Carga", "Inspeção NR-11", "Inspeção NR-18"
  numero_certificado    text,
  empresa_certificadora text,
  data_emissao          date,
  data_vencimento       date        NOT NULL,
  arquivo_url           text,        -- PDF do certificado no Storage
  observacoes           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ferramentas_cert_ferr_idx ON public.ferramentas_certificacoes (ferramenta_id);
CREATE INDEX IF NOT EXISTS ferramentas_cert_venc_idx ON public.ferramentas_certificacoes (data_vencimento);

-- ─── View: situação consolidada de cada ferramenta ───────────
CREATE OR REPLACE VIEW public.v_ferramentas_situacao AS
SELECT
  f.id,
  f.nome,
  f.categoria,
  f.numero_serie,
  f.fabricante,
  f.modelo,
  f.capacidade,
  f.exige_certificacao,
  f.ativo,
  -- Alocação atual
  a.obra_id             AS obra_atual_id,
  o.nome                AS obra_atual_nome,
  a.frente              AS frente_atual,
  a.condicao,
  a.data_alocacao,
  -- Pior status de certificação
  CASE
    WHEN f.exige_certificacao = false THEN 'nao_exige'
    WHEN EXISTS (
      SELECT 1 FROM public.ferramentas_certificacoes c2
      WHERE c2.ferramenta_id = f.id AND c2.data_vencimento < current_date
    ) THEN 'vencido'
    WHEN EXISTS (
      SELECT 1 FROM public.ferramentas_certificacoes c2
      WHERE c2.ferramenta_id = f.id AND c2.data_vencimento BETWEEN current_date AND current_date + 30
    ) THEN 'a_vencer'
    WHEN EXISTS (
      SELECT 1 FROM public.ferramentas_certificacoes c2
      WHERE c2.ferramenta_id = f.id
    ) THEN 'valido'
    ELSE 'sem_cert'
  END AS cert_status,
  -- Data do próximo vencimento
  (SELECT MIN(c3.data_vencimento) FROM public.ferramentas_certificacoes c3
   WHERE c3.ferramenta_id = f.id AND c3.data_vencimento >= current_date) AS proximo_vencimento
FROM public.ferramentas_catalogo f
LEFT JOIN public.ferramentas_alocacao a ON a.ferramenta_id = f.id AND a.data_devolucao IS NULL
LEFT JOIN public.obras o ON o.id = a.obra_id
WHERE f.ativo = true;

GRANT SELECT ON public.v_ferramentas_situacao TO authenticated;

-- ─── triggers updated_at ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ferrcat_updated_at ON public.ferramentas_catalogo;
CREATE TRIGGER trg_ferrcat_updated_at BEFORE UPDATE ON public.ferramentas_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.ferramentas_catalogo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ferramentas_alocacao     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ferramentas_certificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ferr_cat_select" ON public.ferramentas_catalogo;
DROP POLICY IF EXISTS "ferr_cat_write"  ON public.ferramentas_catalogo;
CREATE POLICY "ferr_cat_select" ON public.ferramentas_catalogo FOR SELECT TO authenticated USING (true);
CREATE POLICY "ferr_cat_write"  ON public.ferramentas_catalogo FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "ferr_aloc_select" ON public.ferramentas_alocacao;
DROP POLICY IF EXISTS "ferr_aloc_write"  ON public.ferramentas_alocacao;
CREATE POLICY "ferr_aloc_select" ON public.ferramentas_alocacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "ferr_aloc_write"  ON public.ferramentas_alocacao FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "ferr_cert_select" ON public.ferramentas_certificacoes;
DROP POLICY IF EXISTS "ferr_cert_write"  ON public.ferramentas_certificacoes;
CREATE POLICY "ferr_cert_select" ON public.ferramentas_certificacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "ferr_cert_write"  ON public.ferramentas_certificacoes FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

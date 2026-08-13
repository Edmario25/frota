-- ============================================================
-- Fase 8 — Portal do Cliente
-- Fotos de obra, documentos compartilhados e config do portal
-- ============================================================

-- ─── Configuração do portal por obra ─────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_config (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             uuid        NOT NULL UNIQUE REFERENCES public.obras(id) ON DELETE CASCADE,
  titulo_portal       text,                       -- ex: "Acompanhamento Obra Torre A"
  mensagem_boas_vindas text,
  exibir_cronograma   boolean NOT NULL DEFAULT true,
  exibir_fotos        boolean NOT NULL DEFAULT true,
  exibir_documentos   boolean NOT NULL DEFAULT true,
  exibir_financeiro   boolean NOT NULL DEFAULT false,  -- KPIs financeiros (oculto por padrão)
  token_acesso        text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  token_ativo         boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_config_token_idx ON public.portal_config (token_acesso);

-- ─── Fotos da obra ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_fotos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  url         text        NOT NULL,
  thumbnail   text,
  titulo      text,
  categoria   text        NOT NULL DEFAULT 'geral'
                          CHECK (categoria IN ('geral','fundacoes','estrutura','alvenaria','instalacoes','acabamento','area_externa')),
  data_foto   date        NOT NULL DEFAULT current_date,
  destaque    boolean     NOT NULL DEFAULT false,
  registrado_por uuid     REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_fotos_obra_idx  ON public.portal_fotos (obra_id, data_foto DESC);
CREATE INDEX IF NOT EXISTS portal_fotos_dest_idx  ON public.portal_fotos (obra_id, destaque) WHERE destaque = true;

-- ─── Documentos compartilhados com o cliente ─────────────────
CREATE TABLE IF NOT EXISTS public.portal_documentos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  descricao   text,
  categoria   text        NOT NULL DEFAULT 'geral'
                          CHECK (categoria IN ('geral','contrato','projeto','cronograma','relatorio','certificacao','outro')),
  url         text        NOT NULL,
  tamanho_kb  integer,
  visivel     boolean     NOT NULL DEFAULT true,
  data_doc    date        NOT NULL DEFAULT current_date,
  publicado_por uuid      REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_docs_obra_idx ON public.portal_documentos (obra_id, visivel, data_doc DESC);

-- ─── Atualizações / diário da obra (timeline para o cliente) ──
CREATE TABLE IF NOT EXISTS public.portal_atualizacoes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  titulo      text        NOT NULL,
  corpo       text,
  tipo        text        NOT NULL DEFAULT 'progresso'
                          CHECK (tipo IN ('progresso','alerta','marco','geral')),
  data_evento date        NOT NULL DEFAULT current_date,
  publicado   boolean     NOT NULL DEFAULT true,
  autor_id    uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_atu_obra_idx ON public.portal_atualizacoes (obra_id, data_evento DESC);

-- ─── Triggers updated_at ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_portal_config_upd ON public.portal_config;
CREATE TRIGGER trg_portal_config_upd BEFORE UPDATE ON public.portal_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── View: resumo público da obra ────────────────────────────
-- Retorna dados combinados para o portal (sem dados sensíveis)
CREATE OR REPLACE VIEW public.v_portal_resumo AS
SELECT
  o.id                          AS obra_id,
  o.nome                        AS obra_nome,
  o.status                      AS obra_status,
  pc.titulo_portal,
  pc.mensagem_boas_vindas,
  pc.exibir_cronograma,
  pc.exibir_fotos,
  pc.exibir_documentos,
  pc.exibir_financeiro,
  pc.token_acesso,
  pc.token_ativo,
  -- Progresso físico (média ponderada dos itens do cronograma)
  ROUND(COALESCE(
    SUM(ci.peso_percentual * COALESCE(ua.percentual_realizado, 0)) /
    NULLIF(SUM(ci.peso_percentual), 0), 0
  ), 2)                         AS perc_fisico_realizado,
  -- Contagem de fotos
  (SELECT COUNT(*) FROM public.portal_fotos f WHERE f.obra_id = o.id) AS total_fotos,
  -- Contagem de documentos visíveis
  (SELECT COUNT(*) FROM public.portal_documentos d WHERE d.obra_id = o.id AND d.visivel = true) AS total_documentos,
  -- Última atualização publicada
  (SELECT MAX(data_evento) FROM public.portal_atualizacoes a WHERE a.obra_id = o.id AND a.publicado = true) AS ultima_atualizacao
FROM public.obras o
LEFT JOIN public.portal_config pc ON pc.obra_id = o.id
LEFT JOIN public.cronograma_itens ci ON ci.obra_id = o.id AND ci.pai_id IS NULL -- só itens raiz
LEFT JOIN LATERAL (
  SELECT percentual_realizado
  FROM public.cronograma_avancos
  WHERE item_id = ci.id
  ORDER BY data_referencia DESC LIMIT 1
) ua ON true
GROUP BY o.id, o.nome, o.status,
  pc.titulo_portal, pc.mensagem_boas_vindas,
  pc.exibir_cronograma, pc.exibir_fotos, pc.exibir_documentos, pc.exibir_financeiro,
  pc.token_acesso, pc.token_ativo;

GRANT SELECT ON public.v_portal_resumo TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.portal_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_fotos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_documentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_atualizacoes ENABLE ROW LEVEL SECURITY;

-- Config: só gestores editam; autenticados leem
DROP POLICY IF EXISTS "portal_cfg_sel" ON public.portal_config;
DROP POLICY IF EXISTS "portal_cfg_wri" ON public.portal_config;
CREATE POLICY "portal_cfg_sel" ON public.portal_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "portal_cfg_wri" ON public.portal_config FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Fotos
DROP POLICY IF EXISTS "portal_foto_sel" ON public.portal_fotos;
DROP POLICY IF EXISTS "portal_foto_wri" ON public.portal_fotos;
CREATE POLICY "portal_foto_sel" ON public.portal_fotos FOR SELECT TO authenticated USING (true);
CREATE POLICY "portal_foto_wri" ON public.portal_fotos FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Documentos
DROP POLICY IF EXISTS "portal_doc_sel" ON public.portal_documentos;
DROP POLICY IF EXISTS "portal_doc_wri" ON public.portal_documentos;
CREATE POLICY "portal_doc_sel" ON public.portal_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "portal_doc_wri" ON public.portal_documentos FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Atualizações
DROP POLICY IF EXISTS "portal_atu_sel" ON public.portal_atualizacoes;
DROP POLICY IF EXISTS "portal_atu_wri" ON public.portal_atualizacoes;
CREATE POLICY "portal_atu_sel" ON public.portal_atualizacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "portal_atu_wri" ON public.portal_atualizacoes FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

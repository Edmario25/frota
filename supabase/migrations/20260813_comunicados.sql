-- ============================================================
-- Fase 10 — Comunicação Interna
-- Comunicados, avisos, mural e confirmação de leitura
-- ============================================================

-- ─── Comunicados ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comunicados (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          text        NOT NULL,
  corpo           text        NOT NULL,
  categoria       text        NOT NULL DEFAULT 'aviso'
                              CHECK (categoria IN ('aviso','comunicado','alerta','procedimento','treinamento')),
  prioridade      text        NOT NULL DEFAULT 'normal'
                              CHECK (prioridade IN ('normal','importante','urgente','critico')),
  publicado       boolean     NOT NULL DEFAULT false,
  fixado          boolean     NOT NULL DEFAULT false,   -- fica no topo do mural
  exige_leitura   boolean     NOT NULL DEFAULT false,   -- gera confirmação de leitura
  destino         text        NOT NULL DEFAULT 'todos'
                              CHECK (destino IN ('todos','por_obra','por_cargo')),
  data_publicacao date,
  data_validade   date,                                 -- NULL = sem expiração
  autor_id        uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comuni_pub_idx  ON public.comunicados (publicado, data_publicacao DESC);
CREATE INDEX IF NOT EXISTS comuni_prio_idx ON public.comunicados (prioridade);

-- ─── Destinatários por obra ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comunicados_obras (
  comunicado_id uuid NOT NULL REFERENCES public.comunicados(id) ON DELETE CASCADE,
  obra_id       uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  PRIMARY KEY (comunicado_id, obra_id)
);

-- ─── Destinatários por cargo ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comunicados_cargos (
  comunicado_id uuid NOT NULL REFERENCES public.comunicados(id) ON DELETE CASCADE,
  cargo_id      uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  PRIMARY KEY (comunicado_id, cargo_id)
);

-- ─── Confirmações de Leitura ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comunicados_leituras (
  comunicado_id uuid        NOT NULL REFERENCES public.comunicados(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_leitura  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comunicado_id, user_id)
);

CREATE INDEX IF NOT EXISTS leituras_user_idx  ON public.comunicados_leituras (user_id);
CREATE INDEX IF NOT EXISTS leituras_com_idx   ON public.comunicados_leituras (comunicado_id);

-- ─── Triggers updated_at ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_comunicados_upd ON public.comunicados;
CREATE TRIGGER trg_comunicados_upd BEFORE UPDATE ON public.comunicados
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── View: comunicados com contagem de leituras ───────────────
CREATE OR REPLACE VIEW public.v_comunicados_resumo AS
SELECT
  c.*,
  u.email                        AS autor_nome,
  COUNT(DISTINCT cl.user_id)     AS total_leituras,
  -- obras vinculadas (array)
  ARRAY(
    SELECT o.nome FROM public.comunicados_obras co
    JOIN public.obras o ON o.id = co.obra_id
    WHERE co.comunicado_id = c.id
  ) AS obras_nomes
FROM public.comunicados c
LEFT JOIN auth.users u ON u.id = c.autor_id
LEFT JOIN public.comunicados_leituras cl ON cl.comunicado_id = c.id
GROUP BY c.id, u.email;

GRANT SELECT ON public.v_comunicados_resumo TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.comunicados          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicados_obras    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicados_cargos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicados_leituras ENABLE ROW LEVEL SECURITY;

-- Comunicados: todos leem publicados; gestores editam tudo
DROP POLICY IF EXISTS "comuni_select" ON public.comunicados;
DROP POLICY IF EXISTS "comuni_write"  ON public.comunicados;
CREATE POLICY "comuni_select" ON public.comunicados FOR SELECT TO authenticated
  USING (publicado = true OR get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));
CREATE POLICY "comuni_write" ON public.comunicados FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Obras / Cargos destino
DROP POLICY IF EXISTS "comuni_obras_sel" ON public.comunicados_obras;
DROP POLICY IF EXISTS "comuni_obras_wri" ON public.comunicados_obras;
CREATE POLICY "comuni_obras_sel" ON public.comunicados_obras FOR SELECT TO authenticated USING (true);
CREATE POLICY "comuni_obras_wri" ON public.comunicados_obras FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "comuni_cargos_sel" ON public.comunicados_cargos;
DROP POLICY IF EXISTS "comuni_cargos_wri" ON public.comunicados_cargos;
CREATE POLICY "comuni_cargos_sel" ON public.comunicados_cargos FOR SELECT TO authenticated USING (true);
CREATE POLICY "comuni_cargos_wri" ON public.comunicados_cargos FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Leituras: cada usuário insere a própria; gestores leem todas
DROP POLICY IF EXISTS "leituras_sel"      ON public.comunicados_leituras;
DROP POLICY IF EXISTS "leituras_insert"   ON public.comunicados_leituras;
CREATE POLICY "leituras_sel" ON public.comunicados_leituras FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));
CREATE POLICY "leituras_insert" ON public.comunicados_leituras FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

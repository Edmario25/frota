-- ============================================================
-- Fase 9 — Qualidade / Não Conformidades
-- Registro, fluxo de status, 5 Porquês e Plano de Ação (5W2H)
-- ============================================================

-- ─── Não Conformidades ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nao_conformidades (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  numero_nc           integer,    -- auto-gerado por obra
  titulo              text        NOT NULL,
  descricao           text,
  categoria           text        NOT NULL DEFAULT 'qualidade'
                                  CHECK (categoria IN ('procedimento','material','equipamento','seguranca','ambiental','qualidade','outro')),
  gravidade           text        NOT NULL DEFAULT 'moderada'
                                  CHECK (gravidade IN ('leve','moderada','grave','critica')),
  status              text        NOT NULL DEFAULT 'aberta'
                                  CHECK (status IN ('aberta','em_analise','em_tratamento','verificada','encerrada','cancelada')),
  local_ocorrencia    text,
  data_ocorrencia     date        NOT NULL DEFAULT current_date,
  data_limite         date,
  data_encerramento   date,
  responsavel_id      uuid        REFERENCES public.employees(id),
  detectado_por_id    uuid        REFERENCES auth.users(id),
  -- Análise de causa raiz (5 Porquês resumido)
  causa_raiz          text,
  por1                text,
  por2                text,
  por3                text,
  por4                text,
  por5                text,
  -- Eficácia
  verificado_por_id   uuid        REFERENCES auth.users(id),
  observacoes_verif   text,
  reincidente         boolean     NOT NULL DEFAULT false,
  nc_origem_id        uuid        REFERENCES public.nao_conformidades(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nc_obra_idx    ON public.nao_conformidades (obra_id, status);
CREATE INDEX IF NOT EXISTS nc_status_idx  ON public.nao_conformidades (status);
CREATE INDEX IF NOT EXISTS nc_grav_idx    ON public.nao_conformidades (gravidade);

-- Auto-numerar NC por obra
CREATE OR REPLACE FUNCTION public.fn_auto_numero_nc()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_nc IS NULL THEN
    SELECT COALESCE(MAX(numero_nc), 0) + 1
    INTO NEW.numero_nc
    FROM public.nao_conformidades
    WHERE obra_id = NEW.obra_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_numero_nc ON public.nao_conformidades;
CREATE TRIGGER trg_auto_numero_nc
  BEFORE INSERT ON public.nao_conformidades
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_numero_nc();

-- ─── Plano de Ação 5W2H ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nc_acoes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id           uuid        NOT NULL REFERENCES public.nao_conformidades(id) ON DELETE CASCADE,
  o_que           text        NOT NULL,   -- What
  por_que         text,                   -- Why
  quem            text,                   -- Who
  onde            text,                   -- Where
  quando          date,                   -- When
  como            text,                   -- How
  quanto          numeric(14,2),          -- How much
  status          text        NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  data_conclusao  date,
  observacoes     text,
  ordem           integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nc_acoes_nc_idx ON public.nc_acoes (nc_id);

-- ─── Evidências / Anexos ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nc_evidencias (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id       uuid        NOT NULL REFERENCES public.nao_conformidades(id) ON DELETE CASCADE,
  tipo        text        NOT NULL DEFAULT 'foto' CHECK (tipo IN ('foto','documento','video')),
  url         text        NOT NULL,
  titulo      text,
  fase        text        NOT NULL DEFAULT 'abertura' CHECK (fase IN ('abertura','tratamento','verificacao')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nc_evid_nc_idx ON public.nc_evidencias (nc_id);

-- ─── Triggers updated_at ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_nc_updated_at       ON public.nao_conformidades;
DROP TRIGGER IF EXISTS trg_nc_acoes_updated_at ON public.nc_acoes;
CREATE TRIGGER trg_nc_updated_at       BEFORE UPDATE ON public.nao_conformidades
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_nc_acoes_updated_at BEFORE UPDATE ON public.nc_acoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── View: KPIs por obra ─────────────────────────────────────
CREATE OR REPLACE VIEW public.v_nc_resumo AS
SELECT
  nc.obra_id,
  o.nome                         AS obra_nome,
  COUNT(*)                       AS total_ncs,
  COUNT(*) FILTER (WHERE nc.status = 'aberta')        AS abertas,
  COUNT(*) FILTER (WHERE nc.status = 'em_analise')    AS em_analise,
  COUNT(*) FILTER (WHERE nc.status = 'em_tratamento') AS em_tratamento,
  COUNT(*) FILTER (WHERE nc.status = 'encerrada')     AS encerradas,
  COUNT(*) FILTER (WHERE nc.gravidade = 'critica')    AS criticas,
  COUNT(*) FILTER (WHERE nc.gravidade = 'grave')      AS graves,
  COUNT(*) FILTER (WHERE nc.reincidente = true)       AS reincidentes,
  COUNT(*) FILTER (WHERE nc.data_limite < current_date AND nc.status NOT IN ('encerrada','cancelada')) AS atrasadas,
  ROUND(AVG(
    CASE WHEN nc.data_encerramento IS NOT NULL
    THEN (nc.data_encerramento - nc.data_ocorrencia)
    END
  ), 1)                          AS tempo_medio_dias
FROM public.nao_conformidades nc
JOIN public.obras o ON o.id = nc.obra_id
GROUP BY nc.obra_id, o.nome;

GRANT SELECT ON public.v_nc_resumo TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.nao_conformidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_acoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_evidencias     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nc_select" ON public.nao_conformidades;
DROP POLICY IF EXISTS "nc_write"  ON public.nao_conformidades;
CREATE POLICY "nc_select" ON public.nao_conformidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "nc_write"  ON public.nao_conformidades FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "nc_acoes_select" ON public.nc_acoes;
DROP POLICY IF EXISTS "nc_acoes_write"  ON public.nc_acoes;
CREATE POLICY "nc_acoes_select" ON public.nc_acoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "nc_acoes_write"  ON public.nc_acoes FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "nc_evid_select" ON public.nc_evidencias;
DROP POLICY IF EXISTS "nc_evid_write"  ON public.nc_evidencias;
CREATE POLICY "nc_evid_select" ON public.nc_evidencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "nc_evid_write"  ON public.nc_evidencias FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

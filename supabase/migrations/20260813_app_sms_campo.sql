-- ============================================================
-- App SMS de Campo — novas tabelas para módulos não cobertos
-- pelo schema existente: Near Miss, Acidentes, PT
-- ============================================================

-- ─── Near Miss (quase-acidente detalhado) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_near_miss (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  registrado_por   uuid        NOT NULL REFERENCES public.employees(id),
  o_que_aconteceu  text        NOT NULL,
  o_que_poderia    text        NOT NULL,
  local            text,
  acao_imediata    text,
  causas           text,
  fotos            text[]      NOT NULL DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'aberto'
                   CHECK (status IN ('aberto','em_analise','encerrado')),
  device_id        text,
  sync_status      text        NOT NULL DEFAULT 'synced'
                   CHECK (sync_status IN ('pending','synced','error')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_near_miss_obra   ON public.sms_near_miss (obra_id);
CREATE INDEX IF NOT EXISTS idx_near_miss_status ON public.sms_near_miss (status);

DROP TRIGGER IF EXISTS trg_near_miss_upd ON public.sms_near_miss;
CREATE TRIGGER trg_near_miss_upd
  BEFORE UPDATE ON public.sms_near_miss
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── Acidentes / Incidentes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_acidentes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  registrado_por   uuid        NOT NULL REFERENCES public.employees(id),
  data_hora        timestamptz NOT NULL DEFAULT now(),
  tipo             text        NOT NULL
                   CHECK (tipo IN (
                     'acidente_tipico','doenca_ocupacional',
                     'acidente_trajeto','incidente_perigoso','primeiros_socorros'
                   )),
  descricao        text        NOT NULL,
  lesao            text,
  parte_corpo      text,
  afastamento      boolean     NOT NULL DEFAULT false,
  dias_afastamento integer,
  testemunhas      text,
  cat_gerada       boolean     NOT NULL DEFAULT false,
  fotos            text[]      NOT NULL DEFAULT '{}',
  device_id        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acidentes_obra ON public.sms_acidentes (obra_id);
CREATE INDEX IF NOT EXISTS idx_acidentes_data ON public.sms_acidentes (data_hora);

DROP TRIGGER IF EXISTS trg_acidentes_upd ON public.sms_acidentes;
CREATE TRIGGER trg_acidentes_upd
  BEFORE UPDATE ON public.sms_acidentes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── Permissão de Trabalho (PT) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_pt (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  emitente_id       uuid        NOT NULL REFERENCES public.employees(id),
  tipo_pt           text        NOT NULL
                    CHECK (tipo_pt IN (
                      'trabalho_altura','espaco_confinado',
                      'eletrica','icamento','trabalho_quente','outros'
                    )),
  atividade         text        NOT NULL,
  local             text        NOT NULL,
  responsavel       text,
  equipe            text,
  data_inicio       timestamptz NOT NULL DEFAULT now(),
  data_fim          timestamptz,
  riscos            text[]      NOT NULL DEFAULT '{}',
  epis_obrigatorios text[]      NOT NULL DEFAULT '{}',
  status            text        NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta','encerrada','cancelada')),
  device_id         text,
  sync_status       text        NOT NULL DEFAULT 'synced'
                    CHECK (sync_status IN ('pending','synced','error')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_pt_obra   ON public.sms_pt (obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_pt_status ON public.sms_pt (status);
CREATE INDEX IF NOT EXISTS idx_sms_pt_inicio ON public.sms_pt (data_inicio);

DROP TRIGGER IF EXISTS trg_sms_pt_upd ON public.sms_pt;
CREATE TRIGGER trg_sms_pt_upd
  BEFORE UPDATE ON public.sms_pt
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── RLS das novas tabelas ────────────────────────────────────────────
ALTER TABLE public.sms_near_miss ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_acidentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_pt        ENABLE ROW LEVEL SECURITY;

-- Near miss
DROP POLICY IF EXISTS "nm_select" ON public.sms_near_miss;
DROP POLICY IF EXISTS "nm_write"  ON public.sms_near_miss;
CREATE POLICY "nm_select" ON public.sms_near_miss FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));
CREATE POLICY "nm_write" ON public.sms_near_miss FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR registrado_por IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

-- Acidentes
DROP POLICY IF EXISTS "acid_select" ON public.sms_acidentes;
DROP POLICY IF EXISTS "acid_write"  ON public.sms_acidentes;
CREATE POLICY "acid_select" ON public.sms_acidentes FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));
CREATE POLICY "acid_write" ON public.sms_acidentes FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR registrado_por IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

-- PT
DROP POLICY IF EXISTS "pt_select" ON public.sms_pt;
DROP POLICY IF EXISTS "pt_write"  ON public.sms_pt;
CREATE POLICY "pt_select" ON public.sms_pt FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));
CREATE POLICY "pt_write" ON public.sms_pt FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR emitente_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

-- ─── Storage bucket para fotos de campo ─────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sms-fotos', 'sms-fotos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "sms_fotos_select" ON storage.objects;
DROP POLICY IF EXISTS "sms_fotos_insert" ON storage.objects;
CREATE POLICY "sms_fotos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'sms-fotos');
CREATE POLICY "sms_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sms-fotos');

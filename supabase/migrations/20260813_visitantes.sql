-- ============================================================
-- Fase 11 — Visitantes e Controle de Acesso
-- Cadastro de visitantes, registro de visitas e histórico
-- ============================================================

-- ─── Cadastro de visitantes ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visitantes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text        NOT NULL,
  tipo_doc        text        NOT NULL DEFAULT 'cpf'
                              CHECK (tipo_doc IN ('cpf','rg','passaporte','cnh','outro')),
  numero_doc      text        NOT NULL,
  empresa         text,
  cargo_empresa   text,
  telefone        text,
  foto_url        text,
  observacoes     text,
  bloqueado       boolean     NOT NULL DEFAULT false,
  motivo_bloqueio text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_doc, numero_doc)
);

CREATE INDEX IF NOT EXISTS visitantes_doc_idx  ON public.visitantes (numero_doc);
CREATE INDEX IF NOT EXISTS visitantes_nome_idx ON public.visitantes (nome);

-- ─── Registro de visitas ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visitas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  visitante_id    uuid        NOT NULL REFERENCES public.visitantes(id),
  motivo          text        NOT NULL,
  setor_destino   text,
  responsavel_id  uuid        REFERENCES public.employees(id),  -- quem será visitado
  autorizado_por  uuid        REFERENCES auth.users(id),
  status          text        NOT NULL DEFAULT 'aguardando'
                              CHECK (status IN ('aguardando','autorizado','dentro','saiu','negado')),
  entrada         timestamptz,
  saida           timestamptz,
  placa_veiculo   text,
  cracha_numero   text,
  observacoes     text,
  motivo_negado   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitas_obra_idx      ON public.visitas (obra_id, status);
CREATE INDEX IF NOT EXISTS visitas_visitante_idx ON public.visitas (visitante_id);
CREATE INDEX IF NOT EXISTS visitas_data_idx      ON public.visitas (created_at DESC);

-- ─── Auto-gerar número de crachá ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_cracha()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_data text;
BEGIN
  IF NEW.cracha_numero IS NULL AND NEW.status = 'autorizado' THEN
    v_data := to_char(now(), 'YYYYMMDD');
    SELECT v_data || '-' || LPAD((
      SELECT COALESCE(MAX(
        CAST(SPLIT_PART(cracha_numero, '-', 2) AS integer)
      ), 0) + 1
      FROM public.visitas
      WHERE cracha_numero LIKE v_data || '-%'
    )::text, 4, '0')
    INTO NEW.cracha_numero;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_cracha ON public.visitas;
CREATE TRIGGER trg_auto_cracha
  BEFORE INSERT OR UPDATE ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_cracha();

-- ─── Triggers updated_at ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_visitantes_upd ON public.visitantes;
DROP TRIGGER IF EXISTS trg_visitas_upd    ON public.visitas;
CREATE TRIGGER trg_visitantes_upd BEFORE UPDATE ON public.visitantes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_visitas_upd BEFORE UPDATE ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── View: visitas ativas (dentro da obra) ────────────────────
CREATE OR REPLACE VIEW public.v_visitas_ativas AS
SELECT
  v.id, v.obra_id, v.motivo, v.setor_destino, v.entrada,
  v.cracha_numero, v.placa_veiculo, v.status,
  o.nome           AS obra_nome,
  vi.nome          AS visitante_nome,
  vi.empresa       AS visitante_empresa,
  vi.tipo_doc, vi.numero_doc,
  EXTRACT(EPOCH FROM (now() - v.entrada)) / 60 AS minutos_dentro,
  e.nome           AS responsavel_nome
FROM public.visitas v
JOIN public.obras o      ON o.id  = v.obra_id
JOIN public.visitantes vi ON vi.id = v.visitante_id
LEFT JOIN public.employees e ON e.id = v.responsavel_id
WHERE v.status IN ('autorizado','dentro');

GRANT SELECT ON public.v_visitas_ativas TO authenticated;

-- ─── View: KPIs por obra ─────────────────────────────────────
CREATE OR REPLACE VIEW public.v_visitantes_kpi AS
SELECT
  v.obra_id,
  o.nome                          AS obra_nome,
  COUNT(*)                        AS total_visitas,
  COUNT(*) FILTER (WHERE v.status IN ('autorizado','dentro')) AS dentro_agora,
  COUNT(*) FILTER (WHERE v.status = 'negado')                 AS negados,
  COUNT(*) FILTER (WHERE date_trunc('day', v.created_at) = current_date) AS hoje,
  COUNT(DISTINCT v.visitante_id)  AS visitantes_distintos,
  ROUND(AVG(
    CASE WHEN v.saida IS NOT NULL AND v.entrada IS NOT NULL
    THEN EXTRACT(EPOCH FROM (v.saida - v.entrada)) / 60
    END
  ), 0)                           AS tempo_medio_min
FROM public.visitas v
JOIN public.obras o ON o.id = v.obra_id
GROUP BY v.obra_id, o.nome;

GRANT SELECT ON public.v_visitantes_kpi TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.visitantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_sel" ON public.visitantes;
DROP POLICY IF EXISTS "visit_wri" ON public.visitantes;
CREATE POLICY "visit_sel" ON public.visitantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "visit_wri" ON public.visitantes FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "visitas_sel" ON public.visitas;
DROP POLICY IF EXISTS "visitas_wri" ON public.visitas;
CREATE POLICY "visitas_sel" ON public.visitas FOR SELECT TO authenticated USING (true);
CREATE POLICY "visitas_wri" ON public.visitas FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

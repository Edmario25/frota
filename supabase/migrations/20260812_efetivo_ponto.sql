-- ============================================================
-- Fase 2 — Efetivo e Ponto
-- Apontamento diário de presença por obra
-- ============================================================

-- ─── Tabela principal ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.efetivo_ponto (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  employee_id         uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data                date        NOT NULL,
  frente              text,                       -- "Fundação", "Estrutura", "Acabamento"
  empresa             text,                       -- empresa / subcontratada do trabalhador
  hora_entrada        time,
  hora_saida          time,
  horas_trabalhadas   numeric(4,2),
  horas_extras        numeric(4,2)  NOT NULL DEFAULT 0,
  ausencia            boolean       NOT NULL DEFAULT false,
  motivo_ausencia     text,
  registrado_por      uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, employee_id, data)
);

-- índices para consultas frequentes
CREATE INDEX IF NOT EXISTS efetivo_ponto_obra_data_idx  ON public.efetivo_ponto (obra_id, data);
CREATE INDEX IF NOT EXISTS efetivo_ponto_employee_idx   ON public.efetivo_ponto (employee_id);

-- trigger updated_at
CREATE OR REPLACE FUNCTION public.set_efetivo_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_efetivo_updated_at ON public.efetivo_ponto;
CREATE TRIGGER trg_efetivo_updated_at
  BEFORE UPDATE ON public.efetivo_ponto
  FOR EACH ROW EXECUTE FUNCTION public.set_efetivo_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.efetivo_ponto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "efetivo_select_auth"    ON public.efetivo_ponto;
DROP POLICY IF EXISTS "efetivo_write_gestores" ON public.efetivo_ponto;

-- todos autenticados leem (filtro por obra é feito no front)
CREATE POLICY "efetivo_select_auth" ON public.efetivo_ponto
  FOR SELECT TO authenticated USING (true);

-- gestores podem inserir/atualizar/deletar
CREATE POLICY "efetivo_write_gestores" ON public.efetivo_ponto
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra')
  )
  WITH CHECK (
    get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra')
  );

-- ─── View auxiliar: HHT diário por obra ──────────────────────
CREATE OR REPLACE VIEW public.v_efetivo_hht AS
SELECT
  obra_id,
  data,
  COUNT(*) FILTER (WHERE NOT ausencia)              AS presentes,
  COUNT(*) FILTER (WHERE ausencia)                  AS ausentes,
  COUNT(*)                                           AS total,
  COALESCE(SUM(horas_trabalhadas) FILTER (WHERE NOT ausencia), 0) AS hht_total,
  COALESCE(SUM(horas_extras),     0)                AS hh_extras
FROM public.efetivo_ponto
GROUP BY obra_id, data;

GRANT SELECT ON public.v_efetivo_hht TO authenticated;

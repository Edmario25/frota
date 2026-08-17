-- =====================================================================
-- Apontamentos de Campo — app mobile do apontador
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.apontamentos_campo (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid          NOT NULL REFERENCES public.obras(id),
  funcionario_id    uuid          REFERENCES public.funcionarios(id),
  nome_manual       text,                          -- fallback se QR não bater
  data_apontamento  date          NOT NULL DEFAULT CURRENT_DATE,
  frente            text,
  atividade         text,
  turno             text          NOT NULL DEFAULT 'dia'
                                  CHECK (turno IN ('dia','noite','misto')),
  horas_normal      numeric(4,2)  NOT NULL DEFAULT 8,
  horas_extra       numeric(4,2)  NOT NULL DEFAULT 0,
  presente          boolean       NOT NULL DEFAULT true,
  observacao        text,
  registrado_por    uuid          REFERENCES auth.users(id),
  created_at        timestamptz   NOT NULL DEFAULT now()
);

-- Evita duplo apontamento do mesmo funcionário no mesmo dia/obra
CREATE UNIQUE INDEX IF NOT EXISTS apc_unico_dia
  ON public.apontamentos_campo (obra_id, funcionario_id, data_apontamento)
  WHERE funcionario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS apc_obra_data_idx ON public.apontamentos_campo (obra_id, data_apontamento);

-- RLS
ALTER TABLE public.apontamentos_campo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apc_select" ON public.apontamentos_campo;
DROP POLICY IF EXISTS "apc_insert" ON public.apontamentos_campo;
DROP POLICY IF EXISTS "apc_update" ON public.apontamentos_campo;

CREATE POLICY "apc_select" ON public.apontamentos_campo FOR SELECT TO authenticated USING (true);
CREATE POLICY "apc_insert" ON public.apontamentos_campo FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "apc_update" ON public.apontamentos_campo FOR UPDATE TO authenticated USING (true);

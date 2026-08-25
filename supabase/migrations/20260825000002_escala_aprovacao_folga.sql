-- Fluxo formal de autorização de saída para folga.
ALTER TABLE public.escala_periodos
  ADD COLUMN IF NOT EXISTS autorizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS autorizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_negativa text;

ALTER TABLE public.escala_periodos
  DROP CONSTRAINT IF EXISTS escala_periodos_status_valido;

ALTER TABLE public.escala_periodos
  ADD CONSTRAINT escala_periodos_status_valido CHECK (
    status IN ('pendente_aprovacao', 'agendado', 'em_folga', 'concluido', 'negado', 'cancelado')
  );

CREATE INDEX IF NOT EXISTS escala_periodos_pendentes_idx
  ON public.escala_periodos(data_inicio_folga)
  WHERE status = 'pendente_aprovacao';

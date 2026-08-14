-- ─── Ponto eletrônico por QR Code ────────────────────────────────────────────
-- Cada leitura do crachá QR gera um registro de entrada ou saída.
-- Separado do efetivo_ponto (planilha manual) para não quebrar o fluxo existente.

CREATE TABLE IF NOT EXISTS public.employee_ponto_qr (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id         uuid  REFERENCES public.obras(id) ON DELETE SET NULL,
  tipo            text  NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  registrado_em   timestamptz NOT NULL DEFAULT now(),
  registrado_por  uuid  REFERENCES public.employees(id) ON DELETE SET NULL,
  metodo          text  NOT NULL DEFAULT 'qr' CHECK (metodo IN ('qr', 'manual')),
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_ponto_qr ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ponto_qr_all" ON public.employee_ponto_qr
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ponto_qr_employee  ON public.employee_ponto_qr(employee_id);
CREATE INDEX IF NOT EXISTS idx_ponto_qr_obra      ON public.employee_ponto_qr(obra_id);
CREATE INDEX IF NOT EXISTS idx_ponto_qr_data      ON public.employee_ponto_qr(registrado_em);

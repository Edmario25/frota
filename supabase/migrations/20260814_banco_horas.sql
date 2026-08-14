-- ─────────────────────────────────────────────────────────────────────────────
-- Banco de Horas — lançamentos de compensação ou pagamento de HE
-- O saldo é calculado como:
--   Créditos = sum(efetivo_ponto.horas_extras) do funcionário
--   Débitos  = sum(banco_horas_lancamentos.horas) WHERE tipo = 'compensacao' | 'pagamento'
--   Saldo    = Créditos - Débitos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.banco_horas_lancamentos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id         uuid        REFERENCES public.obras(id) ON DELETE SET NULL,
  tipo            text        NOT NULL DEFAULT 'compensacao'
                              CHECK (tipo IN ('compensacao','pagamento','ajuste')),
  -- compensacao = funcionário folga / sai mais cedo para compensar
  -- pagamento   = empresa paga as HEs em dinheiro
  -- ajuste      = correção manual (positivo ou negativo)
  horas           numeric(6,2) NOT NULL,  -- positivo = débito no banco
  data_referencia date        NOT NULL,
  descricao       text,
  registrado_por  uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banco_horas_emp  ON public.banco_horas_lancamentos(employee_id);
CREATE INDEX IF NOT EXISTS idx_banco_horas_obra ON public.banco_horas_lancamentos(obra_id);

ALTER TABLE public.banco_horas_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY banco_horas_all ON public.banco_horas_lancamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

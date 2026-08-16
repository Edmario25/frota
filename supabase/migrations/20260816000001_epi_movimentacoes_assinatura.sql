-- =====================================================================
-- EPI: Movimentações de estoque + assinatura digital na entrega
-- =====================================================================

-- 1. Coluna de assinatura digital (base64 PNG) nas entregas
ALTER TABLE public.sms_colaborador_epis
  ADD COLUMN IF NOT EXISTS assinatura_base64 text,
  ADD COLUMN IF NOT EXISTS quantidade        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS condicao          text,
  ADD COLUMN IF NOT EXISTS observacoes       text,
  ADD COLUMN IF NOT EXISTS data_devolucao    date;

-- Alias para compatibilidade: a migration original usa employee_id
-- mas o código do app usa colaborador_id. Garantimos que ambos existam.
ALTER TABLE public.sms_colaborador_epis
  ADD COLUMN IF NOT EXISTS colaborador_id uuid REFERENCES public.employees(id);

-- Se a coluna employee_id já existia, popula colaborador_id a partir dela
UPDATE public.sms_colaborador_epis
SET colaborador_id = employee_id
WHERE colaborador_id IS NULL AND employee_id IS NOT NULL;

-- 2. Ajuste em sms_epis_catalogo
ALTER TABLE public.sms_epis_catalogo
  ADD COLUMN IF NOT EXISTS categoria    text,
  ADD COLUMN IF NOT EXISTS ca_vencimento date;

-- Popula ca_vencimento a partir de ca_validade se existir
UPDATE public.sms_epis_catalogo
SET ca_vencimento = ca_validade
WHERE ca_vencimento IS NULL AND ca_validade IS NOT NULL;

-- 3. Ajuste em sms_epis_estoque
ALTER TABLE public.sms_epis_estoque
  ADD COLUMN IF NOT EXISTS quantidade_minima integer NOT NULL DEFAULT 5;

-- Popula quantidade_minima a partir de estoque_minimo
UPDATE public.sms_epis_estoque
SET quantidade_minima = estoque_minimo
WHERE quantidade_minima = 5 AND estoque_minimo != 5;

-- 4. Tabela de movimentações de estoque
CREATE TABLE IF NOT EXISTS public.sms_epis_movimentacoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epi_id              uuid NOT NULL REFERENCES public.sms_epis_catalogo(id) ON DELETE CASCADE,
  obra_id             uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  tipo                text NOT NULL
                        CHECK (tipo IN (
                          'entrada_compra',
                          'entrada_transferencia',
                          'saida_entrega',
                          'saida_transferencia',
                          'ajuste_positivo',
                          'ajuste_negativo'
                        )),
  quantidade          integer NOT NULL,
  data                date NOT NULL DEFAULT CURRENT_DATE,
  nota_fiscal         text,
  fornecedor          text,
  observacoes         text,
  obra_destino_id     uuid REFERENCES public.obras(id),   -- transferência destino
  colaborador_epi_id  uuid REFERENCES public.sms_colaborador_epis(id),
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_mov_epi    ON public.sms_epis_movimentacoes(epi_id);
CREATE INDEX IF NOT EXISTS idx_epi_mov_obra   ON public.sms_epis_movimentacoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_epi_mov_data   ON public.sms_epis_movimentacoes(data DESC);
CREATE INDEX IF NOT EXISTS idx_epi_mov_tipo   ON public.sms_epis_movimentacoes(tipo);

ALTER TABLE public.sms_epis_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "epi_mov_auth" ON public.sms_epis_movimentacoes
  FOR ALL USING (auth.role() = 'authenticated');

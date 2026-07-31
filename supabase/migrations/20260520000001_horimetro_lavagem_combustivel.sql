-- ============================================================
-- MIGRAÇÃO: Horímetro, Lavagens melhoradas, Combustível, Centro de Custo
-- Data: 2026-05-20
-- Execute no Supabase Studio → SQL Editor
-- ============================================================

-- 1. HORÍMETRO para veículos pesados
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS tipo_medicao       text    NOT NULL DEFAULT 'km'
      CHECK (tipo_medicao IN ('km', 'horimetro')),
  ADD COLUMN IF NOT EXISTS horimetro_atual    numeric(10,1)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_horimetro_mensal numeric(10,1) DEFAULT 250;

-- 2. LIMITE DE LAVAGENS por veículo
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS limite_lavagens_mensal integer DEFAULT 4;

-- 3. VALOR DE ALUGUEL MENSAL (para centro de custo)
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS valor_aluguel_mensal numeric(10,2) DEFAULT 0;

-- 4. MELHORIAS em wash_records: adicionar valor e fornecedor
ALTER TABLE public.wash_records
  ADD COLUMN IF NOT EXISTS valor     numeric(10,2),
  ADD COLUMN IF NOT EXISTS fornecedor text;

-- employee_id opcional (lavagem pode ser registrada sem funcionário específico)
ALTER TABLE public.wash_records
  ALTER COLUMN employee_id DROP NOT NULL;

-- 5. NOVA TABELA: vehicle_fuel_logs (abastecimentos)
CREATE TABLE IF NOT EXISTS public.vehicle_fuel_logs (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id                 uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  data_abastecimento         date        NOT NULL DEFAULT CURRENT_DATE,
  km_no_abastecimento        numeric(10,1),
  horimetro_no_abastecimento numeric(10,1),
  litros                     numeric(8,2) NOT NULL,
  valor_litro                numeric(6,3) NOT NULL,
  valor_total                numeric(10,2),
  tipo_combustivel           text        DEFAULT 'diesel',
  posto_nome                 text,
  foto_comprovante_url       text,
  observacoes                text,
  created_by                 uuid        REFERENCES auth.users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- RLS para fuel_logs
ALTER TABLE public.vehicle_fuel_logs ENABLE ROW LEVEL SECURITY;

-- Gestores veem todos
CREATE POLICY "fuel_logs_gestores_all" ON public.vehicle_fuel_logs
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato() OR public.is_gestor_obra());

-- Funcionários podem inserir abastecimento do próprio veículo
CREATE POLICY "fuel_logs_funcionario_insert" ON public.vehicle_fuel_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_funcionario()
    AND vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE responsavel_id = (
        SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

-- Funcionários podem ver abastecimentos do próprio veículo
CREATE POLICY "fuel_logs_funcionario_select" ON public.vehicle_fuel_logs
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE responsavel_id = (
        SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

-- RLS para wash_records (atualizar se já existirem)
DO $$
BEGIN
  -- Dropar políticas antigas se existirem
  DROP POLICY IF EXISTS "wash_records_gestores_all" ON public.wash_records;
  DROP POLICY IF EXISTS "wash_records_funcionario_insert" ON public.wash_records;
  DROP POLICY IF EXISTS "wash_records_funcionario_select" ON public.wash_records;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.wash_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wash_records_gestores_all" ON public.wash_records
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato() OR public.is_gestor_obra());

CREATE POLICY "wash_records_funcionario_insert" ON public.wash_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_funcionario()
    AND vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE responsavel_id = (
        SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

CREATE POLICY "wash_records_funcionario_select" ON public.wash_records
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE responsavel_id = (
        SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

-- Atualizar banco_completo.sql comment
-- AVISO: Após rodar esta migração, recarregue o schema cache do Supabase:
-- Settings → API → Reload Schema Cache

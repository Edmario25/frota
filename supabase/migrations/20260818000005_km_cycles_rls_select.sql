-- ─── RLS: permite que usuários autenticados leiam vehicle_km_cycles ──────────
-- Sem esta policy, o papel 'funcionario' não consegue ler o ciclo ativo
-- via get_current_km_cycle RPC (SECURITY INVOKER), fazendo o app do motorista
-- exibir "Sem ciclo de km ativo" mesmo quando o ciclo existe.

ALTER TABLE public.vehicle_km_cycles ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados podem ler (leitura pura, sem dados sensíveis)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vehicle_km_cycles'
      AND policyname = 'authenticated can read km cycles'
  ) THEN
    CREATE POLICY "authenticated can read km cycles"
      ON public.vehicle_km_cycles
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

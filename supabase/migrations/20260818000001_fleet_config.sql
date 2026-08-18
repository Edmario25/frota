-- ─── Tabela fleet_config: parâmetros globais de frota ───────────────────────
-- Antes ficavam em localStorage (só no navegador do admin).
-- Agora ficam no banco para que o app do motorista (outro dispositivo) leia.

CREATE TABLE IF NOT EXISTS public.fleet_config (
  id                        integer PRIMARY KEY DEFAULT 1,  -- sempre 1 única linha
  limite_km_mensal_padrao   integer NOT NULL DEFAULT 2000,
  alerta_km_percentual      integer NOT NULL DEFAULT 80,    -- % para disparar alerta
  intervalo_manutencao_km   integer NOT NULL DEFAULT 10000,
  intervalo_manutencao_dias integer NOT NULL DEFAULT 180,
  alerta_documentacao_dias  integer NOT NULL DEFAULT 30,
  criar_ciclos_auto         boolean NOT NULL DEFAULT true,
  fechar_ciclos_expirados   boolean NOT NULL DEFAULT true,
  updated_at                timestamptz DEFAULT now()
);

-- Garante a linha default
INSERT INTO public.fleet_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS: qualquer usuário autenticado lê; só admin escreve (pode refinar depois)
ALTER TABLE public.fleet_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fleet_config_select" ON public.fleet_config;
CREATE POLICY "fleet_config_select"
  ON public.fleet_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "fleet_config_insert" ON public.fleet_config;
CREATE POLICY "fleet_config_insert"
  ON public.fleet_config FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fleet_config_upsert" ON public.fleet_config;
CREATE POLICY "fleet_config_upsert"
  ON public.fleet_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

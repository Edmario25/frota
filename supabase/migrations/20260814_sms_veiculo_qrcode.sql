-- ══════════════════════════════════════════════════════════════════════════════
-- SMS Campo — Vínculo de Veículo + QR Code
-- Adiciona veiculo_id nas tabelas SMS para rastrear eventos por veículo.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sms_inspecoes  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.sms_near_miss  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.sms_acidentes  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.sms_desvios    ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.sms_aprs       ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- Índices para consultas por veículo
CREATE INDEX IF NOT EXISTS idx_sms_inspecoes_veiculo ON public.sms_inspecoes(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_sms_near_miss_veiculo ON public.sms_near_miss(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_sms_acidentes_veiculo ON public.sms_acidentes(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_sms_desvios_veiculo   ON public.sms_desvios(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_sms_aprs_veiculo      ON public.sms_aprs(veiculo_id);

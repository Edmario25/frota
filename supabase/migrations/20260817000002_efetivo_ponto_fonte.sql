-- =====================================================================
-- Integração App Apontador de Campo → efetivo_ponto
-- Adiciona coluna "fonte" para rastrear a origem do apontamento
-- =====================================================================

ALTER TABLE public.efetivo_ponto
  ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'supervisor'
  CHECK (fonte IN ('supervisor','campo','csv','totem'));

COMMENT ON COLUMN public.efetivo_ponto.fonte IS
  'Origem do apontamento: supervisor (Efetivo e Ponto), campo (App Apontador), csv (importação), totem (QR totem)';

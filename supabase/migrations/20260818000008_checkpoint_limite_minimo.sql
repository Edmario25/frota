-- ─── Permite limite de velocidade baixo em checkpoints ──────────────────────
--
-- O CHECK original exigia limite >= 5 km/h. O valor foi arbitrario e impede
-- o teste de bancada, em que se cria um ponto com limite de 1-3 km/h para
-- validar a cadeia radar -> Pi -> Supabase -> tela usando movimento de mao
-- (que fica na casa dos 3 km/h), antes de ter um veiculo disponivel.
--
-- Limites baixos nao trazem risco: sao visiveis na tela e o gestor corrige.

ALTER TABLE public.sms_checkpoints
  DROP CONSTRAINT IF EXISTS sms_checkpoints_limite_velocidade_kmh_check;

ALTER TABLE public.sms_checkpoints
  ADD CONSTRAINT sms_checkpoints_limite_velocidade_kmh_check
  CHECK (limite_velocidade_kmh BETWEEN 1 AND 200);

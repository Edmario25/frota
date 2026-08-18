-- ─── Agendamento automático de ciclos mensais de KM via pg_cron ──────────────
-- Requer: extensão pg_cron habilitada no Supabase (já disponível por padrão)
-- Agenda: todo dia 1º de cada mês às 00:05 UTC
-- Ação: chama create_monthly_km_cycles() que cria ciclos para todos os
--        veículos disponíveis/em_uso sem ciclo ativo no mês atual.

-- Remove agendamento anterior (caso exista) antes de recriar
SELECT cron.unschedule('criar-ciclos-mensais')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'criar-ciclos-mensais'
);

-- Cria o agendamento
SELECT cron.schedule(
  'criar-ciclos-mensais',   -- nome do job (único)
  '5 0 1 * *',              -- cron: minuto=5, hora=0, dia=1, todo mês
  $$ SELECT public.create_monthly_km_cycles(); $$
);

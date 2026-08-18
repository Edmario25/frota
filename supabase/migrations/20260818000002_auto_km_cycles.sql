-- ─── Função: cria ciclos mensais de km para veículos sem ciclo ativo ─────────
-- Chamada automaticamente ao abrir o módulo de frota e no início de cada mês.
-- Lógica:
--   • Ciclo vai do dia 1 ao último dia do mês corrente
--   • Só cria se o veículo NÃO tem ciclo ativo no mês atual
--   • usa quilometragem_maxima_mensal do veículo (fallback: 2000)
--   • Retorna quantos ciclos foram criados

CREATE OR REPLACE FUNCTION public.create_monthly_km_cycles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inicio  date;
  v_fim     date;
  v_count   integer := 0;
  rec       RECORD;
BEGIN
  v_inicio := date_trunc('month', CURRENT_DATE)::date;
  v_fim    := (v_inicio + interval '1 month - 1 day')::date;

  FOR rec IN
    SELECT
      v.id,
      COALESCE(v.quilometragem_atual, 0)            AS km_atual,
      COALESCE(v.quilometragem_maxima_mensal, 2000)  AS limite
    FROM public.vehicles v
    WHERE v.status IN ('disponivel', 'em_uso')
      AND NOT EXISTS (
        SELECT 1
        FROM public.vehicle_km_cycles c
        WHERE c.vehicle_id = v.id
          AND c.status     = 'ativo'
          AND c.cycle_start_date >= v_inicio
          AND c.cycle_start_date <  v_inicio + interval '1 month'
      )
  LOOP
    INSERT INTO public.vehicle_km_cycles (
      vehicle_id,
      cycle_start_date,
      cycle_end_date,
      km_inicial,
      km_rodados,
      limite_km_mensal,
      status
    ) VALUES (
      rec.id,
      v_inicio,
      v_fim,
      rec.km_atual,
      0,
      rec.limite,
      'ativo'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Permissão: qualquer usuário autenticado pode chamar
GRANT EXECUTE ON FUNCTION public.create_monthly_km_cycles() TO authenticated;

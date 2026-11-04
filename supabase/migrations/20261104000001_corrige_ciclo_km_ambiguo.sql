-- ============================================================================
-- Ciclo de KM: o erro que deixava a frota inteira sem medição
--
-- get_current_km_cycle declara km_rodados como coluna de retorno (RETURNS
-- TABLE) e, dentro do corpo, fazia "UPDATE ... SET km_rodados = ... RETURNING
-- km_rodados INTO ...". Para o PL/pgSQL, km_rodados ali é ao mesmo tempo a
-- variável de saída e a coluna da tabela: erro 42702, "column reference
-- km_rodados is ambiguous". A função nunca retornava nada.
--
-- O efeito foi silencioso e caro: o frontend engolia o erro num console.error
-- e mostrava "Nenhum ciclo ativo". Sem ciclo:
--   • km_rodados nunca acumulava,  logo frota_km_rodado() devolvia 0;
--   • custo por km nunca calculava — o indicador ficava eternamente em "—";
--   • o limite mensal de km da locadora não era fiscalizado por ninguém.
--
-- A correção renomeia as variáveis de saída com prefixo e qualifica as colunas.
-- Também fixa search_path nas funções de ciclo (SECURITY DEFINER sem
-- search_path fixo é porta aberta para captura de nome de tabela).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_current_km_cycle(uuid);

CREATE OR REPLACE FUNCTION public.get_current_km_cycle(p_vehicle_id uuid)
RETURNS TABLE(
  cycle_id          uuid,
  cycle_start_date  date,
  cycle_end_date    date,
  km_inicial        integer,
  limite_km_mensal  integer,
  km_rodados        integer,
  days_remaining    integer,
  percentage_used   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_km_atual    integer;
  v_hoje        date := CURRENT_DATE;
  v_ciclo       public.vehicle_km_cycles%ROWTYPE;
  v_novo_id     uuid;
  v_km_rodados  integer;
BEGIN
  SELECT COALESCE(v.quilometragem_atual, 0)
  INTO   v_km_atual
  FROM   public.vehicles v
  WHERE  v.id = p_vehicle_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT c.* INTO v_ciclo
  FROM   public.vehicle_km_cycles c
  WHERE  c.vehicle_id = p_vehicle_id
    AND  c.status     = 'ativo'
  ORDER BY c.cycle_start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_novo_id := public.create_vehicle_km_cycle(p_vehicle_id, v_hoje);
    IF v_novo_id IS NULL THEN
      RETURN;
    END IF;
    SELECT c.* INTO v_ciclo
    FROM public.vehicle_km_cycles c
    WHERE c.id = v_novo_id;
  END IF;

  -- O odômetro só anda para a frente: GREATEST evita que uma correção de km
  -- para baixo vire rodagem negativa no meio do ciclo.
  v_km_rodados := GREATEST(0, v_km_atual - v_ciclo.km_inicial);

  UPDATE public.vehicle_km_cycles c
  SET    km_rodados = v_km_rodados,
         updated_at = now()
  WHERE  c.id = v_ciclo.id;

  RETURN QUERY SELECT
    v_ciclo.id,
    v_ciclo.cycle_start_date,
    v_ciclo.cycle_end_date,
    v_ciclo.km_inicial,
    v_ciclo.limite_km_mensal,
    v_km_rodados,
    (v_ciclo.cycle_end_date - v_hoje)::integer,
    CASE
      WHEN v_ciclo.limite_km_mensal > 0
      THEN ROUND((v_km_rodados::numeric / v_ciclo.limite_km_mensal::numeric) * 100, 2)
      ELSE 0::numeric
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_km_cycle(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_current_km_cycle(uuid) IS
  'Ciclo de km vigente do veículo, criando o primeiro se não houver. Atualiza km_rodados pelo odômetro atual. É a fonte do custo por km e do limite mensal da locadora.';

-- ─── Hardening: search_path fixo nas demais funções de ciclo ────────────────

ALTER FUNCTION public.create_vehicle_km_cycle(uuid, date)        SET search_path TO 'public';
ALTER FUNCTION public.auto_renew_km_cycles()                     SET search_path TO 'public';
ALTER FUNCTION public.trg_fn_vehicle_create_first_cycle()        SET search_path TO 'public';

-- ─── Abre o ciclo que ficou faltando enquanto a função estava quebrada ──────
-- Veículo ativo sem ciclo nunca mediu nada. Começa hoje: o passado não tem
-- como ser reconstruído, e inventar km inicial retroativo produziria custo
-- por km falso — pior do que o campo vazio.

DO $$
DECLARE v_criados integer;
BEGIN
  v_criados := public.auto_renew_km_cycles();
  RAISE NOTICE 'Ciclos de km abertos/renovados: %', v_criados;
END $$;

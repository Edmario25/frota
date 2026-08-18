-- ─── Trigger: sincroniza km_rodados do ciclo ativo com o odômetro do GPS ─────
--
-- Quando o GPS (Traccar) atualiza quilometragem_atual no veículo,
-- este trigger recalcula km_rodados = quilometragem_atual - km_inicial
-- no ciclo de KM ativo daquele veículo.
--
-- Resultado: tanto o sistema gerencial quanto o app do motorista
-- exibem o mesmo valor de km rodados em tempo real, sem processamento extra.

CREATE OR REPLACE FUNCTION public.trg_fn_sync_cycle_km_from_odometer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Só age se o odômetro realmente mudou e tem valor válido
  IF NEW.quilometragem_atual IS NOT NULL
     AND (OLD.quilometragem_atual IS DISTINCT FROM NEW.quilometragem_atual)
  THEN
    UPDATE public.vehicle_km_cycles
    SET
      km_rodados = GREATEST(0, NEW.quilometragem_atual::numeric - km_inicial),
      updated_at = now()
    WHERE vehicle_id = NEW.id
      AND status    = 'ativo';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cycle_km_from_odometer ON public.vehicles;

CREATE TRIGGER trg_sync_cycle_km_from_odometer
  AFTER UPDATE OF quilometragem_atual ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_cycle_km_from_odometer();

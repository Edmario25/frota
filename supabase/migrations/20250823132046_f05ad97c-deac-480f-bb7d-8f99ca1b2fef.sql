-- First drop the trigger and then the functions
DROP TRIGGER IF EXISTS trigger_update_vehicle_km_cycle ON vehicles;
DROP FUNCTION IF EXISTS get_current_km_cycle(UUID);
DROP FUNCTION IF EXISTS update_vehicle_km_cycle();
DROP FUNCTION IF EXISTS close_expired_km_cycles();

-- Recreate functions with proper security settings
CREATE OR REPLACE FUNCTION get_current_km_cycle(p_vehicle_id UUID)
RETURNS TABLE(
  cycle_id UUID,
  cycle_start_date DATE,
  cycle_end_date DATE,
  km_inicial INTEGER,
  limite_km_mensal INTEGER,
  km_rodados INTEGER,
  days_remaining INTEGER,
  percentage_used NUMERIC
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_created_date DATE;
  v_current_km INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_cycle_record RECORD;
BEGIN
  -- Get vehicle creation date and current km
  SELECT created_at::DATE, quilometragem_atual 
  INTO v_created_date, v_current_km
  FROM vehicles 
  WHERE id = p_vehicle_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate current cycle dates based on vehicle creation date
  -- Find which month cycle we're in
  SELECT 
    v_created_date + (EXTRACT(YEAR FROM AGE(v_current_date, v_created_date)) * 12 + 
                     EXTRACT(MONTH FROM AGE(v_current_date, v_created_date)))::INTEGER * INTERVAL '1 month',
    v_created_date + (EXTRACT(YEAR FROM AGE(v_current_date, v_created_date)) * 12 + 
                     EXTRACT(MONTH FROM AGE(v_current_date, v_created_date)) + 1)::INTEGER * INTERVAL '1 month' - INTERVAL '1 day'
  INTO v_cycle_start, v_cycle_end;
  
  -- Get or create current cycle
  SELECT * INTO v_cycle_record
  FROM vehicle_km_cycles
  WHERE vehicle_id = p_vehicle_id 
    AND cycle_start_date = v_cycle_start
    AND status = 'ativo';
    
  IF NOT FOUND THEN
    -- Get previous cycle's final km or use vehicle's initial km
    DECLARE
      v_previous_km INTEGER := 0;
      v_limit INTEGER := 2000;
    BEGIN
      -- Get limit from vehicle
      SELECT quilometragem_maxima_mensal INTO v_limit 
      FROM vehicles WHERE id = p_vehicle_id;
      
      -- Get previous cycle final km
      SELECT COALESCE(km_final, km_inicial) INTO v_previous_km
      FROM vehicle_km_cycles 
      WHERE vehicle_id = p_vehicle_id 
        AND cycle_end_date < v_cycle_start 
      ORDER BY cycle_end_date DESC 
      LIMIT 1;
      
      IF v_previous_km IS NULL THEN
        -- First cycle, use vehicle's creation km
        SELECT quilometragem_atual INTO v_previous_km 
        FROM vehicles 
        WHERE id = p_vehicle_id;
      END IF;
      
      -- Create new cycle
      INSERT INTO vehicle_km_cycles (
        vehicle_id, cycle_start_date, cycle_end_date, 
        km_inicial, limite_km_mensal, km_rodados
      ) VALUES (
        p_vehicle_id, v_cycle_start, v_cycle_end,
        v_previous_km, COALESCE(v_limit, 2000), GREATEST(0, v_current_km - v_previous_km)
      )
      RETURNING * INTO v_cycle_record;
    END;
  ELSE
    -- Update existing cycle
    UPDATE vehicle_km_cycles 
    SET km_rodados = GREATEST(0, v_current_km - km_inicial),
        updated_at = now()
    WHERE id = v_cycle_record.id
    RETURNING * INTO v_cycle_record;
  END IF;
  
  -- Return cycle information
  RETURN QUERY SELECT 
    v_cycle_record.id,
    v_cycle_record.cycle_start_date,
    v_cycle_record.cycle_end_date,
    v_cycle_record.km_inicial,
    v_cycle_record.limite_km_mensal,
    v_cycle_record.km_rodados,
    (v_cycle_record.cycle_end_date - v_current_date)::INTEGER,
    CASE 
      WHEN v_cycle_record.limite_km_mensal > 0 
      THEN ROUND((v_cycle_record.km_rodados::NUMERIC / v_cycle_record.limite_km_mensal::NUMERIC) * 100, 2)
      ELSE 0::NUMERIC
    END;
END;
$$;

CREATE OR REPLACE FUNCTION update_vehicle_km_cycle()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update current cycle when vehicle km changes
  PERFORM get_current_km_cycle(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION close_expired_km_cycles()
RETURNS INTEGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  closed_count INTEGER := 0;
BEGIN
  UPDATE vehicle_km_cycles 
  SET status = 'fechado',
      km_final = km_inicial + km_rodados,
      updated_at = now()
  WHERE status = 'ativo' 
    AND cycle_end_date < CURRENT_DATE;
    
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trigger_update_vehicle_km_cycle
  AFTER UPDATE OF quilometragem_atual ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_km_cycle();
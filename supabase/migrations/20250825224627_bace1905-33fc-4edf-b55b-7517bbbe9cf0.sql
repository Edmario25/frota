-- Corrigir a função get_current_km_cycle para calcular corretamente os km rodados
CREATE OR REPLACE FUNCTION public.get_current_km_cycle(p_vehicle_id uuid)
 RETURNS TABLE(cycle_id uuid, cycle_start_date date, cycle_end_date date, km_inicial integer, limite_km_mensal integer, km_rodados integer, days_remaining integer, percentage_used numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_date DATE;
  v_current_km INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_cycle_record RECORD;
BEGIN
  -- Get vehicle creation date and current km
  SELECT v.created_at::DATE, v.quilometragem_atual 
  INTO v_created_date, v_current_km
  FROM vehicles v
  WHERE v.id = p_vehicle_id;
  
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
  SELECT vkc.* INTO v_cycle_record
  FROM vehicle_km_cycles vkc
  WHERE vkc.vehicle_id = p_vehicle_id 
    AND vkc.cycle_start_date = v_cycle_start
    AND vkc.status = 'ativo';
    
  IF NOT FOUND THEN
    -- Get previous cycle's final km or use vehicle's initial km
    DECLARE
      v_previous_km INTEGER := 0;
      v_limit INTEGER := 2000;
    BEGIN
      -- Get limit from vehicle
      SELECT v.quilometragem_maxima_mensal INTO v_limit 
      FROM vehicles v WHERE v.id = p_vehicle_id;
      
      -- Get previous cycle final km
      SELECT COALESCE(vkc_prev.km_final, vkc_prev.km_inicial) INTO v_previous_km
      FROM vehicle_km_cycles vkc_prev
      WHERE vkc_prev.vehicle_id = p_vehicle_id 
        AND vkc_prev.cycle_end_date < v_cycle_start 
      ORDER BY vkc_prev.cycle_end_date DESC 
      LIMIT 1;
      
      -- If no previous cycle found, use current km as starting point
      IF v_previous_km IS NULL THEN
        v_previous_km := v_current_km;
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
    -- Update existing cycle with current km calculation
    UPDATE vehicle_km_cycles 
    SET km_rodados = GREATEST(0, v_current_km - km_inicial),
        updated_at = now()
    WHERE id = v_cycle_record.id
    RETURNING * INTO v_cycle_record;
  END IF;
  
  -- Return cycle information with recalculated km_rodados
  RETURN QUERY SELECT 
    v_cycle_record.id,
    v_cycle_record.cycle_start_date,
    v_cycle_record.cycle_end_date,
    v_cycle_record.km_inicial,
    v_cycle_record.limite_km_mensal,
    GREATEST(0, v_current_km - v_cycle_record.km_inicial) as km_rodados_calculated,
    (v_cycle_record.cycle_end_date - v_current_date)::INTEGER,
    CASE 
      WHEN v_cycle_record.limite_km_mensal > 0 
      THEN ROUND((GREATEST(0, v_current_km - v_cycle_record.km_inicial)::NUMERIC / v_cycle_record.limite_km_mensal::NUMERIC) * 100, 2)
      ELSE 0::NUMERIC
    END;
END;
$function$;
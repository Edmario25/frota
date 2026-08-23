CREATE OR REPLACE FUNCTION public.registrar_ponto_totem(p_employee_id uuid, p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  employee_record record;
  last_type text;
  next_type text;
  registered_at timestamptz := now();
BEGIN
  IF p_employee_id IS NULL OR p_obra_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário e obra são obrigatórios';
  END IF;

  SELECT e.nome, e.foto_url, e.status, c.nome AS cargo
    INTO employee_record
  FROM public.employees e
  LEFT JOIN public.cargos c ON c.id = e.cargo_id
  WHERE e.id = p_employee_id;

  IF NOT FOUND OR employee_record.status <> 'ativo' THEN
    RAISE EXCEPTION 'Funcionário não encontrado ou inativo';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.employee_obra_assignments a
            WHERE a.employee_id = p_employee_id AND a.obra_id = p_obra_id)
    OR EXISTS (SELECT 1 FROM public.obra_funcionarios a
               WHERE a.employee_id = p_employee_id AND a.obra_id = p_obra_id AND a.status = true)
  ) THEN
    RAISE EXCEPTION 'Funcionário não está vinculado a esta obra';
  END IF;

  -- Serializa leituras simultâneas do mesmo crachá para impedir duas entradas.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_employee_id::text, 0)
  );

  IF EXISTS (SELECT 1 FROM public.employee_ponto_qr p
             WHERE p.employee_id = p_employee_id
               AND p.registrado_em > registered_at - interval '30 seconds') THEN
    RAISE EXCEPTION 'Ponto já registrado nos últimos 30 segundos';
  END IF;

  SELECT p.tipo INTO last_type
  FROM public.employee_ponto_qr p
  WHERE p.employee_id = p_employee_id
    AND (p.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date =
        (registered_at AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY p.registrado_em DESC LIMIT 1;

  next_type := CASE WHEN last_type = 'entrada' THEN 'saida' ELSE 'entrada' END;

  INSERT INTO public.employee_ponto_qr
    (employee_id, obra_id, tipo, registrado_por, metodo, registrado_em)
  VALUES (p_employee_id, p_obra_id, next_type, NULL, 'qr', registered_at);

  RETURN jsonb_build_object(
    'nome', employee_record.nome, 'foto_url', employee_record.foto_url,
    'cargo', coalesce(employee_record.cargo, ''), 'tipo', next_type,
    'registrado_em', registered_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.registrar_ponto_totem(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_ponto_totem(uuid, uuid) TO anon, authenticated;

DROP POLICY IF EXISTS totem_read_cargos ON public.cargos;
DROP POLICY IF EXISTS totem_read_employees ON public.employees;
DROP POLICY IF EXISTS totem_read_ponto_qr ON public.employee_ponto_qr;
DROP POLICY IF EXISTS totem_insert_ponto_qr ON public.employee_ponto_qr;

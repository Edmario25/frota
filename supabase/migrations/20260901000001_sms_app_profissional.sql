-- SMS Campo: resolução segura do novo crachá revogável.
-- O técnico só consegue consultar pessoas que compartilham uma obra ativa com ele.

CREATE OR REPLACE FUNCTION public.resolver_cracha_sms(p_cracha text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operador uuid;
  v_token uuid;
  v_employee public.employees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_employee_app_access('sms') THEN
    RAISE EXCEPTION 'Acesso ao App SMS não autorizado';
  END IF;

  SELECT id INTO v_operador
  FROM public.employees
  WHERE user_id = auth.uid() AND status = 'ativo'
  LIMIT 1;

  IF v_operador IS NULL THEN
    RAISE EXCEPTION 'Funcionário operador não encontrado ou inativo';
  END IF;

  BEGIN
    v_token := split_part(trim(p_cracha), ':', 3)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Formato de crachá inválido';
  END;

  IF trim(p_cracha) !~* '^APICE:1:[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'Crachá antigo ou inválido. Gere um novo crachá no sistema';
  END IF;

  SELECT e.* INTO v_employee
  FROM public.employee_ponto_crachas c
  JOIN public.employees e ON e.id = c.employee_id
  WHERE c.token = v_token
    AND e.status = 'ativo'
    AND EXISTS (
      SELECT 1
      FROM public.obra_funcionarios alvo
      JOIN public.obra_funcionarios operador
        ON operador.obra_id = alvo.obra_id
       AND operador.employee_id = v_operador
       AND operador.status = true
      WHERE alvo.employee_id = e.id
        AND alvo.status = true
    )
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'Crachá não encontrado ou funcionário fora das obras autorizadas';
  END IF;

  RETURN jsonb_build_object('employee_id', v_employee.id, 'nome', v_employee.nome);
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_cracha_sms(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_cracha_sms(text) TO authenticated;

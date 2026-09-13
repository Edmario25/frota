-- Une o cadastro funcional à estrutura Departamento > Setor.
-- Cargo continua sendo uma função e não é utilizado como unidade organizacional.

CREATE OR REPLACE FUNCTION public.sincronizar_lotacao_organizacional(
  p_employee_id uuid,
  p_departamento_id uuid,
  p_setor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
BEGIN
  IF NOT public.can_manage_employee_record(p_employee_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a estrutura organizacional deste colaborador';
  END IF;

  IF p_setor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.departamento_setores
    WHERE id=p_setor_id AND departamento_id=p_departamento_id AND ativo
  ) THEN
    RAISE EXCEPTION 'O setor selecionado não pertence ao departamento informado';
  END IF;

  UPDATE public.employees
  SET departamento_id=p_departamento_id, updated_at=now()
  WHERE id=p_employee_id;

  UPDATE public.employee_department_assignments
  SET principal=false,
      valido_ate=COALESCE(valido_ate, GREATEST(valido_de, current_date - 1))
  WHERE employee_id=p_employee_id AND principal;

  INSERT INTO public.employee_department_assignments(
    employee_id, departamento_id, setor_id, principal, valido_de
  ) VALUES (p_employee_id,p_departamento_id,p_setor_id,true,current_date)
  ON CONFLICT (employee_id, departamento_id, (COALESCE(setor_id,'00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET
    principal=true,
    valido_ate=NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_lotacao_organizacional(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_lotacao_organizacional(uuid,uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.sincronizar_lotacao_organizacional(uuid,uuid,uuid) IS
  'Sincroniza o departamento principal e o setor do colaborador no cadastro funcional.';

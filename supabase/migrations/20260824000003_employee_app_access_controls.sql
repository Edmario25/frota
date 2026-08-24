-- Permissoes independentes para cada aplicativo operacional.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS acesso_app_campo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_app_almoxarifado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.acesso_app_campo IS 'Autoriza acesso ao App Apontador de Campo.';
COMMENT ON COLUMN public.employees.acesso_app_almoxarifado IS 'Autoriza acesso ao App Almoxarifado.';

CREATE OR REPLACE FUNCTION public.has_employee_app_access(p_app text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.get_user_role(auth.uid()) = 'admin' THEN true
    WHEN p_app = 'motorista' THEN COALESCE(employee.acesso_app_motorista, false)
    WHEN p_app = 'sms' THEN COALESCE(employee.acesso_app_sms, false)
    WHEN p_app = 'campo' THEN COALESCE(employee.acesso_app_campo, false)
    WHEN p_app = 'almoxarifado' THEN COALESCE(employee.acesso_app_almoxarifado, false)
    ELSE false
  END
  FROM (SELECT 1) source
  LEFT JOIN public.employees employee ON employee.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.has_employee_app_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_employee_app_access(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_employee_professional(
  p_employee jsonb,
  p_password text DEFAULT NULL,
  p_obra_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_result jsonb;
  v_user_id uuid;
  v_employee_id uuid;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin', 'gestor_contrato', 'gestor_frota') THEN
    RAISE EXCEPTION 'Sem permissao para admitir funcionarios';
  END IF;
  IF length(trim(COALESCE(p_employee->>'nome', ''))) < 2
     OR length(trim(COALESCE(p_employee->>'cpf', ''))) < 11
     OR position('@' IN COALESCE(p_employee->>'email', '')) < 2 THEN
    RAISE EXCEPTION 'Nome, CPF ou e-mail invalido';
  END IF;

  IF NULLIF(p_password, '') IS NOT NULL THEN
    v_auth_result := public.create_auth_user(
      p_employee->>'email', p_password, p_employee->>'nome',
      COALESCE(p_employee->>'tipo_acesso', 'funcionario')
    );
    IF NOT COALESCE((v_auth_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_auth_result->>'error', 'Falha ao criar conta');
    END IF;
    v_user_id := (v_auth_result->>'user_id')::uuid;
  END IF;

  INSERT INTO public.employees (
    user_id, nome, cpf, email, telefone, cargo_id, departamento_id,
    data_admissao, status, tipo_acesso, escala_tipo_id, foto_url,
    acesso_app_motorista, acesso_app_sms, acesso_app_campo, acesso_app_almoxarifado
  ) VALUES (
    v_user_id, trim(p_employee->>'nome'), trim(p_employee->>'cpf'),
    lower(trim(p_employee->>'email')), NULLIF(trim(p_employee->>'telefone'), ''),
    NULLIF(p_employee->>'cargo_id', '')::uuid,
    NULLIF(p_employee->>'departamento_id', '')::uuid,
    NULLIF(p_employee->>'data_admissao', '')::date,
    COALESCE(NULLIF(p_employee->>'status', ''), 'ativo')::public.employee_status,
    COALESCE(NULLIF(p_employee->>'tipo_acesso', ''), 'funcionario'),
    NULLIF(p_employee->>'escala_tipo_id', '')::uuid,
    NULLIF(p_employee->>'foto_url', ''),
    COALESCE((p_employee->>'acesso_app_motorista')::boolean, false),
    COALESCE((p_employee->>'acesso_app_sms')::boolean, false),
    COALESCE((p_employee->>'acesso_app_campo')::boolean, false),
    COALESCE((p_employee->>'acesso_app_almoxarifado')::boolean, false)
  ) RETURNING id INTO v_employee_id;

  IF p_obra_id IS NOT NULL THEN
    INSERT INTO public.obra_funcionarios (obra_id, employee_id, funcao_obra, data_entrada, status)
    VALUES (p_obra_id, v_employee_id, 'Colaborador',
      COALESCE(NULLIF(p_employee->>'data_admissao', '')::date, CURRENT_DATE), true);
    INSERT INTO public.employee_obra_assignments (employee_id, obra_id, created_by)
    VALUES (v_employee_id, p_obra_id, auth.uid())
    ON CONFLICT (employee_id, obra_id) DO NOTHING;
  END IF;

  IF v_user_id IS NOT NULL THEN PERFORM public.sync_employee_access_role(v_employee_id); END IF;
  RETURN jsonb_build_object('success', true, 'employee_id', v_employee_id, 'user_id', v_user_id);
END;
$$;

-- Mesmo conhecendo a RPC, um usuario sem permissao nao registra saidas no balcao.
CREATE OR REPLACE FUNCTION public.fn_validar_operador_entrega_almoxarifado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
BEGIN
  IF NOT public.has_employee_app_access('almoxarifado') THEN
    RAISE EXCEPTION 'Acesso ao App Almoxarifado nao autorizado.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_operador_entrega_almox ON public.almoxarifado_entregas;
CREATE TRIGGER trg_validar_operador_entrega_almox
  BEFORE INSERT ON public.almoxarifado_entregas
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_operador_entrega_almoxarifado();

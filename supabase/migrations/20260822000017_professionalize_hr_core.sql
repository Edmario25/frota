-- Profissionaliza o núcleo de RH: segregação de dados, perfil único e
-- desligamento auditável sem exclusão do histórico do colaborador.

CREATE OR REPLACE FUNCTION public.can_access_hr_core(target_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    target_employee_id = public.get_user_employee_id()
    OR public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_hr_core(target_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota');
$$;

REVOKE ALL ON FUNCTION public.can_access_hr_core(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_hr_core(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_hr_core(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_hr_core(uuid) TO authenticated;

DROP POLICY IF EXISTS rh_select_scoped ON public.employee_dados_rh;
DROP POLICY IF EXISTS rh_manage_scoped ON public.employee_dados_rh;
CREATE POLICY rh_select_professional
  ON public.employee_dados_rh FOR SELECT TO authenticated
  USING (public.can_access_hr_core(employee_id));
CREATE POLICY rh_manage_professional
  ON public.employee_dados_rh FOR ALL TO authenticated
  USING (public.can_manage_hr_core(employee_id))
  WITH CHECK (public.can_manage_hr_core(employee_id));

DROP POLICY IF EXISTS employee_leave_select_scoped ON public.employee_ferias;
DROP POLICY IF EXISTS employee_leave_manage_scoped ON public.employee_ferias;
CREATE POLICY employee_leave_select_professional
  ON public.employee_ferias FOR SELECT TO authenticated
  USING (
    public.can_access_hr_core(employee_id)
    OR (
      public.get_user_role(auth.uid()) = 'gestor_obra'
      AND public.can_access_employee_record(employee_id)
    )
  );
CREATE POLICY employee_leave_manage_professional
  ON public.employee_ferias FOR ALL TO authenticated
  USING (
    public.can_manage_hr_core(employee_id)
    OR (
      public.get_user_role(auth.uid()) = 'gestor_obra'
      AND public.can_manage_employee_record(employee_id)
    )
  )
  WITH CHECK (
    public.can_manage_hr_core(employee_id)
    OR (
      public.get_user_role(auth.uid()) = 'gestor_obra'
      AND public.can_manage_employee_record(employee_id)
    )
  );

-- Um usuário possui exatamente um perfil no modelo atual.
WITH ranked_roles AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id ORDER BY created_at DESC, id DESC
         ) AS position
  FROM public.user_roles
)
DELETE FROM public.user_roles role
USING ranked_roles ranked
WHERE role.id = ranked.id AND ranked.position > 1;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_key;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

CREATE TABLE IF NOT EXISTS public.employee_obra_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  obra_id uuid NOT NULL REFERENCES public.obras(id),
  assigned_at timestamptz,
  assigned_by uuid REFERENCES auth.users(id),
  ended_at timestamptz NOT NULL DEFAULT now(),
  ended_by uuid REFERENCES auth.users(id),
  reason text NOT NULL
);

ALTER TABLE public.employee_obra_assignment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_assignment_history_select
  ON public.employee_obra_assignment_history FOR SELECT TO authenticated
  USING (public.can_access_hr_core(employee_id));
CREATE POLICY employee_assignment_history_insert
  ON public.employee_obra_assignment_history FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_hr_core(employee_id));

CREATE OR REPLACE FUNCTION public.sync_employee_access_role(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_role public.app_role;
BEGIN
  IF NOT public.can_manage_employee_record(p_employee_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o perfil deste funcionário';
  END IF;

  SELECT employee.user_id,
         CASE cargo.nivel_acesso
           WHEN 'gestor_geral' THEN 'gestor_contrato'::public.app_role
           WHEN 'colaborador' THEN 'funcionario'::public.app_role
           ELSE cargo.nivel_acesso::public.app_role
         END
  INTO v_user_id, v_role
  FROM public.employees employee
  JOIN public.cargos cargo ON cargo.id = employee.cargo_id
  WHERE employee.id = p_employee_id;

  IF v_user_id IS NULL OR v_role IS NULL THEN
    RETURN jsonb_build_object('success', true, 'updated', false);
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_role)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role, created_at = now();

  RETURN jsonb_build_object('success', true, 'updated', true, 'role', v_role);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_access_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_access_role(uuid) TO authenticated;

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
    RAISE EXCEPTION 'Sem permissão para admitir funcionários';
  END IF;
  IF length(trim(COALESCE(p_employee->>'nome', ''))) < 2
     OR length(trim(COALESCE(p_employee->>'cpf', ''))) < 11
     OR position('@' IN COALESCE(p_employee->>'email', '')) < 2 THEN
    RAISE EXCEPTION 'Nome, CPF ou e-mail inválido';
  END IF;

  IF NULLIF(p_password, '') IS NOT NULL THEN
    v_auth_result := public.create_auth_user(
      p_employee->>'email',
      p_password,
      p_employee->>'nome',
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
    acesso_app_motorista, acesso_app_sms
  ) VALUES (
    v_user_id,
    trim(p_employee->>'nome'),
    trim(p_employee->>'cpf'),
    lower(trim(p_employee->>'email')),
    NULLIF(trim(p_employee->>'telefone'), ''),
    NULLIF(p_employee->>'cargo_id', '')::uuid,
    NULLIF(p_employee->>'departamento_id', '')::uuid,
    NULLIF(p_employee->>'data_admissao', '')::date,
    COALESCE(NULLIF(p_employee->>'status', ''), 'ativo')::public.employee_status,
    COALESCE(NULLIF(p_employee->>'tipo_acesso', ''), 'funcionario'),
    NULLIF(p_employee->>'escala_tipo_id', '')::uuid,
    NULLIF(p_employee->>'foto_url', ''),
    COALESCE((p_employee->>'acesso_app_motorista')::boolean, false),
    COALESCE((p_employee->>'acesso_app_sms')::boolean, false)
  ) RETURNING id INTO v_employee_id;

  IF p_obra_id IS NOT NULL THEN
    INSERT INTO public.obra_funcionarios (
      obra_id, employee_id, funcao_obra, data_entrada, status
    ) VALUES (
      p_obra_id,
      v_employee_id,
      'Colaborador',
      COALESCE(NULLIF(p_employee->>'data_admissao', '')::date, CURRENT_DATE),
      true
    );
    INSERT INTO public.employee_obra_assignments (employee_id, obra_id, created_by)
    VALUES (v_employee_id, p_obra_id, auth.uid())
    ON CONFLICT (employee_id, obra_id) DO NOTHING;
  END IF;

  IF v_user_id IS NOT NULL THEN
    PERFORM public.sync_employee_access_role(v_employee_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', v_employee_id,
    'user_id', v_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_employee_professional(jsonb, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_employee_professional(jsonb, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.terminate_employee(
  p_employee_id uuid,
  p_termination_date date,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.can_manage_hr_core(p_employee_id) THEN
    RAISE EXCEPTION 'Sem permissão para desligar este funcionário';
  END IF;
  IF p_termination_date IS NULL OR length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Informe a data e o motivo do desligamento';
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;

  INSERT INTO public.employee_dados_rh (
    employee_id, data_demissao, motivo_demissao, updated_at
  ) VALUES (
    p_employee_id, p_termination_date, trim(p_reason), now()
  )
  ON CONFLICT (employee_id) DO UPDATE
    SET data_demissao = EXCLUDED.data_demissao,
        motivo_demissao = EXCLUDED.motivo_demissao,
        updated_at = now();

  INSERT INTO public.employee_obra_assignment_history (
    employee_id, obra_id, assigned_at, assigned_by, ended_by, reason
  )
  SELECT employee_id, obra_id, created_at, created_by, auth.uid(), trim(p_reason)
  FROM public.employee_obra_assignments
  WHERE employee_id = p_employee_id;

  DELETE FROM public.employee_obra_assignments
  WHERE employee_id = p_employee_id;

  UPDATE public.obra_funcionarios
  SET status = false, data_saida = p_termination_date, updated_at = now()
  WHERE employee_id = p_employee_id AND status = true;

  UPDATE public.employees
  SET status = 'inativo', updated_at = now()
  WHERE id = p_employee_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET banned_until = 'infinity'::timestamptz, updated_at = now()
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', p_employee_id,
    'access_revoked', v_user_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.terminate_employee(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminate_employee(uuid, date, text) TO authenticated;

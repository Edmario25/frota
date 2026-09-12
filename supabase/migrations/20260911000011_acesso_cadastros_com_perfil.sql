-- Continuação da 20260911000010 (dividida para caber no SQL Editor).
-- Cadastros de usuário e funcionário já nascem com perfil de acesso.

-- ─── 6. Cadastros já nascem com perfil ──────────────────────────────────────
-- Todo usuário novo começa só com os próprios registros.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (new.id, COALESCE(new.raw_user_meta_data ->> 'name', new.email), new.email)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,justificativa)
  SELECT new.id, ap.id, 'proprio', 'Perfil inicial do cadastro'
  FROM public.access_profiles ap WHERE ap.nome='Funcionario'
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_auth_user(
  p_email       text,
  p_password    text,
  p_nome        text,
  p_tipo_acesso text DEFAULT 'funcionario'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT (public.access_is_admin() OR public.pode_geral('colaboradores.criar')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para criar usuários');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'E-mail já cadastrado no sistema');
  END IF;

  IF length(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Senha deve ter pelo menos 6 caracteres');
  END IF;

  v_user_id := gen_random_uuid();

  -- O gatilho handle_new_user cria o profile e o perfil de acesso inicial
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data,
    is_super_admin, is_sso_user, is_anonymous,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    email_change_token_current, email_change_confirm_status
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('name', p_nome),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    false, false, false,
    now(), now(),
    '', '', '', '', '', 0
  );

  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (v_user_id, p_nome, lower(trim(p_email)))
  ON CONFLICT (user_id) DO UPDATE
    SET nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        updated_at = now();

  -- Acesso de empresa inteira só quem administra acessos pode conceder
  IF p_tipo_acesso IN ('gestor_contrato','gestor_geral') AND public.access_is_admin() THEN
    INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,justificativa)
    SELECT v_user_id, ap.id, 'empresa', 'Cadastro com acesso de gestor de contrato'
    FROM public.access_profiles ap WHERE ap.nome='Gestor de Contrato'
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id::text,
    'message', 'Usuário criado com sucesso'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$func$;

-- O cargo sugere o perfil inicial; conceder mais ou retirar é no Controle de Acesso
CREATE OR REPLACE FUNCTION public.sync_employee_access_role(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_nivel text;
BEGIN
  IF NOT public.can_manage_employee_record(p_employee_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o perfil deste funcionário';
  END IF;

  SELECT e.user_id, c.nivel_acesso::text INTO v_user_id, v_nivel
  FROM public.employees e LEFT JOIN public.cargos c ON c.id=e.cargo_id
  WHERE e.id=p_employee_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'updated', false);
  END IF;

  INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,justificativa)
  SELECT v_user_id, ap.id, 'proprio', 'Perfil inicial do cadastro'
  FROM public.access_profiles ap WHERE ap.nome='Funcionario'
  ON CONFLICT DO NOTHING;

  IF v_nivel IN ('gestor_contrato','gestor_geral') AND public.access_is_admin() THEN
    INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,justificativa)
    SELECT v_user_id, ap.id, 'empresa', 'Automático: cargo de gestor de contrato'
    FROM public.access_profiles ap WHERE ap.nome='Gestor de Contrato'
    ON CONFLICT DO NOTHING;
  ELSIF v_nivel='gestor_obra' THEN
    INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,scope_id,justificativa)
    SELECT DISTINCT v_user_id, ap.id, 'obra', v.obra_id, 'Automático: vínculo com a obra'
    FROM public.access_profiles ap
    JOIN (
      SELECT obra_id FROM public.employee_obra_assignments WHERE employee_id=p_employee_id
      UNION SELECT obra_id FROM public.obra_funcionarios WHERE employee_id=p_employee_id AND status=true
    ) v ON true
    WHERE ap.nome='Gestor de Obra'
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', true);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_access_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_access_role(uuid) TO authenticated;


-- Execute este arquivo completo no Supabase Studio > SQL Editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  v_role    text;
  v_has_perm boolean;
BEGIN
  -- Verificar permissão diretamente (sem depender de outras funções)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('gestor_contrato', 'admin', 'gestor_frota')
  ) INTO v_has_perm;

  IF NOT v_has_perm THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para criar usuários');
  END IF;

  -- Verificar e-mail duplicado
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'E-mail já cadastrado no sistema');
  END IF;

  -- Validar senha
  IF length(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Senha deve ter pelo menos 6 caracteres');
  END IF;

  -- Mapear tipo_acesso para role
  v_role := CASE p_tipo_acesso
    WHEN 'gestor_contrato' THEN 'gestor_contrato'
    WHEN 'gestor_geral'    THEN 'gestor_contrato'
    WHEN 'gestor_obra'     THEN 'gestor_obra'
    WHEN 'colaborador'     THEN 'funcionario'
    ELSE 'funcionario'
  END;

  v_user_id := gen_random_uuid();

  -- Criar usuário no auth
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

  -- Criar profile
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (v_user_id, p_nome, lower(trim(p_email)))
  ON CONFLICT (user_id) DO UPDATE
    SET nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        updated_at = now();

  -- Definir role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_role::public.app_role)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id::text,
    'message', 'Usuário criado com sucesso'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.create_auth_user(text, text, text, text) TO authenticated;

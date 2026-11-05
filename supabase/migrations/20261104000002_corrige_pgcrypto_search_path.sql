-- ============================================================================
-- "function gen_salt(unknown) does not exist" ao criar usuário
--
-- gen_salt e crypt vêm do pgcrypto. No Supabase o pgcrypto é instalado no
-- schema `extensions`, não em `public`. As funções que criam usuário declaram
-- SET search_path = public, auth — que não inclui `extensions` — então, dentro
-- delas, gen_salt simplesmente não existe.
--
-- O erro só aparecia na hora de salvar porque create_auth_user tem um
-- EXCEPTION WHEN OTHERS que devolve o SQLERRM como mensagem de toast: a tela
-- aceitava o formulário inteiro e falhava no fim, sem criar nada.
--
-- Esta migração resolve nos três níveis:
--   1. garante o pgcrypto instalado;
--   2. recria create_auth_user com o schema da extensão no search_path;
--   3. varre as demais funções que usam crypt/gen_salt e corrige o search_path
--      delas também — update_user_password existe no banco mas não está em
--      nenhuma migração, então não dá para reescrevê-la às cegas.
--
-- Idempotente. Rodar inteiro.
-- ============================================================================

-- ─── 1. pgcrypto disponível ─────────────────────────────────────────────────

DO $$
DECLARE v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_schema IS NULL THEN
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    RAISE NOTICE 'pgcrypto instalado no schema extensions.';
  ELSE
    RAISE NOTICE 'pgcrypto já instalado no schema %.', v_schema;
  END IF;
END $$;

GRANT USAGE ON SCHEMA extensions TO authenticated, service_role;

-- ─── 2. create_auth_user enxergando o pgcrypto ──────────────────────────────
-- Mesmo corpo de 20260911000011, com duas mudanças: `extensions` entra no
-- search_path e as chamadas do pgcrypto são qualificadas. A qualificação é o
-- que realmente garante o resultado — search_path pode ser alterado depois por
-- outra migração de hardening, e aí o erro voltaria calado.

CREATE OR REPLACE FUNCTION public.create_auth_user(
  p_email       text,
  p_password    text,
  p_nome        text,
  p_tipo_acesso text DEFAULT 'funcionario'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $func$
DECLARE
  v_user_id uuid;
  v_hash    text;
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

  -- Hash antes do INSERT: se o pgcrypto não estiver acessível, a mensagem sai
  -- daqui dizendo o que é, em vez de vazar "gen_salt(unknown) does not exist".
  BEGIN
    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  EXCEPTION WHEN undefined_function THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'pgcrypto indisponível no banco: avise o administrador do sistema.'
    );
  END;

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
    v_hash,
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

GRANT EXECUTE ON FUNCTION public.create_auth_user(text,text,text,text) TO authenticated;

-- ─── 3. As demais funções que usam pgcrypto ─────────────────────────────────
-- update_user_password está no banco mas não em nenhuma migração deste repo;
-- reescrevê-la de memória seria pior do que ajustar só o search_path dela.
-- Acrescentar o schema da extensão ao final do search_path não muda a
-- resolução de nenhum nome que já funcionava.

DO $$
DECLARE
  r          record;
  v_schema   text;
  v_atual    text;
  v_corrigidas integer := 0;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_schema IS NULL OR v_schema = 'public' THEN
    RAISE NOTICE 'pgcrypto em %, nada a ajustar.', COALESCE(v_schema, 'lugar nenhum');
    RETURN;
  END IF;

  FOR r IN
    SELECT p.oid, p.proname, n.nspname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proconfig
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prosecdef                             -- só SECURITY DEFINER
      AND  p.prosrc ~* '(gen_salt|crypt)\s*\('
      AND  p.proname <> 'create_auth_user'         -- já recriada acima
  LOOP
    v_atual := COALESCE(
      (SELECT c FROM unnest(r.proconfig) AS c WHERE c LIKE 'search_path=%'),
      ''
    );

    -- Sem search_path fixo a função já resolve pelo caminho do chamador.
    IF v_atual = '' THEN CONTINUE; END IF;
    IF v_atual ~ ('(^|[=,[:space:]])' || v_schema || '([,[:space:]]|$)') THEN CONTINUE; END IF;

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = %s',
      r.proname, r.args,
      substring(v_atual from 'search_path=(.*)') || ', ' || quote_ident(v_schema)
    );
    v_corrigidas := v_corrigidas + 1;
    RAISE NOTICE 'search_path ajustado em public.%(%)', r.proname, r.args;
  END LOOP;

  RAISE NOTICE 'Funções com pgcrypto corrigidas: %', v_corrigidas;
END $$;

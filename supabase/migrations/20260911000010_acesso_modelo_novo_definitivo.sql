-- ─── Modelo novo em definitivo: o papel antigo (user_roles) deixa de valer ─
--
-- Decisão do usuário (11/09/2026): todo acesso passa a vir dos perfis.
--
-- Ponte para as políticas ainda não reescritas: centenas delas perguntam
-- get_user_role(...) IN ('admin', 'gestor_obra', ...). Em vez de reescrever
-- todas de uma vez, get_user_role passa a DERIVAR o papel do perfil da pessoa
-- (access_profiles.papel_equivalente). A tabela user_roles não é mais lida.
-- As políticas serão reescritas módulo a módulo com pode(...).
--
-- Também:
--   * as 8 regras auxiliares passam para o modelo novo (access_config);
--   * dado sensível de RH só com o perfil de RH (Gestor de Contrato perde);
--   * auditoria só para quem tem auditoria.visualizar (Gestor de Contrato perde,
--     como na regra antiga, que liberava só o admin);
--   * cadastro de usuário e de funcionário já cria o perfil;
--   * vincular/desvincular obra na tela de usuários concede/revoga o perfil
--     de gestor de obra naquela obra.

-- ─── 1. Papel equivalente de cada perfil ────────────────────────────────────
ALTER TABLE public.access_profiles
  ADD COLUMN IF NOT EXISTS papel_equivalente public.app_role NOT NULL DEFAULT 'funcionario';

UPDATE public.access_profiles SET papel_equivalente = (CASE nome
  WHEN 'Administrador do Sistema' THEN 'admin'
  WHEN 'Administrador Tecnico'    THEN 'gestor_contrato'
  WHEN 'Gestor de Contrato'       THEN 'gestor_contrato'
  WHEN 'Gestor de Obra'           THEN 'gestor_obra'
  WHEN 'Tecnico SMS'              THEN 'tecnico_sms'
  WHEN 'Gestor SMS'               THEN 'tecnico_sms'
  ELSE 'funcionario' END)::public.app_role
WHERE sistema;

COMMENT ON COLUMN public.access_profiles.papel_equivalente IS
  'Papel antigo que as políticas ainda não reescritas enxergam para quem tem este perfil. Só vale como papel de empresa quando a atribuição é da empresa.';

-- ─── 2. Ajustes de perfis ───────────────────────────────────────────────────
-- Auditoria mostra dados antigos e novos de qualquer tabela, inclusive de RH
DELETE FROM public.access_profile_permissions app
USING public.access_profiles p, public.access_permissions x
WHERE app.profile_id=p.id AND app.permission_id=x.id
  AND p.nome='Gestor de Contrato' AND x.modulo='auditoria';

-- Técnico SMS migrado valia para a empresa; passa a valer nas obras vinculadas
INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,scope_id,justificativa)
SELECT DISTINCT eap.user_id, eap.profile_id, 'obra', v.obra_id, 'Migração automática: obra vinculada ao funcionário'
FROM public.employee_access_profiles eap
JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.nome='Tecnico SMS'
JOIN public.employees e ON e.user_id=eap.user_id
JOIN (
  SELECT employee_id,obra_id FROM public.employee_obra_assignments
  UNION SELECT employee_id,obra_id FROM public.obra_funcionarios WHERE status=true
) v ON v.employee_id=e.id
WHERE eap.scope_type='empresa' AND eap.revogado_em IS NULL
  AND eap.justificativa LIKE 'Migracao automatica do perfil legado%'
ON CONFLICT DO NOTHING;

UPDATE public.employee_access_profiles eap SET revogado_em=now()
FROM public.access_profiles ap
WHERE ap.id=eap.profile_id AND ap.nome='Tecnico SMS' AND eap.scope_type='empresa'
  AND eap.revogado_em IS NULL AND eap.justificativa LIKE 'Migracao automatica do perfil legado%';

-- ─── 3. Papel derivado do perfil ────────────────────────────────────────────
-- Papel de empresa (admin, gestor de contrato) só vem de atribuição da empresa;
-- os mesmos perfis atribuídos a uma obra valem como gestor de obra.
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid DEFAULT auth.uid())
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT CASE
           WHEN x.scope_type<>'empresa' AND ap.papel_equivalente IN ('admin','gestor_contrato','gestor_frota')
             THEN 'gestor_obra'::public.app_role
           ELSE ap.papel_equivalente
         END AS papel
  FROM (
    SELECT eap.profile_id, eap.scope_type FROM public.employee_access_profiles eap
    WHERE eap.user_id=user_uuid AND eap.revogado_em IS NULL
      AND eap.valido_de<=now() AND (eap.valido_ate IS NULL OR eap.valido_ate>now())
    UNION ALL
    SELECT d.profile_id, d.scope_type FROM public.access_delegations d
    WHERE d.para_user_id=user_uuid AND d.revogado_em IS NULL AND now()>=d.inicio_em AND now()<d.fim_em
  ) x
  JOIN public.access_profiles ap ON ap.id=x.profile_id AND ap.ativo
  ORDER BY CASE (CASE WHEN x.scope_type<>'empresa' AND ap.papel_equivalente IN ('admin','gestor_contrato','gestor_frota')
                      THEN 'gestor_obra' ELSE ap.papel_equivalente::text END)
             WHEN 'admin' THEN 6 WHEN 'gestor_contrato' THEN 5 WHEN 'gestor_frota' THEN 4
             WHEN 'gestor_obra' THEN 3 WHEN 'tecnico_sms' THEN 2 ELSE 1 END DESC
  LIMIT 1
$$;

-- Obras do usuário: todas para papel de empresa; senão, as dos perfis por obra
-- (inclusive substituição) e os vínculos do próprio funcionário.
CREATE OR REPLACE FUNCTION public.get_user_obra_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT CASE
    WHEN public.get_user_role(auth.uid())::text IN ('admin','gestor_contrato','gestor_frota')
      THEN ARRAY(SELECT id FROM public.obras)
    ELSE ARRAY(
      SELECT eap.scope_id FROM public.employee_access_profiles eap
      WHERE eap.user_id=auth.uid() AND eap.scope_type='obra' AND eap.scope_id IS NOT NULL
        AND eap.revogado_em IS NULL AND eap.valido_de<=now() AND (eap.valido_ate IS NULL OR eap.valido_ate>now())
      UNION
      SELECT d.scope_id FROM public.access_delegations d
      WHERE d.para_user_id=auth.uid() AND d.scope_type='obra' AND d.scope_id IS NOT NULL
        AND d.revogado_em IS NULL AND now()>=d.inicio_em AND now()<d.fim_em
      UNION
      SELECT eoa.obra_id FROM public.employee_obra_assignments eoa
      JOIN public.employees e ON e.id=eoa.employee_id WHERE e.user_id=auth.uid())
  END
$$;

-- ─── 4. Administração e auditoria só pelo perfil ────────────────────────────
CREATE OR REPLACE FUNCTION public.access_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.pode_geral_u(auth.uid(),'controle_acesso.administrar')
$$;

CREATE OR REPLACE FUNCTION public.auditoria_eh_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.pode_geral_u(auth.uid(),'auditoria.visualizar')
$$;

-- ─── 5. Regras auxiliares no modelo novo ────────────────────────────────────
-- Consultar a obra também vale para quem trabalha nela (o próprio vínculo).
CREATE OR REPLACE FUNCTION public.acesso_novo(p_helper text, p_user uuid, p_alvo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE p_helper
    WHEN 'can_manage_obra_data' THEN public.pode_u(p_user,'obras.editar',p_alvo)
    WHEN 'can_access_obra_data' THEN
      public.pode_u(p_user,'obras.visualizar',p_alvo)
      OR EXISTS(SELECT 1 FROM public.employees e WHERE e.user_id=p_user AND (
           EXISTS(SELECT 1 FROM public.employee_obra_assignments a WHERE a.employee_id=e.id AND a.obra_id=p_alvo)
           OR EXISTS(SELECT 1 FROM public.obra_funcionarios a WHERE a.employee_id=e.id AND a.obra_id=p_alvo AND a.status=true)))
    WHEN 'can_manage_sms_obra'  THEN public.acesso_novo_manage_sms_obra(p_user,p_alvo)
    -- O próprio cadastro é sempre visível ao dono (autosserviço)
    WHEN 'can_access_employee_record' THEN
      EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_alvo AND e.user_id=p_user)
      OR public.pode_funcionario_u(p_user,'colaboradores.visualizar',p_alvo)
    WHEN 'can_manage_employee_record' THEN public.pode_funcionario_u(p_user,'colaboradores.editar',p_alvo)
    WHEN 'can_access_hr_core' THEN
      EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_alvo AND e.user_id=p_user)
      OR public.pode_funcionario_u(p_user,'rh_sensivel.visualizar',p_alvo)
    WHEN 'can_manage_hr_core' THEN public.pode_funcionario_u(p_user,'rh_sensivel.editar',p_alvo)
    WHEN 'can_access_vehicle_record' THEN
      public.pode_geral_u(p_user,'frota.visualizar')
      OR EXISTS(SELECT 1 FROM public.vehicles v JOIN public.employees e ON e.id=v.responsavel_id
                WHERE v.id=p_alvo AND e.user_id=p_user)
      OR EXISTS(SELECT 1 FROM public.obra_veiculos ov
                WHERE ov.vehicle_id=p_alvo AND public.pode_u(p_user,'frota.visualizar',ov.obra_id))
    ELSE false
  END
$$;

UPDATE public.access_config SET modo='novo', alterado_em=now() WHERE modo<>'novo';

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

-- ─── 7. Vincular obra na tela de usuários concede o perfil daquela obra ─────
-- Vale para perfis por obra (gestor de obra, técnico SMS) que a pessoa já tem,
-- ou gestor de obra pelo cargo. Desvincular revoga só o que foi automático.
CREATE OR REPLACE FUNCTION public.access_acompanhar_vinculo_obra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE
  v_user uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT user_id INTO v_user FROM public.employees WHERE id=NEW.employee_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,scope_id,justificativa)
      SELECT DISTINCT v_user, p.profile_id, 'obra', NEW.obra_id, 'Automático: vínculo com a obra'
      FROM (
        SELECT eap.profile_id FROM public.employee_access_profiles eap
        JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.papel_equivalente IN ('gestor_obra','tecnico_sms')
        WHERE eap.user_id=v_user AND eap.scope_type='obra'
          AND (eap.revogado_em IS NULL OR eap.justificativa IN ('Automático: vínculo com a obra','Migração automática: obra vinculada ao funcionário'))
        UNION
        SELECT ap.id FROM public.access_profiles ap
        WHERE ap.nome='Gestor de Obra' AND EXISTS(
          SELECT 1 FROM public.employees e JOIN public.cargos c ON c.id=e.cargo_id
          WHERE e.id=NEW.employee_id AND c.nivel_acesso::text='gestor_obra')
      ) p
      ON CONFLICT (user_id,profile_id,scope_type,(COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)))
      DO UPDATE SET revogado_em=NULL, revogado_por=NULL
      WHERE public.employee_access_profiles.justificativa IN ('Automático: vínculo com a obra','Migração automática: obra vinculada ao funcionário');
    END IF;
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_user FROM public.employees WHERE id=OLD.employee_id;
  IF v_user IS NOT NULL THEN
    UPDATE public.employee_access_profiles SET revogado_em=now(), revogado_por=auth.uid()
    WHERE user_id=v_user AND scope_type='obra' AND scope_id=OLD.obra_id AND revogado_em IS NULL
      AND justificativa IN ('Automático: vínculo com a obra','Migração automática: obra vinculada ao funcionário');
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_access_vinculo_obra ON public.employee_obra_assignments;
CREATE TRIGGER trg_access_vinculo_obra
  AFTER INSERT OR DELETE ON public.employee_obra_assignments
  FOR EACH ROW EXECUTE FUNCTION public.access_acompanhar_vinculo_obra();

REVOKE ALL ON FUNCTION public.access_acompanhar_vinculo_obra() FROM PUBLIC, anon, authenticated;

-- ─── 8. Tabela de papéis antiga: só histórico ───────────────────────────────
COMMENT ON TABLE public.user_roles IS
  'OBSOLETA desde 20260911000010: o acesso vem de employee_access_profiles (Controle de Acesso). Mantida só como histórico.';
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;

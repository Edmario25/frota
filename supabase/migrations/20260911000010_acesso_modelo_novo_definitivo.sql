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

-- Continua em 20260911000011 e 20260911000012.

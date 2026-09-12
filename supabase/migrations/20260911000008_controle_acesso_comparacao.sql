-- ─── Troca segura: modelo antigo x modelo novo, função por função ──────────
--
-- As ~200 políticas do banco chamam funções auxiliares (can_manage_obra_data,
-- can_access_employee_record...). Aqui cada auxiliar passa a ter duas versões:
--   legado → a regra de hoje, por papel (admin, gestor_obra...), sem mudança;
--   novo   → perfil + ação + escopo (motor da 20260911000007).
-- access_config diz qual versão vale, por auxiliar. Tudo começa em "legado":
-- aplicar esta migration não muda o acesso de ninguém.
--
-- access_compare_report() lista, para cada usuário e alvo, onde as duas regras
-- discordam. Só se troca um auxiliar para "novo" quando a lista está vazia
-- (ou as diferenças são as desejadas).

-- ─── 1. Configuração ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.access_config (
  helper      text PRIMARY KEY,
  descricao   text NOT NULL,
  permissao   text NOT NULL,
  modo        text NOT NULL DEFAULT 'legado' CHECK (modo IN ('legado','novo')),
  alterado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.access_config(helper,descricao,permissao) VALUES
 ('can_manage_obra_data','Gerir dados operacionais da obra (equipes, almoxarifado, alojamento, custos...)','obras.editar'),
 ('can_access_obra_data','Consultar dados da obra','obras.visualizar'),
 ('can_manage_sms_obra','Gerir registros de SMS da obra (DDS, APR, inspeções...)','sms_*.editar'),
 ('can_access_employee_record','Consultar cadastro de funcionário','colaboradores.visualizar'),
 ('can_manage_employee_record','Alterar cadastro de funcionário','colaboradores.editar'),
 ('can_access_hr_core','Consultar dados sensíveis de RH','rh_sensivel.visualizar'),
 ('can_manage_hr_core','Alterar dados sensíveis de RH','rh_sensivel.editar'),
 ('can_access_vehicle_record','Consultar veículo','frota.visualizar')
ON CONFLICT (helper) DO NOTHING;

ALTER TABLE public.access_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_config_admin_read ON public.access_config;
CREATE POLICY access_config_admin_read ON public.access_config FOR SELECT TO authenticated USING (public.access_is_admin());
GRANT SELECT ON public.access_config TO authenticated;

CREATE OR REPLACE FUNCTION public.access_modo(p_helper text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE((SELECT modo FROM public.access_config WHERE helper=p_helper),'legado')
$$;

-- ─── 2. Regra antiga, com o usuário explícito ───────────────────────────────
-- Cópia fiel das definições em vigor, trocando auth.uid() por p_user.
CREATE OR REPLACE FUNCTION public.acesso_legado_obra_ids(p_user uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE
    WHEN (SELECT c.acessa_todas_obras FROM public.cargos c
          WHERE c.id=(SELECT e.cargo_id FROM public.employees e WHERE e.user_id=p_user LIMIT 1))=true
    THEN ARRAY(SELECT id FROM public.obras)
    ELSE ARRAY(SELECT eoa.obra_id FROM public.employee_obra_assignments eoa
               WHERE eoa.employee_id=(SELECT e.id FROM public.employees e WHERE e.user_id=p_user LIMIT 1))
  END
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_papel(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.get_user_role(p_user)::text
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_manage_obra(p_user uuid, p_obra uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.acesso_legado_papel(p_user) IN ('admin','gestor_contrato','gestor_frota')
      OR (public.acesso_legado_papel(p_user)='gestor_obra'
          AND p_obra = ANY(COALESCE(public.acesso_legado_obra_ids(p_user),ARRAY[]::uuid[])))
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_access_obra(p_user uuid, p_obra uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.acesso_legado_papel(p_user) IN ('admin','gestor_contrato','gestor_frota')
      OR p_obra = ANY(COALESCE(public.acesso_legado_obra_ids(p_user),ARRAY[]::uuid[]))
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_manage_sms_obra(p_user uuid, p_obra uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.acesso_legado_papel(p_user) IN ('admin','gestor_contrato','gestor_frota')
      OR (public.acesso_legado_papel(p_user) IN ('gestor_obra','tecnico_sms')
          AND p_obra = ANY(COALESCE(public.acesso_legado_obra_ids(p_user),ARRAY[]::uuid[])))
$$;

-- Funcionário e usuário compartilham uma obra (vínculo fixo ou alocação ativa)
CREATE OR REPLACE FUNCTION public.acesso_legado_mesma_obra(p_user uuid, p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT obra_id FROM public.employee_obra_assignments WHERE employee_id=p_employee
      UNION
      SELECT obra_id FROM public.obra_funcionarios WHERE employee_id=p_employee AND status=true
    ) alvo
    JOIN (
      SELECT a.obra_id FROM public.employee_obra_assignments a
      JOIN public.employees e ON e.id=a.employee_id WHERE e.user_id=p_user
      UNION
      SELECT a.obra_id FROM public.obra_funcionarios a
      JOIN public.employees e ON e.id=a.employee_id WHERE e.user_id=p_user AND a.status=true
    ) atual USING (obra_id))
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_access_employee(p_user uuid, p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee AND e.user_id=p_user)
      OR public.acesso_legado_papel(p_user) IN ('admin','gestor_contrato','gestor_frota')
      OR (public.acesso_legado_papel(p_user) IN ('gestor_obra','tecnico_sms')
          AND public.acesso_legado_mesma_obra(p_user,p_employee))
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_manage_employee(p_user uuid, p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.acesso_legado_papel(p_user) IN ('admin','gestor_contrato','gestor_frota')
      OR (public.acesso_legado_papel(p_user)='gestor_obra'
          AND public.acesso_legado_mesma_obra(p_user,p_employee))
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_access_hr(p_user uuid, p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee AND e.user_id=p_user)
      OR public.acesso_legado_papel(p_user) IN ('admin','gestor_contrato','gestor_frota')
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_manage_hr(p_user uuid, p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.acesso_legado_papel(p_user) IN ('admin','gestor_contrato','gestor_frota')
$$;

CREATE OR REPLACE FUNCTION public.acesso_legado_access_vehicle(p_user uuid, p_vehicle uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.acesso_legado_papel(p_user) IN ('admin','gestor_contrato','gestor_frota')
      OR EXISTS(SELECT 1 FROM public.vehicles v JOIN public.employees e ON e.id=v.responsavel_id
                WHERE v.id=p_vehicle AND e.user_id=p_user)
      OR EXISTS(SELECT 1 FROM public.obra_veiculos ov
                WHERE ov.vehicle_id=p_vehicle AND public.acesso_legado_access_obra(p_user,ov.obra_id))
$$;

-- ─── 3. Regra nova ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.acesso_novo_manage_sms_obra(p_user uuid, p_obra uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM unnest(ARRAY[
    'sms_dashboard.editar','sms_desvios.editar','sms_inspecoes.editar','sms_apr.editar','sms_dds.editar',
    'sms_epis.editar','sms_treinamentos.editar','sms_admissao.editar','sms_rdo.editar','sms_velocidade.editar'
  ]) k WHERE public.pode_u(p_user,k,p_obra))
$$;

CREATE OR REPLACE FUNCTION public.acesso_novo(p_helper text, p_user uuid, p_alvo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE p_helper
    WHEN 'can_manage_obra_data' THEN public.pode_u(p_user,'obras.editar',p_alvo)
    WHEN 'can_access_obra_data' THEN public.pode_u(p_user,'obras.visualizar',p_alvo)
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

CREATE OR REPLACE FUNCTION public.acesso_legado(p_helper text, p_user uuid, p_alvo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE p_helper
    WHEN 'can_manage_obra_data'       THEN public.acesso_legado_manage_obra(p_user,p_alvo)
    WHEN 'can_access_obra_data'       THEN public.acesso_legado_access_obra(p_user,p_alvo)
    WHEN 'can_manage_sms_obra'        THEN public.acesso_legado_manage_sms_obra(p_user,p_alvo)
    WHEN 'can_access_employee_record' THEN public.acesso_legado_access_employee(p_user,p_alvo)
    WHEN 'can_manage_employee_record' THEN public.acesso_legado_manage_employee(p_user,p_alvo)
    WHEN 'can_access_hr_core'         THEN public.acesso_legado_access_hr(p_user,p_alvo)
    WHEN 'can_manage_hr_core'         THEN public.acesso_legado_manage_hr(p_user,p_alvo)
    WHEN 'can_access_vehicle_record'  THEN public.acesso_legado_access_vehicle(p_user,p_alvo)
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.acesso_decidir(p_helper text, p_alvo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND CASE public.access_modo(p_helper)
    WHEN 'novo' THEN public.acesso_novo(p_helper,auth.uid(),p_alvo)
    ELSE public.acesso_legado(p_helper,auth.uid(),p_alvo)
  END
$$;

-- ─── 4. Auxiliares usados pelas políticas: mesma assinatura, decisão configurável
CREATE OR REPLACE FUNCTION public.can_manage_obra_data(target_obra_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.acesso_decidir('can_manage_obra_data',target_obra_id)
$$;
CREATE OR REPLACE FUNCTION public.can_access_obra_data(target_obra_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.acesso_decidir('can_access_obra_data',target_obra_id)
$$;
CREATE OR REPLACE FUNCTION public.can_manage_sms_obra(target_obra_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.acesso_decidir('can_manage_sms_obra',target_obra_id)
$$;
CREATE OR REPLACE FUNCTION public.can_access_employee_record(target_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.acesso_decidir('can_access_employee_record',target_employee_id)
$$;
CREATE OR REPLACE FUNCTION public.can_manage_employee_record(target_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.acesso_decidir('can_manage_employee_record',target_employee_id)
$$;
CREATE OR REPLACE FUNCTION public.can_access_hr_core(target_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.acesso_decidir('can_access_hr_core',target_employee_id)
$$;
CREATE OR REPLACE FUNCTION public.can_manage_hr_core(target_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.acesso_decidir('can_manage_hr_core',target_employee_id)
$$;
CREATE OR REPLACE FUNCTION public.can_access_vehicle_record(target_vehicle_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.acesso_decidir('can_access_vehicle_record',target_vehicle_id)
$$;

-- ─── 5. Comparação e troca de modo ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.access_compare_report(p_incluir_funcionarios boolean DEFAULT true)
RETURNS TABLE(helper text, user_id uuid, usuario text, alvo_tipo text, alvo_id uuid, alvo_nome text, legado boolean, novo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.access_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  WITH usuarios AS (
    SELECT DISTINCT x.u FROM (
      SELECT ur.user_id AS u FROM public.user_roles ur
      UNION SELECT eap.user_id FROM public.employee_access_profiles eap
    ) x
  ),
  nomes AS (
    SELECT us.u, COALESCE(
      (SELECT e.nome::text FROM public.employees e WHERE e.user_id=us.u LIMIT 1),
      (SELECT p.nome::text FROM public.profiles p WHERE p.user_id=us.u LIMIT 1),
      us.u::text) AS nome
    FROM usuarios us
  ),
  alvos AS (
    SELECT h.helper, 'obra'::text AS tipo, o.id, o.nome::text AS nome
    FROM public.obras o
    CROSS JOIN (VALUES ('can_manage_obra_data'),('can_access_obra_data'),('can_manage_sms_obra')) h(helper)
    UNION ALL
    SELECT h.helper, 'funcionario', e.id, e.nome::text
    FROM public.employees e
    CROSS JOIN (VALUES ('can_access_employee_record'),('can_manage_employee_record'),
                       ('can_access_hr_core'),('can_manage_hr_core')) h(helper)
    WHERE p_incluir_funcionarios AND e.status='ativo'
  ),
  avaliado AS (
    SELECT a.helper, n.u, n.nome AS usuario, a.tipo, a.id, a.nome,
      public.acesso_legado(a.helper,n.u,a.id) AS l,
      public.acesso_novo(a.helper,n.u,a.id) AS nv
    FROM nomes n CROSS JOIN alvos a
  )
  SELECT av.helper, av.u, av.usuario, av.tipo, av.id, av.nome, av.l, av.nv
  FROM avaliado av WHERE av.l IS DISTINCT FROM av.nv
  ORDER BY av.helper, av.usuario, av.nome;
END $$;

CREATE OR REPLACE FUNCTION public.access_set_modo(p_helper text, p_modo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF NOT public.access_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_modo NOT IN ('legado','novo') THEN RAISE EXCEPTION 'Modo inválido: %', p_modo; END IF;
  UPDATE public.access_config SET modo=p_modo, alterado_em=now(), alterado_por=auth.uid() WHERE helper=p_helper;
  IF NOT FOUND THEN RAISE EXCEPTION 'Função de acesso desconhecida: %', p_helper; END IF;
END $$;

DO $$ BEGIN IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
  DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.access_config;
  CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.access_config
    FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao();
END IF; END $$;

-- ─── 6. Permissões de execução ──────────────────────────────────────────────
-- Avaliadores com usuário explícito: só uso interno (revelariam o acesso de terceiros).
REVOKE ALL ON FUNCTION public.acesso_legado_obra_ids(uuid), public.acesso_legado_papel(uuid),
  public.acesso_legado_manage_obra(uuid,uuid), public.acesso_legado_access_obra(uuid,uuid),
  public.acesso_legado_manage_sms_obra(uuid,uuid), public.acesso_legado_mesma_obra(uuid,uuid),
  public.acesso_legado_access_employee(uuid,uuid), public.acesso_legado_manage_employee(uuid,uuid),
  public.acesso_legado_access_hr(uuid,uuid), public.acesso_legado_manage_hr(uuid,uuid),
  public.acesso_legado_access_vehicle(uuid,uuid), public.acesso_novo_manage_sms_obra(uuid,uuid),
  public.acesso_novo(text,uuid,uuid), public.acesso_legado(text,uuid,uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.access_modo(text), public.acesso_decidir(text,uuid),
  public.access_compare_report(boolean), public.access_set_modo(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_modo(text), public.acesso_decidir(text,uuid),
  public.access_compare_report(boolean), public.access_set_modo(text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.can_manage_obra_data(uuid), public.can_access_obra_data(uuid),
  public.can_manage_sms_obra(uuid), public.can_access_employee_record(uuid),
  public.can_manage_employee_record(uuid), public.can_access_hr_core(uuid),
  public.can_manage_hr_core(uuid), public.can_access_vehicle_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_obra_data(uuid), public.can_access_obra_data(uuid),
  public.can_manage_sms_obra(uuid), public.can_access_employee_record(uuid),
  public.can_manage_employee_record(uuid), public.can_access_hr_core(uuid),
  public.can_manage_hr_core(uuid), public.can_access_vehicle_record(uuid) TO authenticated;

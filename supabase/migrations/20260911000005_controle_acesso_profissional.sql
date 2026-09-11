-- Controle de acesso profissional: perfis + permissoes por acao + escopo.
-- Mantem as permissoes dos cargos como compatibilidade durante a migracao.

CREATE TABLE IF NOT EXISTS public.access_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE CHECK (chave ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  modulo text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('visualizar','criar','editar','excluir','aprovar','encerrar','exportar','administrar')),
  nome text NOT NULL,
  descricao text,
  sensivel boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  cor text NOT NULL DEFAULT '#2563eb',
  sistema boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_profile_permissions (
  profile_id uuid NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.access_permissions(id) ON DELETE CASCADE,
  permitido boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.employee_access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  scope_type text NOT NULL DEFAULT 'empresa' CHECK (scope_type IN ('proprio','equipe','setor','departamento','obra','empresa')),
  scope_id uuid,
  valido_de timestamptz NOT NULL DEFAULT now(),
  valido_ate timestamptz,
  justificativa text,
  concedido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valido_ate IS NULL OR valido_ate > valido_de)
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_access_profiles_unique
  ON public.employee_access_profiles(user_id,profile_id,scope_type,COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS employee_access_profiles_user_idx ON public.employee_access_profiles(user_id,valido_de,valido_ate);

CREATE TABLE IF NOT EXISTS public.access_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  de_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  para_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  scope_type text NOT NULL DEFAULT 'empresa' CHECK (scope_type IN ('equipe','setor','departamento','obra','empresa')),
  scope_id uuid,
  inicio_em timestamptz NOT NULL,
  fim_em timestamptz NOT NULL,
  motivo text NOT NULL,
  aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revogado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (de_user_id <> para_user_id AND fim_em > inicio_em)
);

CREATE TABLE IF NOT EXISTS public.access_approval_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  limite numeric(14,2) NOT NULL CHECK (limite >= 0),
  scope_type text NOT NULL DEFAULT 'empresa' CHECK (scope_type IN ('departamento','obra','empresa')),
  scope_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id,modulo,scope_type,scope_id)
);

INSERT INTO public.access_permissions(chave,modulo,acao,nome,sensivel)
SELECT m||'.'||a,m,a,
  initcap(replace(m,'_',' '))||' — '||initcap(a),
  m IN ('rh_sensivel','financeiro','auditoria','controle_acesso')
FROM unnest(ARRAY[
 'dashboard','colaboradores','escalas','efetivo','frota','manutencao','obras','fornecedores',
 'almoxarifado','ferramentas','cronograma','subcontratadas','financeiro','fundo_fixo',
 'alojamento','qualidade','relatorios','comunicados','visitantes','portal_cliente','sms_dashboard',
 'sms_desvios','sms_inspecoes','sms_apr','sms_dds','sms_epis','sms_treinamentos','sms_admissao',
 'sms_rdo','sms_velocidade','rh_sensivel','auditoria','controle_acesso'
]) m
CROSS JOIN unnest(ARRAY['visualizar','criar','editar','excluir','aprovar','encerrar','exportar','administrar']) a
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.access_profiles(nome,descricao,cor,sistema) VALUES
 ('Administrador do Sistema','Configura acessos e parametros tecnicos, com rastreabilidade.','#7c3aed',true),
 ('Gestor de Contrato','Visao gerencial das obras autorizadas.','#4f46e5',true),
 ('Gestor de Obra','Gestao operacional no escopo da obra.','#d97706',true),
 ('RH Operacional','Cadastros, documentos e admissoes sem dados restritos.','#db2777',true),
 ('Gestor de RH','Gestao completa de pessoas e dados sensiveis.','#be185d',true),
 ('Financeiro Operacional','Lancamentos e conferencias financeiras.','#059669',true),
 ('Aprovador Financeiro','Aprovacoes financeiras conforme limite.','#047857',true),
 ('Tecnico SMS','Operacao de seguranca nas obras atribuidas.','#0891b2',true),
 ('Gestor SMS','Aprovacao e encerramento dos processos de seguranca.','#0e7490',true),
 ('Almoxarife','Estoque e movimentacoes nas obras atribuidas.','#ea580c',true),
 ('Apontador de Campo','Efetivo, ponto e RDO nas obras atribuidas.','#2563eb',true),
 ('Funcionario','Autosservico e consulta dos proprios registros.','#64748b',true)
ON CONFLICT (nome) DO NOTHING;

-- Perfis iniciais. Podem ser refinados pela tela administrativa.
INSERT INTO public.access_profile_permissions(profile_id,permission_id,permitido)
SELECT p.id,x.id,true FROM public.access_profiles p CROSS JOIN public.access_permissions x
WHERE p.nome='Administrador do Sistema'
ON CONFLICT DO NOTHING;
INSERT INTO public.access_profile_permissions(profile_id,permission_id,permitido)
SELECT p.id,x.id,true FROM public.access_profiles p CROSS JOIN public.access_permissions x
WHERE p.nome='Gestor de Contrato' AND x.modulo NOT IN ('controle_acesso','rh_sensivel')
ON CONFLICT DO NOTHING;
INSERT INTO public.access_profile_permissions(profile_id,permission_id,permitido)
SELECT p.id,x.id,true FROM public.access_profiles p CROSS JOIN public.access_permissions x
WHERE p.nome='Gestor de Obra' AND x.modulo NOT IN ('controle_acesso','auditoria','rh_sensivel')
  AND x.acao <> 'administrar'
ON CONFLICT DO NOTHING;
INSERT INTO public.access_profile_permissions(profile_id,permission_id,permitido)
SELECT p.id,x.id,true FROM public.access_profiles p CROSS JOIN public.access_permissions x
WHERE (p.nome='Tecnico SMS' AND x.modulo LIKE 'sms_%' AND x.acao IN ('visualizar','criar','editar','exportar'))
   OR (p.nome='Gestor SMS' AND x.modulo LIKE 'sms_%')
   OR (p.nome='Almoxarife' AND x.modulo='almoxarifado' AND x.acao IN ('visualizar','criar','editar','exportar'))
   OR (p.nome='Apontador de Campo' AND x.modulo IN ('efetivo','escalas','sms_rdo') AND x.acao IN ('visualizar','criar','editar','exportar'))
   OR (p.nome='RH Operacional' AND x.modulo IN ('colaboradores','escalas','sms_admissao','sms_treinamentos') AND x.acao IN ('visualizar','criar','editar','exportar'))
   OR (p.nome='Gestor de RH' AND x.modulo IN ('colaboradores','escalas','sms_admissao','sms_treinamentos','rh_sensivel','relatorios'))
   OR (p.nome='Financeiro Operacional' AND x.modulo IN ('financeiro','fundo_fixo') AND x.acao IN ('visualizar','criar','editar','exportar'))
   OR (p.nome='Aprovador Financeiro' AND x.modulo IN ('financeiro','fundo_fixo'))
   OR (p.nome='Funcionario' AND x.modulo IN ('dashboard','comunicados','escalas') AND x.acao='visualizar')
ON CONFLICT DO NOTHING;

-- Migra os papeis legados para perfis sem remover nada do modelo anterior.
INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,justificativa)
SELECT ur.user_id,p.id,
  CASE WHEN ur.role::text='gestor_obra' THEN 'obra' ELSE 'empresa' END,
  'Migracao automatica do perfil legado '||ur.role::text
FROM public.user_roles ur
JOIN public.access_profiles p ON p.nome=CASE ur.role::text
  WHEN 'admin' THEN 'Administrador do Sistema'
  WHEN 'gestor_contrato' THEN 'Gestor de Contrato'
  WHEN 'gestor_frota' THEN 'Gestor de Contrato'
  WHEN 'gestor_obra' THEN 'Gestor de Obra'
  WHEN 'tecnico_sms' THEN 'Tecnico SMS'
  ELSE 'Funcionario' END
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.access_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND (
   public.get_user_role(auth.uid())::text='admin' OR EXISTS(
     SELECT 1 FROM public.employee_access_profiles eap
     JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.ativo
     JOIN public.access_profile_permissions app ON app.profile_id=ap.id AND app.permitido
     JOIN public.access_permissions prm ON prm.id=app.permission_id AND prm.chave='controle_acesso.administrar'
     WHERE eap.user_id=auth.uid() AND eap.valido_de<=now() AND (eap.valido_ate IS NULL OR eap.valido_ate>now())
   )
 )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_chave text,p_scope_type text DEFAULT NULL,p_scope_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE ok boolean;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT EXISTS(
  SELECT 1 FROM public.employee_access_profiles eap
  JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.ativo
  JOIN public.access_profile_permissions app ON app.profile_id=ap.id AND app.permitido
  JOIN public.access_permissions prm ON prm.id=app.permission_id AND prm.chave=p_chave
  WHERE eap.user_id=auth.uid() AND eap.valido_de<=now() AND (eap.valido_ate IS NULL OR eap.valido_ate>now())
    AND (p_scope_type IS NULL OR eap.scope_type='empresa'
      OR (eap.scope_type=p_scope_type AND (eap.scope_id IS NULL OR eap.scope_id=p_scope_id)))
 ) INTO ok;
 RETURN ok;
END $$;

CREATE OR REPLACE FUNCTION public.get_effective_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT jsonb_build_object(
  'permissions',COALESCE((SELECT jsonb_agg(DISTINCT prm.chave ORDER BY prm.chave)
    FROM public.employee_access_profiles eap
    JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.ativo
    JOIN public.access_profile_permissions app ON app.profile_id=ap.id AND app.permitido
    JOIN public.access_permissions prm ON prm.id=app.permission_id
    WHERE eap.user_id=auth.uid() AND eap.valido_de<=now() AND (eap.valido_ate IS NULL OR eap.valido_ate>now())),'[]'::jsonb),
  'profiles',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ap.id,'nome',ap.nome,'scope_type',eap.scope_type,'scope_id',eap.scope_id,'valido_ate',eap.valido_ate))
    FROM public.employee_access_profiles eap JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.ativo
    WHERE eap.user_id=auth.uid() AND eap.valido_de<=now() AND (eap.valido_ate IS NULL OR eap.valido_ate>now())),'[]'::jsonb)
 )
$$;

ALTER TABLE public.access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_profile_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_approval_limits ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['access_permissions','access_profiles','access_profile_permissions','employee_access_profiles','access_delegations','access_approval_limits'] LOOP
 EXECUTE format('DROP POLICY IF EXISTS access_admin_all ON public.%I',t);
 EXECUTE format('CREATE POLICY access_admin_all ON public.%I FOR ALL TO authenticated USING (public.access_is_admin()) WITH CHECK (public.access_is_admin())',t);
END LOOP; END $$;
CREATE POLICY access_catalog_read ON public.access_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY access_profiles_read ON public.access_profiles FOR SELECT TO authenticated USING (ativo OR public.access_is_admin());
CREATE POLICY access_profile_permissions_read ON public.access_profile_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY access_own_assignments_read ON public.employee_access_profiles FOR SELECT TO authenticated USING (user_id=auth.uid());

REVOKE ALL ON FUNCTION public.access_is_admin(),public.has_permission(text,text,uuid),public.get_effective_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.access_is_admin(),public.has_permission(text,text,uuid),public.get_effective_access() TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.access_permissions,public.access_profiles,public.access_profile_permissions,public.employee_access_profiles,public.access_delegations,public.access_approval_limits TO authenticated;

-- Inclui tabelas de acesso na auditoria central quando ela estiver instalada.
DO $$ DECLARE t text; BEGIN IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
 FOREACH t IN ARRAY ARRAY['access_profiles','access_profile_permissions','employee_access_profiles','access_delegations','access_approval_limits'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.%I',t);
  EXECUTE format('CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao()',t);
 END LOOP;
END IF; END $$;

COMMENT ON FUNCTION public.has_permission(text,text,uuid) IS 'Autoridade central de acesso por permissao e escopo.';

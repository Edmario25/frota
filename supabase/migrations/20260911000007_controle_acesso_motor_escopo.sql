-- ─── Motor de escopo do controle de acesso ──────────────────────────────────
--
-- Uma única regra: o usuário pode fazer a AÇÃO no ALVO se tem uma concessão
-- (perfil atribuído, substituição ou exceção individual) cujo escopo cobre o
-- alvo, e nenhuma exceção que negue cobrindo o mesmo alvo.
--
-- Escopos:
--   empresa       → tudo
--   obra          → a obra indicada (scope_id obrigatório)
--   departamento  → funcionários do departamento
--   setor         → funcionários do setor
--   equipe        → subordinados diretos e indiretos (employees.gestor_imediato_id)
--   proprio       → o próprio registro
--
-- Funções para as políticas do banco (usam o usuário logado):
--   pode(chave, obra)            pode_funcionario(chave, funcionario)
--   pode_geral(chave)            minhas_obras(chave)
-- Versões *_u(usuario, ...) são internas: comparação e simulação.

-- ─── 1. Estrutura ───────────────────────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS gestor_imediato_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS employees_gestor_imediato_idx ON public.employees(gestor_imediato_id);

-- Ações específicas de módulo (Fundo Fixo), além das 8 genéricas
ALTER TABLE public.access_permissions DROP CONSTRAINT IF EXISTS access_permissions_acao_check;
ALTER TABLE public.access_permissions ADD CONSTRAINT access_permissions_acao_check CHECK (acao IN (
  'visualizar','criar','editar','excluir','aprovar','encerrar','exportar','administrar',
  'solicitar','conferir','reprovar','prestar_contas'));

INSERT INTO public.access_permissions(chave,modulo,acao,nome,sensivel) VALUES
 ('fundo_fixo.solicitar','fundo_fixo','solicitar','Fundo Fixo — Solicitar despesa',false),
 ('fundo_fixo.conferir','fundo_fixo','conferir','Fundo Fixo — Conferir comprovante',false),
 ('fundo_fixo.reprovar','fundo_fixo','reprovar','Fundo Fixo — Reprovar despesa',false),
 ('fundo_fixo.prestar_contas','fundo_fixo','prestar_contas','Fundo Fixo — Prestar contas',false),
 ('chat.visualizar','chat','visualizar','Chat — Visualizar',false),
 ('chat.criar','chat','criar','Chat — Enviar mensagens',false)
ON CONFLICT (chave) DO NOTHING;

-- ─── 2. Perfis que faltavam ─────────────────────────────────────────────────
INSERT INTO public.access_profiles(nome,descricao,cor,sistema) VALUES
 ('Administrador Tecnico','Configura o sistema e os acessos, sem dados sensíveis de pessoas (salários, dados médicos e bancários).','#6d28d9',true),
 ('Lider / Supervisor','Equipe direta: efetivo, escalas e consulta de colaboradores.','#0284c7',true)
ON CONFLICT (nome) DO NOTHING;

UPDATE public.access_profiles
SET descricao='Acesso total, inclusive dados sensíveis. Uso emergencial, restrito e auditado.'
WHERE nome='Administrador do Sistema';

-- Pacotes de permissões. Repetíveis: completam perfis com as permissões novas.
INSERT INTO public.access_profile_permissions(profile_id,permission_id,permitido)
SELECT p.id,x.id,true FROM public.access_profiles p CROSS JOIN public.access_permissions x
WHERE (p.nome='Administrador do Sistema')
   OR (p.nome='Administrador Tecnico' AND x.modulo<>'rh_sensivel')
   OR (p.nome='Gestor de Contrato' AND x.modulo NOT IN ('controle_acesso','rh_sensivel','chat','auditoria'))
   OR (p.nome='Gestor de Obra' AND x.modulo NOT IN ('controle_acesso','auditoria','rh_sensivel') AND x.acao<>'administrar')
   OR (p.nome='Aprovador Financeiro' AND x.modulo IN ('financeiro','fundo_fixo'))
   OR (p.nome='Financeiro Operacional' AND x.chave IN ('fundo_fixo.solicitar','fundo_fixo.conferir','fundo_fixo.prestar_contas'))
   OR (p.nome='Funcionario' AND x.chave IN ('fundo_fixo.visualizar','fundo_fixo.solicitar','fundo_fixo.prestar_contas',
                                           'manutencao.visualizar','frota.visualizar','comunicados.visualizar'))
   OR (p.nome='Lider / Supervisor' AND (x.chave IN ('colaboradores.visualizar','comunicados.visualizar')
        OR (x.modulo IN ('efetivo','escalas') AND x.acao IN ('visualizar','criar','editar'))))
ON CONFLICT DO NOTHING;

-- ─── 3. Concessões efetivas de um usuário ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.access_grants(p_user uuid)
RETURNS TABLE(chave text, permitido boolean, scope_type text, scope_id uuid,
              origem text, origem_id uuid, profile_id uuid, valido_ate timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT prm.chave, true, eap.scope_type, eap.scope_id, 'perfil', eap.id, ap.id, eap.valido_ate
  FROM public.employee_access_profiles eap
  JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.ativo
  JOIN public.access_profile_permissions app ON app.profile_id=ap.id AND app.permitido
  JOIN public.access_permissions prm ON prm.id=app.permission_id
  WHERE eap.user_id=p_user AND eap.revogado_em IS NULL
    AND eap.valido_de<=now() AND (eap.valido_ate IS NULL OR eap.valido_ate>now())
  UNION ALL
  SELECT prm.chave, o.permitido, o.scope_type, o.scope_id, 'excecao', o.id, NULL::uuid, o.valido_ate
  FROM public.access_overrides o
  JOIN public.access_permissions prm ON prm.id=o.permission_id
  WHERE o.user_id=p_user AND o.valido_de<=now() AND (o.valido_ate IS NULL OR o.valido_ate>now())
  UNION ALL
  SELECT prm.chave, true, d.scope_type, d.scope_id, 'substituicao', d.id, ap.id, d.fim_em
  FROM public.access_delegations d
  JOIN public.access_profiles ap ON ap.id=d.profile_id AND ap.ativo
  JOIN public.access_profile_permissions app ON app.profile_id=ap.id AND app.permitido
  JOIN public.access_permissions prm ON prm.id=app.permission_id
  WHERE d.para_user_id=p_user AND d.revogado_em IS NULL AND now()>=d.inicio_em AND now()<d.fim_em
$$;

-- ─── 4. Um escopo cobre o alvo? ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.access_escopo_cobre_obra(p_scope_type text, p_scope_id uuid, p_obra uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_scope_type='empresa'
      OR (p_scope_type='obra' AND p_scope_id IS NOT NULL AND p_scope_id=p_obra)
$$;

CREATE OR REPLACE FUNCTION public.access_escopo_cobre_funcionario(p_user uuid, p_scope_type text, p_scope_id uuid, p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT CASE p_scope_type
    WHEN 'empresa' THEN true
    WHEN 'proprio' THEN EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee AND e.user_id=p_user)
    WHEN 'equipe' THEN EXISTS(
      WITH RECURSIVE sub AS (
        SELECT e.id FROM public.employees e
        JOIN public.employees g ON g.id=e.gestor_imediato_id
        WHERE g.user_id=p_user
        UNION
        SELECT e.id FROM public.employees e JOIN sub ON e.gestor_imediato_id=sub.id
      ) SELECT 1 FROM sub WHERE sub.id=p_employee)
    WHEN 'setor' THEN p_scope_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.employee_department_assignments a
      WHERE a.employee_id=p_employee AND a.setor_id=p_scope_id
        AND a.valido_de<=current_date AND (a.valido_ate IS NULL OR a.valido_ate>=current_date))
    WHEN 'departamento' THEN p_scope_id IS NOT NULL AND (
      EXISTS(SELECT 1 FROM public.employee_department_assignments a
             WHERE a.employee_id=p_employee AND a.departamento_id=p_scope_id
               AND a.valido_de<=current_date AND (a.valido_ate IS NULL OR a.valido_ate>=current_date))
      OR EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee AND e.departamento_id=p_scope_id))
    WHEN 'obra' THEN p_scope_id IS NOT NULL AND (
      EXISTS(SELECT 1 FROM public.employee_obra_assignments a WHERE a.employee_id=p_employee AND a.obra_id=p_scope_id)
      OR EXISTS(SELECT 1 FROM public.obra_funcionarios a WHERE a.employee_id=p_employee AND a.obra_id=p_scope_id AND a.status=true))
    ELSE false
  END
$$;

-- ─── 5. Decisão ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pode_u(p_user uuid, p_chave text, p_obra uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT p_user IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.access_grants(p_user) g
               WHERE g.chave=p_chave AND g.permitido
                 AND public.access_escopo_cobre_obra(g.scope_type,g.scope_id,p_obra))
    AND NOT EXISTS(SELECT 1 FROM public.access_grants(p_user) g
               WHERE g.chave=p_chave AND NOT g.permitido
                 AND public.access_escopo_cobre_obra(g.scope_type,g.scope_id,p_obra))
$$;

CREATE OR REPLACE FUNCTION public.pode_funcionario_u(p_user uuid, p_chave text, p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT p_user IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.access_grants(p_user) g
               WHERE g.chave=p_chave AND g.permitido
                 AND public.access_escopo_cobre_funcionario(p_user,g.scope_type,g.scope_id,p_employee))
    AND NOT EXISTS(SELECT 1 FROM public.access_grants(p_user) g
               WHERE g.chave=p_chave AND NOT g.permitido
                 AND public.access_escopo_cobre_funcionario(p_user,g.scope_type,g.scope_id,p_employee))
$$;

-- Módulos sem obra nem funcionário (configurações, catálogos): só vale concessão da empresa
CREATE OR REPLACE FUNCTION public.pode_geral_u(p_user uuid, p_chave text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT p_user IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.access_grants(p_user) g WHERE g.chave=p_chave AND g.permitido AND g.scope_type='empresa')
    AND NOT EXISTS(SELECT 1 FROM public.access_grants(p_user) g WHERE g.chave=p_chave AND NOT g.permitido AND g.scope_type='empresa')
$$;

CREATE OR REPLACE FUNCTION public.pode(p_chave text, p_obra uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.pode_u(auth.uid(), p_chave, p_obra)
$$;

CREATE OR REPLACE FUNCTION public.pode_funcionario(p_chave text, p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.pode_funcionario_u(auth.uid(), p_chave, p_employee)
$$;

CREATE OR REPLACE FUNCTION public.pode_geral(p_chave text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.pode_geral_u(auth.uid(), p_chave)
$$;

CREATE OR REPLACE FUNCTION public.minhas_obras(p_chave text)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT ARRAY(
    SELECT o.id FROM public.obras o
    WHERE EXISTS(SELECT 1 FROM public.access_grants(auth.uid()) g
                 WHERE g.chave=p_chave AND g.permitido
                   AND public.access_escopo_cobre_obra(g.scope_type,g.scope_id,o.id))
      AND public.pode_u(auth.uid(), p_chave, o.id))
$$;

-- ─── 6. Funções existentes passam a usar o motor ────────────────────────────
-- Sem escopo, só uma concessão da empresa vale (antes, qualquer concessão passava).
CREATE OR REPLACE FUNCTION public.has_permission(p_chave text,p_scope_type text DEFAULT NULL,p_scope_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT CASE
    WHEN p_scope_type IS NULL OR p_scope_type='empresa' THEN public.pode_geral_u(auth.uid(),p_chave)
    WHEN p_scope_type='obra' THEN p_scope_id IS NOT NULL AND public.pode_u(auth.uid(),p_chave,p_scope_id)
    ELSE p_scope_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.access_grants(auth.uid()) g WHERE g.chave=p_chave AND g.permitido
                   AND (g.scope_type='empresa' OR (g.scope_type=p_scope_type AND g.scope_id=p_scope_id)))
      AND NOT EXISTS(SELECT 1 FROM public.access_grants(auth.uid()) g WHERE g.chave=p_chave AND NOT g.permitido
                   AND (g.scope_type='empresa' OR (g.scope_type=p_scope_type AND g.scope_id=p_scope_id)))
  END
$$;

-- O papel legado "admin" continua valendo até a etapa final da migração.
CREATE OR REPLACE FUNCTION public.access_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.get_user_role(auth.uid())::text='admin'
    OR public.pode_geral_u(auth.uid(),'controle_acesso.administrar'))
$$;

CREATE OR REPLACE FUNCTION public.get_effective_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  WITH g AS (SELECT * FROM public.access_grants(auth.uid())),
  negado_total AS (SELECT DISTINCT g.chave FROM g WHERE NOT g.permitido AND g.scope_type='empresa'),
  permitidos AS (
    SELECT DISTINCT g.chave, g.scope_type, g.scope_id FROM g
    WHERE g.permitido AND g.chave NOT IN (SELECT chave FROM negado_total))
  SELECT jsonb_build_object(
    'permissions', COALESCE((SELECT jsonb_agg(DISTINCT p.chave) FROM permitidos p),'[]'::jsonb),
    'grants', COALESCE((SELECT jsonb_agg(jsonb_build_object('chave',p.chave,'scope_type',p.scope_type,'scope_id',p.scope_id)) FROM permitidos p),'[]'::jsonb),
    'denies', COALESCE((SELECT jsonb_agg(jsonb_build_object('chave',g.chave,'scope_type',g.scope_type,'scope_id',g.scope_id)) FROM g WHERE NOT g.permitido),'[]'::jsonb),
    'profiles', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ap.id,'nome',ap.nome,'scope_type',eap.scope_type,'scope_id',eap.scope_id,'valido_ate',eap.valido_ate))
      FROM public.employee_access_profiles eap JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.ativo
      WHERE eap.user_id=auth.uid() AND eap.revogado_em IS NULL
        AND eap.valido_de<=now() AND (eap.valido_ate IS NULL OR eap.valido_ate>now())),'[]'::jsonb)
  )
$$;

-- Limite vale pelo perfil (atribuído ou recebido em substituição) cujo escopo cobre o alvo
CREATE OR REPLACE FUNCTION public.can_approve_amount(p_modulo text,p_valor numeric,p_scope_type text DEFAULT 'empresa',p_scope_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT public.has_permission(p_modulo||'.aprovar',p_scope_type,p_scope_id) AND EXISTS(
    SELECT 1 FROM public.access_grants(auth.uid()) g
    JOIN public.access_approval_limits l ON l.profile_id=g.profile_id AND l.modulo=p_modulo
    WHERE g.chave=p_modulo||'.aprovar' AND g.permitido AND g.origem IN ('perfil','substituicao')
      AND p_valor<=l.limite
      AND (g.scope_type='empresa' OR (g.scope_type=p_scope_type AND g.scope_id=p_scope_id))
      AND (l.scope_type='empresa' OR (l.scope_type=p_scope_type AND (l.scope_id IS NULL OR l.scope_id=p_scope_id))))
$$;

-- ─── 7. Explicar e simular (tela de Controle de Acesso) ─────────────────────
CREATE OR REPLACE FUNCTION public.access_explain(p_user uuid, p_chave text, p_obra uuid DEFAULT NULL, p_employee uuid DEFAULT NULL)
RETURNS TABLE(origem text, detalhe text, scope_type text, scope_id uuid, permitido boolean, valido_ate timestamptz, cobre_alvo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR (p_user<>auth.uid() AND NOT public.access_is_admin()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY
  SELECT g.origem,
    CASE g.origem
      WHEN 'perfil' THEN (SELECT ap.nome FROM public.access_profiles ap WHERE ap.id=g.profile_id)
      WHEN 'substituicao' THEN 'Substituição: '||(SELECT ap.nome FROM public.access_profiles ap WHERE ap.id=g.profile_id)
      ELSE CASE WHEN g.permitido THEN 'Exceção individual (libera)' ELSE 'Exceção individual (bloqueia)' END
    END,
    g.scope_type, g.scope_id, g.permitido, g.valido_ate,
    CASE
      WHEN p_obra IS NOT NULL THEN public.access_escopo_cobre_obra(g.scope_type,g.scope_id,p_obra)
      WHEN p_employee IS NOT NULL THEN public.access_escopo_cobre_funcionario(p_user,g.scope_type,g.scope_id,p_employee)
      ELSE g.scope_type='empresa'
    END
  FROM public.access_grants(p_user) g
  WHERE g.chave=p_chave;
END $$;

CREATE OR REPLACE FUNCTION public.access_simular(p_user uuid, p_chave text, p_obra uuid DEFAULT NULL, p_employee uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF NOT public.access_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN CASE
    WHEN p_obra IS NOT NULL THEN public.pode_u(p_user,p_chave,p_obra)
    WHEN p_employee IS NOT NULL THEN public.pode_funcionario_u(p_user,p_chave,p_employee)
    ELSE public.pode_geral_u(p_user,p_chave)
  END;
END $$;

-- ─── 8. Desligamento revoga na hora ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.access_revogar_desligado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.status IN ('inativo','desligado','demitido')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.employee_access_profiles SET revogado_em=now(), revogado_por=auth.uid()
    WHERE user_id=NEW.user_id AND revogado_em IS NULL;
    UPDATE public.access_delegations SET revogado_em=now()
    WHERE (para_user_id=NEW.user_id OR de_user_id=NEW.user_id) AND revogado_em IS NULL AND fim_em>now();
    UPDATE public.access_overrides
    SET valido_de=LEAST(valido_de, now()-interval '1 second'), valido_ate=now()
    WHERE user_id=NEW.user_id AND permitido AND (valido_ate IS NULL OR valido_ate>now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_access_revogar_desligado ON public.employees;
CREATE TRIGGER trg_access_revogar_desligado
  AFTER UPDATE OF status ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.access_revogar_desligado();

-- ─── 9. Permissões de execução ──────────────────────────────────────────────
-- As versões com usuário explícito revelam o acesso de terceiros: só uso interno.
REVOKE ALL ON FUNCTION public.access_grants(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.access_escopo_cobre_funcionario(uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pode_u(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pode_funcionario_u(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pode_geral_u(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.access_revogar_desligado() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.pode(text,uuid), public.pode_funcionario(text,uuid), public.pode_geral(text),
  public.minhas_obras(text), public.can_approve_amount(text,numeric,text,uuid),
  public.access_explain(uuid,text,uuid,uuid), public.access_simular(uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode(text,uuid), public.pode_funcionario(text,uuid), public.pode_geral(text),
  public.minhas_obras(text), public.can_approve_amount(text,numeric,text,uuid),
  public.access_explain(uuid,text,uuid,uuid), public.access_simular(uuid,text,uuid,uuid) TO authenticated;

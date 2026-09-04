-- Trilha central e imutavel de auditoria do sistema.
CREATE TABLE IF NOT EXISTS public.auditoria_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocorrido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_email text,
  usuario_nome text,
  usuario_perfil text,
  acao text NOT NULL CHECK (acao IN ('LOGIN','LOGOUT','INSERT','UPDATE','DELETE','EXPORT','ACCESS','DENIED')),
  modulo text NOT NULL,
  tabela text,
  registro_id text,
  obra_id uuid,
  dados_anteriores jsonb,
  dados_novos jsonb,
  origem text NOT NULL DEFAULT 'sistema-gerencial',
  ip inet,
  user_agent text,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS auditoria_eventos_ocorrido_idx ON public.auditoria_eventos (ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS auditoria_eventos_usuario_idx ON public.auditoria_eventos (usuario_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS auditoria_eventos_modulo_idx ON public.auditoria_eventos (modulo, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS auditoria_eventos_obra_idx ON public.auditoria_eventos (obra_id, ocorrido_em DESC) WHERE obra_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.auditoria_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entrada_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  saida_em timestamptz,
  ultimo_acesso_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  origem text NOT NULL DEFAULT 'sistema-gerencial',
  ip inet,
  user_agent text,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS auditoria_sessoes_usuario_idx ON public.auditoria_sessoes (usuario_id, entrada_em DESC);

ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_sessoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auditoria_eventos, public.auditoria_sessoes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auditoria_eh_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND public.get_user_role(auth.uid())::text = 'admin'
$$;

DROP POLICY IF EXISTS auditoria_eventos_admin_read ON public.auditoria_eventos;
CREATE POLICY auditoria_eventos_admin_read ON public.auditoria_eventos FOR SELECT TO authenticated USING (public.auditoria_eh_admin());
DROP POLICY IF EXISTS auditoria_sessoes_admin_read ON public.auditoria_sessoes;
CREATE POLICY auditoria_sessoes_admin_read ON public.auditoria_sessoes FOR SELECT TO authenticated USING (public.auditoria_eh_admin());
GRANT SELECT ON public.auditoria_eventos, public.auditoria_sessoes TO authenticated;

CREATE OR REPLACE FUNCTION public.auditoria_limpar_dados(valor jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN valor IS NULL THEN NULL ELSE
    (SELECT coalesce(jsonb_object_agg(key,
      CASE WHEN lower(key) ~ '(senha|password|secret|segredo|token|assinatura|cpf|rg|documento|access_token|refresh_token)'
           THEN '"[PROTEGIDO]"'::jsonb ELSE value END), '{}'::jsonb)
     FROM jsonb_each(valor)) END
$$;

CREATE OR REPLACE FUNCTION public.auditoria_capturar_alteracao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE
  antes jsonb; depois jsonb; atual jsonb; cab jsonb; uid uuid; obra uuid; rid text;
  nome text; email text; perfil text; endereco inet;
BEGIN
  uid := auth.uid();
  antes := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  depois := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  atual := coalesce(depois, antes, '{}'::jsonb);
  rid := coalesce(atual->>'id', atual->>'uuid', atual->>'codigo');
  BEGIN obra := nullif(atual->>'obra_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN obra := NULL; END;
  SELECT p.nome, p.email INTO nome,email FROM public.profiles p WHERE p.user_id=uid LIMIT 1;
  perfil := CASE WHEN uid IS NULL THEN NULL ELSE public.get_user_role(uid)::text END;
  BEGIN cab := current_setting('request.headers',true)::jsonb; EXCEPTION WHEN OTHERS THEN cab := '{}'::jsonb; END;
  BEGIN endereco := nullif(split_part(coalesce(cab->>'x-forwarded-for',cab->>'x-real-ip',''),',',1),'')::inet; EXCEPTION WHEN OTHERS THEN endereco := NULL; END;
  INSERT INTO public.auditoria_eventos(usuario_id,usuario_email,usuario_nome,usuario_perfil,acao,modulo,tabela,registro_id,obra_id,dados_anteriores,dados_novos,origem,ip,user_agent)
  VALUES(uid,coalesce(email,auth.jwt()->>'email'),nome,perfil,TG_OP,replace(TG_TABLE_NAME,'_',' '),TG_TABLE_NAME,rid,obra,
    public.auditoria_limpar_dados(antes),public.auditoria_limpar_dados(depois),coalesce(cab->>'x-client-info','sistema-gerencial'),endereco,cab->>'user-agent');
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Cobertura inicial dos cadastros e operacoes de maior impacto. O bloco e idempotente
-- e ignora tabelas de modulos ainda nao instalados no ambiente.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'profiles','user_roles','employees','obras','obra_funcionarios','vehicles','heavy_vehicles',
    'maintenance_records','fornecedores','materiais_catalogo','almoxarifado_movimentos',
    'almoxarifado_entregas','almoxarifado_devolucoes','requisicoes_compra','ordens_compra',
    'ferramentas_catalogo','ferramentas_alocacao','cronograma_itens','cronograma_avancos',
    'subcontratadas','orcamentos_obra','lancamentos_obra','fundo_fixo','fundo_fixo_lancamentos',
    'nao_conformidades','qualidade_inspecoes_servicos','sms_desvios','sms_inspecoes',
    'sms_dds','sms_aprs','sms_ocorrencias','sms_rdo','sms_admissoes','sms_colaborador_treinamentos',
    'ponto_totem_dispositivos','employee_ponto_qr','employee_ponto_registros'
  ] LOOP
    IF to_regclass('public.'||tab) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.%I',tab);
      EXECUTE format('CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao()',tab);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.registrar_sessao_auditoria(p_evento text, p_origem text DEFAULT 'sistema-gerencial', p_user_agent text DEFAULT NULL, p_sessao uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE sid uuid; v_nome text; v_email text; cab jsonb; endereco inet;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao necessaria'; END IF;
  IF upper(p_evento) NOT IN ('LOGIN','LOGOUT','ACCESS') THEN RAISE EXCEPTION 'Evento invalido'; END IF;
  BEGIN cab := current_setting('request.headers',true)::jsonb; EXCEPTION WHEN OTHERS THEN cab := '{}'::jsonb; END;
  BEGIN endereco := nullif(split_part(coalesce(cab->>'x-forwarded-for',cab->>'x-real-ip',''),',',1),'')::inet; EXCEPTION WHEN OTHERS THEN endereco := NULL; END;
  SELECT nome,email INTO v_nome,v_email FROM public.profiles WHERE user_id=auth.uid() LIMIT 1;
  IF upper(p_evento)='LOGIN' THEN
    INSERT INTO public.auditoria_sessoes(usuario_id,origem,ip,user_agent) VALUES(auth.uid(),left(coalesce(p_origem,'sistema-gerencial'),60),endereco,left(p_user_agent,500)) RETURNING id INTO sid;
  ELSE
    sid := p_sessao;
    IF sid IS NULL THEN SELECT id INTO sid FROM public.auditoria_sessoes WHERE usuario_id=auth.uid() AND saida_em IS NULL ORDER BY entrada_em DESC LIMIT 1; END IF;
    IF upper(p_evento)='LOGOUT' THEN UPDATE public.auditoria_sessoes SET saida_em=clock_timestamp(),ultimo_acesso_em=clock_timestamp() WHERE id=sid AND usuario_id=auth.uid();
    ELSE UPDATE public.auditoria_sessoes SET ultimo_acesso_em=clock_timestamp() WHERE id=sid AND usuario_id=auth.uid(); END IF;
  END IF;
  INSERT INTO public.auditoria_eventos(usuario_id,usuario_email,usuario_nome,usuario_perfil,acao,modulo,registro_id,origem,ip,user_agent)
  VALUES(auth.uid(),coalesce(v_email,auth.jwt()->>'email'),v_nome,public.get_user_role(auth.uid())::text,upper(p_evento),'Autenticacao',sid::text,left(coalesce(p_origem,'sistema-gerencial'),60),endereco,left(p_user_agent,500));
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.listar_auditoria(p_inicio timestamptz, p_fim timestamptz, p_usuario text DEFAULT NULL, p_modulo text DEFAULT NULL, p_acao text DEFAULT NULL, p_limite integer DEFAULT 250)
RETURNS SETOF public.auditoria_eventos LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.auditoria_eh_admin() THEN RAISE EXCEPTION 'Acesso exclusivo do administrador'; END IF;
  RETURN QUERY SELECT a.* FROM public.auditoria_eventos a
   WHERE a.ocorrido_em >= p_inicio AND a.ocorrido_em < p_fim
     AND (nullif(trim(p_usuario),'') IS NULL OR a.usuario_nome ILIKE '%'||trim(p_usuario)||'%' OR a.usuario_email ILIKE '%'||trim(p_usuario)||'%')
     AND (nullif(p_modulo,'') IS NULL OR a.modulo=p_modulo)
     AND (nullif(p_acao,'') IS NULL OR a.acao=p_acao)
   ORDER BY a.ocorrido_em DESC LIMIT least(greatest(coalesce(p_limite,250),1),1000);
END $$;

REVOKE ALL ON FUNCTION public.auditoria_limpar_dados(jsonb),public.auditoria_capturar_alteracao() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registrar_sessao_auditoria(text,text,text,uuid),public.listar_auditoria(timestamptz,timestamptz,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_sessao_auditoria(text,text,text,uuid),public.listar_auditoria(timestamptz,timestamptz,text,text,text,integer) TO authenticated;

COMMENT ON TABLE public.auditoria_eventos IS 'Trilha imutavel de acoes relevantes, com dados sensiveis mascarados.';
COMMENT ON TABLE public.auditoria_sessoes IS 'Historico de entrada, saida e ultimo acesso das sessoes.';

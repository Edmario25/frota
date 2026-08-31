BEGIN;
-- Requer a integração operacional 20260830000002.
CREATE TABLE public.sms_treinamento_requisitos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), obra_id uuid NOT NULL REFERENCES public.obras(id),
 cargo_id uuid REFERENCES public.cargos(id), treinamento_id uuid NOT NULL REFERENCES public.sms_treinamentos_catalogo(id),
 ativo boolean NOT NULL DEFAULT true, motivo text NOT NULL, atualizado_por uuid REFERENCES auth.users(id), atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sms_tr_req_unico ON public.sms_treinamento_requisitos(obra_id,treinamento_id,coalesce(cargo_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE public.sms_treinamento_requisitos_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requisito_id uuid NOT NULL REFERENCES public.sms_treinamento_requisitos(id),
 autor uuid REFERENCES auth.users(id), data timestamptz NOT NULL DEFAULT now(), anterior jsonb, novo jsonb NOT NULL
);
ALTER TABLE public.sms_treinamento_requisitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_treinamento_requisitos_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_treinamento_requisitos,public.sms_treinamento_requisitos_historico FROM PUBLIC,anon,authenticated;

-- Datas decidem a validade; o status pendente não é convertido em aprovação.
CREATE FUNCTION public.sms_treinamento_valido(p_employee uuid,p_obra uuid,p_treinamento uuid,p_inicio date,p_fim date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.adm_acesso(p_obra) AND EXISTS(SELECT 1 FROM obra_funcionarios WHERE employee_id=p_employee AND obra_id=p_obra AND status) AND EXISTS(
 SELECT 1 FROM sms_colaborador_treinamentos t JOIN sms_treinamentos_catalogo c ON c.id=t.treinamento_id
 WHERE t.colaborador_id=p_employee AND t.treinamento_id=p_treinamento AND (t.obra_id IS NULL OR t.obra_id=p_obra)
 AND t.status IN ('em_dia','a_vencer','vencido') AND t.data_realizacao<=p_inicio
 AND ((t.data_vencimento IS NULL AND coalesce(c.validade_meses,0)=0) OR t.data_vencimento>=p_fim));
$$;
CREATE FUNCTION public.sms_treinamentos_exigidos(p_employee uuid,p_obra uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.id FROM sms_treinamentos_catalogo c WHERE public.adm_acesso(p_obra) AND EXISTS(SELECT 1 FROM obra_funcionarios WHERE employee_id=p_employee AND obra_id=p_obra AND status) AND c.ativo AND c.obrigatorio
 UNION SELECT r.treinamento_id FROM sms_treinamento_requisitos r JOIN employees e ON e.id=p_employee
 WHERE public.adm_acesso(p_obra) AND EXISTS(SELECT 1 FROM obra_funcionarios WHERE employee_id=p_employee AND obra_id=p_obra AND status) AND r.obra_id=p_obra AND r.ativo AND (r.cargo_id IS NULL OR r.cargo_id=e.cargo_id)
 UNION SELECT unnest(a.treinamentos_exigidos) FROM sms_admissoes a
 WHERE public.adm_acesso(p_obra) AND EXISTS(SELECT 1 FROM obra_funcionarios WHERE employee_id=p_employee AND obra_id=p_obra AND status) AND a.colaborador_id=p_employee AND a.obra_id=p_obra AND a.status<>'cancelada';
$$;
CREATE FUNCTION public.sms_matriz_regra(p_obra uuid,p_cargo uuid,p_treinamento uuid,p_ativo boolean,p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE antes sms_treinamento_requisitos; depois sms_treinamento_requisitos;
BEGIN
 IF NOT public.adm_acesso(p_obra) OR NOT public.adm_pode_rh() THEN RAISE EXCEPTION 'Somente gestão autorizada da obra pode alterar requisitos'; END IF;
 IF length(trim(coalesce(p_motivo,'')))<5 OR p_ativo IS NULL THEN RAISE EXCEPTION 'Informe justificativa e situação'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sms_treinamentos_catalogo WHERE id=p_treinamento AND ativo) THEN RAISE EXCEPTION 'Selecione treinamento ativo'; END IF;
 PERFORM 1 FROM obras WHERE id=p_obra FOR UPDATE;
 SELECT * INTO antes FROM sms_treinamento_requisitos WHERE obra_id=p_obra AND cargo_id IS NOT DISTINCT FROM p_cargo AND treinamento_id=p_treinamento;
 IF antes.id IS NULL THEN
 INSERT INTO sms_treinamento_requisitos(obra_id,cargo_id,treinamento_id,ativo,motivo,atualizado_por) VALUES(p_obra,p_cargo,p_treinamento,p_ativo,trim(p_motivo),auth.uid()) RETURNING * INTO depois;
 ELSE
 UPDATE sms_treinamento_requisitos SET ativo=p_ativo,motivo=trim(p_motivo),atualizado_por=auth.uid(),atualizado_em=now() WHERE id=antes.id RETURNING * INTO depois;
 END IF;
 INSERT INTO sms_treinamento_requisitos_historico(requisito_id,autor,anterior,novo) VALUES(depois.id,auth.uid(),to_jsonb(antes),to_jsonb(depois));
END $$;

CREATE FUNCTION public.sms_matriz_dados(p_obra uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; resultado jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária'; END IF;
 IF p_obra IS NOT NULL AND NOT public.adm_acesso(p_obra) THEN RAISE EXCEPTION 'Obra sem acesso'; END IF;
 WITH equipe AS (
 SELECT DISTINCT e.id,e.nome,e.cargo_id,c.nome cargo,o.id obra_id,o.nome obra
 FROM employees e JOIN obra_funcionarios v ON v.employee_id=e.id AND v.status
 JOIN obras o ON o.id=v.obra_id LEFT JOIN cargos c ON c.id=e.cargo_id
 WHERE e.status='ativo' AND public.adm_acesso(o.id) AND (p_obra IS NULL OR o.id=p_obra)
 ), linhas AS (
 SELECT e.*,coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'status',
 CASE WHEN public.sms_treinamento_valido(e.id,e.obra_id,c.id,hoje,hoje) THEN CASE WHEN melhor.data_vencimento<=hoje+30 THEN 'a_vencer' ELSE 'valido' END
 WHEN melhor.id IS NULL THEN 'nao_realizado'
 WHEN melhor.status='pendente' OR melhor.data_realizacao IS NULL OR melhor.data_realizacao>hoje OR (melhor.data_vencimento IS NULL AND coalesce(c.validade_meses,0)>0) THEN 'conferencia'
 ELSE 'vencido' END,
 'vencimento',melhor.data_vencimento,'realizacao',melhor.data_realizacao,
 'historico',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'realizacao',h.data_realizacao,'vencimento',h.data_vencimento,'status_registrado',h.status) ORDER BY h.data_realizacao DESC NULLS LAST,h.id)
 FROM sms_colaborador_treinamentos h WHERE h.colaborador_id=e.id AND h.treinamento_id=c.id AND (h.obra_id IS NULL OR h.obra_id=e.obra_id)),'[]')) ORDER BY c.nome)
 FROM sms_treinamentos_catalogo c
 LEFT JOIN LATERAL (SELECT t.* FROM sms_colaborador_treinamentos t WHERE t.colaborador_id=e.id AND t.treinamento_id=c.id AND (t.obra_id IS NULL OR t.obra_id=e.obra_id)
 ORDER BY (t.status IN ('em_dia','a_vencer','vencido') AND t.data_realizacao<=hoje AND (t.data_vencimento>=hoje OR (t.data_vencimento IS NULL AND coalesce(c.validade_meses,0)=0))) DESC NULLS LAST,
 t.data_realizacao DESC NULLS LAST,t.data_vencimento DESC NULLS FIRST,t.id LIMIT 1) melhor ON true
 WHERE c.id IN (SELECT public.sms_treinamentos_exigidos(e.id,e.obra_id))),'[]') requisitos FROM equipe e
 ) SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY obra,nome,id),'[]') INTO resultado FROM linhas l;
 RETURN jsonb_build_object('data',hoje,'equipe',resultado,'pode_configurar',public.adm_pode_rh(),
 'catalogo',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'obrigatorio',obrigatorio) ORDER BY nome),'[]') FROM sms_treinamentos_catalogo WHERE ativo AND EXISTS(SELECT 1 FROM obras WHERE public.adm_acesso(id))),
 'cargos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome) ORDER BY nome),'[]') FROM cargos WHERE EXISTS(SELECT 1 FROM obras WHERE public.adm_acesso(id))),
 'regras',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM sms_treinamento_requisitos r WHERE public.adm_acesso(r.obra_id) AND (p_obra IS NULL OR r.obra_id=p_obra)));
END $$;

-- Reutiliza a mesma base na integração; falha explicitamente se a função anterior divergir.
DO $migration$
DECLARE definicao text; alterada text;
BEGIN
 SELECT pg_get_functiondef('public.adm_pendencias(uuid)'::regprocedure) INTO definicao;
 alterada:=replace(definicao,'(c.ativo AND c.obrigatorio) OR c.id=ANY(a.treinamentos_exigidos)','c.id IN (SELECT public.sms_treinamentos_exigidos(a.colaborador_id,a.obra_id))');
 alterada:=replace(alterada,'NOT EXISTS(SELECT 1 FROM sms_colaborador_treinamentos ct WHERE ct.colaborador_id=a.colaborador_id AND ct.treinamento_id=t.id AND (ct.obra_id IS NULL OR ct.obra_id=a.obra_id) AND ct.status IN (''em_dia'',''a_vencer'') AND ct.data_realizacao<=hoje AND (ct.data_vencimento>=hoje OR (ct.data_vencimento IS NULL AND coalesce(t.validade_meses,0)=0)))','NOT public.sms_treinamento_valido(a.colaborador_id,a.obra_id,t.id,hoje,hoje)');
 IF alterada=definicao OR position('NOT public.sms_treinamento_valido' IN alterada)=0 THEN RAISE EXCEPTION 'Versão de adm_pendencias incompatível; aplique 20260830000002 primeiro'; END IF;
 EXECUTE alterada;
 -- APR mantém seus requisitos de atividade e a validade para todo o período.
 IF to_regprocedure('public.apr_pendencias(uuid)') IS NOT NULL THEN
 SELECT pg_get_functiondef('public.apr_pendencias(uuid)'::regprocedure) INTO definicao;
 alterada:=replace(definicao,'tc.obrigatorio OR tc.id::text IN','tc.id IN (SELECT public.sms_treinamentos_exigidos(e.colaborador_id,a.obra_id)) OR tc.id::text IN');
 alterada:=replace(alterada,'NOT EXISTS(SELECT 1 FROM sms_colaborador_treinamentos ct WHERE ct.colaborador_id=e.colaborador_id AND ct.treinamento_id=t.id AND (ct.obra_id IS NULL OR ct.obra_id=a.obra_id) AND ct.status IN (''em_dia'',''a_vencer'') AND ct.data_realizacao<=least(inicio,(now() AT TIME ZONE ''America/Sao_Paulo'')::date) AND ((ct.data_vencimento IS NULL AND coalesce(t.validade_meses,0)=0) OR ct.data_vencimento>=coalesce(fim,inicio)))','NOT public.sms_treinamento_valido(e.colaborador_id,a.obra_id,t.id,least(inicio,(now() AT TIME ZONE ''America/Sao_Paulo'')::date),coalesce(fim,inicio))');
 IF alterada=definicao OR position('NOT public.sms_treinamento_valido' IN alterada)=0 THEN RAISE EXCEPTION 'Versão APR incompatível; revise a migração antes de continuar'; END IF;
 EXECUTE alterada;
 END IF;
END $migration$;
REVOKE ALL ON FUNCTION public.sms_treinamento_valido(uuid,uuid,uuid,date,date),public.sms_treinamentos_exigidos(uuid,uuid),public.sms_matriz_regra(uuid,uuid,uuid,boolean,text),public.sms_matriz_dados(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sms_treinamento_valido(uuid,uuid,uuid,date,date),public.sms_treinamentos_exigidos(uuid,uuid),public.sms_matriz_regra(uuid,uuid,uuid,boolean,text),public.sms_matriz_dados(uuid) TO authenticated;
COMMIT;

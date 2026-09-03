BEGIN;
-- Requer as migrações SMS/RH e DDS operacional anteriores. Não libera registros antigos.
ALTER TABLE public.sms_aprs
 ADD COLUMN IF NOT EXISTS plano jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS revisao integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS source_payload jsonb,
 ADD COLUMN IF NOT EXISTS liberado_por uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS liberado_em timestamptz;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.sms_aprs'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%' LOOP
 EXECUTE format('ALTER TABLE public.sms_aprs DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE public.sms_aprs ADD CONSTRAINT apr_status_operacional CHECK(status IN ('aberta','rascunho','em_analise','liberada','em_execucao','suspensa','concluida','cancelada'));
ALTER TABLE public.sms_aprs ALTER COLUMN status SET DEFAULT 'rascunho';
ALTER TABLE public.sms_apr_envolvidos ADD COLUMN IF NOT EXISTS ciencia jsonb;
CREATE TABLE public.sms_apr_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), apr_id uuid NOT NULL REFERENCES public.sms_aprs(id),
 evento text NOT NULL, motivo text, autor_id uuid REFERENCES auth.users(id), criado_em timestamptz NOT NULL DEFAULT now(), dados jsonb NOT NULL
);
ALTER TABLE public.sms_apr_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY apr_historico_ler ON public.sms_apr_historico FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.sms_aprs a WHERE a.id=apr_id AND public.dds_pode_acessar(a.obra_id)));
GRANT SELECT ON public.sms_apr_historico TO authenticated;
-- Execuções legadas não possuem comprovação de liberação neste fluxo.
INSERT INTO sms_apr_historico(apr_id,evento,motivo,dados)
 SELECT id,'migracao','Execução legada suspensa para revisão no novo fluxo',to_jsonb(a) FROM sms_aprs a WHERE status='em_execucao' AND liberado_por IS NULL;
UPDATE sms_aprs SET status='suspensa',versao=versao+1 WHERE status='em_execucao' AND liberado_por IS NULL;
REVOKE INSERT,UPDATE,DELETE ON public.sms_aprs,public.sms_apr_riscos_selecionados,public.sms_apr_envolvidos,public.sms_apr_historico FROM PUBLIC,anon,authenticated;
CREATE POLICY apr_ler_app ON public.sms_aprs FOR SELECT TO authenticated USING(public.dds_pode_acessar(obra_id));
-- A inclusão no rascunho não atesta aptidão. A validação completa ocorre ao liberar e iniciar.
DROP TRIGGER IF EXISTS trg_sms_apr_bloqueio_rh ON public.sms_apr_envolvidos;

CREATE FUNCTION public.apr_catalogos(p_obra uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(public.dds_pode_acessar(p_obra),false) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN jsonb_build_object(
 'tipos',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY nome),'[]') FROM sms_apr_tipos_atividade t WHERE ativo),
 'riscos',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY nome),'[]') FROM sms_apr_riscos_catalogo r WHERE ativo),
 'treinamentos',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY nome),'[]') FROM sms_treinamentos_catalogo t),
 'pts',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY data_inicio DESC),'[]') FROM sms_pt p WHERE obra_id=p_obra AND status NOT IN ('cancelada','encerrada')));
END $$;

CREATE FUNCTION public.apr_salvar(p_id uuid,p_dados jsonb,p_versao integer DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_aprs; obra uuid; r jsonb; participante jsonb; anterior jsonb;
BEGIN
 obra:=nullif(p_dados->>'obra_id','')::uuid;
 IF obra IS NULL OR NOT coalesce(public.dds_pode_acessar(obra),false) THEN RAISE EXCEPTION 'Obra sem acesso'; END IF;
 IF octet_length(p_dados::text)>2000000 THEN RAISE EXCEPTION 'Documento muito grande'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO a FROM sms_aprs WHERE id=p_id FOR UPDATE;
 IF a.id IS NOT NULL THEN
   IF NOT coalesce(public.dds_pode_acessar(a.obra_id),false) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   IF p_versao IS NULL THEN
     IF a.source_payload=p_dados THEN RETURN p_id; END IF;
     RAISE EXCEPTION 'UUID já registrado com conteúdo diferente. Nenhuma informação foi sobrescrita';
   END IF;
   IF a.versao IS DISTINCT FROM p_versao OR a.status NOT IN ('rascunho','aberta') THEN RAISE EXCEPTION 'APR alterada ou protegida. Atualize ou solicite revisão'; END IF;
 END IF;
 IF nullif(trim(p_dados->>'local'),'') IS NULL OR nullif(trim(p_dados->>'responsavel'),'') IS NULL OR nullif(p_dados->>'data_hora_inicio','') IS NULL THEN RAISE EXCEPTION 'Informe local, responsável e início'; END IF;
 IF jsonb_typeof(p_dados->'riscos') IS DISTINCT FROM 'array' OR jsonb_typeof(p_dados->'participantes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Listas inválidas'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_dados->'riscos'))<>(SELECT count(DISTINCT x->>'risco_id') FROM jsonb_array_elements(p_dados->'riscos') x) THEN RAISE EXCEPTION 'Riscos duplicados'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_dados->'participantes'))<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_dados->'participantes') x) THEN RAISE EXCEPTION 'Participantes duplicados'; END IF;
 anterior:=jsonb_build_object('apr',to_jsonb(a),'equipe',(SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]') FROM sms_apr_envolvidos e WHERE apr_id=p_id),'riscos',(SELECT coalesce(jsonb_agg(to_jsonb(antigo)),'[]') FROM sms_apr_riscos_selecionados antigo WHERE apr_id=p_id));
 INSERT INTO sms_aprs(id,obra_id,tipo_atividade_id,local,responsavel,data_hora_inicio,validade,descricao_trabalho,observacoes,status,plano,source_payload,registrado_por)
 VALUES(p_id,obra,nullif(p_dados->>'tipo_atividade_id','')::uuid,trim(p_dados->>'local'),trim(p_dados->>'responsavel'),(p_dados->>'data_hora_inicio')::timestamptz,nullif(p_dados->>'validade','')::timestamptz,p_dados->>'descricao_trabalho',p_dados->>'observacoes','rascunho',p_dados,p_dados,auth.uid())
 ON CONFLICT(id) DO UPDATE SET obra_id=EXCLUDED.obra_id,tipo_atividade_id=EXCLUDED.tipo_atividade_id,local=EXCLUDED.local,responsavel=EXCLUDED.responsavel,data_hora_inicio=EXCLUDED.data_hora_inicio,validade=EXCLUDED.validade,descricao_trabalho=EXCLUDED.descricao_trabalho,observacoes=EXCLUDED.observacoes,status='rascunho',plano=EXCLUDED.plano,versao=sms_aprs.versao+1,revisao=sms_aprs.revisao+1,liberado_por=NULL,liberado_em=NULL;
 DELETE FROM sms_apr_riscos_selecionados WHERE apr_id=p_id;
 FOR r IN SELECT value FROM jsonb_array_elements(p_dados->'riscos') LOOP
   IF coalesce(r->>'resposta','S') NOT IN ('S','N','NA') THEN RAISE EXCEPTION 'Resposta de risco inválida'; END IF;
   INSERT INTO sms_apr_riscos_selecionados(apr_id,risco_id,medida_controle,resposta,eliminado)
   VALUES(p_id,(r->>'risco_id')::uuid,r->>'medida_controle',coalesce(r->>'resposta','S'),false);
 END LOOP;
 -- Nome oficial congelado na revisão; não confiar no rótulo enviado pelo dispositivo.
 UPDATE sms_aprs SET plano=jsonb_set(plano,'{riscos}',coalesce((SELECT jsonb_agg(x.value||jsonb_build_object('nome',c.nome) ORDER BY x.ord)
 FROM jsonb_array_elements(p_dados->'riscos') WITH ORDINALITY x(value,ord) JOIN sms_apr_riscos_catalogo c ON c.id=(x.value->>'risco_id')::uuid),'[]'::jsonb)) WHERE id=p_id;
 DELETE FROM sms_apr_envolvidos WHERE apr_id=p_id;
 FOR participante IN SELECT value FROM jsonb_array_elements(p_dados->'participantes') LOOP
   IF NOT EXISTS(SELECT 1 FROM obra_funcionarios v JOIN employees e ON e.id=v.employee_id WHERE v.obra_id=obra AND v.status AND e.status='ativo' AND e.id=(participante->>'id')::uuid) THEN RAISE EXCEPTION 'Participante sem vínculo ativo na obra'; END IF;
   INSERT INTO sms_apr_envolvidos(apr_id,colaborador_id,assinou) VALUES(p_id,(participante->>'id')::uuid,false);
 END LOOP;
 INSERT INTO sms_apr_historico(apr_id,evento,autor_id,dados) VALUES(p_id,'rascunho',auth.uid(),jsonb_build_object('anterior',anterior,'novo',p_dados));
 RETURN p_id;
END $$;

CREATE FUNCTION public.apr_pendencias(p_id uuid) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_aprs; erros text[]:='{}'; r jsonb; e record; aso record; inicio date; fim date; t record;
BEGIN
 SELECT * INTO a FROM sms_aprs WHERE id=p_id;
 IF a.id IS NULL OR NOT coalesce(public.dds_pode_acessar(a.obra_id),false) THEN RAISE EXCEPTION 'APR indisponível'; END IF;
 inicio:=(a.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')::date;
 fim:=(a.validade AT TIME ZONE 'America/Sao_Paulo')::date;
 IF a.tipo_atividade_id IS NULL OR nullif(trim(a.descricao_trabalho),'') IS NULL THEN erros:=array_append(erros,'Informe atividade e descrição'); END IF;
 IF a.validade IS NULL OR a.validade<=a.data_hora_inicio OR a.validade<=now() THEN erros:=array_append(erros,'Validade ausente, inválida ou vencida'); END IF;
 IF nullif(trim(a.plano->>'emergencia'),'') IS NULL THEN erros:=array_append(erros,'Informe resposta a emergências e contato'); END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(a.plano->'riscos','[]')) x WHERE x->>'resposta'='S') THEN erros:=array_append(erros,'Identifique ao menos um risco aplicável'); END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(a.plano->'riscos','[]')) WHERE value->>'resposta'='S' LOOP
   IF nullif(trim(r->>'etapa'),'') IS NULL OR nullif(trim(r->>'medida_controle'),'') IS NULL OR nullif(trim(r->>'responsavel'),'') IS NULL OR NOT coalesce((r->>'verificado')::boolean,false)
   THEN erros:=array_append(erros,'Risco sem etapa, medida, responsável ou controle verificado'); END IF;
   IF coalesce((r->>'p')::int,0) NOT BETWEEN 1 AND 5 OR coalesce((r->>'s')::int,0) NOT BETWEEN 1 AND 5 OR coalesce((r->>'pr')::int,0) NOT BETWEEN 1 AND 5 OR coalesce((r->>'sr')::int,0) NOT BETWEEN 1 AND 5 THEN erros:=array_append(erros,'Avalie probabilidade e severidade inicial/residual (1 a 5)');
   ELSIF (r->>'pr')::int*(r->>'sr')::int>=15 THEN erros:=array_append(erros,'Risco residual alto: rever controles antes da liberação'); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM sms_apr_envolvidos WHERE apr_id=a.id) THEN erros:=array_append(erros,'Identifique a equipe'); END IF;
 FOR e IN SELECT p.*,emp.nome FROM sms_apr_envolvidos p JOIN employees emp ON emp.id=p.colaborador_id WHERE apr_id=a.id LOOP
   IF NOT EXISTS(SELECT 1 FROM obra_funcionarios v JOIN employees emp ON emp.id=v.employee_id WHERE v.obra_id=a.obra_id AND v.status AND emp.status='ativo' AND emp.id=e.colaborador_id) THEN erros:=array_append(erros,e.nome||': vínculo indisponível'); END IF;
   IF NOT e.assinou OR coalesce((e.ciencia->>'revisao')::int,0)<>a.revisao THEN erros:=array_append(erros,e.nome||': ciência pendente nesta revisão'); END IF;
   IF EXISTS(SELECT 1 FROM employee_ferias f WHERE employee_id=e.colaborador_id AND aprovado AND data_inicio<=coalesce(fim,inicio) AND coalesce(data_fim,coalesce(fim,inicio))>=inicio) THEN erros:=array_append(erros,e.nome||': indisponibilidade no período'); END IF;
   SELECT * INTO aso FROM sms_saude_ocupacional s WHERE colaborador_id=e.colaborador_id AND data_exame<=(now() AT TIME ZONE 'America/Sao_Paulo')::date ORDER BY data_exame DESC,created_at DESC LIMIT 1;
   IF NOT FOUND OR aso.aptidao<>'apto' OR aso.vencimento IS NULL OR aso.vencimento<coalesce(fim,inicio) OR aso.tipo_exame='demissional' THEN erros:=array_append(erros,e.nome||': validação ocupacional pendente no RH'); END IF;
   FOR t IN SELECT * FROM sms_treinamentos_catalogo tc WHERE tc.obrigatorio OR tc.id::text IN (SELECT jsonb_array_elements_text(coalesce(a.plano->'treinamentos','[]'))) LOOP
     IF NOT EXISTS(SELECT 1 FROM sms_colaborador_treinamentos ct WHERE ct.colaborador_id=e.colaborador_id AND ct.treinamento_id=t.id AND (ct.obra_id IS NULL OR ct.obra_id=a.obra_id) AND ct.status IN ('em_dia','a_vencer') AND ct.data_realizacao<=least(inicio,(now() AT TIME ZONE 'America/Sao_Paulo')::date) AND ((ct.data_vencimento IS NULL AND coalesce(t.validade_meses,0)=0) OR ct.data_vencimento>=coalesce(fim,inicio))) THEN erros:=array_append(erros,e.nome||': treinamento pendente — '||t.nome); END IF;
   END LOOP;
 END LOOP;
 IF coalesce((a.plano->>'exige_pt')::boolean,false) AND NOT EXISTS(SELECT 1 FROM sms_pt p WHERE p.id=nullif(a.plano->>'pt_id','')::uuid AND p.obra_id=a.obra_id AND p.status='aberta' AND p.aprovada_por IS NOT NULL AND p.data_inicio<=a.data_hora_inicio AND p.data_fim>=a.validade) THEN erros:=array_append(erros,'Vincule PT aprovada da mesma obra cobrindo todo o período'); END IF;
 RETURN ARRAY(SELECT DISTINCT unnest(erros));
END $$;

CREATE FUNCTION public.apr_ciencia(p_id uuid,p_employee uuid,p_versao integer,p_assinatura text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_aprs;
BEGIN
 SELECT * INTO a FROM sms_aprs WHERE id=p_id FOR UPDATE;
 IF a.id IS NULL OR NOT coalesce(public.dds_pode_acessar(a.obra_id),false) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF a.versao IS DISTINCT FROM p_versao OR a.status NOT IN ('rascunho','em_analise') THEN RAISE EXCEPTION 'Documento alterado ou protegido'; END IF;
 IF p_assinatura IS NULL OR p_assinatura NOT LIKE 'data:image/png;base64,%' OR length(p_assinatura) NOT BETWEEN 1000 AND 200000 THEN RAISE EXCEPTION 'Assinatura inválida'; END IF;
 UPDATE sms_apr_envolvidos SET assinou=true,data_assinatura=now(),ciencia=jsonb_build_object('revisao',a.revisao,'assinatura',p_assinatura,'coletado_por',auth.uid(),'data',now()) WHERE apr_id=a.id AND colaborador_id=p_employee;
 IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário fora da equipe'; END IF;
 UPDATE sms_aprs SET versao=versao+1 WHERE id=a.id;
 INSERT INTO sms_apr_historico(apr_id,evento,autor_id,dados) VALUES(a.id,'ciencia',auth.uid(),jsonb_build_object('employee_id',p_employee,'revisao',a.revisao));
END $$;

CREATE FUNCTION public.apr_transicao(p_id uuid,p_versao integer,p_status text,p_motivo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_aprs; erros text[];
BEGIN
 SELECT * INTO a FROM sms_aprs WHERE id=p_id FOR UPDATE;
 IF a.id IS NULL OR NOT coalesce(public.dds_pode_acessar(a.obra_id),false) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF a.versao IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'Documento alterado. Atualize a tela'; END IF;
 IF NOT ((a.status IN ('rascunho','aberta') AND p_status='em_analise') OR (a.status='em_analise' AND p_status IN ('liberada','rascunho')) OR (a.status='liberada' AND p_status IN ('em_execucao','suspensa')) OR (a.status='em_execucao' AND p_status IN ('concluida','suspensa')) OR (a.status='suspensa' AND p_status='rascunho') OR (a.status NOT IN ('concluida','cancelada') AND p_status='cancelada') OR (a.status='aberta' AND p_status='rascunho')) THEN RAISE EXCEPTION 'Transição não permitida'; END IF;
 IF p_status IN ('liberada','rascunho','cancelada') AND NOT coalesce((public.get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_obra','tecnico_sms') AND public.can_manage_sms_obra(a.obra_id)),false) THEN RAISE EXCEPTION 'Exige aprovação da gestão/SMS autorizada na obra'; END IF;
 IF length(trim(coalesce(p_motivo,'')))<5 THEN RAISE EXCEPTION 'Informe uma justificativa com pelo menos 5 caracteres'; END IF;
 IF p_status IN ('liberada','em_execucao') THEN
   erros:=public.apr_pendencias(a.id);
   IF cardinality(erros)>0 THEN RAISE EXCEPTION '%',array_to_string(erros,'; '); END IF;
   IF p_status='em_execucao' AND now()<a.data_hora_inicio THEN RAISE EXCEPTION 'Atividade ainda não iniciou no período previsto'; END IF;
 END IF;
 UPDATE sms_aprs SET status=p_status,versao=versao+1,
 liberado_por=CASE WHEN p_status='liberada' THEN auth.uid() WHEN p_status='rascunho' THEN NULL ELSE liberado_por END,
 liberado_em=CASE WHEN p_status='liberada' THEN now() WHEN p_status='rascunho' THEN NULL ELSE liberado_em END,
 data_hora_fim=CASE WHEN p_status='concluida' THEN now() ELSE data_hora_fim END WHERE id=a.id;
 INSERT INTO sms_apr_historico(apr_id,evento,motivo,autor_id,dados) VALUES(a.id,p_status,p_motivo,auth.uid(),jsonb_build_object('anterior',to_jsonb(a),'equipe',(SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]') FROM sms_apr_envolvidos e WHERE apr_id=a.id)));
 IF p_status='rascunho' THEN UPDATE sms_apr_envolvidos SET assinou=false,ciencia=NULL,data_assinatura=NULL WHERE apr_id=a.id; END IF;
END $$;

CREATE FUNCTION public.apr_detalhe(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_aprs;
BEGIN
 SELECT * INTO a FROM sms_aprs WHERE id=p_id;
 IF a.id IS NULL OR NOT coalesce(public.dds_pode_acessar(a.obra_id),false) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN jsonb_build_object('apr',to_jsonb(a),'pendencias',public.apr_pendencias(a.id),
 'equipe',(SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('nome',p.nome)),'[]') FROM sms_apr_envolvidos e JOIN employees p ON p.id=e.colaborador_id WHERE apr_id=a.id),
 'riscos_legados',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM sms_apr_riscos_selecionados r WHERE apr_id=a.id),
 'historico',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY criado_em DESC),'[]') FROM sms_apr_historico h WHERE apr_id=a.id));
END $$;

CREATE FUNCTION public.apr_listar(p_obra uuid DEFAULT NULL,p_status text DEFAULT NULL,p_busca text DEFAULT '',p_pagina integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN (WITH filtradas AS (
 SELECT a.id,a.obra_id,a.local,a.responsavel,a.descricao_trabalho,a.data_hora_inicio,a.validade,a.status,a.versao,a.revisao,o.nome AS obra,
 (SELECT count(*) FROM sms_apr_riscos_selecionados r WHERE r.apr_id=a.id AND coalesce(r.resposta,'S')='S') AS riscos,
 (SELECT count(*) FROM sms_apr_envolvidos e WHERE e.apr_id=a.id) AS envolvidos
 FROM sms_aprs a LEFT JOIN obras o ON o.id=a.obra_id
 WHERE public.dds_pode_acessar(a.obra_id) AND (p_obra IS NULL OR a.obra_id=p_obra) AND (p_status IS NULL OR a.status=p_status)
 AND concat_ws(' ',a.local,a.responsavel,a.descricao_trabalho,o.nome) ILIKE '%'||coalesce(p_busca,'')||'%'
 ), pagina AS (SELECT * FROM filtradas ORDER BY data_hora_inicio DESC,id LIMIT 25 OFFSET greatest(p_pagina,0)*25)
 SELECT jsonb_build_object('itens',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.data_hora_inicio DESC,p.id),'[]') FROM pagina p),'total',count(*),'pendentes',count(*) FILTER(WHERE status IN ('aberta','rascunho','em_analise')),'vencidas',count(*) FILTER(WHERE validade<now() AND status NOT IN ('concluida','cancelada')),'execucao',count(*) FILTER(WHERE status='em_execucao')) FROM filtradas);
END $$;

REVOKE ALL ON FUNCTION public.apr_catalogos(uuid),public.apr_salvar(uuid,jsonb,integer),public.apr_pendencias(uuid),public.apr_ciencia(uuid,uuid,integer,text),public.apr_transicao(uuid,integer,text,text),public.apr_detalhe(uuid),public.apr_listar(uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apr_catalogos(uuid),public.apr_salvar(uuid,jsonb,integer),public.apr_pendencias(uuid),public.apr_ciencia(uuid,uuid,integer,text),public.apr_transicao(uuid,integer,text,text),public.apr_detalhe(uuid),public.apr_listar(uuid,text,text,integer) TO authenticated;
-- Somente APRs liberadas/executadas alimentam novos snapshots. RDOs já salvos não são reescritos.
CREATE OR REPLACE FUNCTION public.sms_rdo_snapshot(p_obra_id uuid,p_data date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(public.dds_pode_acessar(p_obra_id),false) THEN RAISE EXCEPTION 'Obra sem acesso'; END IF;
 RETURN jsonb_build_object(
 'efetivo',jsonb_build_object(
 'presentes',(SELECT count(*) FROM efetivo_ponto e WHERE e.obra_id=p_obra_id AND e.data=p_data AND NOT e.ausencia),
 'ausentes',(SELECT count(*) FROM efetivo_ponto e WHERE e.obra_id=p_obra_id AND e.data=p_data AND e.ausencia),
 'hht',(SELECT coalesce(sum(e.horas_trabalhadas),0) FROM efetivo_ponto e WHERE e.obra_id=p_obra_id AND e.data=p_data AND NOT e.ausencia),
 'horas_extras',(SELECT coalesce(sum(e.horas_extras),0) FROM efetivo_ponto e WHERE e.obra_id=p_obra_id AND e.data=p_data)),
 'sms',jsonb_build_object(
 'dds',(SELECT count(*) FROM sms_dds_sessoes d WHERE d.obra_id=p_obra_id AND d.data_sessao=p_data AND d.status='concluido'),
 'aprs',(SELECT count(*) FROM sms_aprs a WHERE a.obra_id=p_obra_id AND (a.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')::date<=p_data AND (a.validade AT TIME ZONE 'America/Sao_Paulo')::date>=p_data AND a.liberado_por IS NOT NULL AND a.status IN ('liberada','em_execucao','concluida') AND (a.status<>'concluida' OR (a.data_hora_fim AT TIME ZONE 'America/Sao_Paulo')::date>=p_data)),
 'inspecoes',(SELECT count(*) FROM sms_inspecoes i WHERE i.obra_id=p_obra_id AND i.data_inspecao=p_data AND i.status<>'cancelada'),
 'desvios',(SELECT count(*) FROM sms_desvios d WHERE d.obra_id=p_obra_id AND d.data_ocorrencia=p_data AND d.status<>'cancelado'),
 'acidentes',(SELECT count(*) FROM sms_acidentes a WHERE a.obra_id=p_obra_id AND a.data_hora::date=p_data),
 'near_miss',(SELECT count(*) FROM sms_near_miss n WHERE n.obra_id=p_obra_id AND n.created_at::date=p_data)));
END $$;
CREATE OR REPLACE VIEW public.vw_employee_sms_resumo WITH(security_invoker=true) AS
SELECT e.id AS employee_id,
 (SELECT count(*) FROM sms_colaborador_treinamentos t WHERE t.colaborador_id=e.id AND t.status='vencido') AS treinamentos_vencidos,
 (SELECT count(*) FROM sms_colaborador_epis ep WHERE ep.colaborador_id=e.id AND ep.data_devolucao IS NULL) AS epis_em_responsabilidade,
 (SELECT count(*) FROM sms_dds_presencas d WHERE d.colaborador_id=e.id AND d.presente AND EXISTS(SELECT 1 FROM sms_dds_sessoes ds WHERE ds.id=d.sessao_id AND ds.status='concluido')) AS dds_participacoes,
 (SELECT count(*) FROM sms_apr_envolvidos p JOIN sms_aprs a ON a.id=p.apr_id WHERE p.colaborador_id=e.id AND p.assinou AND a.liberado_por IS NOT NULL AND a.status IN ('liberada','em_execucao','concluida')) AS apr_participacoes,
 (SELECT count(*) FROM sms_acidentes ac WHERE ac.colaborador_id=e.id) AS acidentes,
 (SELECT s.aptidao FROM sms_saude_ocupacional s WHERE s.colaborador_id=e.id ORDER BY s.data_exame DESC LIMIT 1) AS aso_aptidao,
 (SELECT s.vencimento FROM sms_saude_ocupacional s WHERE s.colaborador_id=e.id ORDER BY s.data_exame DESC LIMIT 1) AS aso_vencimento
FROM employees e;
REVOKE ALL ON FUNCTION public.sms_rdo_snapshot(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sms_rdo_snapshot(uuid,date) TO authenticated;
COMMIT;

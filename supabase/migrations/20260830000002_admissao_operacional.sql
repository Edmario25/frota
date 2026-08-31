BEGIN;
ALTER TABLE public.sms_admissoes
 ADD COLUMN IF NOT EXISTS registrado_por uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS ciclo integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS prazo date,
 ADD COLUMN IF NOT EXISTS responsavel_processo text,
 ADD COLUMN IF NOT EXISTS perfil text,
 ADD COLUMN IF NOT EXISTS requisitos jsonb NOT NULL DEFAULT '[{"id":"identidade","nome":"Identificação do funcionário","area":"rh","status":"pendente"},{"id":"contrato","nome":"Documentação contratual aplicável","area":"rh","status":"pendente"}]',
 ADD COLUMN IF NOT EXISTS treinamentos_exigidos uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS epis_exigidos uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS epis_na_justificativa text,
 ADD COLUMN IF NOT EXISTS integracao_id uuid REFERENCES public.sms_colaborador_treinamentos(id),
 ADD COLUMN IF NOT EXISTS liberado_por uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS liberado_em timestamptz,
 ADD COLUMN IF NOT EXISTS conferencia_rh_por uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS conferencia_sms_por uuid REFERENCES auth.users(id);

CREATE FUNCTION public.adm_pode_rh() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND coalesce(public.get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_obra'),false);
$$;
CREATE FUNCTION public.adm_acesso(p_obra uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND coalesce(public.get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_obra','tecnico_sms') AND public.can_manage_sms_obra(p_obra),false);
$$;

CREATE TABLE public.sms_admissao_arquivos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admissao_id uuid NOT NULL REFERENCES public.sms_admissoes(id),
 nome text NOT NULL,area text NOT NULL CHECK(area IN ('rh','sms')), caminho text UNIQUE,
 legado_url text, migracao_sha256 text, confirmado boolean NOT NULL DEFAULT false, criado_por uuid REFERENCES auth.users(id),criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sms_admissao_historico(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admissao_id uuid NOT NULL REFERENCES public.sms_admissoes(id),
 evento text NOT NULL,motivo text,autor_id uuid REFERENCES auth.users(id),criado_em timestamptz NOT NULL DEFAULT now(),dados jsonb NOT NULL
);
CREATE TABLE public.sms_admissao_perfis(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text NOT NULL,obra_id uuid NOT NULL REFERENCES public.obras(id),
 requisitos jsonb NOT NULL,treinamentos uuid[] NOT NULL,epis uuid[] NOT NULL,criado_por uuid REFERENCES auth.users(id)
);
ALTER TABLE public.sms_admissao_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_admissao_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_admissao_perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY adm_perfis_ler ON public.sms_admissao_perfis FOR SELECT TO authenticated USING(public.adm_acesso(obra_id));
-- Anexos e snapshots completos somente por funções verificadas. Nenhum acesso direto do cliente.
REVOKE ALL ON public.sms_admissao_arquivos,public.sms_admissao_historico FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.sms_admissao_arquivos,public.sms_admissao_historico TO service_role;
GRANT SELECT ON public.sms_admissao_perfis TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.sms_admissoes,public.sms_admissao_perfis FROM PUBLIC,anon,authenticated;
INSERT INTO public.sms_admissao_arquivos(admissao_id,nome,area,legado_url,confirmado)
 SELECT a.id,'Anexo legado '||u.n,'rh',u.url,true FROM public.sms_admissoes a CROSS JOIN LATERAL unnest(coalesce(a.documentos_urls,'{}')) WITH ORDINALITY u(url,n);
-- Preserva links e checklist antigos. Nunca converte booleanos legados em documentos validados.

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('admissao-documentos','admissao-documentos',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE FUNCTION public.adm_arquivo_acesso(p_path text,p_escrita boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM sms_admissao_arquivos f JOIN sms_admissoes a ON a.id=f.admissao_id
 WHERE f.caminho=p_path AND public.adm_acesso(a.obra_id) AND (f.area='sms' OR public.adm_pode_rh())
 AND (NOT p_escrita OR (NOT f.confirmado AND a.status IN ('pendente','em_andamento'))));
$$;
CREATE POLICY adm_storage_ler ON storage.objects FOR SELECT TO authenticated USING(bucket_id='admissao-documentos' AND public.adm_arquivo_acesso(name));
CREATE POLICY adm_storage_inserir ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='admissao-documentos' AND public.adm_arquivo_acesso(name,true));
-- Sem UPDATE/DELETE: arquivos de evidência são imutáveis. Substituições criam novos objetos.

CREATE FUNCTION public.adm_criar(p_employee uuid,p_obra uuid,p_data date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT coalesce(public.adm_acesso(p_obra),false) THEN RAISE EXCEPTION 'Obra sem acesso'; END IF;
 IF p_data IS NULL OR NOT EXISTS(SELECT 1 FROM obra_funcionarios v JOIN employees e ON e.id=v.employee_id WHERE v.obra_id=p_obra AND v.employee_id=p_employee AND v.status AND e.status='ativo') THEN RAISE EXCEPTION 'Selecione funcionário com vínculo ativo na obra'; END IF;
 INSERT INTO sms_admissoes(colaborador_id,obra_id,data_admissao,status,registrado_por) VALUES(p_employee,p_obra,p_data,'em_andamento',auth.uid())
 ON CONFLICT(colaborador_id,obra_id) WHERE status<>'cancelada' DO UPDATE SET colaborador_id=EXCLUDED.colaborador_id RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION public.adm_arquivo_preparar(p_id uuid,p_nome text,p_area text,p_ext text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_admissoes; f sms_admissao_arquivos; v uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO a FROM sms_admissoes WHERE id=p_id FOR UPDATE;
 IF a.id IS NULL OR NOT public.adm_acesso(a.obra_id) OR (p_area='rh' AND NOT public.adm_pode_rh()) THEN RAISE EXCEPTION 'Acesso negado ao documento'; END IF;
 IF a.status NOT IN ('pendente','em_andamento') OR p_area NOT IN ('rh','sms') OR p_ext NOT IN ('pdf','jpg','png','webp') OR nullif(trim(p_nome),'') IS NULL THEN RAISE EXCEPTION 'Arquivo inválido ou processo protegido'; END IF;
 INSERT INTO sms_admissao_arquivos(id,admissao_id,nome,area,caminho,criado_por) VALUES(v,a.id,left(p_nome,180),p_area,a.id::text||'/'||v::text||'.'||p_ext,auth.uid()) RETURNING * INTO f;
 RETURN to_jsonb(f);
END $$;
CREATE FUNCTION public.adm_arquivo_confirmar(p_arquivo uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_admissoes; f sms_admissao_arquivos;
BEGIN
 SELECT * INTO f FROM sms_admissao_arquivos WHERE id=p_arquivo;
 SELECT * INTO a FROM sms_admissoes WHERE id=f.admissao_id FOR UPDATE;
 IF a.id IS NULL OR NOT public.adm_acesso(a.obra_id) OR (f.area='rh' AND NOT public.adm_pode_rh()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF a.status NOT IN ('pendente','em_andamento') THEN RAISE EXCEPTION 'Processo protegido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='admissao-documentos' AND name=f.caminho) THEN RAISE EXCEPTION 'Envio não confirmado no armazenamento'; END IF;
 IF f.confirmado THEN RETURN; END IF;
 UPDATE sms_admissao_arquivos SET confirmado=true WHERE id=f.id;
 UPDATE sms_admissoes SET versao=versao+1,conferencia_rh_por=NULL,conferencia_sms_por=NULL WHERE id=a.id;
 INSERT INTO sms_admissao_historico(admissao_id,evento,autor_id,dados) VALUES(a.id,'anexo',auth.uid(),jsonb_build_object('arquivo',f.id,'area',f.area));
END $$;

CREATE FUNCTION public.adm_salvar(p_id uuid,p_versao integer,p_dados jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_admissoes; r jsonb; antigo jsonb; limpo jsonb:='[]';
BEGIN
 SELECT * INTO a FROM sms_admissoes WHERE id=p_id FOR UPDATE;
 IF a.id IS NULL OR NOT public.adm_acesso(a.obra_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF a.versao IS DISTINCT FROM p_versao OR a.status NOT IN ('pendente','em_andamento') THEN RAISE EXCEPTION 'Processo alterado ou protegido. Reabra o detalhe'; END IF;
 IF jsonb_typeof(p_dados->'requisitos') IS DISTINCT FROM 'array' OR jsonb_array_length(p_dados->'requisitos')=0 THEN RAISE EXCEPTION 'Mantenha os requisitos documentais'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_dados->'requisitos'))<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_dados->'requisitos') x) THEN RAISE EXCEPTION 'Requisitos duplicados'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(a.requisitos) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_dados->'requisitos') y WHERE y->>'id'=x->>'id')) THEN RAISE EXCEPTION 'Não exclua requisitos existentes; justifique a não aplicabilidade'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_dados->'requisitos') LOOP
   SELECT value INTO antigo FROM jsonb_array_elements(a.requisitos) WHERE value->>'id'=r->>'id';
   IF nullif(trim(r->>'nome'),'') IS NULL OR coalesce(r->>'area','') NOT IN ('rh','sms') OR coalesce(r->>'status','') NOT IN ('pendente','recebido','validado','recusado','na') THEN RAISE EXCEPTION 'Requisito inválido'; END IF;
   IF antigo IS NOT NULL AND antigo->>'area' IS DISTINCT FROM r->>'area' THEN RAISE EXCEPTION 'Não altere a área de um requisito'; END IF;
   IF r->>'area'='rh' AND NOT public.adm_pode_rh() AND r IS DISTINCT FROM antigo THEN RAISE EXCEPTION 'Conferência documental RH exige gestor autorizado'; END IF;
   IF r->>'status' IN ('na','recusado') AND length(trim(coalesce(r->>'justificativa','')))<5 THEN RAISE EXCEPTION 'Justifique documento recusado ou não aplicável'; END IF;
   IF r->>'status' IN ('recebido','validado') AND NOT EXISTS(SELECT 1 FROM sms_admissao_arquivos f WHERE f.id=nullif(r->>'arquivo_id','')::uuid AND f.admissao_id=a.id AND f.area=r->>'area' AND f.confirmado AND f.caminho IS NOT NULL AND f.legado_url IS NULL) THEN RAISE EXCEPTION 'Vincule um anexo privado confirmado a cada documento recebido/validado'; END IF;
   IF r IS DISTINCT FROM antigo THEN r:=r-'validado_por'-'validado_em'||jsonb_build_object('validado_por',auth.uid(),'validado_em',now()); END IF;
   limpo:=limpo||jsonb_build_array(r);
 END LOOP;
 IF NOT public.adm_pode_rh() AND (coalesce(p_dados->>'responsavel_processo','') IS DISTINCT FROM coalesce(a.responsavel_processo,'') OR nullif(p_dados->>'prazo','')::date IS DISTINCT FROM a.prazo) THEN RAISE EXCEPTION 'Responsável e prazo são definidos pela gestão'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_dados->'treinamentos_exigidos','[]')) x WHERE NOT EXISTS(SELECT 1 FROM sms_treinamentos_catalogo WHERE id=x::uuid)) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_dados->'epis_exigidos','[]')) x WHERE NOT EXISTS(SELECT 1 FROM sms_epis_catalogo WHERE id=x::uuid)) THEN RAISE EXCEPTION 'Treinamento ou EPI não encontrado no catálogo'; END IF;
 INSERT INTO sms_admissao_historico(admissao_id,evento,autor_id,dados) VALUES(a.id,'edicao',auth.uid(),to_jsonb(a));
 UPDATE sms_admissoes SET requisitos=limpo,perfil=p_dados->>'perfil',prazo=nullif(p_dados->>'prazo','')::date,responsavel_processo=p_dados->>'responsavel_processo',
 treinamentos_exigidos=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_dados->'treinamentos_exigidos','[]'))::uuid),
 epis_exigidos=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_dados->'epis_exigidos','[]'))::uuid),epis_na_justificativa=p_dados->>'epis_na_justificativa',
 integracao_id=nullif(p_dados->>'integracao_id','')::uuid,observacoes=p_dados->>'observacoes',versao=versao+1,conferencia_rh_por=NULL,conferencia_sms_por=NULL WHERE id=a.id;
 -- documentos_urls não é alterado. A preservação dos legados independe do formulário.
END $$;

CREATE FUNCTION public.adm_pendencias(p_id uuid) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_admissoes; problemas text[]:='{}'; r jsonb; aso record; t record; epi uuid; hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO a FROM sms_admissoes WHERE id=p_id;
 IF a.id IS NULL OR NOT public.adm_acesso(a.obra_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF a.obra_id IS NULL OR NOT EXISTS(SELECT 1 FROM obra_funcionarios v JOIN employees e ON e.id=v.employee_id WHERE v.obra_id=a.obra_id AND e.id=a.colaborador_id AND v.status AND e.status='ativo') THEN problemas:=array_append(problemas,'Vínculo ativo com a obra pendente'); END IF;
 IF a.data_admissao>hoje THEN problemas:=array_append(problemas,'Início da integração ainda futuro'); END IF;
 IF EXISTS(SELECT 1 FROM employee_ferias f WHERE f.employee_id=a.colaborador_id AND f.aprovado AND f.data_inicio<=hoje AND coalesce(f.data_fim,hoje)>=hoje) THEN problemas:=array_append(problemas,'Indisponibilidade registrada no RH'); END IF;
 IF nullif(trim(a.responsavel_processo),'') IS NULL OR a.prazo IS NULL THEN problemas:=array_append(problemas,'Defina responsável pelo processo e prazo'); END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(a.requisitos) LOOP
   IF coalesce(r->>'status','pendente') NOT IN ('validado','na') THEN problemas:=array_append(problemas,'Documento: '||(r->>'nome')); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM sms_admissao_arquivos WHERE admissao_id=a.id AND legado_url IS NOT NULL) THEN problemas:=array_append(problemas,'Migrar e proteger anexos legados'); END IF;
 SELECT * INTO aso FROM sms_saude_ocupacional s WHERE s.colaborador_id=a.colaborador_id AND s.data_exame<=hoje ORDER BY s.data_exame DESC,s.created_at DESC LIMIT 1;
 IF NOT FOUND OR aso.aptidao IS DISTINCT FROM 'apto' OR aso.tipo_exame='demissional' OR aso.vencimento IS NULL OR aso.vencimento<hoje THEN problemas:=array_append(problemas,'Validação ocupacional pendente no RH'); END IF;
 FOR t IN SELECT * FROM sms_treinamentos_catalogo c WHERE (c.ativo AND c.obrigatorio) OR c.id=ANY(a.treinamentos_exigidos) LOOP
   IF NOT EXISTS(SELECT 1 FROM sms_colaborador_treinamentos ct WHERE ct.colaborador_id=a.colaborador_id AND ct.treinamento_id=t.id AND (ct.obra_id IS NULL OR ct.obra_id=a.obra_id) AND ct.status IN ('em_dia','a_vencer') AND ct.data_realizacao<=hoje AND (ct.data_vencimento>=hoje OR (ct.data_vencimento IS NULL AND coalesce(t.validade_meses,0)=0))) THEN problemas:=array_append(problemas,'Treinamento pendente: '||t.nome); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM sms_colaborador_treinamentos ct WHERE ct.id=a.integracao_id AND ct.colaborador_id=a.colaborador_id AND ct.obra_id=a.obra_id AND ct.data_realizacao BETWEEN a.data_admissao AND hoje AND ct.status IN ('em_dia','a_vencer') AND (ct.data_vencimento IS NULL OR ct.data_vencimento>=hoje) AND nullif(trim(ct.instrutor),'') IS NOT NULL AND nullif(trim(ct.certificado_url),'') IS NOT NULL) THEN problemas:=array_append(problemas,'Vincule integração da obra com instrutor, data e comprovante'); END IF;
 IF cardinality(a.epis_exigidos)=0 AND length(trim(coalesce(a.epis_na_justificativa,'')))<5 THEN problemas:=array_append(problemas,'Defina EPIs necessários ou justifique não aplicabilidade'); END IF;
 FOREACH epi IN ARRAY a.epis_exigidos LOOP
   IF NOT EXISTS(SELECT 1 FROM sms_colaborador_epis e WHERE e.colaborador_id=a.colaborador_id AND e.obra_id=a.obra_id AND e.epi_id=epi AND e.data_entrega<=hoje AND e.data_devolucao IS NULL AND e.quantidade>0 AND nullif(e.assinatura_base64,'') IS NOT NULL) THEN problemas:=array_append(problemas,'Entrega assinada de EPI pendente: '||coalesce((SELECT nome FROM sms_epis_catalogo WHERE id=epi),epi::text)); END IF;
 END LOOP;
 IF a.conferencia_rh_por IS NULL THEN problemas:=array_append(problemas,'Conferência RH pendente'); END IF;
 IF a.conferencia_sms_por IS NULL THEN problemas:=array_append(problemas,'Conferência SMS pendente'); END IF;
 RETURN problemas;
END $$;

CREATE FUNCTION public.adm_acao(p_id uuid,p_versao integer,p_acao text,p_motivo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_admissoes; problemas text[];
BEGIN
 SELECT * INTO a FROM sms_admissoes WHERE id=p_id FOR UPDATE;
 IF a.id IS NULL OR NOT public.adm_acesso(a.obra_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF a.versao IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'Processo alterado. Atualize o detalhe'; END IF;
 IF length(trim(coalesce(p_motivo,'')))<5 THEN RAISE EXCEPTION 'Informe a justificativa da ação'; END IF;
 IF p_acao IN ('conferir_rh','liberar','reabrir','cancelar') AND NOT public.adm_pode_rh() THEN RAISE EXCEPTION 'Ação restrita à gestão autorizada'; END IF;
 IF p_acao='reabrir' THEN
   IF a.status<>'concluida' THEN RAISE EXCEPTION 'Somente processo concluído pode ser reaberto'; END IF;
   UPDATE sms_admissoes SET status='em_andamento',liberado_por=NULL,liberado_em=NULL,conferencia_rh_por=NULL,conferencia_sms_por=NULL WHERE id=a.id;
 ELSIF p_acao='cancelar' THEN
   IF a.status='cancelada' THEN RAISE EXCEPTION 'Processo já cancelado'; END IF;
   UPDATE sms_admissoes SET status='cancelada',liberado_por=NULL,liberado_em=NULL WHERE id=a.id;
 ELSE
   IF a.status NOT IN ('pendente','em_andamento') THEN RAISE EXCEPTION 'Processo protegido'; END IF;
   IF p_acao='conferir_rh' THEN
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(a.requisitos) r WHERE r->>'area'='rh' AND coalesce(r->>'status','pendente') NOT IN ('validado','na')) THEN RAISE EXCEPTION 'Resolva os documentos RH antes de conferir'; END IF;
     UPDATE sms_admissoes SET conferencia_rh_por=auth.uid() WHERE id=a.id;
   ELSIF p_acao='conferir_sms' THEN
     UPDATE sms_admissoes SET conferencia_sms_por=auth.uid() WHERE id=a.id;
   ELSIF p_acao='liberar' THEN
     problemas:=public.adm_pendencias(a.id);
     IF cardinality(problemas)>0 THEN RAISE EXCEPTION '%',array_to_string(problemas,'; '); END IF;
     UPDATE sms_admissoes SET status='concluida',liberado_por=auth.uid(),liberado_em=now(),epis_entregues=cardinality(epis_exigidos)>0,treinamento_integracao_em=(SELECT data_realizacao FROM sms_colaborador_treinamentos WHERE id=a.integracao_id) WHERE id=a.id;
   ELSE RAISE EXCEPTION 'Ação inválida'; END IF;
 END IF;
 UPDATE sms_admissoes SET versao=versao+1 WHERE id=a.id;
 INSERT INTO sms_admissao_historico(admissao_id,evento,motivo,autor_id,dados) VALUES(a.id,p_acao,p_motivo,auth.uid(),to_jsonb(a));
END $$;

CREATE FUNCTION public.adm_detalhe(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_admissoes;
BEGIN
 SELECT * INTO a FROM sms_admissoes WHERE id=p_id;
 IF a.id IS NULL OR NOT public.adm_acesso(a.obra_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN jsonb_build_object('admissao',to_jsonb(a)-'documentos_urls','pode_rh',public.adm_pode_rh(),'pendencias',public.adm_pendencias(a.id),
 'arquivos',(SELECT coalesce(jsonb_agg(to_jsonb(f)-'legado_url'||jsonb_build_object('legado',f.legado_url IS NOT NULL) ORDER BY f.criado_em),'[]') FROM sms_admissao_arquivos f WHERE f.admissao_id=a.id AND f.confirmado AND (f.area='sms' OR public.adm_pode_rh())),
 'historico',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'evento',h.evento,'motivo',h.motivo,'autor',h.autor_id,'data',h.criado_em) ORDER BY h.criado_em DESC),'[]') FROM sms_admissao_historico h WHERE h.admissao_id=a.id),
 'treinamentos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'nome',c.nome,'data',t.data_realizacao,'instrutor',t.instrutor,'status',t.status)),'[]') FROM sms_colaborador_treinamentos t JOIN sms_treinamentos_catalogo c ON c.id=t.treinamento_id WHERE t.colaborador_id=a.colaborador_id AND t.obra_id=a.obra_id));
END $$;
CREATE FUNCTION public.adm_listar(p_obra uuid DEFAULT NULL,p_status text DEFAULT NULL,p_busca text DEFAULT '',p_pagina integer DEFAULT 0) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH filtrados AS (SELECT a.id,a.obra_id,a.colaborador_id,a.data_admissao,a.prazo,a.responsavel_processo,a.perfil,a.status,a.liberado_em,a.ciclo,e.nome,o.nome AS obra,
 public.adm_pendencias(a.id) AS pendencias FROM sms_admissoes a JOIN employees e ON e.id=a.colaborador_id LEFT JOIN obras o ON o.id=a.obra_id
 WHERE public.adm_acesso(a.obra_id) AND (p_obra IS NULL OR a.obra_id=p_obra) AND (p_status IS NULL OR a.status=p_status) AND concat_ws(' ',e.nome,o.nome,a.responsavel_processo) ILIKE '%'||coalesce(p_busca,'')||'%'),
 pagina AS (SELECT * FROM filtrados ORDER BY data_admissao DESC,id LIMIT 25 OFFSET greatest(coalesce(p_pagina,0),0)*25)
 SELECT jsonb_build_object('itens',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY data_admissao DESC,id),'[]') FROM pagina p),'total',count(*),
 'mes',count(*) FILTER(WHERE date_trunc('month',data_admissao::timestamp)=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')),
 'liberados',count(*) FILTER(WHERE status='concluida' AND liberado_em IS NOT NULL AND cardinality(pendencias)=0),
 'atrasados',count(*) FILTER(WHERE prazo<(now() AT TIME ZONE 'America/Sao_Paulo')::date AND status NOT IN ('concluida','cancelada'))) FROM filtrados;
$$;
CREATE FUNCTION public.adm_catalogos(p_obra uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.adm_acesso(p_obra) THEN RAISE EXCEPTION 'Obra sem acesso'; END IF;
 RETURN jsonb_build_object('equipe',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'nome',e.nome) ORDER BY e.nome),'[]') FROM employees e WHERE e.status='ativo' AND EXISTS(SELECT 1 FROM obra_funcionarios v WHERE v.employee_id=e.id AND v.obra_id=p_obra AND v.status)),
 'treinamentos',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY nome),'[]') FROM sms_treinamentos_catalogo t WHERE ativo),
 'epis',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'nome',e.nome) ORDER BY nome),'[]') FROM sms_epis_catalogo e WHERE ativo),
 'perfis',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY nome),'[]') FROM sms_admissao_perfis p WHERE obra_id=p_obra));
END $$;
CREATE FUNCTION public.adm_salvar_perfil(p_id uuid,p_nome text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_admissoes;
BEGIN
 SELECT * INTO a FROM sms_admissoes WHERE id=p_id;
 IF a.id IS NULL OR NOT public.adm_acesso(a.obra_id) OR NOT public.adm_pode_rh() THEN RAISE EXCEPTION 'Somente gestão autorizada'; END IF;
 IF length(trim(coalesce(p_nome,'')))<3 THEN RAISE EXCEPTION 'Informe nome do perfil'; END IF;
 INSERT INTO sms_admissao_perfis(nome,obra_id,requisitos,treinamentos,epis,criado_por) VALUES(trim(p_nome),a.obra_id,
 (SELECT jsonb_agg(jsonb_build_object('id',r->>'id','nome',r->>'nome','area',r->>'area','status','pendente')) FROM jsonb_array_elements(a.requisitos) r),a.treinamentos_exigidos,a.epis_exigidos,auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.fn_sms_criar_admissao_por_vinculo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a sms_admissoes;
BEGIN
 IF NEW.status IS TRUE THEN
   IF TG_OP='UPDATE' AND OLD.status IS FALSE THEN
     SELECT * INTO a FROM sms_admissoes WHERE colaborador_id=NEW.employee_id AND obra_id=NEW.obra_id AND status<>'cancelada' FOR UPDATE;
     IF a.id IS NOT NULL THEN
       INSERT INTO sms_admissao_historico(admissao_id,evento,motivo,autor_id,dados) VALUES(a.id,'reativacao','Novo ciclo de integração por reativação do vínculo',auth.uid(),to_jsonb(a));
       UPDATE sms_admissoes SET status='em_andamento',ciclo=ciclo+1,versao=versao+1,data_admissao=greatest(coalesce(NEW.data_entrada,CURRENT_DATE),CURRENT_DATE),integracao_id=NULL,conferencia_rh_por=NULL,conferencia_sms_por=NULL,liberado_por=NULL,liberado_em=NULL WHERE id=a.id;
     END IF;
   END IF;
   INSERT INTO sms_admissoes(colaborador_id,obra_id,data_admissao,status,observacoes,registrado_por) VALUES(NEW.employee_id,NEW.obra_id,coalesce(NEW.data_entrada,CURRENT_DATE),'em_andamento','Integração criada pelo vínculo à obra',auth.uid()) ON CONFLICT(colaborador_id,obra_id) WHERE status<>'cancelada' DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.adm_pode_rh(),public.adm_acesso(uuid),public.adm_arquivo_acesso(text,boolean),public.adm_criar(uuid,uuid,date),public.adm_arquivo_preparar(uuid,text,text,text),public.adm_arquivo_confirmar(uuid),public.adm_salvar(uuid,integer,jsonb),public.adm_pendencias(uuid),public.adm_acao(uuid,integer,text,text),public.adm_detalhe(uuid),public.adm_listar(uuid,text,text,integer),public.adm_catalogos(uuid),public.adm_salvar_perfil(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adm_pode_rh(),public.adm_acesso(uuid),public.adm_arquivo_acesso(text,boolean),public.adm_criar(uuid,uuid,date),public.adm_arquivo_preparar(uuid,text,text,text),public.adm_arquivo_confirmar(uuid),public.adm_salvar(uuid,integer,jsonb),public.adm_pendencias(uuid),public.adm_acao(uuid,integer,text,text),public.adm_detalhe(uuid),public.adm_listar(uuid,text,text,integer),public.adm_catalogos(uuid),public.adm_salvar_perfil(uuid,text) TO authenticated;
COMMIT;

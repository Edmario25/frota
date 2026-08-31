BEGIN;
ALTER TABLE public.sms_dds_sessoes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','concluido','cancelado')),
  ADD COLUMN IF NOT EXISTS tema_livre text,
  ADD COLUMN IF NOT EXISTS frente_servico text,
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS finalizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS finalizado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS source_payload jsonb;
ALTER TABLE public.sms_dds_presencas
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS registrado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz;

CREATE FUNCTION public.dds_pode_acessar(p_obra uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (
   public.can_manage_sms_obra(p_obra) OR
   (public.has_employee_app_access('sms') AND EXISTS(
     SELECT 1 FROM public.obra_funcionarios v JOIN public.employees e ON e.id=v.employee_id
     WHERE v.obra_id=p_obra AND v.status AND e.user_id=auth.uid() AND e.status='ativo'))
 );
$$;
REVOKE ALL ON FUNCTION public.dds_pode_acessar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dds_pode_acessar(uuid) TO authenticated;

CREATE TABLE public.sms_dds_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sessao_id uuid NOT NULL REFERENCES public.sms_dds_sessoes(id),
 evento text NOT NULL, motivo text, autor_id uuid REFERENCES auth.users(id), criado_em timestamptz NOT NULL DEFAULT now(), dados jsonb NOT NULL
);
ALTER TABLE public.sms_dds_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY dds_historico_ler ON public.sms_dds_historico FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.sms_dds_sessoes s WHERE s.id=sessao_id AND public.dds_pode_acessar(s.obra_id)));
GRANT SELECT ON public.sms_dds_historico TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sms_dds_historico FROM PUBLIC,authenticated,anon;
-- Escritas somente pelas operações transacionais abaixo.
REVOKE INSERT, UPDATE, DELETE ON public.sms_dds_sessoes, public.sms_dds_presencas FROM PUBLIC,authenticated,anon;
CREATE POLICY dds_temas_ler_app ON public.sms_dds_temas FOR SELECT TO authenticated
 USING(ativo AND public.has_employee_app_access('sms'));
CREATE POLICY dds_sessao_ler_app ON public.sms_dds_sessoes FOR SELECT TO authenticated USING(public.dds_pode_acessar(obra_id));
CREATE POLICY dds_presenca_ler_app ON public.sms_dds_presencas FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.sms_dds_sessoes s WHERE s.id=sessao_id AND public.dds_pode_acessar(s.obra_id)));

CREATE FUNCTION public.dds_equipe(p_obra uuid) RETURNS TABLE(id uuid,nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(public.dds_pode_acessar(p_obra),false) THEN RAISE EXCEPTION 'Acesso negado a obra'; END IF;
 RETURN QUERY SELECT DISTINCT e.id,e.nome FROM public.employees e JOIN public.obra_funcionarios v ON v.employee_id=e.id
 WHERE v.obra_id=p_obra AND v.status AND e.status='ativo' ORDER BY e.nome;
END; $$;

CREATE FUNCTION public.dds_salvar_presencas(p_id uuid,p_participantes jsonb,p_versao integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sms_dds_sessoes; item jsonb; ids uuid[]; anterior jsonb;
BEGIN
 SELECT * INTO s FROM public.sms_dds_sessoes WHERE id=p_id FOR UPDATE;
 IF s.id IS NULL OR NOT coalesce(public.dds_pode_acessar(s.obra_id),false) THEN RAISE EXCEPTION 'DDS indisponivel'; END IF;
 IF s.status<>'rascunho' THEN RAISE EXCEPTION 'DDS finalizado ou cancelado: presencas protegidas'; END IF;
 IF p_versao IS DISTINCT FROM s.versao THEN RAISE EXCEPTION 'DDS alterado por outro usuario. Reabra a lista.'; END IF;
 IF jsonb_typeof(p_participantes) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de participantes invalida'; END IF;
 SELECT coalesce(array_agg(DISTINCT (x->>'id')::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements(p_participantes) x;
 IF array_position(ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Participante sem identificacao'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ids) i WHERE NOT EXISTS(
   SELECT 1 FROM public.obra_funcionarios v JOIN public.employees e ON e.id=v.employee_id
   WHERE e.id=i AND v.obra_id=s.obra_id AND v.status AND e.status='ativo'
 ) AND NOT EXISTS(SELECT 1 FROM public.sms_dds_presencas p WHERE p.sessao_id=s.id AND p.colaborador_id=i AND p.presente))
 THEN RAISE EXCEPTION 'Participante sem vinculo ativo nesta obra'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO anterior FROM public.sms_dds_presencas p WHERE sessao_id=s.id;
 UPDATE public.sms_dds_presencas SET presente=false WHERE sessao_id=s.id AND NOT(colaborador_id=ANY(ids));
 FOR item IN SELECT DISTINCT ON (x->>'id') x FROM jsonb_array_elements(p_participantes) x LOOP
   IF coalesce(item->>'origem','manual') NOT IN ('manual','qr') THEN RAISE EXCEPTION 'Origem invalida'; END IF;
   INSERT INTO public.sms_dds_presencas(sessao_id,colaborador_id,presente,origem,registrado_por,confirmado_em)
   VALUES(s.id,(item->>'id')::uuid,true,coalesce(item->>'origem','manual'),auth.uid(),now())
   ON CONFLICT(sessao_id,colaborador_id) DO UPDATE SET presente=true,
     origem=CASE WHEN sms_dds_presencas.presente THEN sms_dds_presencas.origem ELSE EXCLUDED.origem END,
     registrado_por=CASE WHEN sms_dds_presencas.presente THEN sms_dds_presencas.registrado_por ELSE auth.uid() END,
     confirmado_em=CASE WHEN sms_dds_presencas.presente THEN sms_dds_presencas.confirmado_em ELSE now() END;
 END LOOP;
 UPDATE public.sms_dds_sessoes SET versao=versao+1,updated_at=now() WHERE id=s.id;
 INSERT INTO public.sms_dds_historico(sessao_id,evento,autor_id,dados) VALUES(s.id,'presencas',auth.uid(),jsonb_build_object('anterior',anterior,'selecionados',p_participantes));
 RETURN s.versao+1;
END; $$;

CREATE FUNCTION public.dds_finalizar(p_id uuid,p_versao integer,p_acao text DEFAULT 'concluir',p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sms_dds_sessoes;
BEGIN
 SELECT * INTO s FROM public.sms_dds_sessoes WHERE id=p_id FOR UPDATE;
 IF s.id IS NULL OR NOT coalesce(public.dds_pode_acessar(s.obra_id),false) THEN RAISE EXCEPTION 'DDS indisponivel'; END IF;
 IF s.versao IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'DDS alterado. Atualize a tela.'; END IF;
 IF p_acao='concluir' THEN
   IF s.status<>'rascunho' THEN RAISE EXCEPTION 'Somente rascunhos podem ser concluidos'; END IF;
   IF s.obra_id IS NULL OR (s.tema_id IS NULL AND nullif(trim(s.tema_livre),'') IS NULL)
     OR s.duracao_min IS NULL OR s.duracao_min<=0 OR s.hora_inicio IS NULL
     OR NOT EXISTS(SELECT 1 FROM public.sms_dds_presencas WHERE sessao_id=s.id AND presente)
   THEN RAISE EXCEPTION 'Informe obra, tema, horario, duracao e ao menos um participante identificado'; END IF;
   IF s.data_sessao>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Nao e permitido concluir DDS futuro'; END IF;
   UPDATE public.sms_dds_sessoes SET status='concluido',finalizado_em=now(),finalizado_por=auth.uid(),versao=versao+1 WHERE id=s.id;
 ELSIF p_acao IN ('reabrir','cancelar') THEN
   IF NOT coalesce(public.can_manage_sms_obra(s.obra_id),false) THEN RAISE EXCEPTION 'Somente a gestao pode reabrir ou cancelar'; END IF;
   IF length(trim(coalesce(p_motivo,'')))<5 THEN RAISE EXCEPTION 'Justifique a operacao'; END IF;
   IF s.status='cancelado' OR (p_acao='reabrir' AND s.status<>'concluido') THEN RAISE EXCEPTION 'Transicao invalida'; END IF;
   UPDATE public.sms_dds_sessoes SET status=CASE WHEN p_acao='reabrir' THEN 'rascunho' ELSE 'cancelado' END,versao=versao+1 WHERE id=s.id;
 ELSE RAISE EXCEPTION 'Acao invalida'; END IF;
 INSERT INTO public.sms_dds_historico(sessao_id,evento,motivo,autor_id,dados)
 VALUES(s.id,p_acao,p_motivo,auth.uid(),jsonb_build_object('sessao',to_jsonb(s),'presencas',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM public.sms_dds_presencas p WHERE sessao_id=s.id)));
END; $$;

CREATE FUNCTION public.dds_registrar(p_id uuid,p_dados jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sms_dds_sessoes; obra uuid; v integer;
BEGIN
 obra:=(p_dados->>'obra_id')::uuid;
 IF obra IS NULL OR NOT coalesce(public.dds_pode_acessar(obra),false) THEN RAISE EXCEPTION 'Acesso negado a obra'; END IF;
 -- Serializa repeticoes do mesmo UUID offline, sem sobrescrever dados finalizados.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO s FROM public.sms_dds_sessoes WHERE id=p_id;
 IF s.id IS NOT NULL THEN
   IF s.obra_id=obra AND s.registrado_por=auth.uid() AND s.source_payload=p_dados THEN RETURN s.id; END IF;
   RAISE EXCEPTION 'Identificador ja utilizado; nenhum dado foi sobrescrito';
 END IF;
 IF nullif(trim(p_dados->>'condutor'),'') IS NULL OR nullif(p_dados->>'data_sessao','') IS NULL
   OR (nullif(p_dados->>'tema_id','') IS NULL AND nullif(trim(p_dados->>'tema_livre'),'') IS NULL)
   OR coalesce((p_dados->>'duracao_min')::integer,0)<=0 THEN RAISE EXCEPTION 'Preencha condutor, data, tema e duracao valida'; END IF;
 INSERT INTO public.sms_dds_sessoes(id,obra_id,tema_id,tema_livre,data_sessao,condutor,hora_inicio,duracao_min,frente_servico,observacoes,fotos,participantes_nomes,registrado_por,source_payload)
 VALUES(p_id,obra,nullif(p_dados->>'tema_id','')::uuid,p_dados->>'tema_livre',(p_dados->>'data_sessao')::date,
 trim(p_dados->>'condutor'),nullif(p_dados->>'hora_inicio','')::time,(p_dados->>'duracao_min')::integer,p_dados->>'frente_servico',p_dados->>'observacoes',
 ARRAY(SELECT jsonb_array_elements_text(coalesce(p_dados->'fotos','[]'))),p_dados->>'participantes_nomes',auth.uid(),p_dados);
 INSERT INTO public.sms_dds_historico(sessao_id,evento,autor_id,dados) VALUES(p_id,'cadastro',auth.uid(),p_dados);
 v:=public.dds_salvar_presencas(p_id,coalesce(p_dados->'participantes','[]'),1);
 IF coalesce((p_dados->>'concluir')::boolean,false) THEN PERFORM public.dds_finalizar(p_id,v); END IF;
 RETURN p_id;
END; $$;

CREATE VIEW public.v_dds_resumo WITH(security_invoker=true) AS
 SELECT s.*,o.nome AS obra_nome,t.titulo AS tema_titulo,
 (SELECT count(*) FROM public.sms_dds_presencas p WHERE p.sessao_id=s.id AND p.presente) AS total_presentes
 FROM public.sms_dds_sessoes s LEFT JOIN public.obras o ON o.id=s.obra_id LEFT JOIN public.sms_dds_temas t ON t.id=s.tema_id;
GRANT SELECT ON public.v_dds_resumo TO authenticated;
REVOKE ALL ON FUNCTION public.dds_equipe(uuid),public.dds_salvar_presencas(uuid,jsonb,integer),public.dds_finalizar(uuid,integer,text,text),public.dds_registrar(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dds_equipe(uuid),public.dds_salvar_presencas(uuid,jsonb,integer),public.dds_finalizar(uuid,integer,text,text),public.dds_registrar(uuid,jsonb) TO authenticated;
CREATE FUNCTION public.dds_detalhe(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sms_dds_sessoes;
BEGIN
 SELECT * INTO s FROM public.sms_dds_sessoes WHERE id=p_id;
 IF s.id IS NULL OR NOT coalesce(public.dds_pode_acessar(s.obra_id),false) THEN RAISE EXCEPTION 'DDS indisponivel'; END IF;
 RETURN jsonb_build_object('sessao',to_jsonb(s),'participantes',(
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.colaborador_id,'nome',e.nome,'origem',p.origem,'presente',p.presente,'confirmado_em',p.confirmado_em,'registrado_por',p.registrado_por) ORDER BY e.nome),'[]')
   FROM public.sms_dds_presencas p JOIN public.employees e ON e.id=p.colaborador_id WHERE p.sessao_id=s.id),
   'historico',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.criado_em DESC),'[]') FROM public.sms_dds_historico h WHERE h.sessao_id=s.id));
END; $$;

CREATE FUNCTION public.dds_editar(p_id uuid,p_versao integer,p_dados jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sms_dds_sessoes; destino uuid;
BEGIN
 SELECT * INTO s FROM public.sms_dds_sessoes WHERE id=p_id FOR UPDATE;
 IF s.id IS NULL OR NOT coalesce(public.dds_pode_acessar(s.obra_id),false) THEN RAISE EXCEPTION 'DDS indisponivel'; END IF;
 IF s.status<>'rascunho' OR s.versao IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'Reabra o rascunho atualizado antes de editar'; END IF;
 destino:=coalesce(s.obra_id,nullif(p_dados->>'obra_id','')::uuid);
 IF destino IS NULL OR NOT coalesce(public.dds_pode_acessar(destino),false) THEN RAISE EXCEPTION 'Informe uma obra autorizada'; END IF;
 IF s.obra_id IS NULL AND EXISTS(SELECT 1 FROM public.sms_dds_presencas p WHERE p.sessao_id=s.id AND p.presente
   AND NOT EXISTS(SELECT 1 FROM public.obra_funcionarios v WHERE v.obra_id=destino AND v.employee_id=p.colaborador_id AND v.status))
 THEN RAISE EXCEPTION 'Revise a lista de presencas antes de vincular esta obra'; END IF;
 IF nullif(trim(p_dados->>'condutor'),'') IS NULL OR nullif(p_dados->>'data_sessao','') IS NULL
 OR (nullif(p_dados->>'tema_id','') IS NULL AND nullif(trim(p_dados->>'tema_livre'),'') IS NULL)
 OR coalesce((p_dados->>'duracao_min')::integer,0)<=0 THEN RAISE EXCEPTION 'Preencha condutor, data, tema e duracao'; END IF;
 UPDATE public.sms_dds_sessoes SET obra_id=destino,tema_id=nullif(p_dados->>'tema_id','')::uuid,tema_livre=p_dados->>'tema_livre',
 data_sessao=(p_dados->>'data_sessao')::date,condutor=trim(p_dados->>'condutor'),hora_inicio=nullif(p_dados->>'hora_inicio','')::time,
 duracao_min=(p_dados->>'duracao_min')::integer,frente_servico=p_dados->>'frente_servico',observacoes=p_dados->>'observacoes',
 fotos=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_dados->'fotos','[]'))),versao=versao+1,updated_at=now() WHERE id=s.id;
 INSERT INTO public.sms_dds_historico(sessao_id,evento,autor_id,dados) VALUES(s.id,'edicao',auth.uid(),jsonb_build_object('anterior',to_jsonb(s),'atual',p_dados));
END; $$;

CREATE FUNCTION public.dds_indicadores(p_inicio date,p_fim date,p_obra uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('total',count(*),'concluidos',count(*) FILTER(WHERE s.status='concluido'),
 'rascunhos',count(*) FILTER(WHERE s.status='rascunho'),'obras',count(DISTINCT s.obra_id) FILTER(WHERE s.status='concluido'),
 'presencas',coalesce(sum((SELECT count(*) FROM public.sms_dds_presencas p WHERE p.sessao_id=s.id AND p.presente)) FILTER(WHERE s.status='concluido'),0))
 FROM public.sms_dds_sessoes s WHERE s.data_sessao BETWEEN p_inicio AND p_fim AND (p_obra IS NULL OR s.obra_id=p_obra);
$$;
REVOKE ALL ON FUNCTION public.dds_detalhe(uuid),public.dds_editar(uuid,integer,jsonb),public.dds_indicadores(date,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dds_detalhe(uuid),public.dds_editar(uuid,integer,jsonb),public.dds_indicadores(date,date,uuid) TO authenticated;
-- RDO e RH contabilizam apenas sessoes concluidas; snapshots de RDO anteriores permanecem intactos.
CREATE OR REPLACE FUNCTION public.sms_rdo_snapshot(p_obra_id uuid, p_data date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'efetivo', jsonb_build_object(
      'presentes', COALESCE((SELECT count(*) FROM public.efetivo_ponto e WHERE e.obra_id=p_obra_id AND e.data=p_data AND NOT e.ausencia), 0),
      'ausentes', COALESCE((SELECT count(*) FROM public.efetivo_ponto e WHERE e.obra_id=p_obra_id AND e.data=p_data AND e.ausencia), 0),
      'hht', COALESCE((SELECT sum(e.horas_trabalhadas) FROM public.efetivo_ponto e WHERE e.obra_id=p_obra_id AND e.data=p_data AND NOT e.ausencia), 0),
      'horas_extras', COALESCE((SELECT sum(e.horas_extras) FROM public.efetivo_ponto e WHERE e.obra_id=p_obra_id AND e.data=p_data), 0)
    ),
    'sms', jsonb_build_object(
      'dds', COALESCE((SELECT count(*) FROM public.sms_dds_sessoes d WHERE d.obra_id=p_obra_id AND d.data_sessao=p_data AND d.status='concluido'), 0),
      'aprs', COALESCE((SELECT count(*) FROM public.sms_aprs a WHERE a.obra_id=p_obra_id AND a.data_hora_inicio::date=p_data AND a.status <> 'cancelada'), 0),
      'inspecoes', COALESCE((SELECT count(*) FROM public.sms_inspecoes i WHERE i.obra_id=p_obra_id AND i.data_inspecao=p_data AND i.status <> 'cancelada'), 0),
      'desvios', COALESCE((SELECT count(*) FROM public.sms_desvios d WHERE d.obra_id=p_obra_id AND d.data_ocorrencia=p_data AND d.status <> 'cancelado'), 0),
      'acidentes', COALESCE((SELECT count(*) FROM public.sms_acidentes a WHERE a.obra_id=p_obra_id AND a.data_hora::date=p_data), 0),
      'near_miss', COALESCE((SELECT count(*) FROM public.sms_near_miss n WHERE n.obra_id=p_obra_id AND n.created_at::date=p_data), 0)
    )
  );
$$;
CREATE OR REPLACE VIEW public.vw_employee_sms_resumo
WITH (security_invoker = true) AS
SELECT e.id AS employee_id,
  (SELECT count(*) FROM public.sms_colaborador_treinamentos t WHERE t.colaborador_id=e.id AND t.status='vencido') AS treinamentos_vencidos,
  (SELECT count(*) FROM public.sms_colaborador_epis ep WHERE ep.colaborador_id=e.id AND ep.data_devolucao IS NULL) AS epis_em_responsabilidade,
  (SELECT count(*) FROM public.sms_dds_presencas d WHERE d.colaborador_id=e.id AND d.presente AND EXISTS(SELECT 1 FROM public.sms_dds_sessoes ds WHERE ds.id=d.sessao_id AND ds.status='concluido')) AS dds_participacoes,
  (SELECT count(*) FROM public.sms_apr_envolvidos a WHERE a.colaborador_id=e.id) AS apr_participacoes,
  (SELECT count(*) FROM public.sms_acidentes ac WHERE ac.colaborador_id=e.id) AS acidentes,
  (SELECT s.aptidao FROM public.sms_saude_ocupacional s WHERE s.colaborador_id=e.id ORDER BY s.data_exame DESC LIMIT 1) AS aso_aptidao,
  (SELECT s.vencimento FROM public.sms_saude_ocupacional s WHERE s.colaborador_id=e.id ORDER BY s.data_exame DESC LIMIT 1) AS aso_vencimento
FROM public.employees e;
COMMIT;

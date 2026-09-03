BEGIN;

-- Corrige a validação de PT da APR. A coluna oficial de sms_pt é aprovada_por.
CREATE OR REPLACE FUNCTION public.apr_pendencias(p_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
 IF coalesce((a.plano->>'exige_pt')::boolean,false) AND NOT EXISTS(
   SELECT 1 FROM sms_pt p
   WHERE p.id=nullif(a.plano->>'pt_id','')::uuid
     AND p.obra_id=a.obra_id AND p.status='aberta'
     AND p.aprovada_por IS NOT NULL
     AND p.data_inicio<=a.data_hora_inicio AND p.data_fim>=a.validade
 ) THEN erros:=array_append(erros,'Vincule PT aprovada da mesma obra cobrindo todo o período'); END IF;
 RETURN ARRAY(SELECT DISTINCT unnest(erros));
END $$;

REVOKE ALL ON FUNCTION public.apr_pendencias(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apr_pendencias(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

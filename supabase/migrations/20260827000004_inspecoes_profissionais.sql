-- Inspecoes profissionais: integridade, rastreabilidade, revisao e desvios automaticos.

ALTER TABLE public.sms_inspecoes_catalogo
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS norma_referencia text,
  ADD COLUMN IF NOT EXISTS periodicidade_dias integer,
  ADD COLUMN IF NOT EXISTS requer_revisao boolean NOT NULL DEFAULT true;

ALTER TABLE public.sms_inspecoes_itens_catalogo
  ADD COLUMN IF NOT EXISTS criterio_aceitacao text,
  ADD COLUMN IF NOT EXISTS criticidade text NOT NULL DEFAULT 'moderada',
  ADD COLUMN IF NOT EXISTS exige_foto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exige_observacao_nc boolean NOT NULL DEFAULT true;

ALTER TABLE public.sms_inspecoes_itens_catalogo
  DROP CONSTRAINT IF EXISTS sms_inspecoes_itens_catalogo_criticidade_check;
ALTER TABLE public.sms_inspecoes_itens_catalogo
  ADD CONSTRAINT sms_inspecoes_itens_catalogo_criticidade_check
  CHECK (criticidade IN ('leve','moderada','grave','impeditiva'));

ALTER TABLE public.sms_inspecoes
  ADD COLUMN IF NOT EXISTS inspetor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS programada_para timestamptz,
  ADD COLUMN IF NOT EXISTS concluida_em timestamptz,
  ADD COLUMN IF NOT EXISTS revisada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revisada_em timestamptz,
  ADD COLUMN IF NOT EXISTS parecer_revisao text,
  ADD COLUMN IF NOT EXISTS resultado text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS assinatura_inspetor text;

ALTER TABLE public.sms_inspecoes DROP CONSTRAINT IF EXISTS sms_inspecoes_status_check;
ALTER TABLE public.sms_inspecoes ADD CONSTRAINT sms_inspecoes_status_check
  CHECK (status IN ('pendente','em_andamento','aguardando_tratamento','aguardando_revisao','aprovada','reprovada','concluida','cancelada'));

ALTER TABLE public.sms_inspecoes DROP CONSTRAINT IF EXISTS sms_inspecoes_resultado_check;
ALTER TABLE public.sms_inspecoes ADD CONSTRAINT sms_inspecoes_resultado_check
  CHECK (resultado IS NULL OR resultado IN ('conforme','conforme_com_restricao','nao_conforme'));

ALTER TABLE public.sms_inspecoes_respostas
  ADD COLUMN IF NOT EXISTS evidencias text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS respondida_em timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS sms_inspecoes_resposta_item_uq
  ON public.sms_inspecoes_respostas(inspecao_id,item_catalogo_id);

CREATE OR REPLACE FUNCTION public.sms_bloquear_edicao_inspecao_encerrada()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_inspecao uuid; v_status text;
BEGIN
  v_inspecao := CASE WHEN TG_OP='DELETE' THEN OLD.inspecao_id ELSE NEW.inspecao_id END;
  SELECT status INTO v_status FROM public.sms_inspecoes WHERE id=v_inspecao;
  IF v_status NOT IN ('pendente','em_andamento') THEN
    IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'desvio_gerado_id') = (to_jsonb(OLD)-'desvio_gerado_id') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Inspecao encerrada nao pode ser alterada';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sms_bloquear_resposta_encerrada ON public.sms_inspecoes_respostas;
CREATE TRIGGER trg_sms_bloquear_resposta_encerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.sms_inspecoes_respostas
  FOR EACH ROW EXECUTE FUNCTION public.sms_bloquear_edicao_inspecao_encerrada();

ALTER TABLE public.sms_desvios
  ADD COLUMN IF NOT EXISTS inspecao_id uuid REFERENCES public.sms_inspecoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspecao_item_id uuid REFERENCES public.sms_inspecoes_itens_catalogo(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sms_desvio_origem_inspecao_uq
  ON public.sms_desvios(inspecao_id,inspecao_item_id)
  WHERE inspecao_id IS NOT NULL AND inspecao_item_id IS NOT NULL AND status <> 'cancelado';

CREATE OR REPLACE FUNCTION public.sms_validar_conclusao_inspecao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_faltantes integer;
  v_nc_sem_detalhe integer;
  v_nc integer;
  v_impeditiva boolean;
  v_requer_revisao boolean;
BEGIN
  IF OLD.status IN ('aguardando_tratamento','aguardando_revisao','aprovada','reprovada','concluida','cancelada')
     AND NEW.status IN ('pendente','em_andamento') THEN
    RAISE EXCEPTION 'Inspecao encerrada nao pode ser reaberta sem processo formal';
  END IF;
  IF NEW.status IN ('concluida','aguardando_revisao','aprovada')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT count(*) INTO v_faltantes
      FROM public.sms_inspecoes_itens_catalogo item
     WHERE item.inspecao_catalogo_id=NEW.catalogo_id AND item.obrigatorio
       AND NOT EXISTS (
         SELECT 1 FROM public.sms_inspecoes_respostas r
          WHERE r.inspecao_id=NEW.id AND r.item_catalogo_id=item.id
            AND r.resposta_original IN ('C','NC','NA')
       );
    IF v_faltantes > 0 THEN
      RAISE EXCEPTION 'Existem % itens obrigatorios sem resposta', v_faltantes;
    END IF;

    SELECT count(*) INTO v_nc_sem_detalhe
      FROM public.sms_inspecoes_respostas r
      JOIN public.sms_inspecoes_itens_catalogo item ON item.id=r.item_catalogo_id
     WHERE r.inspecao_id=NEW.id AND r.conforme=false
       AND ((item.exige_observacao_nc AND nullif(trim(r.observacao),'') IS NULL)
         OR (item.exige_foto AND cardinality(r.evidencias)=0 AND r.foto_url IS NULL));
    IF v_nc_sem_detalhe > 0 THEN
      RAISE EXCEPTION 'Itens nao conformes exigem observacao e/ou evidencia';
    END IF;

    SELECT count(*), coalesce(bool_or(item.criticidade='impeditiva'),false)
      INTO v_nc, v_impeditiva
      FROM public.sms_inspecoes_respostas r
      LEFT JOIN public.sms_inspecoes_itens_catalogo item ON item.id=r.item_catalogo_id
     WHERE r.inspecao_id=NEW.id AND r.conforme=false;
    SELECT coalesce(requer_revisao,true) INTO v_requer_revisao
      FROM public.sms_inspecoes_catalogo WHERE id=NEW.catalogo_id;

    NEW.resultado := CASE WHEN v_nc=0 THEN 'conforme'
                          WHEN v_impeditiva THEN 'nao_conforme'
                          ELSE 'conforme_com_restricao' END;
    NEW.concluida_em := coalesce(NEW.concluida_em,now());
    IF NEW.status='concluida' THEN
      NEW.status := CASE WHEN v_requer_revisao THEN 'aguardando_revisao'
                         WHEN v_nc>0 THEN 'aguardando_tratamento'
                         ELSE 'aprovada' END;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sms_validar_conclusao_inspecao ON public.sms_inspecoes;
CREATE TRIGGER trg_sms_validar_conclusao_inspecao
  BEFORE UPDATE OF status ON public.sms_inspecoes
  FOR EACH ROW EXECUTE FUNCTION public.sms_validar_conclusao_inspecao();

CREATE OR REPLACE FUNCTION public.sms_gerar_desvios_inspecao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; v_desvio uuid;
BEGIN
  IF NEW.status IN ('aguardando_revisao','aguardando_tratamento','aprovada')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR r IN
      SELECT resp.id resposta_id, resp.item_catalogo_id, resp.observacao,
             item.descricao, item.criticidade
        FROM public.sms_inspecoes_respostas resp
        JOIN public.sms_inspecoes_itens_catalogo item ON item.id=resp.item_catalogo_id
       WHERE resp.inspecao_id=NEW.id AND resp.conforme=false
    LOOP
      INSERT INTO public.sms_desvios(
        obra_id,tipo_desvio,descricao,local,severidade,status,data_ocorrencia,
        inspecao_id,inspecao_item_id,registrado_por,fotos
      ) VALUES (
        NEW.obra_id,'Inspecao: '||r.descricao,coalesce(nullif(r.observacao,''),'Item nao conforme'),
        coalesce(NEW.area,'Inspecao de seguranca'),
        CASE r.criticidade WHEN 'impeditiva' THEN 'critico' WHEN 'grave' THEN 'grave'
             WHEN 'moderada' THEN 'moderado' ELSE 'leve' END,
        'aberto',NEW.data_inspecao,NEW.id,r.item_catalogo_id,NEW.registrado_por,NEW.fotos
      ) ON CONFLICT (inspecao_id,inspecao_item_id)
        WHERE inspecao_id IS NOT NULL AND inspecao_item_id IS NOT NULL AND status <> 'cancelado'
        DO UPDATE SET descricao=excluded.descricao, severidade=excluded.severidade
      RETURNING id INTO v_desvio;
      UPDATE public.sms_inspecoes_respostas SET desvio_gerado_id=v_desvio WHERE id=r.resposta_id;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sms_gerar_desvios_inspecao ON public.sms_inspecoes;
CREATE TRIGGER trg_sms_gerar_desvios_inspecao
  AFTER UPDATE OF status ON public.sms_inspecoes
  FOR EACH ROW EXECUTE FUNCTION public.sms_gerar_desvios_inspecao();

CREATE OR REPLACE FUNCTION public.sms_revisar_inspecao(p_inspecao_id uuid, p_aprovar boolean, p_parecer text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.is_tecnico_sms() OR public.is_gestor_obra() OR public.is_gestor_contrato()) THEN
    RAISE EXCEPTION 'Usuario sem permissao para revisar inspecoes';
  END IF;
  UPDATE public.sms_inspecoes
     SET status=CASE WHEN p_aprovar THEN 'aprovada' ELSE 'reprovada' END,
         revisada_por=auth.uid(), revisada_em=now(), parecer_revisao=p_parecer
   WHERE id=p_inspecao_id AND status='aguardando_revisao';
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspecao nao esta aguardando revisao'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.sms_revisar_inspecao(uuid,boolean,text) TO authenticated;

-- Inclui inspecoes e respostas na trilha de auditoria ja existente.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sms_inspecoes','sms_inspecoes_respostas'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sms_audit ON public.%I',t);
    EXECUTE format('CREATE TRIGGER trg_sms_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_sms_auditar()',t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS sms_inspecoes_programada_idx ON public.sms_inspecoes(programada_para,status);
CREATE INDEX IF NOT EXISTS sms_inspecoes_inspetor_idx ON public.sms_inspecoes(inspetor_id,data_inspecao DESC);

-- Compatibiliza o ciclo patrimonial com o novo estado de conclusao/revisao.
CREATE OR REPLACE FUNCTION public.atualizar_equipamento_apos_inspecao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_nao_conforme boolean; v_periodicidade integer; v_alocado boolean;
BEGIN
  IF OLD.concluida_em IS NULL AND NEW.concluida_em IS NOT NULL AND NEW.ferramenta_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.sms_inspecoes_respostas r WHERE r.inspecao_id=NEW.id AND r.conforme=false) INTO v_nao_conforme;
    SELECT periodicidade_inspecao_dias INTO v_periodicidade FROM public.ferramentas_catalogo WHERE id=NEW.ferramenta_id;
    SELECT EXISTS(SELECT 1 FROM public.ferramentas_alocacao a WHERE a.ferramenta_id=NEW.ferramenta_id AND a.data_devolucao IS NULL) INTO v_alocado;
    UPDATE public.ferramentas_catalogo
       SET ultima_inspecao=NEW.data_inspecao,
           proxima_inspecao=CASE WHEN v_periodicidade IS NOT NULL THEN NEW.data_inspecao+v_periodicidade ELSE NULL END,
           status_operacional=CASE WHEN v_nao_conforme THEN 'bloqueado' WHEN v_alocado THEN 'operando' ELSE 'disponivel' END
     WHERE id=NEW.ferramenta_id;
    IF v_nao_conforme THEN
      INSERT INTO public.sms_notificacoes(tipo,destinatario_id,canal,titulo,mensagem,referencia_tabela,referencia_id)
      SELECT 'inspecao_equipamento',e.id,'app','Equipamento bloqueado por inspecao',
             f.nome||coalesce(' ('||f.codigo_patrimonio||')','')||' apresentou item nao conforme.',
             'ferramentas_catalogo',f.id
        FROM public.ferramentas_catalogo f
        CROSS JOIN public.employees e
        JOIN public.user_roles ur ON ur.user_id=e.user_id AND ur.role='tecnico_sms'::public.app_role
       WHERE f.id=NEW.ferramenta_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

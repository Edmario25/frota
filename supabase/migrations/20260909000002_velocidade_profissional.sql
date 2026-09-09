-- Controle de velocidade: governança, segurança e ciclo formal de tratativa.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.sms_checkpoints
  ADD COLUMN IF NOT EXISTS fabricante text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS numero_serie text,
  ADD COLUMN IF NOT EXISTS calibrado_em date,
  ADD COLUMN IF NOT EXISTS calibracao_valida_ate date,
  ADD COLUMN IF NOT EXISTS certificado_calibracao_url text,
  ADD COLUMN IF NOT EXISTS heartbeat_intervalo_seg integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS device_token_hash text,
  ADD COLUMN IF NOT EXISTS device_token_hint text,
  ADD CONSTRAINT sms_checkpoint_heartbeat_valido CHECK (heartbeat_intervalo_seg BETWEEN 30 AND 3600);

UPDATE public.sms_checkpoints
SET device_token_hash = encode(digest(device_token, 'sha256'), 'hex'),
    device_token_hint = right(device_token, 6)
WHERE device_token IS NOT NULL AND device_token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_checkpoint_token_hash
  ON public.sms_checkpoints(device_token_hash) WHERE device_token_hash IS NOT NULL;

ALTER TABLE public.sms_infracoes_velocidade
  ADD COLUMN IF NOT EXISTS causa text,
  ADD COLUMN IF NOT EXISTS acao_corretiva text,
  ADD COLUMN IF NOT EXISTS evidencia_url text,
  ADD COLUMN IF NOT EXISTS tratado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS tratado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelamento_motivo text;

-- Uma única regra de autorização, sempre limitada à obra.
CREATE OR REPLACE FUNCTION public.sms_velocidade_pode_gerir(p_obra_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_gestor_contrato() OR public.is_tecnico_sms()
    OR (public.is_gestor_obra() AND p_obra_id IN (SELECT public.get_my_obra_ids()))
  )
$$;
REVOKE ALL ON FUNCTION public.sms_velocidade_pode_gerir(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_velocidade_pode_gerir(uuid) TO authenticated;

-- Cadastro devolve a credencial uma única vez; o banco guarda somente o hash.
CREATE OR REPLACE FUNCTION public.sms_criar_checkpoint_velocidade(
  p_obra_id uuid, p_nome text, p_descricao text, p_limite integer,
  p_tolerancia integer, p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL,
  p_fabricante text DEFAULT NULL, p_modelo text DEFAULT NULL, p_numero_serie text DEFAULT NULL,
  p_calibrado_em date DEFAULT NULL, p_calibracao_valida_ate date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text:=encode(gen_random_bytes(32),'hex'); v_id uuid;
BEGIN
  IF NOT public.sms_velocidade_pode_gerir(p_obra_id) THEN RAISE EXCEPTION 'Sem permissão para cadastrar equipamento nesta obra'; END IF;
  IF length(trim(COALESCE(p_nome,'')))<3 OR p_limite NOT BETWEEN 5 AND 120 OR p_tolerancia NOT BETWEEN 0 AND 20 THEN
    RAISE EXCEPTION 'Dados do checkpoint inválidos';
  END IF;
  IF p_calibrado_em IS NOT NULL AND p_calibracao_valida_ate < p_calibrado_em THEN RAISE EXCEPTION 'Validade da calibração inválida'; END IF;
  INSERT INTO public.sms_checkpoints(obra_id,nome,descricao,limite_velocidade_kmh,tolerancia_kmh,latitude,longitude,
    fabricante,modelo,numero_serie,calibrado_em,calibracao_valida_ate,device_token,device_token_hash,device_token_hint)
  VALUES(p_obra_id,trim(p_nome),NULLIF(trim(COALESCE(p_descricao,'')),''),p_limite,p_tolerancia,p_latitude,p_longitude,
    NULLIF(trim(COALESCE(p_fabricante,'')),''),NULLIF(trim(COALESCE(p_modelo,'')),''),NULLIF(trim(COALESCE(p_numero_serie,'')),''),
    p_calibrado_em,p_calibracao_valida_ate,NULL,encode(digest(v_token,'sha256'),'hex'),right(v_token,6))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'device_token',v_token);
END $$;
REVOKE ALL ON FUNCTION public.sms_criar_checkpoint_velocidade(uuid,text,text,integer,integer,numeric,numeric,text,text,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_criar_checkpoint_velocidade(uuid,text,text,integer,integer,numeric,numeric,text,text,text,date,date) TO authenticated;

-- Encerramento auditável. O banco não aceita conclusão sem causa e ação.
CREATE OR REPLACE FUNCTION public.sms_tratar_infracao_velocidade(
  p_infracao_id uuid, p_status text, p_tratativa text,
  p_causa text DEFAULT NULL, p_acao_corretiva text DEFAULT NULL
) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_obra uuid; v_agora timestamptz := now();
BEGIN
  SELECT obra_id INTO v_obra FROM public.sms_infracoes_velocidade WHERE id = p_infracao_id;
  IF v_obra IS NULL THEN RAISE EXCEPTION 'Infração não encontrada'; END IF;
  IF NOT public.sms_velocidade_pode_gerir(v_obra) THEN RAISE EXCEPTION 'Sem permissão para tratar infrações desta obra'; END IF;
  IF p_status NOT IN ('em_tratativa','encerrada') THEN RAISE EXCEPTION 'Situação de tratativa inválida'; END IF;
  IF length(trim(COALESCE(p_tratativa,''))) < 5 THEN RAISE EXCEPTION 'Descreva a tratativa realizada'; END IF;
  IF p_status = 'encerrada' AND (length(trim(COALESCE(p_causa,''))) < 3 OR length(trim(COALESCE(p_acao_corretiva,''))) < 3) THEN
    RAISE EXCEPTION 'Causa e ação corretiva são obrigatórias para encerrar';
  END IF;
  UPDATE public.sms_infracoes_velocidade SET status=p_status, tratativa=trim(p_tratativa),
    causa=NULLIF(trim(COALESCE(p_causa,'')),''), acao_corretiva=NULLIF(trim(COALESCE(p_acao_corretiva,'')),''),
    tratado_por=auth.uid(), tratado_em=v_agora,
    encerrada_por=CASE WHEN p_status='encerrada' THEN auth.uid() ELSE encerrada_por END,
    encerrada_em=CASE WHEN p_status='encerrada' THEN v_agora ELSE encerrada_em END, updated_at=v_agora
  WHERE id=p_infracao_id AND status NOT IN ('encerrada','cancelada');
  IF NOT FOUND THEN RAISE EXCEPTION 'Infração já encerrada ou cancelada'; END IF;
  RETURN v_agora;
END $$;
REVOKE ALL ON FUNCTION public.sms_tratar_infracao_velocidade(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_tratar_infracao_velocidade(uuid,text,text,text,text) TO authenticated;

-- Heartbeat independente de passagens: radar ocioso continua aparecendo online.
CREATE OR REPLACE FUNCTION public.sms_checkpoint_heartbeat(p_device_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.sms_checkpoints
  WHERE ativo AND (device_token_hash=encode(digest(p_device_token,'sha256'),'hex') OR device_token=p_device_token);
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok',false,'erro','credencial inválida ou equipamento inativo'); END IF;
  UPDATE public.sms_checkpoints SET device_ultimo_contato=now() WHERE id=v_id;
  RETURN jsonb_build_object('ok',true,'checkpoint_id',v_id,'servidor_em',now());
END $$;
REVOKE ALL ON FUNCTION public.sms_checkpoint_heartbeat(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_checkpoint_heartbeat(text) TO anon, authenticated;

-- Ingestão compatível com dispositivos legados e novos tokens protegidos.
CREATE OR REPLACE FUNCTION public.registrar_passagem_checkpoint(
  p_device_token text, p_tag_epc text, p_velocidade_kmh numeric,
  p_sentido text DEFAULT 'indefinido', p_foto_url text DEFAULT NULL,
  p_detectado_em timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cp record; v_vehicle uuid; v_motorista uuid; v_passagem uuid; v_gravidade text;
BEGIN
  SELECT * INTO v_cp FROM public.sms_checkpoints WHERE ativo AND
    (device_token_hash=encode(digest(p_device_token,'sha256'),'hex') OR device_token=p_device_token);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'erro','credencial inválida ou equipamento inativo'); END IF;
  IF p_velocidade_kmh NOT BETWEEN 0 AND 250 THEN RETURN jsonb_build_object('ok',false,'erro','velocidade fora da faixa aceita'); END IF;
  IF p_sentido NOT IN ('entrada','saida','indefinido') THEN RETURN jsonb_build_object('ok',false,'erro','sentido inválido'); END IF;
  IF p_detectado_em < now()-interval '24 hours' OR p_detectado_em > now()+interval '10 minutes' THEN
    RETURN jsonb_build_object('ok',false,'erro','data da leitura fora da janela aceita');
  END IF;
  SELECT vehicle_id INTO v_vehicle FROM public.sms_veiculos_rfid WHERE tag_epc=trim(p_tag_epc) AND ativa LIMIT 1;
  IF v_vehicle IS NOT NULL THEN SELECT responsavel_id INTO v_motorista FROM public.vehicles WHERE id=v_vehicle; END IF;
  IF EXISTS (SELECT 1 FROM public.sms_checkpoint_passagens WHERE checkpoint_id=v_cp.id
    AND tag_epc=trim(p_tag_epc) AND detectado_em BETWEEN p_detectado_em-interval '2 seconds' AND p_detectado_em+interval '2 seconds') THEN
    RETURN jsonb_build_object('ok',false,'erro','leitura duplicada');
  END IF;
  INSERT INTO public.sms_checkpoint_passagens(checkpoint_id,vehicle_id,tag_epc,motorista_id,velocidade_kmh,
    limite_no_momento,sentido,foto_url,origem,detectado_em)
  VALUES(v_cp.id,v_vehicle,trim(p_tag_epc),v_motorista,p_velocidade_kmh,v_cp.limite_velocidade_kmh,p_sentido,p_foto_url,'dispositivo',p_detectado_em)
  RETURNING id INTO v_passagem;
  UPDATE public.sms_checkpoints SET device_ultimo_contato=now() WHERE id=v_cp.id;
  SELECT gravidade INTO v_gravidade FROM public.sms_infracoes_velocidade WHERE passagem_id=v_passagem;
  RETURN jsonb_build_object('ok',true,'passagem_id',v_passagem,'veiculo_conhecido',v_vehicle IS NOT NULL,
    'limite_kmh',v_cp.limite_velocidade_kmh,'infracao',v_gravidade IS NOT NULL,'gravidade',coalesce(v_gravidade,'nenhuma'));
END $$;
REVOKE ALL ON FUNCTION public.registrar_passagem_checkpoint(text,text,numeric,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_passagem_checkpoint(text,text,numeric,text,text,timestamptz) TO anon,authenticated;

-- Identificação posterior de passagem/tag desconhecida, preservando o histórico.
CREATE OR REPLACE FUNCTION public.sms_identificar_passagem_velocidade(
  p_passagem_id uuid, p_vehicle_id uuid, p_motorista_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_obra uuid;
BEGIN
  SELECT c.obra_id INTO v_obra FROM public.sms_checkpoint_passagens p
  JOIN public.sms_checkpoints c ON c.id=p.checkpoint_id WHERE p.id=p_passagem_id;
  IF v_obra IS NULL THEN RAISE EXCEPTION 'Passagem não encontrada'; END IF;
  IF NOT public.sms_velocidade_pode_gerir(v_obra) THEN RAISE EXCEPTION 'Sem permissão para identificar esta passagem'; END IF;
  UPDATE public.sms_checkpoint_passagens SET vehicle_id=p_vehicle_id, motorista_id=p_motorista_id WHERE id=p_passagem_id;
  UPDATE public.sms_infracoes_velocidade SET vehicle_id=p_vehicle_id, motorista_id=p_motorista_id, updated_at=now() WHERE passagem_id=p_passagem_id;
END $$;
REVOKE ALL ON FUNCTION public.sms_identificar_passagem_velocidade(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_identificar_passagem_velocidade(uuid,uuid,uuid) TO authenticated;

-- Reforça RPCs legadas contra chamadas fora da obra permitida.
CREATE OR REPLACE FUNCTION public.sms_notificar_infracao(p_infracao_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agora timestamptz:=now(); v_obra uuid; v_motorista uuid;
BEGIN
  SELECT obra_id,motorista_id INTO v_obra,v_motorista FROM public.sms_infracoes_velocidade WHERE id=p_infracao_id;
  IF v_obra IS NULL THEN RAISE EXCEPTION 'Infração não encontrada'; END IF;
  IF NOT public.sms_velocidade_pode_gerir(v_obra) THEN RAISE EXCEPTION 'Sem permissão para notificar nesta obra'; END IF;
  IF v_motorista IS NULL THEN RAISE EXCEPTION 'Identifique o motorista antes de notificar'; END IF;
  UPDATE public.sms_infracoes_velocidade SET status='notificada',notificada_em=COALESCE(notificada_em,v_agora),notificada_por=auth.uid(),updated_at=v_agora
  WHERE id=p_infracao_id AND status NOT IN ('encerrada','cancelada');
  IF NOT FOUND THEN RAISE EXCEPTION 'Infração já encerrada ou cancelada'; END IF;
  RETURN v_agora;
END $$;

-- Políticas antigas permitiam gestor de obra atuar globalmente.
DROP POLICY IF EXISTS "sms_checkpoints_write" ON public.sms_checkpoints;
CREATE POLICY "sms_checkpoints_write" ON public.sms_checkpoints FOR ALL TO authenticated
  USING (public.sms_velocidade_pode_gerir(obra_id)) WITH CHECK (public.sms_velocidade_pode_gerir(obra_id));
DROP POLICY IF EXISTS "sms_passagens_insert" ON public.sms_checkpoint_passagens;
CREATE POLICY "sms_passagens_insert" ON public.sms_checkpoint_passagens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sms_checkpoints c WHERE c.id=checkpoint_id AND public.sms_velocidade_pode_gerir(c.obra_id)));
DROP POLICY IF EXISTS "sms_infracoes_update" ON public.sms_infracoes_velocidade;
CREATE POLICY "sms_infracoes_update" ON public.sms_infracoes_velocidade FOR UPDATE TO authenticated
  USING (public.sms_velocidade_pode_gerir(obra_id)) WITH CHECK (public.sms_velocidade_pode_gerir(obra_id));

-- Limites coerentes e dados de telemetria defensivos.
ALTER TABLE public.sms_checkpoint_passagens DROP CONSTRAINT IF EXISTS sms_passagem_velocidade_realista;
ALTER TABLE public.sms_checkpoint_passagens ADD CONSTRAINT sms_passagem_velocidade_realista CHECK (velocidade_kmh BETWEEN 0 AND 250);
CREATE INDEX IF NOT EXISTS idx_sms_passagens_tag_data ON public.sms_checkpoint_passagens(tag_epc,detectado_em DESC);

COMMENT ON COLUMN public.sms_checkpoints.device_token IS 'Legado temporário; novas integrações devem usar credencial armazenada somente como hash.';
COMMENT ON FUNCTION public.sms_checkpoint_heartbeat(text) IS 'Deve ser chamado pelo equipamento no intervalo configurado, mesmo sem passagem.';

-- Inclui todo o módulo na trilha central, com mascaramento automático de tokens.
DO $$ DECLARE tab text; BEGIN
  IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
    FOREACH tab IN ARRAY ARRAY['sms_checkpoints','sms_veiculos_rfid','sms_checkpoint_passagens','sms_infracoes_velocidade'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.%I',tab);
      EXECUTE format('CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao()',tab);
    END LOOP;
  END IF;
END $$;

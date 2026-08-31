-- Gestao profissional de subcontratadas e boletins de medicao.

ALTER TABLE public.subcontratadas
  ADD COLUMN IF NOT EXISTS numero_contrato text,
  ADD COLUMN IF NOT EXISTS email_contato text,
  ADD COLUMN IF NOT EXISTS representante_legal text,
  ADD COLUMN IF NOT EXISTS percentual_retencao numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_aditivos numeric(16,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_fim_real date,
  ADD COLUMN IF NOT EXISTS motivo_status text,
  ADD COLUMN IF NOT EXISTS sms_empresa_id uuid REFERENCES public.sms_empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS encerrada_em timestamptz,
  ADD COLUMN IF NOT EXISTS encerrada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.subcontratadas DROP CONSTRAINT IF EXISTS subcontratada_periodo_check;
ALTER TABLE public.subcontratadas ADD CONSTRAINT subcontratada_periodo_check CHECK (
  data_inicio IS NULL OR data_fim_prevista IS NULL OR data_fim_prevista >= data_inicio
);
ALTER TABLE public.subcontratadas DROP CONSTRAINT IF EXISTS subcontratada_valores_check;
ALTER TABLE public.subcontratadas ADD CONSTRAINT subcontratada_valores_check CHECK (
  coalesce(valor_contrato,0) >= 0 AND valor_aditivos >= 0 AND percentual_retencao BETWEEN 0 AND 100
);
CREATE UNIQUE INDEX IF NOT EXISTS subcontratada_cnpj_obra_ativa_uidx
  ON public.subcontratadas(obra_id, regexp_replace(cnpj,'[^0-9]','','g'))
  WHERE cnpj IS NOT NULL AND status <> 'encerrada';
CREATE UNIQUE INDEX IF NOT EXISTS subcontratada_contrato_obra_uidx
  ON public.subcontratadas(obra_id, upper(trim(numero_contrato)))
  WHERE numero_contrato IS NOT NULL AND trim(numero_contrato) <> '';

DROP VIEW IF EXISTS public.v_subcontratadas_resumo;
CREATE VIEW public.v_subcontratadas_resumo AS
SELECT s.*, o.nome AS obra_nome,
  count(DISTINCT m.id) AS total_medicoes,
  coalesce(sum(m.valor_medido) FILTER (WHERE m.status='aprovada'),0) AS valor_medido_aprovado,
  coalesce(sum(m.valor_medido),0) AS valor_medido_total,
  CASE WHEN coalesce(s.valor_contrato,0)+s.valor_aditivos>0
    THEN round(coalesce(sum(m.valor_medido) FILTER (WHERE m.status='aprovada'),0)/(coalesce(s.valor_contrato,0)+s.valor_aditivos)*100,2)
    ELSE 0 END AS perc_executado
FROM public.subcontratadas s
LEFT JOIN public.obras o ON o.id=s.obra_id
LEFT JOIN public.medicoes m ON m.subcontratada_id=s.id
GROUP BY s.id,o.nome;
GRANT SELECT ON public.v_subcontratadas_resumo TO authenticated;

ALTER TABLE public.medicoes DROP CONSTRAINT IF EXISTS medicoes_status_check;
ALTER TABLE public.medicoes ADD CONSTRAINT medicoes_status_check
  CHECK (status IN ('rascunho','enviada','aprovada','rejeitada','cancelada'));
ALTER TABLE public.medicoes
  ADD COLUMN IF NOT EXISTS enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS enviada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelada_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;
CREATE UNIQUE INDEX IF NOT EXISTS medicoes_bm_obra_uidx ON public.medicoes(obra_id,numero_bm);

CREATE TABLE IF NOT EXISTS public.subcontratada_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontratada_id uuid NOT NULL REFERENCES public.subcontratadas(id) ON DELETE RESTRICT,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  numero text,
  data_emissao date,
  data_vencimento date,
  arquivo_url text,
  status text NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','valido','vencido','rejeitado','dispensado')),
  observacoes text,
  validado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validado_em timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subcontratada_documentos_sub_idx ON public.subcontratada_documentos(subcontratada_id,data_vencimento);
ALTER TABLE public.subcontratada_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subcontratada_documentos_scoped ON public.subcontratada_documentos;
CREATE POLICY subcontratada_documentos_scoped ON public.subcontratada_documentos FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id)) WITH CHECK (public.can_manage_obra_data(obra_id));

CREATE TABLE IF NOT EXISTS public.medicao_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid NOT NULL REFERENCES public.medicoes(id) ON DELETE RESTRICT,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE RESTRICT,
  status_anterior text,
  status_novo text NOT NULL,
  observacao text,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medicao_status_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS medicao_status_historico_scoped ON public.medicao_status_historico;
CREATE POLICY medicao_status_historico_scoped ON public.medicao_status_historico FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id)) WITH CHECK (public.can_manage_obra_data(obra_id));

CREATE OR REPLACE FUNCTION public.processar_medicao_status(p_medicao_id uuid,p_acao text,p_observacao text DEFAULT NULL)
RETURNS public.medicoes LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v public.medicoes; v_novo text; v_total numeric;
BEGIN
  SELECT * INTO v FROM public.medicoes WHERE id=p_medicao_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Medicao nao encontrada'; END IF;
  IF NOT public.can_manage_obra_data(v.obra_id) THEN RAISE EXCEPTION 'Sem permissao para esta obra'; END IF;
  v_novo := CASE
    WHEN p_acao='enviar' AND v.status IN ('rascunho','rejeitada') THEN 'enviada'
    WHEN p_acao='aprovar' AND v.status='enviada' THEN 'aprovada'
    WHEN p_acao='rejeitar' AND v.status='enviada' THEN 'rejeitada'
    WHEN p_acao='cancelar' AND v.status <> 'aprovada' THEN 'cancelada'
    ELSE NULL END;
  IF v_novo IS NULL THEN RAISE EXCEPTION 'Transicao de medicao invalida: % / %',v.status,p_acao; END IF;
  IF p_acao IN ('rejeitar','cancelar') AND length(trim(coalesce(p_observacao,'')))<5 THEN
    RAISE EXCEPTION 'Informe uma justificativa valida';
  END IF;
  SELECT coalesce(sum(valor_total),0) INTO v_total FROM public.medicoes_itens WHERE medicao_id=v.id;
  IF p_acao='enviar' AND v_total<=0 THEN RAISE EXCEPTION 'Inclua itens com valor antes de enviar'; END IF;
  IF p_acao='aprovar' AND EXISTS(
    SELECT 1 FROM public.subcontratada_documentos d WHERE d.subcontratada_id=v.subcontratada_id
      AND d.status NOT IN ('valido','dispensado')
  ) THEN RAISE EXCEPTION 'Existem documentos pendentes ou irregulares'; END IF;

  INSERT INTO public.medicao_status_historico(medicao_id,obra_id,status_anterior,status_novo,observacao,alterado_por)
  VALUES(v.id,v.obra_id,v.status,v_novo,nullif(trim(p_observacao),''),auth.uid());
  PERFORM set_config('app.medicao_status_rpc','true',true);
  UPDATE public.medicoes SET status=v_novo,
    valor_medido=CASE WHEN p_acao='enviar' THEN v_total ELSE valor_medido END,
    enviada_em=CASE WHEN p_acao='enviar' THEN now() ELSE enviada_em END,
    enviada_por=CASE WHEN p_acao='enviar' THEN auth.uid() ELSE enviada_por END,
    aprovado_por=CASE WHEN p_acao='aprovar' THEN auth.uid() ELSE aprovado_por END,
    data_aprovacao=CASE WHEN p_acao='aprovar' THEN current_date ELSE data_aprovacao END,
    observacoes_aprovador=CASE WHEN p_acao='rejeitar' THEN trim(p_observacao) ELSE observacoes_aprovador END,
    cancelada_em=CASE WHEN p_acao='cancelar' THEN now() ELSE cancelada_em END,
    cancelada_por=CASE WHEN p_acao='cancelar' THEN auth.uid() ELSE cancelada_por END,
    motivo_cancelamento=CASE WHEN p_acao='cancelar' THEN trim(p_observacao) ELSE motivo_cancelamento END,
    updated_at=now() WHERE id=v.id RETURNING * INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.encerrar_subcontratada(p_id uuid,p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v public.subcontratadas;
BEGIN
  SELECT * INTO v FROM public.subcontratadas WHERE id=p_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Subcontratada nao encontrada'; END IF;
  IF NOT public.can_manage_obra_data(v.obra_id) THEN RAISE EXCEPTION 'Sem permissao para esta obra'; END IF;
  IF length(trim(coalesce(p_motivo,'')))<5 THEN RAISE EXCEPTION 'Informe o motivo do encerramento'; END IF;
  IF EXISTS(SELECT 1 FROM public.medicoes WHERE subcontratada_id=p_id AND status IN ('rascunho','enviada','rejeitada')) THEN
    RAISE EXCEPTION 'Existem boletins de medicao pendentes';
  END IF;
  PERFORM set_config('app.subcontratada_encerramento_rpc','true',true);
  UPDATE public.subcontratadas SET status='encerrada',motivo_status=trim(p_motivo),data_fim_real=current_date,
    encerrada_em=now(),encerrada_por=auth.uid(),updated_at=now() WHERE id=p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.proteger_fluxos_subcontratadas()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='medicoes' AND NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('app.medicao_status_rpc',true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Altere o status da medicao pelo fluxo de aprovacao';
  END IF;
  IF TG_TABLE_NAME='subcontratadas' AND NEW.status='encerrada' AND OLD.status<>'encerrada'
     AND current_setting('app.subcontratada_encerramento_rpc',true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Encerre o contrato pelo procedimento de encerramento';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_proteger_status_medicao ON public.medicoes;
CREATE TRIGGER trg_proteger_status_medicao BEFORE UPDATE OF status ON public.medicoes
FOR EACH ROW EXECUTE FUNCTION public.proteger_fluxos_subcontratadas();
DROP TRIGGER IF EXISTS trg_proteger_encerramento_sub ON public.subcontratadas;
CREATE TRIGGER trg_proteger_encerramento_sub BEFORE UPDATE OF status ON public.subcontratadas
FOR EACH ROW EXECUTE FUNCTION public.proteger_fluxos_subcontratadas();

CREATE OR REPLACE FUNCTION public.proteger_medicao_finalizada()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.medicoes WHERE id=coalesce(NEW.medicao_id,OLD.medicao_id);
  IF v_status <> 'rascunho' THEN RAISE EXCEPTION 'Itens so podem ser alterados enquanto a medicao estiver em rascunho'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_proteger_medicao_itens ON public.medicoes_itens;
CREATE TRIGGER trg_proteger_medicao_itens BEFORE INSERT OR UPDATE OR DELETE ON public.medicoes_itens
FOR EACH ROW EXECUTE FUNCTION public.proteger_medicao_finalizada();

REVOKE ALL ON FUNCTION public.processar_medicao_status(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encerrar_subcontratada(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.processar_medicao_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_subcontratada(uuid,text) TO authenticated;

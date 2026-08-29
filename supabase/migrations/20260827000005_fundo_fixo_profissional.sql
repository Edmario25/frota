-- Fundo fixo profissional: um caixa ativo por obra, aprovacao, estorno, limites,
-- conciliacao e trilha de auditoria.

ALTER TABLE public.fundo_fixo
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS limite_por_lancamento numeric(12,2),
  ADD COLUMN IF NOT EXISTS limite_diario numeric(12,2),
  ADD COLUMN IF NOT EXISTS comprovante_obrigatorio_acima numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS encerrado_em timestamptz,
  ADD COLUMN IF NOT EXISTS encerrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saldo_fisico_final numeric(12,2);

ALTER TABLE public.fundo_fixo_lancamentos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aprovado',
  ADD COLUMN IF NOT EXISTS fornecedor text,
  ADD COLUMN IF NOT EXISTS fornecedor_documento text,
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS frente_servico text,
  ADD COLUMN IF NOT EXISTS favorecido text,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS rejeitado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejeitado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS lancamento_origem_id uuid REFERENCES public.fundo_fixo_lancamentos(id) ON DELETE SET NULL;

ALTER TABLE public.fundo_fixo_lancamentos DROP CONSTRAINT IF EXISTS fundo_fixo_lancamentos_status_check;
ALTER TABLE public.fundo_fixo_lancamentos ADD CONSTRAINT fundo_fixo_lancamentos_status_check
  CHECK (status IN ('pendente','aprovado','rejeitado','cancelado'));

-- Consolida fundos ativos duplicados sem perder lancamentos ou saldo inicial.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    WITH ranked AS (
      SELECT f.id,f.obra_id,
             first_value(f.id) OVER (
               PARTITION BY f.obra_id
               ORDER BY (SELECT count(*) FROM public.fundo_fixo_lancamentos l WHERE l.fundo_fixo_id=f.id) DESC,
                        f.saldo_inicial DESC,f.created_at
             ) manter_id,
             count(*) OVER (PARTITION BY f.obra_id) qtd
      FROM public.fundo_fixo f WHERE f.status='ativo'
    ) SELECT * FROM ranked WHERE qtd>1 AND id<>manter_id
  LOOP
    UPDATE public.fundo_fixo
       SET saldo_inicial=saldo_inicial+(SELECT saldo_inicial FROM public.fundo_fixo WHERE id=r.id)
     WHERE id=r.manter_id;
    UPDATE public.fundo_fixo_lancamentos SET fundo_fixo_id=r.manter_id WHERE fundo_fixo_id=r.id;
    UPDATE public.fundo_fixo SET status='encerrado',encerrado_em=now(),observacoes=concat_ws(E'\n',observacoes,'Consolidado automaticamente no fundo '||r.manter_id) WHERE id=r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fundo_fixo_um_ativo_por_obra_uq
  ON public.fundo_fixo(obra_id) WHERE status='ativo';

CREATE INDEX IF NOT EXISTS fundo_lanc_status_idx ON public.fundo_fixo_lancamentos(fundo_fixo_id,status,data_lancamento DESC);
CREATE INDEX IF NOT EXISTS fundo_lanc_origem_idx ON public.fundo_fixo_lancamentos(lancamento_origem_id);

-- O saldo considera somente movimentos aprovados.
CREATE OR REPLACE FUNCTION public.recalcular_saldo_fundo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_novo uuid; v_antigo uuid;
BEGIN
  v_novo := CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.fundo_fixo_id END;
  v_antigo := CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.fundo_fixo_id END;
  UPDATE public.fundo_fixo f SET saldo_atual=f.saldo_inicial+
    coalesce((SELECT sum(CASE WHEN l.tipo='entrada' THEN l.valor ELSE -l.valor END)
              FROM public.fundo_fixo_lancamentos l WHERE l.fundo_fixo_id=f.id AND l.status='aprovado'),0),
    updated_at=now()
  WHERE f.id IN (v_novo,v_antigo);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- Recalcula os saldos apos a consolidacao.
UPDATE public.fundo_fixo f SET saldo_atual=f.saldo_inicial+
  coalesce((SELECT sum(CASE WHEN l.tipo='entrada' THEN l.valor ELSE -l.valor END)
            FROM public.fundo_fixo_lancamentos l WHERE l.fundo_fixo_id=f.id AND l.status='aprovado'),0);

CREATE OR REPLACE FUNCTION public.fundo_validar_movimentacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_fundo public.fundo_fixo%ROWTYPE; v_total_dia numeric;
BEGIN
  SELECT * INTO v_fundo FROM public.fundo_fixo WHERE id=NEW.fundo_fixo_id FOR UPDATE;
  IF v_fundo.status<>'ativo' THEN RAISE EXCEPTION 'Fundo fixo nao esta ativo'; END IF;

  IF TG_OP='INSERT' THEN
    NEW.status := CASE WHEN public.is_gestor_contrato() OR public.is_gestor_obra() THEN 'aprovado' ELSE 'pendente' END;
    IF NEW.status='aprovado' THEN NEW.aprovado_por:=auth.uid(); NEW.aprovado_em:=now(); END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='pendente' AND NEW.status='aprovado' THEN
    IF NOT (public.is_gestor_contrato() OR public.is_gestor_obra()) THEN RAISE EXCEPTION 'Sem permissao para aprovar'; END IF;
    NEW.aprovado_por:=auth.uid(); NEW.aprovado_em:=now();
  END IF;

  IF NEW.tipo='saida' AND NEW.status IN ('pendente','aprovado') THEN
    IF v_fundo.limite_por_lancamento IS NOT NULL AND NEW.valor>v_fundo.limite_por_lancamento THEN
      RAISE EXCEPTION 'Valor excede o limite por lancamento de R$ %',v_fundo.limite_por_lancamento;
    END IF;
    SELECT coalesce(sum(valor),0) INTO v_total_dia FROM public.fundo_fixo_lancamentos
     WHERE fundo_fixo_id=NEW.fundo_fixo_id AND tipo='saida' AND status='aprovado'
       AND data_lancamento=NEW.data_lancamento AND id<>NEW.id;
    IF v_fundo.limite_diario IS NOT NULL AND v_total_dia+NEW.valor>v_fundo.limite_diario THEN
      RAISE EXCEPTION 'Limite diario do fundo excedido';
    END IF;
    IF NEW.valor>=v_fundo.comprovante_obrigatorio_acima
       AND NEW.recibo_url IS NULL AND NEW.nf_url IS NULL THEN
      RAISE EXCEPTION 'Comprovante obrigatorio para esta despesa';
    END IF;
    IF NEW.status='aprovado' AND NEW.valor>v_fundo.saldo_atual THEN
      RAISE EXCEPTION 'Saldo insuficiente no fundo fixo';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fundo_validar_movimentacao ON public.fundo_fixo_lancamentos;
CREATE TRIGGER trg_fundo_validar_movimentacao
  BEFORE INSERT OR UPDATE OF valor,tipo,status,data_lancamento,recibo_url,nf_url ON public.fundo_fixo_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fundo_validar_movimentacao();

CREATE OR REPLACE FUNCTION public.fundo_proteger_historico()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lancamentos financeiros nao podem ser excluidos; utilize cancelamento/estorno'; END IF;
  IF OLD.status IN ('aprovado','rejeitado','cancelado') AND
     (NEW.valor,NEW.tipo,NEW.descricao,NEW.data_lancamento,NEW.fundo_fixo_id)
       IS DISTINCT FROM
     (OLD.valor,OLD.tipo,OLD.descricao,OLD.data_lancamento,OLD.fundo_fixo_id) THEN
    RAISE EXCEPTION 'Lancamento processado nao pode ser alterado';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fundo_proteger_historico ON public.fundo_fixo_lancamentos;
CREATE TRIGGER trg_fundo_proteger_historico BEFORE UPDATE OR DELETE ON public.fundo_fixo_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fundo_proteger_historico();

CREATE OR REPLACE FUNCTION public.fundo_proteger_saldo_inicial()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.saldo_inicial IS DISTINCT FROM OLD.saldo_inicial AND EXISTS(
    SELECT 1 FROM public.fundo_fixo_lancamentos WHERE fundo_fixo_id=OLD.id
  ) THEN RAISE EXCEPTION 'Saldo inicial nao pode ser alterado apos a primeira movimentacao'; END IF;
  IF NEW.saldo_inicial IS DISTINCT FROM OLD.saldo_inicial THEN NEW.saldo_atual:=NEW.saldo_inicial; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fundo_proteger_saldo_inicial ON public.fundo_fixo;
CREATE TRIGGER trg_fundo_proteger_saldo_inicial BEFORE UPDATE OF saldo_inicial ON public.fundo_fixo
  FOR EACH ROW EXECUTE FUNCTION public.fundo_proteger_saldo_inicial();

CREATE TABLE IF NOT EXISTS public.fundo_fixo_conciliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundo_fixo_id uuid NOT NULL REFERENCES public.fundo_fixo(id) ON DELETE RESTRICT,
  data_conciliacao date NOT NULL DEFAULT current_date,
  saldo_sistema numeric(12,2) NOT NULL,
  saldo_fisico numeric(12,2) NOT NULL,
  diferenca numeric(12,2) GENERATED ALWAYS AS (saldo_fisico-saldo_sistema) STORED,
  justificativa text,
  conferido_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fundo_fixo_conciliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY fundo_conciliacoes_select ON public.fundo_fixo_conciliacoes FOR SELECT TO authenticated
  USING (public.is_gestor_contrato() OR (public.is_gestor_obra() AND EXISTS(
    SELECT 1 FROM public.fundo_fixo f WHERE f.id=fundo_fixo_id AND f.obra_id=public.get_user_obra_id()
  )));
CREATE POLICY fundo_conciliacoes_insert ON public.fundo_fixo_conciliacoes FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_contrato() OR (public.is_gestor_obra() AND EXISTS(
    SELECT 1 FROM public.fundo_fixo f WHERE f.id=fundo_fixo_id AND f.obra_id=public.get_user_obra_id()
  )));

CREATE TABLE IF NOT EXISTS public.fundo_fixo_auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabela text NOT NULL,registro_id uuid NOT NULL,operacao text NOT NULL,
  dados_anteriores jsonb,dados_novos jsonb,usuario_id uuid,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fundo_fixo_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY fundo_auditoria_select ON public.fundo_fixo_auditoria FOR SELECT TO authenticated
  USING (public.is_gestor_contrato());

CREATE OR REPLACE FUNCTION public.fn_fundo_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.fundo_fixo_auditoria(tabela,registro_id,operacao,dados_anteriores,dados_novos,usuario_id)
  VALUES(TG_TABLE_NAME,coalesce(NEW.id,OLD.id),TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,auth.uid());
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trg_fundo_auditoria ON public.fundo_fixo;
CREATE TRIGGER trg_fundo_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.fundo_fixo FOR EACH ROW EXECUTE FUNCTION public.fn_fundo_auditar();
DROP TRIGGER IF EXISTS trg_fundo_lanc_auditoria ON public.fundo_fixo_lancamentos;
CREATE TRIGGER trg_fundo_lanc_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.fundo_fixo_lancamentos FOR EACH ROW EXECUTE FUNCTION public.fn_fundo_auditar();

CREATE OR REPLACE FUNCTION public.aprovar_lancamento_fundo(p_id uuid,p_aprovar boolean,p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.is_gestor_contrato() OR public.is_gestor_obra()) THEN RAISE EXCEPTION 'Sem permissao para aprovar'; END IF;
  UPDATE public.fundo_fixo_lancamentos SET
    status=CASE WHEN p_aprovar THEN 'aprovado' ELSE 'rejeitado' END,
    aprovado_por=CASE WHEN p_aprovar THEN auth.uid() END,
    aprovado_em=CASE WHEN p_aprovar THEN now() END,
    rejeitado_por=CASE WHEN NOT p_aprovar THEN auth.uid() END,
    rejeitado_em=CASE WHEN NOT p_aprovar THEN now() END,
    motivo_rejeicao=CASE WHEN NOT p_aprovar THEN nullif(trim(p_motivo),'') END
  WHERE id=p_id AND status='pendente' AND (
    public.is_gestor_contrato() OR fundo_fixo_id IN (
      SELECT id FROM public.fundo_fixo WHERE obra_id=public.get_user_obra_id()
    )
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'Lancamento nao esta pendente'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.aprovar_lancamento_fundo(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_lancamento_fundo(p_id uuid,p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.fundo_fixo_lancamentos%ROWTYPE;
BEGIN
  IF NOT (public.is_gestor_contrato() OR public.is_gestor_obra()) THEN RAISE EXCEPTION 'Sem permissao para cancelar'; END IF;
  IF nullif(trim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
  SELECT * INTO v FROM public.fundo_fixo_lancamentos WHERE id=p_id FOR UPDATE;
  IF public.is_gestor_obra() AND NOT public.is_gestor_contrato() AND NOT EXISTS(
    SELECT 1 FROM public.fundo_fixo f WHERE f.id=v.fundo_fixo_id AND f.obra_id=public.get_user_obra_id()
  ) THEN RAISE EXCEPTION 'Lancamento pertence a outra obra'; END IF;
  IF v.status<>'aprovado' THEN RAISE EXCEPTION 'Somente lancamento aprovado pode ser estornado'; END IF;
  UPDATE public.fundo_fixo_lancamentos SET status='cancelado',cancelado_por=auth.uid(),cancelado_em=now(),motivo_cancelamento=p_motivo WHERE id=p_id;
  -- A exclusao do movimento aprovado do calculo do saldo produz o estorno
  -- contabil preservando o registro original, motivo, autor e data.
  RETURN p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.cancelar_lancamento_fundo(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.encerrar_fundo_fixo(p_id uuid,p_saldo_fisico numeric,p_justificativa text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.fundo_fixo%ROWTYPE;
BEGIN
  IF NOT (public.is_gestor_contrato() OR public.is_gestor_obra()) THEN RAISE EXCEPTION 'Sem permissao para encerrar'; END IF;
  SELECT * INTO v FROM public.fundo_fixo WHERE id=p_id FOR UPDATE;
  IF v.status<>'ativo' THEN RAISE EXCEPTION 'Fundo nao esta ativo'; END IF;
  IF public.is_gestor_obra() AND NOT public.is_gestor_contrato() AND v.obra_id<>public.get_user_obra_id() THEN
    RAISE EXCEPTION 'Fundo pertence a outra obra';
  END IF;
  IF EXISTS(SELECT 1 FROM public.fundo_fixo_lancamentos WHERE fundo_fixo_id=p_id AND status='pendente') THEN
    RAISE EXCEPTION 'Existem lancamentos pendentes de aprovacao';
  END IF;
  IF p_saldo_fisico IS DISTINCT FROM v.saldo_atual AND nullif(trim(p_justificativa),'') IS NULL THEN
    RAISE EXCEPTION 'Justifique a diferenca antes de encerrar';
  END IF;
  INSERT INTO public.fundo_fixo_conciliacoes(fundo_fixo_id,saldo_sistema,saldo_fisico,justificativa,conferido_por)
  VALUES(p_id,v.saldo_atual,p_saldo_fisico,p_justificativa,auth.uid());
  UPDATE public.fundo_fixo SET status='encerrado',encerrado_em=now(),encerrado_por=auth.uid(),saldo_fisico_final=p_saldo_fisico WHERE id=p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.encerrar_fundo_fixo(uuid,numeric,text) TO authenticated;

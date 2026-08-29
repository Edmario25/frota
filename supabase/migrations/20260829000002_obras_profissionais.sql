-- Gestao profissional de obras: dados contratuais, ciclo de vida, auditoria e encerramento seguro.

ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS numero_contrato text,
  ADD COLUMN IF NOT EXISTS objeto_contrato text,
  ADD COLUMN IF NOT EXISTS valor_contrato numeric(15,2),
  ADD COLUMN IF NOT EXISTS centro_custo text,
  ADD COLUMN IF NOT EXISTS tipo_obra text,
  ADD COLUMN IF NOT EXISTS data_inicio_real date,
  ADD COLUMN IF NOT EXISTS data_termino_real date,
  ADD COLUMN IF NOT EXISTS gerente_obra_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_sms_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_qualidade_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contato_cliente_nome text,
  ADD COLUMN IF NOT EXISTS contato_cliente_email text,
  ADD COLUMN IF NOT EXISTS contato_cliente_telefone text,
  ADD COLUMN IF NOT EXISTS motivo_status text,
  ADD COLUMN IF NOT EXISTS encerrada_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivada_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_arquivamento text;

ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS obras_periodo_previsto_check;
ALTER TABLE public.obras ADD CONSTRAINT obras_periodo_previsto_check CHECK (
  data_inicio_prevista IS NULL OR data_termino_prevista IS NULL OR data_termino_prevista >= data_inicio_prevista
);
ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS obras_periodo_real_check;
ALTER TABLE public.obras ADD CONSTRAINT obras_periodo_real_check CHECK (
  data_inicio_real IS NULL OR data_termino_real IS NULL OR data_termino_real >= data_inicio_real
);
ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS obras_valor_contrato_check;
ALTER TABLE public.obras ADD CONSTRAINT obras_valor_contrato_check CHECK (valor_contrato IS NULL OR valor_contrato >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS obras_codigo_ativo_uidx
  ON public.obras (upper(trim(codigo_interno)))
  WHERE codigo_interno IS NOT NULL AND trim(codigo_interno) <> '' AND arquivada_em IS NULL;

CREATE TABLE IF NOT EXISTS public.obra_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE RESTRICT,
  status_anterior public.obra_status,
  status_novo public.obra_status NOT NULL,
  motivo text,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_status_historico_obra_idx
  ON public.obra_status_historico (obra_id, created_at DESC);
ALTER TABLE public.obra_status_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obra_status_historico_select ON public.obra_status_historico;
CREATE POLICY obra_status_historico_select ON public.obra_status_historico FOR SELECT TO authenticated
  USING (public.can_access_obra_data(obra_id));
DROP POLICY IF EXISTS obra_status_historico_insert ON public.obra_status_historico;
CREATE POLICY obra_status_historico_insert ON public.obra_status_historico FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_obra_data(obra_id));

CREATE OR REPLACE FUNCTION public.proteger_status_obra()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.status <> 'planejada' THEN
    RAISE EXCEPTION 'Novas obras devem iniciar como planejadas';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('app.obra_status_rpc', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Use o fluxo de alteracao de status da obra';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proteger_status_obra ON public.obras;
CREATE TRIGGER trg_proteger_status_obra BEFORE INSERT OR UPDATE OF status ON public.obras
FOR EACH ROW EXECUTE FUNCTION public.proteger_status_obra();

CREATE OR REPLACE FUNCTION public.obra_pendencias_encerramento(p_obra_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'funcionarios_ativos', (SELECT count(*) FROM obra_funcionarios WHERE obra_id=p_obra_id AND status=true),
    'veiculos_ativos', (SELECT count(*) FROM obra_veiculos WHERE obra_id=p_obra_id AND status=true),
    'ferramentas_ativas', (SELECT count(*) FROM ferramentas_alocacao WHERE obra_id=p_obra_id AND data_devolucao IS NULL),
    'ncs_abertas', (SELECT count(*) FROM nao_conformidades WHERE obra_id=p_obra_id AND status NOT IN ('encerrada','cancelada')),
    'fundos_ativos', (SELECT count(*) FROM fundo_fixo WHERE obra_id=p_obra_id AND status='ativo')
  );
$$;

CREATE OR REPLACE FUNCTION public.alterar_status_obra(
  p_obra_id uuid,
  p_status public.obra_status,
  p_motivo text DEFAULT NULL
)
RETURNS public.obras
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_obra public.obras;
  v_pendencias jsonb;
  v_total integer;
BEGIN
  SELECT * INTO v_obra FROM public.obras WHERE id=p_obra_id FOR UPDATE;
  IF v_obra.id IS NULL THEN RAISE EXCEPTION 'Obra nao encontrada'; END IF;
  IF v_obra.arquivada_em IS NOT NULL THEN RAISE EXCEPTION 'Obra arquivada nao pode ser alterada'; END IF;
  IF p_status = v_obra.status THEN RETURN v_obra; END IF;
  IF p_status='pausada' AND length(trim(coalesce(p_motivo,''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo da pausa';
  END IF;
  IF p_status='concluida' THEN
    v_pendencias := public.obra_pendencias_encerramento(p_obra_id);
    SELECT sum(value::integer) INTO v_total FROM jsonb_each_text(v_pendencias);
    IF coalesce(v_total,0) > 0 THEN
      RAISE EXCEPTION 'A obra possui pendencias para encerramento: %', v_pendencias::text;
    END IF;
  END IF;

  INSERT INTO public.obra_status_historico(status_anterior,status_novo,obra_id,motivo,alterado_por)
  VALUES(v_obra.status,p_status,p_obra_id,nullif(trim(p_motivo),''),auth.uid());

  PERFORM set_config('app.obra_status_rpc','true',true);
  UPDATE public.obras SET
    status=p_status,
    motivo_status=nullif(trim(p_motivo),''),
    data_inicio_real=CASE WHEN p_status='em_andamento' THEN coalesce(data_inicio_real,current_date) ELSE data_inicio_real END,
    data_termino_real=CASE WHEN p_status='concluida' THEN coalesce(data_termino_real,current_date) ELSE data_termino_real END,
    encerrada_em=CASE WHEN p_status='concluida' THEN now() ELSE NULL END,
    updated_at=now()
  WHERE id=p_obra_id RETURNING * INTO v_obra;
  RETURN v_obra;
END;
$$;

CREATE OR REPLACE FUNCTION public.arquivar_obra(p_obra_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_status public.obra_status;
BEGIN
  IF length(trim(coalesce(p_motivo,''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo do arquivamento'; END IF;
  SELECT status INTO v_status FROM public.obras WHERE id=p_obra_id AND arquivada_em IS NULL FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Obra inexistente ou ja arquivada'; END IF;
  IF v_status <> 'concluida' THEN RAISE EXCEPTION 'Somente obras concluidas podem ser arquivadas'; END IF;
  UPDATE public.obras SET arquivada_em=now(), arquivada_por=auth.uid(), motivo_arquivamento=trim(p_motivo), updated_at=now()
  WHERE id=p_obra_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_resumo_360(p_obra_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'funcionarios', (SELECT count(*) FROM obra_funcionarios WHERE obra_id=p_obra_id AND status=true),
    'veiculos', (SELECT count(*) FROM obra_veiculos WHERE obra_id=p_obra_id AND status=true),
    'equipes', (SELECT count(*) FROM obra_equipes WHERE obra_id=p_obra_id AND ativo=true),
    'fornecedores', (SELECT count(*) FROM obra_fornecedores WHERE obra_id=p_obra_id AND status=true),
    'ncs_abertas', (SELECT count(*) FROM nao_conformidades WHERE obra_id=p_obra_id AND status NOT IN ('encerrada','cancelada')),
    'ferramentas', (SELECT count(*) FROM ferramentas_alocacao WHERE obra_id=p_obra_id AND data_devolucao IS NULL),
    'estoque_itens', (SELECT count(*) FROM almoxarifado_estoque WHERE obra_id=p_obra_id AND quantidade > 0),
    'pendencias_encerramento', public.obra_pendencias_encerramento(p_obra_id)
  );
$$;

REVOKE ALL ON FUNCTION public.obra_pendencias_encerramento(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.alterar_status_obra(uuid, public.obra_status, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arquivar_obra(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obra_resumo_360(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obra_pendencias_encerramento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_status_obra(uuid, public.obra_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arquivar_obra(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obra_resumo_360(uuid) TO authenticated;

-- RDO profissional: numeracao atomica, integracao operacional e fluxo de aprovacao.

ALTER TABLE public.sms_rdo
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS devolvido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS devolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_devolucao text,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS responsavel_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico text,
  ADD COLUMN IF NOT EXISTS crea_art text,
  ADD COLUMN IF NOT EXISTS contrato_referencia text,
  ADD COLUMN IF NOT EXISTS frente_servico text,
  ADD COLUMN IF NOT EXISTS comentarios_fiscalizacao text,
  ADD COLUMN IF NOT EXISTS horas_improdutivas numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_improdutividade text,
  ADD COLUMN IF NOT EXISTS snapshot_sms jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_efetivo jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_rdo_status_check') THEN
    ALTER TABLE public.sms_rdo ADD CONSTRAINT sms_rdo_status_check
      CHECK (status IN ('rascunho','enviado','devolvido','aprovado','cancelado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_rdo_versao_check') THEN
    ALTER TABLE public.sms_rdo ADD CONSTRAINT sms_rdo_versao_check CHECK (versao > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_rdo_horas_improdutivas_check') THEN
    ALTER TABLE public.sms_rdo ADD CONSTRAINT sms_rdo_horas_improdutivas_check CHECK (horas_improdutivas >= 0);
  END IF;
END $$;

-- Preserva legados com numeracao repetida sem impedir a implantacao.
WITH repetidos AS (
  SELECT id, row_number() OVER (PARTITION BY obra_id, numero_relatorio ORDER BY created_at, id) AS ordem
  FROM public.sms_rdo
  WHERE numero_relatorio IS NOT NULL
)
UPDATE public.sms_rdo r
SET numero_relatorio = r.numero_relatorio || '-LEG-' || left(r.id::text, 6)
FROM repetidos d
WHERE r.id=d.id AND d.ordem > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sms_rdo_numero_obra_uidx
  ON public.sms_rdo (obra_id, numero_relatorio) WHERE numero_relatorio IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_rdo_status_idx ON public.sms_rdo(status);

CREATE TABLE IF NOT EXISTS public.sms_rdo_sequencias (
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  ano integer NOT NULL,
  ultimo_numero integer NOT NULL DEFAULT 0,
  PRIMARY KEY (obra_id, ano)
);

CREATE TABLE IF NOT EXISTS public.sms_rdo_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rdo_id uuid NOT NULL REFERENCES public.sms_rdo(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  dados jsonb NOT NULL,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_rdo_versoes_rdo_idx ON public.sms_rdo_versoes(rdo_id, versao DESC);

ALTER TABLE public.sms_rdo_sequencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_rdo_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_rdo_versoes_select ON public.sms_rdo_versoes;
CREATE POLICY sms_rdo_versoes_select ON public.sms_rdo_versoes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sms_rdo r
    WHERE r.id = rdo_id AND public.can_manage_sms_record(r.obra_id)
  ));

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
      'dds', COALESCE((SELECT count(*) FROM public.sms_dds_sessoes d WHERE d.obra_id=p_obra_id AND d.data_sessao=p_data), 0),
      'aprs', COALESCE((SELECT count(*) FROM public.sms_aprs a WHERE a.obra_id=p_obra_id AND a.data_hora_inicio::date=p_data AND a.status <> 'cancelada'), 0),
      'inspecoes', COALESCE((SELECT count(*) FROM public.sms_inspecoes i WHERE i.obra_id=p_obra_id AND i.data_inspecao=p_data AND i.status <> 'cancelada'), 0),
      'desvios', COALESCE((SELECT count(*) FROM public.sms_desvios d WHERE d.obra_id=p_obra_id AND d.data_ocorrencia=p_data AND d.status <> 'cancelado'), 0),
      'acidentes', COALESCE((SELECT count(*) FROM public.sms_acidentes a WHERE a.obra_id=p_obra_id AND a.data_hora::date=p_data), 0),
      'near_miss', COALESCE((SELECT count(*) FROM public.sms_near_miss n WHERE n.obra_id=p_obra_id AND n.created_at::date=p_data), 0)
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.sms_rdo_snapshot(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.sms_rdo_preparar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq integer;
  v_prefix text;
  v_snapshot jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := COALESCE(NEW.criado_por, auth.uid());
    NEW.registrado_por := COALESCE(NEW.registrado_por, auth.uid());
    IF NEW.numero_relatorio IS NULL OR btrim(NEW.numero_relatorio) = '' THEN
      INSERT INTO public.sms_rdo_sequencias(obra_id, ano, ultimo_numero)
      VALUES (NEW.obra_id, extract(year FROM NEW.data_rdo)::integer, 1)
      ON CONFLICT (obra_id, ano) DO UPDATE
        SET ultimo_numero = public.sms_rdo_sequencias.ultimo_numero + 1
      RETURNING ultimo_numero INTO v_seq;
      SELECT COALESCE(NULLIF(regexp_replace(codigo_interno, '[^[:alnum:]-]', '', 'g'), ''), 'RDO')
        INTO v_prefix FROM public.obras WHERE id=NEW.obra_id;
      NEW.numero_relatorio := format('%s-%s-%s', COALESCE(v_prefix,'RDO'), extract(year FROM NEW.data_rdo)::integer, lpad(v_seq::text,4,'0'));
    END IF;
  ELSIF OLD.status IN ('aprovado','cancelado') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'RDO encerrado nao pode ser alterado';
  ELSIF to_jsonb(NEW) - ARRAY['updated_at','versao'] IS DISTINCT FROM to_jsonb(OLD) - ARRAY['updated_at','versao'] THEN
    INSERT INTO public.sms_rdo_versoes(rdo_id,versao,dados,alterado_por)
    VALUES (OLD.id,OLD.versao,to_jsonb(OLD),auth.uid());
    NEW.versao := OLD.versao + 1;
  END IF;

  IF NEW.obra_id IS NOT NULL AND NEW.data_rdo IS NOT NULL THEN
    v_snapshot := public.sms_rdo_snapshot(NEW.obra_id, NEW.data_rdo);
    NEW.snapshot_efetivo := COALESCE(v_snapshot->'efetivo','{}'::jsonb);
    NEW.snapshot_sms := COALESCE(v_snapshot->'sms','{}'::jsonb);
    NEW.efetivo_total := COALESCE((v_snapshot#>>'{efetivo,presentes}')::integer, NEW.efetivo_total, 0);
    NEW.dds_realizado := COALESCE((v_snapshot#>>'{sms,dds}')::integer,0) > 0;
    NEW.aprs_realizadas := COALESCE((v_snapshot#>>'{sms,aprs}')::integer,0);
    NEW.inspecoes_realizadas := COALESCE((v_snapshot#>>'{sms,inspecoes}')::integer,0);
    NEW.desvios_registrados := COALESCE((v_snapshot#>>'{sms,desvios}')::integer,0);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sms_rdo_preparar ON public.sms_rdo;
CREATE TRIGGER trg_sms_rdo_preparar
  BEFORE INSERT OR UPDATE ON public.sms_rdo
  FOR EACH ROW EXECUTE FUNCTION public.sms_rdo_preparar();

CREATE OR REPLACE FUNCTION public.sms_agregar_resumo_rdo(p_rdo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sms_rdo SET updated_at=now() WHERE id=p_rdo_id;
END $$;
GRANT EXECUTE ON FUNCTION public.sms_agregar_resumo_rdo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sms_rdo_mudar_status(p_rdo_id uuid, p_acao text, p_motivo text DEFAULT NULL)
RETURNS public.sms_rdo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rdo public.sms_rdo;
  v_role text;
BEGIN
  SELECT * INTO v_rdo FROM public.sms_rdo WHERE id=p_rdo_id FOR UPDATE;
  IF v_rdo.id IS NULL OR NOT public.can_manage_sms_record(v_rdo.obra_id) THEN
    RAISE EXCEPTION 'RDO nao encontrado ou acesso negado';
  END IF;
  v_role := public.get_user_role(auth.uid())::text;

  IF p_acao='enviar' AND v_rdo.status IN ('rascunho','devolvido') THEN
    IF v_rdo.obra_id IS NULL OR NULLIF(btrim(v_rdo.responsavel),'') IS NULL OR
       (COALESCE(jsonb_array_length(v_rdo.atividades),0)=0 AND NULLIF(btrim(v_rdo.atividades_executadas),'') IS NULL) THEN
      RAISE EXCEPTION 'Complete obra, responsavel e atividades antes do envio';
    END IF;
    UPDATE public.sms_rdo SET status='enviado', enviado_por=auth.uid(), enviado_em=now(), motivo_devolucao=NULL WHERE id=p_rdo_id RETURNING * INTO v_rdo;
  ELSIF p_acao='aprovar' AND v_rdo.status='enviado' AND v_role IN ('admin','gestor_contrato','gestor_obra') THEN
    UPDATE public.sms_rdo SET status='aprovado', aprovado_por=auth.uid(), aprovado_em=now() WHERE id=p_rdo_id RETURNING * INTO v_rdo;
  ELSIF p_acao='devolver' AND v_rdo.status='enviado' AND v_role IN ('admin','gestor_contrato','gestor_obra') THEN
    IF NULLIF(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da devolucao'; END IF;
    UPDATE public.sms_rdo SET status='devolvido', devolvido_por=auth.uid(), devolvido_em=now(), motivo_devolucao=p_motivo WHERE id=p_rdo_id RETURNING * INTO v_rdo;
  ELSIF p_acao='cancelar' AND v_rdo.status <> 'aprovado' AND v_role IN ('admin','gestor_contrato','gestor_obra') THEN
    IF NULLIF(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
    UPDATE public.sms_rdo SET status='cancelado', cancelado_por=auth.uid(), cancelado_em=now(), motivo_cancelamento=p_motivo WHERE id=p_rdo_id RETURNING * INTO v_rdo;
  ELSE
    RAISE EXCEPTION 'Transicao de status nao permitida';
  END IF;
  RETURN v_rdo;
END $$;
GRANT EXECUTE ON FUNCTION public.sms_rdo_mudar_status(uuid,text,text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.sms_rdo_sequencias FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sms_rdo_versoes FROM authenticated;

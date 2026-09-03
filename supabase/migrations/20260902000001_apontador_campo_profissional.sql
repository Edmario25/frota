-- Regras operacionais e aprovação de exceções do App Apontador de Campo.

ALTER TABLE public.efetivo_ponto
  ADD COLUMN IF NOT EXISTS aprovacao_status text NOT NULL DEFAULT 'aprovado',
  ADD COLUMN IF NOT EXISTS aprovado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS justificativa_ajuste text;

ALTER TABLE public.efetivo_ponto
  DROP CONSTRAINT IF EXISTS efetivo_ponto_aprovacao_status_check;
ALTER TABLE public.efetivo_ponto
  ADD CONSTRAINT efetivo_ponto_aprovacao_status_check
  CHECK (aprovacao_status IN ('pendente', 'aprovado', 'rejeitado'));

CREATE INDEX IF NOT EXISTS efetivo_ponto_aprovacao_idx
  ON public.efetivo_ponto (obra_id, data, aprovacao_status);

DROP POLICY IF EXISTS cronograma_itens_apontador_read ON public.cronograma_itens;
CREATE POLICY cronograma_itens_apontador_read ON public.cronograma_itens
  FOR SELECT TO authenticated
  USING (
    public.has_employee_app_access('campo')
    AND public.is_employee_assigned_to_obra(public.get_user_employee_id(), obra_id)
  );

DROP POLICY IF EXISTS sms_frentes_apontador_read ON public.sms_frentes;
CREATE POLICY sms_frentes_apontador_read ON public.sms_frentes
  FOR SELECT TO authenticated
  USING (
    public.has_employee_app_access('campo')
    AND public.is_employee_assigned_to_obra(public.get_user_employee_id(), obra_id)
  );

CREATE OR REPLACE FUNCTION public.validar_apontamento_campo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  total_horas numeric := coalesce(NEW.horas_trabalhadas, 0);
  justificativa text := trim(coalesce(NEW.justificativa_ajuste, NEW.observacao, ''));
BEGIN
  IF NEW.fonte <> 'campo' THEN RETURN NEW; END IF;

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF TG_OP = 'INSERT' AND NEW.registrado_por IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Responsável pelo apontamento inválido';
  ELSIF TG_OP = 'UPDATE'
    AND NOT public.can_manage_obra_data(NEW.obra_id)
    AND OLD.registrado_por IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão para alterar este apontamento';
  END IF;
  IF NOT public.can_submit_field_time(NEW.obra_id)
     OR NOT public.is_employee_assigned_to_obra(NEW.employee_id, NEW.obra_id) THEN
    RAISE EXCEPTION 'Sem permissão para apontar este funcionário nesta obra';
  END IF;
  IF TG_OP = 'UPDATE'
     AND public.can_manage_obra_data(NEW.obra_id)
     AND NEW.aprovacao_status IS DISTINCT FROM OLD.aprovacao_status
     AND ROW(NEW.hora_entrada, NEW.hora_saida, NEW.horas_trabalhadas, NEW.horas_extras,
             NEW.frente, NEW.atividade, NEW.ausencia, NEW.motivo_ausencia)
         IS NOT DISTINCT FROM
         ROW(OLD.hora_entrada, OLD.hora_saida, OLD.horas_trabalhadas, OLD.horas_extras,
             OLD.frente, OLD.atividade, OLD.ausencia, OLD.motivo_ausencia) THEN
    IF NEW.aprovacao_status NOT IN ('aprovado', 'rejeitado') THEN
      RAISE EXCEPTION 'Decisão de aprovação inválida';
    END IF;
    NEW.aprovado_por := auth.uid();
    NEW.aprovado_em := now();
    RETURN NEW;
  END IF;
  IF NEW.data > current_date OR NEW.data < current_date - 30 THEN
    RAISE EXCEPTION 'Data fora do período permitido para apontamento';
  END IF;
  IF NEW.ausencia THEN
    IF length(trim(coalesce(NEW.motivo_ausencia, ''))) < 5 THEN
      RAISE EXCEPTION 'Motivo obrigatório para registrar ausência';
    END IF;
    NEW.hora_entrada := NULL;
    NEW.hora_saida := NULL;
    NEW.horas_trabalhadas := 0;
    NEW.horas_extras := 0;
    NEW.aprovacao_status := 'pendente';
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
    RETURN NEW;
  END IF;
  IF total_horas <= 0 OR total_horas > 16
     OR coalesce(NEW.horas_extras, 0) < 0
     OR coalesce(NEW.horas_extras, 0) > total_horas THEN
    RAISE EXCEPTION 'Jornada inválida: limite diário de 16 horas';
  END IF;
  IF ((NEW.hora_entrada IS NULL) <> (NEW.hora_saida IS NULL)) THEN
    RAISE EXCEPTION 'Entrada e saída devem ser informadas em conjunto';
  END IF;
  IF (coalesce(NEW.horas_extras, 0) > 0 OR NEW.hora_entrada IS NULL)
     AND length(justificativa) < 5 THEN
    RAISE EXCEPTION 'Justificativa obrigatória para horas extras ou jornada manual';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employee_ferias leave_record
    WHERE leave_record.employee_id = NEW.employee_id
      AND leave_record.aprovado = true
      AND leave_record.data_inicio <= NEW.data
      AND coalesce(leave_record.data_fim, NEW.data) >= NEW.data
  ) THEN
    RAISE EXCEPTION 'Funcionário indisponível conforme registro do RH';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sms_frentes WHERE obra_id = NEW.obra_id AND ativa)
     AND NOT EXISTS (
       SELECT 1 FROM public.sms_frentes
       WHERE obra_id = NEW.obra_id AND ativa AND lower(trim(nome)) = lower(trim(NEW.frente))
     ) THEN
    RAISE EXCEPTION 'Frente de serviço não pertence à obra';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cronograma_itens WHERE obra_id = NEW.obra_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.cronograma_itens
       WHERE obra_id = NEW.obra_id AND lower(trim(descricao)) = lower(trim(NEW.atividade))
     ) THEN
    RAISE EXCEPTION 'Atividade não pertence ao cronograma da obra';
  END IF;

  NEW.justificativa_ajuste := nullif(justificativa, '');
  IF coalesce(NEW.horas_extras, 0) > 0 OR NEW.hora_entrada IS NULL THEN
    NEW.aprovacao_status := 'pendente';
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.aprovacao_status := 'aprovado';
  ELSIF ROW(NEW.hora_entrada, NEW.hora_saida, NEW.horas_trabalhadas, NEW.horas_extras, NEW.frente, NEW.atividade)
       IS DISTINCT FROM
       ROW(OLD.hora_entrada, OLD.hora_saida, OLD.horas_trabalhadas, OLD.horas_extras, OLD.frente, OLD.atividade) THEN
    NEW.aprovacao_status := 'pendente';
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_apontamento_campo() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_validar_apontamento_campo ON public.efetivo_ponto;
CREATE TRIGGER trg_validar_apontamento_campo
  BEFORE INSERT OR UPDATE ON public.efetivo_ponto
  FOR EACH ROW EXECUTE FUNCTION public.validar_apontamento_campo();

COMMENT ON COLUMN public.efetivo_ponto.aprovacao_status IS
  'Exceções de jornada do apontador aguardam análise do gestor/RH.';

CREATE OR REPLACE FUNCTION public.decidir_apontamento_campo(
  p_apontamento_id uuid,
  p_aprovar boolean,
  p_justificativa text DEFAULT NULL
)
RETURNS public.efetivo_ponto
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  registro public.efetivo_ponto;
BEGIN
  SELECT * INTO registro FROM public.efetivo_ponto WHERE id = p_apontamento_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_obra_data(registro.obra_id) THEN
    RAISE EXCEPTION 'Sem permissão para decidir este apontamento';
  END IF;
  IF registro.aprovacao_status <> 'pendente' THEN
    RAISE EXCEPTION 'O apontamento não está pendente de aprovação';
  END IF;
  IF NOT p_aprovar AND length(trim(coalesce(p_justificativa, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe a justificativa da rejeição';
  END IF;
  UPDATE public.efetivo_ponto SET
    aprovacao_status = CASE WHEN p_aprovar THEN 'aprovado' ELSE 'rejeitado' END,
    aprovado_por = auth.uid(),
    aprovado_em = now(),
    observacao = CASE WHEN p_aprovar THEN observacao
      ELSE concat_ws(E'\n', observacao, 'Rejeição: ' || trim(p_justificativa)) END
  WHERE id = p_apontamento_id
  RETURNING * INTO registro;
  RETURN registro;
END;
$$;

REVOKE ALL ON FUNCTION public.decidir_apontamento_campo(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_apontamento_campo(uuid, boolean, text) TO authenticated;

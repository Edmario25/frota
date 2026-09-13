-- Regras de frequência: a ausência de marcação permanece pendente até decisão do RH.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS controla_jornada boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS motivo_dispensa_ponto text;

COMMENT ON COLUMN public.employees.controla_jornada IS
  'Define se o colaborador integra o controle de frequência. A dispensa deve ser formalizada pelo RH.';

ALTER TABLE public.efetivo_ponto
  ADD COLUMN IF NOT EXISTS tipo_ausencia text,
  ADD COLUMN IF NOT EXISTS documento_justificativa_url text,
  ADD COLUMN IF NOT EXISTS justificado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS justificado_em timestamptz;

ALTER TABLE public.efetivo_ponto DROP CONSTRAINT IF EXISTS efetivo_ponto_fonte_check;
ALTER TABLE public.efetivo_ponto
  ADD CONSTRAINT efetivo_ponto_fonte_check
  CHECK (fonte IN ('supervisor','campo','csv','totem','rh'));

CREATE OR REPLACE FUNCTION public.registrar_ausencia_rh(
  p_obra_id uuid,
  p_employee_id uuid,
  p_data date,
  p_tipo text,
  p_motivo text,
  p_documento_url text DEFAULT NULL
)
RETURNS public.efetivo_ponto
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  registro public.efetivo_ponto;
BEGIN
  IF NOT public.can_manage_obra_data(p_obra_id) THEN
    RAISE EXCEPTION 'Sem permissão para tratar a frequência desta obra';
  END IF;
  IF p_data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A ausência só pode ser tratada após o encerramento do dia';
  END IF;
  IF p_tipo NOT IN ('atestado_medico','licenca','abono','falta_justificada','falta_injustificada','outro') THEN
    RAISE EXCEPTION 'Tipo de justificativa inválido';
  END IF;
  IF length(trim(coalesce(p_motivo,''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo da ausência';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees WHERE id=p_employee_id AND controla_jornada=true
  ) THEN
    RAISE EXCEPTION 'Colaborador dispensado do controle de jornada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.obra_funcionarios
    WHERE obra_id=p_obra_id AND employee_id=p_employee_id AND data_entrada<=p_data
      AND (data_saida IS NULL OR data_saida>=p_data)
  ) THEN
    RAISE EXCEPTION 'Colaborador não possuía lotação ativa nesta data';
  END IF;

  INSERT INTO public.efetivo_ponto(
    obra_id, employee_id, data, ausencia, motivo_ausencia, tipo_ausencia,
    documento_justificativa_url, justificado_por, justificado_em, registrado_por,
    fonte, aprovacao_status
  ) VALUES (
    p_obra_id, p_employee_id, p_data, true, trim(p_motivo), p_tipo,
    nullif(trim(p_documento_url),''), auth.uid(), now(), auth.uid(), 'rh', 'aprovado'
  )
  ON CONFLICT (obra_id, employee_id, data) DO UPDATE SET
    ausencia=true,
    hora_entrada=NULL,
    hora_saida=NULL,
    horas_trabalhadas=0,
    horas_extras=0,
    motivo_ausencia=EXCLUDED.motivo_ausencia,
    tipo_ausencia=EXCLUDED.tipo_ausencia,
    documento_justificativa_url=EXCLUDED.documento_justificativa_url,
    justificado_por=auth.uid(),
    justificado_em=now(),
    registrado_por=auth.uid(),
    fonte='rh',
    aprovacao_status='aprovado'
  RETURNING * INTO registro;

  RETURN registro;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_ausencia_rh(uuid,uuid,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_ausencia_rh(uuid,uuid,date,text,text,text) TO authenticated;

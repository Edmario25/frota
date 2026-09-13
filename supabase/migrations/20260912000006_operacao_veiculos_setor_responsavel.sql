-- Operacao de frota: obra obrigatoria, veiculo compartilhado por setor e
-- historico de condutores/operadores. O cadastro do ativo permanece separado
-- da atribuicao operacional para nao perder a rastreabilidade em transferencias.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.departamento_setores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_uso text NOT NULL DEFAULT 'compartilhado'
    CHECK (tipo_uso IN ('compartilhado','dedicado')),
  ADD COLUMN IF NOT EXISTS operador_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.vehicle_operational_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE RESTRICT,
  setor_id uuid REFERENCES public.departamento_setores(id) ON DELETE SET NULL,
  papel text NOT NULL CHECK (papel IN ('responsavel','condutor','operador')),
  iniciou_em timestamptz NOT NULL DEFAULT now(),
  encerrou_em timestamptz,
  observacao text,
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (encerrou_em IS NULL OR encerrou_em >= iniciou_em)
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_operational_assignments_active_vehicle_role_uidx
  ON public.vehicle_operational_assignments(vehicle_id, papel) WHERE encerrou_em IS NULL;
CREATE INDEX IF NOT EXISTS vehicle_operational_assignments_employee_active_idx
  ON public.vehicle_operational_assignments(employee_id) WHERE encerrou_em IS NULL;

COMMENT ON TABLE public.vehicle_operational_assignments IS
  'Historico de responsaveis, condutores e operadores do veiculo por obra e setor.';

CREATE OR REPLACE FUNCTION public.configurar_operacao_veiculo(
  p_vehicle_id uuid,
  p_obra_id uuid,
  p_setor_id uuid DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL,
  p_tipo_uso text DEFAULT 'compartilhado',
  p_status text DEFAULT 'disponivel'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_papel text;
BEGIN
  SELECT tipo::text INTO v_tipo
  FROM public.vehicles
  WHERE id=p_vehicle_id AND baixado_em IS NULL;

  IF v_tipo IS NULL THEN RAISE EXCEPTION 'Veiculo inexistente ou baixado'; END IF;
  IF p_obra_id IS NULL THEN RAISE EXCEPTION 'A obra e obrigatoria para o veiculo'; END IF;
  IF p_tipo_uso NOT IN ('compartilhado','dedicado') THEN RAISE EXCEPTION 'Tipo de uso invalido'; END IF;
  IF p_tipo_uso='compartilhado' AND p_setor_id IS NULL THEN
    RAISE EXCEPTION 'Veiculo compartilhado deve estar vinculado a um setor';
  END IF;
  IF p_status='em_uso' AND p_responsavel_id IS NULL THEN
    RAISE EXCEPTION 'Informe o condutor ou operador antes de liberar o veiculo para uso';
  END IF;
  IF p_tipo_uso='dedicado' AND p_responsavel_id IS NULL THEN
    RAISE EXCEPTION 'Veiculo dedicado deve possuir um responsavel';
  END IF;
  IF p_setor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.departamento_setores WHERE id=p_setor_id AND ativo) THEN
    RAISE EXCEPTION 'Setor inexistente ou inativo';
  END IF;

  PERFORM public.vincular_veiculo_obra(p_vehicle_id,p_obra_id,'compartilhado');
  v_papel := CASE WHEN v_tipo='pesado' THEN 'operador' ELSE 'responsavel' END;

  UPDATE public.vehicle_operational_assignments
  SET encerrou_em=now()
  WHERE vehicle_id=p_vehicle_id AND papel=v_papel AND encerrou_em IS NULL
    AND (employee_id IS DISTINCT FROM p_responsavel_id OR obra_id IS DISTINCT FROM p_obra_id OR setor_id IS DISTINCT FROM p_setor_id);

  IF p_responsavel_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.vehicle_operational_assignments
    WHERE vehicle_id=p_vehicle_id AND employee_id=p_responsavel_id AND papel=v_papel AND encerrou_em IS NULL
  ) THEN
    INSERT INTO public.vehicle_operational_assignments(vehicle_id,employee_id,obra_id,setor_id,papel,registrado_por)
    VALUES(p_vehicle_id,p_responsavel_id,p_obra_id,p_setor_id,v_papel,auth.uid());
  END IF;

  UPDATE public.vehicles
  SET setor_id=p_setor_id,
      tipo_uso=p_tipo_uso,
      responsavel_id=CASE WHEN v_tipo='leve' THEN p_responsavel_id ELSE NULL END,
      operador_id=CASE WHEN v_tipo='pesado' THEN p_responsavel_id ELSE NULL END,
      updated_at=now()
  WHERE id=p_vehicle_id;
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_operacao_veiculo(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configurar_operacao_veiculo(uuid,uuid,uuid,uuid,text,text) TO authenticated;

ALTER TABLE public.vehicle_operational_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_operational_assignments_read ON public.vehicle_operational_assignments;
DROP POLICY IF EXISTS vehicle_operational_assignments_write ON public.vehicle_operational_assignments;
CREATE POLICY vehicle_operational_assignments_read ON public.vehicle_operational_assignments
  FOR SELECT TO authenticated USING (public.pode('frota.visualizar',obra_id));
CREATE POLICY vehicle_operational_assignments_write ON public.vehicle_operational_assignments
  FOR ALL TO authenticated USING (public.pode('frota.editar',obra_id)) WITH CHECK (public.pode('frota.editar',obra_id));

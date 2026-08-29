-- Nucleo profissional de frota: baixa auditavel, alocacao unica e operacoes atomicas.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS baixado_em timestamptz,
  ADD COLUMN IF NOT EXISTS baixado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_baixa text;

COMMENT ON COLUMN public.vehicles.baixado_em IS
  'Baixa logica do ativo. Veiculos com esta data permanecem no historico e nao devem operar.';

-- Corrige eventuais vinculos ativos duplicados antes de aplicar a regra definitiva.
WITH duplicados AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY vehicle_id
           ORDER BY data_entrada DESC, created_at DESC, id DESC
         ) AS ordem
  FROM public.obra_veiculos
  WHERE status = true
)
UPDATE public.obra_veiculos ov
SET status = false,
    data_saida = COALESCE(ov.data_saida, CURRENT_DATE),
    updated_at = now()
FROM duplicados d
WHERE ov.id = d.id AND d.ordem > 1;

CREATE UNIQUE INDEX IF NOT EXISTS obra_veiculos_um_vinculo_ativo_uidx
  ON public.obra_veiculos (vehicle_id)
  WHERE status = true;

CREATE OR REPLACE FUNCTION public.vincular_veiculo_obra(
  p_vehicle_id uuid,
  p_obra_id uuid DEFAULT NULL,
  p_tipo_vinculo public.vinculo_veiculo_tipo DEFAULT 'compartilhado'
)
RETURNS public.obra_veiculos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result public.obra_veiculos;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = p_vehicle_id AND baixado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Veiculo inexistente ou baixado';
  END IF;

  UPDATE public.obra_veiculos
  SET status = false,
      data_saida = COALESCE(data_saida, CURRENT_DATE),
      updated_at = now()
  WHERE vehicle_id = p_vehicle_id
    AND status = true
    AND (p_obra_id IS NULL OR obra_id IS DISTINCT FROM p_obra_id);

  IF p_obra_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_result
  FROM public.obra_veiculos
  WHERE vehicle_id = p_vehicle_id AND obra_id = p_obra_id AND status = true
  LIMIT 1;

  IF v_result.id IS NULL THEN
    INSERT INTO public.obra_veiculos (
      obra_id, vehicle_id, tipo_vinculo, data_entrada, data_saida, status
    ) VALUES (
      p_obra_id, p_vehicle_id, p_tipo_vinculo, CURRENT_DATE, NULL, true
    ) RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.baixar_veiculo(
  p_vehicle_id uuid,
  p_motivo text DEFAULT 'Baixa administrativa'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF length(trim(COALESCE(p_motivo, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe um motivo de baixa valido';
  END IF;

  UPDATE public.vehicles
  SET status = 'inativo',
      baixado_em = now(),
      baixado_por = auth.uid(),
      motivo_baixa = trim(p_motivo),
      responsavel_id = NULL,
      updated_at = now()
  WHERE id = p_vehicle_id AND baixado_em IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veiculo inexistente ou ja baixado';
  END IF;

  UPDATE public.obra_veiculos
  SET status = false,
      data_saida = COALESCE(data_saida, CURRENT_DATE),
      updated_at = now()
  WHERE vehicle_id = p_vehicle_id AND status = true;
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_veiculo_obra(uuid, uuid, public.vinculo_veiculo_tipo) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baixar_veiculo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vincular_veiculo_obra(uuid, uuid, public.vinculo_veiculo_tipo) TO authenticated;
GRANT EXECUTE ON FUNCTION public.baixar_veiculo(uuid, text) TO authenticated;


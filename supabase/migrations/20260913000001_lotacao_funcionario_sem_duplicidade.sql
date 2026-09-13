-- Uma unica rotina controla a lotacao principal. Evita que uma edicao comum
-- do cadastro abra/feche repetidamente a mesma obra no historico.

CREATE OR REPLACE FUNCTION public.sincronizar_lotacao_principal(
  p_employee_id uuid,
  p_obra_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id=p_employee_id) THEN
    RAISE EXCEPTION 'Colaborador inexistente';
  END IF;

  -- Não movimenta o histórico quando a lotação já é a mesma.
  IF p_obra_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.obra_funcionarios
    WHERE employee_id=p_employee_id AND obra_id=p_obra_id AND status=true
  ) THEN
    RETURN;
  END IF;

  -- Encerramento fica datado para que o histórico seja compreensível.
  UPDATE public.obra_funcionarios
  SET status=false,
      data_saida=COALESCE(data_saida,current_date)
  WHERE employee_id=p_employee_id AND status=true;

  IF p_obra_id IS NOT NULL THEN
    INSERT INTO public.obra_funcionarios(
      obra_id,employee_id,funcao_obra,data_entrada,status
    ) VALUES(
      p_obra_id,p_employee_id,'Colaborador',current_date,true
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_lotacao_principal(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sincronizar_lotacao_principal(uuid,uuid) TO authenticated;

-- Elimina apenas réplicas inativas idênticas geradas por edições repetidas.
WITH repetidos AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY employee_id, obra_id, data_entrada, COALESCE(funcao_obra,'')
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS ordem
  FROM public.obra_funcionarios
  WHERE status=false
)
DELETE FROM public.obra_funcionarios of1
USING repetidos r
WHERE of1.id=r.id AND r.ordem>1;

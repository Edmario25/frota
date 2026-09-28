-- Hotfix para ambientes em que a RPC de lotacao nao entrou no schema cache.
-- Nao remove registros antigos: apenas encerra vinculos ativos quando a obra muda.
CREATE OR REPLACE FUNCTION public.sincronizar_lotacao_principal(
  p_employee_id uuid,
  p_obra_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
  v_vinculo_atual uuid;
BEGIN
  IF NOT public.can_manage_employee_record(p_employee_id) THEN
    RAISE EXCEPTION 'Sem permissao para alterar a lotacao deste colaborador';
  END IF;

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE id = p_employee_id
  FOR UPDATE;
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador inexistente';
  END IF;

  IF p_obra_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id) THEN
      RAISE EXCEPTION 'Obra inexistente';
    END IF;
    IF NOT public.can_manage_obra_data(p_obra_id) THEN
      RAISE EXCEPTION 'Sem permissao para lotar colaboradores nesta obra';
    END IF;

    SELECT id INTO v_vinculo_atual
    FROM public.obra_funcionarios
    WHERE employee_id = p_employee_id AND obra_id = p_obra_id AND status = true
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
  END IF;

  UPDATE public.obra_funcionarios
  SET status = false,
      data_saida = COALESCE(data_saida, GREATEST(data_entrada, CURRENT_DATE))
  WHERE employee_id = p_employee_id AND status = true
    AND (v_vinculo_atual IS NULL OR id <> v_vinculo_atual);

  IF p_obra_id IS NOT NULL AND v_vinculo_atual IS NULL THEN
    INSERT INTO public.obra_funcionarios
      (obra_id, employee_id, funcao_obra, data_entrada, status)
    VALUES
      (p_obra_id, p_employee_id, 'Colaborador', CURRENT_DATE, true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_lotacao_principal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_lotacao_principal(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

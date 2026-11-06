-- ============================================================================
-- Vincular um usuário a um funcionário pela tela de Controle de Acesso
--
-- O UPDATE direto em employees é barrado pela RLS: a política de alteração da
-- tabela autoriza apenas gestor de obra da mesma obra. Quem administra o
-- controle de acesso — justamente quem faz esse vínculo — não passa por ela.
-- E como UPDATE bloqueado por RLS não devolve erro, a tela dizia "Funcionário
-- vinculado" sem ter gravado nada.
--
-- A saída NÃO é afrouxar o UPDATE de employees: essa tabela tem salário,
-- documentos e dados pessoais. Uma função dedicada faz só o que precisa ser
-- feito, verifica a permissão explicitamente e deixa rastro.
--
-- Idempotente. Rodar inteiro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vincular_usuario_funcionario(
  p_user_id     uuid,
  p_employee_id uuid DEFAULT NULL   -- NULL desfaz o vínculo
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_desvinculados integer := 0;
  v_vinculados    integer := 0;
  v_dono_anterior uuid;
  v_nome          text;
BEGIN
  IF NOT (public.access_is_admin() OR public.pode_geral('colaboradores.editar')) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sem permissão para vincular usuários a funcionários.'
    );
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não informado.');
  END IF;

  -- Um usuário responde por um funcionário só: solta o anterior antes.
  UPDATE public.employees
  SET    user_id = NULL
  WHERE  user_id = p_user_id
    AND  (p_employee_id IS NULL OR id <> p_employee_id);
  GET DIAGNOSTICS v_desvinculados = ROW_COUNT;

  IF p_employee_id IS NOT NULL THEN
    SELECT e.user_id, e.nome INTO v_dono_anterior, v_nome
    FROM public.employees e WHERE e.id = p_employee_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Funcionário não encontrado.');
    END IF;

    -- Roubar o funcionário de outra conta é quase sempre engano de quem
    -- preenche, e o efeito é dar a uma pessoa o acesso de outra.
    IF v_dono_anterior IS NOT NULL AND v_dono_anterior <> p_user_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('%s já está vinculado a outra conta de usuário. Desfaça o vínculo lá antes.', v_nome)
      );
    END IF;

    UPDATE public.employees
    SET    user_id = p_user_id
    WHERE  id = p_employee_id;
    GET DIAGNOSTICS v_vinculados = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vinculados', v_vinculados,
    'desvinculados', v_desvinculados
  );
END;
$$;

COMMENT ON FUNCTION public.vincular_usuario_funcionario(uuid, uuid) IS
  'Liga uma conta de usuário ao cadastro de funcionário, pela tela de Controle de Acesso. Exige administrar acessos ou colaboradores.editar. Existe para não precisar afrouxar o UPDATE de employees, que guarda dados pessoais.';

REVOKE ALL ON FUNCTION public.vincular_usuario_funcionario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_usuario_funcionario(uuid, uuid) TO authenticated;

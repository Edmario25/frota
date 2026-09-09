-- Permite configurar/reconfigurar um Raspberry sem expor credenciais armazenadas.
-- A credencial anterior deixa de funcionar imediatamente após a rotação.
CREATE OR REPLACE FUNCTION public.sms_rotacionar_token_checkpoint(p_checkpoint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra_id uuid;
  v_token text := encode(gen_random_bytes(32), 'hex');
BEGIN
  SELECT obra_id INTO v_obra_id
  FROM public.sms_checkpoints
  WHERE id = p_checkpoint_id;

  IF v_obra_id IS NULL THEN
    RAISE EXCEPTION 'Checkpoint não encontrado';
  END IF;
  IF NOT public.sms_velocidade_pode_gerir(v_obra_id) THEN
    RAISE EXCEPTION 'Sem permissão para configurar este checkpoint';
  END IF;

  UPDATE public.sms_checkpoints
  SET device_token = NULL,
      device_token_hash = encode(digest(v_token, 'sha256'), 'hex'),
      device_token_hint = right(v_token, 6),
      device_ultimo_contato = NULL,
      updated_at = now()
  WHERE id = p_checkpoint_id;

  RETURN jsonb_build_object(
    'checkpoint_id', p_checkpoint_id,
    'device_token', v_token,
    'gerado_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sms_rotacionar_token_checkpoint(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_rotacionar_token_checkpoint(uuid) TO authenticated;

COMMENT ON FUNCTION public.sms_rotacionar_token_checkpoint(uuid) IS
  'Gera uma credencial nova, invalida a anterior e devolve o segredo uma única vez ao gestor autorizado.';

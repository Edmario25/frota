-- ─── Ciclo de notificação da infração de velocidade ─────────────────────────
--
-- Antes: "Marcar notificada" apenas mudava o status. Ninguém era avisado e
-- não havia prova de que o motorista soube da infração.
--
-- Agora o ciclo é: gestor notifica -> motorista vê no app -> dá ciência.
-- A data da ciência é o que sustenta a tratativa numa auditoria.

ALTER TABLE public.sms_infracoes_velocidade
  ADD COLUMN IF NOT EXISTS notificada_em  timestamptz,
  ADD COLUMN IF NOT EXISTS notificada_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS ciente_em      timestamptz;

CREATE INDEX IF NOT EXISTS idx_sms_infracoes_motorista
  ON public.sms_infracoes_velocidade(motorista_id)
  WHERE motorista_id IS NOT NULL;

-- ─── RLS: o motorista enxerga as próprias infrações ─────────────────────────
-- A policy de SELECT existente cobre gestores e quem tem acesso à obra.
-- Esta acrescenta o caso do próprio motorista, para o app funcionar mesmo
-- quando o funcionário não está vinculado à obra.

DROP POLICY IF EXISTS "sms_infracoes_select_propria" ON public.sms_infracoes_velocidade;
CREATE POLICY "sms_infracoes_select_propria"
  ON public.sms_infracoes_velocidade
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- ─── RPC: gestor registra que notificou ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sms_notificar_infracao(p_infracao_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agora timestamptz := now();
BEGIN
  UPDATE public.sms_infracoes_velocidade
  SET    status         = 'notificada',
         notificada_em  = COALESCE(notificada_em, v_agora),
         notificada_por = auth.uid(),
         updated_at     = v_agora
  WHERE  id = p_infracao_id
    AND  status NOT IN ('encerrada', 'cancelada');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Infração não encontrada ou já encerrada';
  END IF;

  RETURN v_agora;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sms_notificar_infracao(uuid) TO authenticated;

-- ─── RPC: motorista dá ciência ──────────────────────────────────────────────
-- SECURITY DEFINER com verificação explícita de identidade: só o motorista
-- da própria infração consegue registrar ciência. Não usa o id vindo do
-- cliente para decidir quem é — resolve pelo auth.uid().

CREATE OR REPLACE FUNCTION public.sms_dar_ciencia_infracao(p_infracao_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_agora       timestamptz := now();
BEGIN
  SELECT id INTO v_employee_id
  FROM   public.employees
  WHERE  user_id = auth.uid()
  LIMIT  1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não está vinculado a um colaborador';
  END IF;

  UPDATE public.sms_infracoes_velocidade
  SET    ciente_em  = COALESCE(ciente_em, v_agora),
         updated_at = v_agora
  WHERE  id           = p_infracao_id
    AND  motorista_id = v_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Infração não encontrada ou não pertence a você';
  END IF;

  RETURN v_agora;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sms_dar_ciencia_infracao(uuid) TO authenticated;

-- ─── UPDATE do motorista fica bloqueado ─────────────────────────────────────
-- A ciência só entra pela RPC acima. Sem policy de UPDATE para o motorista,
-- ele não consegue alterar gravidade, status ou qualquer outro campo.

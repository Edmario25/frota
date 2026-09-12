-- Centraliza a autorização dos aplicativos no módulo Controle de Acesso.
-- As colunas legadas permanecem para compatibilidade com os apps já publicados,
-- mas passam a ser alteradas por uma única operação autorizada e auditável.

CREATE OR REPLACE FUNCTION public.gerenciar_acesso_aplicativo(
  p_employee_id uuid,
  p_app text,
  p_permitir boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.access_is_admin() THEN
    RAISE EXCEPTION 'Sem permissão para administrar acessos';
  END IF;

  IF p_app NOT IN ('motorista', 'sms', 'campo', 'almoxarifado') THEN
    RAISE EXCEPTION 'Aplicativo inválido';
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.employees
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;
  IF v_user_id IS NULL AND p_permitir THEN
    RAISE EXCEPTION 'Crie ou vincule uma conta de usuário antes de liberar o aplicativo';
  END IF;

  PERFORM set_config('app.access_control_apps', 'allowed', true);
  UPDATE public.employees
  SET acesso_app_motorista = CASE WHEN p_app='motorista' THEN p_permitir ELSE acesso_app_motorista END,
      acesso_app_sms = CASE WHEN p_app='sms' THEN p_permitir ELSE acesso_app_sms END,
      acesso_app_campo = CASE WHEN p_app='campo' THEN p_permitir ELSE acesso_app_campo END,
      acesso_app_almoxarifado = CASE WHEN p_app='almoxarifado' THEN p_permitir ELSE acesso_app_almoxarifado END,
      updated_at = now()
  WHERE id = p_employee_id;

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', p_employee_id,
    'app', p_app,
    'permitido', p_permitir
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gerenciar_acesso_aplicativo(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_acesso_aplicativo(uuid,text,boolean) TO authenticated;

COMMENT ON FUNCTION public.gerenciar_acesso_aplicativo(uuid,text,boolean) IS
  'Autoriza ou bloqueia um app operacional pelo Controle de Acesso. A alteração em employees é capturada pela auditoria central.';

COMMENT ON COLUMN public.employees.acesso_app_motorista IS 'Compatibilidade: gerenciado exclusivamente no módulo Controle de Acesso.';
COMMENT ON COLUMN public.employees.acesso_app_sms IS 'Compatibilidade: gerenciado exclusivamente no módulo Controle de Acesso.';
COMMENT ON COLUMN public.employees.acesso_app_campo IS 'Compatibilidade: gerenciado exclusivamente no módulo Controle de Acesso.';
COMMENT ON COLUMN public.employees.acesso_app_almoxarifado IS 'Compatibilidade: gerenciado exclusivamente no módulo Controle de Acesso.';

CREATE OR REPLACE FUNCTION public.bloquear_acesso_app_fora_controle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.acesso_app_motorista := false;
    NEW.acesso_app_sms := false;
    NEW.acesso_app_campo := false;
    NEW.acesso_app_almoxarifado := false;
  ELSIF current_setting('app.access_control_apps', true) IS DISTINCT FROM 'allowed' THEN
    NEW.acesso_app_motorista := OLD.acesso_app_motorista;
    NEW.acesso_app_sms := OLD.acesso_app_sms;
    NEW.acesso_app_campo := OLD.acesso_app_campo;
    NEW.acesso_app_almoxarifado := OLD.acesso_app_almoxarifado;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_acesso_app_fora_controle ON public.employees;
CREATE TRIGGER trg_bloquear_acesso_app_fora_controle
BEFORE INSERT OR UPDATE OF acesso_app_motorista, acesso_app_sms, acesso_app_campo, acesso_app_almoxarifado
ON public.employees FOR EACH ROW EXECUTE FUNCTION public.bloquear_acesso_app_fora_controle();

REVOKE ALL ON FUNCTION public.bloquear_acesso_app_fora_controle() FROM PUBLIC, anon, authenticated;

-- Cargo e departamento são somente estrutura organizacional. Alterá-los não
-- concede mais perfis silenciosamente. A função é mantida como no-op para que
-- versões antigas do front-end não quebrem durante a transição.
CREATE OR REPLACE FUNCTION public.sync_employee_access_role(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.can_manage_employee_record(p_employee_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este colaborador';
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'updated', false,
    'message', 'Cargo e departamento não concedem acesso. Use o módulo Controle de Acesso.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_access_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_employee_access_role(uuid) TO authenticated;

-- Encerra apenas concessões antigas identificadas como automáticas. Perfis
-- atribuídos manualmente e o acesso aos próprios registros são preservados.
UPDATE public.employee_access_profiles
SET revogado_em = COALESCE(revogado_em, now())
WHERE revogado_em IS NULL
  AND justificativa IN (
    'Automático: cargo de gestor de contrato',
    'Automático: vínculo com a obra',
    'Migração automática: obra vinculada ao funcionário'
  );

-- O vínculo com obra continua sendo cadastral, mas não amplia mais o acesso.
DROP TRIGGER IF EXISTS trg_access_vinculo_obra ON public.employee_obra_assignments;

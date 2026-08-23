-- Endurecimento sem mudança intencional de acesso funcional:
-- 1. fixa search_path de funções SECURITY DEFINER;
-- 2. troca políticas destinadas a usuários logados de PUBLIC para authenticated.

DO $migration$
DECLARE
  function_record record;
  functions_to_harden text[] := ARRAY[
    'auto_renew_km_cycles',
    'chat_on_mensagem_insert',
    'chat_set_obra_id',
    'create_monthly_km_cycles',
    'create_vehicle_km_cycle',
    'get_user_obra_ids',
    'get_user_permissions',
    'sync_app_motorista_to_auth',
    'trg_fn_sync_cycle_km_from_odometer',
    'trg_fn_vehicle_create_first_cycle'
  ];
BEGIN
  FOR function_record IN
    SELECT p.oid::regprocedure AS function_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY(functions_to_harden)
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, auth, pg_temp',
      function_record.function_signature
    );
  END LOOP;
END
$migration$;

-- Estas expressões já exigiam auth.uid()/role authenticated. Restringir o
-- papel declarado remove a exposição nominal a PUBLIC sem mudar quem passa.
ALTER POLICY obra_func_admin_all
  ON public.obra_funcionarios TO authenticated;
ALTER POLICY obra_func_gestor_obra_all
  ON public.obra_funcionarios TO authenticated;
ALTER POLICY obra_func_funcionario_select
  ON public.obra_funcionarios TO authenticated;

ALTER POLICY obra_veic_admin_all
  ON public.obra_veiculos TO authenticated;
ALTER POLICY obra_veic_gestor_obra_all
  ON public.obra_veiculos TO authenticated;
ALTER POLICY obra_veic_funcionario_select
  ON public.obra_veiculos TO authenticated;

ALTER POLICY obras_gestor_contrato_all
  ON public.obras TO authenticated;
ALTER POLICY obras_gestor_frota_all
  ON public.obras TO authenticated;
ALTER POLICY obras_gestor_obra_select
  ON public.obras TO authenticated;
ALTER POLICY obras_gestor_obra_update
  ON public.obras TO authenticated;

ALTER POLICY epi_mov_auth
  ON public.sms_epis_movimentacoes TO authenticated;
ALTER POLICY gestores_can_manage_km_cycles
  ON public.vehicle_km_cycles TO authenticated;

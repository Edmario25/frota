-- Remove o EXECUTE herdado por PUBLIC/anon das funções da aplicação.
-- Mantém explicitamente o acesso de authenticated para preservar o
-- comportamento atual; o endurecimento por cargo será feito por função.
-- Funções da extensão pgvector não são alteradas.

DO $migration$
DECLARE
  function_record record;
  application_functions text[] := ARRAY[
    'auto_renew_km_cycles',
    'can_manage_employee',
    'chat_on_mensagem_insert',
    'chat_set_obra_id',
    'check_user_app_access',
    'close_expired_km_cycles',
    'create_auth_user',
    'create_monthly_km_cycles',
    'create_vehicle_km_cycle',
    'fn_auto_cracha',
    'fn_auto_numero_bm',
    'fn_auto_numero_nc',
    'fn_oc_update_total',
    'fn_set_updated_at',
    'fn_update_estoque_on_movimento',
    'get_current_km_cycle',
    'get_my_obra',
    'get_my_obra_ids',
    'get_user_employee_id',
    'get_user_obra_id',
    'get_user_obra_ids',
    'get_user_permissions',
    'get_user_role',
    'handle_new_user',
    'handle_updated_at',
    'is_employee_in_same_obra',
    'is_funcionario',
    'is_gestor_contrato',
    'is_gestor_obra',
    'is_maintenance_for_obra_vehicle',
    'is_tecnico_sms',
    'is_vehicle_in_same_obra',
    'recalcular_saldo_fundo',
    'set_efetivo_updated_at',
    'set_updated_at',
    'sms_agregar_resumo_rdo',
    'sms_check_doc_status',
    'sms_check_treinamento_status',
    'sms_validar_envolvido_apr',
    'sync_app_motorista_to_auth',
    'trg_fn_sync_cycle_km_from_odometer',
    'trg_fn_vehicle_create_first_cycle',
    'update_updated_at_column',
    'update_user_password',
    'update_vehicle_km_cycle'
  ];
BEGIN
  FOR function_record IN
    SELECT p.oid::regprocedure AS function_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(application_functions)
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      function_record.function_signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO authenticated',
      function_record.function_signature
    );
  END LOOP;
END
$migration$;

-- Impede que funções públicas criadas no futuro herdem EXECUTE para todos.
-- Deve ser aplicado pelo proprietário que normalmente cria as migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Garante que registrar_entrega_almoxarifado encontre digest(), mesmo quando
-- o Supabase instala pgcrypto no schema "extensions" em vez de "public".
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_extension_schema text;
BEGIN
  SELECT namespace.nspname
    INTO v_extension_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgcrypto';

  IF v_extension_schema IS NULL THEN
    RAISE EXCEPTION 'A extensao pgcrypto nao esta instalada.';
  END IF;

  EXECUTE format(
    'ALTER FUNCTION public.registrar_entrega_almoxarifado(uuid,text,text,text,text,text,jsonb) SET search_path = public, auth, %I, pg_temp',
    v_extension_schema
  );
END;
$$;

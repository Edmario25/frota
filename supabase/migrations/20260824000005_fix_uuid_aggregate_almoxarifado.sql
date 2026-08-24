-- Corrige funcoes ja instaladas que tentavam aplicar min() diretamente em UUID.
-- PostgreSQL nao possui min(uuid); a conversao para text preserva a selecao
-- deterministica e o resultado e convertido novamente para uuid.
DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_corrected text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.registrar_entrega_almoxarifado(uuid,text,text,text,text,text,jsonb)'::regprocedure,
    'public.listar_funcionarios_app_almoxarifado()'::regprocedure,
    'public.registrar_devolucao_almoxarifado(uuid,text,text,jsonb)'::regprocedure
  ]
  LOOP
    SELECT pg_get_functiondef(v_function) INTO v_definition;
    v_corrected := replace(
      v_definition,
      'min(ofu.obra_id)',
      'min(ofu.obra_id::text)::uuid'
    );

    IF v_corrected = v_definition THEN
      RAISE EXCEPTION 'A funcao % nao contem a expressao UUID esperada.', v_function;
    END IF;

    EXECUTE v_corrected;
  END LOOP;
END;
$$;

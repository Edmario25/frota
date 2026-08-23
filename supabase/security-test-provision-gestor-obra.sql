-- Provisiona SOMENTE a conta sintética usada no teste de isolamento.
-- Execute no Supabase SQL Editor e depois rode security-test-discovery.sql novamente.

BEGIN;

DO $$
DECLARE
  v_user_id     uuid := '4e057afc-a720-4f9d-86ea-4d0d439da0db';
  v_email       text := 'gestor.obra.a@example.invalid';
  v_obra_id     uuid := '30ae78ee-f401-4dd9-ae6e-d8657f7bf3f6';
  v_employee_id uuid;
  v_cargo_id    uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = v_user_id AND lower(email) = lower(v_email)
  ) THEN
    RAISE EXCEPTION 'Conta sintética não encontrada ou e-mail/UUID divergentes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.obras
    WHERE id = v_obra_id AND nome = 'CAMPO LARGO3'
  ) THEN
    RAISE EXCEPTION 'Obra A não encontrada ou UUID/nome divergentes';
  END IF;

  SELECT id INTO v_cargo_id
  FROM public.cargos
  WHERE nivel_acesso = 'gestor_obra'
  ORDER BY created_at
  LIMIT 1;

  IF v_cargo_id IS NULL THEN
    RAISE EXCEPTION 'Cadastre um cargo com nivel_acesso gestor_obra antes de continuar';
  END IF;

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    INSERT INTO public.employees (
      user_id,
      nome,
      cpf,
      email,
      cargo_id,
      tipo_acesso,
      status
    ) VALUES (
      v_user_id,
      'Teste Gestor Obra A',
      'TEST-' || substr(replace(v_user_id::text, '-', ''), 1, 16),
      v_email,
      v_cargo_id,
      'gestor_obra',
      'ativo'
    )
    RETURNING id INTO v_employee_id;
  ELSE
    UPDATE public.employees
    SET cargo_id = v_cargo_id,
        tipo_acesso = 'gestor_obra',
        status = 'ativo',
        updated_at = now()
    WHERE id = v_employee_id;
  END IF;

  -- A conta é exclusivamente sintética: mantém apenas o perfil sob teste.
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'gestor_obra');

  -- Garante que o gestor esteja limitado a uma única obra.
  DELETE FROM public.employee_obra_assignments
  WHERE employee_id = v_employee_id;

  INSERT INTO public.employee_obra_assignments (
    employee_id,
    obra_id,
    created_by
  ) VALUES (
    v_employee_id,
    v_obra_id,
    v_user_id
  );
END
$$;

COMMIT;

SELECT jsonb_build_object(
  'email', user_record.email,
  'user_id', user_record.id,
  'employee_id', employee.id,
  'role', role.role,
  'obra_id', assignment.obra_id,
  'obra_nome', obra.nome,
  'ready',
    role.role = 'gestor_obra'
    AND assignment.obra_id = '30ae78ee-f401-4dd9-ae6e-d8657f7bf3f6'::uuid
) AS security_test_provisioned
FROM auth.users AS user_record
JOIN public.employees AS employee ON employee.user_id = user_record.id
JOIN public.user_roles AS role ON role.user_id = user_record.id
JOIN public.employee_obra_assignments AS assignment
  ON assignment.employee_id = employee.id
JOIN public.obras AS obra ON obra.id = assignment.obra_id
WHERE user_record.id = '4e057afc-a720-4f9d-86ea-4d0d439da0db'::uuid;

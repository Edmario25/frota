-- Preparação somente de leitura para o teste de isolamento entre obras.
-- 1. Crie uma conta exclusivamente de teste pela tela de usuários do sistema.
-- 2. Troque o e-mail abaixo pelo e-mail dessa conta.
-- 3. Execute no Supabase SQL Editor e envie o JSON retornado (não envie a senha).

WITH params AS (
  SELECT 'gestor.obra.a@example.invalid'::text AS test_email
),
test_user AS (
  SELECT user_record.id, user_record.email
  FROM auth.users AS user_record
  JOIN params ON lower(user_record.email) = lower(params.test_email)
  LIMIT 1
),
test_employee AS (
  SELECT employee.id, employee.user_id, employee.nome, employee.cargo_id
  FROM public.employees AS employee
  JOIN test_user ON test_user.id = employee.user_id
  LIMIT 1
),
test_role AS (
  SELECT role.role::text AS role
  FROM public.user_roles AS role
  JOIN test_user ON test_user.id = role.user_id
  ORDER BY role.created_at DESC
  LIMIT 1
),
linked_obras AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', obra.id, 'nome', obra.nome)
      ORDER BY obra.nome
    ),
    '[]'::jsonb
  ) AS items
  FROM public.employee_obra_assignments AS assignment
  JOIN test_employee ON test_employee.id = assignment.employee_id
  JOIN public.obras AS obra ON obra.id = assignment.obra_id
),
candidate_obras AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', candidate.id, 'nome', candidate.nome)
      ORDER BY candidate.nome
    ),
    '[]'::jsonb
  ) AS items
  FROM (
    SELECT obra.id, obra.nome
    FROM public.obras AS obra
    ORDER BY obra.nome
    LIMIT 2
  ) AS candidate
)
SELECT jsonb_build_object(
  'ready',
    test_user.id IS NOT NULL
    AND test_employee.id IS NOT NULL
    AND test_role.role = 'gestor_obra'
    AND jsonb_array_length(linked_obras.items) = 1,
  'email', test_user.email,
  'user_id', test_user.id,
  'employee_id', test_employee.id,
  'role', test_role.role,
  'linked_obras', linked_obras.items,
  'candidate_obras', candidate_obras.items,
  'expected', jsonb_build_object(
    'role', 'gestor_obra',
    'linked_obras_count', 1
  )
) AS security_test_setup
FROM params
LEFT JOIN test_user ON true
LEFT JOIN test_employee ON true
LEFT JOIN test_role ON true
CROSS JOIN linked_obras
CROSS JOIN candidate_obras;

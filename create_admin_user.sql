-- Criar usuário admin: edimario.ribeiro@conexx.net.br
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- Remover se já existir (para poder rodar novamente)
  DELETE FROM public.user_roles WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'edimario.ribeiro@conexx.net.br'
  );
  DELETE FROM public.profiles WHERE email = 'edimario.ribeiro@conexx.net.br';
  DELETE FROM auth.users WHERE email = 'edimario.ribeiro@conexx.net.br';

  -- Criar usuário no auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'edimario.ribeiro@conexx.net.br',
    crypt('*Windows38', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Edimário Ribeiro"}',
    'authenticated',
    'authenticated',
    '', '', '', ''
  );

  -- Criar perfil
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (new_user_id, 'Edimário Ribeiro', 'edimario.ribeiro@conexx.net.br')
  ON CONFLICT (user_id) DO NOTHING;

  -- Atribuir role admin
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Usuário criado com sucesso. ID: %', new_user_id;
END $$;

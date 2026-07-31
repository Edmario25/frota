-- Garantir que os funcionários tenham o role correto

-- Primeiro, verificar se arthur@conexx.net.br tem um role atribuído
-- Se não tiver, atribuir o role de funcionario

-- Inserir role de funcionario para arthur se não existir
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id,
  'funcionario'::app_role
FROM auth.users au 
WHERE au.email = 'arthur@conexx.net.br'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = au.id
  );

-- Inserir role de funcionario para edimario se não existir  
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id,
  'funcionario'::app_role
FROM auth.users au 
WHERE au.email = 'edimario.ribeiro@conexx.net.br'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = au.id
  );

-- Garantir que admin@teste.com tenha role de admin
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id,
  'admin'::app_role
FROM auth.users au 
WHERE au.email = 'admin@teste.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = au.id
  );

-- Remover qualquer role incorreto para os funcionários (caso tenham admin)
DELETE FROM public.user_roles 
WHERE user_id IN (
  SELECT au.id FROM auth.users au 
  WHERE au.email IN ('arthur@conexx.net.br', 'edimario.ribeiro@conexx.net.br')
) AND role != 'funcionario';
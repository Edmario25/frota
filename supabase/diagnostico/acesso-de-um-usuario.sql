-- ============================================================================
-- Por que este usuário não enxerga o módulo?
--
-- Rode inteiro no SQL editor. Não altera nada: só lê e explica.
-- Troque o e-mail abaixo pelo da pessoa em questão.
-- ============================================================================

WITH alvo AS (
  SELECT id AS user_id, email
  FROM auth.users
  WHERE email = 'breno@teste.com'      -- <<< troque aqui
)

-- 1. Perfis atribuídos (é isto que get_user_role e pode_geral enxergam)
SELECT
  '1. PERFIS DO USUÁRIO' AS secao,
  ap.nome                AS detalhe,
  eap.scope_type         AS escopo,
  COALESCE(o.nome, d.nome, '—') AS onde,
  CASE WHEN eap.revogado_em IS NOT NULL THEN 'REVOGADO'
       WHEN eap.valido_ate IS NOT NULL AND eap.valido_ate <= now() THEN 'EXPIRADO'
       ELSE 'ativo' END  AS situacao
FROM alvo a
LEFT JOIN public.employee_access_profiles eap ON eap.user_id = a.user_id
LEFT JOIN public.access_profiles ap ON ap.id = eap.profile_id
LEFT JOIN public.obras o  ON o.id = eap.scope_id
LEFT JOIN public.departamentos d ON d.id = eap.scope_id

UNION ALL

-- 2. O perfil tem as permissões de frota?
SELECT
  '2. PERMISSOES DO PERFIL',
  ap.nome,
  prm.chave,
  CASE WHEN app.permitido THEN 'permitido' ELSE 'negado' END,
  ''
FROM public.access_profiles ap
JOIN public.access_profile_permissions app ON app.profile_id = ap.id
JOIN public.access_permissions prm ON prm.id = app.permission_id
WHERE ap.nome = 'Administrativo Frota/Alojamento'
  AND prm.chave LIKE 'frota.%'

UNION ALL

-- 3. Quantas permissões o perfil tem no total (o contador da tela)
SELECT
  '3. TOTAL DE PERMISSOES DO PERFIL',
  ap.nome,
  count(app.*)::text,
  '',
  ''
FROM public.access_profiles ap
LEFT JOIN public.access_profile_permissions app ON app.profile_id = ap.id AND app.permitido
WHERE ap.nome = 'Administrativo Frota/Alojamento'
GROUP BY ap.nome

UNION ALL

-- 4. O veredito do motor de acesso, do jeito que o sistema pergunta
SELECT
  '4. O QUE O SISTEMA RESPONDE',
  'pode_geral_u(frota.visualizar)',
  public.pode_geral_u((SELECT user_id FROM alvo), 'frota.visualizar')::text,
  '',
  ''
FROM alvo

UNION ALL

SELECT
  '4. O QUE O SISTEMA RESPONDE',
  'get_user_role',
  COALESCE(public.get_user_role((SELECT user_id FROM alvo))::text, 'NULO'),
  '',
  ''
FROM alvo

UNION ALL

-- 5. O funcionário está vinculado a este usuário?
SELECT
  '5. FUNCIONARIO VINCULADO',
  e.nome,
  COALESCE(o.nome, 'sem obra'),
  e.status::text,
  ''
FROM alvo a
JOIN public.employees e ON e.user_id = a.user_id
LEFT JOIN public.obras o ON o.id = e.obra_id

ORDER BY 1, 2;

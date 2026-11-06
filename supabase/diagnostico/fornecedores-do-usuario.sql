-- ============================================================================
-- O usuário deveria ver fornecedores? Três perguntas, três respostas.
-- Só lê. Troque o e-mail se precisar.
-- ============================================================================

WITH alvo AS (SELECT id AS user_id FROM auth.users WHERE email = 'breno@teste.com')

-- 1. A migração 20261105000003 já rodou neste banco?
SELECT
  '1. MIGRACAO 0003 RODOU?' AS pergunta,
  CASE WHEN to_regprocedure('public.tem_permissao_em_algum_escopo(text)') IS NULL
       THEN 'NAO — rode supabase/migrations/20261105000003_fornecedores_escopo_de_obra.sql'
       ELSE 'sim' END AS resposta

UNION ALL

-- 2. can_access_fornecedores ainda usa pode_geral (o portão que barra obra)?
SELECT
  '2. PORTAO AINDA EXIGE EMPRESA?',
  CASE WHEN p.prosrc LIKE '%pode_geral%'
       THEN 'SIM — versao antiga, barra quem tem escopo de obra'
       ELSE 'nao — versao corrigida' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_access_fornecedores'

UNION ALL

-- 3. O usuário tem a permissão, e em que escopo?
SELECT
  '3. GRANT DO USUARIO',
  COALESCE(
    (SELECT string_agg(g.chave || ' @ ' || g.scope_type, ', ' ORDER BY g.chave)
     FROM alvo a, public.access_grants(a.user_id) g
     WHERE g.chave LIKE 'fornecedores.%' AND g.permitido),
    'NENHUM — marque fornecedores.visualizar no perfil')

UNION ALL

-- 4. Há fornecedor vinculado à obra dele?
SELECT
  '4. FORNECEDORES NA OBRA',
  COALESCE(
    (SELECT string_agg(DISTINCT f.nome || ' (' || o.nome || ')', ', ')
     FROM public.obra_fornecedores of1
     JOIN public.fornecedores f ON f.id = of1.fornecedor_id
     JOIN public.obras o ON o.id = of1.obra_id
     WHERE of1.status = true
       AND of1.obra_id IN (
         SELECT eap.scope_id FROM alvo a
         JOIN public.employee_access_profiles eap ON eap.user_id = a.user_id
         WHERE eap.scope_type = 'obra' AND eap.revogado_em IS NULL)),
    'NENHUM fornecedor vinculado as obras desse usuario')

UNION ALL

-- 5. Quantos fornecedores existem no cadastro, no total?
SELECT '5. FORNECEDORES NO CADASTRO', count(*)::text FROM public.fornecedores

ORDER BY 1;

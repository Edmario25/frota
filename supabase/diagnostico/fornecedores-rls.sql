-- ============================================================================
-- Qual das duas políticas está negando o fornecedor?
--
-- A tela faz duas consultas em sequência:
--   1. obra_fornecedores  → quais fornecedores estão na minha obra
--   2. fornecedores       → os dados desses fornecedores
-- Basta uma das duas negar para a lista chegar vazia.
--
-- As funções da RLS usam auth.uid(), que é NULO no editor SQL. Por isso aqui
-- a regra é reescrita com o usuário explícito. Só lê.
-- ============================================================================

WITH alvo AS (SELECT id AS user_id FROM auth.users WHERE email = 'breno@teste.com')

-- 1. O portão do cadastro (política de "fornecedores")
SELECT
  '1. PORTAO DO CADASTRO' AS etapa,
  'tem fornecedores.visualizar ou .editar em algum escopo' AS regra,
  (EXISTS (SELECT 1 FROM alvo a, public.access_grants(a.user_id) g
           WHERE g.chave IN ('fornecedores.visualizar','fornecedores.editar') AND g.permitido))::text AS resultado

UNION ALL

-- 2. O vínculo, obra a obra (política de "obra_fornecedores")
SELECT
  '2. VINCULO NA OBRA',
  o.nome,
  public.pode_u((SELECT user_id FROM alvo), 'fornecedores.visualizar', o.id)::text
FROM public.obras o

UNION ALL

-- 3. O que a primeira consulta da tela devolveria
SELECT
  '3. FORNECEDORES QUE A TELA ACHARIA',
  COALESCE(string_agg(DISTINCT f.nome, ', '), 'NENHUM'),
  count(DISTINCT f.id)::text
FROM public.obra_fornecedores of1
JOIN public.fornecedores f ON f.id = of1.fornecedor_id
WHERE of1.status = true
  AND public.pode_u((SELECT user_id FROM alvo), 'fornecedores.visualizar', of1.obra_id)

UNION ALL

-- 4. A política de "fornecedores" existe e com que expressão?
SELECT
  '4. POLITICAS DA TABELA fornecedores',
  pol.polname,
  COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '—')
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
WHERE c.relname = 'fornecedores'

UNION ALL

-- 5. E as de obra_fornecedores?
SELECT
  '5. POLITICAS DE obra_fornecedores',
  pol.polname,
  COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '—')
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
WHERE c.relname = 'obra_fornecedores'

ORDER BY 1, 2;

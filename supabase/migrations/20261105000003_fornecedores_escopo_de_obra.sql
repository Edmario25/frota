-- ============================================================================
-- Fornecedores da obra não carregavam para quem tem acesso por OBRA
--
-- Defeito da migração 20261104000003, minha. Escrevi o portão de entrada do
-- módulo assim:
--
--     public.pode_geral('fornecedores.visualizar')
--
-- pode_geral() responde "pode na EMPRESA INTEIRA". Quem tem o perfil aplicado
-- a uma obra específica recebe false — e como a política encadeia
--
--     can_access_fornecedores() AND (pode na obra ...)
--
-- o primeiro termo zerava tudo, por mais correto que fosse o segundo. O
-- usuário via o menu e a lista vazia.
--
-- A pergunta certa para o portão é "tem essa permissão em ALGUM lugar?". Onde
-- ela vale é assunto do segundo termo, que já cuida disso por obra.
--
-- Idempotente. Rodar inteiro.
-- ============================================================================

-- ─── Tem a permissão em qualquer escopo? ────────────────────────────────────
-- Equivale ao canAction() do frontend: serve para abrir a porta do módulo,
-- nunca para decidir o que a pessoa enxerga lá dentro.

CREATE OR REPLACE FUNCTION public.tem_permissao_em_algum_escopo(p_chave text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.access_grants(auth.uid()) g
    WHERE g.chave = p_chave AND g.permitido
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.access_grants(auth.uid()) g
    WHERE g.chave = p_chave AND NOT g.permitido AND g.scope_type = 'empresa'
  );
$$;

COMMENT ON FUNCTION public.tem_permissao_em_algum_escopo(text) IS
  'A pessoa tem esta permissão em algum escopo (empresa ou alguma obra)? Serve para abrir a porta de um módulo. Para decidir o que ela vê dentro, use pode(chave, obra).';

REVOKE ALL ON FUNCTION public.tem_permissao_em_algum_escopo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_permissao_em_algum_escopo(text) TO authenticated;

-- ─── O portão do módulo de fornecedores ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_fornecedores()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    -- Em qualquer escopo: empresa inteira OU uma obra só.
    public.tem_permissao_em_algum_escopo('fornecedores.visualizar')
    OR public.tem_permissao_em_algum_escopo('fornecedores.editar')
    OR public.access_is_admin()
    OR public.get_user_role(auth.uid()) = 'admin';
$$;

REVOKE ALL ON FUNCTION public.can_access_fornecedores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_fornecedores() TO authenticated;

-- ─── Gerir o vínculo numa obra ──────────────────────────────────────────────
-- Mesma revisão: 'fornecedores.editar' concedido só naquela obra precisa valer.

CREATE OR REPLACE FUNCTION public.pode_gerir_fornecedor_na_obra(p_obra uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    public.access_is_admin()
    OR public.pode('fornecedores.editar', p_obra)
    OR public.pode('fornecedores.criar', p_obra)
    OR public.can_manage_obra_data(p_obra);
$$;

REVOKE ALL ON FUNCTION public.pode_gerir_fornecedor_na_obra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerir_fornecedor_na_obra(uuid) TO authenticated;

-- ─── Quem vê o cadastro, vê o vínculo da obra onde tem acesso ───────────────

DROP POLICY IF EXISTS obra_fornecedores_select_scoped ON public.obra_fornecedores;

CREATE POLICY obra_fornecedores_select_scoped
  ON public.obra_fornecedores FOR SELECT TO authenticated
  USING (
    public.pode('fornecedores.visualizar', obra_id)
    OR public.pode_gerir_fornecedor_na_obra(obra_id)
  );

-- ─── Diagnóstico: o perfil tem mesmo as chaves de fornecedor? ───────────────
-- Corrigir a função não adianta se a permissão nunca foi marcada no perfil.

DO $$
DECLARE r record; v_achou boolean := false;
BEGIN
  FOR r IN
    SELECT ap.nome,
           count(*) FILTER (WHERE prm.chave LIKE 'fornecedores.%' AND app.permitido) AS chaves
    FROM public.access_profiles ap
    LEFT JOIN public.access_profile_permissions app ON app.profile_id = ap.id
    LEFT JOIN public.access_permissions prm ON prm.id = app.permission_id
    WHERE ap.ativo
    GROUP BY ap.nome
    ORDER BY ap.nome
  LOOP
    IF r.chaves > 0 THEN v_achou := true; END IF;
    RAISE NOTICE 'Perfil "%": % permissão(ões) de fornecedores', r.nome, r.chaves;
  END LOOP;

  IF NOT v_achou THEN
    RAISE NOTICE '--- Nenhum perfil tem permissão de fornecedores. Marque fornecedores.visualizar no perfil em Controle de Acesso → Perfis e permissões. ---';
  END IF;
END $$;

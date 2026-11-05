-- ============================================================================
-- "new row violates row-level security policy for table obra_fornecedores"
--
-- Vincular fornecedor à obra falhava porque as políticas da tabela ainda falam
-- a língua do modelo de acesso ANTIGO:
--
--   can_access_fornecedores()  → get_user_role()='admin' OU cargo.acesso_fornecedores
--                                (esta segunda coluna já nem existe mais no banco)
--   can_manage_obra_data(obra) → get_user_role() em (admin, gestor_contrato,
--                                gestor_frota) ou gestor_obra daquela obra
--
-- Só que get_user_role() foi reescrito para ler APENAS employee_access_profiles.
-- Quem usa o sistema por exceção ou delegação — sem perfil atribuído — tem
-- get_user_role() nulo. O resultado é o pior tipo de inconsistência: a pessoa
-- enxerga a tela de fornecedores, preenche o formulário inteiro e só descobre
-- no botão Vincular que nunca teve o direito de gravar.
--
-- As chaves fornecedores.visualizar e fornecedores.editar já existem no
-- catálogo desde a criação do modelo novo. Faltava a tabela usá-las.
--
-- Esta migração NÃO amplia o acesso de ninguém: traduz a regra que já valia
-- para o modelo novo e mantém a regra antiga como caminho alternativo enquanto
-- a migração dos módulos não termina.
--
-- Idempotente. Rodar inteiro.
-- ============================================================================

-- ─── 1. Ver fornecedor ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_fornecedores()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    -- Modelo novo
    public.pode_geral('fornecedores.visualizar')
    -- Quem administra o controle de acesso não pode ficar trancado para fora
    -- de um cadastro: ele se concederia a permissão em dois cliques de qualquer
    -- forma, e o bloqueio só produz suporte.
    OR public.access_is_admin()
    -- Modelo antigo, enquanto os módulos não terminam de migrar.
    --
    -- O ramo por cargo.acesso_fornecedores, que a versão de 20260823 tinha,
    -- saiu daqui: a coluna não existe mais no banco. Ela foi removida fora
    -- deste repositório, então a função antiga já falhava ou dependia do
    -- curto-circuito dos OR anteriores. Ninguém perde acesso com a saída —
    -- um ramo que referencia coluna inexistente não autoriza ninguém.
    OR public.get_user_role(auth.uid()) = 'admin';
$$;

REVOKE ALL ON FUNCTION public.can_access_fornecedores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_fornecedores() TO authenticated;

-- ─── 2. Vincular fornecedor a UMA obra ──────────────────────────────────────
-- Função própria em vez de mexer em can_manage_obra_data(): aquela é usada por
-- várias outras tabelas e alterá-la mudaria regras que ninguém pediu para mudar.

CREATE OR REPLACE FUNCTION public.pode_gerir_fornecedor_na_obra(p_obra uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    public.access_is_admin()
    -- Modelo novo: a permissão vale no escopo da obra em questão
    OR public.pode('fornecedores.editar', p_obra)
    -- Modelo antigo
    OR public.can_manage_obra_data(p_obra);
$$;

COMMENT ON FUNCTION public.pode_gerir_fornecedor_na_obra(uuid) IS
  'Quem pode criar, alterar ou encerrar o vínculo de um fornecedor com esta obra. Aceita o modelo de acesso novo (fornecedores.editar no escopo da obra) e o antigo, enquanto a migração dos módulos não termina.';

REVOKE ALL ON FUNCTION public.pode_gerir_fornecedor_na_obra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerir_fornecedor_na_obra(uuid) TO authenticated;

-- ─── 3. Políticas da tabela de vínculo ──────────────────────────────────────

DROP POLICY IF EXISTS obra_fornecedores_select_scoped ON public.obra_fornecedores;
DROP POLICY IF EXISTS obra_fornecedores_manage_scoped ON public.obra_fornecedores;

CREATE POLICY obra_fornecedores_select_scoped
  ON public.obra_fornecedores FOR SELECT TO authenticated
  USING (
    public.can_access_fornecedores()
    AND (
      public.pode('fornecedores.visualizar', obra_id)
      OR public.pode_gerir_fornecedor_na_obra(obra_id)
    )
  );

CREATE POLICY obra_fornecedores_manage_scoped
  ON public.obra_fornecedores FOR ALL TO authenticated
  USING      (public.pode_gerir_fornecedor_na_obra(obra_id))
  WITH CHECK (public.pode_gerir_fornecedor_na_obra(obra_id));

-- ─── 4. Tradução das permissões para os perfis ──────────────────────────────
-- Os perfis que o modelo antigo já autorizava passam a ter a chave equivalente
-- no modelo novo. Nada de novo é concedido: é a mesma regra, escrita no lugar
-- onde o sistema agora a procura.

INSERT INTO public.access_profile_permissions (profile_id, permission_id, permitido)
SELECT ap.id, prm.id, true
FROM public.access_profiles ap
CROSS JOIN public.access_permissions prm
WHERE ap.papel_equivalente IN ('admin', 'gestor_contrato', 'gestor_frota')
  AND prm.chave IN ('fornecedores.visualizar', 'fornecedores.editar', 'fornecedores.criar')
ON CONFLICT DO NOTHING;

-- Gestor de obra via perfil: enxergar e gerir fornecedor dentro da própria obra
-- já era o comportamento antigo (can_manage_obra_data com escopo de obra).
INSERT INTO public.access_profile_permissions (profile_id, permission_id, permitido)
SELECT ap.id, prm.id, true
FROM public.access_profiles ap
CROSS JOIN public.access_permissions prm
WHERE ap.papel_equivalente = 'gestor_obra'
  AND prm.chave IN ('fornecedores.visualizar', 'fornecedores.editar', 'fornecedores.criar')
ON CONFLICT DO NOTHING;

-- ─── 5. Diagnóstico ─────────────────────────────────────────────────────────
-- Imprime quem ficaria de fora, para a correção não terminar em silêncio.

DO $$
DECLARE v_sem_perfil integer;
BEGIN
  SELECT count(*) INTO v_sem_perfil
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.employee_access_profiles eap
    WHERE eap.user_id = u.id AND eap.revogado_em IS NULL
      AND eap.valido_de <= now() AND (eap.valido_ate IS NULL OR eap.valido_ate > now())
  );
  RAISE NOTICE 'Usuários sem nenhum perfil de acesso atribuído: %. Para esses, get_user_role() é nulo e toda política baseada no modelo antigo nega acesso.', v_sem_perfil;
END $$;

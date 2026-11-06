-- ============================================================================
-- A tabela fornecedores nunca recebeu a política por permissão
--
-- O diagnóstico mostrou as políticas que existem de fato nesta tabela:
--
--   forn_write                      get_user_role() IN (admin, gestor_contrato, …)
--   fornecedores_funcionario_select is_funcionario()
--   fornecedores_gestor_contrato_all is_gestor_contrato()
--   fornecedores_gestor_obra_select is_gestor_obra()
--   fornecedores_select_managers    is_operational_manager()
--
-- Todas decidem por PAPEL. Nenhuma chama can_access_fornecedores(), a função
-- que eu corrigi ontem — ou seja, aquela correção não teve efeito algum aqui:
-- consertei uma função que esta tabela não consulta. A migração que criaria a
-- política baseada em permissão (20260823000002) nunca chegou a este banco.
--
-- Efeito prático: a primeira consulta da tela encontra os fornecedores da obra
-- (obra_fornecedores já tem política por permissão), e a segunda — buscar os
-- dados desses fornecedores — é negada porque o papel da pessoa não casa com
-- nenhuma das cinco regras acima. Lista vazia, com tudo cadastrado.
--
-- Esta migração ADICIONA políticas; não remove nenhuma. Políticas se somam em
-- OU, então ninguém perde o acesso que já tinha.
--
-- Idempotente. Rodar inteiro.
-- ============================================================================

-- ─── Ler o cadastro ─────────────────────────────────────────────────────────
-- Quem tem a permissão em qualquer escopo enxerga o cadastro. O cadastro de
-- fornecedor é compartilhado entre obras por natureza: o filtro de "quais
-- interessam a esta obra" é feito por obra_fornecedores, que já tem a sua
-- própria política por obra.

DROP POLICY IF EXISTS fornecedores_select_por_permissao ON public.fornecedores;
CREATE POLICY fornecedores_select_por_permissao
  ON public.fornecedores FOR SELECT TO authenticated
  USING (public.can_access_fornecedores());

-- ─── Criar e alterar ────────────────────────────────────────────────────────
-- Vale a pena dizer o que está sendo decidido aqui: quem recebeu
-- fornecedores.criar/editar numa obra passa a poder mexer no cadastro
-- compartilhado, que outras obras também usam. É o mesmo alcance que o perfil
-- "Gestor de Obra" já tinha pela regra antiga (forn_write aceita gestor_obra),
-- então isto não amplia o que o sistema permitia — apenas passa a reconhecer
-- quem recebeu a permissão pelo modelo novo.
--
-- Se a intenção for que só a administração central altere o cadastro, troque
-- tem_permissao_em_algum_escopo por pode_geral nas duas linhas abaixo.

DROP POLICY IF EXISTS fornecedores_insert_por_permissao ON public.fornecedores;
CREATE POLICY fornecedores_insert_por_permissao
  ON public.fornecedores FOR INSERT TO authenticated
  WITH CHECK (
    public.access_is_admin()
    OR public.tem_permissao_em_algum_escopo('fornecedores.criar')
    OR public.tem_permissao_em_algum_escopo('fornecedores.editar')
  );

DROP POLICY IF EXISTS fornecedores_update_por_permissao ON public.fornecedores;
CREATE POLICY fornecedores_update_por_permissao
  ON public.fornecedores FOR UPDATE TO authenticated
  USING (
    public.access_is_admin()
    OR public.tem_permissao_em_algum_escopo('fornecedores.editar')
  )
  WITH CHECK (
    public.access_is_admin()
    OR public.tem_permissao_em_algum_escopo('fornecedores.editar')
  );

-- Excluir fica de fora de propósito: apagar um fornecedor afeta o histórico de
-- todas as obras que já compraram dele. Continua valendo apenas a regra antiga.

-- ─── Confere o que ficou ────────────────────────────────────────────────────

DO $$
DECLARE v_total integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  WHERE c.relname = 'fornecedores'
    AND pg_get_expr(COALESCE(pol.polqual, pol.polwithcheck), pol.polrelid) LIKE '%fornecedores%';

  RAISE NOTICE 'Políticas de fornecedores que decidem por permissão: %', v_total;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma política por permissão foi criada — a tela continuaria vazia.';
  END IF;
END $$;

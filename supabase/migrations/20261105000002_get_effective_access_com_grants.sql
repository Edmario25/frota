-- ============================================================================
-- "Seu acesso à frota não possui uma obra definida"
--
-- O usuário com perfil de escopo de obra via o menu da frota, entrava na tela
-- e encontrava a lista vazia. Fundo fixo igual. Os dois sintomas vêm do mesmo
-- lugar: get_effective_access().
--
-- Existem duas versões dessa função no histórico. A primeira (20260911000005)
-- devolve só 'permissions' e 'profiles'. A segunda (20260911000007) acrescenta
-- 'grants' e 'denies', que é onde vive o ESCOPO de cada permissão.
--
-- O frontend usa as duas coisas, e por isso o sintoma é partido ao meio:
--   • canAction() lê 'permissions' → o menu aparece;
--   • obrasCom()  lê 'grants'      → sem ela, "nenhuma obra", lista vazia.
--
-- Se o banco ficou com a versão antiga, a pessoa vê a porta e encontra a sala
-- vazia. Esta migração garante a versão completa. É CREATE OR REPLACE: se o
-- banco já estiver correto, nada muda.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_effective_access()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  WITH g AS (SELECT * FROM public.access_grants(auth.uid())),
  negado_total AS (
    SELECT DISTINCT g.chave FROM g WHERE NOT g.permitido AND g.scope_type = 'empresa'
  ),
  permitidos AS (
    SELECT DISTINCT g.chave, g.scope_type, g.scope_id
    FROM g
    WHERE g.permitido AND g.chave NOT IN (SELECT chave FROM negado_total)
  )
  SELECT jsonb_build_object(
    'permissions', COALESCE((SELECT jsonb_agg(DISTINCT p.chave) FROM permitidos p), '[]'::jsonb),
    -- 'grants' carrega o escopo: é o que diz EM QUE OBRA a permissão vale.
    'grants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('chave', p.chave, 'scope_type', p.scope_type, 'scope_id', p.scope_id))
      FROM permitidos p), '[]'::jsonb),
    'denies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('chave', g.chave, 'scope_type', g.scope_type, 'scope_id', g.scope_id))
      FROM g WHERE NOT g.permitido), '[]'::jsonb),
    'profiles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ap.id, 'nome', ap.nome,
                                          'scope_type', eap.scope_type, 'scope_id', eap.scope_id,
                                          'valido_ate', eap.valido_ate))
      FROM public.employee_access_profiles eap
      JOIN public.access_profiles ap ON ap.id = eap.profile_id AND ap.ativo
      WHERE eap.user_id = auth.uid() AND eap.revogado_em IS NULL
        AND eap.valido_de <= now() AND (eap.valido_ate IS NULL OR eap.valido_ate > now())
      ), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION public.get_effective_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_access() TO authenticated;

COMMENT ON FUNCTION public.get_effective_access() IS
  'Acesso efetivo do usuário logado: permissions (o que pode), grants (onde cada uma vale), denies e profiles. O frontend depende de grants para resolver escopo de obra — sem ele, as telas por obra abrem vazias.';

-- Confere o que ficou, para a correção não terminar em silêncio.
DO $$
DECLARE v_chaves text;
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_chaves
  FROM jsonb_object_keys(public.get_effective_access()) AS k;
  RAISE NOTICE 'get_effective_access agora devolve: %', v_chaves;
  IF v_chaves IS NULL OR position('grants' in v_chaves) = 0 THEN
    RAISE EXCEPTION 'A função continua sem "grants" — as telas por obra seguiriam vazias.';
  END IF;
END $$;

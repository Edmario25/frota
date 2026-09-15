-- Mantém o módulo de alojamentos no mesmo motor de permissões usado pelo
-- Controle de Acesso. Antes desta migração, as políticas consultavam apenas
-- flags legadas do cargo; por isso uma pessoa podia abrir a tela, mas receber
-- uma lista vazia após a troca para perfis e escopos.

CREATE OR REPLACE FUNCTION public.alojamento_pode_acessar(p_obra uuid, p_gerir boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      -- Administradores do modelo novo e o papel administrativo legado têm
      -- acesso completo, para não interromper a administração durante a migração.
      public.access_is_admin()

      -- Perfis do Controle de Acesso respeitam o escopo empresa ou obra.
      OR (
        NOT p_gerir
        AND public.pode('alojamento.visualizar', p_obra)
      )
      OR (
        p_gerir
        AND (
          public.pode('alojamento.criar', p_obra)
          OR public.pode('alojamento.editar', p_obra)
          OR public.pode('alojamento.administrar', p_obra)
        )
      )

      -- Compatibilidade temporária com os cargos cadastrados antes dos perfis.
      OR (
        p_obra IN (SELECT public.get_my_obra_ids())
        AND EXISTS (
          SELECT 1
          FROM public.employees e
          JOIN public.cargos c ON c.id = e.cargo_id
          WHERE e.user_id = auth.uid()
            AND c.acesso_alojamento
            AND (NOT p_gerir OR c.gerencia_alojamento)
        )
      )
    )
$$;

REVOKE ALL ON FUNCTION public.alojamento_pode_acessar(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alojamento_pode_acessar(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.alojamento_pode_acessar(uuid, boolean) IS
  'Autoriza leitura e gestão de alojamentos pelo Controle de Acesso, respeitando o escopo da obra e mantendo compatibilidade temporária com cargos legados.';

-- ============================================================================
-- Este usuário deveria ver cada veículo? Resposta veículo a veículo.
--
-- Reproduz exatamente a regra que a RLS aplica (acesso_novo /
-- can_access_vehicle_record), com o usuário explícito. Só lê.
--
-- Troque o e-mail nas DUAS linhas abaixo.
-- ============================================================================

WITH alvo AS (SELECT id AS user_id FROM auth.users WHERE email = 'breno@teste.com')

SELECT
  v.placa,
  COALESCE(v.marca || ' ' || v.modelo, '—')                      AS veiculo,
  v.status                                                        AS situacao,
  -- Os três caminhos que a regra aceita, separados:
  public.pode_geral_u((SELECT user_id FROM alvo), 'frota.visualizar') AS por_empresa,
  EXISTS(SELECT 1 FROM public.employees e
         WHERE e.id = v.responsavel_id AND e.user_id = (SELECT user_id FROM alvo)) AS por_ser_responsavel,
  EXISTS(SELECT 1 FROM public.obra_veiculos ov
         WHERE ov.vehicle_id = v.id
           AND public.pode_u((SELECT user_id FROM alvo), 'frota.visualizar', ov.obra_id)) AS por_obra,
  -- O veredito final, igual ao da política:
  public.acesso_novo('can_access_vehicle_record', (SELECT user_id FROM alvo), v.id) AS a_rls_permite,
  -- E a obra em que o veículo está, para conferir o cadastro:
  COALESCE((SELECT string_agg(o.nome, ', ')
            FROM public.obra_veiculos ov JOIN public.obras o ON o.id = ov.obra_id
            WHERE ov.vehicle_id = v.id AND ov.status = true), 'sem obra vinculada') AS obras_do_veiculo
FROM public.vehicles v
WHERE v.baixado_em IS NULL
ORDER BY v.placa;

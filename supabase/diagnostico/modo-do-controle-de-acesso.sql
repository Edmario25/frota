-- ============================================================================
-- Em que modelo cada regra de acesso está decidindo?
--
-- As políticas das tabelas não consultam o perfil diretamente: elas chamam
-- helpers (can_access_obra_data, can_access_vehicle_record e companhia) que
-- passam por acesso_decidir() → access_modo(helper). Esse modo é por helper e,
-- quando não há linha em access_config, o padrão é 'legado'.
--
-- 'legado' significa que a RLS ignora o perfil de acesso novo e decide pelo
-- cargo e pela lotação em obra_funcionarios. É compatível com o menu e os
-- hooks estarem corretos e, ainda assim, a lista chegar vazia: o frontend
-- pergunta ao modelo novo, o banco responde pelo antigo.
--
-- Só lê. Nada muda.
-- ============================================================================

SELECT
  'MODO POR HELPER' AS secao,
  h.helper,
  public.access_modo(h.helper) AS modo,
  CASE public.access_modo(h.helper)
    WHEN 'novo' THEN 'decide pelo perfil de acesso'
    ELSE 'decide pelo cargo e pela lotação em obra_funcionarios'
  END AS significado
FROM (VALUES
  ('can_access_obra_data'),
  ('can_manage_obra_data'),
  ('can_access_vehicle_record'),
  ('can_access_employee_record'),
  ('can_manage_employee_record'),
  ('can_manage_sms_obra')
) AS h(helper)

UNION ALL

SELECT
  'LINHAS EM access_config',
  c.helper,
  c.modo,
  ''
FROM public.access_config c

ORDER BY 1, 2;

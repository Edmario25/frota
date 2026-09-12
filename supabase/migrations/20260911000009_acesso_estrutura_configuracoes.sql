-- Cargos, departamentos/setores e configurações ganham permissões próprias.
-- Antes estavam presos a controle_acesso.administrar, que o Gestor de Contrato
-- não tem — e na regra antiga ele via essas telas. Conceder acesso a pessoas
-- continua separado (controle_acesso.administrar).

INSERT INTO public.access_permissions(chave,modulo,acao,nome,sensivel)
SELECT m||'.'||a, m, a,
  CASE m WHEN 'estrutura' THEN 'Cargos e departamentos' ELSE 'Configurações do sistema' END||' — '||initcap(a),
  false
FROM unnest(ARRAY['estrutura','configuracoes']) m
CROSS JOIN unnest(ARRAY['visualizar','criar','editar','excluir','administrar']) a
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.access_profile_permissions(profile_id,permission_id,permitido)
SELECT p.id, x.id, true
FROM public.access_profiles p CROSS JOIN public.access_permissions x
WHERE x.modulo IN ('estrutura','configuracoes')
  AND p.nome IN ('Administrador do Sistema','Administrador Tecnico','Gestor de Contrato')
ON CONFLICT DO NOTHING;

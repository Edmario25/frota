-- Segunda etapa: setores, exceções, revisões e correção dos escopos migrados.
-- As funções de avaliação (has_permission, get_effective_access,
-- can_approve_amount) ficam na 20260911000007, sobre o motor de escopo.

CREATE TABLE IF NOT EXISTS public.departamento_setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento_id uuid NOT NULL REFERENCES public.departamentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  responsavel_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(departamento_id,nome)
);

CREATE TABLE IF NOT EXISTS public.employee_department_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  departamento_id uuid NOT NULL REFERENCES public.departamentos(id) ON DELETE CASCADE,
  setor_id uuid REFERENCES public.departamento_setores(id) ON DELETE SET NULL,
  principal boolean NOT NULL DEFAULT false,
  gestor boolean NOT NULL DEFAULT false,
  valido_de date NOT NULL DEFAULT current_date,
  valido_ate date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(valido_ate IS NULL OR valido_ate >= valido_de)
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_department_assignments_unique
 ON public.employee_department_assignments(employee_id,departamento_id,COALESCE(setor_id,'00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.access_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.access_permissions(id) ON DELETE CASCADE,
  permitido boolean NOT NULL,
  scope_type text NOT NULL DEFAULT 'empresa' CHECK(scope_type IN ('proprio','equipe','setor','departamento','obra','empresa')),
  scope_id uuid,
  valido_de timestamptz NOT NULL DEFAULT now(),
  valido_ate timestamptz,
  justificativa text NOT NULL,
  aprovado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(valido_ate IS NULL OR valido_ate > valido_de)
);
CREATE INDEX IF NOT EXISTS access_overrides_user_idx ON public.access_overrides(user_id,valido_de,valido_ate);

CREATE TABLE IF NOT EXISTS public.access_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  referencia date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','em_revisao','concluida','cancelada')),
  criada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  concluida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.access_reviews(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.employee_access_profiles(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  decisao text CHECK(decisao IN ('manter','revogar','ajustar')),
  observacao text,
  revisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_em timestamptz,
  UNIQUE(review_id,assignment_id)
);

-- Revogar não apaga: o histórico de quem teve acesso precisa continuar consultável.
ALTER TABLE public.employee_access_profiles
  ADD COLUMN IF NOT EXISTS revogado_em timestamptz,
  ADD COLUMN IF NOT EXISTS revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Departamento principal já existente passa a integrar a estrutura matricial.
INSERT INTO public.employee_department_assignments(employee_id,departamento_id,principal)
SELECT id,departamento_id,true FROM public.employees WHERE departamento_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─── Correção dos escopos migrados na 00005 ─────────────────────────────────
-- A 00005 gravou o gestor de obra com scope_type='obra' e scope_id vazio, o que
-- valia como "todas as obras". Troca por uma atribuição por obra realmente
-- vinculada ao funcionário.
INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,scope_id,justificativa)
SELECT DISTINCT eap.user_id,eap.profile_id,'obra',v.obra_id,
  'Migração automática: obra vinculada ao funcionário'
FROM public.employee_access_profiles eap
JOIN public.employees e ON e.user_id=eap.user_id
JOIN (
  SELECT employee_id,obra_id FROM public.employee_obra_assignments
  UNION
  SELECT employee_id,obra_id FROM public.obra_funcionarios WHERE status=true
) v ON v.employee_id=e.id
WHERE eap.scope_type='obra' AND eap.scope_id IS NULL
ON CONFLICT DO NOTHING;

DELETE FROM public.employee_access_profiles WHERE scope_type='obra' AND scope_id IS NULL;

-- Perfil "Funcionario" vale só para os próprios registros, não para a empresa inteira.
UPDATE public.employee_access_profiles eap SET scope_type='proprio'
FROM public.access_profiles ap
WHERE ap.id=eap.profile_id AND ap.nome='Funcionario' AND eap.scope_type='empresa'
  AND NOT EXISTS(SELECT 1 FROM public.employee_access_profiles x
                 WHERE x.user_id=eap.user_id AND x.profile_id=eap.profile_id AND x.scope_type='proprio');

-- Perfil-base para quem só tem o cargo (sem papel em user_roles), pelo employees.user_id.
INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,scope_id,justificativa)
SELECT e.user_id,ap.id,
  CASE c.nivel_acesso::text WHEN 'gestor_contrato' THEN 'empresa' WHEN 'gestor_obra' THEN 'obra' ELSE 'proprio' END,
  CASE WHEN c.nivel_acesso::text='gestor_obra' THEN v.obra_id END,
  'Migração automática a partir do cargo '||c.nome
FROM public.employees e
JOIN public.cargos c ON c.id=e.cargo_id
JOIN public.access_profiles ap ON ap.nome=CASE c.nivel_acesso::text
  WHEN 'gestor_contrato' THEN 'Gestor de Contrato' WHEN 'gestor_obra' THEN 'Gestor de Obra' ELSE 'Funcionario' END
LEFT JOIN (
  SELECT employee_id,obra_id FROM public.employee_obra_assignments
  UNION
  SELECT employee_id,obra_id FROM public.obra_funcionarios WHERE status=true
) v ON v.employee_id=e.id AND c.nivel_acesso::text='gestor_obra'
WHERE e.user_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.employee_access_profiles x WHERE x.user_id=e.user_id)
  AND (c.nivel_acesso::text<>'gestor_obra' OR v.obra_id IS NOT NULL)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_access_review(p_titulo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE rid uuid;
BEGIN
 IF NOT public.access_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 INSERT INTO public.access_reviews(titulo) VALUES(nullif(trim(p_titulo),'')) RETURNING id INTO rid;
 INSERT INTO public.access_review_items(review_id,assignment_id,user_id,profile_id)
 SELECT rid,id,user_id,profile_id FROM public.employee_access_profiles
 WHERE revogado_em IS NULL AND valido_de<=now() AND (valido_ate IS NULL OR valido_ate>now());
 RETURN rid;
END $$;

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['departamento_setores','employee_department_assignments','access_overrides','access_reviews','access_review_items'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('DROP POLICY IF EXISTS access_admin_all ON public.%I',t);
 EXECUTE format('CREATE POLICY access_admin_all ON public.%I FOR ALL TO authenticated USING (public.access_is_admin()) WITH CHECK (public.access_is_admin())',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 END LOOP; END $$;

DROP POLICY IF EXISTS setores_authenticated_read ON public.departamento_setores;
CREATE POLICY setores_authenticated_read ON public.departamento_setores FOR SELECT TO authenticated USING(ativo OR public.access_is_admin());
DROP POLICY IF EXISTS employee_department_own_read ON public.employee_department_assignments;
CREATE POLICY employee_department_own_read ON public.employee_department_assignments FOR SELECT TO authenticated USING(
 employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id=auth.uid())
);

DO $$ DECLARE t text; BEGIN IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
 FOREACH t IN ARRAY ARRAY['departamento_setores','employee_department_assignments','access_overrides','access_reviews','access_review_items'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.%I',t);
  EXECUTE format('CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao()',t);
 END LOOP;
END IF; END $$;

REVOKE ALL ON FUNCTION public.create_access_review(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_access_review(text) TO authenticated;

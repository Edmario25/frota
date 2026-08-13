-- ============================================================
-- Cargo Permissions v2 — arquivo único, roda do zero
-- Seguro para reexecutar (IF NOT EXISTS em tudo)
-- ============================================================

-- ─── 1. Colunas de permissão na tabela cargos ───────────────

ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acessa_todas_obras       boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_dashboard          boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_frota              boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_escalas            boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_manutencao         boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_colaboradores      boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_relatorios         boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_dashboard      boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_desvios        boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_inspecoes      boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_apr            boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_dds            boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_epis           boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_treinamentos   boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_admissao       boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_rdo            boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_efetivo            boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_almoxarifado       boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_ferramentas        boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_cronograma         boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_subcontratadas     boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_financeiro         boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_qualidade          boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_comunicados        boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_visitantes         boolean NOT NULL DEFAULT false;

-- ─── 2. Backfill cargos existentes ──────────────────────────

UPDATE public.cargos SET
  acessa_todas_obras = true, acesso_dashboard = true, acesso_frota = true,
  acesso_escalas = true, acesso_manutencao = true, acesso_colaboradores = true,
  acesso_fundo_fixo = true, acesso_relatorios = true,
  acesso_sms_dashboard = true, acesso_sms_desvios = true, acesso_sms_inspecoes = true,
  acesso_sms_apr = true, acesso_sms_dds = true, acesso_sms_epis = true,
  acesso_sms_treinamentos = true, acesso_sms_admissao = true, acesso_sms_rdo = true
WHERE nivel_acesso = 'gestor_contrato';

UPDATE public.cargos SET
  acessa_todas_obras = false, acesso_dashboard = true, acesso_frota = true,
  acesso_escalas = true, acesso_manutencao = true, acesso_colaboradores = true,
  acesso_relatorios = true,
  acesso_sms_dashboard = true, acesso_sms_desvios = true, acesso_sms_inspecoes = true,
  acesso_sms_apr = true, acesso_sms_dds = true, acesso_sms_epis = true,
  acesso_sms_treinamentos = true, acesso_sms_admissao = true, acesso_sms_rdo = true
WHERE nivel_acesso = 'gestor_obra';

UPDATE public.cargos SET
  acessa_todas_obras = false, acesso_escalas = true
WHERE nivel_acesso = 'funcionario';

-- ─── 3. Tabela vínculo funcionário ↔ obras ───────────────────

CREATE TABLE IF NOT EXISTS public.employee_obra_assignments (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id     uuid NOT NULL REFERENCES public.obras(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  PRIMARY KEY (employee_id, obra_id)
);

ALTER TABLE public.employee_obra_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eoa_select_gestores"   ON public.employee_obra_assignments;
DROP POLICY IF EXISTS "eoa_select_all_auth"   ON public.employee_obra_assignments;
DROP POLICY IF EXISTS "eoa_write_gestores"    ON public.employee_obra_assignments;

CREATE POLICY "eoa_select_all_auth" ON public.employee_obra_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "eoa_write_gestores" ON public.employee_obra_assignments
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- ─── 4. Função: permissões do cargo do usuário logado ────────

DROP FUNCTION IF EXISTS public.get_user_permissions();

CREATE OR REPLACE FUNCTION public.get_user_permissions()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT to_jsonb(c.*) - 'id' - 'created_at' - 'updated_at'
  FROM public.cargos c
  WHERE c.id = (
    SELECT e.cargo_id
    FROM public.employees e
    WHERE e.user_id = auth.uid()
    LIMIT 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permissions() TO authenticated;

-- ─── 5. Função: IDs das obras do usuário logado ──────────────

DROP FUNCTION IF EXISTS public.get_user_obra_ids();

CREATE OR REPLACE FUNCTION public.get_user_obra_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT CASE
    WHEN (
      SELECT c.acessa_todas_obras
      FROM public.cargos c
      WHERE c.id = (
        SELECT e.cargo_id FROM public.employees e
        WHERE e.user_id = auth.uid() LIMIT 1
      )
    ) = true
    THEN ARRAY(SELECT id FROM public.obras)
    ELSE ARRAY(
      SELECT eoa.obra_id
      FROM public.employee_obra_assignments eoa
      WHERE eoa.employee_id = (
        SELECT e.id FROM public.employees e
        WHERE e.user_id = auth.uid() LIMIT 1
      )
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_obra_ids() TO authenticated;

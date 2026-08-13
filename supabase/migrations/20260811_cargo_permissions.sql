-- ============================================================
-- Fase 1: Controle de Acesso por Cargo (PBAC)
-- Adiciona permissões granulares por módulo aos cargos
-- Cria tabela de vínculo funcionário ↔ obras
-- ============================================================

-- ─── 1. Novas colunas de permissão na tabela cargos ─────────

-- Escopo
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acessa_todas_obras    boolean NOT NULL DEFAULT false;

-- Módulos operacionais
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_dashboard       boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_frota           boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_escalas         boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_manutencao      boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_colaboradores   boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_relatorios      boolean NOT NULL DEFAULT false;
-- acesso_fundo_fixo já existe

-- Módulos SMS
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_dashboard   boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_desvios     boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_inspecoes   boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_apr         boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_dds         boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_epis        boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_treinamentos boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_admissao    boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_sms_rdo         boolean NOT NULL DEFAULT false;

-- Módulos futuros (reservados — sem UI ainda)
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_efetivo         boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_almoxarifado    boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_ferramentas     boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_cronograma      boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_subcontratadas  boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_financeiro      boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_qualidade       boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_comunicados     boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_visitantes      boolean NOT NULL DEFAULT false;

-- ─── 2. Backfill de cargos existentes com base no nivel_acesso ─

-- Gestor de Contratos: acesso total a tudo
UPDATE public.cargos SET
  acessa_todas_obras      = true,
  acesso_dashboard        = true,
  acesso_frota            = true,
  acesso_escalas          = true,
  acesso_manutencao       = true,
  acesso_colaboradores    = true,
  acesso_fundo_fixo       = true,
  acesso_relatorios       = true,
  acesso_sms_dashboard    = true,
  acesso_sms_desvios      = true,
  acesso_sms_inspecoes    = true,
  acesso_sms_apr          = true,
  acesso_sms_dds          = true,
  acesso_sms_epis         = true,
  acesso_sms_treinamentos = true,
  acesso_sms_admissao     = true,
  acesso_sms_rdo          = true
WHERE nivel_acesso = 'gestor_contrato';

-- Gestor de Obra: acesso operacional completo + SMS
UPDATE public.cargos SET
  acessa_todas_obras      = false,
  acesso_dashboard        = true,
  acesso_frota            = true,
  acesso_escalas          = true,
  acesso_manutencao       = true,
  acesso_colaboradores    = true,
  acesso_relatorios       = true,
  acesso_sms_dashboard    = true,
  acesso_sms_desvios      = true,
  acesso_sms_inspecoes    = true,
  acesso_sms_apr          = true,
  acesso_sms_dds          = true,
  acesso_sms_epis         = true,
  acesso_sms_treinamentos = true,
  acesso_sms_admissao     = true,
  acesso_sms_rdo          = true
WHERE nivel_acesso = 'gestor_obra';

-- Funcionário: acesso mínimo (checklist / escala pessoal)
UPDATE public.cargos SET
  acessa_todas_obras = false,
  acesso_escalas     = true,
  acesso_dashboard   = false
WHERE nivel_acesso = 'funcionario';

-- ─── 3. Tabela de vínculo funcionário ↔ obras ───────────────

CREATE TABLE IF NOT EXISTS public.employee_obra_assignments (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id     uuid NOT NULL REFERENCES public.obras(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  PRIMARY KEY (employee_id, obra_id)
);

ALTER TABLE public.employee_obra_assignments ENABLE ROW LEVEL SECURITY;

-- Gestores de contrato veem todos os vínculos
CREATE POLICY "eoa_select_gestores" ON public.employee_obra_assignments
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota'));

-- Gestor de obra vê vínculos da sua obra
CREATE POLICY "eoa_select_gestor_obra" ON public.employee_obra_assignments
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'gestor_obra'
    AND obra_id IN (
      SELECT o.id FROM obras o
      JOIN employees e ON e.id = (SELECT employee_id FROM profiles WHERE id = auth.uid() LIMIT 1)
      JOIN cargos c ON c.id = e.cargo_id
      WHERE c.acessa_todas_obras = true
         OR e.id IN (SELECT employee_id FROM employee_obra_assignments WHERE obra_id = o.id)
    )
  );

-- Gestores podem inserir/atualizar/deletar
CREATE POLICY "eoa_write_gestores" ON public.employee_obra_assignments
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- ─── 4. Função: retorna permissões do cargo do usuário logado ─

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
    WHERE e.id = (
      SELECT p.employee_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
    LIMIT 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permissions() TO authenticated;

-- ─── 5. Função: retorna IDs das obras do usuário logado ──────

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
        WHERE e.id = (
          SELECT p.employee_id FROM public.profiles p
          WHERE p.id = auth.uid() LIMIT 1
        ) LIMIT 1
      )
    ) = true
    THEN ARRAY(SELECT id FROM public.obras)
    ELSE ARRAY(
      SELECT obra_id
      FROM public.employee_obra_assignments
      WHERE employee_id = (
        SELECT p.employee_id FROM public.profiles p
        WHERE p.id = auth.uid() LIMIT 1
      )
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_obra_ids() TO authenticated;

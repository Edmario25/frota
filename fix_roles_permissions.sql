-- ============================================================
-- FIX: PERMISSÕES E REESTRUTURAÇÃO DOS 3 NÍVEIS DE USUÁRIO
-- Execute no SQL Editor do Supabase Studio
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. GRANT BÁSICO (resolve "permission denied for table X")
-- ─────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- ─────────────────────────────────────────────────────────────
-- 2. ADICIONAR NOVO ROLE gestor_contrato
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_contrato';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. MIGRAR ROLES EXISTENTES
--    admin + gestor_frota → gestor_contrato
-- ─────────────────────────────────────────────────────────────
UPDATE public.user_roles
SET role = 'gestor_contrato'
WHERE role IN ('admin', 'gestor_frota');

-- ─────────────────────────────────────────────────────────────
-- 4. FUNÇÃO AUXILIAR: obter obra do gestor
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_obra_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE SET search_path = public
AS $$
  SELECT o.id
  FROM obras o
  JOIN employees e ON e.id = o.responsavel_tecnico_id
  WHERE e.user_id = auth.uid()
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. TABELAS DE REFERÊNCIA
--    gestor_contrato: tudo | gestor_obra: leitura | funcionario: leitura
-- ─────────────────────────────────────────────────────────────

-- cargos
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins and gestors can manage cargos" ON public.cargos;
DROP POLICY IF EXISTS "All authenticated users can view cargos" ON public.cargos;
DROP POLICY IF EXISTS "gc_manage_cargos" ON public.cargos;
DROP POLICY IF EXISTS "auth_view_cargos" ON public.cargos;
CREATE POLICY "gc_manage_cargos" ON public.cargos
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));
CREATE POLICY "auth_view_cargos" ON public.cargos
  FOR SELECT TO authenticated USING (true);

-- departamentos
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_departamentos" ON public.departamentos;
DROP POLICY IF EXISTS "auth_view_departamentos" ON public.departamentos;
CREATE POLICY "gc_manage_departamentos" ON public.departamentos
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));
CREATE POLICY "auth_view_departamentos" ON public.departamentos
  FOR SELECT TO authenticated USING (true);

-- rental_companies
ALTER TABLE public.rental_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_rental_companies" ON public.rental_companies;
DROP POLICY IF EXISTS "manager_view_rental_companies" ON public.rental_companies;
CREATE POLICY "gc_manage_rental_companies" ON public.rental_companies
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));
CREATE POLICY "manager_view_rental_companies" ON public.rental_companies
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) != 'funcionario'::app_role);

-- escala_tipos
ALTER TABLE public.escala_tipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_escala_tipos" ON public.escala_tipos;
DROP POLICY IF EXISTS "auth_view_escala_tipos" ON public.escala_tipos;
CREATE POLICY "gc_manage_escala_tipos" ON public.escala_tipos
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));
CREATE POLICY "auth_view_escala_tipos" ON public.escala_tipos
  FOR SELECT TO authenticated USING (true);

-- fornecedores
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "manager_view_fornecedores" ON public.fornecedores;
CREATE POLICY "gc_manage_fornecedores" ON public.fornecedores
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));
CREATE POLICY "manager_view_fornecedores" ON public.fornecedores
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) != 'funcionario'::app_role);

-- ─────────────────────────────────────────────────────────────
-- 6. EMPLOYEES
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins and gestors can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and gestors can manage all employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can view their own profile" ON public.employees;
DROP POLICY IF EXISTS "Anyone authenticated can view employees" ON public.employees;
DROP POLICY IF EXISTS "Anyone authenticated can create employees" ON public.employees;
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.employees;
DROP POLICY IF EXISTS "gc_manage_employees" ON public.employees;
DROP POLICY IF EXISTS "go_view_employees" ON public.employees;
DROP POLICY IF EXISTS "func_view_own_employee" ON public.employees;

-- Gestor de Contratos: acesso total
CREATE POLICY "gc_manage_employees" ON public.employees
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

-- Gestor de Obras: ver todos (filtragem feita no frontend)
CREATE POLICY "go_view_employees" ON public.employees
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'gestor_obra'::app_role);

-- Funcionário: ver apenas o próprio
CREATE POLICY "func_view_own_employee" ON public.employees
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'funcionario'::app_role AND user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 7. PROFILES
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_profiles" ON public.profiles;
DROP POLICY IF EXISTS "auth_view_own_profile" ON public.profiles;
CREATE POLICY "gc_manage_profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));
CREATE POLICY "auth_view_own_profile" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 8. USER_ROLES
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "auth_view_own_role" ON public.user_roles;
CREATE POLICY "gc_manage_user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));
CREATE POLICY "auth_view_own_role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 9. VEHICLES
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins and gestors can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "All authenticated users can create vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Employees can view assigned vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "gc_manage_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "go_view_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "func_view_assigned_vehicle" ON public.vehicles;

CREATE POLICY "gc_manage_vehicles" ON public.vehicles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_vehicles" ON public.vehicles
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'gestor_obra'::app_role);

CREATE POLICY "func_view_assigned_vehicle" ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 10. OBRAS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Apenas gestores gerais podem criar obras" ON public.obras;
DROP POLICY IF EXISTS "Colaboradores nao podem acessar obras" ON public.obras;
DROP POLICY IF EXISTS "gc_manage_obras" ON public.obras;
DROP POLICY IF EXISTS "go_view_own_obra" ON public.obras;

CREATE POLICY "gc_manage_obras" ON public.obras
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_own_obra" ON public.obras
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND responsavel_tecnico_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 11. OBRA_FUNCIONARIOS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.obra_funcionarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_obra_func" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "go_manage_own_obra_func" ON public.obra_funcionarios;
DROP POLICY IF EXISTS "func_view_own_obra_func" ON public.obra_funcionarios;

CREATE POLICY "gc_manage_obra_func" ON public.obra_funcionarios
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_manage_own_obra_func" ON public.obra_funcionarios
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND obra_id = get_user_obra_id()
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND obra_id = get_user_obra_id()
  );

CREATE POLICY "func_view_own_obra_func" ON public.obra_funcionarios
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 12. OBRA_VEICULOS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.obra_veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_obra_veiculos" ON public.obra_veiculos;
DROP POLICY IF EXISTS "go_view_obra_veiculos" ON public.obra_veiculos;

CREATE POLICY "gc_manage_obra_veiculos" ON public.obra_veiculos
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_obra_veiculos" ON public.obra_veiculos
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND obra_id = get_user_obra_id()
  );

-- ─────────────────────────────────────────────────────────────
-- 13. OBRA_FORNECEDORES
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.obra_fornecedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_obra_forn" ON public.obra_fornecedores;
DROP POLICY IF EXISTS "go_view_obra_forn" ON public.obra_fornecedores;

CREATE POLICY "gc_manage_obra_forn" ON public.obra_fornecedores
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_obra_forn" ON public.obra_fornecedores
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND obra_id = get_user_obra_id()
  );

-- ─────────────────────────────────────────────────────────────
-- 14. SCHEDULES / ESCALAS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can view their own schedules" ON public.schedules;
DROP POLICY IF EXISTS "gc_manage_schedules" ON public.schedules;
DROP POLICY IF EXISTS "go_manage_schedules" ON public.schedules;
DROP POLICY IF EXISTS "func_view_own_schedules" ON public.schedules;

CREATE POLICY "gc_manage_schedules" ON public.schedules
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_manage_schedules" ON public.schedules
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND employee_id IN (
      SELECT of.employee_id FROM obra_funcionarios of
      WHERE of.obra_id = get_user_obra_id() AND of.status = true
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND employee_id IN (
      SELECT of.employee_id FROM obra_funcionarios of
      WHERE of.obra_id = get_user_obra_id() AND of.status = true
    )
  );

CREATE POLICY "func_view_own_schedules" ON public.schedules
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 15. ESCALA_PERIODOS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.escala_periodos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_escala_periodos" ON public.escala_periodos;
DROP POLICY IF EXISTS "go_manage_escala_periodos" ON public.escala_periodos;
DROP POLICY IF EXISTS "func_view_own_periodos" ON public.escala_periodos;

CREATE POLICY "gc_manage_escala_periodos" ON public.escala_periodos
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_manage_escala_periodos" ON public.escala_periodos
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND employee_id IN (
      SELECT of.employee_id FROM obra_funcionarios of
      WHERE of.obra_id = get_user_obra_id() AND of.status = true
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'gestor_obra'::app_role
    AND employee_id IN (
      SELECT of.employee_id FROM obra_funcionarios of
      WHERE of.obra_id = get_user_obra_id() AND of.status = true
    )
  );

CREATE POLICY "func_view_own_periodos" ON public.escala_periodos
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 16. MAINTENANCE_RECORDS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_maintenance" ON public.maintenance_records;
DROP POLICY IF EXISTS "go_view_maintenance" ON public.maintenance_records;
DROP POLICY IF EXISTS "func_manage_own_maintenance" ON public.maintenance_records;

CREATE POLICY "gc_manage_maintenance" ON public.maintenance_records
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_maintenance" ON public.maintenance_records
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'gestor_obra'::app_role);

CREATE POLICY "func_manage_own_maintenance" ON public.maintenance_records
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 17. MILEAGE_RECORDS (quilometragem)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.mileage_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can view their own mileage records" ON public.mileage_records;
DROP POLICY IF EXISTS "gc_manage_mileage" ON public.mileage_records;
DROP POLICY IF EXISTS "go_view_mileage" ON public.mileage_records;
DROP POLICY IF EXISTS "func_manage_own_mileage" ON public.mileage_records;

CREATE POLICY "gc_manage_mileage" ON public.mileage_records
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_mileage" ON public.mileage_records
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'gestor_obra'::app_role);

CREATE POLICY "func_manage_own_mileage" ON public.mileage_records
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 18. DAMAGE_REPORTS (avarias)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_damage" ON public.damage_reports;
DROP POLICY IF EXISTS "go_view_damage" ON public.damage_reports;
DROP POLICY IF EXISTS "func_manage_own_damage" ON public.damage_reports;

CREATE POLICY "gc_manage_damage" ON public.damage_reports
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_damage" ON public.damage_reports
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'gestor_obra'::app_role);

CREATE POLICY "func_manage_own_damage" ON public.damage_reports
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 19. WASH_RECORDS (lavagens)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.wash_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_wash" ON public.wash_records;
DROP POLICY IF EXISTS "go_view_wash" ON public.wash_records;
DROP POLICY IF EXISTS "func_manage_own_wash" ON public.wash_records;

CREATE POLICY "gc_manage_wash" ON public.wash_records
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_wash" ON public.wash_records
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'gestor_obra'::app_role);

CREATE POLICY "func_manage_own_wash" ON public.wash_records
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 20. INSPECTION_CHECKLISTS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.inspection_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_checklists" ON public.inspection_checklists;
DROP POLICY IF EXISTS "go_view_checklists" ON public.inspection_checklists;
DROP POLICY IF EXISTS "func_manage_own_checklists" ON public.inspection_checklists;

CREATE POLICY "gc_manage_checklists" ON public.inspection_checklists
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_checklists" ON public.inspection_checklists
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'gestor_obra'::app_role);

CREATE POLICY "func_manage_own_checklists" ON public.inspection_checklists
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 21. INSPECTION_ITEMS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_inspection_items" ON public.inspection_items;
DROP POLICY IF EXISTS "auth_manage_own_items" ON public.inspection_items;

CREATE POLICY "gc_manage_inspection_items" ON public.inspection_items
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "auth_manage_own_items" ON public.inspection_items
  FOR ALL TO authenticated
  USING (
    checklist_id IN (
      SELECT id FROM inspection_checklists
      WHERE vehicle_id IN (
        SELECT id FROM vehicles
        WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
      )
    )
    OR get_user_role(auth.uid()) != 'funcionario'::app_role
  )
  WITH CHECK (
    checklist_id IN (
      SELECT id FROM inspection_checklists
      WHERE vehicle_id IN (
        SELECT id FROM vehicles
        WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
      )
    )
    OR get_user_role(auth.uid()) != 'funcionario'::app_role
  );

-- ─────────────────────────────────────────────────────────────
-- 22. VEHICLE_DOCUMENTS, VEHICLE_KM_CYCLES, VEHICLE_ACCESSORIES
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_veh_docs" ON public.vehicle_documents;
DROP POLICY IF EXISTS "manager_view_veh_docs" ON public.vehicle_documents;

CREATE POLICY "gc_manage_veh_docs" ON public.vehicle_documents
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "manager_view_veh_docs" ON public.vehicle_documents
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) != 'funcionario'::app_role);

ALTER TABLE public.vehicle_km_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_km_cycles" ON public.vehicle_km_cycles;
DROP POLICY IF EXISTS "auth_view_km_cycles" ON public.vehicle_km_cycles;

CREATE POLICY "gc_manage_km_cycles" ON public.vehicle_km_cycles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "auth_view_km_cycles" ON public.vehicle_km_cycles
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.vehicle_accessories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_accessories" ON public.vehicle_accessories;
DROP POLICY IF EXISTS "auth_view_accessories" ON public.vehicle_accessories;

CREATE POLICY "gc_manage_accessories" ON public.vehicle_accessories
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "auth_view_accessories" ON public.vehicle_accessories
  FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────
-- 23. TIRE_SERVICES, TRAFFIC_FINES, SMOKE_TESTS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.tire_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_tires" ON public.tire_services;
DROP POLICY IF EXISTS "auth_view_tires" ON public.tire_services;

CREATE POLICY "gc_manage_tires" ON public.tire_services
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "auth_view_tires" ON public.tire_services
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.traffic_fines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_fines" ON public.traffic_fines;
DROP POLICY IF EXISTS "auth_view_fines" ON public.traffic_fines;
DROP POLICY IF EXISTS "func_view_own_fines" ON public.traffic_fines;

CREATE POLICY "gc_manage_fines" ON public.traffic_fines
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_fines" ON public.traffic_fines
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) != 'funcionario'::app_role);

CREATE POLICY "func_view_own_fines" ON public.traffic_fines
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  );

ALTER TABLE public.smoke_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_smoke" ON public.smoke_tests;
DROP POLICY IF EXISTS "manager_view_smoke" ON public.smoke_tests;

CREATE POLICY "gc_manage_smoke" ON public.smoke_tests
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "manager_view_smoke" ON public.smoke_tests
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) != 'funcionario'::app_role);

-- ─────────────────────────────────────────────────────────────
-- 24. DRIVER_SCORES
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.driver_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_scores" ON public.driver_scores;
DROP POLICY IF EXISTS "go_view_scores" ON public.driver_scores;
DROP POLICY IF EXISTS "func_view_own_score" ON public.driver_scores;

CREATE POLICY "gc_manage_scores" ON public.driver_scores
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "go_view_scores" ON public.driver_scores
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) != 'funcionario'::app_role);

CREATE POLICY "func_view_own_score" ON public.driver_scores
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) = 'funcionario'::app_role
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 25. HEAVY_VEHICLE_INSPECTIONS E ITEMS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.heavy_vehicle_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_hv_inspect" ON public.heavy_vehicle_inspections;
DROP POLICY IF EXISTS "auth_manage_hv_inspect" ON public.heavy_vehicle_inspections;

CREATE POLICY "gc_manage_hv_inspect" ON public.heavy_vehicle_inspections
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "auth_manage_hv_inspect" ON public.heavy_vehicle_inspections
  FOR ALL TO authenticated
  USING (
    get_user_role(auth.uid()) != 'funcionario'::app_role
    OR vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) != 'funcionario'::app_role
    OR vehicle_id IN (
      SELECT id FROM vehicles
      WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
  );

ALTER TABLE public.heavy_vehicle_inspection_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_hv_items" ON public.heavy_vehicle_inspection_items;
DROP POLICY IF EXISTS "auth_manage_hv_items" ON public.heavy_vehicle_inspection_items;

CREATE POLICY "gc_manage_hv_items" ON public.heavy_vehicle_inspection_items
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

CREATE POLICY "auth_manage_hv_items" ON public.heavy_vehicle_inspection_items
  FOR ALL TO authenticated
  USING (
    inspection_id IN (
      SELECT id FROM heavy_vehicle_inspections
      WHERE vehicle_id IN (
        SELECT id FROM vehicles
        WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
      )
    )
    OR get_user_role(auth.uid()) != 'funcionario'::app_role
  )
  WITH CHECK (
    inspection_id IN (
      SELECT id FROM heavy_vehicle_inspections
      WHERE vehicle_id IN (
        SELECT id FROM vehicles
        WHERE responsavel_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
      )
    )
    OR get_user_role(auth.uid()) != 'funcionario'::app_role
  );

-- ─────────────────────────────────────────────────────────────
-- 26. SYSTEM_LOGS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gc_manage_logs" ON public.system_logs;
CREATE POLICY "gc_manage_logs" ON public.system_logs
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]))
  WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['gestor_contrato','admin','gestor_frota']::app_role[]));

-- ─────────────────────────────────────────────────────────────
-- 27. GARANTIR GRANTS FUTUROS TAMBÉM
-- ─────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 28. VERIFICAÇÃO FINAL
-- ─────────────────────────────────────────────────────────────
SELECT 'Roles após migração:' as info;
SELECT role, COUNT(*) FROM public.user_roles GROUP BY role;

SELECT 'Permissões do usuário atual:' as info;
SELECT get_user_role(auth.uid()) as meu_role;

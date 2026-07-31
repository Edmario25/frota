-- =====================================================================
-- RLS: Funcionário responsável pelo veículo pode executar operações
--      (lavagem, combustível, manutenção, acessórios, avarias, checklist,
--       borracharia, fumaça, multas)
-- Condição comum: employee.user_id = auth.uid() E vehicle.responsavel_id = employee.id
-- =====================================================================

-- Helper: verifica se o veículo pertence ao funcionário logado
-- Usamos inline EXISTS para não depender de novas funções

-- ─── maintenance_records: funcionário pode UPDATE status ─────────────
DROP POLICY IF EXISTS "maintenance_funcionario_update" ON public.maintenance_records;
CREATE POLICY "maintenance_funcionario_update" ON public.maintenance_records
  FOR UPDATE TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = maintenance_records.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = maintenance_records.vehicle_id
    )
  );

-- ─── wash_records ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "wash_funcionario_own_vehicle" ON public.wash_records;
CREATE POLICY "wash_funcionario_own_vehicle" ON public.wash_records
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = wash_records.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = wash_records.vehicle_id
    )
  );

-- ─── vehicle_fuel_logs ───────────────────────────────────────────────
DROP POLICY IF EXISTS "fuel_logs_funcionario_own_vehicle" ON public.vehicle_fuel_logs;
CREATE POLICY "fuel_logs_funcionario_own_vehicle" ON public.vehicle_fuel_logs
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = vehicle_fuel_logs.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = vehicle_fuel_logs.vehicle_id
    )
  );

-- ─── vehicle_accessories ─────────────────────────────────────────────
DROP POLICY IF EXISTS "accessories_funcionario_own_vehicle" ON public.vehicle_accessories;
CREATE POLICY "accessories_funcionario_own_vehicle" ON public.vehicle_accessories
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = vehicle_accessories.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = vehicle_accessories.vehicle_id
    )
  );

-- ─── damage_reports ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "damage_funcionario_own_vehicle" ON public.damage_reports;
CREATE POLICY "damage_funcionario_own_vehicle" ON public.damage_reports
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = damage_reports.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = damage_reports.vehicle_id
    )
  );

-- ─── inspection_checklists ───────────────────────────────────────────
DROP POLICY IF EXISTS "checklist_funcionario_own_vehicle" ON public.inspection_checklists;
CREATE POLICY "checklist_funcionario_own_vehicle" ON public.inspection_checklists
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = inspection_checklists.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = inspection_checklists.vehicle_id
    )
  );

-- ─── tire_services ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "tire_services_funcionario_own_vehicle" ON public.tire_services;
CREATE POLICY "tire_services_funcionario_own_vehicle" ON public.tire_services
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = tire_services.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = tire_services.vehicle_id
    )
  );

-- ─── smoke_tests ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "smoke_tests_funcionario_own_vehicle" ON public.smoke_tests;
CREATE POLICY "smoke_tests_funcionario_own_vehicle" ON public.smoke_tests
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = smoke_tests.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = smoke_tests.vehicle_id
    )
  );

-- ─── traffic_fines ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "traffic_fines_funcionario_own_vehicle" ON public.traffic_fines;
CREATE POLICY "traffic_fines_funcionario_own_vehicle" ON public.traffic_fines
  FOR ALL TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = traffic_fines.vehicle_id
    )
  )
  WITH CHECK (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid() AND v.id = traffic_fines.vehicle_id
    )
  );

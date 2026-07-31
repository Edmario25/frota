-- =====================================================================
-- RLS: Funcionário pode ver manutenções do veículo que lhe foi atribuído
--
-- A policy "maintenance_funcionario_select" já existe no banco, mas usa
-- is_vehicle_in_same_obra() — filtro por obra, não por responsável direto.
-- Substituímos pela versão correta que verifica vehicles.responsavel_id.
--
-- "maintenance_gestor_obra_all" já existe e cobre SELECT/INSERT/UPDATE/DELETE
-- para gestor_obra, portanto não é necessária nenhuma policy adicional de UPDATE.
-- =====================================================================

-- Remove a policy antiga (usa obra-filter, não responsável direto)
DROP POLICY IF EXISTS "maintenance_funcionario_select" ON public.maintenance_records;

-- Nova policy: funcionário vê manutenções do veículo atribuído a ele
CREATE POLICY "maintenance_funcionario_select" ON public.maintenance_records
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1
      FROM public.vehicles v
      JOIN public.employees e ON e.id = v.responsavel_id
      WHERE e.user_id = auth.uid()
        AND v.id = maintenance_records.vehicle_id
    )
  );

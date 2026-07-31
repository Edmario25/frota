-- Atualizar política de escala_tipos para incluir gestor_obra
DROP POLICY IF EXISTS "Admins and gestors can manage escala_tipos" ON public.escala_tipos;

DROP POLICY IF EXISTS "Admins and gestors can manage escala_tipos" ON public.escala_tipos;
DROP POLICY IF EXISTS "Admins and gestors can manage escala_tipos" ON public.escala_tipos;
CREATE POLICY "Admins and gestors can manage escala_tipos"
ON public.escala_tipos
FOR ALL
USING (
  get_user_role() IN ('admin', 'gestor_frota', 'gestor_obra')
)
WITH CHECK (
  get_user_role() IN ('admin', 'gestor_frota', 'gestor_obra')
);

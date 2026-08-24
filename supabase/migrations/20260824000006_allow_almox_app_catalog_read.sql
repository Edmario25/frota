-- Permite que o almoxarife leia os dados descritivos dos produtos exibidos
-- no saldo da obra, mantendo o acesso restrito ao App Almoxarifado.
DROP POLICY IF EXISTS materiais_catalogo_select_almoxarifado_app
  ON public.materiais_catalogo;

CREATE POLICY materiais_catalogo_select_almoxarifado_app
  ON public.materiais_catalogo
  FOR SELECT
  TO authenticated
  USING (public.has_employee_app_access('almoxarifado'));

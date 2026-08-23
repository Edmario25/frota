-- Torna o apontamento de campo explícito, auditável e restrito a cargos
-- com acesso ao módulo de efetivo.

ALTER TABLE public.efetivo_ponto
  ADD COLUMN IF NOT EXISTS turno text,
  ADD COLUMN IF NOT EXISTS atividade text,
  ADD COLUMN IF NOT EXISTS observacao text;

CREATE TABLE IF NOT EXISTS public.efetivo_ponto_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  efetivo_ponto_id uuid,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  operacao text NOT NULL CHECK (operacao IN ('UPDATE', 'DELETE')),
  dados_anteriores jsonb NOT NULL,
  dados_novos jsonb,
  alterado_por uuid REFERENCES auth.users(id),
  alterado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.efetivo_ponto_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efetivo_ponto_auditoria_select_scoped
  ON public.efetivo_ponto_auditoria;
CREATE POLICY efetivo_ponto_auditoria_select_scoped
  ON public.efetivo_ponto_auditoria FOR SELECT TO authenticated
  USING (public.can_manage_obra_data(obra_id));

CREATE OR REPLACE FUNCTION public.audit_efetivo_ponto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  INSERT INTO public.efetivo_ponto_auditoria (
    efetivo_ponto_id, obra_id, operacao, dados_anteriores, dados_novos, alterado_por
  ) VALUES (
    OLD.id,
    OLD.obra_id,
    TG_OP,
    to_jsonb(OLD),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid()
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_efetivo_ponto() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_efetivo_ponto() FROM anon;

DROP TRIGGER IF EXISTS trg_audit_efetivo_ponto ON public.efetivo_ponto;
CREATE TRIGGER trg_audit_efetivo_ponto
  AFTER UPDATE OR DELETE ON public.efetivo_ponto
  FOR EACH ROW EXECUTE FUNCTION public.audit_efetivo_ponto();

CREATE OR REPLACE FUNCTION public.can_submit_field_time(target_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    public.can_manage_obra_data(target_obra_id)
    OR EXISTS (
      SELECT 1
      FROM public.employees employee
      JOIN public.cargos cargo ON cargo.id = employee.cargo_id
      WHERE employee.user_id = auth.uid()
        AND employee.status = 'ativo'
        AND cargo.acesso_efetivo = true
        AND public.is_employee_assigned_to_obra(employee.id, target_obra_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_submit_field_time(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_submit_field_time(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_submit_field_time(uuid) TO authenticated;

DROP POLICY IF EXISTS efetivo_ponto_insert_campo_scoped ON public.efetivo_ponto;
CREATE POLICY efetivo_ponto_insert_campo_scoped
  ON public.efetivo_ponto FOR INSERT TO authenticated
  WITH CHECK (
    fonte = 'campo'
    AND registrado_por = auth.uid()
    AND public.can_submit_field_time(obra_id)
    AND public.is_employee_assigned_to_obra(employee_id, obra_id)
  );

DROP POLICY IF EXISTS efetivo_ponto_update_campo_scoped ON public.efetivo_ponto;
CREATE POLICY efetivo_ponto_update_campo_scoped
  ON public.efetivo_ponto FOR UPDATE TO authenticated
  USING (
    fonte = 'campo'
    AND registrado_por = auth.uid()
    AND public.can_submit_field_time(obra_id)
  )
  WITH CHECK (
    fonte = 'campo'
    AND registrado_por = auth.uid()
    AND public.can_submit_field_time(obra_id)
    AND public.is_employee_assigned_to_obra(employee_id, obra_id)
  );

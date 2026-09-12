-- Continuação da 20260911000011 (dividida para caber no SQL Editor).
-- Vínculo de obra acompanha o perfil; user_roles vira histórico.

-- ─── 7. Vincular obra na tela de usuários concede o perfil daquela obra ─────
-- Vale para perfis por obra (gestor de obra, técnico SMS) que a pessoa já tem,
-- ou gestor de obra pelo cargo. Desvincular revoga só o que foi automático.
CREATE OR REPLACE FUNCTION public.access_acompanhar_vinculo_obra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE
  v_user uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT user_id INTO v_user FROM public.employees WHERE id=NEW.employee_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.employee_access_profiles(user_id,profile_id,scope_type,scope_id,justificativa)
      SELECT DISTINCT v_user, p.profile_id, 'obra', NEW.obra_id, 'Automático: vínculo com a obra'
      FROM (
        SELECT eap.profile_id FROM public.employee_access_profiles eap
        JOIN public.access_profiles ap ON ap.id=eap.profile_id AND ap.papel_equivalente IN ('gestor_obra','tecnico_sms')
        WHERE eap.user_id=v_user AND eap.scope_type='obra'
          AND (eap.revogado_em IS NULL OR eap.justificativa IN ('Automático: vínculo com a obra','Migração automática: obra vinculada ao funcionário'))
        UNION
        SELECT ap.id FROM public.access_profiles ap
        WHERE ap.nome='Gestor de Obra' AND EXISTS(
          SELECT 1 FROM public.employees e JOIN public.cargos c ON c.id=e.cargo_id
          WHERE e.id=NEW.employee_id AND c.nivel_acesso::text='gestor_obra')
      ) p
      ON CONFLICT (user_id,profile_id,scope_type,(COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)))
      DO UPDATE SET revogado_em=NULL, revogado_por=NULL
      WHERE public.employee_access_profiles.justificativa IN ('Automático: vínculo com a obra','Migração automática: obra vinculada ao funcionário');
    END IF;
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_user FROM public.employees WHERE id=OLD.employee_id;
  IF v_user IS NOT NULL THEN
    UPDATE public.employee_access_profiles SET revogado_em=now(), revogado_por=auth.uid()
    WHERE user_id=v_user AND scope_type='obra' AND scope_id=OLD.obra_id AND revogado_em IS NULL
      AND justificativa IN ('Automático: vínculo com a obra','Migração automática: obra vinculada ao funcionário');
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_access_vinculo_obra ON public.employee_obra_assignments;
CREATE TRIGGER trg_access_vinculo_obra
  AFTER INSERT OR DELETE ON public.employee_obra_assignments
  FOR EACH ROW EXECUTE FUNCTION public.access_acompanhar_vinculo_obra();

REVOKE ALL ON FUNCTION public.access_acompanhar_vinculo_obra() FROM PUBLIC, anon, authenticated;

-- ─── 8. Tabela de papéis antiga: só histórico ───────────────────────────────
COMMENT ON TABLE public.user_roles IS
  'OBSOLETA desde 20260911000010: o acesso vem de employee_access_profiles (Controle de Acesso). Mantida só como histórico.';
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;

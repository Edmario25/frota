-- Ajustes da reorganização do Controle de Acesso.

-- 1. Revogar deixa a linha como histórico; conceder de novo cria outra linha.
--    Antes, a linha revogada ocupava a chave única e impedia a nova concessão.
DROP INDEX IF EXISTS public.employee_access_profiles_unique;
CREATE UNIQUE INDEX IF NOT EXISTS employee_access_profiles_ativo_unique
  ON public.employee_access_profiles(user_id,profile_id,scope_type,COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revogado_em IS NULL;

-- Vínculo de obra: com o índice parcial, basta inserir de novo (a revogada fica no histórico)
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
      ON CONFLICT DO NOTHING;
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

REVOKE ALL ON FUNCTION public.access_acompanhar_vinculo_obra() FROM PUBLIC, anon, authenticated;

-- 2. Setores são cadastrados na página "Departamentos e Setores", por quem edita a estrutura
DROP POLICY IF EXISTS setores_estrutura_write ON public.departamento_setores;
CREATE POLICY setores_estrutura_write ON public.departamento_setores FOR ALL TO authenticated
  USING (public.pode_geral('estrutura.editar'))
  WITH CHECK (public.pode_geral('estrutura.editar'));

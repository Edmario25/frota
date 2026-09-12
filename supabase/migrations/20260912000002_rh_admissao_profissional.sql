-- Núcleo de RH alinhado ao fluxo cadastral, contratual e de lotação.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS matricula text;

CREATE UNIQUE INDEX IF NOT EXISTS employees_matricula_unique
  ON public.employees (upper(matricula)) WHERE matricula IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.employee_matricula_seq START 1001;

CREATE OR REPLACE FUNCTION public.gerar_matricula_colaborador()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NULLIF(trim(NEW.matricula), '') IS NULL THEN
    NEW.matricula := 'COL-' || lpad(nextval('public.employee_matricula_seq')::text, 6, '0');
  ELSE
    NEW.matricula := upper(trim(NEW.matricula));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gerar_matricula_colaborador ON public.employees;
CREATE TRIGGER trg_gerar_matricula_colaborador
BEFORE INSERT OR UPDATE OF matricula ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.gerar_matricula_colaborador();

UPDATE public.employees SET matricula=NULL WHERE matricula IS NULL;

COMMENT ON COLUMN public.employees.matricula IS 'Identificador funcional único, independente do login e do CPF.';

-- Preserva a movimentação funcional ao encerrar a lotação ativa de uma obra.
CREATE OR REPLACE FUNCTION public.historico_lotacao_funcionario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF OLD.status=true AND NEW.status=false THEN
    INSERT INTO public.employee_obra_assignment_history(
      employee_id,obra_id,assigned_at,assigned_by,ended_at,ended_by,reason
    ) VALUES(
      OLD.employee_id,OLD.obra_id,OLD.created_at,NULL,now(),auth.uid(),'Alteração de lotação pelo cadastro de RH'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_historico_lotacao_funcionario ON public.obra_funcionarios;
CREATE TRIGGER trg_historico_lotacao_funcionario
AFTER UPDATE OF status ON public.obra_funcionarios
FOR EACH ROW EXECUTE FUNCTION public.historico_lotacao_funcionario();

REVOKE ALL ON FUNCTION public.gerar_matricula_colaborador(), public.historico_lotacao_funcionario() FROM PUBLIC,anon,authenticated;

-- Cargo é catálogo organizacional. O campo legado permanece somente para
-- compatibilidade e não representa mais autorização nem perfil sugerido.
UPDATE public.cargos SET nivel_acesso='funcionario' WHERE nivel_acesso IS DISTINCT FROM 'funcionario';
COMMENT ON COLUMN public.cargos.nivel_acesso IS 'Campo legado sem efeito de autorização. Acesso é administrado em Controle de Acesso.';

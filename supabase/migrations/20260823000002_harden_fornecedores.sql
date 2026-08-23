-- Validação fiscal, histórico de vínculos e políticas coerentes de fornecedores.

ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS acesso_fornecedores boolean NOT NULL DEFAULT false;
UPDATE public.cargos
SET acesso_fornecedores = true
WHERE nivel_acesso IN ('gestor_contrato', 'gestor_obra');

CREATE OR REPLACE FUNCTION public.can_access_fornecedores()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.get_user_role(auth.uid()) = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.employees employee
      JOIN public.cargos cargo ON cargo.id = employee.cargo_id
      WHERE employee.user_id = auth.uid()
        AND cargo.acesso_fornecedores = true
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_fornecedores() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_fornecedores() FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_fornecedores() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_valid_cpf(value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  doc text := regexp_replace(COALESCE(value, ''), '\D', '', 'g');
  sum_value integer;
  digit_one integer;
  digit_two integer;
  i integer;
BEGIN
  IF length(doc) <> 11 OR doc ~ '^(\d)\1+$' THEN RETURN false; END IF;
  sum_value := 0;
  FOR i IN 1..9 LOOP sum_value := sum_value + substring(doc, i, 1)::integer * (11 - i); END LOOP;
  digit_one := (sum_value * 10) % 11;
  IF digit_one = 10 THEN digit_one := 0; END IF;
  sum_value := 0;
  FOR i IN 1..10 LOOP sum_value := sum_value + substring(doc, i, 1)::integer * (12 - i); END LOOP;
  digit_two := (sum_value * 10) % 11;
  IF digit_two = 10 THEN digit_two := 0; END IF;
  RETURN digit_one = substring(doc, 10, 1)::integer
    AND digit_two = substring(doc, 11, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_cnpj(value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  doc text := regexp_replace(COALESCE(value, ''), '\D', '', 'g');
  weights_one integer[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  weights_two integer[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  sum_value integer := 0;
  digit_one integer;
  digit_two integer;
  i integer;
BEGIN
  IF length(doc) <> 14 OR doc ~ '^(\d)\1+$' THEN RETURN false; END IF;
  FOR i IN 1..12 LOOP sum_value := sum_value + substring(doc, i, 1)::integer * weights_one[i]; END LOOP;
  digit_one := CASE WHEN sum_value % 11 < 2 THEN 0 ELSE 11 - (sum_value % 11) END;
  sum_value := 0;
  FOR i IN 1..13 LOOP sum_value := sum_value + substring(doc, i, 1)::integer * weights_two[i]; END LOOP;
  digit_two := CASE WHEN sum_value % 11 < 2 THEN 0 ELSE 11 - (sum_value % 11) END;
  RETURN digit_one = substring(doc, 13, 1)::integer
    AND digit_two = substring(doc, 14, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_fornecedor_document()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.nome := btrim(NEW.nome);
  NEW.cnpj := NULLIF(regexp_replace(COALESCE(NEW.cnpj, ''), '\D', '', 'g'), '');
  NEW.cpf := NULLIF(regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g'), '');
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');

  IF (NEW.cnpj IS NULL) = (NEW.cpf IS NULL) THEN
    RAISE EXCEPTION 'Informe exatamente um documento: CNPJ ou CPF';
  END IF;
  IF NEW.cnpj IS NOT NULL AND NOT public.is_valid_cnpj(NEW.cnpj) THEN
    RAISE EXCEPTION 'CNPJ inválido';
  END IF;
  IF NEW.cpf IS NOT NULL AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'CPF inválido';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fornecedores fornecedor
    WHERE fornecedor.id <> NEW.id
      AND (
        (NEW.cnpj IS NOT NULL AND regexp_replace(COALESCE(fornecedor.cnpj, ''), '\D', '', 'g') = NEW.cnpj)
        OR (NEW.cpf IS NOT NULL AND regexp_replace(COALESCE(fornecedor.cpf, ''), '\D', '', 'g') = NEW.cpf)
      )
  ) THEN
    RAISE EXCEPTION 'Já existe um fornecedor cadastrado com este documento';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_fornecedor_document ON public.fornecedores;
CREATE TRIGGER trg_validate_fornecedor_document
  BEFORE INSERT OR UPDATE OF nome, cnpj, cpf, email ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.validate_fornecedor_document();

-- Mantém os cadastros legados para saneamento gradual, mas valida toda nova
-- inclusão ou alteração dos campos fiscais através do trigger acima.

ALTER TABLE public.obra_fornecedores
  DROP CONSTRAINT IF EXISTS obra_fornecedores_obra_id_fornecedor_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS obra_fornecedores_um_vinculo_ativo_idx
  ON public.obra_fornecedores (obra_id, fornecedor_id)
  WHERE status = true;

DROP POLICY IF EXISTS "All authenticated users can view fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Admins and gestors can manage fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS forn_select ON public.fornecedores;
DROP POLICY IF EXISTS forn_write ON public.fornecedores;
DROP POLICY IF EXISTS fornecedores_select_managers ON public.fornecedores;
DROP POLICY IF EXISTS fornecedores_select_operational ON public.fornecedores;
DROP POLICY IF EXISTS fornecedores_manage_operational ON public.fornecedores;

CREATE POLICY fornecedores_select_operational
  ON public.fornecedores FOR SELECT TO authenticated
  USING (public.can_access_fornecedores());
CREATE POLICY fornecedores_manage_operational
  ON public.fornecedores FOR ALL TO authenticated
  USING (public.can_access_fornecedores())
  WITH CHECK (public.can_access_fornecedores());

DROP POLICY IF EXISTS "All authenticated users can view obra_fornecedores" ON public.obra_fornecedores;
DROP POLICY IF EXISTS "Admins and gestors can manage obra_fornecedores" ON public.obra_fornecedores;
DROP POLICY IF EXISTS obra_fornecedores_select_scoped ON public.obra_fornecedores;
DROP POLICY IF EXISTS obra_fornecedores_manage_scoped ON public.obra_fornecedores;

CREATE POLICY obra_fornecedores_select_scoped
  ON public.obra_fornecedores FOR SELECT TO authenticated
  USING (public.can_access_fornecedores() AND public.can_manage_obra_data(obra_id));
CREATE POLICY obra_fornecedores_manage_scoped
  ON public.obra_fornecedores FOR ALL TO authenticated
  USING (public.can_access_fornecedores() AND public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_access_fornecedores() AND public.can_manage_obra_data(obra_id));

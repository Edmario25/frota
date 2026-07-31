-- =====================================================================
-- FUNDO FIXO — caixa de despesas emergenciais vinculado à obra
-- =====================================================================

-- 1. Permissão de acesso ao fundo fixo no cargo
ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS acesso_fundo_fixo boolean NOT NULL DEFAULT false;

-- 2. Tabela principal do fundo
CREATE TABLE IF NOT EXISTS public.fundo_fixo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome             text NOT NULL DEFAULT 'Fundo Fixo',
  saldo_inicial    numeric(12,2) NOT NULL DEFAULT 0,
  saldo_atual      numeric(12,2) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'ativo'
                     CHECK (status IN ('ativo', 'inativo', 'encerrado')),
  observacoes      text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fundo_fixo_obra ON public.fundo_fixo(obra_id);

-- 3. Lançamentos (entradas e saídas)
CREATE TABLE IF NOT EXISTS public.fundo_fixo_lancamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundo_fixo_id    uuid NOT NULL REFERENCES public.fundo_fixo(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  descricao        text NOT NULL,
  valor            numeric(12,2) NOT NULL CHECK (valor > 0),
  categoria        text DEFAULT 'outros'
                     CHECK (categoria IN (
                       'alimentacao','transporte','material','equipamento',
                       'hospedagem','servico','outros'
                     )),
  data_lancamento  date NOT NULL DEFAULT CURRENT_DATE,
  recibo_url       text,
  nf_url           text,
  observacoes      text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fundo_lanc_fundo ON public.fundo_fixo_lancamentos(fundo_fixo_id);
CREATE INDEX IF NOT EXISTS idx_fundo_lanc_data  ON public.fundo_fixo_lancamentos(data_lancamento);

-- 4. Trigger: atualiza saldo_atual após cada lançamento
CREATE OR REPLACE FUNCTION public.recalcular_saldo_fundo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fundo_id uuid;
  v_saldo_inicial numeric;
  v_entradas numeric;
  v_saidas numeric;
BEGIN
  -- Determinar o fundo_fixo_id afetado
  IF TG_OP = 'DELETE' THEN
    v_fundo_id := OLD.fundo_fixo_id;
  ELSE
    v_fundo_id := NEW.fundo_fixo_id;
  END IF;

  SELECT saldo_inicial INTO v_saldo_inicial
  FROM public.fundo_fixo WHERE id = v_fundo_id;

  SELECT COALESCE(SUM(valor), 0) INTO v_entradas
  FROM public.fundo_fixo_lancamentos
  WHERE fundo_fixo_id = v_fundo_id AND tipo = 'entrada';

  SELECT COALESCE(SUM(valor), 0) INTO v_saidas
  FROM public.fundo_fixo_lancamentos
  WHERE fundo_fixo_id = v_fundo_id AND tipo = 'saida';

  UPDATE public.fundo_fixo
  SET saldo_atual = v_saldo_inicial + v_entradas - v_saidas,
      updated_at  = now()
  WHERE id = v_fundo_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalcular_saldo ON public.fundo_fixo_lancamentos;
CREATE TRIGGER trg_recalcular_saldo
  AFTER INSERT OR UPDATE OR DELETE ON public.fundo_fixo_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_saldo_fundo();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_fundo_fixo_updated_at ON public.fundo_fixo;
CREATE TRIGGER trg_fundo_fixo_updated_at
  BEFORE UPDATE ON public.fundo_fixo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_fundo_lanc_updated_at ON public.fundo_fixo_lancamentos;
CREATE TRIGGER trg_fundo_lanc_updated_at
  BEFORE UPDATE ON public.fundo_fixo_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS
ALTER TABLE public.fundo_fixo             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundo_fixo_lancamentos ENABLE ROW LEVEL SECURITY;

-- fundo_fixo: gestor_contrato e gestor_frota — tudo
CREATE POLICY "fundo_fixo_admin_all" ON public.fundo_fixo
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

-- fundo_fixo: gestor_obra — vê e gerencia o fundo da sua obra
CREATE POLICY "fundo_fixo_gestor_obra_all" ON public.fundo_fixo
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND obra_id = public.get_user_obra_id()
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND obra_id = public.get_user_obra_id()
  );

-- fundo_fixo: funcionário com cargo que tem acesso — apenas leitura
CREATE POLICY "fundo_fixo_funcionario_select" ON public.fundo_fixo
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND obra_id = public.get_user_obra_id()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.cargos c ON c.id = e.cargo_id
      WHERE e.user_id = auth.uid()
        AND c.acesso_fundo_fixo = true
    )
  );

-- lancamentos: admin tudo
CREATE POLICY "fundo_lanc_admin_all" ON public.fundo_fixo_lancamentos
  FOR ALL TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());

-- lancamentos: gestor_obra — CRUD nos lançamentos do seu fundo
CREATE POLICY "fundo_lanc_gestor_obra_all" ON public.fundo_fixo_lancamentos
  FOR ALL TO authenticated
  USING (
    public.is_gestor_obra()
    AND EXISTS (
      SELECT 1 FROM public.fundo_fixo ff
      WHERE ff.id = fundo_fixo_lancamentos.fundo_fixo_id
        AND ff.obra_id = public.get_user_obra_id()
    )
  )
  WITH CHECK (
    public.is_gestor_obra()
    AND EXISTS (
      SELECT 1 FROM public.fundo_fixo ff
      WHERE ff.id = fundo_fixo_lancamentos.fundo_fixo_id
        AND ff.obra_id = public.get_user_obra_id()
    )
  );

-- lancamentos: funcionário com acesso ao fundo — pode inserir saídas e ver todos
CREATE POLICY "fundo_lanc_funcionario_select" ON public.fundo_fixo_lancamentos
  FOR SELECT TO authenticated
  USING (
    public.is_funcionario()
    AND EXISTS (
      SELECT 1 FROM public.fundo_fixo ff
      JOIN public.employees e ON true
      JOIN public.cargos c ON c.id = e.cargo_id
      WHERE ff.id = fundo_fixo_lancamentos.fundo_fixo_id
        AND ff.obra_id = public.get_user_obra_id()
        AND e.user_id = auth.uid()
        AND c.acesso_fundo_fixo = true
    )
  );

CREATE POLICY "fundo_lanc_funcionario_insert" ON public.fundo_fixo_lancamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_funcionario()
    AND tipo = 'saida'
    AND EXISTS (
      SELECT 1 FROM public.fundo_fixo ff
      JOIN public.employees e ON true
      JOIN public.cargos c ON c.id = e.cargo_id
      WHERE ff.id = fundo_fixo_lancamentos.fundo_fixo_id
        AND ff.obra_id = public.get_user_obra_id()
        AND e.user_id = auth.uid()
        AND c.acesso_fundo_fixo = true
    )
  );

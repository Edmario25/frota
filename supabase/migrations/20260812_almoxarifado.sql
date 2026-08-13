-- ============================================================
-- Fase 3 — Almoxarifado e Controle de Materiais
-- ============================================================

-- ─── Catálogo de Materiais ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.materiais_catalogo (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text        NOT NULL,
  descricao       text,
  unidade         text        NOT NULL DEFAULT 'un',
  categoria       text,
  codigo_interno  text,
  ativo           boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS materiais_catalogo_nome_idx ON public.materiais_catalogo (nome);
CREATE INDEX IF NOT EXISTS materiais_catalogo_cat_idx  ON public.materiais_catalogo (categoria);

-- ─── Estoque por Obra ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almoxarifado_estoque (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  material_id      uuid        NOT NULL REFERENCES public.materiais_catalogo(id) ON DELETE CASCADE,
  quantidade       numeric(14,3) NOT NULL DEFAULT 0,
  quantidade_minima numeric(14,3) NOT NULL DEFAULT 0,
  localizacao      text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, material_id)
);

CREATE INDEX IF NOT EXISTS almox_estoque_obra_idx     ON public.almoxarifado_estoque (obra_id);
CREATE INDEX IF NOT EXISTS almox_estoque_material_idx ON public.almoxarifado_estoque (material_id);

-- ─── Movimentações ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almoxarifado_movimentos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  material_id     uuid        NOT NULL REFERENCES public.materiais_catalogo(id),
  tipo            text        NOT NULL CHECK (tipo IN ('entrada','saida','ajuste','transferencia')),
  quantidade      numeric(14,3) NOT NULL,
  frente          text,
  fornecedor      text,
  nota_fiscal     text,
  observacoes     text,
  registrado_por  uuid        REFERENCES auth.users(id),
  data_movimento  date        NOT NULL DEFAULT current_date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS almox_mov_obra_idx    ON public.almoxarifado_movimentos (obra_id, data_movimento DESC);
CREATE INDEX IF NOT EXISTS almox_mov_mat_idx     ON public.almoxarifado_movimentos (material_id);

-- ─── Trigger: atualiza estoque ao registrar movimento ────────
CREATE OR REPLACE FUNCTION public.fn_update_estoque_on_movimento()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  delta numeric;
BEGIN
  -- Calcular delta de quantidade
  delta := CASE NEW.tipo
    WHEN 'entrada'      THEN  NEW.quantidade
    WHEN 'saida'        THEN -NEW.quantidade
    WHEN 'ajuste'       THEN  NEW.quantidade   -- delta assinado
    WHEN 'transferencia'THEN -NEW.quantidade   -- debita da obra de origem
    ELSE 0
  END;

  -- Garante linha de estoque existe
  INSERT INTO public.almoxarifado_estoque (obra_id, material_id, quantidade)
  VALUES (NEW.obra_id, NEW.material_id, 0)
  ON CONFLICT (obra_id, material_id) DO NOTHING;

  -- Atualiza quantidade
  UPDATE public.almoxarifado_estoque
  SET quantidade  = GREATEST(quantidade + delta, 0),
      updated_at  = now()
  WHERE obra_id   = NEW.obra_id
    AND material_id = NEW.material_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_almox_update_estoque ON public.almoxarifado_movimentos;
CREATE TRIGGER trg_almox_update_estoque
  AFTER INSERT ON public.almoxarifado_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_estoque_on_movimento();

-- ─── Requisições de Compra ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisicoes_compra (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  material_id     uuid        NOT NULL REFERENCES public.materiais_catalogo(id),
  quantidade      numeric(14,3) NOT NULL,
  urgencia        text        NOT NULL DEFAULT 'normal' CHECK (urgencia IN ('normal','urgente','critico')),
  justificativa   text,
  status          text        NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente','aprovada','rejeitada','entregue')),
  solicitado_por  uuid        REFERENCES auth.users(id),
  aprovado_por    uuid        REFERENCES auth.users(id),
  data_solicitacao date       NOT NULL DEFAULT current_date,
  data_necessidade date,
  observacoes_aprovador text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS req_compra_obra_idx   ON public.requisicoes_compra (obra_id, status);
CREATE INDEX IF NOT EXISTS req_compra_status_idx ON public.requisicoes_compra (status);

-- updated_at trigger reutilizável
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_mat_updated_at   ON public.materiais_catalogo;
DROP TRIGGER IF EXISTS trg_req_updated_at   ON public.requisicoes_compra;

CREATE TRIGGER trg_mat_updated_at BEFORE UPDATE ON public.materiais_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_req_updated_at BEFORE UPDATE ON public.requisicoes_compra
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.materiais_catalogo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almoxarifado_estoque   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almoxarifado_movimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisicoes_compra     ENABLE ROW LEVEL SECURITY;

-- Catálogo: todos leem, gestores escrevem
DROP POLICY IF EXISTS "mat_select" ON public.materiais_catalogo;
DROP POLICY IF EXISTS "mat_write"  ON public.materiais_catalogo;
CREATE POLICY "mat_select" ON public.materiais_catalogo FOR SELECT TO authenticated USING (true);
CREATE POLICY "mat_write"  ON public.materiais_catalogo FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Estoque: todos leem, gestores escrevem
DROP POLICY IF EXISTS "estoque_select" ON public.almoxarifado_estoque;
DROP POLICY IF EXISTS "estoque_write"  ON public.almoxarifado_estoque;
CREATE POLICY "estoque_select" ON public.almoxarifado_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "estoque_write"  ON public.almoxarifado_estoque FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Movimentos: todos leem, gestores escrevem
DROP POLICY IF EXISTS "almox_mov_select" ON public.almoxarifado_movimentos;
DROP POLICY IF EXISTS "almox_mov_write"  ON public.almoxarifado_movimentos;
CREATE POLICY "almox_mov_select" ON public.almoxarifado_movimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "almox_mov_write"  ON public.almoxarifado_movimentos FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Requisições: todos leem e criam, gestores aprovam
DROP POLICY IF EXISTS "req_select" ON public.requisicoes_compra;
DROP POLICY IF EXISTS "req_insert" ON public.requisicoes_compra;
DROP POLICY IF EXISTS "req_update" ON public.requisicoes_compra;
CREATE POLICY "req_select" ON public.requisicoes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "req_insert" ON public.requisicoes_compra FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "req_update" ON public.requisicoes_compra FOR UPDATE TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

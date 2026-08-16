-- =====================================================================
-- Almoxarifado v3 — Ordens de Compra + Inventário Físico
-- =====================================================================

-- 1. Sequência e tabela Ordens de Compra
CREATE SEQUENCE IF NOT EXISTS seq_oc_numero START 1001 INCREMENT 1;

CREATE TABLE IF NOT EXISTS public.ordens_compra (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_oc           text        UNIQUE NOT NULL
                                  DEFAULT 'OC-' || LPAD(nextval('seq_oc_numero')::text, 5, '0'),
  requisicao_id       uuid        REFERENCES public.requisicoes_compra(id),
  fornecedor_id       uuid        REFERENCES public.fornecedores(id),
  obra_id             uuid        NOT NULL REFERENCES public.obras(id),
  status              text        NOT NULL DEFAULT 'rascunho'
                                  CHECK (status IN ('rascunho','enviada','recebida','cancelada')),
  data_emissao        date        NOT NULL DEFAULT CURRENT_DATE,
  prazo_entrega       date,
  condicoes_pagamento text,
  local_entrega       text,
  observacoes         text,
  emitido_por         uuid        REFERENCES auth.users(id),
  valor_total         numeric(14,2) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ordens_compra_itens (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id       uuid          NOT NULL REFERENCES public.ordens_compra(id) ON DELETE CASCADE,
  material_id    uuid          NOT NULL REFERENCES public.materiais_catalogo(id),
  quantidade     numeric(14,3) NOT NULL CHECK (quantidade > 0),
  unidade        text          NOT NULL DEFAULT 'un',
  preco_unitario numeric(14,4) NOT NULL DEFAULT 0,
  valor_total    numeric(14,2) NOT NULL DEFAULT 0,
  created_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oc_itens_ordem_idx ON public.ordens_compra_itens(ordem_id);

-- Trigger: recalcula valor_total da OC após mudança nos itens
CREATE OR REPLACE FUNCTION fn_oc_update_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ordens_compra
    SET valor_total = (
      SELECT COALESCE(SUM(preco_unitario * quantidade), 0)
      FROM public.ordens_compra_itens
      WHERE ordem_id = COALESCE(NEW.ordem_id, OLD.ordem_id)
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.ordem_id, OLD.ordem_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_update_total ON public.ordens_compra_itens;
CREATE TRIGGER trg_oc_update_total
  AFTER INSERT OR UPDATE OR DELETE ON public.ordens_compra_itens
  FOR EACH ROW EXECUTE FUNCTION fn_oc_update_total();

DROP TRIGGER IF EXISTS trg_oc_updated_at ON public.ordens_compra;
CREATE TRIGGER trg_oc_updated_at
  BEFORE UPDATE ON public.ordens_compra
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- 2. Inventário Físico
CREATE TABLE IF NOT EXISTS public.inventario_fisico (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid        NOT NULL REFERENCES public.obras(id),
  data_inventario date        NOT NULL DEFAULT CURRENT_DATE,
  status          text        NOT NULL DEFAULT 'aberto'
                              CHECK (status IN ('aberto','fechado')),
  responsavel_id  uuid        REFERENCES auth.users(id),
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventario_itens (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id       uuid          NOT NULL REFERENCES public.inventario_fisico(id) ON DELETE CASCADE,
  material_id         uuid          NOT NULL REFERENCES public.materiais_catalogo(id),
  quantidade_sistema  numeric(14,3) NOT NULL DEFAULT 0,
  quantidade_contada  numeric(14,3),
  ajustado            boolean       NOT NULL DEFAULT false,
  observacao          text,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inv_itens_inv_idx ON public.inventario_itens(inventario_id);
CREATE INDEX IF NOT EXISTS inv_itens_mat_idx ON public.inventario_itens(material_id);

DROP TRIGGER IF EXISTS trg_inv_updated_at ON public.inventario_fisico;
CREATE TRIGGER trg_inv_updated_at
  BEFORE UPDATE ON public.inventario_fisico
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- 3. RLS
ALTER TABLE public.ordens_compra       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_compra_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_fisico   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_itens    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_select" ON public.ordens_compra;
DROP POLICY IF EXISTS "oc_write"  ON public.ordens_compra;
CREATE POLICY "oc_select" ON public.ordens_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "oc_write"  ON public.ordens_compra FOR ALL TO authenticated
  USING     (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "oc_itens_select" ON public.ordens_compra_itens;
DROP POLICY IF EXISTS "oc_itens_write"  ON public.ordens_compra_itens;
CREATE POLICY "oc_itens_select" ON public.ordens_compra_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "oc_itens_write"  ON public.ordens_compra_itens FOR ALL TO authenticated
  USING     (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "inv_select" ON public.inventario_fisico;
DROP POLICY IF EXISTS "inv_write"  ON public.inventario_fisico;
CREATE POLICY "inv_select" ON public.inventario_fisico FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_write"  ON public.inventario_fisico FOR ALL TO authenticated
  USING     (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

DROP POLICY IF EXISTS "inv_itens_select" ON public.inventario_itens;
DROP POLICY IF EXISTS "inv_itens_write"  ON public.inventario_itens;
CREATE POLICY "inv_itens_select" ON public.inventario_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_itens_write"  ON public.inventario_itens FOR ALL TO authenticated
  USING     (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

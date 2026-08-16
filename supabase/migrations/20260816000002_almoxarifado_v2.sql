-- =====================================================================
-- Almoxarifado v2 — multi-itens, fornecedores, preço, transferência
-- =====================================================================

-- 1. Numeração automática de requisições
ALTER TABLE public.requisicoes_compra
  ADD COLUMN IF NOT EXISTS numero_req      text,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text;

CREATE SEQUENCE IF NOT EXISTS seq_req_numero START 1001 INCREMENT 1;

-- Atribui número às requisições que ainda não têm
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.requisicoes_compra WHERE numero_req IS NULL ORDER BY created_at
  LOOP
    UPDATE public.requisicoes_compra
      SET numero_req = 'REQ-' || LPAD(nextval('seq_req_numero')::text, 5, '0')
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Default para novas requisições
ALTER TABLE public.requisicoes_compra
  ALTER COLUMN numero_req SET DEFAULT
    'REQ-' || LPAD(nextval('seq_req_numero')::text, 5, '0');

-- 2. Itens de requisição (multi-material por requisição)
CREATE TABLE IF NOT EXISTS public.requisicao_itens (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id uuid          NOT NULL REFERENCES public.requisicoes_compra(id) ON DELETE CASCADE,
  material_id   uuid          NOT NULL REFERENCES public.materiais_catalogo(id),
  quantidade    numeric(14,3) NOT NULL CHECK (quantidade > 0),
  qtd_aprovada  numeric(14,3),
  observacao    text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS req_itens_req_idx ON public.requisicao_itens(requisicao_id);
CREATE INDEX IF NOT EXISTS req_itens_mat_idx ON public.requisicao_itens(material_id);

-- 3. Fornecedores
CREATE TABLE IF NOT EXISTS public.fornecedores (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text        NOT NULL,
  cnpj         text,
  contato_nome text,
  telefone     text,
  email        text,
  categorias   text[]      DEFAULT '{}',
  observacoes  text,
  ativo        boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fornecedores_nome_idx ON public.fornecedores(nome);

DROP TRIGGER IF EXISTS trg_forn_updated_at ON public.fornecedores;
CREATE TRIGGER trg_forn_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- 4. Melhorias nas movimentações (preço e transferência)
ALTER TABLE public.almoxarifado_movimentos
  ADD COLUMN IF NOT EXISTS preco_unitario  numeric(14,4),
  ADD COLUMN IF NOT EXISTS obra_destino_id uuid REFERENCES public.obras(id),
  ADD COLUMN IF NOT EXISTS fornecedor_id   uuid REFERENCES public.fornecedores(id);

-- 5. RLS para as novas tabelas
ALTER TABLE public.requisicao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores     ENABLE ROW LEVEL SECURITY;

-- Itens de requisição: todos leem, todos inserem, gestores atualizam
DROP POLICY IF EXISTS "req_itens_select" ON public.requisicao_itens;
DROP POLICY IF EXISTS "req_itens_insert" ON public.requisicao_itens;
DROP POLICY IF EXISTS "req_itens_update" ON public.requisicao_itens;

CREATE POLICY "req_itens_select" ON public.requisicao_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "req_itens_insert" ON public.requisicao_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "req_itens_update" ON public.requisicao_itens FOR UPDATE TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

-- Fornecedores: todos leem, gestores escrevem
DROP POLICY IF EXISTS "forn_select" ON public.fornecedores;
DROP POLICY IF EXISTS "forn_write"  ON public.fornecedores;

CREATE POLICY "forn_select" ON public.fornecedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "forn_write"  ON public.fornecedores FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_frota','gestor_obra'));

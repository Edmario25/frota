-- ─── Custo de material por consumo, integrado ao Orçado x Realizado ─────────
--
-- Regra: material vira custo da obra quando SAI do estoque para consumo, pelo
-- custo médio ponderado do item naquela obra. Material parado no estoque não
-- é gasto. Transferência entre obras move estoque, não gera custo — o custo
-- aparece na obra que consumir. Devolução abate o custo. Ajuste negativo de
-- inventário (perda) é custo; ajuste positivo, crédito.
--
-- Item retornável (ferramenta, equipamento) não vira custo na saída, porque
-- volta ao estoque.
--
-- Antes desta migration:
--  * o Orçado x Realizado não lia o Almoxarifado;
--  * saída não tinha preço e não existia custo médio;
--  * "Marcar recebida" na ordem de compra só trocava o status, sem dar
--    entrada no estoque — o preço da compra ficava parado na ordem.

-- ─── 1. Colunas ─────────────────────────────────────────────────────────────
ALTER TABLE public.almoxarifado_movimentos
  ADD COLUMN IF NOT EXISTS custo_unitario  numeric(14,4),
  ADD COLUMN IF NOT EXISTS ordem_compra_id uuid REFERENCES public.ordens_compra(id);

ALTER TABLE public.almoxarifado_estoque
  ADD COLUMN IF NOT EXISTS custo_medio numeric(14,4) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS almox_mov_ordem_compra_idx
  ON public.almoxarifado_movimentos(ordem_compra_id) WHERE ordem_compra_id IS NOT NULL;

-- ─── 2. Custo histórico ─────────────────────────────────────────────────────
-- Refaz o custo médio de cada item movimento a movimento, na ordem real de
-- gravação. Saídas anteriores a qualquer entrada com preço ficam com custo
-- zero e aparecem como "sem custo" no Orçado x Realizado.
-- Movimentações são imutáveis; o bloqueio é desligado só durante o
-- preenchimento, e só roda se o custo nunca foi calculado.

ALTER TABLE public.almoxarifado_movimentos DISABLE TRIGGER trg_almox_bloquear_alteracao;

DO $$
DECLARE
  r       record;
  v_qtd   numeric;
  v_cm    numeric;
  v_preco numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.almoxarifado_movimentos WHERE custo_unitario IS NOT NULL) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _cm (
    obra_id uuid, material_id uuid, qtd numeric NOT NULL, cm numeric NOT NULL,
    PRIMARY KEY (obra_id, material_id)
  ) ON COMMIT DROP;

  FOR r IN
    SELECT * FROM public.almoxarifado_movimentos
    -- A entrada de uma transferência é gravada junto com a saída da origem;
    -- ela precisa vir depois, para herdar o custo que a origem acabou de ter.
    ORDER BY created_at,
             CASE WHEN tipo = 'entrada' AND transferencia_id IS NOT NULL THEN 1 ELSE 0 END,
             id
  LOOP
    INSERT INTO _cm VALUES (r.obra_id, r.material_id, 0, 0) ON CONFLICT DO NOTHING;
    SELECT qtd, cm INTO v_qtd, v_cm FROM _cm WHERE obra_id = r.obra_id AND material_id = r.material_id;

    IF r.tipo = 'entrada' THEN
      v_preco := NULLIF(r.preco_unitario, 0);
      IF v_preco IS NULL AND r.transferencia_id IS NOT NULL THEN
        SELECT custo_unitario INTO v_preco FROM public.almoxarifado_movimentos
        WHERE transferencia_id = r.transferencia_id AND tipo = 'transferencia' LIMIT 1;
      END IF;
      v_preco := COALESCE(v_preco, v_cm, 0);
      IF GREATEST(v_qtd, 0) + r.quantidade > 0 THEN
        v_cm := (GREATEST(v_qtd, 0) * v_cm + r.quantidade * v_preco) / (GREATEST(v_qtd, 0) + r.quantidade);
      END IF;
      UPDATE public.almoxarifado_movimentos SET custo_unitario = round(v_preco, 4) WHERE id = r.id;
      v_qtd := v_qtd + r.quantidade;
    ELSE
      UPDATE public.almoxarifado_movimentos SET custo_unitario = round(v_cm, 4) WHERE id = r.id;
      v_qtd := v_qtd + CASE r.tipo WHEN 'ajuste' THEN r.quantidade ELSE -r.quantidade END;
    END IF;

    UPDATE _cm SET qtd = v_qtd, cm = v_cm WHERE obra_id = r.obra_id AND material_id = r.material_id;
  END LOOP;

  UPDATE public.almoxarifado_estoque e SET custo_medio = round(c.cm, 4)
  FROM _cm c WHERE e.obra_id = c.obra_id AND e.material_id = c.material_id;
END $$;

ALTER TABLE public.almoxarifado_movimentos ENABLE TRIGGER trg_almox_bloquear_alteracao;

-- ─── 3. Custo de cada movimento novo ────────────────────────────────────────
-- Roda ANTES da gravação, portanto antes do gatilho que atualiza o saldo:
-- enxerga a quantidade e o custo médio de antes deste movimento.
CREATE OR REPLACE FUNCTION public.fn_almox_custo_movimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qtd   numeric;
  v_cm    numeric;
  v_preco numeric;
BEGIN
  INSERT INTO public.almoxarifado_estoque (obra_id, material_id, quantidade)
  VALUES (NEW.obra_id, NEW.material_id, 0)
  ON CONFLICT (obra_id, material_id) DO NOTHING;

  SELECT quantidade, custo_medio INTO v_qtd, v_cm
  FROM public.almoxarifado_estoque
  WHERE obra_id = NEW.obra_id AND material_id = NEW.material_id
  FOR UPDATE;

  IF NEW.tipo = 'entrada' THEN
    v_preco := NULLIF(NEW.preco_unitario, 0);
    -- Transferência chega com o custo que tinha na obra de origem
    IF v_preco IS NULL AND NEW.transferencia_id IS NOT NULL THEN
      SELECT custo_unitario INTO v_preco FROM public.almoxarifado_movimentos
      WHERE transferencia_id = NEW.transferencia_id AND tipo = 'transferencia' LIMIT 1;
    END IF;
    -- Sem preço (devolução, entrada avulsa): entra pelo custo médio, sem distorcê-lo
    v_preco := COALESCE(v_preco, v_cm, 0);

    IF GREATEST(v_qtd, 0) + NEW.quantidade > 0 THEN
      UPDATE public.almoxarifado_estoque
      SET custo_medio = round((GREATEST(v_qtd, 0) * v_cm + NEW.quantidade * v_preco)
                              / (GREATEST(v_qtd, 0) + NEW.quantidade), 4)
      WHERE obra_id = NEW.obra_id AND material_id = NEW.material_id;
    END IF;
    NEW.custo_unitario := round(v_preco, 4);
  ELSE
    NEW.custo_unitario := round(COALESCE(v_cm, 0), 4);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_almox_custo ON public.almoxarifado_movimentos;
CREATE TRIGGER trg_almox_custo
  BEFORE INSERT ON public.almoxarifado_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_almox_custo_movimento();

-- ─── 4. O que é custo da obra ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_almoxarifado_custos_obra WITH (security_invoker = true) AS
SELECT
  m.id            AS referencia_id,
  m.obra_id,
  m.data_movimento AS data_lancamento,
  CASE m.tipo WHEN 'saida' THEN 'Consumo: ' WHEN 'entrada' THEN 'Devolução: ' ELSE 'Ajuste de inventário: ' END
    || mc.nome || ' (' || rtrim(rtrim(abs(m.quantidade)::text, '0'), '.') || ' ' || mc.unidade || ')'
    || COALESCE(' · ' || NULLIF(trim(m.frente), ''), '') AS descricao,
  round(CASE m.tipo
          WHEN 'saida'   THEN  m.quantidade
          WHEN 'entrada' THEN -m.quantidade   -- devolução abate o custo
          ELSE                -m.quantidade   -- ajuste: perda é custo, sobra é crédito
        END * COALESCE(m.custo_unitario, 0), 2) AS valor,
  m.tipo          AS origem,
  COALESCE(m.custo_unitario, 0) = 0 AS sem_custo,
  m.material_id
FROM public.almoxarifado_movimentos m
JOIN public.materiais_catalogo mc ON mc.id = m.material_id
WHERE (m.tipo = 'saida'   AND mc.tipo_item = 'consumo')
   OR (m.tipo = 'entrada' AND m.devolucao_id IS NOT NULL AND mc.tipo_item = 'consumo')
   OR  m.tipo = 'ajuste';

GRANT SELECT ON public.v_almoxarifado_custos_obra TO authenticated;

-- ─── 5. Orçado x Realizado passa a somar o consumo em "Materiais" ───────────
-- Mesma estrutura da 20260910000005, com a terceira fonte.
CREATE OR REPLACE VIEW public.v_orcado_realizado WITH (security_invoker=true) AS
WITH custos AS (
  SELECT obra_id,categoria_id,valor FROM public.lancamentos_custos WHERE cancelado_em IS NULL
  UNION ALL
  SELECT ac.obra_id,oc.id,ac.valor FROM public.v_alojamento_custos_obra ac
  JOIN public.orcamento_categorias oc ON oc.nome='Alojamento'
  UNION ALL
  SELECT mc.obra_id,oc.id,mc.valor FROM public.v_almoxarifado_custos_obra mc
  JOIN public.orcamento_categorias oc ON oc.nome='Materiais'
  WHERE mc.valor<>0
)
SELECT o.id AS obra_id,o.nome AS obra_nome,oc.id AS categoria_id,oc.nome AS categoria_nome,
  oc.cor AS categoria_cor,oc.ordem AS categoria_ordem,oi.id AS orcamento_item_id,
  coalesce(oi.valor_previsto,0) AS valor_previsto,coalesce(oi.alerta_perc,80) AS alerta_perc,
  coalesce(sum(c.valor),0) AS valor_realizado,
  CASE WHEN coalesce(oi.valor_previsto,0)>0 THEN round(coalesce(sum(c.valor),0)/oi.valor_previsto*100,2) ELSE 0 END AS perc_consumido,
  coalesce(oi.valor_previsto,0)-coalesce(sum(c.valor),0) AS saldo,
  oi.descricao,oi.observacoes
FROM public.obras o CROSS JOIN public.orcamento_categorias oc
LEFT JOIN public.orcamento_itens oi ON oi.obra_id=o.id AND oi.categoria_id=oc.id
LEFT JOIN custos c ON c.obra_id=o.id AND c.categoria_id=oc.id
WHERE oc.ativo OR oi.id IS NOT NULL OR c.obra_id IS NOT NULL
GROUP BY o.id,o.nome,oc.id,oc.nome,oc.cor,oc.ordem,oi.id,oi.valor_previsto,oi.alerta_perc,oi.descricao,oi.observacoes;

CREATE OR REPLACE VIEW public.v_custos_mensais WITH (security_invoker=true) AS
WITH custos AS (
  SELECT obra_id,categoria_id,data_lancamento,valor FROM public.lancamentos_custos WHERE cancelado_em IS NULL
  UNION ALL
  SELECT ac.obra_id,oc.id,ac.data_lancamento,ac.valor FROM public.v_alojamento_custos_obra ac
  JOIN public.orcamento_categorias oc ON oc.nome='Alojamento'
  UNION ALL
  SELECT mc.obra_id,oc.id,mc.data_lancamento,mc.valor FROM public.v_almoxarifado_custos_obra mc
  JOIN public.orcamento_categorias oc ON oc.nome='Materiais'
  WHERE mc.valor<>0
)
SELECT c.obra_id,to_char(c.data_lancamento,'YYYY-MM') AS mes,oc.id AS categoria_id,
  oc.nome AS categoria_nome,oc.cor AS categoria_cor,sum(c.valor) AS valor_mes,
  sum(sum(c.valor)) OVER(PARTITION BY c.obra_id,oc.id ORDER BY to_char(c.data_lancamento,'YYYY-MM')) AS valor_acumulado
FROM custos c JOIN public.orcamento_categorias oc ON oc.id=c.categoria_id
GROUP BY c.obra_id,mes,oc.id,oc.nome,oc.cor;

GRANT SELECT ON public.v_orcado_realizado,public.v_custos_mensais TO authenticated;

-- ─── 6. Receber ordem de compra dá entrada no estoque com o preço ───────────
CREATE OR REPLACE FUNCTION public.almoxarifado_receber_ordem_compra(p_ordem uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  oc record;
  it record;
  n  integer := 0;
BEGIN
  SELECT * INTO oc FROM public.ordens_compra WHERE id = p_ordem FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de compra não encontrada.'; END IF;
  IF auth.uid() IS NULL OR NOT public.can_manage_obra_data(oc.obra_id) THEN
    RAISE EXCEPTION 'Sem permissão para receber material nesta obra.';
  END IF;
  IF oc.status NOT IN ('rascunho', 'enviada') THEN
    RAISE EXCEPTION 'A ordem % está %; não pode ser recebida de novo.', oc.numero_oc, oc.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ordens_compra_itens WHERE ordem_id = p_ordem) THEN
    RAISE EXCEPTION 'A ordem % não tem itens.', oc.numero_oc;
  END IF;

  FOR it IN SELECT * FROM public.ordens_compra_itens WHERE ordem_id = p_ordem LOOP
    INSERT INTO public.almoxarifado_movimentos (
      obra_id, material_id, tipo, quantidade, preco_unitario, fornecedor_id,
      observacoes, registrado_por, data_movimento, ordem_compra_id
    ) VALUES (
      oc.obra_id, it.material_id, 'entrada', it.quantidade, NULLIF(it.preco_unitario, 0), oc.fornecedor_id,
      'Recebimento da ' || oc.numero_oc, auth.uid(), current_date, p_ordem
    );
    n := n + 1;
  END LOOP;

  PERFORM set_config('almox.recebimento_oc', '1', true);
  UPDATE public.ordens_compra SET status = 'recebida', updated_at = now() WHERE id = p_ordem;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.almoxarifado_receber_ordem_compra(uuid) TO authenticated;

-- A ordem só vira "recebida" pela função acima; senão o material ficaria fora
-- do estoque de novo. E uma ordem recebida não volta atrás: a entrada já existe.
CREATE OR REPLACE FUNCTION public.fn_oc_proteger_recebimento()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'recebida' AND NEW.status <> 'recebida' THEN
    RAISE EXCEPTION 'Ordem recebida não muda de situação: o material já entrou no estoque. Registre uma devolução ou ajuste.';
  END IF;
  IF NEW.status = 'recebida' AND OLD.status IS DISTINCT FROM 'recebida'
     AND current_setting('almox.recebimento_oc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Use "Receber no estoque" para dar entrada nos itens da ordem.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_proteger_recebimento ON public.ordens_compra;
CREATE TRIGGER trg_oc_proteger_recebimento
  BEFORE UPDATE OF status ON public.ordens_compra
  FOR EACH ROW EXECUTE FUNCTION public.fn_oc_proteger_recebimento();

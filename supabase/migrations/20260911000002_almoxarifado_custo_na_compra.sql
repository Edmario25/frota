-- ─── Custo na compra para ferramentas e itens escolhidos ────────────────────
--
-- A 20260911000001 fez todo material virar custo na SAÍDA do estoque e deixou
-- os itens retornáveis fora do custo — mas a compra também não era custo, então
-- ferramenta nunca chegava ao Orçado x Realizado.
--
-- Agora cada material diz QUANDO vira custo:
--   consumo → na saída, pelo custo médio (regra da 000001, inalterada);
--   compra  → na entrada por compra (ordem de compra ou entrada com preço que
--             não seja transferência nem devolução). Saída, devolução, ajuste e
--             transferência não geram custo: o valor já foi contado, e fica na
--             obra que comprou.
-- Padrão pelo tipo do item: consumo → consumo, retornável → compra; editável.
--
-- Cada material também diz em que categoria do orçamento cai
-- (padrão: consumo → Materiais, retornável → Equipamentos).
--
-- A regra é gravada em cada movimento no momento do registro. Trocar a regra
-- de um material vale dali para frente e não recalcula o passado — senão o
-- mesmo item seria contado duas vezes (na compra e na saída) ou nenhuma.
-- A categoria, ao contrário, é lida do cadastro: trocá-la só reclassifica.

-- ─── 1. Cadastro do material ────────────────────────────────────────────────
ALTER TABLE public.materiais_catalogo
  ADD COLUMN IF NOT EXISTS apropriacao_custo text,
  ADD COLUMN IF NOT EXISTS categoria_orcamento_id uuid
    REFERENCES public.orcamento_categorias(id) ON DELETE SET NULL;

UPDATE public.materiais_catalogo
SET apropriacao_custo = CASE tipo_item WHEN 'retornavel' THEN 'compra' ELSE 'consumo' END
WHERE apropriacao_custo IS NULL;

UPDATE public.materiais_catalogo mc
SET categoria_orcamento_id = oc.id
FROM public.orcamento_categorias oc
WHERE mc.categoria_orcamento_id IS NULL
  AND oc.nome = CASE mc.tipo_item WHEN 'retornavel' THEN 'Equipamentos' ELSE 'Materiais' END;

ALTER TABLE public.materiais_catalogo DROP CONSTRAINT IF EXISTS materiais_catalogo_apropriacao_custo_check;
ALTER TABLE public.materiais_catalogo ADD CONSTRAINT materiais_catalogo_apropriacao_custo_check
  CHECK (apropriacao_custo IN ('consumo', 'compra'));

-- Material cadastrado sem escolher a regra recebe o padrão do tipo
CREATE OR REPLACE FUNCTION public.fn_material_padroes_custo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.apropriacao_custo IS NULL THEN
    NEW.apropriacao_custo := CASE NEW.tipo_item WHEN 'retornavel' THEN 'compra' ELSE 'consumo' END;
  END IF;
  IF NEW.categoria_orcamento_id IS NULL AND TG_OP = 'INSERT' THEN
    SELECT id INTO NEW.categoria_orcamento_id FROM public.orcamento_categorias
    WHERE nome = CASE NEW.tipo_item WHEN 'retornavel' THEN 'Equipamentos' ELSE 'Materiais' END
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_padroes_custo ON public.materiais_catalogo;
CREATE TRIGGER trg_material_padroes_custo
  BEFORE INSERT OR UPDATE ON public.materiais_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_padroes_custo();

ALTER TABLE public.materiais_catalogo ALTER COLUMN apropriacao_custo SET NOT NULL;

-- ─── 2. Regra gravada em cada movimento ─────────────────────────────────────
ALTER TABLE public.almoxarifado_movimentos
  ADD COLUMN IF NOT EXISTS apropriacao_custo text;

-- Histórico: recebe a regra atual do material. Decisão do usuário (11/09):
-- compras antigas de ferramentas passam a contar como custo da obra.
ALTER TABLE public.almoxarifado_movimentos DISABLE TRIGGER trg_almox_bloquear_alteracao;

UPDATE public.almoxarifado_movimentos m
SET apropriacao_custo = mc.apropriacao_custo
FROM public.materiais_catalogo mc
WHERE mc.id = m.material_id AND m.apropriacao_custo IS NULL;

ALTER TABLE public.almoxarifado_movimentos ENABLE TRIGGER trg_almox_bloquear_alteracao;

-- Mesmo gatilho da 000001, agora também grava a regra do material
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
  SELECT apropriacao_custo INTO NEW.apropriacao_custo
  FROM public.materiais_catalogo WHERE id = NEW.material_id;
  NEW.apropriacao_custo := COALESCE(NEW.apropriacao_custo, 'consumo');

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

-- ─── 3. O que é custo da obra ───────────────────────────────────────────────
-- Colunas novas no fim (categoria_id, apropriacao_custo) para o
-- CREATE OR REPLACE aceitar sem derrubar as views que dependem desta.
CREATE OR REPLACE VIEW public.v_almoxarifado_custos_obra WITH (security_invoker = true) AS
SELECT
  m.id            AS referencia_id,
  m.obra_id,
  m.data_movimento AS data_lancamento,
  CASE
    WHEN m.apropriacao_custo = 'compra' THEN 'Compra: '
    WHEN m.tipo = 'saida'   THEN 'Consumo: '
    WHEN m.tipo = 'entrada' THEN 'Devolução: '
    ELSE 'Ajuste de inventário: '
  END
    || mc.nome || ' (' || rtrim(rtrim(abs(m.quantidade)::text, '0'), '.') || ' ' || mc.unidade || ')'
    || COALESCE(' · ' || NULLIF(trim(m.frente), ''), '') AS descricao,
  round(CASE
          -- compra vale o preço pago, não o custo médio
          WHEN m.apropriacao_custo = 'compra' THEN m.quantidade * COALESCE(NULLIF(m.preco_unitario, 0), 0)
          WHEN m.tipo = 'saida'   THEN  m.quantidade * COALESCE(m.custo_unitario, 0)
          WHEN m.tipo = 'entrada' THEN -m.quantidade * COALESCE(m.custo_unitario, 0)  -- devolução abate
          ELSE                         -m.quantidade * COALESCE(m.custo_unitario, 0)  -- perda é custo
        END, 2) AS valor,
  m.tipo          AS origem,
  CASE WHEN m.apropriacao_custo = 'compra' THEN COALESCE(NULLIF(m.preco_unitario, 0), 0) = 0
       ELSE COALESCE(m.custo_unitario, 0) = 0 END AS sem_custo,
  m.material_id,
  COALESCE(mc.categoria_orcamento_id,
           (SELECT id FROM public.orcamento_categorias
            WHERE nome = CASE m.apropriacao_custo WHEN 'compra' THEN 'Equipamentos' ELSE 'Materiais' END
            LIMIT 1)) AS categoria_id,
  m.apropriacao_custo
FROM public.almoxarifado_movimentos m
JOIN public.materiais_catalogo mc ON mc.id = m.material_id
WHERE (COALESCE(m.apropriacao_custo, 'consumo') = 'consumo' AND (
         m.tipo = 'saida'
      OR (m.tipo = 'entrada' AND m.devolucao_id IS NOT NULL)
      OR  m.tipo = 'ajuste'))
   OR (m.apropriacao_custo = 'compra'
       AND m.tipo = 'entrada'
       AND m.transferencia_id IS NULL
       AND m.devolucao_id IS NULL);

GRANT SELECT ON public.v_almoxarifado_custos_obra TO authenticated;

-- ─── 4. Orçado x Realizado usa a categoria de cada material ─────────────────
CREATE OR REPLACE VIEW public.v_orcado_realizado WITH (security_invoker=true) AS
WITH custos AS (
  SELECT obra_id,categoria_id,valor FROM public.lancamentos_custos WHERE cancelado_em IS NULL
  UNION ALL
  SELECT ac.obra_id,oc.id,ac.valor FROM public.v_alojamento_custos_obra ac
  JOIN public.orcamento_categorias oc ON oc.nome='Alojamento'
  UNION ALL
  SELECT mc.obra_id,mc.categoria_id,mc.valor FROM public.v_almoxarifado_custos_obra mc
  WHERE mc.valor<>0 AND mc.categoria_id IS NOT NULL
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
  SELECT mc.obra_id,mc.categoria_id,mc.data_lancamento,mc.valor FROM public.v_almoxarifado_custos_obra mc
  WHERE mc.valor<>0 AND mc.categoria_id IS NOT NULL
)
SELECT c.obra_id,to_char(c.data_lancamento,'YYYY-MM') AS mes,oc.id AS categoria_id,
  oc.nome AS categoria_nome,oc.cor AS categoria_cor,sum(c.valor) AS valor_mes,
  sum(sum(c.valor)) OVER(PARTITION BY c.obra_id,oc.id ORDER BY to_char(c.data_lancamento,'YYYY-MM')) AS valor_acumulado
FROM custos c JOIN public.orcamento_categorias oc ON oc.id=c.categoria_id
GROUP BY c.obra_id,mes,oc.id,oc.nome,oc.cor;

GRANT SELECT ON public.v_orcado_realizado,public.v_custos_mensais TO authenticated;

-- Torna o livro de estoque consistente, atomico e auditavel.

ALTER TABLE public.almoxarifado_movimentos
  ADD COLUMN IF NOT EXISTS transferencia_id uuid;

ALTER TABLE public.almoxarifado_movimentos
  DROP CONSTRAINT IF EXISTS almoxarifado_movimentos_quantidade_valida;
ALTER TABLE public.almoxarifado_movimentos
  ADD CONSTRAINT almoxarifado_movimentos_quantidade_valida
  CHECK (
    (tipo = 'ajuste' AND quantidade <> 0)
    OR (tipo <> 'ajuste' AND quantidade > 0)
  ) NOT VALID;

ALTER TABLE public.inventario_itens
  DROP CONSTRAINT IF EXISTS inventario_itens_contagem_nao_negativa;
ALTER TABLE public.inventario_itens
  ADD CONSTRAINT inventario_itens_contagem_nao_negativa
  CHECK (quantidade_contada IS NULL OR quantidade_contada >= 0) NOT VALID;

CREATE OR REPLACE FUNCTION public.fn_update_estoque_on_movimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  delta numeric(14,3);
  saldo_atual numeric(14,3);
BEGIN
  IF NEW.tipo = 'ajuste' AND NEW.quantidade = 0 THEN
    RAISE EXCEPTION 'O ajuste deve ser diferente de zero.';
  ELSIF NEW.tipo <> 'ajuste' AND NEW.quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade deve ser maior que zero.';
  END IF;

  delta := CASE NEW.tipo
    WHEN 'entrada' THEN NEW.quantidade
    WHEN 'saida' THEN -NEW.quantidade
    WHEN 'ajuste' THEN NEW.quantidade
    WHEN 'transferencia' THEN -NEW.quantidade
  END;

  INSERT INTO public.almoxarifado_estoque (obra_id, material_id, quantidade)
  VALUES (NEW.obra_id, NEW.material_id, 0)
  ON CONFLICT (obra_id, material_id) DO NOTHING;

  SELECT quantidade INTO saldo_atual
  FROM public.almoxarifado_estoque
  WHERE obra_id = NEW.obra_id AND material_id = NEW.material_id
  FOR UPDATE;

  IF saldo_atual + delta < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponivel: %, solicitado: %.',
      saldo_atual, abs(delta);
  END IF;

  UPDATE public.almoxarifado_estoque
  SET quantidade = quantidade + delta, updated_at = now()
  WHERE obra_id = NEW.obra_id AND material_id = NEW.material_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_bloquear_alteracao_movimento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Movimentacoes de estoque sao imutaveis. Registre um estorno ou ajuste.';
END;
$$;

DROP TRIGGER IF EXISTS trg_almox_bloquear_alteracao ON public.almoxarifado_movimentos;
CREATE TRIGGER trg_almox_bloquear_alteracao
  BEFORE UPDATE OR DELETE ON public.almoxarifado_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_alteracao_movimento();

CREATE OR REPLACE FUNCTION public.registrar_movimentacao_almoxarifado(
  p_obra_id uuid,
  p_material_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_preco_unitario numeric DEFAULT NULL,
  p_frente text DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL,
  p_fornecedor text DEFAULT NULL,
  p_nota_fiscal text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_data_movimento date DEFAULT CURRENT_DATE,
  p_obra_destino_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  movimento_id uuid;
  vinculo_transferencia uuid;
  origem_nome text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_obra_data(p_obra_id) THEN
    RAISE EXCEPTION 'Sem permissao para movimentar o estoque desta obra.';
  END IF;
  IF p_tipo NOT IN ('entrada', 'saida', 'ajuste', 'transferencia') THEN
    RAISE EXCEPTION 'Tipo de movimentacao invalido.';
  END IF;
  IF p_tipo = 'ajuste' AND p_quantidade = 0 THEN
    RAISE EXCEPTION 'O ajuste deve ser diferente de zero.';
  ELSIF p_tipo <> 'ajuste' AND p_quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade deve ser maior que zero.';
  END IF;

  IF p_tipo = 'transferencia' THEN
    IF p_obra_destino_id IS NULL OR p_obra_destino_id = p_obra_id THEN
      RAISE EXCEPTION 'Selecione uma obra de destino diferente da origem.';
    END IF;
    IF NOT public.can_manage_obra_data(p_obra_destino_id) THEN
      RAISE EXCEPTION 'Sem permissao para receber estoque na obra de destino.';
    END IF;
    vinculo_transferencia := gen_random_uuid();
  ELSIF p_obra_destino_id IS NOT NULL THEN
    RAISE EXCEPTION 'Obra de destino so pode ser informada em transferencias.';
  END IF;

  INSERT INTO public.almoxarifado_movimentos (
    obra_id, material_id, tipo, quantidade, preco_unitario, frente,
    fornecedor_id, fornecedor, nota_fiscal, observacoes, registrado_por,
    data_movimento, obra_destino_id, transferencia_id
  ) VALUES (
    p_obra_id, p_material_id, p_tipo, p_quantidade, p_preco_unitario, p_frente,
    p_fornecedor_id, p_fornecedor, p_nota_fiscal, p_observacoes, auth.uid(),
    COALESCE(p_data_movimento, CURRENT_DATE), p_obra_destino_id, vinculo_transferencia
  ) RETURNING id INTO movimento_id;

  IF p_tipo = 'transferencia' THEN
    SELECT nome INTO origem_nome FROM public.obras WHERE id = p_obra_id;
    INSERT INTO public.almoxarifado_movimentos (
      obra_id, material_id, tipo, quantidade, preco_unitario, observacoes,
      registrado_por, data_movimento, transferencia_id
    ) VALUES (
      p_obra_destino_id, p_material_id, 'entrada', p_quantidade, p_preco_unitario,
      'Transferencia recebida de ' || COALESCE(origem_nome, p_obra_id::text),
      auth.uid(), COALESCE(p_data_movimento, CURRENT_DATE), vinculo_transferencia
    );
  END IF;

  RETURN movimento_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_ajustes_inventario(p_inventario_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inv public.inventario_fisico%ROWTYPE;
  item record;
  total integer := 0;
  diferenca numeric(14,3);
BEGIN
  SELECT * INTO inv FROM public.inventario_fisico WHERE id = p_inventario_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_manage_obra_data(inv.obra_id) THEN
    RAISE EXCEPTION 'Inventario nao encontrado ou sem permissao.';
  END IF;
  IF inv.status <> 'aberto' THEN RAISE EXCEPTION 'O inventario ja esta fechado.'; END IF;

  FOR item IN
    SELECT * FROM public.inventario_itens
    WHERE inventario_id = p_inventario_id
      AND quantidade_contada IS NOT NULL
      AND quantidade_contada <> quantidade_sistema
      AND NOT ajustado
    FOR UPDATE
  LOOP
    diferenca := item.quantidade_contada - item.quantidade_sistema;
    INSERT INTO public.almoxarifado_movimentos (
      obra_id, material_id, tipo, quantidade, observacoes, registrado_por, data_movimento
    ) VALUES (
      inv.obra_id, item.material_id, 'ajuste', diferenca,
      format('Ajuste de inventario - sistema: %s, contado: %s', item.quantidade_sistema, item.quantidade_contada),
      auth.uid(), inv.data_inventario
    );
    UPDATE public.inventario_itens SET ajustado = true WHERE id = item.id;
    total := total + 1;
  END LOOP;
  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION public.fechar_inventario_almoxarifado(p_inventario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inv public.inventario_fisico%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.inventario_fisico WHERE id = p_inventario_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_manage_obra_data(inv.obra_id) THEN
    RAISE EXCEPTION 'Inventario nao encontrado ou sem permissao.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventario_itens WHERE inventario_id = p_inventario_id AND quantidade_contada IS NULL) THEN
    RAISE EXCEPTION 'Existem itens ainda nao contados.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventario_itens
    WHERE inventario_id = p_inventario_id
      AND quantidade_contada <> quantidade_sistema AND NOT ajustado
  ) THEN
    RAISE EXCEPTION 'Existem divergencias ainda nao ajustadas.';
  END IF;
  UPDATE public.inventario_fisico SET status = 'fechado' WHERE id = p_inventario_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimentacao_almoxarifado(uuid,uuid,text,numeric,numeric,text,uuid,text,text,text,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_almoxarifado(uuid,uuid,text,numeric,numeric,text,uuid,text,text,text,date,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.aplicar_ajustes_inventario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_ajustes_inventario(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fechar_inventario_almoxarifado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_inventario_almoxarifado(uuid) TO authenticated;

-- Fecha as politicas permissivas antigas de requisicoes.
DROP POLICY IF EXISTS req_insert ON public.requisicoes_compra;
DROP POLICY IF EXISTS req_insert_scoped ON public.requisicoes_compra;
CREATE POLICY req_insert_scoped
  ON public.requisicoes_compra FOR INSERT TO authenticated
  WITH CHECK (
    solicitado_por = auth.uid()
    AND (
      public.can_manage_obra_data(obra_id)
      OR obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
    )
  );

DROP POLICY IF EXISTS req_itens_insert ON public.requisicao_itens;
DROP POLICY IF EXISTS req_itens_insert_scoped ON public.requisicao_itens;
CREATE POLICY req_itens_insert_scoped
  ON public.requisicao_itens FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requisicoes_compra requisicao
      WHERE requisicao.id = requisicao_id
        AND requisicao.solicitado_por = auth.uid()
        AND (
          public.can_manage_obra_data(requisicao.obra_id)
          OR requisicao.obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
        )
    )
  );

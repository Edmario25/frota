-- ============================================================================
-- Ordem de serviço da manutenção (Bloco 3)
--
-- Hoje a manutenção é um registro raso: tipo, datas, um campo de custo digitado
-- e `oficina` como texto livre. Não há peça, mão de obra, fornecedor de verdade
-- nem quanto tempo o veículo ficou parado — que é o dado que falta para
-- qualquer indicador de disponibilidade.
--
-- CUIDADO QUE ESTA MIGRATION RESOLVE:
-- Peça que sai do estoque JÁ VIRA CUSTO DA OBRA na saída, pela regra do
-- almoxarifado (v_almoxarifado_custos_obra → v_orcado_realizado). Se o valor
-- dela também entrasse no custo da OS, a obra pagaria duas vezes pelo mesmo
-- parafuso. Por isso a OS separa:
--
--   custo_pecas_estoque   → informativo, já custeado na saída do estoque
--   custo_pecas_compradas → peça comprada direto para a OS, entra no custo
--   custo_mao_obra        → entra no custo
--   custo                 → o que vai para o Orçado × Realizado
--
-- Rodar inteiro, de uma vez. Idempotente.
-- ============================================================================

-- ─── 1. CAMPOS DA ORDEM DE SERVIÇO ──────────────────────────────────────────

ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS numero_os        text,
  ADD COLUMN IF NOT EXISTS fornecedor_id    uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entrada_oficina  timestamptz,
  ADD COLUMN IF NOT EXISTS saida_oficina    timestamptz,
  ADD COLUMN IF NOT EXISTS horas_mao_obra   numeric(8,2)  CHECK (horas_mao_obra IS NULL OR horas_mao_obra >= 0),
  ADD COLUMN IF NOT EXISTS custo_mao_obra   numeric(14,2) CHECK (custo_mao_obra IS NULL OR custo_mao_obra >= 0),
  ADD COLUMN IF NOT EXISTS custo_pecas_estoque   numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_pecas_compradas numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.maintenance_records DROP CONSTRAINT IF EXISTS maintenance_oficina_periodo;
ALTER TABLE public.maintenance_records
  ADD CONSTRAINT maintenance_oficina_periodo
  CHECK (saida_oficina IS NULL OR entrada_oficina IS NULL OR saida_oficina >= entrada_oficina);

CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_numero_os
  ON public.maintenance_records(numero_os) WHERE numero_os IS NOT NULL;

-- Indisponibilidade: o veículo fora de operação, em horas. É a base do
-- indicador de disponibilidade do Bloco 4.
ALTER TABLE public.maintenance_records DROP COLUMN IF EXISTS indisponibilidade_horas;
ALTER TABLE public.maintenance_records
  ADD COLUMN indisponibilidade_horas numeric(10,2)
  GENERATED ALWAYS AS (
    CASE WHEN entrada_oficina IS NOT NULL AND saida_oficina IS NOT NULL
         THEN round((EXTRACT(EPOCH FROM (saida_oficina - entrada_oficina)) / 3600)::numeric, 2)
    END
  ) STORED;

COMMENT ON COLUMN public.maintenance_records.numero_os IS 'Número da OS, gerado na primeira gravação: OS-AAAA-0001 por ano.';
COMMENT ON COLUMN public.maintenance_records.custo_pecas_estoque IS 'Soma das peças vindas do estoque. Informativo: esse valor já virou custo da obra na saída do almoxarifado e NÃO entra em `custo`.';
COMMENT ON COLUMN public.maintenance_records.custo_pecas_compradas IS 'Peças compradas direto para a OS, que não passaram pelo estoque. Entram em `custo`.';
COMMENT ON COLUMN public.maintenance_records.indisponibilidade_horas IS 'Horas entre entrada e saída da oficina.';

-- ─── 2. NUMERAÇÃO DA OS ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.manutencao_fn_numero_os()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ano  text := to_char(COALESCE(NEW.data_agendada, current_date), 'YYYY');
  v_seq  integer;
BEGIN
  IF NEW.numero_os IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(MAX(substring(numero_os from 'OS-' || v_ano || '-(\d+)')::integer), 0) + 1
  INTO   v_seq
  FROM   public.maintenance_records
  WHERE  numero_os LIKE 'OS-' || v_ano || '-%';

  NEW.numero_os := 'OS-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_manutencao_numero_os ON public.maintenance_records;
CREATE TRIGGER trg_manutencao_numero_os
  BEFORE INSERT ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.manutencao_fn_numero_os();

-- Registros antigos ficam sem número — numerar depois mudaria o histórico.

-- ─── 3. PEÇAS DA OS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.manutencao_pecas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_id uuid NOT NULL REFERENCES public.maintenance_records(id) ON DELETE CASCADE,
  material_id    uuid REFERENCES public.materiais_catalogo(id) ON DELETE SET NULL,
  descricao      text NOT NULL,
  quantidade     numeric(14,3) NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric(14,4) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total    numeric(16,2) GENERATED ALWAYS AS (round(quantidade * valor_unitario, 2)) STORED,
  -- 'estoque' já foi custeada na saída do almoxarifado; 'compra' entra no custo da OS.
  origem         text NOT NULL DEFAULT 'compra' CHECK (origem IN ('estoque', 'compra')),
  movimento_id   uuid REFERENCES public.almoxarifado_movimentos(id) ON DELETE SET NULL,
  observacoes    text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manutencao_pecas_os ON public.manutencao_pecas(maintenance_id);

COMMENT ON TABLE public.manutencao_pecas IS 'Peças aplicadas na OS. Origem estoque gera saída no almoxarifado e já é custeada lá; origem compra entra no custo da OS.';

-- ─── 4. TOTAIS DA OS ────────────────────────────────────────────────────────
-- `custo` continua sendo o que o Orçado × Realizado consome. Quando a OS tem
-- detalhamento, ele passa a ser calculado — peça de estoque de fora, para não
-- cobrar duas vezes. Sem detalhamento, o valor digitado continua valendo.

CREATE OR REPLACE FUNCTION public.manutencao_fn_totais_os(p_maintenance_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estoque  numeric(14,2);
  v_comprada numeric(14,2);
  v_mao_obra numeric(14,2);
BEGIN
  SELECT COALESCE(sum(valor_total) FILTER (WHERE origem = 'estoque'), 0),
         COALESCE(sum(valor_total) FILTER (WHERE origem = 'compra'), 0)
  INTO   v_estoque, v_comprada
  FROM   public.manutencao_pecas WHERE maintenance_id = p_maintenance_id;

  SELECT COALESCE(custo_mao_obra, 0) INTO v_mao_obra
  FROM public.maintenance_records WHERE id = p_maintenance_id;

  UPDATE public.maintenance_records
  SET custo_pecas_estoque   = v_estoque,
      custo_pecas_compradas = v_comprada,
      custo = CASE WHEN v_comprada > 0 OR v_mao_obra > 0
                   THEN v_comprada + v_mao_obra
                   ELSE custo END,
      updated_at = now()
  WHERE id = p_maintenance_id;
END $$;

CREATE OR REPLACE FUNCTION public.manutencao_fn_pecas_apos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.manutencao_fn_totais_os(COALESCE(NEW.maintenance_id, OLD.maintenance_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_manutencao_pecas_totais ON public.manutencao_pecas;
CREATE TRIGGER trg_manutencao_pecas_totais
  AFTER INSERT OR UPDATE OR DELETE ON public.manutencao_pecas
  FOR EACH ROW EXECUTE FUNCTION public.manutencao_fn_pecas_apos();

-- Mudou a mão de obra, o total da OS acompanha.
CREATE OR REPLACE FUNCTION public.manutencao_fn_mao_obra_apos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.custo_mao_obra IS DISTINCT FROM OLD.custo_mao_obra THEN
    PERFORM public.manutencao_fn_totais_os(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_manutencao_mao_obra_totais ON public.maintenance_records;
CREATE TRIGGER trg_manutencao_mao_obra_totais
  AFTER UPDATE OF custo_mao_obra ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.manutencao_fn_mao_obra_apos();

-- ─── 5. APLICAR PEÇA ────────────────────────────────────────────────────────
-- Uma chamada resolve os dois lados: baixa no estoque (quando vem de lá, pela
-- RPC oficial do almoxarifado, que valida permissão e custo médio) e o registro
-- na OS. Sem isso, estoque e OS ficariam contando histórias diferentes.

CREATE OR REPLACE FUNCTION public.manutencao_aplicar_peca(
  p_maintenance_id uuid,
  p_descricao      text,
  p_quantidade     numeric,
  p_origem         text DEFAULT 'compra',
  p_material_id    uuid DEFAULT NULL,
  p_valor_unitario numeric DEFAULT NULL,
  p_observacoes    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os          public.maintenance_records%ROWTYPE;
  v_movimento   uuid;
  v_unitario    numeric(14,4);
  v_peca_id     uuid;
  v_nome        text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária.'; END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser maior que zero.'; END IF;
  IF p_origem NOT IN ('estoque','compra') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;

  SELECT * INTO v_os FROM public.maintenance_records WHERE id = p_maintenance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de serviço não encontrada.'; END IF;

  IF p_origem = 'estoque' THEN
    IF p_material_id IS NULL THEN
      RAISE EXCEPTION 'Peça do estoque exige o material do catálogo.';
    END IF;
    IF v_os.obra_id IS NULL THEN
      RAISE EXCEPTION 'A manutenção precisa estar vinculada a uma obra para dar baixa no estoque.';
    END IF;

    -- A RPC do almoxarifado valida permissão na obra, baixa o saldo e calcula
    -- o custo médio. É ela que também lança o custo na obra.
    v_movimento := public.registrar_movimentacao_almoxarifado(
      v_os.obra_id, p_material_id, 'saida', p_quantidade, NULL,
      'Manutenção ' || COALESCE(v_os.numero_os, ''), NULL, NULL, NULL,
      'Peça aplicada na OS ' || COALESCE(v_os.numero_os, v_os.id::text),
      COALESCE(v_os.data_realizada, current_date), NULL
    );

    SELECT COALESCE(custo_unitario, 0) INTO v_unitario
    FROM public.almoxarifado_movimentos WHERE id = v_movimento;
  ELSE
    v_unitario := COALESCE(p_valor_unitario, 0);
  END IF;

  IF p_material_id IS NOT NULL THEN
    SELECT nome INTO v_nome FROM public.materiais_catalogo WHERE id = p_material_id;
  END IF;

  INSERT INTO public.manutencao_pecas (
    maintenance_id, material_id, descricao, quantidade, valor_unitario,
    origem, movimento_id, observacoes, created_by
  ) VALUES (
    p_maintenance_id, p_material_id,
    COALESCE(NULLIF(trim(p_descricao), ''), v_nome, 'Peça'),
    p_quantidade, COALESCE(v_unitario, 0),
    p_origem, v_movimento, p_observacoes, auth.uid()
  )
  RETURNING id INTO v_peca_id;

  RETURN v_peca_id;
END $$;

REVOKE ALL ON FUNCTION public.manutencao_aplicar_peca(uuid,text,numeric,text,uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manutencao_aplicar_peca(uuid,text,numeric,text,uuid,numeric,text) TO authenticated;

COMMENT ON FUNCTION public.manutencao_aplicar_peca(uuid,text,numeric,text,uuid,numeric,text) IS 'Registra peça na OS. Origem estoque dá baixa pela RPC do almoxarifado e herda o custo médio; origem compra usa o valor informado.';

-- ─── 6. VISÃO DA OS ─────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_manutencao_os AS
SELECT
  m.id, m.numero_os, m.vehicle_id, v.placa, v.marca, v.modelo,
  m.obra_id, o.nome AS obra_nome,
  m.tipo, m.status, m.descricao,
  m.data_agendada, m.data_realizada,
  m.entrada_oficina, m.saida_oficina, m.indisponibilidade_horas,
  m.fornecedor_id, f.nome AS fornecedor_nome, m.oficina,
  m.quilometragem, m.horimetro,
  m.horas_mao_obra, COALESCE(m.custo_mao_obra, 0) AS custo_mao_obra,
  m.custo_pecas_estoque, m.custo_pecas_compradas,
  COALESCE(m.custo, 0) AS custo_os,
  COALESCE(m.custo, 0) + m.custo_pecas_estoque AS custo_total_com_estoque,
  (SELECT count(*) FROM public.manutencao_pecas p WHERE p.maintenance_id = m.id) AS pecas,
  m.plano_item_id, i.servico AS servico_plano,
  m.created_at
FROM public.maintenance_records m
JOIN public.vehicles v ON v.id = m.vehicle_id
LEFT JOIN public.obras o ON o.id = m.obra_id
LEFT JOIN public.fornecedores f ON f.id = m.fornecedor_id
LEFT JOIN public.manutencao_plano_itens i ON i.id = m.plano_item_id;

COMMENT ON VIEW public.v_manutencao_os IS 'Ordem de serviço com oficina, indisponibilidade, mão de obra e peças. `custo_os` é o que vai para o Orçado × Realizado; `custo_total_com_estoque` inclui a peça já custeada pelo almoxarifado, para leitura gerencial.';

-- ─── 7. PERMISSÕES ──────────────────────────────────────────────────────────

ALTER TABLE public.manutencao_pecas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manutencao_pecas_read ON public.manutencao_pecas;
CREATE POLICY manutencao_pecas_read ON public.manutencao_pecas FOR SELECT TO authenticated
  USING (public.pode_geral('manutencao.visualizar') OR public.pode_geral('frota.visualizar'));

DROP POLICY IF EXISTS manutencao_pecas_write ON public.manutencao_pecas;
CREATE POLICY manutencao_pecas_write ON public.manutencao_pecas FOR ALL TO authenticated
  USING (public.pode_geral('manutencao.editar'))
  WITH CHECK (public.pode_geral('manutencao.editar'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencao_pecas TO authenticated;
GRANT SELECT ON public.v_manutencao_os TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.manutencao_pecas;
    CREATE TRIGGER trg_auditoria_sistema
      AFTER INSERT OR UPDATE OR DELETE ON public.manutencao_pecas
      FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao();
  END IF;
END $$;

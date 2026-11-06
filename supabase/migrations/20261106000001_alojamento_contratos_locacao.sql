-- ============================================================================
-- Contratos de locação do alojamento: casa alugada e terreno alugado
--
-- Hoje o aluguel vive em quatro colunas soltas de `alojamentos`:
-- proprietario_fornecedor (texto livre), contrato_numero, contrato_inicio/fim
-- e valor_mensal. Isso atende o caso simples e falha em três pontos que
-- aparecem na operação real:
--
--   1. REAJUSTE REESCREVE O PASSADO. valor_mensal é um número só. Quando o
--      aluguel sobe, a view de custos passa a aplicar o valor novo a TODOS os
--      meses anteriores — o custo histórico da obra muda sozinho, sem que
--      ninguém tenha lançado nada. É o mais caro dos três, porque corrompe o
--      Orçado x Realizado para trás.
--
--   2. O LOCADOR É TEXTO LIVRE. Não dá para somar quanto se paga a cada
--      locador, nem aproveitar CNPJ e contato que já existem no cadastro de
--      fornecedores.
--
--   3. TERRENO ALUGADO NÃO CABE. Quando a empresa aluga o terreno e constrói
--      a própria estrutura em cima, o aluguel é do COMPLEXO, não de uma casa.
--      Marcar a unidade como "alugada" paga o custo certo pelo motivo errado:
--      a estrutura é nossa, o chão é que não é.
--
-- A tabela abaixo resolve os três. Um contrato vale por um período; contratos
-- em sequência formam o histórico, e cada mês usa o que estava vigente nele.
-- O escopo segue a convenção que alojamento_despesas já usa: alojamento_id
-- nulo significa contrato do complexo, que é o caso do terreno.
--
-- Os dados que existem hoje são migrados. As colunas antigas continuam no
-- lugar para nada quebrar.
--
-- Idempotente. Rodar inteiro.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alojamento_contratos_locacao (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complexo_id    uuid NOT NULL REFERENCES public.alojamento_complexos(id) ON DELETE CASCADE,
  -- NULL = contrato do complexo (terreno). Preenchido = daquela unidade (casa).
  alojamento_id  uuid REFERENCES public.alojamentos(id) ON DELETE CASCADE,

  objeto         text NOT NULL DEFAULT 'imovel'
                 CHECK (objeto IN ('imovel','terreno','hospedagem','outro')),

  -- O locador vem do cadastro de fornecedores. nome_locador atende quem ainda
  -- não está cadastrado e preserva o texto que já existia.
  fornecedor_id  uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  nome_locador   text,

  numero         text,
  data_inicio    date NOT NULL,
  data_fim       date,
  valor_mensal   numeric(14,2) NOT NULL CHECK (valor_mensal >= 0),
  dia_vencimento integer CHECK (dia_vencimento IS NULL OR dia_vencimento BETWEEN 1 AND 31),

  reajuste_indice   text CHECK (reajuste_indice IS NULL OR reajuste_indice IN ('igpm','ipca','incc','fixo','outro')),
  reajuste_mes_base integer CHECK (reajuste_mes_base IS NULL OR reajuste_mes_base BETWEEN 1 AND 12),

  -- Encerrado antes do fim previsto: a data real manda no cálculo do custo.
  encerrado_em        date,
  motivo_encerramento text,

  arquivo_url    text,
  observacoes    text,
  criado_por     uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aloj_contrato_periodo   CHECK (data_fim IS NULL OR data_fim >= data_inicio),
  CONSTRAINT aloj_contrato_encerrado CHECK (encerrado_em IS NULL OR encerrado_em >= data_inicio),
  -- Sem locador o contrato não serve nem para pagar nem para conferir.
  CONSTRAINT aloj_contrato_tem_locador
    CHECK (fornecedor_id IS NOT NULL OR NULLIF(btrim(COALESCE(nome_locador,'')),'') IS NOT NULL)
);

COMMENT ON TABLE public.alojamento_contratos_locacao IS
  'Contratos de locação do alojamento. alojamento_id nulo = contrato do complexo (terreno alugado onde a empresa monta estrutura própria); preenchido = imóvel alugado. Contratos em sequência formam o histórico: cada mês de custo usa o que estava vigente nele, então reajuste não reescreve o passado.';

COMMENT ON COLUMN public.alojamento_contratos_locacao.objeto IS
  'imovel = casa ou apartamento alugado pronto. terreno = chão alugado onde a empresa monta estrutura própria. hospedagem = hotel ou pousada contratada por mês.';

CREATE INDEX IF NOT EXISTS idx_aloj_contrato_complexo   ON public.alojamento_contratos_locacao(complexo_id, data_inicio);
CREATE INDEX IF NOT EXISTS idx_aloj_contrato_alojamento ON public.alojamento_contratos_locacao(alojamento_id) WHERE alojamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aloj_contrato_fornecedor ON public.alojamento_contratos_locacao(fornecedor_id) WHERE fornecedor_id IS NOT NULL;

-- ─── A unidade precisa ser do complexo, e os períodos não podem se sobrepor ──
-- Dois contratos vigentes para o mesmo objeto no mesmo mês dobrariam o custo
-- da obra sem que ninguém percebesse.

CREATE OR REPLACE FUNCTION public.alojamento_contrato_validar()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE v_conflito text;
BEGIN
  IF NEW.alojamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.alojamentos
    WHERE id = NEW.alojamento_id AND complexo_id = NEW.complexo_id
  ) THEN
    RAISE EXCEPTION 'A unidade escolhida não pertence a este complexo.';
  END IF;

  SELECT COALESCE(c.numero, 'sem número') INTO v_conflito
  FROM public.alojamento_contratos_locacao c
  WHERE c.id <> NEW.id
    AND c.complexo_id = NEW.complexo_id
    AND c.alojamento_id IS NOT DISTINCT FROM NEW.alojamento_id
    AND daterange(c.data_inicio, COALESCE(c.encerrado_em, c.data_fim), '[]')
        && daterange(NEW.data_inicio, COALESCE(NEW.encerrado_em, NEW.data_fim), '[]')
  LIMIT 1;

  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe contrato vigente para este objeto no período (contrato %). Encerre o anterior antes de iniciar o novo.', v_conflito;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_aloj_contrato_validar ON public.alojamento_contratos_locacao;
CREATE TRIGGER trg_aloj_contrato_validar
  BEFORE INSERT OR UPDATE ON public.alojamento_contratos_locacao
  FOR EACH ROW EXECUTE FUNCTION public.alojamento_contrato_validar();

DROP TRIGGER IF EXISTS trg_updated_at ON public.alojamento_contratos_locacao;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.alojamento_contratos_locacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $do$ BEGIN
  IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.alojamento_contratos_locacao;
    CREATE TRIGGER trg_auditoria_sistema
      AFTER INSERT OR UPDATE OR DELETE ON public.alojamento_contratos_locacao
      FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao();
  END IF;
END $do$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.alojamento_contratos_locacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aloj_contrato_select ON public.alojamento_contratos_locacao;
CREATE POLICY aloj_contrato_select
  ON public.alojamento_contratos_locacao FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.alojamento_complexos c
    WHERE c.id = complexo_id AND public.pode('alojamento.visualizar', c.obra_id)
  ) OR public.access_is_admin());

DROP POLICY IF EXISTS aloj_contrato_manage ON public.alojamento_contratos_locacao;
CREATE POLICY aloj_contrato_manage
  ON public.alojamento_contratos_locacao FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.alojamento_complexos c
    WHERE c.id = complexo_id AND public.pode('alojamento.editar', c.obra_id)
  ) OR public.access_is_admin())
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.alojamento_complexos c
    WHERE c.id = complexo_id AND public.pode('alojamento.editar', c.obra_id)
  ) OR public.access_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alojamento_contratos_locacao TO authenticated;

-- ─── Traz o que já está cadastrado nas colunas soltas ───────────────────────

DO $do$
DECLARE v_migrados integer := 0;
BEGIN
  INSERT INTO public.alojamento_contratos_locacao (
    complexo_id, alojamento_id, objeto, nome_locador, numero,
    data_inicio, data_fim, valor_mensal, observacoes, created_at
  )
  SELECT
    a.complexo_id, a.id,
    CASE WHEN a.regime = 'hospedagem' THEN 'hospedagem' ELSE 'imovel' END,
    -- Sem locador informado, o nome da unidade evita perder o registro na
    -- restrição e deixa claro o que falta preencher.
    COALESCE(NULLIF(btrim(COALESCE(a.proprietario_fornecedor, '')), ''),
             'Locador não informado — ' || a.nome),
    a.contrato_numero,
    COALESCE(a.contrato_inicio, date_trunc('month', a.created_at)::date),
    a.contrato_fim,
    a.valor_mensal,
    'Migrado dos campos de contrato da unidade.',
    a.created_at
  FROM public.alojamentos a
  WHERE a.valor_mensal > 0
    AND a.regime IN ('alugado','hospedagem','terceirizado')
    AND NOT EXISTS (
      SELECT 1 FROM public.alojamento_contratos_locacao c WHERE c.alojamento_id = a.id
    );

  GET DIAGNOSTICS v_migrados = ROW_COUNT;
  RAISE NOTICE 'Contratos de locação criados a partir das unidades: %', v_migrados;
END $do$;

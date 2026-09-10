-- ─── Alojamento: custos mensais e base de cálculo por alojado ──────────────
--
-- Custo do alojamento = despesas lançadas (água, energia, limpeza…)
--                     + aluguel do contrato da unidade
--                     + custo dos chamados de manutenção concluídos.
--
-- A base "por alojado" é a diária (alojado × dia). Mês com gente entrando e
-- saindo não distorce o indicador: 30 pessoas por 10 dias contam como 300
-- diárias, não como 30 alojados.

CREATE TABLE IF NOT EXISTS public.alojamento_despesas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complexo_id    uuid NOT NULL REFERENCES public.alojamento_complexos(id) ON DELETE CASCADE,
  -- NULL = despesa do complexo inteiro, rateada entre as unidades pela ocupação
  alojamento_id  uuid REFERENCES public.alojamentos(id) ON DELETE CASCADE,
  competencia    date NOT NULL CHECK (EXTRACT(day FROM competencia) = 1),
  categoria      text NOT NULL CHECK (categoria IN (
                   'agua','energia','gas','internet','limpeza','higiene','alimentacao',
                   'lavanderia','dedetizacao','aluguel_extra','outros')),
  descricao      text,
  valor          numeric(14,2) NOT NULL CHECK (valor >= 0),
  quantidade     numeric(14,3) CHECK (quantidade IS NULL OR quantidade >= 0),
  unidade_medida text,
  fornecedor     text,
  documento      text,
  data_pagamento date,
  observacoes    text,
  criado_por     uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aloj_desp_competencia ON public.alojamento_despesas(competencia, complexo_id);
CREATE INDEX IF NOT EXISTS idx_aloj_desp_alojamento  ON public.alojamento_despesas(alojamento_id) WHERE alojamento_id IS NOT NULL;

-- A unidade precisa pertencer ao complexo informado
CREATE OR REPLACE FUNCTION public.alojamento_despesa_validar()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.alojamento_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.alojamentos WHERE id = NEW.alojamento_id AND complexo_id = NEW.complexo_id) THEN
    RAISE EXCEPTION 'A unidade escolhida não pertence a este complexo';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_aloj_desp_validar ON public.alojamento_despesas;
CREATE TRIGGER trg_aloj_desp_validar BEFORE INSERT OR UPDATE ON public.alojamento_despesas
  FOR EACH ROW EXECUTE FUNCTION public.alojamento_despesa_validar();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.alojamento_despesas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
    CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.alojamento_despesas
      FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao();
  END IF;
END $$;

ALTER TABLE public.alojamento_despesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY despesas_select ON public.alojamento_despesas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.alojamento_complexos c
                 WHERE c.id = complexo_id AND public.alojamento_pode_acessar(c.obra_id, false)));
CREATE POLICY despesas_write ON public.alojamento_despesas FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.alojamento_complexos c
                      WHERE c.id = complexo_id AND public.alojamento_pode_acessar(c.obra_id, true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.alojamento_complexos c
                      WHERE c.id = complexo_id AND public.alojamento_pode_acessar(c.obra_id, true)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alojamento_despesas TO authenticated;

-- ─── Custos do período, por mês, unidade e categoria ────────────────────────
CREATE OR REPLACE FUNCTION public.alojamento_custos_periodo(p_inicio date, p_fim date)
RETURNS TABLE (competencia date, complexo_id uuid, alojamento_id uuid, categoria text,
               valor numeric, quantidade numeric, unidade_medida text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  -- Despesas lançadas
  SELECT d.competencia, d.complexo_id, d.alojamento_id, d.categoria,
         sum(d.valor), sum(d.quantidade), max(d.unidade_medida)
  FROM public.alojamento_despesas d
  JOIN public.alojamento_complexos c ON c.id = d.complexo_id
  WHERE d.competencia >= date_trunc('month', p_inicio)::date
    AND d.competencia <= date_trunc('month', p_fim)::date
    AND public.alojamento_pode_acessar(c.obra_id, false)
  GROUP BY 1, 2, 3, 4

  UNION ALL

  -- Aluguel: mês cheio de cada contrato vigente no mês
  SELECT m::date, a.complexo_id, a.id, 'aluguel', a.valor_mensal, NULL, NULL
  FROM public.alojamentos a
  CROSS JOIN generate_series(date_trunc('month', p_inicio), date_trunc('month', p_fim), interval '1 month') m
  WHERE a.valor_mensal IS NOT NULL AND a.valor_mensal > 0
    AND a.regime IN ('alugado', 'hospedagem', 'terceirizado')
    AND (a.contrato_inicio IS NULL OR a.contrato_inicio < (m + interval '1 month')::date)
    AND (a.contrato_fim    IS NULL OR a.contrato_fim >= m::date)
    AND public.alojamento_pode_acessar(a.obra_id, false)

  UNION ALL

  -- Manutenção: custo dos chamados concluídos no mês
  SELECT date_trunc('month', ch.concluido_em)::date, a.complexo_id, a.id, 'manutencao',
         sum(ch.custo), NULL, NULL
  FROM public.alojamento_chamados ch
  JOIN public.alojamentos a ON a.id = ch.alojamento_id
  WHERE ch.status = 'concluido' AND ch.custo IS NOT NULL AND ch.custo > 0
    AND ch.concluido_em >= date_trunc('month', p_inicio)
    AND ch.concluido_em <  date_trunc('month', p_fim) + interval '1 month'
    AND public.alojamento_pode_acessar(a.obra_id, false)
  GROUP BY 1, 2, 3
$$;

-- ─── Diárias, entradas e saídas por mês e unidade ───────────────────────────
-- Transferência gera uma ocupação nova: ela conta nas diárias (a pessoa
-- dormiu lá), mas não como entrada nem saída do alojamento.
CREATE OR REPLACE FUNCTION public.alojamento_diarias_periodo(p_inicio date, p_fim date)
RETURNS TABLE (competencia date, alojamento_id uuid, diarias numeric,
               alojados integer, entradas integer, saidas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH meses AS (
    SELECT m::date AS ini, (m + interval '1 month')::date AS fim
    FROM generate_series(date_trunc('month', p_inicio), date_trunc('month', p_fim), interval '1 month') m
  ), oc AS (
    SELECT o.employee_id, o.data_entrada, o.data_saida, o.observacoes, o.motivo_saida, am.alojamento_id
    FROM public.alojamento_ocupacoes o
    JOIN public.alojamento_leitos l     ON l.id  = o.leito_id
    JOIN public.alojamento_ambientes am ON am.id = l.quarto_id
    JOIN public.alojamentos a           ON a.id  = am.alojamento_id
    WHERE public.alojamento_pode_acessar(a.obra_id, false)
  )
  SELECT me.ini, oc.alojamento_id,
         round(sum(GREATEST(0, EXTRACT(epoch FROM (
           LEAST(COALESCE(oc.data_saida, now()), me.fim::timestamptz)
           - GREATEST(oc.data_entrada, me.ini::timestamptz))) / 86400))::numeric, 1),
         count(DISTINCT oc.employee_id)::int,
         count(*) FILTER (WHERE oc.data_entrada >= me.ini AND oc.data_entrada < me.fim
                            AND COALESCE(oc.observacoes, '') NOT LIKE 'Transferido da ocupação%')::int,
         count(*) FILTER (WHERE oc.data_saida >= me.ini AND oc.data_saida < me.fim
                            AND COALESCE(oc.motivo_saida, '') NOT LIKE 'Transferência:%')::int
  FROM meses me
  JOIN oc ON oc.data_entrada < me.fim AND COALESCE(oc.data_saida, now()) > me.ini
  GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION public.alojamento_custos_periodo(date, date), public.alojamento_diarias_periodo(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alojamento_custos_periodo(date, date), public.alojamento_diarias_periodo(date, date) TO authenticated;

-- ============================================================================
-- Plano de manutenção preventiva (Bloco 1)
--
-- Hoje o sistema tem um intervalo único para a frota inteira em `fleet_config`
-- (10.000 km / 180 dias) e um lembrete que só aparece no app do motorista. Isso
-- é lembrete, não plano: não distingue caminhonete de escavadeira, ignora
-- horímetro e, se o veículo nunca teve preventiva concluída, não avisa nada.
--
-- Esta migration traz o plano de verdade:
--   · plano com itens de serviço (óleo, filtro, correia...), cada item com
--     gatilho em km, horas e dias — vale o que vencer primeiro;
--   · plano aplicado a vários veículos, com LINHA DE BASE no momento da
--     aplicação, para veículo sem histórico já nascer com vencimento;
--   · execução amarrada ao item do plano: concluir a manutenção zera o
--     contador daquele item, não do plano inteiro.
--
-- O `fleet_config` continua valendo como padrão de quem não tem plano, então
-- nada do que existe hoje para de funcionar.
--
-- Rodar inteiro, de uma vez, no SQL editor. Idempotente.
-- ============================================================================

-- ─── 1. PLANO ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.manutencao_planos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  descricao   text,
  -- Referência de origem: manual do fabricante, norma interna, contrato.
  fonte       text,
  ativo       boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manutencao_planos_ativo ON public.manutencao_planos(ativo) WHERE ativo;

-- ─── 2. ITENS DO PLANO ──────────────────────────────────────────────────────
-- Cada item é um serviço com seu próprio ciclo. Um plano de caminhonete tem
-- óleo a cada 10.000 km, correia a cada 60.000 e revisão anual no mesmo plano.

CREATE TABLE IF NOT EXISTS public.manutencao_plano_itens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id          uuid NOT NULL REFERENCES public.manutencao_planos(id) ON DELETE CASCADE,
  ordem             integer NOT NULL DEFAULT 0,
  servico           text NOT NULL,
  descricao         text,
  -- Gatilhos. Pelo menos um é obrigatório; quando há mais de um, vence o primeiro.
  intervalo_km      integer CHECK (intervalo_km    IS NULL OR intervalo_km    BETWEEN 100 AND 500000),
  intervalo_horas   numeric(10,1) CHECK (intervalo_horas IS NULL OR intervalo_horas BETWEEN 10 AND 50000),
  intervalo_dias    integer CHECK (intervalo_dias   IS NULL OR intervalo_dias   BETWEEN 1 AND 3650),
  -- Antecedência do aviso, por gatilho.
  antecedencia_km    integer NOT NULL DEFAULT 500  CHECK (antecedencia_km    >= 0),
  antecedencia_horas numeric(10,1) NOT NULL DEFAULT 20 CHECK (antecedencia_horas >= 0),
  antecedencia_dias  integer NOT NULL DEFAULT 15   CHECK (antecedencia_dias  >= 0),
  -- Parar o veículo quando vencer é decisão de segurança, não de rotina.
  bloqueia_veiculo  boolean NOT NULL DEFAULT false,
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manutencao_item_tem_gatilho CHECK (
    intervalo_km IS NOT NULL OR intervalo_horas IS NOT NULL OR intervalo_dias IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_manutencao_itens_plano ON public.manutencao_plano_itens(plano_id, ordem);

-- ─── 3. APLICAÇÃO A VEÍCULOS, COM LINHA DE BASE ─────────────────────────────
-- A base é o que resolve a lacuna do veículo sem histórico: ao aplicar o plano,
-- grava-se o km, o horímetro e a data do momento. O primeiro vencimento conta
-- a partir daí, mesmo que nunca tenha havido preventiva registrada.

CREATE TABLE IF NOT EXISTS public.manutencao_plano_veiculos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id       uuid NOT NULL REFERENCES public.manutencao_planos(id) ON DELETE CASCADE,
  vehicle_id     uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  base_km        integer,
  base_horimetro numeric(12,1),
  base_data      date NOT NULL DEFAULT current_date,
  aplicado_por   uuid REFERENCES auth.users(id),
  aplicado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plano_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_manutencao_plano_veiculos_veic ON public.manutencao_plano_veiculos(vehicle_id);

-- Sem base informada, usa a medição atual do veículo — o plano começa a valer
-- de hoje em diante, e não retroativamente.
CREATE OR REPLACE FUNCTION public.manutencao_fn_base_aplicacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.base_km IS NULL OR NEW.base_horimetro IS NULL THEN
    SELECT COALESCE(NEW.base_km, v.quilometragem_atual, 0),
           COALESCE(NEW.base_horimetro, v.horimetro_atual, 0)
    INTO   NEW.base_km, NEW.base_horimetro
    FROM   public.vehicles v WHERE v.id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_manutencao_base_aplicacao ON public.manutencao_plano_veiculos;
CREATE TRIGGER trg_manutencao_base_aplicacao
  BEFORE INSERT ON public.manutencao_plano_veiculos
  FOR EACH ROW EXECUTE FUNCTION public.manutencao_fn_base_aplicacao();

-- ─── 4. EXECUÇÃO AMARRADA AO ITEM ───────────────────────────────────────────
-- A manutenção continua sendo `maintenance_records`; o que muda é poder dizer
-- qual item do plano ela cumpriu — e registrar horímetro, que até agora não
-- existia na manutenção.

ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS plano_item_id uuid REFERENCES public.manutencao_plano_itens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS horimetro numeric(12,1);

CREATE INDEX IF NOT EXISTS idx_maintenance_plano_item
  ON public.maintenance_records(vehicle_id, plano_item_id, data_realizada DESC)
  WHERE plano_item_id IS NOT NULL;

COMMENT ON COLUMN public.maintenance_records.plano_item_id IS 'Item do plano que esta manutenção cumpriu. Concluída, zera o contador daquele item — não do plano inteiro.';
COMMENT ON COLUMN public.maintenance_records.horimetro IS 'Horímetro no momento do serviço, para o gatilho por hora de equipamento.';

-- ─── 5. VENCIMENTOS ─────────────────────────────────────────────────────────
-- Para cada veículo com plano, calcula o próximo vencimento de cada item em
-- km, horas e dias, e diz qual gatilho chega primeiro.
--
-- Referência de cálculo: a última execução concluída daquele item; se não
-- houver, a linha de base da aplicação do plano.

CREATE OR REPLACE VIEW public.v_manutencao_vencimentos AS
WITH base AS (
  SELECT
    pv.vehicle_id,
    v.placa,
    v.marca,
    v.modelo,
    v.tipo_medicao,
    COALESCE(v.quilometragem_atual, 0)      AS km_atual,
    COALESCE(v.horimetro_atual, 0)::numeric AS horimetro_atual,
    p.id   AS plano_id,
    p.nome AS plano_nome,
    i.id   AS item_id,
    i.servico,
    i.intervalo_km,
    i.intervalo_horas,
    i.intervalo_dias,
    i.antecedencia_km,
    i.antecedencia_horas,
    i.antecedencia_dias,
    i.bloqueia_veiculo,
    ult.data_realizada AS ultima_data,
    ult.quilometragem  AS ultimo_km,
    ult.horimetro      AS ultimo_horimetro,
    COALESCE(ult.quilometragem, pv.base_km, 0)        AS ref_km,
    COALESCE(ult.horimetro, pv.base_horimetro, 0)     AS ref_horimetro,
    COALESCE(ult.data_realizada, pv.base_data)        AS ref_data
  FROM public.manutencao_plano_veiculos pv
  JOIN public.vehicles v              ON v.id = pv.vehicle_id
  JOIN public.manutencao_planos p     ON p.id = pv.plano_id AND p.ativo
  JOIN public.manutencao_plano_itens i ON i.plano_id = p.id AND i.ativo
  LEFT JOIN LATERAL (
    SELECT m.data_realizada, m.quilometragem, m.horimetro
    FROM   public.maintenance_records m
    WHERE  m.vehicle_id = pv.vehicle_id
      AND  m.plano_item_id = i.id
      AND  m.status = 'concluida'
    ORDER BY m.data_realizada DESC NULLS LAST
    LIMIT 1
  ) ult ON true
), calculado AS (
  SELECT
    base.*,
    CASE WHEN intervalo_km    IS NOT NULL THEN ref_km + intervalo_km END          AS proximo_km,
    CASE WHEN intervalo_horas IS NOT NULL THEN ref_horimetro + intervalo_horas END AS proximo_horimetro,
    CASE WHEN intervalo_dias  IS NOT NULL THEN ref_data + intervalo_dias END      AS proxima_data
  FROM base
), restante AS (
  SELECT
    calculado.*,
    CASE WHEN proximo_km        IS NOT NULL THEN proximo_km - km_atual END               AS km_restante,
    CASE WHEN proximo_horimetro IS NOT NULL THEN proximo_horimetro - horimetro_atual END AS horas_restantes,
    CASE WHEN proxima_data      IS NOT NULL THEN proxima_data - current_date END         AS dias_restantes
  FROM calculado
)
SELECT
  vehicle_id, placa, marca, modelo, tipo_medicao,
  plano_id, plano_nome, item_id, servico, bloqueia_veiculo,
  km_atual, horimetro_atual,
  ultima_data, ultimo_km, ultimo_horimetro,
  ref_data, ref_km, ref_horimetro,
  proximo_km, proximo_horimetro, proxima_data,
  km_restante, horas_restantes, dias_restantes,
  -- Quanto falta, em percentual do gatilho mais adiantado (0 = vencendo agora).
  LEAST(
    COALESCE(CASE WHEN intervalo_km    > 0 THEN km_restante::numeric    / intervalo_km    END, 1),
    COALESCE(CASE WHEN intervalo_horas > 0 THEN horas_restantes         / intervalo_horas END, 1),
    COALESCE(CASE WHEN intervalo_dias  > 0 THEN dias_restantes::numeric / intervalo_dias  END, 1)
  ) AS folga_fracao,
  -- Qual gatilho chega primeiro, para a tela dizer "vence por km" ou "por hora".
  CASE
    WHEN km_restante IS NOT NULL AND km_restante <= 0 THEN 'km'
    WHEN horas_restantes IS NOT NULL AND horas_restantes <= 0 THEN 'horas'
    WHEN dias_restantes IS NOT NULL AND dias_restantes <= 0 THEN 'dias'
    WHEN COALESCE(CASE WHEN intervalo_km > 0 THEN km_restante::numeric / intervalo_km END, 1)
         <= LEAST(COALESCE(CASE WHEN intervalo_horas > 0 THEN horas_restantes / intervalo_horas END, 1),
                  COALESCE(CASE WHEN intervalo_dias  > 0 THEN dias_restantes::numeric / intervalo_dias END, 1))
         AND intervalo_km IS NOT NULL THEN 'km'
    WHEN COALESCE(CASE WHEN intervalo_horas > 0 THEN horas_restantes / intervalo_horas END, 1)
         <= COALESCE(CASE WHEN intervalo_dias > 0 THEN dias_restantes::numeric / intervalo_dias END, 1)
         AND intervalo_horas IS NOT NULL THEN 'horas'
    ELSE 'dias'
  END AS gatilho,
  CASE
    WHEN (km_restante IS NOT NULL AND km_restante <= 0)
      OR (horas_restantes IS NOT NULL AND horas_restantes <= 0)
      OR (dias_restantes IS NOT NULL AND dias_restantes <= 0) THEN 'vencida'
    WHEN (km_restante IS NOT NULL AND km_restante <= antecedencia_km)
      OR (horas_restantes IS NOT NULL AND horas_restantes <= antecedencia_horas)
      OR (dias_restantes IS NOT NULL AND dias_restantes <= antecedencia_dias) THEN 'a_vencer'
    ELSE 'em_dia'
  END AS situacao,
  (ultima_data IS NULL) AS sem_historico
FROM restante;

COMMENT ON VIEW public.v_manutencao_vencimentos IS 'Próximo vencimento de cada item de plano por veículo, em km, horas e dias — vale o que vencer primeiro. Sem execução registrada, conta a partir da linha de base da aplicação do plano.';

-- ─── 6. RESUMO DO PLANO ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_manutencao_planos_resumo AS
SELECT
  p.id, p.nome, p.descricao, p.fonte, p.ativo, p.created_at,
  (SELECT count(*) FROM public.manutencao_plano_itens i WHERE i.plano_id = p.id AND i.ativo)    AS itens,
  (SELECT count(*) FROM public.manutencao_plano_veiculos pv WHERE pv.plano_id = p.id)           AS veiculos,
  (SELECT count(*) FROM public.v_manutencao_vencimentos w WHERE w.plano_id = p.id AND w.situacao = 'vencida')  AS vencidas,
  (SELECT count(*) FROM public.v_manutencao_vencimentos w WHERE w.plano_id = p.id AND w.situacao = 'a_vencer') AS a_vencer
FROM public.manutencao_planos p;

COMMENT ON VIEW public.v_manutencao_planos_resumo IS 'Plano com contagem de itens, veículos aplicados e situação dos vencimentos.';

-- ─── 7. PERMISSÕES ──────────────────────────────────────────────────────────
-- Mesma autoridade do resto do módulo: manutencao.visualizar para ler,
-- manutencao.editar para manter o plano. Plano é da frota inteira, então a
-- checagem é geral, sem escopo de obra.

ALTER TABLE public.manutencao_planos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencao_plano_itens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencao_plano_veiculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manutencao_planos_read ON public.manutencao_planos;
CREATE POLICY manutencao_planos_read ON public.manutencao_planos FOR SELECT TO authenticated
  USING (public.pode_geral('manutencao.visualizar') OR public.pode_geral('frota.visualizar'));

DROP POLICY IF EXISTS manutencao_planos_write ON public.manutencao_planos;
CREATE POLICY manutencao_planos_write ON public.manutencao_planos FOR ALL TO authenticated
  USING (public.pode_geral('manutencao.editar'))
  WITH CHECK (public.pode_geral('manutencao.editar'));

DROP POLICY IF EXISTS manutencao_itens_read ON public.manutencao_plano_itens;
CREATE POLICY manutencao_itens_read ON public.manutencao_plano_itens FOR SELECT TO authenticated
  USING (public.pode_geral('manutencao.visualizar') OR public.pode_geral('frota.visualizar'));

DROP POLICY IF EXISTS manutencao_itens_write ON public.manutencao_plano_itens;
CREATE POLICY manutencao_itens_write ON public.manutencao_plano_itens FOR ALL TO authenticated
  USING (public.pode_geral('manutencao.editar'))
  WITH CHECK (public.pode_geral('manutencao.editar'));

DROP POLICY IF EXISTS manutencao_plano_veiculos_read ON public.manutencao_plano_veiculos;
CREATE POLICY manutencao_plano_veiculos_read ON public.manutencao_plano_veiculos FOR SELECT TO authenticated
  USING (public.pode_geral('manutencao.visualizar') OR public.pode_geral('frota.visualizar'));

DROP POLICY IF EXISTS manutencao_plano_veiculos_write ON public.manutencao_plano_veiculos;
CREATE POLICY manutencao_plano_veiculos_write ON public.manutencao_plano_veiculos FOR ALL TO authenticated
  USING (public.pode_geral('manutencao.editar'))
  WITH CHECK (public.pode_geral('manutencao.editar'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencao_planos         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencao_plano_itens    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencao_plano_veiculos TO authenticated;
GRANT SELECT ON public.v_manutencao_vencimentos    TO authenticated;
GRANT SELECT ON public.v_manutencao_planos_resumo  TO authenticated;

-- ─── 8. UPDATED_AT E AUDITORIA ──────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_manutencao_planos_updated_at ON public.manutencao_planos;
CREATE TRIGGER trg_manutencao_planos_updated_at
  BEFORE UPDATE ON public.manutencao_planos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_manutencao_itens_updated_at ON public.manutencao_plano_itens;
CREATE TRIGGER trg_manutencao_itens_updated_at
  BEFORE UPDATE ON public.manutencao_plano_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DO $$ DECLARE tab text; BEGIN
  IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
    FOREACH tab IN ARRAY ARRAY['manutencao_planos','manutencao_plano_itens','manutencao_plano_veiculos'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.%I', tab);
      EXECUTE format('CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao()', tab);
    END LOOP;
  END IF;
END $$;

-- ─── 9. DOCUMENTAÇÃO ────────────────────────────────────────────────────────

COMMENT ON TABLE  public.manutencao_planos IS 'Plano de manutenção preventiva. Substitui o intervalo único de fleet_config para os veículos que tiverem plano aplicado; os demais seguem no padrão antigo.';
COMMENT ON TABLE  public.manutencao_plano_itens IS 'Serviços do plano, cada um com seu ciclo. Vence o gatilho que chegar primeiro entre km, horas e dias.';
COMMENT ON TABLE  public.manutencao_plano_veiculos IS 'Veículos que seguem o plano, com a linha de base do momento da aplicação — é o que faz veículo sem histórico já ter vencimento.';
COMMENT ON COLUMN public.manutencao_plano_itens.bloqueia_veiculo IS 'Item que, vencido, recomenda tirar o veículo de operação. Usado pelo painel de vencimentos; não bloqueia sozinho.';
COMMENT ON COLUMN public.manutencao_plano_veiculos.base_km IS 'Km no momento da aplicação. Em branco, o gatilho assume a medição atual do veículo.';

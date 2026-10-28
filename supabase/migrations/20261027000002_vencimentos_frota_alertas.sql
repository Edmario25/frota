-- ============================================================================
-- Vencimentos da frota: documentos do veículo e alerta para quem decide (Bloco 2)
--
-- O plano de manutenção já calcula o que vence (v_manutencao_vencimentos), mas
-- ninguém é avisado: o lembrete existe só no app do motorista. E os documentos
-- do veículo — CRLV, seguro, IPVA, aferição de tacógrafo, inspeção — não
-- existiam em lugar nenhum, embora `fleet_config.alerta_documentacao_dias`
-- estivesse configurável na tela desde sempre.
--
-- Esta migration fecha as duas pontas:
--   · `vehicle_documentos` com vencimento e histórico de renovação;
--   · alerta em `sms_notificacoes` para gestor de frota e admin, de manutenção
--     vencida/a vencer e de documento vencido/a vencer, sem repetir no mesmo dia.
--
-- Rodar inteiro, de uma vez. Idempotente.
-- ============================================================================

-- ─── 1. DOCUMENTOS DO VEÍCULO ───────────────────────────────────────────────
-- Uma linha por documento vigente. Renovar é cadastrar o novo e arquivar o
-- anterior, preservando o histórico — documento vencido é prova de auditoria,
-- não lixo.

CREATE TABLE IF NOT EXISTS public.vehicle_documentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN (
                  'crlv', 'seguro', 'ipva', 'tacografo', 'inspecao_veicular',
                  'rntrc', 'licenca_ambiental', 'outro'
                )),
  descricao     text,
  numero        text,
  emissor       text,                      -- Detran, seguradora, oficina credenciada
  data_emissao  date,
  data_vencimento date NOT NULL,
  valor         numeric(14,2),
  arquivo_url   text,
  observacoes   text,
  -- Vigente é o que conta para alerta; o renovado vira histórico.
  vigente       boolean NOT NULL DEFAULT true,
  substituido_por uuid REFERENCES public.vehicle_documentos(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_doc_veiculo ON public.vehicle_documentos(vehicle_id, tipo, data_vencimento DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_doc_vigente ON public.vehicle_documentos(data_vencimento) WHERE vigente;

COMMENT ON TABLE  public.vehicle_documentos IS 'Documentos do veículo com vencimento. Tacógrafo é aferição periódica, obrigatória para carga acima de 4.536 kg e passageiros acima de dez lugares (CTB art. 105, II) — confirme a regra vigente com o jurídico.';
COMMENT ON COLUMN public.vehicle_documentos.vigente IS 'Só o vigente entra no alerta. Renovar cadastra o novo e marca o anterior como substituído.';

-- ─── 2. VENCIMENTO DOS DOCUMENTOS ───────────────────────────────────────────
-- A antecedência vem de fleet_config.alerta_documentacao_dias, que até agora
-- era uma configuração sem dado por trás.

CREATE OR REPLACE VIEW public.v_documentos_vencimentos AS
SELECT
  d.id,
  d.vehicle_id,
  v.placa,
  v.marca,
  v.modelo,
  d.tipo,
  d.descricao,
  d.numero,
  d.emissor,
  d.data_vencimento,
  d.valor,
  d.arquivo_url,
  (d.data_vencimento - current_date) AS dias_restantes,
  CASE
    WHEN d.data_vencimento < current_date THEN 'vencida'
    WHEN d.data_vencimento <= current_date + COALESCE(c.alerta_documentacao_dias, 30) THEN 'a_vencer'
    ELSE 'em_dia'
  END AS situacao
FROM public.vehicle_documentos d
JOIN public.vehicles v ON v.id = d.vehicle_id
LEFT JOIN public.fleet_config c ON c.id = 1
WHERE d.vigente;

COMMENT ON VIEW public.v_documentos_vencimentos IS 'Documentos vigentes com dias restantes e situação, usando a antecedência de fleet_config.';

-- ─── 3. TIPOS DE NOTIFICAÇÃO ────────────────────────────────────────────────

ALTER TABLE public.sms_notificacoes DROP CONSTRAINT IF EXISTS sms_notificacoes_tipo_check;
ALTER TABLE public.sms_notificacoes ADD CONSTRAINT sms_notificacoes_tipo_check CHECK (tipo IN (
  'vencimento_treinamento','vencimento_aso','vencimento_epi','vencimento_ca','estoque_minimo',
  'desvio_critico','desvio_prazo','desvio_novo','dds_pendente','apr_pendente',
  'admissao_bloqueada','inspecao_equipamento',
  'manutencao_vencida','documento_veiculo'
));

-- ─── 4. GERAÇÃO DOS ALERTAS ─────────────────────────────────────────────────
-- Quem recebe: gestor de frota e admin. O motorista já tem o aviso no app dele;
-- o que faltava era alguém com poder de agendar a oficina ser avisado.
-- Não repete o mesmo alerta para a mesma pessoa no mesmo dia.

CREATE OR REPLACE FUNCTION public.processar_alertas_frota()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manutencao integer := 0;
  v_documento  integer := 0;
BEGIN
  -- Manutenção vencida ou a vencer, por item de plano
  INSERT INTO public.sms_notificacoes(tipo, destinatario_id, canal, titulo, mensagem, referencia_tabela, referencia_id)
  SELECT
    'manutencao_vencida', e.id, 'app',
    CASE WHEN w.situacao = 'vencida' THEN 'Manutenção vencida' ELSE 'Manutenção próxima' END,
    w.placa || ' — ' || w.servico || ': ' ||
    CASE
      WHEN w.situacao = 'vencida' THEN 'vencida'
      ELSE 'vence'
    END || ' por ' ||
    CASE w.gatilho
      WHEN 'km'    THEN COALESCE(abs(w.km_restante)::text, '?') || ' km'
      WHEN 'horas' THEN COALESCE(round(abs(w.horas_restantes))::text, '?') || ' h'
      ELSE COALESCE(abs(w.dias_restantes)::text, '?') || ' dia(s)'
    END ||
    CASE WHEN w.sem_historico THEN ' (sem manutenção registrada: conta da aplicação do plano)' ELSE '' END ||
    CASE WHEN w.bloqueia_veiculo AND w.situacao = 'vencida' THEN ' — item crítico, avalie parar o veículo.' ELSE '.' END,
    'maintenance_records', w.vehicle_id
  FROM public.v_manutencao_vencimentos w
  CROSS JOIN public.employees e
  JOIN public.user_roles ur ON ur.user_id = e.user_id
   AND ur.role IN ('gestor_frota'::public.app_role, 'admin'::public.app_role)
  WHERE w.situacao IN ('vencida', 'a_vencer')
    AND NOT EXISTS (
      SELECT 1 FROM public.sms_notificacoes n
      WHERE n.tipo = 'manutencao_vencida'
        AND n.destinatario_id = e.id
        AND n.referencia_id = w.vehicle_id
        AND n.mensagem LIKE w.placa || ' — ' || w.servico || '%'
        AND n.created_at::date = current_date
    );
  GET DIAGNOSTICS v_manutencao = ROW_COUNT;

  -- Documento do veículo vencido ou a vencer
  INSERT INTO public.sms_notificacoes(tipo, destinatario_id, canal, titulo, mensagem, referencia_tabela, referencia_id)
  SELECT
    'documento_veiculo', e.id, 'app',
    CASE WHEN d.situacao = 'vencida' THEN 'Documento do veículo vencido' ELSE 'Documento do veículo a vencer' END,
    d.placa || ' — ' || upper(d.tipo) || COALESCE(' (' || d.descricao || ')', '') || ': ' ||
    CASE
      WHEN d.situacao = 'vencida'
        THEN 'venceu em ' || to_char(d.data_vencimento, 'DD/MM/YYYY') || '.'
      ELSE 'vence em ' || to_char(d.data_vencimento, 'DD/MM/YYYY') || ' (' || d.dias_restantes || ' dia(s)).'
    END,
    'vehicle_documentos', d.id
  FROM public.v_documentos_vencimentos d
  CROSS JOIN public.employees e
  JOIN public.user_roles ur ON ur.user_id = e.user_id
   AND ur.role IN ('gestor_frota'::public.app_role, 'admin'::public.app_role)
  WHERE d.situacao IN ('vencida', 'a_vencer')
    AND NOT EXISTS (
      SELECT 1 FROM public.sms_notificacoes n
      WHERE n.tipo = 'documento_veiculo'
        AND n.destinatario_id = e.id
        AND n.referencia_id = d.id
        AND n.created_at::date = current_date
    );
  GET DIAGNOSTICS v_documento = ROW_COUNT;

  RETURN v_manutencao + v_documento;
END $$;

REVOKE ALL ON FUNCTION public.processar_alertas_frota() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.processar_alertas_frota() TO authenticated;

COMMENT ON FUNCTION public.processar_alertas_frota() IS 'Gera notificação de manutenção e documento vencidos ou a vencer para gestor de frota e admin. Idempotente no dia: rodar de novo não duplica.';

-- Agendamento diário, quando pg_cron estiver habilitado — mesmo padrão do
-- alerta de inspeção de equipamento.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      EXECUTE 'SELECT cron.unschedule($1)' USING 'alertas_frota_diario';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    EXECUTE 'SELECT cron.schedule($1,$2,$3)'
      USING 'alertas_frota_diario', '0 10 * * *', 'SELECT public.processar_alertas_frota()';
  END IF;
END $$;

-- ─── 5. PERMISSÕES ──────────────────────────────────────────────────────────

ALTER TABLE public.vehicle_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_documentos_read ON public.vehicle_documentos;
CREATE POLICY vehicle_documentos_read ON public.vehicle_documentos FOR SELECT TO authenticated
  USING (public.pode_geral('frota.visualizar') OR public.pode_geral('manutencao.visualizar'));

DROP POLICY IF EXISTS vehicle_documentos_write ON public.vehicle_documentos;
CREATE POLICY vehicle_documentos_write ON public.vehicle_documentos FOR ALL TO authenticated
  USING (public.pode_geral('frota.editar') OR public.pode_geral('manutencao.editar'))
  WITH CHECK (public.pode_geral('frota.editar') OR public.pode_geral('manutencao.editar'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_documentos TO authenticated;
GRANT SELECT ON public.v_documentos_vencimentos TO authenticated;

-- ─── 6. UPDATED_AT E AUDITORIA ──────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_vehicle_documentos_updated_at ON public.vehicle_documentos;
CREATE TRIGGER trg_vehicle_documentos_updated_at
  BEFORE UPDATE ON public.vehicle_documentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DO $$ BEGIN
  IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.vehicle_documentos;
    CREATE TRIGGER trg_auditoria_sistema
      AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_documentos
      FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao();
  END IF;
END $$;

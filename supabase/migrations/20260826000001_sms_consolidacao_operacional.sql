-- Consolida o contrato entre o App SMS offline e o modulo gerencial.
-- Os campos abaixo preservam integralmente os apontamentos realizados em campo.

ALTER TABLE public.sms_dds_sessoes
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS participantes_nomes text,
  ADD COLUMN IF NOT EXISTS fotos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';

ALTER TABLE public.sms_desvios
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acao_imediata text,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';

ALTER TABLE public.sms_inspecoes
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS hora time,
  ADD COLUMN IF NOT EXISTS fotos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';

ALTER TABLE public.sms_inspecoes_respostas
  ADD COLUMN IF NOT EXISTS item_descricao text,
  ADD COLUMN IF NOT EXISTS resposta_original text;

ALTER TABLE public.sms_aprs
  ADD COLUMN IF NOT EXISTS descricao_trabalho text,
  ADD COLUMN IF NOT EXISTS validade timestamptz,
  ADD COLUMN IF NOT EXISTS emitente_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';

ALTER TABLE public.sms_apr_riscos_selecionados
  ADD COLUMN IF NOT EXISTS resposta text;

ALTER TABLE public.sms_rdo
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS hora_fim time,
  ADD COLUMN IF NOT EXISTS atividades_executadas text,
  ADD COLUMN IF NOT EXISTS mao_de_obra jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ocorrencias_sms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS paralisacoes text,
  ADD COLUMN IF NOT EXISTS fotos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';

ALTER TABLE public.sms_near_miss
  ADD COLUMN IF NOT EXISTS responsavel_tratamento uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo date,
  ADD COLUMN IF NOT EXISTS causa_raiz text,
  ADD COLUMN IF NOT EXISTS plano_acao text,
  ADD COLUMN IF NOT EXISTS verificacao_eficacia text,
  ADD COLUMN IF NOT EXISTS encerrado_em timestamptz;

ALTER TABLE public.sms_acidentes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'em_investigacao',
  ADD COLUMN IF NOT EXISTS causa_raiz text,
  ADD COLUMN IF NOT EXISTS plano_acao text,
  ADD COLUMN IF NOT EXISTS responsavel_investigacao uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo date,
  ADD COLUMN IF NOT EXISTS cat_numero text,
  ADD COLUMN IF NOT EXISTS cat_data date,
  ADD COLUMN IF NOT EXISTS esocial_status text NOT NULL DEFAULT 'nao_enviado',
  ADD COLUMN IF NOT EXISTS esocial_recibo text,
  ADD COLUMN IF NOT EXISTS encerrado_em timestamptz;

ALTER TABLE public.sms_pt
  ADD COLUMN IF NOT EXISTS aprovada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovada_em timestamptz,
  ADD COLUMN IF NOT EXISTS encerrada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS encerrada_em timestamptz,
  ADD COLUMN IF NOT EXISTS checklist_liberacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS medicoes_atmosfericas jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.sms_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  operacao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_auditoria_select ON public.sms_auditoria;
CREATE POLICY sms_auditoria_select ON public.sms_auditoria FOR SELECT TO authenticated
  USING (public.is_gestor_contrato() OR public.is_tecnico_sms() OR public.is_gestor_obra());

CREATE OR REPLACE FUNCTION public.fn_sms_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sms_auditoria(tabela, registro_id, operacao, dados_anteriores, dados_novos, usuario_id)
  VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP,
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
          auth.uid());
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sms_desvios','sms_near_miss','sms_acidentes','sms_pt','sms_aprs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sms_audit ON public.%I', table_name);
    EXECUTE format('CREATE TRIGGER trg_sms_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_sms_auditar()', table_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_desvios_veiculo ON public.sms_desvios(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_sms_inspecoes_veiculo ON public.sms_inspecoes(veiculo_id);

COMMENT ON COLUMN public.sms_inspecoes_respostas.resposta_original IS
  'Resposta original do checklist de campo: C, NC ou NA.';
COMMENT ON COLUMN public.sms_apr_riscos_selecionados.resposta IS
  'Resposta da avaliacao do risco no campo: S, N ou NA.';

-- GRO/PGR, saude ocupacional e meio ambiente: pilares que faltavam ao SMS.
CREATE TABLE IF NOT EXISTS public.sms_pgr_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  processo_atividade text NOT NULL,
  perigo text NOT NULL,
  grupo_risco text NOT NULL CHECK (grupo_risco IN ('fisico','quimico','biologico','ergonomico','acidente')),
  trabalhadores_expostos text,
  probabilidade integer NOT NULL CHECK (probabilidade BETWEEN 1 AND 5),
  severidade integer NOT NULL CHECK (severidade BETWEEN 1 AND 5),
  medidas_existentes text,
  plano_acao text,
  responsavel text,
  prazo date,
  status text NOT NULL DEFAULT 'identificado' CHECK (status IN ('identificado','em_tratamento','controlado','aceito')),
  registrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_saude_ocupacional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  tipo_exame text NOT NULL CHECK (tipo_exame IN ('admissional','periodico','retorno','mudanca_risco','demissional')),
  data_exame date NOT NULL,
  vencimento date,
  aptidao text NOT NULL CHECK (aptidao IN ('apto','apto_com_restricao','inapto')),
  restricoes text,
  aso_url text,
  esocial_status text NOT NULL DEFAULT 'nao_enviado',
  esocial_recibo text,
  registrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_aspectos_ambientais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  atividade text NOT NULL,
  aspecto text NOT NULL,
  impacto text NOT NULL,
  requisito_legal text,
  frequencia integer NOT NULL CHECK (frequencia BETWEEN 1 AND 5),
  severidade integer NOT NULL CHECK (severidade BETWEEN 1 AND 5),
  controles text,
  meta_indicador text,
  responsavel text,
  prazo date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','em_tratamento','controlado')),
  registrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_pgr_obra ON public.sms_pgr_inventario(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_saude_colaborador ON public.sms_saude_ocupacional(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_sms_saude_vencimento ON public.sms_saude_ocupacional(vencimento);
CREATE INDEX IF NOT EXISTS idx_sms_ambiental_obra ON public.sms_aspectos_ambientais(obra_id);

ALTER TABLE public.sms_pgr_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_saude_ocupacional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_aspectos_ambientais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_pgr_access ON public.sms_pgr_inventario;
CREATE POLICY sms_pgr_access ON public.sms_pgr_inventario FOR ALL TO authenticated
  USING (obra_id IN (SELECT public.get_my_obra_ids()) OR public.is_gestor_contrato() OR public.is_tecnico_sms())
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()) OR public.is_gestor_contrato() OR public.is_tecnico_sms());
DROP POLICY IF EXISTS sms_saude_access ON public.sms_saude_ocupacional;
CREATE POLICY sms_saude_access ON public.sms_saude_ocupacional FOR ALL TO authenticated
  USING (public.is_gestor_contrato() OR public.is_tecnico_sms() OR public.is_gestor_obra())
  WITH CHECK (public.is_gestor_contrato() OR public.is_tecnico_sms() OR public.is_gestor_obra());
DROP POLICY IF EXISTS sms_ambiental_access ON public.sms_aspectos_ambientais;
CREATE POLICY sms_ambiental_access ON public.sms_aspectos_ambientais FOR ALL TO authenticated
  USING (obra_id IN (SELECT public.get_my_obra_ids()) OR public.is_gestor_contrato() OR public.is_tecnico_sms())
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()) OR public.is_gestor_contrato() OR public.is_tecnico_sms());

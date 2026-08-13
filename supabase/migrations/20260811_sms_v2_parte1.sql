-- SMS SSMA Schema V2 - PARTE 1/2: DROP + Tabelas + RLS
-- Rodar esta parte primeiro

-- DROP tabelas existentes (com schema errado)
DROP TABLE IF EXISTS public.sms_inspecoes_respostas      CASCADE;
DROP TABLE IF EXISTS public.sms_inspecoes                CASCADE;
DROP TABLE IF EXISTS public.sms_inspecoes_itens_catalogo CASCADE;
DROP TABLE IF EXISTS public.sms_inspecoes_catalogo       CASCADE;
DROP TABLE IF EXISTS public.sms_desvios                  CASCADE;
DROP TABLE IF EXISTS public.sms_dds_presencas            CASCADE;
DROP TABLE IF EXISTS public.sms_dds_sessoes              CASCADE;
DROP TABLE IF EXISTS public.sms_dds_temas                CASCADE;
DROP TABLE IF EXISTS public.sms_apr_envolvidos           CASCADE;
DROP TABLE IF EXISTS public.sms_apr_riscos_selecionados  CASCADE;
DROP TABLE IF EXISTS public.sms_aprs                     CASCADE;
DROP TABLE IF EXISTS public.sms_apr_riscos_catalogo      CASCADE;
DROP TABLE IF EXISTS public.sms_apr_tipos_atividade      CASCADE;
DROP TABLE IF EXISTS public.sms_colaborador_epis         CASCADE;
DROP TABLE IF EXISTS public.sms_epis_estoque             CASCADE;
DROP TABLE IF EXISTS public.sms_epis_catalogo            CASCADE;
DROP TABLE IF EXISTS public.sms_colaborador_treinamentos CASCADE;
DROP TABLE IF EXISTS public.sms_treinamentos_catalogo    CASCADE;
DROP TABLE IF EXISTS public.sms_admissoes                CASCADE;
DROP TABLE IF EXISTS public.sms_rdo                      CASCADE;
DROP FUNCTION IF EXISTS public.is_tecnico_sms()          CASCADE;

-- Adicionar tecnico_sms ao enum (so se nao existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'tecnico_sms'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'tecnico_sms';
  END IF;
END $$;

-- Colunas extras em employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS face_consentimento_em  timestamptz,
  ADD COLUMN IF NOT EXISTS face_consentimento_url text;

-- Funcao is_tecnico_sms
CREATE OR REPLACE FUNCTION public.is_tecnico_sms()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_user_role(auth.uid()) = 'tecnico_sms'::app_role;
$$;
GRANT EXECUTE ON FUNCTION public.is_tecnico_sms() TO authenticated;

-- Desvios
CREATE TABLE public.sms_desvios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          uuid REFERENCES public.obras(id) ON DELETE CASCADE,
  colaborador_id   uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  registrado_por   uuid REFERENCES auth.users(id),
  tipo_desvio      text NOT NULL,
  descricao        text NOT NULL,
  local            text NOT NULL,
  severidade       text NOT NULL DEFAULT 'leve'
                     CHECK (severidade IN ('leve','moderado','grave','critico')),
  status           text NOT NULL DEFAULT 'aberto'
                     CHECK (status IN ('aberto','em_tratamento','fechado','cancelado')),
  data_ocorrencia  date NOT NULL DEFAULT CURRENT_DATE,
  prazo_tratamento date,
  fotos            text[] DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_desvios_obra   ON public.sms_desvios(obra_id);
CREATE INDEX idx_sms_desvios_status ON public.sms_desvios(status);
CREATE INDEX idx_sms_desvios_data   ON public.sms_desvios(data_ocorrencia);

-- Inspecoes catalogo
CREATE TABLE public.sms_inspecoes_catalogo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text NOT NULL,
  tipo          text,
  periodicidade text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Inspecoes itens catalogo
CREATE TABLE public.sms_inspecoes_itens_catalogo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspecao_catalogo_id uuid NOT NULL REFERENCES public.sms_inspecoes_catalogo(id) ON DELETE CASCADE,
  ordem                integer NOT NULL DEFAULT 1,
  descricao            text NOT NULL,
  categoria            text,
  obrigatorio          boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_insp_itens_cat ON public.sms_inspecoes_itens_catalogo(inspecao_catalogo_id);

-- Inspecoes
CREATE TABLE public.sms_inspecoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogo_id        uuid REFERENCES public.sms_inspecoes_catalogo(id) ON DELETE SET NULL,
  obra_id            uuid REFERENCES public.obras(id) ON DELETE CASCADE,
  realizada_por      text NOT NULL,
  data_inspecao      date NOT NULL DEFAULT CURRENT_DATE,
  status             text NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  observacoes_gerais text,
  registrado_por     uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_inspecoes_obra   ON public.sms_inspecoes(obra_id);
CREATE INDEX idx_sms_inspecoes_status ON public.sms_inspecoes(status);

-- Inspecoes respostas
CREATE TABLE public.sms_inspecoes_respostas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspecao_id      uuid NOT NULL REFERENCES public.sms_inspecoes(id) ON DELETE CASCADE,
  item_catalogo_id uuid REFERENCES public.sms_inspecoes_itens_catalogo(id) ON DELETE SET NULL,
  conforme         boolean,
  observacao       text,
  foto_url         text,
  desvio_gerado_id uuid REFERENCES public.sms_desvios(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_insp_resp ON public.sms_inspecoes_respostas(inspecao_id);

-- DDS temas
CREATE TABLE public.sms_dds_temas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         text NOT NULL,
  descricao      text,
  nr_relacionada text,
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- DDS sessoes
CREATE TABLE public.sms_dds_sessoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id        uuid REFERENCES public.obras(id) ON DELETE CASCADE,
  tema_id        uuid REFERENCES public.sms_dds_temas(id) ON DELETE SET NULL,
  data_sessao    date NOT NULL DEFAULT CURRENT_DATE,
  condutor       text NOT NULL,
  duracao_min    integer,
  observacoes    text,
  registrado_por uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_dds_sessoes_obra ON public.sms_dds_sessoes(obra_id);
CREATE INDEX idx_sms_dds_sessoes_data ON public.sms_dds_sessoes(data_sessao);

-- DDS presencas
CREATE TABLE public.sms_dds_presencas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id      uuid NOT NULL REFERENCES public.sms_dds_sessoes(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  presente       boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sessao_id, colaborador_id)
);

-- APR tipos atividade
CREATE TABLE public.sms_apr_tipos_atividade (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  descricao  text,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- APR riscos catalogo
CREATE TABLE public.sms_apr_riscos_catalogo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 text NOT NULL,
  descricao            text,
  categoria            text,
  probabilidade_padrao text,
  severidade_padrao    text,
  ativo                boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- APRs
CREATE TABLE public.sms_aprs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid REFERENCES public.obras(id) ON DELETE CASCADE,
  tipo_atividade_id uuid REFERENCES public.sms_apr_tipos_atividade(id) ON DELETE SET NULL,
  local             text NOT NULL,
  data_hora_inicio  timestamptz NOT NULL,
  data_hora_fim     timestamptz,
  status            text NOT NULL DEFAULT 'aberta'
                      CHECK (status IN ('aberta','em_execucao','concluida','cancelada')),
  responsavel       text NOT NULL,
  observacoes       text,
  registrado_por    uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_aprs_obra   ON public.sms_aprs(obra_id);
CREATE INDEX idx_sms_aprs_status ON public.sms_aprs(status);
CREATE INDEX idx_sms_aprs_data   ON public.sms_aprs(data_hora_inicio);

-- APR riscos selecionados
CREATE TABLE public.sms_apr_riscos_selecionados (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apr_id           uuid NOT NULL REFERENCES public.sms_aprs(id) ON DELETE CASCADE,
  risco_id         uuid REFERENCES public.sms_apr_riscos_catalogo(id) ON DELETE SET NULL,
  medida_controle  text,
  eliminado        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- APR envolvidos
CREATE TABLE public.sms_apr_envolvidos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apr_id           uuid NOT NULL REFERENCES public.sms_aprs(id) ON DELETE CASCADE,
  colaborador_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assinou          boolean NOT NULL DEFAULT false,
  assinatura_url   text,
  data_assinatura  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (apr_id, colaborador_id)
);

-- EPIs catalogo
CREATE TABLE public.sms_epis_catalogo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  descricao     text,
  ca_numero     text,
  ca_vencimento date,
  categoria     text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- EPIs estoque
CREATE TABLE public.sms_epis_estoque (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  epi_id            uuid NOT NULL REFERENCES public.sms_epis_catalogo(id) ON DELETE CASCADE,
  quantidade        integer NOT NULL DEFAULT 0,
  quantidade_minima integer NOT NULL DEFAULT 5,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, epi_id)
);

-- Colaborador EPIs
CREATE TABLE public.sms_colaborador_epis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  epi_id         uuid NOT NULL REFERENCES public.sms_epis_catalogo(id),
  obra_id        uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  data_entrega   date NOT NULL DEFAULT CURRENT_DATE,
  data_devolucao date,
  quantidade     integer NOT NULL DEFAULT 1,
  condicao       text,
  observacoes    text,
  entregue_por   uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_col_epis_colab ON public.sms_colaborador_epis(colaborador_id);
CREATE INDEX idx_sms_col_epis_obra  ON public.sms_colaborador_epis(obra_id);

-- Treinamentos catalogo
CREATE TABLE public.sms_treinamentos_catalogo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  nr_referencia   text,
  carga_horaria_h numeric(5,1),
  validade_meses  integer,
  obrigatorio     boolean NOT NULL DEFAULT false,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Colaborador treinamentos
CREATE TABLE public.sms_colaborador_treinamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  treinamento_id   uuid NOT NULL REFERENCES public.sms_treinamentos_catalogo(id),
  obra_id          uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  data_realizacao  date,
  data_vencimento  date,
  instituicao      text,
  instrutor        text,
  status           text NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente','em_dia','a_vencer','vencido')),
  certificado_url  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_col_trein_colab  ON public.sms_colaborador_treinamentos(colaborador_id);
CREATE INDEX idx_sms_col_trein_status ON public.sms_colaborador_treinamentos(status);
CREATE INDEX idx_sms_col_trein_vencim ON public.sms_colaborador_treinamentos(data_vencimento);

-- Admissoes
CREATE TABLE public.sms_admissoes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id            uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id                   uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  data_admissao             date NOT NULL DEFAULT CURRENT_DATE,
  checklist_documentos      jsonb NOT NULL DEFAULT '{}',
  epis_entregues            boolean NOT NULL DEFAULT false,
  treinamento_integracao_em date,
  status                    text NOT NULL DEFAULT 'em_andamento'
                              CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  observacoes               text,
  registrado_por            uuid REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_admissoes_colab  ON public.sms_admissoes(colaborador_id);
CREATE INDEX idx_sms_admissoes_status ON public.sms_admissoes(status);

-- RDO
CREATE TABLE public.sms_rdo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id              uuid REFERENCES public.obras(id) ON DELETE CASCADE,
  data_rdo             date NOT NULL DEFAULT CURRENT_DATE,
  turno                text NOT NULL DEFAULT 'diurno'
                         CHECK (turno IN ('diurno','manha','tarde','noite')),
  responsavel          text NOT NULL,
  condicao_climatica   text CHECK (condicao_climatica IN (
                         'ensolarado','parcialmente_nublado','nublado','chuva_leve','chuva_forte'
                       )),
  temperatura_c        integer,
  chuva                boolean NOT NULL DEFAULT false,
  efetivo_total        integer NOT NULL DEFAULT 0,
  ocorrencias          text,
  observacoes          text,
  dds_realizado        boolean NOT NULL DEFAULT false,
  aprs_realizadas      integer NOT NULL DEFAULT 0,
  inspecoes_realizadas integer NOT NULL DEFAULT 0,
  desvios_registrados  integer NOT NULL DEFAULT 0,
  registrado_por       uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_rdo_obra ON public.sms_rdo(obra_id);
CREATE INDEX idx_sms_rdo_data ON public.sms_rdo(data_rdo);

-- RLS: habilitar e criar politica permissiva para cada tabela
ALTER TABLE public.sms_desvios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_inspecoes_catalogo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_inspecoes_itens_catalogo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_inspecoes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_inspecoes_respostas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_dds_temas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_dds_sessoes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_dds_presencas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_apr_tipos_atividade       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_apr_riscos_catalogo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_aprs                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_apr_riscos_selecionados   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_apr_envolvidos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_epis_catalogo             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_epis_estoque              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_colaborador_epis          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_treinamentos_catalogo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_colaborador_treinamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_admissoes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_rdo                       ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_p_desvios          ON public.sms_desvios                 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_insp_cat         ON public.sms_inspecoes_catalogo       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_insp_itens       ON public.sms_inspecoes_itens_catalogo FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_insp             ON public.sms_inspecoes                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_insp_resp        ON public.sms_inspecoes_respostas      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_dds_temas        ON public.sms_dds_temas                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_dds_sessoes      ON public.sms_dds_sessoes              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_dds_pres         ON public.sms_dds_presencas            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_apr_tipos        ON public.sms_apr_tipos_atividade      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_apr_riscos       ON public.sms_apr_riscos_catalogo      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_aprs             ON public.sms_aprs                     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_apr_risk_sel     ON public.sms_apr_riscos_selecionados  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_apr_env          ON public.sms_apr_envolvidos           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_epis_cat         ON public.sms_epis_catalogo            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_epis_est         ON public.sms_epis_estoque             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_epis_col         ON public.sms_colaborador_epis         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_trein_cat        ON public.sms_treinamentos_catalogo    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_trein_col        ON public.sms_colaborador_treinamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_admissoes        ON public.sms_admissoes                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_p_rdo              ON public.sms_rdo                      FOR ALL TO authenticated USING (true) WITH CHECK (true);

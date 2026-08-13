-- =====================================================================
-- SMS — Saúde, Segurança e Meio Ambiente
-- Schema completo, integrado ao sistema de frotas existente.
--
-- REUTILIZA (sem duplicar):
--   public.employees      → colaboradores de campo
--   public.obras          → obras/projetos
--   public.obra_funcionarios → vínculo funcionário ↔ obra
--   public.cargos         → função/cargo (extendido com requisitos de NR)
--   roles existentes: admin, gestor_contrato, gestor_obra, funcionario
--
-- ADICIONA:
--   role: tecnico_sms
--   extensão: pgvector (face_embedding)
--   prefixo de todas as novas tabelas: sms_
-- =====================================================================

-- ─── 0. EXTENSÕES ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 1. NOVO ROLE: tecnico_sms ───────────────────────────────────────
-- ATENÇÃO: Execute este bloco SEPARADO e confirme antes de continuar.
-- ALTER TYPE com novo valor não pode ser usado na mesma transação.
-- Rode no SQL Editor: ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tecnico_sms';
-- Após confirmar, execute o restante deste arquivo.

-- ─── 2. ESTENDER employees: face_embedding ───────────────────────────
-- Vetor facial (MobileFaceNet/ArcFace: 512 dims).
-- Gerado pelo app mobile (TFLite on-device) e sincronizado ao salvar.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS face_embedding vector(512),
  ADD COLUMN IF NOT EXISTS face_consentimento_em timestamptz,  -- assinatura LGPD
  ADD COLUMN IF NOT EXISTS face_consentimento_url text;        -- PDF do termo assinado

CREATE INDEX IF NOT EXISTS idx_employees_face_embedding
  ON public.employees USING ivfflat (face_embedding vector_cosine_ops)
  WITH (lists = 50);

-- ─── 3. NÚCLEO SMS ───────────────────────────────────────────────────

-- 3.1 Empresas subcontratadas (distintas da empresa contratante principal)
CREATE TABLE IF NOT EXISTS public.sms_empresas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  cnpj          text,
  tipo          text NOT NULL DEFAULT 'subcontratada'
                  CHECK (tipo IN ('contratante', 'contratada', 'subcontratada')),
  contato_nome  text,
  contato_tel   text,
  ativa         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Vínculo empresa subcontratada ↔ obra
CREATE TABLE IF NOT EXISTS public.sms_obra_empresas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  empresa_id  uuid NOT NULL REFERENCES public.sms_empresas(id) ON DELETE CASCADE,
  ativa       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, empresa_id)
);

-- Vínculo colaborador (employee) ↔ empresa subcontratada (quando aplicável)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sms_empresa_id uuid REFERENCES public.sms_empresas(id) ON DELETE SET NULL;

-- 3.2 Frentes de serviço (sub-divisões de uma obra: bloco A, área elétrica, etc.)
CREATE TABLE IF NOT EXISTS public.sms_frentes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  descricao   text,
  ativa       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_frentes_obra ON public.sms_frentes(obra_id);

-- ─── 4. MÓDULO 07 — TREINAMENTOS, ASO E DOCUMENTAÇÃO ────────────────

-- 4.1 Catálogo de treinamentos/NRs
CREATE TABLE IF NOT EXISTS public.sms_treinamentos_catalogo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text NOT NULL,          -- ex: NR-35, NR-10, MOPP, DIR_DEFENSIVA
  nome            text NOT NULL,
  validade_dias   integer NOT NULL,       -- 365 = 1 ano, 730 = 2 anos, etc.
  descricao       text,
  obrigatorio_por_padrao boolean NOT NULL DEFAULT false,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Dados iniciais: principais NRs e treinamentos comuns em obra
INSERT INTO public.sms_treinamentos_catalogo (codigo, nome, validade_dias, obrigatorio_por_padrao) VALUES
  ('NR-06',          'NR-06 — Equipamentos de Proteção Individual',        365,  true),
  ('NR-10',          'NR-10 — Segurança em Instalações e Serviços em Eletricidade', 730, false),
  ('NR-11',          'NR-11 — Transporte, Movimentação e Manuseio de Materiais', 365, false),
  ('NR-12',          'NR-12 — Segurança no Trabalho em Máquinas e Equipamentos', 365, false),
  ('NR-18',          'NR-18 — Condições e Meio Ambiente de Trabalho na Indústria da Construção', 365, true),
  ('NR-23',          'NR-23 — Proteção Contra Incêndios',                  365,  false),
  ('NR-33',          'NR-33 — Segurança e Saúde nos Trabalhos em Espaços Confinados', 365, false),
  ('NR-35',          'NR-35 — Trabalho em Altura',                         730,  false),
  ('INTEGRACAO',     'Integração de Segurança (admissional)',               365,  true),
  ('DIR_DEFENSIVA',  'Direção Defensiva',                                   730,  false),
  ('MOPP',           'MOPP — Movimentação Operacional de Produtos Perigosos', 1825, false),
  ('PRIMEIROS_SOCO', 'Primeiros Socorros',                                  730,  false),
  ('COMBATE_INC',    'Combate a Incêndio',                                  365,  false)
ON CONFLICT DO NOTHING;

-- 4.2 Requisitos de treinamento por cargo (funcao_requisitos do spec)
CREATE TABLE IF NOT EXISTS public.sms_cargo_requisitos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id            uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  treinamento_id      uuid NOT NULL REFERENCES public.sms_treinamentos_catalogo(id) ON DELETE CASCADE,
  obrigatorio         boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cargo_id, treinamento_id)
);

-- 4.3 Treinamentos realizados por colaborador
CREATE TABLE IF NOT EXISTS public.sms_colaborador_treinamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id          uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  treinamento_id   uuid NOT NULL REFERENCES public.sms_treinamentos_catalogo(id),
  data_realizacao  date NOT NULL,
  data_validade    date NOT NULL,
  certificado_url  text,
  instrutor        text,
  carga_horaria    numeric(5,1),
  status           text NOT NULL DEFAULT 'valido'
                     CHECK (status IN ('valido', 'vencido', 'cancelado')),
  observacoes      text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_col_trein_employee ON public.sms_colaborador_treinamentos(employee_id);
CREATE INDEX IF NOT EXISTS idx_sms_col_trein_validade ON public.sms_colaborador_treinamentos(data_validade);
CREATE INDEX IF NOT EXISTS idx_sms_col_trein_status   ON public.sms_colaborador_treinamentos(status);

-- 4.4 Documentos do colaborador (ASO, OS, anuências, certificados)
CREATE TABLE IF NOT EXISTS public.sms_colaborador_documentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tipo             text NOT NULL
                     CHECK (tipo IN (
                       'aso','rg','cpf','cnh','os','ficha_epi',
                       'anuencia','certificado','outros'
                     )),
  numero           text,
  data_emissao     date,
  data_validade    date,
  arquivo_url      text,
  status           text NOT NULL DEFAULT 'valido'
                     CHECK (status IN ('valido','vencido','pendente','cancelado')),
  observacoes      text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_col_docs_employee ON public.sms_colaborador_documentos(employee_id);
CREATE INDEX IF NOT EXISTS idx_sms_col_docs_tipo     ON public.sms_colaborador_documentos(tipo);
CREATE INDEX IF NOT EXISTS idx_sms_col_docs_validade ON public.sms_colaborador_documentos(data_validade);

-- ─── 5. MÓDULO 05 — GESTÃO DE EPI ────────────────────────────────────

-- 5.1 Catálogo de EPIs
CREATE TABLE IF NOT EXISTS public.sms_epis_catalogo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  descricao       text,
  ca_numero       text,                     -- Certificado de Aprovação MTE
  ca_validade     date,                     -- vencimento do CA
  vida_util_dias  integer NOT NULL DEFAULT 365,
  unidade         text NOT NULL DEFAULT 'unidade'
                    CHECK (unidade IN ('unidade','par','conjunto','metro')),
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 5.2 Estoque por obra
CREATE TABLE IF NOT EXISTS public.sms_epis_estoque (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  epi_id           uuid NOT NULL REFERENCES public.sms_epis_catalogo(id) ON DELETE CASCADE,
  quantidade       integer NOT NULL DEFAULT 0,
  estoque_minimo   integer NOT NULL DEFAULT 5,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, epi_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_epi_estoque_obra ON public.sms_epis_estoque(obra_id);

-- 5.3 Entregas de EPI por colaborador
CREATE TABLE IF NOT EXISTS public.sms_colaborador_epis (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id              uuid NOT NULL REFERENCES public.obras(id),
  epi_id               uuid NOT NULL REFERENCES public.sms_epis_catalogo(id),
  ca_numero            text,
  data_entrega         date NOT NULL DEFAULT CURRENT_DATE,
  data_validade_uso    date,                -- data_entrega + vida_util_dias
  confirmacao_tipo     text NOT NULL DEFAULT 'assinatura'
                         CHECK (confirmacao_tipo IN ('facial','assinatura','qrcode')),
  foto_entrega_url     text,               -- foto do rosto + EPI como evidência
  status               text NOT NULL DEFAULT 'ativo'
                         CHECK (status IN ('ativo','substituido','devolvido','vencido')),
  motivo_substituicao  text,
  entregue_por         uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_col_epis_employee ON public.sms_colaborador_epis(employee_id);
CREATE INDEX IF NOT EXISTS idx_sms_col_epis_obra     ON public.sms_colaborador_epis(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_col_epis_validade ON public.sms_colaborador_epis(data_validade_uso);

-- ─── 6. MÓDULO 01 — GESTÃO DE DESVIOS ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sms_desvios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id        uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  frente_id      uuid REFERENCES public.sms_frentes(id) ON DELETE SET NULL,
  origem         text NOT NULL DEFAULT 'registro_livre'
                   CHECK (origem IN ('inspecao','dds','apr','registro_livre')),
  -- Se gerado automaticamente por inspeção/DDS/APR, referencia a origem:
  origem_ref_id  uuid,
  tipo           text NOT NULL
                   CHECK (tipo IN (
                     'condicao_insegura','ato_inseguro',
                     'quase_acidente','nao_conformidade','melhoria'
                   )),
  descricao      text NOT NULL,
  gravidade      text NOT NULL DEFAULT 'media'
                   CHECK (gravidade IN ('baixa','media','alta','critica')),
  fotos          text[] DEFAULT '{}',    -- array de URLs
  videos         text[] DEFAULT '{}',
  audios         text[] DEFAULT '{}',
  localizacao    jsonb,                  -- { lat, lng, precisao }
  status         text NOT NULL DEFAULT 'aberto'
                   CHECK (status IN (
                     'aberto','em_tratativa',
                     'aguardando_validacao','encerrado','cancelado'
                   )),
  data_abertura  date NOT NULL DEFAULT CURRENT_DATE,
  prazo          date,
  autor_id       uuid NOT NULL REFERENCES public.employees(id),
  -- Sync offline:
  device_id      text,
  sync_status    text NOT NULL DEFAULT 'synced'
                   CHECK (sync_status IN ('pending','synced','error')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_desvios_obra     ON public.sms_desvios(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_desvios_status   ON public.sms_desvios(status);
CREATE INDEX IF NOT EXISTS idx_sms_desvios_gravidade ON public.sms_desvios(gravidade);
CREATE INDEX IF NOT EXISTS idx_sms_desvios_abertura  ON public.sms_desvios(data_abertura);

-- Matriz de responsabilidade (responsáveis por desvio)
CREATE TABLE IF NOT EXISTS public.sms_desvios_responsaveis (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desvio_id     uuid NOT NULL REFERENCES public.sms_desvios(id) ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.employees(id),
  papel         text NOT NULL CHECK (papel IN ('lider','encarregado','supervisor','tecnico_sms')),
  notificado_em timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Tratativas (comentários, fotos de correção, pedidos de prazo)
CREATE TABLE IF NOT EXISTS public.sms_desvios_tratativas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desvio_id  uuid NOT NULL REFERENCES public.sms_desvios(id) ON DELETE CASCADE,
  autor_id   uuid NOT NULL REFERENCES public.employees(id),
  tipo       text NOT NULL CHECK (tipo IN ('comentario','foto_correcao','pedido_prazo','encaminhamento')),
  conteudo   text,
  fotos      text[] DEFAULT '{}',
  prazo_novo date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validações (aceite ou rejeição da tratativa)
CREATE TABLE IF NOT EXISTS public.sms_desvios_validacoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desvio_id    uuid NOT NULL REFERENCES public.sms_desvios(id) ON DELETE CASCADE,
  validado_por uuid NOT NULL REFERENCES public.employees(id),
  decisao      text NOT NULL CHECK (decisao IN ('aceito','rejeitado','nova_acao_solicitada')),
  comentario   text,
  validado_em  timestamptz NOT NULL DEFAULT now()
);

-- Configuração da matriz de responsabilidade por obra
-- Define quem recebe notificação de cada tipo/gravidade de desvio
CREATE TABLE IF NOT EXISTS public.sms_matriz_responsabilidade (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id      uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  gravidade    text CHECK (gravidade IN ('baixa','media','alta','critica','todas')),
  tipo         text CHECK (tipo IN (
                 'condicao_insegura','ato_inseguro',
                 'quase_acidente','nao_conformidade','melhoria','todos'
               )),
  papel        text NOT NULL CHECK (papel IN ('lider','encarregado','supervisor','tecnico_sms')),
  employee_id  uuid NOT NULL REFERENCES public.employees(id),
  ativo        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, gravidade, tipo, papel, employee_id)
);

-- ─── 7. MÓDULO 02 — INSPEÇÕES DIGITAIS ───────────────────────────────

-- 7.1 Catálogo de checklists (por NR/categoria)
CREATE TABLE IF NOT EXISTS public.sms_inspecoes_catalogo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  categoria   text NOT NULL
                CHECK (categoria IN (
                  'nr35','nr33','nr12','nr10','nr18','escavacao',
                  'equipamentos','veiculos','ferramentas','eletrica','outros'
                )),
  descricao   text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 7.2 Itens de cada checklist
CREATE TABLE IF NOT EXISTS public.sms_inspecoes_itens_catalogo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  uuid NOT NULL REFERENCES public.sms_inspecoes_catalogo(id) ON DELETE CASCADE,
  item          text NOT NULL,
  descricao     text,
  foto_obrigatoria_se_nc boolean NOT NULL DEFAULT true,
  ordem         integer NOT NULL DEFAULT 0,
  ativo         boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_sms_insp_itens_checklist ON public.sms_inspecoes_itens_catalogo(checklist_id);

-- 7.3 Inspeções realizadas
CREATE TABLE IF NOT EXISTS public.sms_inspecoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  frente_id       uuid REFERENCES public.sms_frentes(id) ON DELETE SET NULL,
  checklist_id    uuid NOT NULL REFERENCES public.sms_inspecoes_catalogo(id),
  responsavel_id  uuid NOT NULL REFERENCES public.employees(id),
  data            date NOT NULL DEFAULT CURRENT_DATE,
  localizacao_inicio jsonb,
  localizacao_fim    jsonb,
  status          text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  observacoes     text,
  device_id       text,
  sync_status     text NOT NULL DEFAULT 'synced'
                    CHECK (sync_status IN ('pending','synced','error')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_inspecoes_obra  ON public.sms_inspecoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_inspecoes_data  ON public.sms_inspecoes(data);
CREATE INDEX IF NOT EXISTS idx_sms_inspecoes_status ON public.sms_inspecoes(status);

-- 7.4 Respostas por item
CREATE TABLE IF NOT EXISTS public.sms_inspecoes_respostas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspecao_id      uuid NOT NULL REFERENCES public.sms_inspecoes(id) ON DELETE CASCADE,
  item_id          uuid NOT NULL REFERENCES public.sms_inspecoes_itens_catalogo(id),
  resposta         text NOT NULL CHECK (resposta IN ('conforme','nao_conforme','na')),
  foto_url         text,
  observacao       text,
  -- Se "nao_conforme" → desvio gerado automaticamente
  desvio_gerado_id uuid REFERENCES public.sms_desvios(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_insp_resp_inspecao ON public.sms_inspecoes_respostas(inspecao_id);

-- ─── 8. MÓDULO 03 — DDS INTELIGENTE ──────────────────────────────────

-- 8.1 Banco de temas de DDS
CREATE TABLE IF NOT EXISTS public.sms_dds_temas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_nr   text,                     -- ex: NR-35, NR-06, ou NULL para campanhas
  titulo      text NOT NULL,
  conteudo    text,                     -- texto da preleção / pontos principais
  tipo        text NOT NULL DEFAULT 'nr'
                CHECK (tipo IN ('nr','campanha','licao_aprendida','outro')),
  duracao_min integer DEFAULT 10,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Dados iniciais: alguns temas básicos
INSERT INTO public.sms_dds_temas (codigo_nr, titulo, tipo, duracao_min) VALUES
  ('NR-06',  'Uso correto de EPI: por que e como usar',             'nr', 10),
  ('NR-35',  'Trabalho em altura: ancoragem e queda',               'nr', 15),
  ('NR-18',  'Organização e limpeza no canteiro de obras',          'nr', 10),
  ('NR-23',  'Prevenção e combate a incêndios',                     'nr', 12),
  (NULL,     'Cuidado com ferramentas manuais',                     'campanha', 8),
  (NULL,     'Hidratação e calor: como prevenir insolação',         'campanha', 8),
  (NULL,     'Atenção ao transitar em áreas de máquinas em operação','campanha', 10)
ON CONFLICT DO NOTHING;

-- 8.2 Sessões de DDS
CREATE TABLE IF NOT EXISTS public.sms_dds_sessoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  frente_id       uuid REFERENCES public.sms_frentes(id) ON DELETE SET NULL,
  tema_id         uuid NOT NULL REFERENCES public.sms_dds_temas(id),
  encarregado_id  uuid NOT NULL REFERENCES public.employees(id),  -- quem abriu
  lider_id        uuid REFERENCES public.employees(id),           -- quem conduziu
  data            date NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio     time,
  duracao_min     integer,
  localizacao     jsonb,
  status          text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','realizado','cancelado')),
  observacoes     text,
  device_id       text,
  sync_status     text NOT NULL DEFAULT 'synced'
                    CHECK (sync_status IN ('pending','synced','error')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_dds_sessoes_obra ON public.sms_dds_sessoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_dds_sessoes_data ON public.sms_dds_sessoes(data);

-- 8.3 Presenças (facial ou QR code)
CREATE TABLE IF NOT EXISTS public.sms_dds_presencas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id         uuid NOT NULL REFERENCES public.sms_dds_sessoes(id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL REFERENCES public.employees(id),
  confirmacao_tipo  text NOT NULL DEFAULT 'qrcode'
                      CHECK (confirmacao_tipo IN ('facial','qrcode','manual')),
  confirmado_em     timestamptz NOT NULL DEFAULT now(),
  localizacao       jsonb,
  face_score        numeric(4,3),   -- similaridade de cosseno (0–1) quando facial
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sessao_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_dds_presencas_sessao ON public.sms_dds_presencas(sessao_id);

-- ─── 9. MÓDULO 04 — APR DIGITAL INTELIGENTE ──────────────────────────

-- 9.1 Tipos de atividade
CREATE TABLE IF NOT EXISTS public.sms_apr_tipos_atividade (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome     text NOT NULL UNIQUE,
  ativo    boolean NOT NULL DEFAULT true
);

INSERT INTO public.sms_apr_tipos_atividade (nome) VALUES
  ('Trabalho em altura'),
  ('Escavação e fundações'),
  ('Içamento e movimentação de cargas'),
  ('Serviços elétricos (NR-10)'),
  ('Espaço confinado (NR-33)'),
  ('Comissionamento'),
  ('Montagem mecânica'),
  ('Trabalhos com solda e corte'),
  ('Demolição'),
  ('Outros')
ON CONFLICT DO NOTHING;

-- 9.2 Catálogo de riscos x atividade (base para APR automática — referência WEG)
CREATE TABLE IF NOT EXISTS public.sms_apr_riscos_catalogo (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_atividade_id           uuid NOT NULL REFERENCES public.sms_apr_tipos_atividade(id) ON DELETE CASCADE,
  categoria                   text NOT NULL
                                CHECK (categoria IN ('fisico','quimico','biologico','ergonomico','acidente')),
  risco                       text NOT NULL,
  recomendacao                text,
  epi_obrigatorio_id          uuid REFERENCES public.sms_epis_catalogo(id) ON DELETE SET NULL,
  treinamento_obrigatorio_id  uuid REFERENCES public.sms_treinamentos_catalogo(id) ON DELETE SET NULL,
  ativo                       boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_apr_riscos_atividade ON public.sms_apr_riscos_catalogo(tipo_atividade_id);

-- 9.3 APRs emitidas
CREATE TABLE IF NOT EXISTS public.sms_aprs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  frente_id           uuid REFERENCES public.sms_frentes(id) ON DELETE SET NULL,
  tipo_atividade_id   uuid NOT NULL REFERENCES public.sms_apr_tipos_atividade(id),
  descricao_trabalho  text NOT NULL,
  data                date NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio         time,
  validade            date,             -- padrão: data + 2 dias (regra WEG)
  emitente_id         uuid NOT NULL REFERENCES public.employees(id),
  requisitante_id     uuid REFERENCES public.employees(id),
  status              text NOT NULL DEFAULT 'aberta'
                        CHECK (status IN ('aberta','encerrada','cancelada')),
  cancelamento_motivo text,            -- se cancelada (ex: acidente no local)
  localizacao         jsonb,
  device_id           text,
  sync_status         text NOT NULL DEFAULT 'synced'
                        CHECK (sync_status IN ('pending','synced','error')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_aprs_obra   ON public.sms_aprs(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_aprs_data   ON public.sms_aprs(data);
CREATE INDEX IF NOT EXISTS idx_sms_aprs_status ON public.sms_aprs(status);

-- 9.4 Riscos selecionados na APR (respostas S/N/NA)
CREATE TABLE IF NOT EXISTS public.sms_apr_riscos_selecionados (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apr_id     uuid NOT NULL REFERENCES public.sms_aprs(id) ON DELETE CASCADE,
  risco_id   uuid NOT NULL REFERENCES public.sms_apr_riscos_catalogo(id),
  resposta   text NOT NULL CHECK (resposta IN ('S','N','NA')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (apr_id, risco_id)
);

-- 9.5 Envolvidos na APR (com confirmação de presença)
CREATE TABLE IF NOT EXISTS public.sms_apr_envolvidos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apr_id            uuid NOT NULL REFERENCES public.sms_aprs(id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL REFERENCES public.employees(id),
  funcao_na_apr     text,
  confirmacao_tipo  text NOT NULL DEFAULT 'assinatura'
                      CHECK (confirmacao_tipo IN ('facial','qrcode','assinatura')),
  confirmado_em     timestamptz,
  evidencia_url     text,
  face_score        numeric(4,3),
  -- Validação cruzada: pendências no momento da APR
  treinamentos_ok   boolean,
  epis_ok           boolean,
  pendencias        jsonb,            -- lista de pendências detectadas
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (apr_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_apr_envolvidos_apr ON public.sms_apr_envolvidos(apr_id);

-- ─── 10. MÓDULO 06 — INTEGRAÇÃO E ADMISSÃO ───────────────────────────
-- Controle de bloqueio de acesso por pendência documental

CREATE TABLE IF NOT EXISTS public.sms_admissoes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id               uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id                   uuid NOT NULL REFERENCES public.obras(id),
  data_integracao           date NOT NULL DEFAULT CURRENT_DATE,
  integrado_por             uuid REFERENCES auth.users(id),
  status_acesso             text NOT NULL DEFAULT 'bloqueado'
                              CHECK (status_acesso IN ('liberado','bloqueado','pendente')),
  motivo_bloqueio           text,          -- ex: "ASO vencido", "NR-35 pendente"
  termo_lgpd_assinado_em    timestamptz,
  termo_lgpd_url            text,
  observacoes               text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_admissoes_obra   ON public.sms_admissoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_admissoes_status ON public.sms_admissoes(status_acesso);

-- ─── 11. MÓDULO 08 — RDO INTEGRADO ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sms_rdo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id              uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  frente_id            uuid REFERENCES public.sms_frentes(id) ON DELETE SET NULL,
  data                 date NOT NULL DEFAULT CURRENT_DATE,
  encarregado_id       uuid NOT NULL REFERENCES public.employees(id),
  efetivo_presente     integer NOT NULL DEFAULT 0,
  hht_dia              numeric(8,2) DEFAULT 0,   -- Homem-Hora Trabalhado
  clima                text CHECK (clima IN ('sol','nublado','chuva_fraca','chuva_forte','vento_forte')),
  atividades_executadas text,
  -- Campo agregado automaticamente (trigger/função ao fechar o RDO)
  resumo_sms           jsonb DEFAULT '{}'::jsonb,
  -- resumo_sms shape:
  -- {
  --   dds_realizados: N,
  --   apr_abertas: N,
  --   inspecoes_executadas: N,
  --   desvios_abertos: N,
  --   desvios_encerrados: N,
  --   treinamentos_realizados: N,
  --   acoes_positivas: [...],
  --   pontos_atencao: [...]
  -- }
  pdf_url              text,
  status               text NOT NULL DEFAULT 'rascunho'
                         CHECK (status IN ('rascunho','finalizado')),
  device_id            text,
  sync_status          text NOT NULL DEFAULT 'synced'
                         CHECK (sync_status IN ('pending','synced','error')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, frente_id, data, encarregado_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_rdo_obra ON public.sms_rdo(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_rdo_data ON public.sms_rdo(data);

-- ─── 12. INFRAESTRUTURA: SYNC LOG E NOTIFICAÇÕES ─────────────────────

-- 12.1 Log de sincronização offline → online
CREATE TABLE IF NOT EXISTS public.sms_sync_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela           text NOT NULL,
  registro_id      uuid NOT NULL,
  device_id        text,
  employee_id      uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  payload_anterior jsonb,
  payload_novo     jsonb,
  sincronizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_sync_log_tabela ON public.sms_sync_log(tabela);
CREATE INDEX IF NOT EXISTS idx_sms_sync_log_em     ON public.sms_sync_log(sincronizado_em);

-- 12.2 Fila de notificações SMS
CREATE TABLE IF NOT EXISTS public.sms_notificacoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL CHECK (tipo IN (
                   'vencimento_treinamento','vencimento_aso','vencimento_epi',
                   'vencimento_ca','estoque_minimo',
                   'desvio_critico','desvio_prazo','desvio_novo',
                   'dds_pendente','apr_pendente','admissao_bloqueada'
                 )),
  destinatario_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  canal          text NOT NULL DEFAULT 'app'
                   CHECK (canal IN ('app','whatsapp','email')),
  titulo         text NOT NULL,
  mensagem       text NOT NULL,
  referencia_tabela text,
  referencia_id  uuid,
  status         text NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente','enviado','falhou','lido')),
  enviado_em     timestamptz,
  lido_em        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_notif_destinatario ON public.sms_notificacoes(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_sms_notif_status        ON public.sms_notificacoes(status);
CREATE INDEX IF NOT EXISTS idx_sms_notif_tipo          ON public.sms_notificacoes(tipo);

-- ─── 13. TRIGGER: updated_at para tabelas SMS ────────────────────────
-- Reutiliza a função public.update_updated_at_column() já existente

CREATE TRIGGER sms_empresas_updated_at
  BEFORE UPDATE ON public.sms_empresas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_frentes_updated_at
  BEFORE UPDATE ON public.sms_frentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_col_trein_updated_at
  BEFORE UPDATE ON public.sms_colaborador_treinamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_col_docs_updated_at
  BEFORE UPDATE ON public.sms_colaborador_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_epis_catalogo_updated_at
  BEFORE UPDATE ON public.sms_epis_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_epis_estoque_updated_at
  BEFORE UPDATE ON public.sms_epis_estoque
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_col_epis_updated_at
  BEFORE UPDATE ON public.sms_colaborador_epis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_desvios_updated_at
  BEFORE UPDATE ON public.sms_desvios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_inspecoes_updated_at
  BEFORE UPDATE ON public.sms_inspecoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_dds_sessoes_updated_at
  BEFORE UPDATE ON public.sms_dds_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_aprs_updated_at
  BEFORE UPDATE ON public.sms_aprs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_admissoes_updated_at
  BEFORE UPDATE ON public.sms_admissoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_rdo_updated_at
  BEFORE UPDATE ON public.sms_rdo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 14. TRIGGER: atualizar status treinamentos vencidos ─────────────
-- Marca automaticamente como 'vencido' quando data_validade < hoje
CREATE OR REPLACE FUNCTION public.sms_check_treinamento_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.data_validade < CURRENT_DATE THEN
    NEW.status := 'vencido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sms_trein_check_status
  BEFORE INSERT OR UPDATE ON public.sms_colaborador_treinamentos
  FOR EACH ROW EXECUTE FUNCTION public.sms_check_treinamento_status();

-- Idem para documentos
CREATE OR REPLACE FUNCTION public.sms_check_doc_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.data_validade IS NOT NULL AND NEW.data_validade < CURRENT_DATE THEN
    NEW.status := 'vencido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sms_doc_check_status
  BEFORE INSERT OR UPDATE ON public.sms_colaborador_documentos
  FOR EACH ROW EXECUTE FUNCTION public.sms_check_doc_status();

-- ─── 15. TRIGGER: validação cruzada APR ──────────────────────────────
-- Ao inserir envolvido na APR, preenche treinamentos_ok, epis_ok e pendencias
CREATE OR REPLACE FUNCTION public.sms_validar_envolvido_apr()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tipo_atividade_id uuid;
  v_treinamentos_faltando jsonb := '[]'::jsonb;
  v_epis_faltando jsonb := '[]'::jsonb;
  v_cargo_id uuid;
  v_pendencias jsonb := '[]'::jsonb;
BEGIN
  -- Busca tipo de atividade da APR
  SELECT tipo_atividade_id INTO v_tipo_atividade_id
  FROM public.sms_aprs WHERE id = NEW.apr_id;

  -- Busca cargo do colaborador
  SELECT cargo_id INTO v_cargo_id
  FROM public.employees WHERE id = NEW.employee_id;

  -- Verifica treinamentos obrigatórios do catálogo de riscos desta atividade
  SELECT jsonb_agg(jsonb_build_object('treinamento_id', tc.id, 'nome', tc.nome))
  INTO v_treinamentos_faltando
  FROM public.sms_apr_riscos_catalogo arc
  JOIN public.sms_treinamentos_catalogo tc ON tc.id = arc.treinamento_obrigatorio_id
  WHERE arc.tipo_atividade_id = v_tipo_atividade_id
    AND arc.treinamento_obrigatorio_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sms_colaborador_treinamentos ct
      WHERE ct.employee_id = NEW.employee_id
        AND ct.treinamento_id = arc.treinamento_obrigatorio_id
        AND ct.status = 'valido'
        AND ct.data_validade >= CURRENT_DATE
    );

  -- Verifica EPIs obrigatórios
  SELECT jsonb_agg(jsonb_build_object('epi_id', ec.id, 'nome', ec.nome))
  INTO v_epis_faltando
  FROM public.sms_apr_riscos_catalogo arc
  JOIN public.sms_epis_catalogo ec ON ec.id = arc.epi_obrigatorio_id
  WHERE arc.tipo_atividade_id = v_tipo_atividade_id
    AND arc.epi_obrigatorio_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sms_colaborador_epis ce
      WHERE ce.employee_id = NEW.employee_id
        AND ce.epi_id = arc.epi_obrigatorio_id
        AND ce.status = 'ativo'
        AND (ce.data_validade_uso IS NULL OR ce.data_validade_uso >= CURRENT_DATE)
    );

  NEW.treinamentos_ok := (v_treinamentos_faltando IS NULL OR jsonb_array_length(v_treinamentos_faltando) = 0);
  NEW.epis_ok         := (v_epis_faltando IS NULL OR jsonb_array_length(v_epis_faltando) = 0);

  -- Consolida pendências
  IF NOT NEW.treinamentos_ok THEN
    v_pendencias := v_pendencias || jsonb_build_object('tipo', 'treinamentos', 'itens', COALESCE(v_treinamentos_faltando, '[]'::jsonb));
  END IF;
  IF NOT NEW.epis_ok THEN
    v_pendencias := v_pendencias || jsonb_build_object('tipo', 'epis', 'itens', COALESCE(v_epis_faltando, '[]'::jsonb));
  END IF;

  NEW.pendencias := v_pendencias;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sms_apr_validar_envolvido
  BEFORE INSERT ON public.sms_apr_envolvidos
  FOR EACH ROW EXECUTE FUNCTION public.sms_validar_envolvido_apr();

-- ─── 16. FUNÇÃO: agregar resumo_sms no RDO ───────────────────────────
CREATE OR REPLACE FUNCTION public.sms_agregar_resumo_rdo(p_rdo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_obra_id  uuid;
  v_frente_id uuid;
  v_data     date;
  v_resumo   jsonb;
BEGIN
  SELECT obra_id, frente_id, data INTO v_obra_id, v_frente_id, v_data
  FROM public.sms_rdo WHERE id = p_rdo_id;

  SELECT jsonb_build_object(
    'dds_realizados',       (SELECT COUNT(*) FROM public.sms_dds_sessoes
                              WHERE obra_id = v_obra_id AND data = v_data AND status = 'realizado'
                              AND (v_frente_id IS NULL OR frente_id = v_frente_id)),
    'apr_abertas',          (SELECT COUNT(*) FROM public.sms_aprs
                              WHERE obra_id = v_obra_id AND data = v_data AND status = 'aberta'
                              AND (v_frente_id IS NULL OR frente_id = v_frente_id)),
    'inspecoes_executadas', (SELECT COUNT(*) FROM public.sms_inspecoes
                              WHERE obra_id = v_obra_id AND data = v_data AND status = 'concluida'
                              AND (v_frente_id IS NULL OR frente_id = v_frente_id)),
    'desvios_abertos',      (SELECT COUNT(*) FROM public.sms_desvios
                              WHERE obra_id = v_obra_id AND data_abertura = v_data AND status = 'aberto'
                              AND (v_frente_id IS NULL OR frente_id = v_frente_id)),
    'desvios_encerrados',   (SELECT COUNT(*) FROM public.sms_desvios
                              WHERE obra_id = v_obra_id AND data_abertura = v_data AND status = 'encerrado'
                              AND (v_frente_id IS NULL OR frente_id = v_frente_id))
  ) INTO v_resumo;

  UPDATE public.sms_rdo SET resumo_sms = v_resumo WHERE id = p_rdo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sms_agregar_resumo_rdo(uuid) TO authenticated;

-- ─── 17. HELPER: verificar se usuário é tecnico_sms ──────────────────
CREATE OR REPLACE FUNCTION public.is_tecnico_sms()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_user_role(auth.uid()) = 'tecnico_sms'::app_role;
$$;
GRANT EXECUTE ON FUNCTION public.is_tecnico_sms() TO authenticated;

-- ─── 18. RLS ─────────────────────────────────────────────────────────
-- Padrão: admin/gestor_contrato = acesso total.
--         tecnico_sms = lê e gerencia tudo das obras em que está vinculado.
--         gestor_obra  = lê e gerencia a sua obra.
--         funcionario  = lê dados da sua obra, insere apenas o que lhe cabe.

ALTER TABLE public.sms_empresas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_obra_empresas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_frentes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_treinamentos_catalogo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_cargo_requisitos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_colaborador_treinamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_colaborador_documentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_epis_catalogo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_epis_estoque            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_colaborador_epis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_desvios                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_desvios_responsaveis    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_desvios_tratativas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_desvios_validacoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_matriz_responsabilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_inspecoes_catalogo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_inspecoes_itens_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_inspecoes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_inspecoes_respostas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_dds_temas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_dds_sessoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_dds_presencas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_apr_tipos_atividade     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_apr_riscos_catalogo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_aprs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_apr_riscos_selecionados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_apr_envolvidos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_admissoes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_rdo                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_sync_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_notificacoes            ENABLE ROW LEVEL SECURITY;

-- ── Catálogos: leitura aberta a todos autenticados, escrita = gestores/tecnico ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_treinamentos_catalogo','sms_cargo_requisitos',
    'sms_epis_catalogo','sms_inspecoes_catalogo','sms_inspecoes_itens_catalogo',
    'sms_dds_temas','sms_apr_tipos_atividade','sms_apr_riscos_catalogo',
    'sms_empresas'
  ] LOOP
    EXECUTE format('
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING (
          get_user_role(auth.uid()) = ANY(ARRAY[
            ''admin''::app_role, ''gestor_contrato''::app_role,
            ''gestor_frota''::app_role, ''tecnico_sms''::app_role
          ])
        )
        WITH CHECK (
          get_user_role(auth.uid()) = ANY(ARRAY[
            ''admin''::app_role, ''gestor_contrato''::app_role,
            ''gestor_frota''::app_role, ''tecnico_sms''::app_role
          ])
        );
    ',
    t || '_select_all', t,
    t || '_write_gestores', t
    );
  END LOOP;
END $$;

-- ── sms_frentes ──────────────────────────────────────────────────────
CREATE POLICY "sms_frentes_select" ON public.sms_frentes
  FOR SELECT TO authenticated
  USING (obra_id IN (SELECT public.get_my_obra_ids()) OR is_gestor_contrato() OR is_tecnico_sms());

CREATE POLICY "sms_frentes_write" ON public.sms_frentes
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- ── Tabelas operacionais ligadas à obra ──────────────────────────────
-- Padrão para: sms_desvios, sms_inspecoes, sms_dds_sessoes, sms_aprs, sms_rdo

CREATE POLICY "sms_desvios_select" ON public.sms_desvios
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_desvios_insert" ON public.sms_desvios
  FOR INSERT TO authenticated
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_desvios_update" ON public.sms_desvios
  FOR UPDATE TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR autor_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_inspecoes_select" ON public.sms_inspecoes
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_inspecoes_write" ON public.sms_inspecoes
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR responsavel_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_insp_respostas_select" ON public.sms_inspecoes_respostas
  FOR SELECT TO authenticated
  USING (inspecao_id IN (SELECT id FROM public.sms_inspecoes
    WHERE obra_id IN (SELECT public.get_my_obra_ids()))
    OR is_gestor_contrato() OR is_tecnico_sms());

CREATE POLICY "sms_insp_respostas_write" ON public.sms_inspecoes_respostas
  FOR INSERT TO authenticated
  WITH CHECK (inspecao_id IN (SELECT id FROM public.sms_inspecoes
    WHERE obra_id IN (SELECT public.get_my_obra_ids())));

CREATE POLICY "sms_dds_sessoes_select" ON public.sms_dds_sessoes
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_dds_sessoes_write" ON public.sms_dds_sessoes
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR encarregado_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_dds_presencas_select" ON public.sms_dds_presencas
  FOR SELECT TO authenticated
  USING (sessao_id IN (SELECT id FROM public.sms_dds_sessoes
    WHERE obra_id IN (SELECT public.get_my_obra_ids()))
    OR is_gestor_contrato() OR is_tecnico_sms());

CREATE POLICY "sms_dds_presencas_insert" ON public.sms_dds_presencas
  FOR INSERT TO authenticated
  WITH CHECK (sessao_id IN (SELECT id FROM public.sms_dds_sessoes
    WHERE obra_id IN (SELECT public.get_my_obra_ids())));

CREATE POLICY "sms_aprs_select" ON public.sms_aprs
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_aprs_write" ON public.sms_aprs
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR emitente_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_apr_riscos_sel_select" ON public.sms_apr_riscos_selecionados
  FOR SELECT TO authenticated
  USING (apr_id IN (SELECT id FROM public.sms_aprs
    WHERE obra_id IN (SELECT public.get_my_obra_ids()))
    OR is_gestor_contrato() OR is_tecnico_sms());

CREATE POLICY "sms_apr_riscos_sel_insert" ON public.sms_apr_riscos_selecionados
  FOR INSERT TO authenticated
  WITH CHECK (apr_id IN (SELECT id FROM public.sms_aprs
    WHERE obra_id IN (SELECT public.get_my_obra_ids())));

CREATE POLICY "sms_apr_envolvidos_select" ON public.sms_apr_envolvidos
  FOR SELECT TO authenticated
  USING (apr_id IN (SELECT id FROM public.sms_aprs
    WHERE obra_id IN (SELECT public.get_my_obra_ids()))
    OR is_gestor_contrato() OR is_tecnico_sms());

CREATE POLICY "sms_apr_envolvidos_insert" ON public.sms_apr_envolvidos
  FOR INSERT TO authenticated
  WITH CHECK (apr_id IN (SELECT id FROM public.sms_aprs
    WHERE obra_id IN (SELECT public.get_my_obra_ids())));

-- ── Colaborador: treinamentos, documentos, EPIs ───────────────────────
CREATE POLICY "sms_col_trein_select" ON public.sms_colaborador_treinamentos
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_col_trein_write" ON public.sms_colaborador_treinamentos
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

CREATE POLICY "sms_col_docs_select" ON public.sms_colaborador_documentos
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "sms_col_docs_write" ON public.sms_colaborador_documentos
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

CREATE POLICY "sms_col_epis_select" ON public.sms_colaborador_epis
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_col_epis_write" ON public.sms_colaborador_epis
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- ── Estoque EPI ───────────────────────────────────────────────────────
CREATE POLICY "sms_epi_estoque_select" ON public.sms_epis_estoque
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_epi_estoque_write" ON public.sms_epis_estoque
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- ── Desvios: responsáveis, tratativas, validações ────────────────────
CREATE POLICY "sms_dev_resp_select" ON public.sms_desvios_responsaveis
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR desvio_id IN (SELECT id FROM public.sms_desvios
      WHERE obra_id IN (SELECT public.get_my_obra_ids())));

CREATE POLICY "sms_dev_resp_write" ON public.sms_desvios_responsaveis
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

CREATE POLICY "sms_dev_trat_select" ON public.sms_desvios_tratativas
  FOR SELECT TO authenticated
  USING (desvio_id IN (SELECT id FROM public.sms_desvios
    WHERE obra_id IN (SELECT public.get_my_obra_ids()))
    OR is_gestor_contrato() OR is_tecnico_sms());

CREATE POLICY "sms_dev_trat_insert" ON public.sms_desvios_tratativas
  FOR INSERT TO authenticated
  WITH CHECK (desvio_id IN (SELECT id FROM public.sms_desvios
    WHERE obra_id IN (SELECT public.get_my_obra_ids())));

CREATE POLICY "sms_dev_valid_select" ON public.sms_desvios_validacoes
  FOR SELECT TO authenticated
  USING (desvio_id IN (SELECT id FROM public.sms_desvios
    WHERE obra_id IN (SELECT public.get_my_obra_ids()))
    OR is_gestor_contrato() OR is_tecnico_sms());

CREATE POLICY "sms_dev_valid_write" ON public.sms_desvios_validacoes
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR validado_por IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (desvio_id IN (SELECT id FROM public.sms_desvios
    WHERE obra_id IN (SELECT public.get_my_obra_ids())));

CREATE POLICY "sms_matriz_select" ON public.sms_matriz_responsabilidade
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_matriz_write" ON public.sms_matriz_responsabilidade
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- ── Admissões ─────────────────────────────────────────────────────────
CREATE POLICY "sms_admissoes_select" ON public.sms_admissoes
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "sms_admissoes_write" ON public.sms_admissoes
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- ── RDO ──────────────────────────────────────────────────────────────
CREATE POLICY "sms_rdo_select" ON public.sms_rdo
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_rdo_write" ON public.sms_rdo
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra()
    OR encarregado_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT public.get_my_obra_ids()));

-- ── Notificações: colaborador vê só as suas ───────────────────────────
CREATE POLICY "sms_notif_select" ON public.sms_notificacoes
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR destinatario_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "sms_notif_write" ON public.sms_notificacoes
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms());

-- ── Sync log: só gestores/técnicos escrevem ───────────────────────────
CREATE POLICY "sms_sync_log_all" ON public.sms_sync_log
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms())
  WITH CHECK (true);

CREATE POLICY "sms_obra_empresas_select" ON public.sms_obra_empresas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sms_obra_empresas_write" ON public.sms_obra_empresas
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms());

-- ─────────────────────────────────────────────────────────────────────────────
-- SMS / SSMA — Schema V2
-- Use este arquivo SE o Step 2 original falhou (erro de pgvector ou outro).
-- Não requer extensão vector. Nomes de coluna compatíveis com o frontend.
-- Rodar INTEIRO no SQL Editor do Supabase de uma vez.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── DROP: Remove tabelas SMS existentes (schema errado) com CASCADE ──────────
-- Ordem: dependentes primeiro, depois as base
DROP TABLE IF EXISTS public.sms_inspecoes_respostas       CASCADE;
DROP TABLE IF EXISTS public.sms_inspecoes                 CASCADE;
DROP TABLE IF EXISTS public.sms_inspecoes_itens_catalogo  CASCADE;
DROP TABLE IF EXISTS public.sms_inspecoes_catalogo        CASCADE;
DROP TABLE IF EXISTS public.sms_desvios                   CASCADE;
DROP TABLE IF EXISTS public.sms_dds_presencas             CASCADE;
DROP TABLE IF EXISTS public.sms_dds_sessoes               CASCADE;
DROP TABLE IF EXISTS public.sms_dds_temas                 CASCADE;
DROP TABLE IF EXISTS public.sms_apr_envolvidos            CASCADE;
DROP TABLE IF EXISTS public.sms_apr_riscos_selecionados   CASCADE;
DROP TABLE IF EXISTS public.sms_aprs                      CASCADE;
DROP TABLE IF EXISTS public.sms_apr_riscos_catalogo       CASCADE;
DROP TABLE IF EXISTS public.sms_apr_tipos_atividade       CASCADE;
DROP TABLE IF EXISTS public.sms_colaborador_epis          CASCADE;
DROP TABLE IF EXISTS public.sms_epis_estoque              CASCADE;
DROP TABLE IF EXISTS public.sms_epis_catalogo             CASCADE;
DROP TABLE IF EXISTS public.sms_colaborador_treinamentos  CASCADE;
DROP TABLE IF EXISTS public.sms_treinamentos_catalogo     CASCADE;
DROP TABLE IF EXISTS public.sms_admissoes                 CASCADE;
DROP TABLE IF EXISTS public.sms_rdo                       CASCADE;
DROP FUNCTION IF EXISTS public.is_tecnico_sms()           CASCADE;

-- ─── 0. Adicionar tecnico_sms ao enum app_role (seguro se já existir) ─────────
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

-- ─── 1. Colunas extras em employees (sem vector) ─────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS face_consentimento_em  timestamptz,
  ADD COLUMN IF NOT EXISTS face_consentimento_url text;

-- ─── 2. Helper: is_tecnico_sms ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_tecnico_sms()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_user_role(auth.uid()) = 'tecnico_sms'::app_role;
$$;
GRANT EXECUTE ON FUNCTION public.is_tecnico_sms() TO authenticated;

-- ─── 3. Desvios ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_desvios (
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
CREATE INDEX IF NOT EXISTS idx_sms_desvios_obra     ON public.sms_desvios(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_desvios_status   ON public.sms_desvios(status);
CREATE INDEX IF NOT EXISTS idx_sms_desvios_data     ON public.sms_desvios(data_ocorrencia);

-- ─── 4. Inspeções ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_inspecoes_catalogo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text NOT NULL,
  tipo          text,
  periodicidade text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_inspecoes_itens_catalogo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspecao_catalogo_id uuid NOT NULL REFERENCES public.sms_inspecoes_catalogo(id) ON DELETE CASCADE,
  ordem                integer NOT NULL DEFAULT 1,
  descricao            text NOT NULL,
  categoria            text,
  obrigatorio          boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_insp_itens_cat ON public.sms_inspecoes_itens_catalogo(inspecao_catalogo_id);

CREATE TABLE IF NOT EXISTS public.sms_inspecoes (
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
CREATE INDEX IF NOT EXISTS idx_sms_inspecoes_obra   ON public.sms_inspecoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_inspecoes_status ON public.sms_inspecoes(status);

CREATE TABLE IF NOT EXISTS public.sms_inspecoes_respostas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspecao_id      uuid NOT NULL REFERENCES public.sms_inspecoes(id) ON DELETE CASCADE,
  item_catalogo_id uuid REFERENCES public.sms_inspecoes_itens_catalogo(id) ON DELETE SET NULL,
  conforme         boolean,
  observacao       text,
  foto_url         text,
  desvio_gerado_id uuid REFERENCES public.sms_desvios(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_insp_resp_insp ON public.sms_inspecoes_respostas(inspecao_id);

-- ─── 5. DDS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_dds_temas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         text NOT NULL,
  descricao      text,
  nr_relacionada text,
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_dds_sessoes (
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
CREATE INDEX IF NOT EXISTS idx_sms_dds_sessoes_obra ON public.sms_dds_sessoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_dds_sessoes_data ON public.sms_dds_sessoes(data_sessao);

CREATE TABLE IF NOT EXISTS public.sms_dds_presencas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id      uuid NOT NULL REFERENCES public.sms_dds_sessoes(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  presente       boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sessao_id, colaborador_id)
);

-- ─── 6. APR ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_apr_tipos_atividade (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  descricao  text,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_apr_riscos_catalogo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 text NOT NULL,
  descricao            text,
  categoria            text,
  probabilidade_padrao text,
  severidade_padrao    text,
  ativo                boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_aprs (
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
CREATE INDEX IF NOT EXISTS idx_sms_aprs_obra   ON public.sms_aprs(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_aprs_status ON public.sms_aprs(status);
CREATE INDEX IF NOT EXISTS idx_sms_aprs_data   ON public.sms_aprs(data_hora_inicio);

CREATE TABLE IF NOT EXISTS public.sms_apr_riscos_selecionados (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apr_id           uuid NOT NULL REFERENCES public.sms_aprs(id) ON DELETE CASCADE,
  risco_id         uuid REFERENCES public.sms_apr_riscos_catalogo(id) ON DELETE SET NULL,
  medida_controle  text,
  eliminado        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_apr_envolvidos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apr_id           uuid NOT NULL REFERENCES public.sms_aprs(id) ON DELETE CASCADE,
  colaborador_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assinou          boolean NOT NULL DEFAULT false,
  assinatura_url   text,
  data_assinatura  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (apr_id, colaborador_id)
);

-- ─── 7. EPIs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_epis_catalogo (
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

CREATE TABLE IF NOT EXISTS public.sms_epis_estoque (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  epi_id            uuid NOT NULL REFERENCES public.sms_epis_catalogo(id) ON DELETE CASCADE,
  quantidade        integer NOT NULL DEFAULT 0,
  quantidade_minima integer NOT NULL DEFAULT 5,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, epi_id)
);

CREATE TABLE IF NOT EXISTS public.sms_colaborador_epis (
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
CREATE INDEX IF NOT EXISTS idx_sms_col_epis_colab ON public.sms_colaborador_epis(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_sms_col_epis_obra  ON public.sms_colaborador_epis(obra_id);

-- ─── 8. Treinamentos / ASO ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_treinamentos_catalogo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  nr_referencia   text,
  carga_horaria_h numeric(5,1),
  validade_meses  integer,
  obrigatorio     boolean NOT NULL DEFAULT false,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_colaborador_treinamentos (
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
CREATE INDEX IF NOT EXISTS idx_sms_col_trein_colab   ON public.sms_colaborador_treinamentos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_sms_col_trein_status  ON public.sms_colaborador_treinamentos(status);
CREATE INDEX IF NOT EXISTS idx_sms_col_trein_vencim  ON public.sms_colaborador_treinamentos(data_vencimento);

-- ─── 9. Admissão Digital ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_admissoes (
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
CREATE INDEX IF NOT EXISTS idx_sms_admissoes_colab  ON public.sms_admissoes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_sms_admissoes_status ON public.sms_admissoes(status);

-- ─── 10. RDO ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_rdo (
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
CREATE INDEX IF NOT EXISTS idx_sms_rdo_obra ON public.sms_rdo(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_rdo_data ON public.sms_rdo(data_rdo);

-- ─── 11. RLS — política permissiva para authenticated ────────────────────────
-- (Acesso refinado por função pode ser adicionado depois)
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'sms_desvios',
    'sms_inspecoes_catalogo','sms_inspecoes_itens_catalogo',
    'sms_inspecoes','sms_inspecoes_respostas',
    'sms_dds_temas','sms_dds_sessoes','sms_dds_presencas',
    'sms_apr_tipos_atividade','sms_apr_riscos_catalogo',
    'sms_aprs','sms_apr_riscos_selecionados','sms_apr_envolvidos',
    'sms_epis_catalogo','sms_epis_estoque','sms_colaborador_epis',
    'sms_treinamentos_catalogo','sms_colaborador_treinamentos',
    'sms_admissoes','sms_rdo'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    -- Remove política duplicada se existir, depois cria
    EXECUTE format('DROP POLICY IF EXISTS "sms_auth_all_%s" ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "sms_auth_all_%s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ─── 12. Seed: Dados iniciais ─────────────────────────────────────────────────

-- Treinamentos
INSERT INTO public.sms_treinamentos_catalogo
  (nome, nr_referencia, carga_horaria_h, validade_meses, obrigatorio)
VALUES
  ('Integração SMS (admissional)',             'NR-01',  8,   12, true),
  ('Equipamentos de Proteção Individual',      'NR-06',  4,   12, true),
  ('Canteiro de Obras',                        'NR-18', 16,   12, true),
  ('Instalações Elétricas',                    'NR-10', 40,   24, false),
  ('Trabalho em Altura',                       'NR-35',  8,   24, false),
  ('Espaço Confinado',                         'NR-33', 16,   12, false),
  ('Máquinas e Equipamentos',                  'NR-12',  8,   12, false),
  ('Proteção Contra Incêndios',                'NR-23',  8,   12, false),
  ('Direção Defensiva',                        null,    20,   24, false),
  ('MOPP — Produtos Perigosos',                null,    32,   60, false),
  ('Primeiros Socorros',                       null,    16,   24, false),
  ('Operação de Empilhadeira',                 'NR-11', 40,   12, false),
  ('Combate a Incêndio',                       null,    16,   12, false)
ON CONFLICT DO NOTHING;

-- Temas de DDS
INSERT INTO public.sms_dds_temas (titulo, descricao, nr_relacionada) VALUES
  ('Uso correto de EPIs',
   'Importância e uso adequado dos equipamentos de proteção individual', 'NR-06'),
  ('Trabalho em Altura',
   'Riscos, prevenção e uso de cinto de segurança', 'NR-35'),
  ('Ordem e Limpeza no Canteiro',
   'Organização do local de trabalho para prevenir acidentes', 'NR-18'),
  ('Prevenção de Incêndios',
   'Uso de extintores e rotas de fuga', 'NR-23'),
  ('Manuseio de Ferramentas',
   'Uso correto e inspeção de ferramentas manuais', 'NR-12'),
  ('Comunicação de Acidentes e Quase-Acidentes',
   'Por que reportar todo incidente?', null),
  ('Saúde Mental no Trabalho',
   'Bem-estar, estresse e suporte à equipe', null)
ON CONFLICT DO NOTHING;

-- Tipos de atividade APR
INSERT INTO public.sms_apr_tipos_atividade (nome, descricao) VALUES
  ('Trabalho em Altura > 2m',         'Atividades executadas acima de 2 metros do nível inferior'),
  ('Içamento e Movimentação de Cargas','Operações com guindastes, talhas e materiais pesados'),
  ('Trabalho em Espaço Confinado',    'Entrada em espaços com acesso restrito e ventilação limitada'),
  ('Serviços de Demolição',           'Demolição parcial ou total de estruturas'),
  ('Escavação e Terraplenagem',       'Cortes de solo, escavações e taludes'),
  ('Serviços Elétricos Energizados',  'Manutenção ou instalação em circuitos energizados'),
  ('Montagem de Andaimes',            'Instalação e desmontagem de andaimes e plataformas'),
  ('Corte e Solda',                   'Serviços com maçarico, solda elétrica ou plasma'),
  ('Aplicação de Produtos Químicos',  'Manuseio de solventes, tintas, ácidos ou produtos perigosos'),
  ('Operação de Equipamentos Pesados','Retroescavadeira, motoniveladora, compactador, rolo compressor')
ON CONFLICT DO NOTHING;

-- Riscos APR
INSERT INTO public.sms_apr_riscos_catalogo
  (nome, categoria, probabilidade_padrao, severidade_padrao)
VALUES
  ('Queda de altura',                   'Físico',      'alta',  'critico'),
  ('Choque elétrico',                   'Elétrico',    'média', 'grave'),
  ('Soterramento',                      'Físico',      'baixa', 'critico'),
  ('Atropelamento por equipamento',     'Mecânico',    'média', 'grave'),
  ('Queda de material sobre trabalhador','Físico',     'alta',  'grave'),
  ('Exposição a agente químico',        'Químico',     'média', 'moderado'),
  ('Ergonômico — esforço repetitivo',   'Ergonômico',  'alta',  'leve'),
  ('Incêndio / explosão',               'Incêndio',    'baixa', 'critico'),
  ('Ruído excessivo',                   'Físico',      'alta',  'moderado'),
  ('Vibração de ferramentas',           'Físico',      'alta',  'leve'),
  ('Iluminação inadequada',             'Físico',      'média', 'leve'),
  ('Temperatura extrema',               'Físico',      'média', 'moderado')
ON CONFLICT DO NOTHING;

-- Catálogo de inspeções com itens
-- Usa variáveis de sessão para guardar os IDs sem depender de RETURNING+ON CONFLICT
DO $$
DECLARE
  id_canteiro   uuid;
  id_epis       uuid;
  id_andaimes   uuid;
  id_ferramentas uuid;
BEGIN
  -- Insere ou recupera cada catálogo
  INSERT INTO public.sms_inspecoes_catalogo (titulo, tipo, periodicidade)
    VALUES ('Inspeção de Canteiro de Obras', 'geral', 'diária')
    ON CONFLICT DO NOTHING;
  SELECT id INTO id_canteiro FROM public.sms_inspecoes_catalogo WHERE titulo = 'Inspeção de Canteiro de Obras' LIMIT 1;

  INSERT INTO public.sms_inspecoes_catalogo (titulo, tipo, periodicidade)
    VALUES ('Inspeção de EPIs', 'epi', 'semanal')
    ON CONFLICT DO NOTHING;
  SELECT id INTO id_epis FROM public.sms_inspecoes_catalogo WHERE titulo = 'Inspeção de EPIs' LIMIT 1;

  INSERT INTO public.sms_inspecoes_catalogo (titulo, tipo, periodicidade)
    VALUES ('Inspeção de Andaimes', 'andaime', 'diária')
    ON CONFLICT DO NOTHING;
  SELECT id INTO id_andaimes FROM public.sms_inspecoes_catalogo WHERE titulo = 'Inspeção de Andaimes' LIMIT 1;

  INSERT INTO public.sms_inspecoes_catalogo (titulo, tipo, periodicidade)
    VALUES ('Inspeção de Ferramentas', 'ferramentas', 'semanal')
    ON CONFLICT DO NOTHING;
  SELECT id INTO id_ferramentas FROM public.sms_inspecoes_catalogo WHERE titulo = 'Inspeção de Ferramentas' LIMIT 1;

  -- Só insere itens se não houver nenhum para este catálogo ainda
  IF NOT EXISTS (SELECT 1 FROM public.sms_inspecoes_itens_catalogo WHERE inspecao_catalogo_id = id_canteiro) THEN
    INSERT INTO public.sms_inspecoes_itens_catalogo (inspecao_catalogo_id, ordem, descricao, categoria, obrigatorio) VALUES
      (id_canteiro, 1, 'Áreas devidamente sinalizadas e isoladas',               'Sinalização',   true),
      (id_canteiro, 2, 'Vias de acesso livres e em bom estado',                  'Circulação',    true),
      (id_canteiro, 3, 'Materiais armazenados de forma segura e organizada',     'Ordem',         true),
      (id_canteiro, 4, 'Extintores visíveis, sinalizados e com validade ok',     'Incêndio',      true),
      (id_canteiro, 5, 'Instalações elétricas provisórias protegidas',           'Elétrico',      true),
      (id_canteiro, 6, 'Banheiros e vestiários limpos e em condições de uso',    'Higiene',       false),
      (id_canteiro, 7, 'Resíduos descartados nos locais corretos',               'Meio Ambiente', false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sms_inspecoes_itens_catalogo WHERE inspecao_catalogo_id = id_epis) THEN
    INSERT INTO public.sms_inspecoes_itens_catalogo (inspecao_catalogo_id, ordem, descricao, categoria, obrigatorio) VALUES
      (id_epis, 1, 'Capacete sem trincas, amassados ou sinais de impacto',             'Cabeça',   true),
      (id_epis, 2, 'Óculos de segurança limpos e sem arranhões',                       'Olhos',    true),
      (id_epis, 3, 'Luvas íntegras, sem cortes ou furos',                              'Mãos',     true),
      (id_epis, 4, 'Botinas com CA válido e em bom estado',                            'Pés',      true),
      (id_epis, 5, 'Protetor auricular disponível (quando aplicável)',                 'Audição',  false),
      (id_epis, 6, 'Cinto de segurança inspecionado (quando trabalho em altura)',      'Altura',   false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sms_inspecoes_itens_catalogo WHERE inspecao_catalogo_id = id_andaimes) THEN
    INSERT INTO public.sms_inspecoes_itens_catalogo (inspecao_catalogo_id, ordem, descricao, categoria, obrigatorio) VALUES
      (id_andaimes, 1, 'Base nivelada e apoiada em superfície firme',                  'Estrutura', true),
      (id_andaimes, 2, 'Travamentos e pinos de fixação instalados',                    'Fixação',   true),
      (id_andaimes, 3, 'Guarda-corpos instalados em todos os lados abertos',           'Proteção',  true),
      (id_andaimes, 4, 'Rodapés instalados nas plataformas',                           'Proteção',  true),
      (id_andaimes, 5, 'Acesso seguro (escada ou rampa)',                              'Acesso',    true),
      (id_andaimes, 6, 'Plataformas sem danos, trincas ou deformações',               'Estrutura', true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sms_inspecoes_itens_catalogo WHERE inspecao_catalogo_id = id_ferramentas) THEN
    INSERT INTO public.sms_inspecoes_itens_catalogo (inspecao_catalogo_id, ordem, descricao, categoria, obrigatorio) VALUES
      (id_ferramentas, 1, 'Ferramentas sem cabos soltos, quebrados ou improvisados',  'Geral',       true),
      (id_ferramentas, 2, 'Ferramentas elétricas com fio em bom estado',              'Elétrico',    true),
      (id_ferramentas, 3, 'Discos e lâminas de corte íntegros e adequados',           'Corte',       true),
      (id_ferramentas, 4, 'Ferramentas armazenadas após uso, fora do chão',           'Organização', false);
  END IF;
END $$;

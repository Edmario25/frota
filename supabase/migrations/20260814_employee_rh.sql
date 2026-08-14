-- ─── Dados complementares de RH (1:1 com employees) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_dados_rh (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id               uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  -- Pessoal
  data_nascimento           date,
  estado_civil              text,   -- solteiro | casado | divorciado | viuvo | uniao_estavel
  escolaridade              text,   -- fundamental | medio | tecnico | superior | pos_graduacao
  rg                        text,
  ctps                      text,
  pis                       text,
  cnh                       text,
  cnh_categoria             text,
  cnh_vencimento            date,
  -- Endereço
  cep                       text,
  logradouro                text,
  numero                    text,
  complemento               text,
  bairro                    text,
  cidade                    text,
  estado                    text,
  -- Contato de emergência
  emergencia_nome           text,
  emergencia_telefone       text,
  emergencia_parentesco     text,
  -- Contrato
  tipo_contrato             text,   -- clt | pj | temporario | estagio | terceiro
  salario_base              numeric(12,2),
  jornada_horas             integer,
  data_demissao             date,
  motivo_demissao           text,
  -- Dados bancários
  banco                     text,
  agencia                   text,
  conta                     text,
  tipo_conta                text,   -- corrente | poupanca
  pix                       text,
  -- Benefícios
  vale_alimentacao          numeric(10,2),
  vale_transporte           numeric(10,2),
  plano_saude               boolean NOT NULL DEFAULT false,
  plano_odonto              boolean NOT NULL DEFAULT false,
  observacoes               text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);

-- ─── Documentos do funcionário (1:N) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_documentos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tipo              text NOT NULL,   -- aso | ctps | rg | cnh | nr_35 | nr_12 | nr_10 | nr_33 | outros
  descricao         text,
  arquivo_url       text,
  data_emissao      date,
  data_vencimento   date,
  observacoes       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── Férias e ausências (1:N) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_ferias (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tipo                          text NOT NULL,   -- ferias | afastamento | licenca_medica | licenca_maternidade | licenca_paternidade | falta
  data_inicio                   date NOT NULL,
  data_fim                      date,
  dias_corridos                 integer,
  periodo_aquisitivo_inicio     date,
  periodo_aquisitivo_fim        date,
  cid                           text,
  motivo                        text,
  aprovado                      boolean NOT NULL DEFAULT true,
  observacoes                   text,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.employee_dados_rh  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_ferias    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rh_all"   ON public.employee_dados_rh   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "docs_all" ON public.employee_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fer_all"  ON public.employee_ferias     FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emp_rh_employee    ON public.employee_dados_rh(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_docs_employee  ON public.employee_documentos(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_docs_venc      ON public.employee_documentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_emp_ferias_employee ON public.employee_ferias(employee_id);

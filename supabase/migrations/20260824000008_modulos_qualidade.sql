-- Modulos operacionais do Sistema de Gestao da Qualidade.

CREATE TABLE IF NOT EXISTS public.qualidade_inspecoes_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  servico text NOT NULL,
  local_frente text NOT NULL,
  criterio_aceitacao text NOT NULL,
  resultado text NOT NULL DEFAULT 'pendente' CHECK (resultado IN ('pendente','aprovado','aprovado_com_restricao','reprovado')),
  data_inspecao date NOT NULL DEFAULT CURRENT_DATE,
  responsavel text,
  evidencia_url text,
  observacoes text,
  nc_id uuid REFERENCES public.nao_conformidades(id) ON DELETE SET NULL,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qualidade_inspecoes_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materiais_catalogo(id) ON DELETE SET NULL,
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  material_nome text NOT NULL,
  lote text,
  nota_fiscal text,
  quantidade numeric(14,3) CHECK (quantidade IS NULL OR quantidade > 0),
  unidade text,
  certificado text,
  local_aplicacao text,
  resultado text NOT NULL DEFAULT 'pendente' CHECK (resultado IN ('pendente','aprovado','quarentena','reprovado')),
  data_recebimento date NOT NULL DEFAULT CURRENT_DATE,
  validade date,
  evidencia_url text,
  observacoes text,
  nc_id uuid REFERENCES public.nao_conformidades(id) ON DELETE SET NULL,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qualidade_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  titulo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('plano_qualidade','pes','procedimento','formulario','projeto','certificado','outro')),
  revisao text NOT NULL DEFAULT '00',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','aprovado','obsoleto')),
  responsavel text,
  aprovador text,
  data_emissao date NOT NULL DEFAULT CURRENT_DATE,
  data_validade date,
  arquivo_url text,
  observacoes text,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, codigo, revisao)
);

CREATE TABLE IF NOT EXISTS public.qualidade_auditorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('interna','externa','cliente','fornecedor')),
  norma_referencia text,
  escopo text NOT NULL,
  auditor text,
  data_planejada date NOT NULL,
  data_realizada date,
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','em_andamento','concluida','cancelada')),
  resultado text CHECK (resultado IS NULL OR resultado IN ('conforme','parcialmente_conforme','nao_conforme')),
  total_constatacoes integer NOT NULL DEFAULT 0 CHECK (total_constatacoes >= 0),
  relatorio_url text,
  observacoes text,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qualidade_avaliacoes_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  nota_qualidade numeric(4,2) NOT NULL CHECK (nota_qualidade BETWEEN 0 AND 10),
  nota_prazo numeric(4,2) NOT NULL CHECK (nota_prazo BETWEEN 0 AND 10),
  nota_documentacao numeric(4,2) NOT NULL CHECK (nota_documentacao BETWEEN 0 AND 10),
  nota_atendimento numeric(4,2) NOT NULL CHECK (nota_atendimento BETWEEN 0 AND 10),
  nota_seguranca numeric(4,2) NOT NULL CHECK (nota_seguranca BETWEEN 0 AND 10),
  nota_final numeric(4,2) GENERATED ALWAYS AS (round((nota_qualidade + nota_prazo + nota_documentacao + nota_atendimento + nota_seguranca) / 5, 2)) STORED,
  classificacao text GENERATED ALWAYS AS (
    CASE
      WHEN (nota_qualidade + nota_prazo + nota_documentacao + nota_atendimento + nota_seguranca) / 5 >= 8 THEN 'qualificado'
      WHEN (nota_qualidade + nota_prazo + nota_documentacao + nota_atendimento + nota_seguranca) / 5 >= 6 THEN 'condicional'
      ELSE 'bloqueado'
    END
  ) STORED,
  observacoes text,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, fornecedor_id, periodo)
);

CREATE INDEX IF NOT EXISTS qualidade_fvs_obra_data_idx ON public.qualidade_inspecoes_servicos(obra_id, data_inspecao DESC);
CREATE INDEX IF NOT EXISTS qualidade_fvm_obra_data_idx ON public.qualidade_inspecoes_materiais(obra_id, data_recebimento DESC);
CREATE INDEX IF NOT EXISTS qualidade_docs_obra_status_idx ON public.qualidade_documentos(obra_id, status);
CREATE INDEX IF NOT EXISTS qualidade_auditorias_obra_data_idx ON public.qualidade_auditorias(obra_id, data_planejada DESC);
CREATE INDEX IF NOT EXISTS qualidade_fornecedores_obra_idx ON public.qualidade_avaliacoes_fornecedores(obra_id, fornecedor_id);

DROP TRIGGER IF EXISTS trg_qualidade_fvs_updated_at ON public.qualidade_inspecoes_servicos;
CREATE TRIGGER trg_qualidade_fvs_updated_at BEFORE UPDATE ON public.qualidade_inspecoes_servicos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_qualidade_fvm_updated_at ON public.qualidade_inspecoes_materiais;
CREATE TRIGGER trg_qualidade_fvm_updated_at BEFORE UPDATE ON public.qualidade_inspecoes_materiais
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_qualidade_docs_updated_at ON public.qualidade_documentos;
CREATE TRIGGER trg_qualidade_docs_updated_at BEFORE UPDATE ON public.qualidade_documentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_qualidade_auditorias_updated_at ON public.qualidade_auditorias;
CREATE TRIGGER trg_qualidade_auditorias_updated_at BEFORE UPDATE ON public.qualidade_auditorias
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_qualidade_fornecedores_updated_at ON public.qualidade_avaliacoes_fornecedores;
CREATE TRIGGER trg_qualidade_fornecedores_updated_at BEFORE UPDATE ON public.qualidade_avaliacoes_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'qualidade_inspecoes_servicos', 'qualidade_inspecoes_materiais',
    'qualidade_documentos', 'qualidade_auditorias',
    'qualidade_avaliacoes_fornecedores'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_scoped', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_manage_obra_data(obra_id)) WITH CHECK (public.can_manage_obra_data(obra_id))',
      table_name || '_scoped', table_name
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.qualidade_inspecoes_servicos,
  public.qualidade_inspecoes_materiais,
  public.qualidade_documentos,
  public.qualidade_auditorias,
  public.qualidade_avaliacoes_fornecedores
TO authenticated;

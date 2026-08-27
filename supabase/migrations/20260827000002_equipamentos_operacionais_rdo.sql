-- Evolui Ferramentas para cadastro patrimonial de ferramentas, equipamentos e maquinas.

ALTER TABLE public.ferramentas_catalogo
  ADD COLUMN IF NOT EXISTS tipo_item text NOT NULL DEFAULT 'equipamento',
  ADD COLUMN IF NOT EXISTS codigo_patrimonio text,
  ADD COLUMN IF NOT EXISTS unidade_medicao text NOT NULL DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS horimetro_atual numeric(12,1),
  ADD COLUMN IF NOT EXISTS data_aquisicao date,
  ADD COLUMN IF NOT EXISTS valor_aquisicao numeric(14,2),
  ADD COLUMN IF NOT EXISTS status_operacional text NOT NULL DEFAULT 'disponivel',
  ADD COLUMN IF NOT EXISTS periodicidade_inspecao_dias integer,
  ADD COLUMN IF NOT EXISTS ultima_inspecao date,
  ADD COLUMN IF NOT EXISTS proxima_inspecao date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ferramentas_tipo_item_check') THEN
    ALTER TABLE public.ferramentas_catalogo ADD CONSTRAINT ferramentas_tipo_item_check
      CHECK (tipo_item IN ('ferramenta','equipamento','maquina'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ferramentas_unidade_medicao_check') THEN
    ALTER TABLE public.ferramentas_catalogo ADD CONSTRAINT ferramentas_unidade_medicao_check
      CHECK (unidade_medicao IN ('unidade','horimetro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ferramentas_status_operacional_check') THEN
    ALTER TABLE public.ferramentas_catalogo ADD CONSTRAINT ferramentas_status_operacional_check
      CHECK (status_operacional IN ('disponivel','operando','manutencao','bloqueado','inativo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ferramentas_horimetro_check') THEN
    ALTER TABLE public.ferramentas_catalogo ADD CONSTRAINT ferramentas_horimetro_check
      CHECK (horimetro_atual IS NULL OR horimetro_atual >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ferramentas_patrimonio_uidx
  ON public.ferramentas_catalogo(codigo_patrimonio)
  WHERE codigo_patrimonio IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ferramentas_serie_uidx
  ON public.ferramentas_catalogo(numero_serie)
  WHERE numero_serie IS NOT NULL;

CREATE OR REPLACE VIEW public.v_ferramentas_situacao
WITH (security_invoker = true) AS
SELECT
  -- As colunas originais precisam permanecer nesta mesma ordem para que
  -- CREATE OR REPLACE VIEW seja compativel com ambientes ja implantados.
  f.id, f.nome, f.categoria, f.numero_serie, f.fabricante, f.modelo,
  f.capacidade, f.exige_certificacao, f.ativo,
  a.obra_id AS obra_atual_id, o.nome AS obra_atual_nome, a.frente AS frente_atual,
  a.condicao, a.data_alocacao,
  CASE
    WHEN f.exige_certificacao=false THEN 'nao_exige'
    WHEN EXISTS (SELECT 1 FROM public.ferramentas_certificacoes c WHERE c.ferramenta_id=f.id AND c.data_vencimento < current_date) THEN 'vencido'
    WHEN EXISTS (SELECT 1 FROM public.ferramentas_certificacoes c WHERE c.ferramenta_id=f.id AND c.data_vencimento BETWEEN current_date AND current_date+30) THEN 'a_vencer'
    WHEN EXISTS (SELECT 1 FROM public.ferramentas_certificacoes c WHERE c.ferramenta_id=f.id) THEN 'valido'
    ELSE 'sem_cert'
  END AS cert_status,
  (SELECT min(c.data_vencimento) FROM public.ferramentas_certificacoes c WHERE c.ferramenta_id=f.id AND c.data_vencimento>=current_date) AS proximo_vencimento,
  -- Novas colunas sao acrescentadas somente depois das colunas legadas.
  f.descricao, f.tipo_item, f.codigo_patrimonio, f.unidade_medicao,
  f.horimetro_atual, f.data_aquisicao, f.valor_aquisicao, f.status_operacional,
  f.periodicidade_inspecao_dias, f.ultima_inspecao, f.proxima_inspecao
FROM public.ferramentas_catalogo f
LEFT JOIN public.ferramentas_alocacao a ON a.ferramenta_id=f.id AND a.data_devolucao IS NULL
LEFT JOIN public.obras o ON o.id=a.obra_id
WHERE f.ativo=true;

GRANT SELECT ON public.v_ferramentas_situacao TO authenticated;

-- Evita uso operacional de item bloqueado, em manutencao ou com certificado vencido.
CREATE OR REPLACE FUNCTION public.ferramenta_pode_operar(p_ferramenta_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.v_ferramentas_situacao f
    WHERE f.id=p_ferramenta_id
      AND f.status_operacional IN ('disponivel','operando')
      AND f.cert_status NOT IN ('vencido','sem_cert')
  );
$$;
GRANT EXECUTE ON FUNCTION public.ferramenta_pode_operar(uuid) TO authenticated;

-- Reforca a regra no servidor: um RDO nao pode ser enviado com item cadastrado indisponivel.
CREATE OR REPLACE FUNCTION public.sms_rdo_validar_equipamentos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb;
BEGIN
  IF NEW.status='enviado' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.equipamentos,'[]'::jsonb)) LOOP
      IF item->>'origem'='cadastro' AND NULLIF(item->>'referencia_id','') IS NOT NULL
         AND NOT public.ferramenta_pode_operar((item->>'referencia_id')::uuid) THEN
        RAISE EXCEPTION 'O RDO possui ferramenta ou equipamento indisponivel para operacao';
      END IF;
      IF COALESCE(NULLIF(item->>'horimetro_final','')::numeric,0) < COALESCE(NULLIF(item->>'horimetro_inicial','')::numeric,0) THEN
        RAISE EXCEPTION 'Horimetro final nao pode ser menor que o inicial';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sms_rdo_validar_equipamentos ON public.sms_rdo;
CREATE TRIGGER trg_sms_rdo_validar_equipamentos
  BEFORE UPDATE ON public.sms_rdo
  FOR EACH ROW EXECUTE FUNCTION public.sms_rdo_validar_equipamentos();

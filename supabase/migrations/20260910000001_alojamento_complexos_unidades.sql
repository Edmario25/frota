-- Escala o módulo para casas isoladas e complexos com milhares de alojados.
CREATE TABLE IF NOT EXISTS public.alojamento_complexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  capacidade_autorizada integer CHECK(capacidade_autorizada IS NULL OR capacidade_autorizada>=0),
  responsavel_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','parcialmente_interditado','interditado','inativo')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(obra_id,nome)
);

ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS complexo_id uuid REFERENCES public.alojamento_complexos(id) ON DELETE CASCADE;
ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS tipo_unidade text NOT NULL DEFAULT 'casa'
  CHECK(tipo_unidade IN ('casa','bloco','hotel_pousada','apartamento','conteiner','terceirizada','outro'));
ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS regime text NOT NULL DEFAULT 'proprio'
  CHECK(regime IN ('proprio','alugado','hospedagem','cedido','terceirizado'));
ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS proprietario_fornecedor text;
ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS contrato_numero text;
ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS contrato_inicio date;
ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS contrato_fim date;
ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS valor_mensal numeric(14,2) CHECK(valor_mensal IS NULL OR valor_mensal>=0);
ALTER TABLE public.alojamentos ADD COLUMN IF NOT EXISTS capacidade_autorizada integer CHECK(capacidade_autorizada IS NULL OR capacidade_autorizada>=0);
ALTER TABLE public.alojamentos ADD CONSTRAINT alojamentos_contrato_periodo_check CHECK(contrato_fim IS NULL OR contrato_inicio IS NULL OR contrato_fim>=contrato_inicio);

DO $$ DECLARE r record; v_complexo uuid;
BEGIN
 FOR r IN SELECT id,obra_id,nome,capacidade_declarada,responsavel_id,status FROM public.alojamentos WHERE complexo_id IS NULL LOOP
   INSERT INTO public.alojamento_complexos(obra_id,nome,capacidade_autorizada,responsavel_id,status)
   VALUES(r.obra_id,r.nome,r.capacidade_declarada,r.responsavel_id,r.status)
   ON CONFLICT(obra_id,nome) DO UPDATE SET nome=excluded.nome RETURNING id INTO v_complexo;
   UPDATE public.alojamentos SET complexo_id=v_complexo WHERE id=r.id;
 END LOOP;
END $$;
ALTER TABLE public.alojamentos ALTER COLUMN complexo_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.alojamento_criar_quartos_em_lote(
  p_unidade uuid,p_prefixo text,p_quantidade integer,p_numero_inicial integer,p_leitos_por_quarto integer,p_classificacao text DEFAULT 'masculino'
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid; i integer; v_nome text;
BEGIN
 SELECT obra_id INTO v_obra FROM public.alojamentos WHERE id=p_unidade;
 IF v_obra IS NULL OR NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão ou unidade inválida'; END IF;
 IF p_quantidade NOT BETWEEN 1 AND 200 OR p_leitos_por_quarto NOT BETWEEN 1 AND 20 OR p_numero_inicial<0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
 IF p_classificacao NOT IN ('masculino','feminino','individual','familia','outro') THEN RAISE EXCEPTION 'Classificação inválida'; END IF;
 FOR i IN 0..p_quantidade-1 LOOP
   v_nome=trim(coalesce(p_prefixo,''))||lpad((p_numero_inicial+i)::text,3,'0');
   PERFORM public.alojamento_criar_quarto(p_unidade,v_nome,p_classificacao,p_leitos_por_quarto);
 END LOOP;
 RETURN p_quantidade;
END $$;

ALTER TABLE public.alojamento_complexos ENABLE ROW LEVEL SECURITY;
CREATE POLICY complexos_select ON public.alojamento_complexos FOR SELECT TO authenticated USING(public.alojamento_pode_acessar(obra_id,false));
CREATE POLICY complexos_write ON public.alojamento_complexos FOR ALL TO authenticated USING(public.alojamento_pode_acessar(obra_id,true)) WITH CHECK(public.alojamento_pode_acessar(obra_id,true));
GRANT SELECT,INSERT,UPDATE ON public.alojamento_complexos TO authenticated;
GRANT EXECUTE ON FUNCTION public.alojamento_criar_quartos_em_lote(uuid,text,integer,integer,integer,text) TO authenticated;

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.alojamento_complexos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $$ BEGIN
 IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
   CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.alojamento_complexos
   FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao();
 END IF;
END $$;

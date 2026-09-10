-- Gestão profissional de alojamentos de obra (NR-18 / NR-24).
CREATE TABLE IF NOT EXISTS public.alojamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome text NOT NULL, endereco text, responsavel_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  capacidade_declarada integer NOT NULL DEFAULT 0 CHECK (capacidade_declarada>=0), status text NOT NULL DEFAULT 'ativo'
    CHECK(status IN ('ativo','parcialmente_interditado','interditado','inativo')),
  observacoes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(obra_id,nome)
);
CREATE TABLE IF NOT EXISTS public.alojamento_ambientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alojamento_id uuid NOT NULL REFERENCES public.alojamentos(id) ON DELETE CASCADE,
  nome text NOT NULL, tipo text NOT NULL CHECK(tipo IN ('quarto','banheiro','cozinha','refeitorio','lavanderia','lazer','outro')),
  capacidade integer CHECK(capacidade IS NULL OR capacidade>=0), quantidade_chuveiros integer NOT NULL DEFAULT 0,
  quantidade_sanitarios integer NOT NULL DEFAULT 0, quantidade_lavatorios integer NOT NULL DEFAULT 0,
  ventilacao_adequada boolean, iluminacao_adequada boolean, ativo boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'operacional' CHECK(status IN ('operacional','higienizacao','manutencao','interditado','desativado')),
  observacoes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(alojamento_id,nome)
);
CREATE TABLE IF NOT EXISTS public.alojamento_quartos (
  id uuid PRIMARY KEY REFERENCES public.alojamento_ambientes(id) ON DELETE CASCADE,
  identificacao text NOT NULL, classificacao text NOT NULL DEFAULT 'masculino'
    CHECK(classificacao IN ('masculino','feminino','individual','familia','outro')),
  capacidade integer NOT NULL CHECK(capacidade>0), possui_beliche boolean NOT NULL DEFAULT false,
  quantidade_armarios integer NOT NULL DEFAULT 0 CHECK(quantidade_armarios>=0), observacoes text
);
CREATE TABLE IF NOT EXISTS public.alojamento_leitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quarto_id uuid NOT NULL REFERENCES public.alojamento_quartos(id) ON DELETE CASCADE,
  identificacao text NOT NULL, tipo text NOT NULL DEFAULT 'simples' CHECK(tipo IN ('simples','beliche_inferior','beliche_superior')),
  status text NOT NULL DEFAULT 'disponivel' CHECK(status IN ('disponivel','reservado','ocupado','higienizacao','manutencao','interditado','desativado')),
  motivo_bloqueio text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quarto_id,identificacao)
);
CREATE TABLE IF NOT EXISTS public.alojamento_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leito_id uuid NOT NULL REFERENCES public.alojamento_leitos(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id), inicio_previsto date NOT NULL, fim_previsto date,
  status text NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','confirmada','cancelada','expirada')),
  criado_por uuid REFERENCES auth.users(id), observacoes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(fim_previsto IS NULL OR fim_previsto>=inicio_previsto)
);
CREATE UNIQUE INDEX IF NOT EXISTS alojamento_reserva_leito_ativa ON public.alojamento_reservas(leito_id) WHERE status='ativa';
CREATE UNIQUE INDEX IF NOT EXISTS alojamento_reserva_employee_ativa ON public.alojamento_reservas(employee_id) WHERE status='ativa';
CREATE TABLE IF NOT EXISTS public.alojamento_ocupacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leito_id uuid NOT NULL REFERENCES public.alojamento_leitos(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id), empresa_id uuid REFERENCES public.sms_empresas(id) ON DELETE SET NULL,
  reserva_id uuid REFERENCES public.alojamento_reservas(id) ON DELETE SET NULL, data_entrada timestamptz NOT NULL DEFAULT now(),
  data_saida timestamptz, motivo_saida text, checkin_por uuid REFERENCES auth.users(id), checkout_por uuid REFERENCES auth.users(id),
  presenca_status text NOT NULL DEFAULT 'presente' CHECK(presenca_status IN ('presente','ausente_temporariamente')),
  ausente_desde timestamptz, retorno_previsto timestamptz,
  observacoes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(data_saida IS NULL OR data_saida>=data_entrada)
);
CREATE UNIQUE INDEX IF NOT EXISTS alojamento_ocupacao_leito_aberta ON public.alojamento_ocupacoes(leito_id) WHERE data_saida IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alojamento_ocupacao_employee_aberta ON public.alojamento_ocupacoes(employee_id) WHERE data_saida IS NULL;
CREATE TABLE IF NOT EXISTS public.alojamento_movimentacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ocupacao_id uuid REFERENCES public.alojamento_ocupacoes(id),
  tipo text NOT NULL CHECK(tipo IN ('reserva','checkin','transferencia','checkout','bloqueio','liberacao')),
  leito_origem_id uuid REFERENCES public.alojamento_leitos(id), leito_destino_id uuid REFERENCES public.alojamento_leitos(id),
  realizado_por uuid REFERENCES auth.users(id), motivo text, ocorrido_em timestamptz NOT NULL DEFAULT now(), metadados jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS public.alojamento_bens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alojamento_id uuid NOT NULL REFERENCES public.alojamentos(id) ON DELETE CASCADE,
  ambiente_id uuid REFERENCES public.alojamento_ambientes(id) ON DELETE SET NULL, tombamento text NOT NULL, descricao text NOT NULL,
  categoria text, numero_serie text, fabricante text, modelo text, estado text NOT NULL DEFAULT 'bom'
    CHECK(estado IN ('novo','bom','regular','danificado','inservivel')), valor_aquisicao numeric(14,2), data_aquisicao date,
  ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(alojamento_id,tombamento)
);
CREATE TABLE IF NOT EXISTS public.alojamento_termos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ocupacao_id uuid NOT NULL REFERENCES public.alojamento_ocupacoes(id),
  tipo text NOT NULL CHECK(tipo IN ('entrada','saida')), versao integer NOT NULL DEFAULT 1, declaracao text,
  assinatura_url text, pdf_url text, assinado_em timestamptz, assinado_por_employee_id uuid REFERENCES public.employees(id),
  criado_por uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(ocupacao_id,tipo,versao)
);
CREATE TABLE IF NOT EXISTS public.alojamento_termo_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), termo_id uuid NOT NULL REFERENCES public.alojamento_termos(id) ON DELETE CASCADE,
  bem_id uuid REFERENCES public.alojamento_bens(id) ON DELETE SET NULL, tombamento_snapshot text, descricao_snapshot text NOT NULL,
  estado text NOT NULL CHECK(estado IN ('novo','bom','regular','danificado','ausente','inservivel')),
  quantidade integer NOT NULL DEFAULT 1 CHECK(quantidade>0), valor_referencia numeric(14,2), observacoes text, foto_url text
);
CREATE TABLE IF NOT EXISTS public.alojamento_chamados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alojamento_id uuid NOT NULL REFERENCES public.alojamentos(id) ON DELETE CASCADE,
  ambiente_id uuid REFERENCES public.alojamento_ambientes(id) ON DELETE SET NULL, bem_id uuid REFERENCES public.alojamento_bens(id) ON DELETE SET NULL,
  titulo text NOT NULL, descricao text NOT NULL, tipo text NOT NULL DEFAULT 'corretiva' CHECK(tipo IN ('preventiva','corretiva','emergencial')),
  prioridade text NOT NULL DEFAULT 'media' CHECK(prioridade IN ('baixa','media','alta','critica')),
  status text NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','triagem','em_andamento','aguardando','concluido','cancelado')),
  prazo timestamptz, responsavel_id uuid REFERENCES public.employees(id) ON DELETE SET NULL, custo numeric(14,2),
  foto_antes_url text, foto_depois_url text, conclusao text, aberto_por uuid REFERENCES auth.users(id), concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.alojamento_regimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alojamento_id uuid NOT NULL REFERENCES public.alojamentos(id) ON DELETE CASCADE,
  versao integer NOT NULL, titulo text NOT NULL, texto text NOT NULL, vigente boolean NOT NULL DEFAULT false,
  publicado_em timestamptz, criado_por uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(alojamento_id,versao)
);
CREATE TABLE IF NOT EXISTS public.alojamento_regimento_aceites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), regimento_id uuid NOT NULL REFERENCES public.alojamento_regimentos(id),
  ocupacao_id uuid NOT NULL REFERENCES public.alojamento_ocupacoes(id), employee_id uuid NOT NULL REFERENCES public.employees(id),
  aceite_em timestamptz NOT NULL DEFAULT now(), assinatura_url text, ip inet, UNIQUE(regimento_id,ocupacao_id)
);

ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS acesso_alojamento boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS gerencia_alojamento boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS realiza_checkin_alojamento boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS gerencia_patrimonio_alojamento boolean NOT NULL DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS trata_chamados_alojamento boolean NOT NULL DEFAULT false;
UPDATE public.cargos SET acesso_alojamento=true,gerencia_alojamento=true,realiza_checkin_alojamento=true,
 gerencia_patrimonio_alojamento=true,trata_chamados_alojamento=true
WHERE nivel_acesso IN ('gestor_contrato','gestor_obra','gestor_frota');

CREATE OR REPLACE FUNCTION public.alojamento_pode_acessar(p_obra uuid, p_gerir boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.is_gestor_contrato() OR
   (p_obra IN (SELECT public.get_my_obra_ids()) AND EXISTS(
     SELECT 1 FROM public.employees e JOIN public.cargos c ON c.id=e.cargo_id
     WHERE e.user_id=auth.uid() AND c.acesso_alojamento AND (NOT p_gerir OR c.gerencia_alojamento))))
$$;

CREATE OR REPLACE FUNCTION public.alojamento_checkin(p_leito uuid,p_employee uuid,p_observacoes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid; v_status text; v_ocup uuid; v_empresa uuid; v_count integer; v_cap integer; v_termo uuid;
BEGIN
 SELECT a.obra_id,l.status,q.capacidade INTO v_obra,v_status,v_cap FROM public.alojamento_leitos l
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id
 JOIN public.alojamentos a ON a.id=am.alojamento_id WHERE l.id=p_leito FOR UPDATE OF l;
 IF v_obra IS NULL THEN RAISE EXCEPTION 'Leito não encontrado'; END IF;
 IF NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão nesta obra'; END IF;
 IF v_status NOT IN ('disponivel','reservado') THEN RAISE EXCEPTION 'Leito indisponível'; END IF;
 IF v_status='reservado' AND NOT EXISTS(SELECT 1 FROM public.alojamento_reservas WHERE leito_id=p_leito AND employee_id=p_employee AND status='ativa') THEN RAISE EXCEPTION 'Leito reservado para outro colaborador'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee AND status='ativo') THEN RAISE EXCEPTION 'Colaborador inexistente ou inativo'; END IF;
 IF EXISTS(SELECT 1 FROM public.alojamento_ocupacoes WHERE employee_id=p_employee AND data_saida IS NULL) THEN RAISE EXCEPTION 'Colaborador já possui ocupação ativa'; END IF;
 SELECT count(*) INTO v_count FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id WHERE l.quarto_id=(SELECT quarto_id FROM public.alojamento_leitos WHERE id=p_leito) AND o.data_saida IS NULL;
 IF v_count>=v_cap THEN RAISE EXCEPTION 'Capacidade do quarto atingida'; END IF;
 SELECT sms_empresa_id INTO v_empresa FROM public.employees WHERE id=p_employee;
 INSERT INTO public.alojamento_ocupacoes(leito_id,employee_id,empresa_id,checkin_por,observacoes)
 VALUES(p_leito,p_employee,v_empresa,auth.uid(),p_observacoes) RETURNING id INTO v_ocup;
 UPDATE public.alojamento_leitos SET status='ocupado' WHERE id=p_leito;
 UPDATE public.alojamento_reservas SET status='confirmada' WHERE leito_id=p_leito AND employee_id=p_employee AND status='ativa';
 INSERT INTO public.alojamento_movimentacoes(ocupacao_id,tipo,leito_destino_id,realizado_por) VALUES(v_ocup,'checkin',p_leito,auth.uid());
 INSERT INTO public.alojamento_termos(ocupacao_id,tipo,declaracao,criado_por)
 VALUES(v_ocup,'entrada','Termo de entrada e recebimento dos bens vinculados ao quarto.',auth.uid()) RETURNING id INTO v_termo;
 INSERT INTO public.alojamento_termo_itens(termo_id,bem_id,tombamento_snapshot,descricao_snapshot,estado,valor_referencia)
 SELECT v_termo,b.id,b.tombamento,b.descricao,b.estado,b.valor_aquisicao FROM public.alojamento_bens b
 WHERE b.ativo AND b.ambiente_id=(SELECT quarto_id FROM public.alojamento_leitos WHERE id=p_leito);
 RETURN v_ocup;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_cancelar_reserva(p_reserva uuid,p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_leito uuid; v_obra uuid;
BEGIN
 SELECT r.leito_id,a.obra_id INTO v_leito,v_obra FROM public.alojamento_reservas r JOIN public.alojamento_leitos l ON l.id=r.leito_id
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id JOIN public.alojamentos a ON a.id=am.alojamento_id
 WHERE r.id=p_reserva AND r.status='ativa' FOR UPDATE OF r;
 IF v_obra IS NULL OR NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão ou reserva inválida'; END IF;
 UPDATE public.alojamento_reservas SET status='cancelada',observacoes=concat_ws(E'\n',observacoes,NULLIF(trim(coalesce(p_motivo,'')),'')) WHERE id=p_reserva;
 UPDATE public.alojamento_leitos SET status='disponivel' WHERE id=v_leito AND status='reservado';
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_reservar(p_leito uuid,p_employee uuid,p_inicio date,p_fim date DEFAULT NULL,p_observacoes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid; v_status text; v_id uuid;
BEGIN
 SELECT a.obra_id,l.status INTO v_obra,v_status FROM public.alojamento_leitos l
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id
 JOIN public.alojamentos a ON a.id=am.alojamento_id WHERE l.id=p_leito FOR UPDATE OF l;
 IF v_obra IS NULL OR NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão ou leito inválido'; END IF;
 IF v_status<>'disponivel' THEN RAISE EXCEPTION 'Leito indisponível para reserva'; END IF;
 IF p_inicio<current_date OR (p_fim IS NOT NULL AND p_fim<p_inicio) THEN RAISE EXCEPTION 'Período da reserva inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee AND status='ativo') THEN RAISE EXCEPTION 'Colaborador inexistente ou inativo'; END IF;
 INSERT INTO public.alojamento_reservas(leito_id,employee_id,inicio_previsto,fim_previsto,criado_por,observacoes)
 VALUES(p_leito,p_employee,p_inicio,p_fim,auth.uid(),p_observacoes) RETURNING id INTO v_id;
 UPDATE public.alojamento_leitos SET status='reservado' WHERE id=p_leito;
 INSERT INTO public.alojamento_movimentacoes(tipo,leito_destino_id,realizado_por,motivo,metadados)
 VALUES('reserva',p_leito,auth.uid(),p_observacoes,jsonb_build_object('reserva_id',v_id,'employee_id',p_employee,'inicio',p_inicio,'fim',p_fim));
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_criar_quarto(p_alojamento uuid,p_identificacao text,p_classificacao text,p_capacidade integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid; v_id uuid; i integer;
BEGIN
 SELECT obra_id INTO v_obra FROM public.alojamentos WHERE id=p_alojamento;
 IF v_obra IS NULL OR NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão ou alojamento inválido'; END IF;
 IF length(trim(coalesce(p_identificacao,'')))<1 OR p_capacidade NOT BETWEEN 1 AND 20 OR p_classificacao NOT IN ('masculino','feminino','individual','familia','outro') THEN RAISE EXCEPTION 'Dados do quarto inválidos'; END IF;
 INSERT INTO public.alojamento_ambientes(alojamento_id,nome,tipo,capacidade) VALUES(p_alojamento,'Quarto '||trim(p_identificacao),'quarto',p_capacidade) RETURNING id INTO v_id;
 INSERT INTO public.alojamento_quartos(id,identificacao,classificacao,capacidade) VALUES(v_id,trim(p_identificacao),p_classificacao,p_capacidade);
 FOR i IN 1..p_capacidade LOOP INSERT INTO public.alojamento_leitos(quarto_id,identificacao) VALUES(v_id,lpad(i::text,2,'0')); END LOOP;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_checkout(p_ocupacao uuid,p_motivo text,p_itens jsonb DEFAULT '[]'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_leito uuid; v_obra uuid; v_termo uuid;
BEGIN
 SELECT o.leito_id,a.obra_id INTO v_leito,v_obra FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id JOIN public.alojamentos a ON a.id=am.alojamento_id
 WHERE o.id=p_ocupacao AND o.data_saida IS NULL FOR UPDATE OF o;
 IF v_obra IS NULL THEN RAISE EXCEPTION 'Ocupação ativa não encontrada'; END IF;
 IF NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão nesta obra'; END IF;
 IF length(trim(coalesce(p_motivo,'')))<3 THEN RAISE EXCEPTION 'Informe o motivo da saída'; END IF;
 UPDATE public.alojamento_ocupacoes SET data_saida=now(),motivo_saida=trim(p_motivo),checkout_por=auth.uid() WHERE id=p_ocupacao;
 UPDATE public.alojamento_leitos SET status='higienizacao' WHERE id=v_leito;
 INSERT INTO public.alojamento_movimentacoes(ocupacao_id,tipo,leito_origem_id,realizado_por,motivo) VALUES(p_ocupacao,'checkout',v_leito,auth.uid(),trim(p_motivo));
 INSERT INTO public.alojamento_termos(ocupacao_id,tipo,declaracao,criado_por)
 VALUES(p_ocupacao,'saida','Termo comparativo de saída; exige conferência e assinatura antes da quitação.',auth.uid()) RETURNING id INTO v_termo;
 IF jsonb_array_length(coalesce(p_itens,'[]'::jsonb))>0 THEN
   INSERT INTO public.alojamento_termo_itens(termo_id,bem_id,tombamento_snapshot,descricao_snapshot,estado,valor_referencia,observacoes)
   SELECT v_termo,b.id,b.tombamento,b.descricao,x.estado,b.valor_aquisicao,x.observacoes
   FROM jsonb_to_recordset(p_itens) AS x(bem_id uuid,estado text,observacoes text)
   JOIN public.alojamento_bens b ON b.id=x.bem_id
   WHERE b.ativo AND b.ambiente_id=(SELECT quarto_id FROM public.alojamento_leitos WHERE id=v_leito)
     AND x.estado IN ('novo','bom','regular','danificado','ausente','inservivel');
 ELSE
   INSERT INTO public.alojamento_termo_itens(termo_id,bem_id,tombamento_snapshot,descricao_snapshot,estado,valor_referencia)
   SELECT v_termo,b.id,b.tombamento,b.descricao,b.estado,b.valor_aquisicao FROM public.alojamento_bens b
   WHERE b.ativo AND b.ambiente_id=(SELECT quarto_id FROM public.alojamento_leitos WHERE id=v_leito);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_registrar_ausencia(p_ocupacao uuid,p_ausente boolean,p_retorno timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid;
BEGIN
 SELECT a.obra_id INTO v_obra FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id JOIN public.alojamentos a ON a.id=am.alojamento_id
 WHERE o.id=p_ocupacao AND o.data_saida IS NULL;
 IF v_obra IS NULL OR NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão ou ocupação inválida'; END IF;
 IF p_ausente AND p_retorno IS NOT NULL AND p_retorno<=now() THEN RAISE EXCEPTION 'O retorno previsto deve ser futuro'; END IF;
 UPDATE public.alojamento_ocupacoes SET presenca_status=CASE WHEN p_ausente THEN 'ausente_temporariamente' ELSE 'presente' END,
   ausente_desde=CASE WHEN p_ausente THEN now() ELSE NULL END, retorno_previsto=CASE WHEN p_ausente THEN p_retorno ELSE NULL END
 WHERE id=p_ocupacao;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_transferir(p_ocupacao uuid,p_leito_destino uuid,p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_origem uuid; v_employee uuid; v_obra_origem uuid; v_obra_destino uuid; v_nova uuid;
BEGIN
 SELECT o.leito_id,o.employee_id,a.obra_id INTO v_origem,v_employee,v_obra_origem FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id JOIN public.alojamentos a ON a.id=am.alojamento_id WHERE o.id=p_ocupacao AND o.data_saida IS NULL FOR UPDATE OF o;
 SELECT a.obra_id INTO v_obra_destino FROM public.alojamento_leitos l JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id JOIN public.alojamentos a ON a.id=am.alojamento_id WHERE l.id=p_leito_destino AND l.status='disponivel' FOR UPDATE OF l;
 IF v_obra_origem IS NULL OR v_obra_destino IS NULL THEN RAISE EXCEPTION 'Ocupação ou destino inválido'; END IF;
 IF NOT public.alojamento_pode_acessar(v_obra_origem,true) OR NOT public.alojamento_pode_acessar(v_obra_destino,true) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF length(trim(coalesce(p_motivo,'')))<3 THEN RAISE EXCEPTION 'Informe o motivo da transferência'; END IF;
 UPDATE public.alojamento_ocupacoes SET data_saida=now(),motivo_saida='Transferência: '||trim(p_motivo),checkout_por=auth.uid() WHERE id=p_ocupacao;
 UPDATE public.alojamento_leitos SET status='higienizacao' WHERE id=v_origem;
 INSERT INTO public.alojamento_ocupacoes(leito_id,employee_id,empresa_id,checkin_por,observacoes)
 SELECT p_leito_destino,employee_id,empresa_id,auth.uid(),'Transferido da ocupação '||p_ocupacao FROM public.alojamento_ocupacoes WHERE id=p_ocupacao RETURNING id INTO v_nova;
 UPDATE public.alojamento_leitos SET status='ocupado' WHERE id=p_leito_destino;
 INSERT INTO public.alojamento_movimentacoes(ocupacao_id,tipo,leito_origem_id,leito_destino_id,realizado_por,motivo,metadados)
 VALUES(v_nova,'transferencia',v_origem,p_leito_destino,auth.uid(),trim(p_motivo),jsonb_build_object('ocupacao_anterior',p_ocupacao)); RETURN v_nova;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_pode_acessar_unidade(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.alojamentos a WHERE a.id=p_id AND public.alojamento_pode_acessar(a.obra_id,false))
$$;
CREATE OR REPLACE FUNCTION public.alojamento_pode_acessar_leito(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.alojamento_leitos l JOIN public.alojamento_quartos q ON q.id=l.quarto_id
 JOIN public.alojamento_ambientes am ON am.id=q.id WHERE l.id=p_id AND public.alojamento_pode_acessar_unidade(am.alojamento_id))
$$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['alojamentos','alojamento_ambientes','alojamento_quartos','alojamento_leitos','alojamento_reservas','alojamento_ocupacoes','alojamento_movimentacoes','alojamento_bens','alojamento_termos','alojamento_termo_itens','alojamento_chamados','alojamento_regimentos','alojamento_regimento_aceites'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); END LOOP; END $$;
CREATE POLICY alojamentos_select ON public.alojamentos FOR SELECT TO authenticated USING(alojamento_pode_acessar(obra_id,false));
CREATE POLICY ambientes_select ON public.alojamento_ambientes FOR SELECT TO authenticated USING(alojamento_pode_acessar_unidade(alojamento_id));
CREATE POLICY quartos_select ON public.alojamento_quartos FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM alojamento_ambientes am WHERE am.id=alojamento_quartos.id AND alojamento_pode_acessar_unidade(am.alojamento_id)));
CREATE POLICY leitos_select ON public.alojamento_leitos FOR SELECT TO authenticated USING(alojamento_pode_acessar_leito(id));
CREATE POLICY reservas_select ON public.alojamento_reservas FOR SELECT TO authenticated USING(alojamento_pode_acessar_leito(leito_id));
CREATE POLICY ocupacoes_select ON public.alojamento_ocupacoes FOR SELECT TO authenticated USING(alojamento_pode_acessar_leito(leito_id));
CREATE POLICY movimentacoes_select ON public.alojamento_movimentacoes FOR SELECT TO authenticated USING((leito_origem_id IS NOT NULL AND alojamento_pode_acessar_leito(leito_origem_id)) OR (leito_destino_id IS NOT NULL AND alojamento_pode_acessar_leito(leito_destino_id)));
CREATE POLICY bens_select ON public.alojamento_bens FOR SELECT TO authenticated USING(alojamento_pode_acessar_unidade(alojamento_id));
CREATE POLICY termos_select ON public.alojamento_termos FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM alojamento_ocupacoes o WHERE o.id=ocupacao_id AND alojamento_pode_acessar_leito(o.leito_id)));
CREATE POLICY termo_itens_select ON public.alojamento_termo_itens FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM alojamento_termos t JOIN alojamento_ocupacoes o ON o.id=t.ocupacao_id WHERE t.id=termo_id AND alojamento_pode_acessar_leito(o.leito_id)));
CREATE POLICY chamados_select ON public.alojamento_chamados FOR SELECT TO authenticated USING(alojamento_pode_acessar_unidade(alojamento_id));
CREATE POLICY regimentos_select ON public.alojamento_regimentos FOR SELECT TO authenticated USING(alojamento_pode_acessar_unidade(alojamento_id));
CREATE POLICY aceites_select ON public.alojamento_regimento_aceites FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM alojamento_ocupacoes o WHERE o.id=ocupacao_id AND alojamento_pode_acessar_leito(o.leito_id)));
-- Escrita normal ocorre por RPC; cadastros são limitados por políticas específicas.
CREATE POLICY alojamentos_write ON public.alojamentos FOR ALL TO authenticated USING(alojamento_pode_acessar(obra_id,true)) WITH CHECK(alojamento_pode_acessar(obra_id,true));
CREATE POLICY ambientes_write ON public.alojamento_ambientes FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM alojamentos a WHERE a.id=alojamento_id AND alojamento_pode_acessar(a.obra_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM alojamentos a WHERE a.id=alojamento_id AND alojamento_pode_acessar(a.obra_id,true)));
CREATE POLICY quartos_write ON public.alojamento_quartos FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM alojamento_ambientes am JOIN alojamentos a ON a.id=am.alojamento_id WHERE am.id=alojamento_quartos.id AND alojamento_pode_acessar(a.obra_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM alojamento_ambientes am JOIN alojamentos a ON a.id=am.alojamento_id WHERE am.id=alojamento_quartos.id AND alojamento_pode_acessar(a.obra_id,true)));
CREATE POLICY leitos_write ON public.alojamento_leitos FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM alojamento_quartos q JOIN alojamento_ambientes am ON am.id=q.id JOIN alojamentos a ON a.id=am.alojamento_id WHERE q.id=quarto_id AND alojamento_pode_acessar(a.obra_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM alojamento_quartos q JOIN alojamento_ambientes am ON am.id=q.id JOIN alojamentos a ON a.id=am.alojamento_id WHERE q.id=quarto_id AND alojamento_pode_acessar(a.obra_id,true)));
CREATE POLICY chamados_write ON public.alojamento_chamados FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM alojamentos a WHERE a.id=alojamento_id AND alojamento_pode_acessar(a.obra_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM alojamentos a WHERE a.id=alojamento_id AND alojamento_pode_acessar(a.obra_id,true)));
CREATE POLICY bens_write ON public.alojamento_bens FOR ALL TO authenticated USING(alojamento_pode_acessar_unidade(alojamento_id)) WITH CHECK(alojamento_pode_acessar_unidade(alojamento_id));
GRANT SELECT,INSERT,UPDATE ON public.alojamentos,public.alojamento_ambientes,public.alojamento_quartos,public.alojamento_leitos,public.alojamento_bens,public.alojamento_chamados TO authenticated;
GRANT SELECT ON public.alojamento_reservas,public.alojamento_ocupacoes,public.alojamento_movimentacoes,public.alojamento_bens,public.alojamento_termos,public.alojamento_termo_itens,public.alojamento_regimentos,public.alojamento_regimento_aceites TO authenticated;
GRANT EXECUTE ON FUNCTION public.alojamento_criar_quarto(uuid,text,text,integer),public.alojamento_checkin(uuid,uuid,text),public.alojamento_reservar(uuid,uuid,date,date,text),public.alojamento_cancelar_reserva(uuid,text),public.alojamento_checkout(uuid,text,jsonb),public.alojamento_transferir(uuid,uuid,text),public.alojamento_registrar_ausencia(uuid,boolean,timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.alojamento_pode_acessar(uuid,boolean),public.alojamento_pode_acessar_unidade(uuid),public.alojamento_pode_acessar_leito(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.alojamento_pode_acessar(uuid,boolean),public.alojamento_pode_acessar_unidade(uuid),public.alojamento_pode_acessar_leito(uuid) TO authenticated;

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['alojamentos','alojamento_ambientes','alojamento_leitos','alojamento_reservas','alojamento_ocupacoes','alojamento_bens','alojamento_chamados'] LOOP
 EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',t); END LOOP; END $$;

DO $$ DECLARE t text; BEGIN IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN FOREACH t IN ARRAY ARRAY['alojamentos','alojamento_ambientes','alojamento_leitos','alojamento_reservas','alojamento_ocupacoes','alojamento_movimentacoes','alojamento_bens','alojamento_termos','alojamento_termo_itens','alojamento_chamados','alojamento_regimentos','alojamento_regimento_aceites'] LOOP
 EXECUTE format('CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao()',t); END LOOP; END IF; END $$;

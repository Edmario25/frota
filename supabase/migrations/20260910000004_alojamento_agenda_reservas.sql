-- Agenda profissional: várias reservas futuras, sem sobreposição por leito ou colaborador.
DROP INDEX IF EXISTS public.alojamento_reserva_leito_ativa;
DROP INDEX IF EXISTS public.alojamento_reserva_employee_ativa;

ALTER TABLE public.alojamento_reservas DROP CONSTRAINT IF EXISTS alojamento_reservas_status_check;
ALTER TABLE public.alojamento_reservas ADD CONSTRAINT alojamento_reservas_status_check
  CHECK(status IN ('ativa','confirmada','cancelada','expirada','no_show'));
ALTER TABLE public.alojamento_reservas ADD COLUMN IF NOT EXISTS no_show_em timestamptz;
ALTER TABLE public.alojamento_reservas ADD COLUMN IF NOT EXISTS encerrado_por uuid REFERENCES auth.users(id);
ALTER TABLE public.alojamento_reservas ADD COLUMN IF NOT EXISTS motivo_encerramento text;

CREATE INDEX IF NOT EXISTS idx_aloj_reservas_agenda
  ON public.alojamento_reservas(leito_id,inicio_previsto,fim_previsto) WHERE status='ativa';
CREATE INDEX IF NOT EXISTS idx_aloj_reservas_employee_agenda
  ON public.alojamento_reservas(employee_id,inicio_previsto,fim_previsto) WHERE status='ativa';

CREATE OR REPLACE FUNCTION public.alojamento_reserva_validar_periodo()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_fim date := COALESCE(NEW.fim_previsto,NEW.inicio_previsto);
BEGIN
 IF NEW.status<>'ativa' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.alojamento_reservas r WHERE r.id<>NEW.id AND r.status='ativa'
   AND r.leito_id=NEW.leito_id
   AND daterange(r.inicio_previsto,COALESCE(r.fim_previsto,r.inicio_previsto)+1,'[)') && daterange(NEW.inicio_previsto,v_fim+1,'[)'))
 THEN RAISE EXCEPTION 'Já existe reserva para este leito no período informado'; END IF;
 IF EXISTS(SELECT 1 FROM public.alojamento_reservas r WHERE r.id<>NEW.id AND r.status='ativa'
   AND r.employee_id=NEW.employee_id
   AND daterange(r.inicio_previsto,COALESCE(r.fim_previsto,r.inicio_previsto)+1,'[)') && daterange(NEW.inicio_previsto,v_fim+1,'[)'))
 THEN RAISE EXCEPTION 'O colaborador já possui reserva no período informado'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_aloj_reserva_periodo ON public.alojamento_reservas;
CREATE TRIGGER trg_aloj_reserva_periodo BEFORE INSERT OR UPDATE OF leito_id,employee_id,inicio_previsto,fim_previsto,status
  ON public.alojamento_reservas FOR EACH ROW EXECUTE FUNCTION public.alojamento_reserva_validar_periodo();

CREATE OR REPLACE FUNCTION public.alojamento_reservar(p_leito uuid,p_employee uuid,p_inicio date,p_fim date DEFAULT NULL,p_observacoes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid; v_status text; v_id uuid;
BEGIN
 SELECT a.obra_id,l.status INTO v_obra,v_status FROM public.alojamento_leitos l
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id
 JOIN public.alojamentos a ON a.id=am.alojamento_id WHERE l.id=p_leito FOR UPDATE OF l;
 IF v_obra IS NULL OR NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão ou leito inválido'; END IF;
 IF v_status NOT IN ('disponivel','reservado') THEN RAISE EXCEPTION 'Leito indisponível para reserva'; END IF;
 IF p_inicio<current_date OR (p_fim IS NOT NULL AND p_fim<p_inicio) THEN RAISE EXCEPTION 'Período da reserva inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee AND status='ativo') THEN RAISE EXCEPTION 'Colaborador inexistente ou inativo'; END IF;
 INSERT INTO public.alojamento_reservas(leito_id,employee_id,inicio_previsto,fim_previsto,criado_por,observacoes)
 VALUES(p_leito,p_employee,p_inicio,p_fim,auth.uid(),p_observacoes) RETURNING id INTO v_id;
 IF p_inicio<=current_date AND COALESCE(p_fim,p_inicio)>=current_date THEN UPDATE public.alojamento_leitos SET status='reservado' WHERE id=p_leito; END IF;
 INSERT INTO public.alojamento_movimentacoes(tipo,leito_destino_id,realizado_por,motivo,metadados)
 VALUES('reserva',p_leito,auth.uid(),p_observacoes,jsonb_build_object('reserva_id',v_id,'employee_id',p_employee,'inicio',p_inicio,'fim',p_fim));
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_cancelar_reserva(p_reserva uuid,p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_leito uuid; v_obra uuid;
BEGIN
 SELECT r.leito_id,a.obra_id INTO v_leito,v_obra FROM public.alojamento_reservas r JOIN public.alojamento_leitos l ON l.id=r.leito_id
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id JOIN public.alojamentos a ON a.id=am.alojamento_id
 WHERE r.id=p_reserva AND r.status='ativa' FOR UPDATE OF r;
 IF v_obra IS NULL OR NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão ou reserva inválida'; END IF;
 UPDATE public.alojamento_reservas SET status='cancelada',encerrado_por=auth.uid(),motivo_encerramento=NULLIF(trim(coalesce(p_motivo,'')),'') WHERE id=p_reserva;
 IF NOT EXISTS(SELECT 1 FROM public.alojamento_reservas WHERE leito_id=v_leito AND status='ativa' AND inicio_previsto<=current_date AND COALESCE(fim_previsto,inicio_previsto)>=current_date)
    AND NOT EXISTS(SELECT 1 FROM public.alojamento_ocupacoes WHERE leito_id=v_leito AND data_saida IS NULL)
 THEN UPDATE public.alojamento_leitos SET status='disponivel' WHERE id=v_leito AND status='reservado'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_marcar_no_show(p_reserva uuid,p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_leito uuid; v_obra uuid;
BEGIN
 SELECT r.leito_id,a.obra_id INTO v_leito,v_obra FROM public.alojamento_reservas r
 JOIN public.alojamento_leitos l ON l.id=r.leito_id JOIN public.alojamento_quartos q ON q.id=l.quarto_id
 JOIN public.alojamento_ambientes am ON am.id=q.id JOIN public.alojamentos a ON a.id=am.alojamento_id
 WHERE r.id=p_reserva AND r.status='ativa' FOR UPDATE OF r;
 IF v_obra IS NULL OR NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão ou reserva inválida'; END IF;
 IF length(trim(coalesce(p_motivo,'')))<3 THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
 UPDATE public.alojamento_reservas SET status='no_show',no_show_em=now(),encerrado_por=auth.uid(),motivo_encerramento=trim(p_motivo) WHERE id=p_reserva;
 IF NOT EXISTS(SELECT 1 FROM public.alojamento_reservas WHERE leito_id=v_leito AND status='ativa' AND inicio_previsto<=current_date AND COALESCE(fim_previsto,inicio_previsto)>=current_date)
    AND NOT EXISTS(SELECT 1 FROM public.alojamento_ocupacoes WHERE leito_id=v_leito AND data_saida IS NULL)
 THEN UPDATE public.alojamento_leitos SET status='disponivel' WHERE id=v_leito AND status='reservado'; END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.alojamento_marcar_no_show(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.alojamento_reserva_validar_periodo() FROM PUBLIC,anon;

-- O check-in de um leito reservado só pode confirmar a reserva vigente hoje.
-- Isso evita que uma reserva futura seja consumida antecipadamente.
CREATE OR REPLACE FUNCTION public.alojamento_checkin(p_leito uuid,p_employee uuid,p_observacoes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid; v_status text; v_ocup uuid; v_empresa uuid; v_count integer; v_cap integer; v_termo uuid; v_quarto uuid;
BEGIN
 SELECT a.obra_id,l.status,q.capacidade,l.quarto_id INTO v_obra,v_status,v_cap,v_quarto FROM public.alojamento_leitos l
 JOIN public.alojamento_quartos q ON q.id=l.quarto_id JOIN public.alojamento_ambientes am ON am.id=q.id
 JOIN public.alojamentos a ON a.id=am.alojamento_id WHERE l.id=p_leito FOR UPDATE OF l;
 IF v_obra IS NULL THEN RAISE EXCEPTION 'Leito não encontrado'; END IF;
 IF NOT public.alojamento_pode_acessar(v_obra,true) THEN RAISE EXCEPTION 'Sem permissão nesta obra'; END IF;
 IF v_status NOT IN ('disponivel','reservado') THEN RAISE EXCEPTION 'Leito indisponível'; END IF;
 IF v_status='reservado' AND NOT EXISTS(
   SELECT 1 FROM public.alojamento_reservas WHERE leito_id=p_leito AND employee_id=p_employee AND status='ativa'
     AND inicio_previsto<=current_date AND COALESCE(fim_previsto,inicio_previsto)>=current_date
 ) THEN RAISE EXCEPTION 'Leito reservado para outro colaborador ou período'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee AND status='ativo') THEN RAISE EXCEPTION 'Colaborador inexistente ou inativo'; END IF;
 IF EXISTS(SELECT 1 FROM public.alojamento_ocupacoes WHERE employee_id=p_employee AND data_saida IS NULL) THEN RAISE EXCEPTION 'Colaborador já possui ocupação ativa'; END IF;
 SELECT count(*) INTO v_count FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id WHERE l.quarto_id=v_quarto AND o.data_saida IS NULL;
 IF v_count>=v_cap THEN RAISE EXCEPTION 'Capacidade do quarto atingida'; END IF;
 SELECT sms_empresa_id INTO v_empresa FROM public.employees WHERE id=p_employee;
 INSERT INTO public.alojamento_ocupacoes(leito_id,employee_id,empresa_id,checkin_por,observacoes)
 VALUES(p_leito,p_employee,v_empresa,auth.uid(),p_observacoes) RETURNING id INTO v_ocup;
 UPDATE public.alojamento_leitos SET status='ocupado' WHERE id=p_leito;
 UPDATE public.alojamento_reservas SET status='confirmada'
 WHERE leito_id=p_leito AND employee_id=p_employee AND status='ativa'
   AND inicio_previsto<=current_date AND COALESCE(fim_previsto,inicio_previsto)>=current_date;
 INSERT INTO public.alojamento_movimentacoes(ocupacao_id,tipo,leito_destino_id,realizado_por) VALUES(v_ocup,'checkin',p_leito,auth.uid());
 INSERT INTO public.alojamento_termos(ocupacao_id,tipo,declaracao,criado_por)
 VALUES(v_ocup,'entrada','Termo de entrada e recebimento dos bens do quarto e do leito.',auth.uid()) RETURNING id INTO v_termo;
 INSERT INTO public.alojamento_termo_itens(termo_id,bem_id,tombamento_snapshot,descricao_snapshot,estado,valor_referencia)
 SELECT v_termo,b.id,b.tombamento,b.descricao,b.estado,b.valor_aquisicao FROM public.alojamento_bens b
 WHERE b.ativo AND b.ambiente_id=v_quarto AND (b.leito_id IS NULL OR b.leito_id=p_leito);
 RETURN v_ocup;
END $$;

-- A capacidade autorizada é uma barreira de segurança, não apenas um alerta visual.
CREATE OR REPLACE FUNCTION public.alojamento_validar_capacidade_autorizada()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_unidade uuid; v_complexo uuid; v_lim_unidade integer; v_lim_complexo integer; v_ocup_unidade integer; v_ocup_complexo integer;
BEGIN
 IF NEW.data_saida IS NOT NULL THEN RETURN NEW; END IF;
 SELECT a.id,a.complexo_id,a.capacidade_autorizada,c.capacidade_autorizada
 INTO v_unidade,v_complexo,v_lim_unidade,v_lim_complexo
 FROM public.alojamento_leitos l JOIN public.alojamento_quartos q ON q.id=l.quarto_id
 JOIN public.alojamento_ambientes am ON am.id=q.id JOIN public.alojamentos a ON a.id=am.alojamento_id
 JOIN public.alojamento_complexos c ON c.id=a.complexo_id WHERE l.id=NEW.leito_id;
 SELECT count(*) INTO v_ocup_unidade FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id
 JOIN public.alojamento_ambientes am ON am.id=l.quarto_id WHERE o.data_saida IS NULL AND am.alojamento_id=v_unidade AND (NEW.id IS NULL OR o.id<>NEW.id);
 SELECT count(*) INTO v_ocup_complexo FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id
 JOIN public.alojamento_ambientes am ON am.id=l.quarto_id JOIN public.alojamentos a ON a.id=am.alojamento_id
 WHERE o.data_saida IS NULL AND a.complexo_id=v_complexo AND (NEW.id IS NULL OR o.id<>NEW.id);
 IF v_lim_unidade IS NOT NULL AND v_ocup_unidade>=v_lim_unidade THEN RAISE EXCEPTION 'Capacidade autorizada da unidade atingida'; END IF;
 IF v_lim_complexo IS NOT NULL AND v_ocup_complexo>=v_lim_complexo THEN RAISE EXCEPTION 'Capacidade autorizada do complexo atingida'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_aloj_capacidade_autorizada ON public.alojamento_ocupacoes;
CREATE TRIGGER trg_aloj_capacidade_autorizada BEFORE INSERT OR UPDATE OF leito_id,data_saida ON public.alojamento_ocupacoes
  FOR EACH ROW EXECUTE FUNCTION public.alojamento_validar_capacidade_autorizada();
REVOKE ALL ON FUNCTION public.alojamento_validar_capacidade_autorizada() FROM PUBLIC,anon;

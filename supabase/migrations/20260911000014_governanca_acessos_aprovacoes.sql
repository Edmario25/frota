-- Governança de acessos e segregação de funções.
-- Fecha o ciclo de revisão e centraliza aprovações financeiras no banco.

CREATE OR REPLACE FUNCTION public.decidir_item_revisao_acesso(
  p_item_id uuid, p_decisao text, p_observacao text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v public.access_review_items;
BEGIN
  IF NOT public.access_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_decisao NOT IN ('manter','revogar','ajustar') THEN RAISE EXCEPTION 'Decisao invalida'; END IF;
  IF p_decisao IN ('revogar','ajustar') AND length(trim(coalesce(p_observacao,'')))<5 THEN
    RAISE EXCEPTION 'Informe uma justificativa com pelo menos 5 caracteres';
  END IF;
  SELECT i.* INTO v FROM public.access_review_items i
   JOIN public.access_reviews r ON r.id=i.review_id
   WHERE i.id=p_item_id AND r.status IN ('aberta','em_revisao') FOR UPDATE OF i;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Item de revisao indisponivel'; END IF;
  UPDATE public.access_review_items SET decisao=p_decisao,observacao=nullif(trim(p_observacao),''),
    revisado_por=auth.uid(),revisado_em=now() WHERE id=p_item_id;
  UPDATE public.access_reviews SET status='em_revisao' WHERE id=v.review_id AND status='aberta';
  IF p_decisao='revogar' AND v.assignment_id IS NOT NULL THEN
    UPDATE public.employee_access_profiles SET revogado_em=coalesce(revogado_em,now()),revogado_por=auth.uid()
      WHERE id=v.assignment_id AND revogado_em IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.concluir_revisao_acesso(p_review_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF NOT public.access_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF EXISTS(SELECT 1 FROM public.access_review_items WHERE review_id=p_review_id AND decisao IS NULL) THEN
    RAISE EXCEPTION 'Existem acessos ainda nao revisados';
  END IF;
  UPDATE public.access_reviews SET status='concluida',concluida_por=auth.uid(),concluida_em=now()
    WHERE id=p_review_id AND status IN ('aberta','em_revisao');
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisao indisponivel para conclusao'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.alertas_governanca_acesso()
RETURNS TABLE(tipo text, severidade text, quantidade bigint, descricao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF NOT public.access_is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY SELECT * FROM (
    SELECT 'sem_perfil','alta',count(*)::bigint,'Usuários ativos sem perfil de acesso' FROM auth.users u
      WHERE u.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.employee_access_profiles a WHERE a.user_id=u.id AND a.revogado_em IS NULL AND (a.valido_ate IS NULL OR a.valido_ate>now()))
    UNION ALL SELECT 'acesso_vencido','media',count(*)::bigint,'Acessos vencidos aguardando saneamento' FROM public.employee_access_profiles a WHERE a.revogado_em IS NULL AND a.valido_ate<=now()
    UNION ALL SELECT 'inativo_com_acesso','alta',count(*)::bigint,'Funcionários inativos que ainda possuem acesso' FROM public.employees e WHERE e.user_id IS NOT NULL AND e.status<>'ativo' AND EXISTS(SELECT 1 FROM public.employee_access_profiles a WHERE a.user_id=e.user_id AND a.revogado_em IS NULL AND (a.valido_ate IS NULL OR a.valido_ate>now()))
    UNION ALL SELECT 'usuario_sem_funcionario','media',count(*)::bigint,'Usuários sem funcionário vinculado' FROM auth.users u WHERE u.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.user_id=u.id)
    UNION ALL SELECT 'substituicao_vencendo','baixa',count(*)::bigint,'Substituições que vencem nos próximos 7 dias' FROM public.access_delegations d WHERE d.revogado_em IS NULL AND d.fim_em BETWEEN now() AND now()+interval '7 days'
  ) a WHERE a.quantidade>0 ORDER BY CASE a.severidade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END;
END;
$$;

-- Limite e segregação: quem lançou não aprova o próprio documento.
CREATE OR REPLACE FUNCTION public.aprovar_lancamento_fundo(p_id uuid,p_aprovar boolean,p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v public.fundo_fixo_lancamentos%ROWTYPE; v_obra uuid;
BEGIN
  SELECT l.* INTO v FROM public.fundo_fixo_lancamentos l WHERE l.id=p_id FOR UPDATE;
  SELECT f.obra_id INTO v_obra FROM public.fundo_fixo f WHERE f.id=v.fundo_fixo_id;
  IF v.id IS NULL OR v.status<>'pendente' THEN RAISE EXCEPTION 'Lancamento nao esta pendente'; END IF;
  IF v.created_by=auth.uid() THEN RAISE EXCEPTION 'Quem lancou a despesa nao pode aprovar o proprio lancamento'; END IF;
  IF NOT public.pode('fundo_fixo.aprovar',v_obra) THEN RAISE EXCEPTION 'Sem permissao para aprovar nesta obra'; END IF;
  IF p_aprovar AND NOT public.can_approve_amount('fundo_fixo',v.valor,'obra',v_obra) THEN RAISE EXCEPTION 'Valor acima do seu limite de aprovacao'; END IF;
  IF NOT p_aprovar AND length(trim(coalesce(p_motivo,'')))<5 THEN RAISE EXCEPTION 'Informe o motivo da rejeicao'; END IF;
  UPDATE public.fundo_fixo_lancamentos SET status=CASE WHEN p_aprovar THEN 'aprovado' ELSE 'rejeitado' END,
    aprovado_por=CASE WHEN p_aprovar THEN auth.uid() END, aprovado_em=CASE WHEN p_aprovar THEN now() END,
    rejeitado_por=CASE WHEN NOT p_aprovar THEN auth.uid() END, rejeitado_em=CASE WHEN NOT p_aprovar THEN now() END,
    motivo_rejeicao=CASE WHEN NOT p_aprovar THEN trim(p_motivo) END WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.processar_requisicao_compra(p_id uuid,p_aprovar boolean,p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v public.requisicoes_compra%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.requisicoes_compra WHERE id=p_id FOR UPDATE;
  IF v.id IS NULL OR v.status<>'pendente' THEN RAISE EXCEPTION 'Requisicao nao esta pendente'; END IF;
  IF v.solicitado_por=auth.uid() THEN RAISE EXCEPTION 'O solicitante nao pode aprovar a propria requisicao'; END IF;
  IF NOT public.pode('almoxarifado.aprovar',v.obra_id) THEN RAISE EXCEPTION 'Sem permissao para aprovar nesta obra'; END IF;
  -- A requisição ainda não tem preço. O limite financeiro é validado na ordem
  -- de compra, depois da cotação, quando existe um valor confiável.
  IF NOT p_aprovar AND length(trim(coalesce(p_motivo,'')))<5 THEN RAISE EXCEPTION 'Informe o motivo da rejeicao'; END IF;
  UPDATE public.requisicoes_compra SET status=CASE WHEN p_aprovar THEN 'aprovada' ELSE 'rejeitada' END,
    aprovado_por=auth.uid(),motivo_rejeicao=CASE WHEN p_aprovar THEN NULL ELSE trim(p_motivo) END,
    updated_at=now() WHERE id=p_id;
END $$;

-- Medição: aprovador não pode ser o mesmo usuário que a enviou e respeita limite.
CREATE OR REPLACE FUNCTION public.validar_aprovacao_medicao()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF NEW.status='aprovada' AND OLD.status<>'aprovada' THEN
    IF NEW.enviada_por=auth.uid() THEN RAISE EXCEPTION 'Quem enviou a medicao nao pode aprova-la'; END IF;
    IF NOT public.pode('subcontratadas.aprovar',NEW.obra_id) THEN RAISE EXCEPTION 'Sem permissao para aprovar nesta obra'; END IF;
    IF NOT public.can_approve_amount('subcontratadas',NEW.valor_medido,'obra',NEW.obra_id) THEN RAISE EXCEPTION 'Valor acima do seu limite de aprovacao'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validar_aprovacao_medicao ON public.medicoes;
CREATE TRIGGER trg_validar_aprovacao_medicao BEFORE UPDATE OF status ON public.medicoes FOR EACH ROW EXECUTE FUNCTION public.validar_aprovacao_medicao();

-- Ordem de compra tem valor conhecido: exige aprovação antes do recebimento.
ALTER TABLE public.ordens_compra DROP CONSTRAINT IF EXISTS ordens_compra_status_check;
ALTER TABLE public.ordens_compra ADD CONSTRAINT ordens_compra_status_check CHECK(status IN ('rascunho','aguardando_aprovacao','aprovada','enviada','recebida','rejeitada','cancelada'));
ALTER TABLE public.ordens_compra ADD COLUMN IF NOT EXISTS aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz, ADD COLUMN IF NOT EXISTS motivo_rejeicao text;

CREATE OR REPLACE FUNCTION public.processar_ordem_compra(p_id uuid,p_acao text,p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v public.ordens_compra%ROWTYPE; v_novo text;
BEGIN
  SELECT * INTO v FROM public.ordens_compra WHERE id=p_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Ordem de compra nao encontrada'; END IF;
  v_novo:=CASE WHEN p_acao='enviar' AND v.status='rascunho' THEN 'aguardando_aprovacao'
    WHEN p_acao='aprovar' AND v.status='aguardando_aprovacao' THEN 'aprovada'
    WHEN p_acao='rejeitar' AND v.status='aguardando_aprovacao' THEN 'rejeitada'
    WHEN p_acao='cancelar' AND v.status IN ('rascunho','aguardando_aprovacao','rejeitada') THEN 'cancelada' END;
  IF v_novo IS NULL THEN RAISE EXCEPTION 'Transicao invalida para a ordem de compra'; END IF;
  IF p_acao IN ('aprovar','rejeitar') THEN
    IF v.emitido_por=auth.uid() THEN RAISE EXCEPTION 'Quem emitiu a ordem nao pode aprova-la ou rejeita-la'; END IF;
    IF NOT public.pode('almoxarifado.aprovar',v.obra_id) THEN RAISE EXCEPTION 'Sem permissao para aprovar nesta obra'; END IF;
  ELSIF NOT public.pode('almoxarifado.editar',v.obra_id) THEN RAISE EXCEPTION 'Sem permissao para alterar nesta obra'; END IF;
  IF p_acao='aprovar' AND NOT public.can_approve_amount('almoxarifado',v.valor_total,'obra',v.obra_id) THEN RAISE EXCEPTION 'Valor acima do seu limite de aprovacao'; END IF;
  IF p_acao IN ('rejeitar','cancelar') AND length(trim(coalesce(p_motivo,'')))<5 THEN RAISE EXCEPTION 'Informe uma justificativa'; END IF;
  UPDATE public.ordens_compra SET status=v_novo, aprovado_por=CASE WHEN p_acao='aprovar' THEN auth.uid() ELSE aprovado_por END,
    aprovado_em=CASE WHEN p_acao='aprovar' THEN now() ELSE aprovado_em END,
    motivo_rejeicao=CASE WHEN p_acao='rejeitar' THEN trim(p_motivo) ELSE motivo_rejeicao END,updated_at=now() WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.impedir_recebimento_oc_nao_aprovada()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status='recebida' AND OLD.status NOT IN ('aprovada','enviada') THEN RAISE EXCEPTION 'A ordem precisa estar aprovada antes do recebimento'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_impedir_recebimento_oc_nao_aprovada ON public.ordens_compra;
CREATE TRIGGER trg_impedir_recebimento_oc_nao_aprovada BEFORE UPDATE OF status ON public.ordens_compra FOR EACH ROW EXECUTE FUNCTION public.impedir_recebimento_oc_nao_aprovada();

CREATE OR REPLACE FUNCTION public.almoxarifado_receber_ordem_compra(p_ordem uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oc record; it record; n integer:=0;
BEGIN
  SELECT * INTO oc FROM public.ordens_compra WHERE id=p_ordem FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de compra nao encontrada'; END IF;
  IF NOT public.pode('almoxarifado.editar',oc.obra_id) THEN RAISE EXCEPTION 'Sem permissao para receber nesta obra'; END IF;
  IF oc.status<>'aprovada' THEN RAISE EXCEPTION 'A ordem precisa estar aprovada antes do recebimento'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ordens_compra_itens WHERE ordem_id=p_ordem) THEN RAISE EXCEPTION 'A ordem nao tem itens'; END IF;
  FOR it IN SELECT * FROM public.ordens_compra_itens WHERE ordem_id=p_ordem LOOP
    INSERT INTO public.almoxarifado_movimentos(obra_id,material_id,tipo,quantidade,preco_unitario,fornecedor_id,observacoes,registrado_por,data_movimento,ordem_compra_id)
    VALUES(oc.obra_id,it.material_id,'entrada',it.quantidade,nullif(it.preco_unitario,0),oc.fornecedor_id,'Recebimento da '||oc.numero_oc,auth.uid(),current_date,p_ordem);
    n:=n+1;
  END LOOP;
  PERFORM set_config('almox.recebimento_oc','1',true);
  UPDATE public.ordens_compra SET status='recebida',updated_at=now() WHERE id=p_ordem;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.decidir_item_revisao_acesso(uuid,text,text),public.concluir_revisao_acesso(uuid),public.alertas_governanca_acesso(),public.processar_requisicao_compra(uuid,boolean,text),public.processar_ordem_compra(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decidir_item_revisao_acesso(uuid,text,text),public.concluir_revisao_acesso(uuid),public.alertas_governanca_acesso(),public.processar_requisicao_compra(uuid,boolean,text),public.processar_ordem_compra(uuid,text,text) TO authenticated;

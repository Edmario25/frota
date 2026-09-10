-- ─── Alojamento: patrimônio por leito, movimentação rastreada e leito íntegro ─
--
-- 1. Bem pode ficar no quarto (compartilhado: TV, ar) ou num leito específico
--    (cama, colchão, armário). Antes só existia o nível do quarto.
-- 2. Todo deslocamento, troca de estado ou baixa de bem vira histórico,
--    gravado por trigger — nem uma edição direta escapa do registro.
-- 3. Status de leito só muda por função, com transições válidas. Antes era
--    possível marcar como "disponível" um leito com ocupação aberta.
-- 4. Escrita de patrimônio passa a exigir permissão de gestão (antes bastava
--    a de leitura).

-- ─── 1. Bem vinculado a leito ───────────────────────────────────────────────
ALTER TABLE public.alojamento_bens
  ADD COLUMN IF NOT EXISTS leito_id uuid REFERENCES public.alojamento_leitos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS baixado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_baixa text;

CREATE INDEX IF NOT EXISTS idx_aloj_bens_ambiente ON public.alojamento_bens(ambiente_id);
CREATE INDEX IF NOT EXISTS idx_aloj_bens_leito    ON public.alojamento_bens(leito_id) WHERE leito_id IS NOT NULL;

-- O leito precisa pertencer ao ambiente informado, e o ambiente à unidade.
CREATE OR REPLACE FUNCTION public.alojamento_bem_validar_local()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.ambiente_id IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM public.alojamento_ambientes
       WHERE id = NEW.ambiente_id AND alojamento_id = NEW.alojamento_id) THEN
    RAISE EXCEPTION 'O ambiente escolhido não pertence a esta unidade';
  END IF;
  IF NEW.leito_id IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM public.alojamento_leitos
       WHERE id = NEW.leito_id AND quarto_id = NEW.ambiente_id) THEN
    RAISE EXCEPTION 'O leito escolhido não pertence a este quarto';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_aloj_bem_validar_local ON public.alojamento_bens;
CREATE TRIGGER trg_aloj_bem_validar_local
  BEFORE INSERT OR UPDATE OF alojamento_id, ambiente_id, leito_id ON public.alojamento_bens
  FOR EACH ROW EXECUTE FUNCTION public.alojamento_bem_validar_local();

-- ─── 2. Histórico de movimentação do bem ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alojamento_bem_movimentacoes (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bem_id                uuid NOT NULL REFERENCES public.alojamento_bens(id) ON DELETE CASCADE,
  tipo                  text NOT NULL CHECK (tipo IN
                          ('cadastro','transferencia','estado','baixa','reativacao')),
  alojamento_origem_id  uuid REFERENCES public.alojamentos(id)            ON DELETE SET NULL,
  ambiente_origem_id    uuid REFERENCES public.alojamento_ambientes(id)  ON DELETE SET NULL,
  leito_origem_id       uuid REFERENCES public.alojamento_leitos(id)     ON DELETE SET NULL,
  alojamento_destino_id uuid REFERENCES public.alojamentos(id)            ON DELETE SET NULL,
  ambiente_destino_id   uuid REFERENCES public.alojamento_ambientes(id)  ON DELETE SET NULL,
  leito_destino_id      uuid REFERENCES public.alojamento_leitos(id)     ON DELETE SET NULL,
  estado_anterior       text,
  estado_novo           text,
  motivo                text,
  realizado_por         uuid REFERENCES auth.users(id),
  ocorrido_em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aloj_bem_mov_bem ON public.alojamento_bem_movimentacoes(bem_id, ocorrido_em DESC);

-- O motivo chega das funções por uma variável de sessão; edição sem motivo
-- também é registrada, só que com motivo vazio.
CREATE OR REPLACE FUNCTION public.alojamento_bem_registrar_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_motivo text := NULLIF(current_setting('alojamento.motivo', true), '');
  v_tipo   text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.alojamento_bem_movimentacoes
      (bem_id, tipo, alojamento_destino_id, ambiente_destino_id, leito_destino_id,
       estado_novo, motivo, realizado_por)
    VALUES (NEW.id, 'cadastro', NEW.alojamento_id, NEW.ambiente_id, NEW.leito_id,
            NEW.estado, COALESCE(v_motivo, 'Cadastro inicial'), auth.uid());
    RETURN NEW;
  END IF;

  IF OLD.ativo AND NOT NEW.ativo THEN
    v_tipo := 'baixa';
  ELSIF NOT OLD.ativo AND NEW.ativo THEN
    v_tipo := 'reativacao';
  ELSIF OLD.alojamento_id IS DISTINCT FROM NEW.alojamento_id
     OR OLD.ambiente_id   IS DISTINCT FROM NEW.ambiente_id
     OR OLD.leito_id      IS DISTINCT FROM NEW.leito_id THEN
    v_tipo := 'transferencia';
  ELSIF OLD.estado IS DISTINCT FROM NEW.estado THEN
    v_tipo := 'estado';
  ELSE
    RETURN NEW;   -- mudou só descrição, valor etc.: não é movimentação
  END IF;

  INSERT INTO public.alojamento_bem_movimentacoes
    (bem_id, tipo,
     alojamento_origem_id, ambiente_origem_id, leito_origem_id,
     alojamento_destino_id, ambiente_destino_id, leito_destino_id,
     estado_anterior, estado_novo, motivo, realizado_por)
  VALUES
    (NEW.id, v_tipo,
     OLD.alojamento_id, OLD.ambiente_id, OLD.leito_id,
     NEW.alojamento_id, NEW.ambiente_id, NEW.leito_id,
     OLD.estado, NEW.estado, v_motivo, auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_aloj_bem_historico ON public.alojamento_bens;
CREATE TRIGGER trg_aloj_bem_historico
  AFTER INSERT OR UPDATE ON public.alojamento_bens
  FOR EACH ROW EXECUTE FUNCTION public.alojamento_bem_registrar_historico();

-- Bens que já existiam ganham o registro de cadastro retroativo.
INSERT INTO public.alojamento_bem_movimentacoes
  (bem_id, tipo, alojamento_destino_id, ambiente_destino_id, estado_novo, motivo, ocorrido_em)
SELECT b.id, 'cadastro', b.alojamento_id, b.ambiente_id, b.estado, 'Cadastro anterior ao histórico', b.created_at
FROM public.alojamento_bens b
WHERE NOT EXISTS (SELECT 1 FROM public.alojamento_bem_movimentacoes m WHERE m.bem_id = b.id);

-- ─── 3. Funções de patrimônio ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alojamento_movimentar_bem(
  p_bem uuid, p_alojamento uuid, p_ambiente uuid, p_leito uuid,
  p_motivo text, p_estado text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  b          public.alojamento_bens%ROWTYPE;
  v_obra_ori uuid;
  v_obra_des uuid;
BEGIN
  SELECT * INTO b FROM public.alojamento_bens WHERE id = p_bem FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bem não encontrado'; END IF;
  IF NOT b.ativo THEN RAISE EXCEPTION 'Bem baixado não pode ser movimentado. Reative-o antes.'; END IF;

  SELECT obra_id INTO v_obra_ori FROM public.alojamentos WHERE id = b.alojamento_id;
  SELECT obra_id INTO v_obra_des FROM public.alojamentos WHERE id = p_alojamento;
  IF v_obra_des IS NULL THEN RAISE EXCEPTION 'Unidade de destino inválida'; END IF;
  IF NOT public.alojamento_pode_acessar(v_obra_ori, true)
     OR NOT public.alojamento_pode_acessar(v_obra_des, true) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar patrimônio entre estas unidades';
  END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da movimentação';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('novo','bom','regular','danificado','inservivel') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  IF p_alojamento <> b.alojamento_id AND EXISTS (
       SELECT 1 FROM public.alojamento_bens
       WHERE alojamento_id = p_alojamento AND tombamento = b.tombamento) THEN
    RAISE EXCEPTION 'Já existe um bem com o tombamento % na unidade de destino', b.tombamento;
  END IF;

  PERFORM set_config('alojamento.motivo', trim(p_motivo), true);
  UPDATE public.alojamento_bens
  SET alojamento_id = p_alojamento,
      ambiente_id   = p_ambiente,
      leito_id      = p_leito,
      estado        = COALESCE(p_estado, estado)
  WHERE id = p_bem;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_baixar_bem(p_bem uuid, p_motivo text, p_estado text DEFAULT 'inservivel')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid;
BEGIN
  SELECT a.obra_id INTO v_obra FROM public.alojamento_bens b
  JOIN public.alojamentos a ON a.id = b.alojamento_id
  WHERE b.id = p_bem AND b.ativo FOR UPDATE OF b;
  IF v_obra IS NULL THEN RAISE EXCEPTION 'Bem não encontrado ou já baixado'; END IF;
  IF NOT public.alojamento_pode_acessar(v_obra, true) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo da baixa'; END IF;

  PERFORM set_config('alojamento.motivo', trim(p_motivo), true);
  UPDATE public.alojamento_bens
  SET ativo = false, baixado_em = now(), motivo_baixa = trim(p_motivo),
      estado = COALESCE(p_estado, estado), leito_id = NULL
  WHERE id = p_bem;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_reativar_bem(p_bem uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid;
BEGIN
  SELECT a.obra_id INTO v_obra FROM public.alojamento_bens b
  JOIN public.alojamentos a ON a.id = b.alojamento_id
  WHERE b.id = p_bem AND NOT b.ativo FOR UPDATE OF b;
  IF v_obra IS NULL THEN RAISE EXCEPTION 'Bem não encontrado ou já ativo'; END IF;
  IF NOT public.alojamento_pode_acessar(v_obra, true) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo da reativação'; END IF;

  PERFORM set_config('alojamento.motivo', trim(p_motivo), true);
  UPDATE public.alojamento_bens
  SET ativo = true, baixado_em = NULL, motivo_baixa = NULL
  WHERE id = p_bem;
END $$;

-- ─── 4. Status do leito só por função, com transição válida ─────────────────
CREATE OR REPLACE FUNCTION public.alojamento_alterar_status_leito(p_leito uuid, p_status text, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obra uuid; v_atual text;
BEGIN
  SELECT a.obra_id, l.status INTO v_obra, v_atual
  FROM public.alojamento_leitos l
  JOIN public.alojamento_quartos q   ON q.id  = l.quarto_id
  JOIN public.alojamento_ambientes am ON am.id = q.id
  JOIN public.alojamentos a          ON a.id  = am.alojamento_id
  WHERE l.id = p_leito FOR UPDATE OF l;

  IF v_obra IS NULL THEN RAISE EXCEPTION 'Leito não encontrado'; END IF;
  IF NOT public.alojamento_pode_acessar(v_obra, true) THEN RAISE EXCEPTION 'Sem permissão nesta obra'; END IF;
  IF v_atual IN ('ocupado','reservado') THEN
    RAISE EXCEPTION 'Leito % não pode mudar de status por aqui. Use check-out ou cancele a reserva.', v_atual;
  END IF;
  IF EXISTS (SELECT 1 FROM public.alojamento_ocupacoes WHERE leito_id = p_leito AND data_saida IS NULL) THEN
    RAISE EXCEPTION 'Existe ocupação aberta neste leito';
  END IF;
  IF p_status NOT IN ('disponivel','higienizacao','manutencao','interditado','desativado') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;
  IF p_status IN ('manutencao','interditado','desativado') AND length(trim(coalesce(p_motivo,''))) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do bloqueio';
  END IF;

  UPDATE public.alojamento_leitos
  SET status = p_status,
      motivo_bloqueio = CASE WHEN p_status IN ('manutencao','interditado','desativado') THEN trim(p_motivo) END
  WHERE id = p_leito;

  INSERT INTO public.alojamento_movimentacoes(tipo, leito_destino_id, realizado_por, motivo, metadados)
  VALUES (CASE WHEN p_status = 'disponivel' THEN 'liberacao' ELSE 'bloqueio' END,
          p_leito, auth.uid(), NULLIF(trim(coalesce(p_motivo,'')), ''),
          jsonb_build_object('de', v_atual, 'para', p_status));
END $$;

-- Sem escrita direta em leito: tudo passa pelas funções acima e pelas de
-- check-in, check-out, reserva e transferência.
DROP POLICY IF EXISTS leitos_write ON public.alojamento_leitos;
REVOKE INSERT, UPDATE, DELETE ON public.alojamento_leitos FROM authenticated;

-- ─── 5. Patrimônio exige permissão de gestão para escrita ───────────────────
DROP POLICY IF EXISTS bens_write ON public.alojamento_bens;
CREATE POLICY bens_insert ON public.alojamento_bens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.alojamentos a
                      WHERE a.id = alojamento_id AND public.alojamento_pode_acessar(a.obra_id, true)));
CREATE POLICY bens_update ON public.alojamento_bens FOR UPDATE TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.alojamentos a
                      WHERE a.id = alojamento_id AND public.alojamento_pode_acessar(a.obra_id, true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.alojamentos a
                      WHERE a.id = alojamento_id AND public.alojamento_pode_acessar(a.obra_id, true)));

ALTER TABLE public.alojamento_bem_movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY bem_mov_select ON public.alojamento_bem_movimentacoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.alojamento_bens b
                 WHERE b.id = bem_id AND public.alojamento_pode_acessar_unidade(b.alojamento_id)));
GRANT SELECT ON public.alojamento_bem_movimentacoes TO authenticated;

-- ─── 6. Check-in e check-out enxergam o bem do leito ────────────────────────
-- O termo passa a listar o que é do quarto (compartilhado) mais o que é
-- daquele leito — e não mais os bens dos outros leitos do mesmo quarto.
-- Na saída, o estado conferido é gravado no bem; "ausente" não altera o
-- estado, só fica registrado no termo.

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
 IF v_status='reservado' AND NOT EXISTS(SELECT 1 FROM public.alojamento_reservas WHERE leito_id=p_leito AND employee_id=p_employee AND status='ativa') THEN RAISE EXCEPTION 'Leito reservado para outro colaborador'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee AND status='ativo') THEN RAISE EXCEPTION 'Colaborador inexistente ou inativo'; END IF;
 IF EXISTS(SELECT 1 FROM public.alojamento_ocupacoes WHERE employee_id=p_employee AND data_saida IS NULL) THEN RAISE EXCEPTION 'Colaborador já possui ocupação ativa'; END IF;
 SELECT count(*) INTO v_count FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id WHERE l.quarto_id=v_quarto AND o.data_saida IS NULL;
 IF v_count>=v_cap THEN RAISE EXCEPTION 'Capacidade do quarto atingida'; END IF;
 SELECT sms_empresa_id INTO v_empresa FROM public.employees WHERE id=p_employee;
 INSERT INTO public.alojamento_ocupacoes(leito_id,employee_id,empresa_id,checkin_por,observacoes)
 VALUES(p_leito,p_employee,v_empresa,auth.uid(),p_observacoes) RETURNING id INTO v_ocup;
 UPDATE public.alojamento_leitos SET status='ocupado' WHERE id=p_leito;
 UPDATE public.alojamento_reservas SET status='confirmada' WHERE leito_id=p_leito AND employee_id=p_employee AND status='ativa';
 INSERT INTO public.alojamento_movimentacoes(ocupacao_id,tipo,leito_destino_id,realizado_por) VALUES(v_ocup,'checkin',p_leito,auth.uid());
 INSERT INTO public.alojamento_termos(ocupacao_id,tipo,declaracao,criado_por)
 VALUES(v_ocup,'entrada','Termo de entrada e recebimento dos bens do quarto e do leito.',auth.uid()) RETURNING id INTO v_termo;
 INSERT INTO public.alojamento_termo_itens(termo_id,bem_id,tombamento_snapshot,descricao_snapshot,estado,valor_referencia)
 SELECT v_termo,b.id,b.tombamento,b.descricao,b.estado,b.valor_aquisicao FROM public.alojamento_bens b
 WHERE b.ativo AND b.ambiente_id=v_quarto AND (b.leito_id IS NULL OR b.leito_id=p_leito);
 RETURN v_ocup;
END $$;

CREATE OR REPLACE FUNCTION public.alojamento_checkout(p_ocupacao uuid,p_motivo text,p_itens jsonb DEFAULT '[]'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_leito uuid; v_obra uuid; v_termo uuid; v_quarto uuid;
BEGIN
 SELECT o.leito_id,a.obra_id,l.quarto_id INTO v_leito,v_obra,v_quarto FROM public.alojamento_ocupacoes o JOIN public.alojamento_leitos l ON l.id=o.leito_id
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
   WHERE b.ativo AND b.ambiente_id=v_quarto AND (b.leito_id IS NULL OR b.leito_id=v_leito)
     AND x.estado IN ('novo','bom','regular','danificado','ausente','inservivel');

   PERFORM set_config('alojamento.motivo','Conferência no check-out: '||trim(p_motivo),true);
   UPDATE public.alojamento_bens b SET estado=x.estado
   FROM jsonb_to_recordset(p_itens) AS x(bem_id uuid,estado text,observacoes text)
   WHERE b.id=x.bem_id AND b.ativo AND b.ambiente_id=v_quarto AND (b.leito_id IS NULL OR b.leito_id=v_leito)
     AND x.estado IN ('novo','bom','regular','danificado','inservivel') AND b.estado<>x.estado;
 ELSE
   INSERT INTO public.alojamento_termo_itens(termo_id,bem_id,tombamento_snapshot,descricao_snapshot,estado,valor_referencia)
   SELECT v_termo,b.id,b.tombamento,b.descricao,b.estado,b.valor_aquisicao FROM public.alojamento_bens b
   WHERE b.ativo AND b.ambiente_id=v_quarto AND (b.leito_id IS NULL OR b.leito_id=v_leito);
 END IF;
END $$;

GRANT EXECUTE ON FUNCTION
  public.alojamento_movimentar_bem(uuid,uuid,uuid,uuid,text,text),
  public.alojamento_baixar_bem(uuid,text,text),
  public.alojamento_reativar_bem(uuid,text),
  public.alojamento_alterar_status_leito(uuid,text,text)
TO authenticated;

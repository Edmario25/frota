-- Evolução profissional do App Almoxarifado: múltiplas obras vinculadas,
-- idempotência, integração operacional/RH e rastreabilidade de devoluções.

ALTER TABLE public.almoxarifado_entregas
  ADD COLUMN IF NOT EXISTS operacao_id uuid,
  ADD COLUMN IF NOT EXISTS requisicao_hash text,
  ADD COLUMN IF NOT EXISTS cronograma_item_id uuid REFERENCES public.cronograma_itens(id),
  ADD COLUMN IF NOT EXISTS centro_custo text;
CREATE UNIQUE INDEX IF NOT EXISTS almox_entregas_operacao_uidx
  ON public.almoxarifado_entregas(operacao_id) WHERE operacao_id IS NOT NULL;

ALTER TABLE public.almoxarifado_devolucoes
  ADD COLUMN IF NOT EXISTS operacao_id uuid,
  ADD COLUMN IF NOT EXISTS requisicao_hash text,
  ADD COLUMN IF NOT EXISTS assinatura_base64 text,
  ADD COLUMN IF NOT EXISTS assinatura_hash text,
  ADD COLUMN IF NOT EXISTS assinado_em timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS almox_devolucoes_operacao_uidx
  ON public.almoxarifado_devolucoes(operacao_id) WHERE operacao_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.almox_vinculo_vigente(p_employee uuid, p_obra uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.obra_funcionarios v
    WHERE v.employee_id=p_employee AND v.obra_id=p_obra AND v.status
      AND (v.data_entrada IS NULL OR v.data_entrada <= current_date)
      AND (v.data_saida IS NULL OR v.data_saida >= current_date));
$$;
REVOKE ALL ON FUNCTION public.almox_vinculo_vigente(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.almox_vinculo_vigente(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS cronograma_itens_almox_app_read ON public.cronograma_itens;
CREATE POLICY cronograma_itens_almox_app_read ON public.cronograma_itens FOR SELECT TO authenticated
USING (public.has_employee_app_access('almoxarifado') AND public.almox_vinculo_vigente(public.get_user_employee_id(), obra_id));
DROP POLICY IF EXISTS sms_frentes_almox_app_read ON public.sms_frentes;
CREATE POLICY sms_frentes_almox_app_read ON public.sms_frentes FOR SELECT TO authenticated
USING (public.has_employee_app_access('almoxarifado') AND public.almox_vinculo_vigente(public.get_user_employee_id(), obra_id));

ALTER TABLE public.almoxarifado_devolucao_itens
  ADD COLUMN IF NOT EXISTS destino text NOT NULL DEFAULT 'estoque',
  ADD COLUMN IF NOT EXISTS evidencia_url text;
ALTER TABLE public.almoxarifado_devolucao_itens
  DROP CONSTRAINT IF EXISTS almox_devolucao_itens_destino_check;
ALTER TABLE public.almoxarifado_devolucao_itens
  ADD CONSTRAINT almox_devolucao_itens_destino_check
  CHECK (destino IN ('estoque','quarentena','manutencao','descarte','perda'));

CREATE OR REPLACE FUNCTION public.listar_funcionarios_app_almoxarifado_v2(p_obra_id uuid)
RETURNS TABLE(id uuid, nome text, cargo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE operador uuid;
BEGIN
  IF NOT public.has_employee_app_access('almoxarifado') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  SELECT e.id INTO operador FROM public.employees e WHERE e.user_id = auth.uid() AND e.status = 'ativo' LIMIT 1;
  IF NOT public.almox_vinculo_vigente(operador, p_obra_id) THEN RAISE EXCEPTION 'Obra não vinculada ao operador'; END IF;
  RETURN QUERY
    SELECT DISTINCT e.id, e.nome, c.nome
    FROM public.obra_funcionarios vínculo
    JOIN public.employees e ON e.id = vínculo.employee_id
    LEFT JOIN public.cargos c ON c.id = e.cargo_id
    WHERE vínculo.obra_id = p_obra_id AND vínculo.status = true AND e.status = 'ativo'
      AND public.almox_vinculo_vigente(e.id, p_obra_id)
    ORDER BY e.nome;
END; $$;

CREATE OR REPLACE FUNCTION public.listar_responsabilidades_almoxarifado_v2(p_obra_id uuid, p_funcionario_id uuid)
RETURNS TABLE(entrega_item_id uuid, material_id uuid, material_nome text, unidade text, quantidade_pendente numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE operador uuid;
BEGIN
  IF NOT public.has_employee_app_access('almoxarifado') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  SELECT id INTO operador FROM public.employees WHERE user_id = auth.uid() AND status = 'ativo' LIMIT 1;
  IF NOT public.almox_vinculo_vigente(operador, p_obra_id) THEN RAISE EXCEPTION 'Obra não vinculada ao operador'; END IF;
  RETURN QUERY SELECT item.id, item.material_id, material.nome, material.unidade,
    item.quantidade - item.quantidade_devolvida
  FROM public.almoxarifado_entrega_itens item
  JOIN public.almoxarifado_entregas entrega ON entrega.id = item.entrega_id
  JOIN public.materiais_catalogo material ON material.id = item.material_id
  WHERE entrega.obra_id = p_obra_id AND entrega.retirado_por = p_funcionario_id
    AND item.retornavel AND item.quantidade > item.quantidade_devolvida
    AND entrega.status = 'confirmada'
  ORDER BY entrega.created_at, material.nome;
END; $$;

CREATE OR REPLACE FUNCTION public.listar_devedores_almoxarifado_v2(p_obra_id uuid)
RETURNS TABLE(id uuid, nome text, cargo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE operador uuid;
BEGIN
  SELECT e.id INTO operador FROM public.employees e WHERE e.user_id=auth.uid() AND e.status='ativo' LIMIT 1;
  IF NOT public.has_employee_app_access('almoxarifado') OR NOT public.almox_vinculo_vigente(operador,p_obra_id) THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  RETURN QUERY SELECT DISTINCT e.id,e.nome,c.nome FROM public.employees e
    LEFT JOIN public.cargos c ON c.id=e.cargo_id
    JOIN public.almoxarifado_entregas en ON en.retirado_por=e.id
    JOIN public.almoxarifado_entrega_itens i ON i.entrega_id=en.id
    WHERE en.obra_id=p_obra_id AND en.status='confirmada' AND i.retornavel AND i.quantidade>i.quantidade_devolvida
    ORDER BY e.nome;
END; $$;
REVOKE ALL ON FUNCTION public.listar_devedores_almoxarifado_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_devedores_almoxarifado_v2(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_entrega_almoxarifado_v2(
  p_operacao_id uuid, p_obra_id uuid, p_retirado_por uuid, p_frente text,
  p_cronograma_item_id uuid, p_centro_custo text, p_finalidade text,
  p_observacoes text, p_assinatura_base64 text, p_dispositivo_id text, p_itens jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions, pg_temp AS $$
DECLARE operador uuid; entrega_id uuid; item jsonb; material_id uuid; quantidade numeric; itens_normalizados text;
  requisicao text; unidade_item text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_employee_app_access('almoxarifado') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'Identificador da operação obrigatório'; END IF;
  SELECT id INTO operador FROM public.employees WHERE user_id = auth.uid() AND status = 'ativo' LIMIT 1;
  IF NOT public.almox_vinculo_vigente(operador, p_obra_id) THEN RAISE EXCEPTION 'Obra não vinculada ao operador'; END IF;
  requisicao := encode(sha256(convert_to(jsonb_build_array(p_obra_id,p_retirado_por,p_frente,p_cronograma_item_id,
    p_centro_custo,p_finalidade,p_observacoes,p_assinatura_base64,p_dispositivo_id,p_itens)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operacao_id::text, 0));
  SELECT id INTO entrega_id FROM public.almoxarifado_entregas WHERE operacao_id = p_operacao_id;
  IF entrega_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.almoxarifado_entregas WHERE id=entrega_id AND entregue_por=operador
      AND obra_id=p_obra_id AND requisicao_hash=requisicao) THEN RAISE EXCEPTION 'Operação já utilizada com outros dados'; END IF;
    RETURN entrega_id;
  END IF;
  IF NOT public.almox_vinculo_vigente(p_retirado_por, p_obra_id)
    OR NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_retirado_por AND status='ativo') THEN RAISE EXCEPTION 'Funcionário não pertence à obra ou está inativo'; END IF;
  IF EXISTS (SELECT 1 FROM public.employee_ferias f WHERE f.employee_id=p_retirado_por AND f.aprovado
    AND f.data_inicio<=current_date AND coalesce(f.data_fim,current_date)>=current_date) THEN
    RAISE EXCEPTION 'Funcionário indisponível conforme RH';
  END IF;
  IF nullif(trim(p_frente),'') IS NULL THEN RAISE EXCEPTION 'Informe a frente da obra'; END IF;
  IF EXISTS (SELECT 1 FROM public.sms_frentes WHERE obra_id=p_obra_id AND ativa)
    AND NOT EXISTS (SELECT 1 FROM public.sms_frentes WHERE obra_id=p_obra_id AND ativa AND lower(trim(nome))=lower(trim(p_frente))) THEN
    RAISE EXCEPTION 'Selecione uma frente ativa da obra';
  END IF;
  IF p_cronograma_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cronograma_itens WHERE id=p_cronograma_item_id AND obra_id=p_obra_id) THEN RAISE EXCEPTION 'Atividade não pertence à obra'; END IF;
  IF EXISTS (SELECT 1 FROM public.cronograma_itens WHERE obra_id=p_obra_id)
    AND (p_cronograma_item_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.cronograma_itens WHERE id=p_cronograma_item_id AND obra_id=p_obra_id)) THEN
    RAISE EXCEPTION 'Selecione uma atividade válida do cronograma';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cronograma_itens WHERE obra_id=p_obra_id)
    AND nullif(trim(p_finalidade),'') IS NULL THEN RAISE EXCEPTION 'Informe a finalidade da retirada'; END IF;
  IF length(coalesce(p_assinatura_base64,'')) < 300 OR p_itens IS NULL OR jsonb_array_length(p_itens)=0 THEN
    RAISE EXCEPTION 'Assinatura e itens são obrigatórios';
  END IF;
  SELECT string_agg((value->>'material_id')||':'||(value->>'quantidade'),',' ORDER BY value->>'material_id')
    INTO itens_normalizados FROM jsonb_array_elements(p_itens);
  INSERT INTO public.almoxarifado_entregas(operacao_id,requisicao_hash,obra_id,retirado_por,entregue_por,frente,
    cronograma_item_id,centro_custo,finalidade,observacoes,assinatura_base64,assinatura_hash,dispositivo_id)
  VALUES(p_operacao_id,requisicao,p_obra_id,p_retirado_por,operador,trim(p_frente),p_cronograma_item_id,
    nullif(trim(p_centro_custo),''),nullif(trim(p_finalidade),''),nullif(trim(p_observacoes),''),p_assinatura_base64,
    encode(sha256(convert_to(p_assinatura_base64||itens_normalizados||p_operacao_id::text,'UTF8')),'hex'),nullif(trim(p_dispositivo_id),''))
  RETURNING id INTO entrega_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_itens) ORDER BY value->>'material_id' LOOP
    material_id := (item->>'material_id')::uuid; quantidade := (item->>'quantidade')::numeric;
    IF quantidade IS NULL OR quantidade<=0 OR quantidade::text IN ('NaN','Infinity','-Infinity') OR quantidade<>round(quantidade,3) THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
    SELECT unidade INTO unidade_item FROM public.materiais_catalogo WHERE id=material_id AND ativo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Material inexistente ou inativo'; END IF;
    IF lower(unidade_item) IN ('un','und','unidade','unidades','pc','pç') AND quantidade<>trunc(quantidade) THEN RAISE EXCEPTION 'Informe unidades inteiras'; END IF;
    INSERT INTO public.almoxarifado_entrega_itens(entrega_id,material_id,quantidade) VALUES(entrega_id,material_id,quantidade);
    INSERT INTO public.almoxarifado_movimentos(obra_id,material_id,tipo,quantidade,frente,observacoes,registrado_por,data_movimento,entrega_id)
      VALUES(p_obra_id,material_id,'saida',quantidade,trim(p_frente),'Entrega assinada no balcão',auth.uid(),current_date,entrega_id);
  END LOOP;
  RETURN entrega_id;
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_devolucao_almoxarifado_v2(
  p_operacao_id uuid, p_obra_id uuid, p_funcionario_id uuid, p_observacoes text,
  p_assinatura_base64 text, p_dispositivo_id text, p_itens jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions, pg_temp AS $$
DECLARE operador uuid; devolucao uuid; item jsonb; entrega_item public.almoxarifado_entrega_itens%ROWTYPE; qtd numeric; condicao text; destino text; requisicao text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_employee_app_access('almoxarifado') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'Identificador da operação obrigatório'; END IF;
  SELECT id INTO operador FROM public.employees WHERE user_id=auth.uid() AND status='ativo' LIMIT 1;
  IF NOT public.almox_vinculo_vigente(operador,p_obra_id) THEN RAISE EXCEPTION 'Obra não vinculada ao operador'; END IF;
  requisicao := encode(sha256(convert_to(jsonb_build_array(p_obra_id,p_funcionario_id,p_observacoes,p_assinatura_base64,p_dispositivo_id,p_itens)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operacao_id::text, 0));
  SELECT id INTO devolucao FROM public.almoxarifado_devolucoes WHERE operacao_id=p_operacao_id;
  IF devolucao IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.almoxarifado_devolucoes WHERE id=devolucao AND recebido_por=operador AND obra_id=p_obra_id AND requisicao_hash=requisicao) THEN RAISE EXCEPTION 'Operação já utilizada com outros dados'; END IF;
    RETURN devolucao;
  END IF;
  IF length(coalesce(p_assinatura_base64,''))<300 OR p_itens IS NULL OR jsonb_array_length(p_itens)=0 THEN RAISE EXCEPTION 'Assinatura e itens são obrigatórios'; END IF;
  INSERT INTO public.almoxarifado_devolucoes(operacao_id,requisicao_hash,obra_id,funcionario_id,recebido_por,observacoes,
    assinatura_base64,assinatura_hash,assinado_em,dispositivo_id)
  VALUES(p_operacao_id,requisicao,p_obra_id,p_funcionario_id,operador,nullif(trim(p_observacoes),''),p_assinatura_base64,
    encode(sha256(convert_to(p_assinatura_base64||p_operacao_id::text,'UTF8')),'hex'),now(),nullif(trim(p_dispositivo_id),'')) RETURNING id INTO devolucao;
  FOR item IN SELECT value FROM jsonb_array_elements(p_itens) ORDER BY value->>'entrega_item_id' LOOP
    SELECT * INTO entrega_item FROM public.almoxarifado_entrega_itens WHERE id=(item->>'entrega_item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item de entrega inexistente'; END IF;
    qtd := (item->>'quantidade')::numeric; condicao := coalesce(item->>'condicao','bom');
    destino := CASE WHEN condicao='bom' THEN 'estoque' ELSE coalesce(item->>'destino','quarentena') END;
    IF qtd IS NULL OR qtd::text IN ('NaN','Infinity','-Infinity') OR qtd<>round(qtd,3) OR qtd<=0 OR NOT entrega_item.retornavel OR qtd>entrega_item.quantidade-entrega_item.quantidade_devolvida THEN RAISE EXCEPTION 'Quantidade de devolução inválida'; END IF;
    IF condicao NOT IN ('bom','avariado','inutilizado') OR (condicao<>'bom' AND destino NOT IN ('quarentena','manutencao','descarte','perda')) THEN RAISE EXCEPTION 'Condição ou destino inválido'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.almoxarifado_entregas e WHERE e.id=entrega_item.entrega_id AND e.obra_id=p_obra_id AND e.retirado_por=p_funcionario_id AND e.status='confirmada') THEN RAISE EXCEPTION 'Item não pertence ao funcionário ou entrega estornada'; END IF;
    IF EXISTS(SELECT 1 FROM public.materiais_catalogo WHERE id=entrega_item.material_id AND lower(unidade) IN ('un','und','unidade','unidades','pc','pç')) AND qtd<>trunc(qtd) THEN RAISE EXCEPTION 'Informe unidades inteiras'; END IF;
    IF condicao<>'bom' AND length(trim(coalesce(p_observacoes,'')))<5 THEN RAISE EXCEPTION 'Descreva o dano do item'; END IF;
    INSERT INTO public.almoxarifado_devolucao_itens(devolucao_id,entrega_item_id,material_id,quantidade,condicao,destino)
      VALUES(devolucao,entrega_item.id,entrega_item.material_id,qtd,condicao,destino);
    UPDATE public.almoxarifado_entrega_itens SET quantidade_devolvida=quantidade_devolvida+qtd WHERE id=entrega_item.id;
    IF destino='estoque' THEN
      INSERT INTO public.almoxarifado_movimentos(obra_id,material_id,tipo,quantidade,observacoes,registrado_por,data_movimento,devolucao_id)
        VALUES(p_obra_id,entrega_item.material_id,'entrada',qtd,'Devolução de item retornável',auth.uid(),current_date,devolucao);
    END IF;
  END LOOP;
  RETURN devolucao;
END; $$;

REVOKE ALL ON FUNCTION public.listar_funcionarios_app_almoxarifado_v2(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_responsabilidades_almoxarifado_v2(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_entrega_almoxarifado_v2(uuid,uuid,uuid,text,uuid,text,text,text,text,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_devolucao_almoxarifado_v2(uuid,uuid,uuid,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_funcionarios_app_almoxarifado_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_responsabilidades_almoxarifado_v2(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_entrega_almoxarifado_v2(uuid,uuid,uuid,text,uuid,text,text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_devolucao_almoxarifado_v2(uuid,uuid,uuid,text,text,text,jsonb) TO authenticated;

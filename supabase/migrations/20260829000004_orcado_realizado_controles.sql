-- Corrige consolidação, preserva revisões e substitui exclusões por cancelamento.
BEGIN;

ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS motivo_revisao text;
ALTER TABLE public.lancamentos_custos
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- NOT VALID preserva legados para saneamento, mas valida novas gravações.
ALTER TABLE public.orcamento_itens ADD CONSTRAINT orcamento_valor_limites
  CHECK (valor_previsto >= 0 AND alerta_perc BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE public.lancamentos_custos ADD CONSTRAINT custo_valor_positivo
  CHECK (valor > 0) NOT VALID;

CREATE TABLE public.custos_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id),
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  anterior jsonb,
  atual jsonb NOT NULL,
  autor_id uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX custos_auditoria_obra_idx ON public.custos_auditoria(obra_id,criado_em DESC);
ALTER TABLE public.custos_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY custos_auditoria_leitura ON public.custos_auditoria FOR SELECT TO authenticated
  USING(public.can_manage_obra_data(obra_id));
GRANT SELECT ON public.custos_auditoria TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.custos_auditoria FROM authenticated, anon;

-- Fotografia inicial dos registros legados; não inventa revisões anteriores.
INSERT INTO public.custos_auditoria(obra_id,tabela,registro_id,atual)
SELECT obra_id,'orcamento_itens',id,to_jsonb(o) FROM public.orcamento_itens o;
INSERT INTO public.custos_auditoria(obra_id,tabela,registro_id,atual)
SELECT obra_id,'lancamentos_custos',id,to_jsonb(l) FROM public.lancamentos_custos l;

CREATE OR REPLACE FUNCTION public.auditar_custos_obra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Historico protegido. Revise o orcamento ou cancele o lancamento.';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.obra_id<>OLD.obra_id THEN RAISE EXCEPTION 'Nao e permitido transferir registros financeiros entre obras'; END IF;
    IF TG_TABLE_NAME='orcamento_itens' THEN
      IF NEW.categoria_id<>OLD.categoria_id THEN RAISE EXCEPTION 'Nao e permitido trocar a categoria do orcamento'; END IF;
      IF length(trim(coalesce(NEW.motivo_revisao,'')))<5 THEN
        RAISE EXCEPTION 'Informe uma justificativa para a revisao';
      END IF;
    ELSE
      IF OLD.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'Lancamento cancelado nao pode ser alterado'; END IF;
      IF OLD.referencia_id IS NOT NULL THEN RAISE EXCEPTION 'Corrija o lancamento no modulo de origem'; END IF;
      IF NEW.cancelado_em IS NOT NULL THEN
        IF (to_jsonb(NEW)-ARRAY['cancelado_em','cancelado_por','motivo_cancelamento','updated_at']) IS DISTINCT FROM
           (to_jsonb(OLD)-ARRAY['cancelado_em','cancelado_por','motivo_cancelamento','updated_at']) THEN
          RAISE EXCEPTION 'Cancelamento nao pode alterar os dados originais';
        END IF;
        IF length(trim(coalesce(NEW.motivo_cancelamento,'')))<5 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
        NEW.cancelado_em:=now(); NEW.cancelado_por:=auth.uid();
      END IF;
    END IF;
  END IF;
  INSERT INTO public.custos_auditoria(obra_id,tabela,registro_id,anterior,atual,autor_id)
    VALUES(NEW.obra_id,TG_TABLE_NAME,NEW.id,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),auth.uid());
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_auditar_orcamento BEFORE INSERT OR UPDATE OR DELETE ON public.orcamento_itens
FOR EACH ROW EXECUTE FUNCTION public.auditar_custos_obra();
CREATE TRIGGER trg_auditar_custo BEFORE INSERT OR UPDATE OR DELETE ON public.lancamentos_custos
FOR EACH ROW EXECUTE FUNCTION public.auditar_custos_obra();

-- Mantém nomes/ordem das colunas existentes e acrescenta os campos de edição ao fim.
CREATE OR REPLACE VIEW public.v_orcado_realizado WITH (security_invoker=true) AS
SELECT o.id AS obra_id,o.nome AS obra_nome,oc.id AS categoria_id,oc.nome AS categoria_nome,
  oc.cor AS categoria_cor,oc.ordem AS categoria_ordem,oi.id AS orcamento_item_id,
  coalesce(oi.valor_previsto,0) AS valor_previsto,coalesce(oi.alerta_perc,80) AS alerta_perc,
  coalesce(sum(lc.valor),0) AS valor_realizado,
  CASE WHEN coalesce(oi.valor_previsto,0)>0 THEN round(coalesce(sum(lc.valor),0)/oi.valor_previsto*100,2) ELSE 0 END AS perc_consumido,
  coalesce(oi.valor_previsto,0)-coalesce(sum(lc.valor),0) AS saldo,
  oi.descricao,oi.observacoes
FROM public.obras o CROSS JOIN public.orcamento_categorias oc
LEFT JOIN public.orcamento_itens oi ON oi.obra_id=o.id AND oi.categoria_id=oc.id
LEFT JOIN public.lancamentos_custos lc ON lc.obra_id=o.id AND lc.categoria_id=oc.id AND lc.cancelado_em IS NULL
WHERE oc.ativo OR oi.id IS NOT NULL OR lc.id IS NOT NULL
GROUP BY o.id,o.nome,oc.id,oc.nome,oc.cor,oc.ordem,oi.id,oi.valor_previsto,oi.alerta_perc,oi.descricao,oi.observacoes;

CREATE OR REPLACE VIEW public.v_custos_mensais WITH (security_invoker=true) AS
SELECT lc.obra_id,to_char(lc.data_lancamento,'YYYY-MM') AS mes,oc.id AS categoria_id,
  oc.nome AS categoria_nome,oc.cor AS categoria_cor,sum(lc.valor) AS valor_mes,
  sum(sum(lc.valor)) OVER(PARTITION BY lc.obra_id,oc.id ORDER BY to_char(lc.data_lancamento,'YYYY-MM')) AS valor_acumulado
FROM public.lancamentos_custos lc JOIN public.orcamento_categorias oc ON oc.id=lc.categoria_id
WHERE lc.cancelado_em IS NULL
GROUP BY lc.obra_id,mes,oc.id,oc.nome,oc.cor;
GRANT SELECT ON public.v_orcado_realizado,public.v_custos_mensais TO authenticated;
-- Mantém o Portal do Cliente consistente com o realizado ativo.
CREATE OR REPLACE FUNCTION public.get_portal_publico(access_token text, client_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cfg public.portal_config%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO cfg
  FROM public.portal_config
  WHERE token_acesso = access_token
    AND token_ativo = true
    AND (token_expires_at IS NULL OR token_expires_at > now());

  IF cfg.id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.portal_config
  SET ultimo_acesso = now(), total_acessos = total_acessos + 1
  WHERE id = cfg.id;
  INSERT INTO public.portal_acessos(portal_config_id, user_agent)
  VALUES (cfg.id, left(client_user_agent, 500));

  SELECT jsonb_build_object(
    'obra', jsonb_build_object(
      'id', o.id, 'nome', o.nome, 'status', o.status,
      'titulo', coalesce(cfg.titulo_portal, o.nome),
      'mensagem', cfg.mensagem_boas_vindas
    ),
    'secoes', jsonb_build_object(
      'cronograma', cfg.exibir_cronograma,
      'fotos', cfg.exibir_fotos,
      'documentos', cfg.exibir_documentos,
      'financeiro', cfg.exibir_financeiro
    ),
    'progresso', CASE WHEN cfg.exibir_cronograma THEN coalesce((
      SELECT round(coalesce(sum(ci.peso_percentual * coalesce(ua.percentual_realizado, 0)) /
        nullif(sum(ci.peso_percentual), 0), 0), 2)
      FROM public.cronograma_itens ci
      LEFT JOIN LATERAL (
        SELECT ca.percentual_realizado FROM public.cronograma_avancos ca
        WHERE ca.item_id = ci.id ORDER BY ca.data_referencia DESC LIMIT 1
      ) ua ON true WHERE ci.obra_id = o.id AND ci.pai_id IS NULL
    ), 0) ELSE NULL END,
    'cronograma', CASE WHEN cfg.exibir_cronograma THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'codigo', x.codigo, 'descricao', x.descricao,
        'inicio', x.data_inicio_plan, 'fim', x.data_fim_plan,
        'percentual', x.percentual_realizado
      ) ORDER BY x.ordem, x.codigo)
      FROM (
        SELECT ci.*, coalesce((SELECT ca.percentual_realizado FROM public.cronograma_avancos ca
          WHERE ca.item_id = ci.id ORDER BY ca.data_referencia DESC LIMIT 1), 0) percentual_realizado
        FROM public.cronograma_itens ci WHERE ci.obra_id = o.id AND ci.pai_id IS NULL
      ) x
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'fotos', CASE WHEN cfg.exibir_fotos THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'url', f.url, 'thumbnail', f.thumbnail,
        'titulo', f.titulo, 'categoria', f.categoria, 'data', f.data_foto, 'destaque', f.destaque)
        ORDER BY f.destaque DESC, f.data_foto DESC)
      FROM public.portal_fotos f WHERE f.obra_id = o.id
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'documentos', CASE WHEN cfg.exibir_documentos THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'descricao', d.descricao,
        'categoria', d.categoria, 'url', d.url, 'tamanho_kb', d.tamanho_kb, 'data', d.data_doc)
        ORDER BY d.data_doc DESC)
      FROM public.portal_documentos d WHERE d.obra_id = o.id AND d.visivel = true
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'atualizacoes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'titulo', a.titulo, 'corpo', a.corpo,
        'tipo', a.tipo, 'data', a.data_evento) ORDER BY a.data_evento DESC)
      FROM public.portal_atualizacoes a WHERE a.obra_id = o.id AND a.publicado = true
    ), '[]'::jsonb),
    'financeiro', CASE WHEN cfg.exibir_financeiro THEN jsonb_build_object(
      'previsto', coalesce((SELECT sum(valor_previsto) FROM public.orcamento_itens WHERE obra_id = o.id), 0),
      'realizado', coalesce((SELECT sum(valor) FROM public.lancamentos_custos WHERE obra_id = o.id AND cancelado_em IS NULL), 0)
    ) ELSE NULL END
  ) INTO result
  FROM public.obras o WHERE o.id = cfg.obra_id;
  RETURN result;
END;
$$;
COMMIT;

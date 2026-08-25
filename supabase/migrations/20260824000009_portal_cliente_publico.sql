-- Portal externo do cliente: acesso seguro por token, validade, auditoria e midias.

ALTER TABLE public.portal_config
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_acesso timestamptz,
  ADD COLUMN IF NOT EXISTS total_acessos bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.portal_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_config_id uuid NOT NULL REFERENCES public.portal_config(id) ON DELETE CASCADE,
  acessado_em timestamptz NOT NULL DEFAULT now(),
  user_agent text
);
CREATE INDEX IF NOT EXISTS portal_acessos_config_data_idx
  ON public.portal_acessos(portal_config_id, acessado_em DESC);
ALTER TABLE public.portal_acessos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_acessos_gestao ON public.portal_acessos;
CREATE POLICY portal_acessos_gestao ON public.portal_acessos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.portal_config pc
    WHERE pc.id = portal_config_id AND public.can_manage_obra_data(pc.obra_id)
  )
);

-- Evita leitura transversal: gestores de obra enxergam somente obras vinculadas.
DROP POLICY IF EXISTS "portal_cfg_sel" ON public.portal_config;
CREATE POLICY "portal_cfg_sel" ON public.portal_config FOR SELECT TO authenticated
USING (public.can_manage_obra_data(obra_id));
DROP POLICY IF EXISTS "portal_foto_sel" ON public.portal_fotos;
CREATE POLICY "portal_foto_sel" ON public.portal_fotos FOR SELECT TO authenticated
USING (public.can_manage_obra_data(obra_id));
DROP POLICY IF EXISTS "portal_doc_sel" ON public.portal_documentos;
CREATE POLICY "portal_doc_sel" ON public.portal_documentos FOR SELECT TO authenticated
USING (public.can_manage_obra_data(obra_id));
DROP POLICY IF EXISTS "portal_atu_sel" ON public.portal_atualizacoes;
CREATE POLICY "portal_atu_sel" ON public.portal_atualizacoes FOR SELECT TO authenticated
USING (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS "portal_cfg_wri" ON public.portal_config;
CREATE POLICY "portal_cfg_wri" ON public.portal_config FOR ALL TO authenticated
USING (public.can_manage_obra_data(obra_id)) WITH CHECK (public.can_manage_obra_data(obra_id));
DROP POLICY IF EXISTS "portal_foto_wri" ON public.portal_fotos;
CREATE POLICY "portal_foto_wri" ON public.portal_fotos FOR ALL TO authenticated
USING (public.can_manage_obra_data(obra_id)) WITH CHECK (public.can_manage_obra_data(obra_id));
DROP POLICY IF EXISTS "portal_doc_wri" ON public.portal_documentos;
CREATE POLICY "portal_doc_wri" ON public.portal_documentos FOR ALL TO authenticated
USING (public.can_manage_obra_data(obra_id)) WITH CHECK (public.can_manage_obra_data(obra_id));
DROP POLICY IF EXISTS "portal_atu_wri" ON public.portal_atualizacoes;
CREATE POLICY "portal_atu_wri" ON public.portal_atualizacoes FOR ALL TO authenticated
USING (public.can_manage_obra_data(obra_id)) WITH CHECK (public.can_manage_obra_data(obra_id));

CREATE OR REPLACE VIEW public.v_portal_resumo_seguro
WITH (security_invoker = true)
AS SELECT * FROM public.v_portal_resumo
WHERE public.can_manage_obra_data(obra_id);
REVOKE ALL ON public.v_portal_resumo FROM authenticated;
GRANT SELECT ON public.v_portal_resumo_seguro TO authenticated;

-- Retorna apenas os dados explicitamente publicados para um token válido.
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
      'realizado', coalesce((SELECT sum(valor) FROM public.lancamentos_custos WHERE obra_id = o.id), 0)
    ) ELSE NULL END
  ) INTO result
  FROM public.obras o WHERE o.id = cfg.obra_id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_publico(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_publico(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rotate_portal_token(target_obra_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE new_token text;
BEGIN
  IF NOT public.can_manage_obra_data(target_obra_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  new_token := encode(gen_random_bytes(24), 'hex');
  UPDATE public.portal_config SET token_acesso = new_token, token_ativo = true WHERE obra_id = target_obra_id;
  RETURN new_token;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_portal_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_portal_token(uuid) TO authenticated;

-- A página pública pode ler somente os três campos de identidade visual.
DROP POLICY IF EXISTS system_settings_public_brand ON public.system_settings;
CREATE POLICY system_settings_public_brand ON public.system_settings FOR SELECT TO anon
USING (key IN ('companyName','logoUrl','iconUrl'));
GRANT SELECT ON public.system_settings TO anon;

-- Arquivos publicados no portal. Os nomes usam obra_id/uuid.ext.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('portal-cliente', 'portal-cliente', true, 20971520,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS portal_cliente_storage_insert ON storage.objects;
CREATE POLICY portal_cliente_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (CASE WHEN bucket_id = 'portal-cliente' THEN public.can_manage_obra_data(((storage.foldername(name))[1])::uuid) ELSE false END);
DROP POLICY IF EXISTS portal_cliente_storage_update ON storage.objects;
CREATE POLICY portal_cliente_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (CASE WHEN bucket_id = 'portal-cliente' THEN public.can_manage_obra_data(((storage.foldername(name))[1])::uuid) ELSE false END);
DROP POLICY IF EXISTS portal_cliente_storage_delete ON storage.objects;
CREATE POLICY portal_cliente_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (CASE WHEN bucket_id = 'portal-cliente' THEN public.can_manage_obra_data(((storage.foldername(name))[1])::uuid) ELSE false END);

GRANT SELECT ON public.portal_acessos TO authenticated;

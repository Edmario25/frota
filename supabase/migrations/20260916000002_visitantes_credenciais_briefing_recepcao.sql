-- Visitantes: credenciais, briefing renovável e autenticação de portaria.
-- Registros históricos de visitas não são removidos nem reclassificados.

-- Esta migração também é segura para bases que ainda não receberam o módulo
-- inicial de visitantes. Dessa forma, a implantação não depende da ordem
-- manual das migrações antigas e nenhum cadastro existente é removido.
CREATE TABLE IF NOT EXISTS public.visitantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo_doc text NOT NULL DEFAULT 'cpf',
  numero_doc text NOT NULL,
  empresa text,
  cargo_empresa text,
  telefone text,
  foto_url text,
  observacoes text,
  bloqueado boolean NOT NULL DEFAULT false,
  motivo_bloqueio text,
  documento_validade date,
  documento_url text,
  cnh_numero text,
  cnh_categoria text,
  cnh_validade date,
  cnh_url text,
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_doc, numero_doc)
);
CREATE INDEX IF NOT EXISTS visitantes_doc_idx ON public.visitantes(numero_doc);
CREATE INDEX IF NOT EXISTS visitantes_nome_idx ON public.visitantes(nome);

CREATE TABLE IF NOT EXISTS public.visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  visitante_id uuid NOT NULL REFERENCES public.visitantes(id),
  motivo text NOT NULL,
  setor_destino text,
  responsavel_id uuid REFERENCES public.employees(id),
  autorizado_por uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','autorizado','dentro','saiu','negado')),
  entrada timestamptz,
  saida timestamptz,
  placa_veiculo text,
  cracha_numero text,
  observacoes text,
  motivo_negado text,
  conduz_veiculo boolean NOT NULL DEFAULT false,
  veiculo_marca_modelo text,
  veiculo_documento text,
  veiculo_documento_validade date,
  veiculo_documento_url text,
  briefing_sms_versao text,
  briefing_sms_aceite boolean NOT NULL DEFAULT false,
  briefing_sms_realizado_em timestamptz,
  briefing_sms_responsavel_id uuid REFERENCES public.employees(id),
  cracha_validade timestamptz,
  credencial_veiculo_numero text,
  credencial_veiculo_validade timestamptz,
  requisitos_conferidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitas_obra_idx ON public.visitas(obra_id, status);
CREATE INDEX IF NOT EXISTS visitas_visitante_idx ON public.visitas(visitante_id);
CREATE INDEX IF NOT EXISTS visitas_data_idx ON public.visitas(created_at DESC);

ALTER TABLE public.visitantes
  ADD COLUMN IF NOT EXISTS documento_validade date,
  ADD COLUMN IF NOT EXISTS documento_url text,
  ADD COLUMN IF NOT EXISTS cnh_numero text,
  ADD COLUMN IF NOT EXISTS cnh_categoria text,
  ADD COLUMN IF NOT EXISTS cnh_validade date,
  ADD COLUMN IF NOT EXISTS cnh_url text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.visitas
  ADD COLUMN IF NOT EXISTS conduz_veiculo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS veiculo_marca_modelo text,
  ADD COLUMN IF NOT EXISTS veiculo_documento text,
  ADD COLUMN IF NOT EXISTS veiculo_documento_validade date,
  ADD COLUMN IF NOT EXISTS veiculo_documento_url text,
  ADD COLUMN IF NOT EXISTS briefing_sms_versao text,
  ADD COLUMN IF NOT EXISTS briefing_sms_aceite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS briefing_sms_realizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS briefing_sms_responsavel_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS cracha_validade timestamptz,
  ADD COLUMN IF NOT EXISTS credencial_veiculo_numero text,
  ADD COLUMN IF NOT EXISTS credencial_veiculo_validade timestamptz,
  ADD COLUMN IF NOT EXISTS requisitos_conferidos jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.sms_briefings_visitantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid REFERENCES public.obras(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  versao text NOT NULL,
  conteudo text NOT NULL,
  validade_horas integer NOT NULL DEFAULT 24 CHECK (validade_horas BETWEEN 1 AND 720),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (obra_id, versao)
);
INSERT INTO public.sms_briefings_visitantes(obra_id,titulo,versao,conteudo,validade_horas)
SELECT NULL, 'Briefing SMS para visitantes', 'VIS-01',
  'Orientações de acesso, rotas permitidas, áreas restritas, EPI obrigatório, circulação de veículos, comunicação de emergência e acompanhamento pelo responsável da visita.', 24
WHERE NOT EXISTS (SELECT 1 FROM public.sms_briefings_visitantes WHERE obra_id IS NULL AND versao='VIS-01');

CREATE TABLE IF NOT EXISTS public.visitante_credenciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitante_id uuid NOT NULL REFERENCES public.visitantes(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('pessoa','veiculo')),
  numero text NOT NULL UNIQUE,
  qr_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  validade_ate timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','revogada','expirada')),
  placa_veiculo text,
  veiculo_marca_modelo text,
  veiculo_documento text,
  veiculo_documento_validade date,
  emitida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  emitida_em timestamptz NOT NULL DEFAULT now(),
  revogada_em timestamptz,
  motivo_revogacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'pessoa' AND placa_veiculo IS NULL) OR (tipo = 'veiculo' AND placa_veiculo IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS visitante_credencial_pessoa_ativa_uq
  ON public.visitante_credenciais(visitante_id, obra_id)
  WHERE tipo = 'pessoa' AND status = 'ativa';
CREATE UNIQUE INDEX IF NOT EXISTS visitante_credencial_veiculo_ativa_uq
  ON public.visitante_credenciais(visitante_id, obra_id, placa_veiculo)
  WHERE tipo = 'veiculo' AND status = 'ativa';
CREATE INDEX IF NOT EXISTS visitante_credenciais_obra_status_idx
  ON public.visitante_credenciais(obra_id, tipo, status, validade_ate);

CREATE TABLE IF NOT EXISTS public.sms_briefing_visitante_realizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credencial_pessoa_id uuid NOT NULL REFERENCES public.visitante_credenciais(id) ON DELETE CASCADE,
  visitante_id uuid NOT NULL REFERENCES public.visitantes(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  briefing_id uuid REFERENCES public.sms_briefings_visitantes(id) ON DELETE SET NULL,
  versao text NOT NULL,
  realizado_em timestamptz NOT NULL DEFAULT now(),
  validade_ate timestamptz NOT NULL,
  realizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  aceite_confirmado boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (validade_ate > realizado_em)
);
CREATE INDEX IF NOT EXISTS briefing_visitante_validade_idx
  ON public.sms_briefing_visitante_realizacoes(credencial_pessoa_id, validade_ate DESC);

ALTER TABLE public.visitas
  ADD COLUMN IF NOT EXISTS credencial_pessoa_id uuid REFERENCES public.visitante_credenciais(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credencial_veiculo_id uuid REFERENCES public.visitante_credenciais(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS briefing_realizacao_id uuid REFERENCES public.sms_briefing_visitante_realizacoes(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.visitantes_pode_operar_obra(p_obra uuid, p_acao text DEFAULT 'visualizar')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.access_is_admin()
    OR public.get_user_role(auth.uid())::text IN ('gestor_contrato','gestor_frota')
    OR public.pode('visitantes.' || p_acao, p_obra)
    OR (public.get_user_role(auth.uid())::text='gestor_obra' AND p_obra = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[])))
  )
$$;

-- Mantém o cadastro mestre de visitantes visível para quem o criou e para
-- quem possui acesso à obra em que ele já foi utilizado. Assim, perfis novos
-- do Controle de Acesso não perdem os cadastros existentes após a migração.
CREATE OR REPLACE FUNCTION public.can_manage_visitor(target_visitor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.access_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.visitantes visitante
      WHERE visitante.id = target_visitor_id
        AND visitante.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.visitas visita
      WHERE visita.visitante_id = target_visitor_id
        AND public.visitantes_pode_operar_obra(visita.obra_id, 'visualizar')
    )
    OR EXISTS (
      SELECT 1 FROM public.visitante_credenciais credencial
      WHERE credencial.visitante_id = target_visitor_id
        AND public.visitantes_pode_operar_obra(credencial.obra_id, 'visualizar')
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.pode_cadastrar_visitante()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.access_is_admin()
    OR public.get_user_role(auth.uid())::text IN ('gestor_contrato','gestor_frota','gestor_obra')
    OR EXISTS (
      SELECT 1 FROM public.access_grants(auth.uid()) grant_item
      WHERE grant_item.chave = 'visitantes.criar' AND grant_item.permitido
    )
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_visitor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pode_cadastrar_visitante() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_visitor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_cadastrar_visitante() TO authenticated;

DROP POLICY IF EXISTS visitantes_select_scoped ON public.visitantes;
DROP POLICY IF EXISTS visitantes_insert_scoped ON public.visitantes;
DROP POLICY IF EXISTS visitantes_update_scoped ON public.visitantes;
DROP POLICY IF EXISTS visitantes_delete_scoped ON public.visitantes;

CREATE POLICY visitantes_select_scoped ON public.visitantes FOR SELECT TO authenticated
  USING (public.can_manage_visitor(id));
CREATE POLICY visitantes_insert_scoped ON public.visitantes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND public.pode_cadastrar_visitante()
  );
CREATE POLICY visitantes_update_scoped ON public.visitantes FOR UPDATE TO authenticated
  USING (public.can_manage_visitor(id))
  WITH CHECK (public.can_manage_visitor(id));
CREATE POLICY visitantes_delete_scoped ON public.visitantes FOR DELETE TO authenticated
  USING (public.can_manage_visitor(id));

CREATE OR REPLACE FUNCTION public.emitir_credencial_visitante(
  p_visitante_id uuid,
  p_obra_id uuid,
  p_validade_ate timestamptz,
  p_placa_veiculo text DEFAULT NULL,
  p_veiculo_marca_modelo text DEFAULT NULL,
  p_veiculo_documento text DEFAULT NULL,
  p_veiculo_documento_validade date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE v_visitante public.visitantes%ROWTYPE; v_pessoa public.visitante_credenciais%ROWTYPE;
DECLARE v_veiculo public.visitante_credenciais%ROWTYPE; v_numero text;
BEGIN
  IF NOT public.visitantes_pode_operar_obra(p_obra_id, 'criar') THEN
    RAISE EXCEPTION 'Sem permissão para emitir credencial nesta obra';
  END IF;
  IF p_validade_ate <= now() THEN RAISE EXCEPTION 'Informe uma validade futura para o crachá'; END IF;
  SELECT * INTO v_visitante FROM public.visitantes WHERE id=p_visitante_id;
  IF NOT FOUND OR v_visitante.bloqueado THEN RAISE EXCEPTION 'Visitante bloqueado ou não encontrado'; END IF;
  IF trim(coalesce(v_visitante.numero_doc,''))='' OR (v_visitante.documento_validade IS NOT NULL AND v_visitante.documento_validade < current_date) THEN
    RAISE EXCEPTION 'Documento pessoal ausente ou vencido';
  END IF;

  UPDATE public.visitante_credenciais
     SET status='revogada', revogada_em=now(), motivo_revogacao='Substituída por nova emissão'
   WHERE visitante_id=p_visitante_id AND obra_id=p_obra_id AND tipo='pessoa' AND status='ativa';
  v_numero := 'P-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  INSERT INTO public.visitante_credenciais(visitante_id,obra_id,tipo,numero,validade_ate)
  VALUES(p_visitante_id,p_obra_id,'pessoa',v_numero,p_validade_ate)
  RETURNING * INTO v_pessoa;

  IF nullif(trim(coalesce(p_placa_veiculo,'')),'') IS NOT NULL THEN
    IF trim(coalesce(v_visitante.cnh_numero,''))='' OR v_visitante.cnh_validade IS NULL OR v_visitante.cnh_validade < current_date THEN
      RAISE EXCEPTION 'CNH do condutor ausente ou vencida';
    END IF;
    IF trim(coalesce(p_veiculo_documento,''))='' OR p_veiculo_documento_validade IS NULL OR p_veiculo_documento_validade < current_date THEN
      RAISE EXCEPTION 'Documento do veículo ausente ou vencido';
    END IF;
    UPDATE public.visitante_credenciais
       SET status='revogada', revogada_em=now(), motivo_revogacao='Substituída por nova emissão'
     WHERE visitante_id=p_visitante_id AND obra_id=p_obra_id AND tipo='veiculo'
       AND placa_veiculo=upper(trim(p_placa_veiculo)) AND status='ativa';
    v_numero := 'V-' || upper(replace(trim(p_placa_veiculo),'-','')) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
    INSERT INTO public.visitante_credenciais(visitante_id,obra_id,tipo,numero,validade_ate,placa_veiculo,veiculo_marca_modelo,veiculo_documento,veiculo_documento_validade)
    VALUES(p_visitante_id,p_obra_id,'veiculo',v_numero,p_validade_ate,upper(trim(p_placa_veiculo)),p_veiculo_marca_modelo,p_veiculo_documento,p_veiculo_documento_validade)
    RETURNING * INTO v_veiculo;
  END IF;
  RETURN jsonb_build_object('pessoa_id',v_pessoa.id,'pessoa_numero',v_pessoa.numero,'pessoa_qr',v_pessoa.qr_token,
    'veiculo_id',v_veiculo.id,'veiculo_numero',v_veiculo.numero,'veiculo_qr',v_veiculo.qr_token);
END $$;

CREATE OR REPLACE FUNCTION public.confirmar_briefing_visitante(p_credencial_pessoa_id uuid, p_observacoes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE v_cred public.visitante_credenciais%ROWTYPE; v_brief public.sms_briefings_visitantes%ROWTYPE;
DECLARE v_validade timestamptz; v_reg public.sms_briefing_visitante_realizacoes%ROWTYPE;
BEGIN
  SELECT * INTO v_cred FROM public.visitante_credenciais WHERE id=p_credencial_pessoa_id AND tipo='pessoa';
  IF NOT FOUND OR v_cred.status <> 'ativa' OR v_cred.validade_ate <= now() THEN RAISE EXCEPTION 'Crachá pessoal inválido ou vencido'; END IF;
  IF NOT public.visitantes_pode_operar_obra(v_cred.obra_id, 'editar') THEN RAISE EXCEPTION 'Sem permissão para confirmar o briefing'; END IF;
  SELECT * INTO v_brief FROM public.sms_briefings_visitantes
   WHERE ativo AND (obra_id=v_cred.obra_id OR obra_id IS NULL)
   ORDER BY CASE WHEN obra_id=v_cred.obra_id THEN 0 ELSE 1 END, updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum briefing ativo foi configurado para esta obra'; END IF;
  v_validade := least(v_cred.validade_ate, now() + make_interval(hours => v_brief.validade_horas));
  INSERT INTO public.sms_briefing_visitante_realizacoes(credencial_pessoa_id,visitante_id,obra_id,briefing_id,versao,validade_ate,observacoes)
  VALUES(v_cred.id,v_cred.visitante_id,v_cred.obra_id,v_brief.id,v_brief.versao,v_validade,p_observacoes)
  RETURNING * INTO v_reg;
  RETURN jsonb_build_object('id',v_reg.id,'validade_ate',v_reg.validade_ate,'versao',v_reg.versao);
END $$;

CREATE OR REPLACE FUNCTION public.liberar_entrada_visitante(
  p_codigo_pessoa text,
  p_motivo text,
  p_setor_destino text DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_codigo_veiculo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE v_cred public.visitante_credenciais%ROWTYPE; v_veic public.visitante_credenciais%ROWTYPE;
DECLARE v_visitante public.visitantes%ROWTYPE; v_brief public.sms_briefing_visitante_realizacoes%ROWTYPE; v_id uuid;
DECLARE v_codigo text := regexp_replace(trim(coalesce(p_codigo_pessoa,'')), '^VG:', '', 'i');
DECLARE v_codigo_veic text := regexp_replace(trim(coalesce(p_codigo_veiculo,'')), '^VG:', '', 'i');
BEGIN
  SELECT * INTO v_cred FROM public.visitante_credenciais
   WHERE tipo='pessoa' AND status='ativa' AND (qr_token::text=v_codigo OR numero=upper(v_codigo));
  IF NOT FOUND OR v_cred.validade_ate <= now() THEN RAISE EXCEPTION 'Crachá pessoal inválido ou vencido'; END IF;
  IF NOT public.visitantes_pode_operar_obra(v_cred.obra_id, 'criar') THEN RAISE EXCEPTION 'Sem permissão para liberar entrada nesta obra'; END IF;
  SELECT * INTO v_visitante FROM public.visitantes WHERE id=v_cred.visitante_id;
  IF v_visitante.bloqueado OR (v_visitante.documento_validade IS NOT NULL AND v_visitante.documento_validade < current_date) THEN RAISE EXCEPTION 'Visitante bloqueado ou com documento vencido'; END IF;
  SELECT * INTO v_brief FROM public.sms_briefing_visitante_realizacoes
   WHERE credencial_pessoa_id=v_cred.id AND aceite_confirmado AND validade_ate>now()
   ORDER BY realizado_em DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Briefing vencido ou não realizado. Faça um novo briefing antes de liberar a entrada'; END IF;
  IF EXISTS(SELECT 1 FROM public.visitas WHERE visitante_id=v_visitante.id AND obra_id=v_cred.obra_id AND status IN ('autorizado','dentro')) THEN
    RAISE EXCEPTION 'Este visitante já possui uma entrada aberta nesta obra';
  END IF;
  IF nullif(v_codigo_veic,'') IS NOT NULL THEN
    SELECT * INTO v_veic FROM public.visitante_credenciais
     WHERE tipo='veiculo' AND status='ativa' AND visitante_id=v_cred.visitante_id AND obra_id=v_cred.obra_id
       AND (qr_token::text=v_codigo_veic OR numero=upper(v_codigo_veic));
    IF NOT FOUND OR v_veic.validade_ate<=now() OR v_veic.veiculo_documento_validade<current_date THEN RAISE EXCEPTION 'Credencial do veículo inválida ou vencida'; END IF;
  END IF;
  INSERT INTO public.visitas(obra_id,visitante_id,motivo,setor_destino,responsavel_id,autorizado_por,status,entrada,
    placa_veiculo,conduz_veiculo,veiculo_marca_modelo,veiculo_documento,veiculo_documento_validade,
    briefing_sms_versao,briefing_sms_aceite,briefing_sms_realizado_em,cracha_numero,cracha_validade,
    credencial_veiculo_numero,credencial_veiculo_validade,observacoes,credencial_pessoa_id,credencial_veiculo_id,briefing_realizacao_id)
  VALUES(v_cred.obra_id,v_visitante.id,p_motivo,p_setor_destino,p_responsavel_id,auth.uid(),'dentro',now(),
    v_veic.placa_veiculo,(v_veic.id IS NOT NULL),v_veic.veiculo_marca_modelo,v_veic.veiculo_documento,v_veic.veiculo_documento_validade,
    v_brief.versao,true,v_brief.realizado_em,v_cred.numero,v_cred.validade_ate,
    v_veic.numero,v_veic.validade_ate,p_observacoes,v_cred.id,v_veic.id,v_brief.id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.registrar_saida_visitante(p_visita_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE v_obra uuid;
BEGIN
  SELECT obra_id INTO v_obra FROM public.visitas WHERE id=p_visita_id FOR UPDATE;
  IF NOT FOUND OR NOT public.visitantes_pode_operar_obra(v_obra, 'editar') THEN RAISE EXCEPTION 'Sem permissão para registrar saída'; END IF;
  UPDATE public.visitas SET status='saiu', saida=now() WHERE id=p_visita_id AND status IN ('autorizado','dentro');
END $$;

GRANT EXECUTE ON FUNCTION public.emitir_credencial_visitante(uuid,uuid,timestamptz,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_briefing_visitante(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_entrada_visitante(text,text,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_saida_visitante(uuid) TO authenticated;

ALTER TABLE public.visitante_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_briefing_visitante_realizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visitante_credenciais_select ON public.visitante_credenciais;
DROP POLICY IF EXISTS briefing_visitante_realizacoes_select ON public.sms_briefing_visitante_realizacoes;
CREATE POLICY visitante_credenciais_select ON public.visitante_credenciais FOR SELECT TO authenticated
  USING (public.visitantes_pode_operar_obra(obra_id, 'visualizar'));
CREATE POLICY briefing_visitante_realizacoes_select ON public.sms_briefing_visitante_realizacoes FOR SELECT TO authenticated
  USING (public.visitantes_pode_operar_obra(obra_id, 'visualizar'));

-- O histórico deixa de depender da função antiga can_manage_obra_data().
DROP POLICY IF EXISTS visitas_scoped ON public.visitas;
DROP POLICY IF EXISTS visitas_select_por_permissao ON public.visitas;
CREATE POLICY visitas_select_por_permissao ON public.visitas FOR SELECT TO authenticated
  USING (public.visitantes_pode_operar_obra(obra_id, 'visualizar'));

CREATE OR REPLACE VIEW public.v_visitas_ativas
WITH (security_invoker = true) AS
SELECT v.id, v.obra_id, v.motivo, v.setor_destino, v.entrada,
  v.cracha_numero, v.placa_veiculo, v.status,
  o.nome AS obra_nome, vi.nome AS visitante_nome, vi.empresa AS visitante_empresa,
  vi.tipo_doc, vi.numero_doc,
  EXTRACT(EPOCH FROM (now() - v.entrada)) / 60 AS minutos_dentro,
  e.nome AS responsavel_nome,
  v.cracha_validade, v.conduz_veiculo,
  v.credencial_veiculo_numero, v.credencial_veiculo_validade,
  v.briefing_sms_versao, v.briefing_sms_realizado_em
FROM public.visitas v
JOIN public.obras o ON o.id=v.obra_id
JOIN public.visitantes vi ON vi.id=v.visitante_id
LEFT JOIN public.employees e ON e.id=v.responsavel_id
WHERE v.status IN ('autorizado','dentro');
GRANT SELECT ON public.v_visitas_ativas TO authenticated;

CREATE OR REPLACE VIEW public.v_visitantes_kpi
WITH (security_invoker = true) AS
SELECT v.obra_id, o.nome AS obra_nome,
  COUNT(*) AS total_visitas,
  COUNT(*) FILTER (WHERE v.status IN ('autorizado','dentro')) AS dentro_agora,
  COUNT(*) FILTER (WHERE v.status='negado') AS negados,
  COUNT(*) FILTER (WHERE date_trunc('day', v.created_at)=current_date) AS hoje,
  COUNT(DISTINCT v.visitante_id) AS visitantes_distintos,
  ROUND(AVG(CASE WHEN v.saida IS NOT NULL AND v.entrada IS NOT NULL
    THEN EXTRACT(EPOCH FROM (v.saida-v.entrada))/60 END), 0) AS tempo_medio_min
FROM public.visitas v
JOIN public.obras o ON o.id=v.obra_id
GROUP BY v.obra_id,o.nome;
GRANT SELECT ON public.v_visitantes_kpi TO authenticated;

CREATE OR REPLACE VIEW public.v_credenciais_visitantes_status
WITH (security_invoker = true) AS
SELECT c.id,c.visitante_id,c.obra_id,c.tipo,c.numero,c.qr_token,c.validade_ate,c.status,c.placa_veiculo,
  c.veiculo_marca_modelo,c.veiculo_documento,c.veiculo_documento_validade,
  v.nome AS visitante_nome,v.empresa AS visitante_empresa,v.numero_doc,
  EXISTS(SELECT 1 FROM public.visitante_credenciais cv WHERE cv.visitante_id=c.visitante_id AND cv.obra_id=c.obra_id AND cv.tipo='veiculo' AND cv.status='ativa') AS tem_veiculo,
  b.id AS briefing_realizacao_id,b.versao AS briefing_versao,b.realizado_em AS briefing_realizado_em,b.validade_ate AS briefing_validade_ate,
  (c.status='ativa' AND c.validade_ate>now() AND (c.tipo='veiculo' OR b.validade_ate>now())) AS acesso_valido
FROM public.visitante_credenciais c
JOIN public.visitantes v ON v.id=c.visitante_id
LEFT JOIN LATERAL (
  SELECT * FROM public.sms_briefing_visitante_realizacoes r
  WHERE r.credencial_pessoa_id=c.id
  ORDER BY r.realizado_em DESC LIMIT 1
) b ON c.tipo='pessoa';
GRANT SELECT ON public.v_credenciais_visitantes_status TO authenticated;

COMMENT ON TABLE public.visitante_credenciais IS 'Crachás de pessoa e veículo com QR Code e validade por obra.';
COMMENT ON TABLE public.sms_briefing_visitante_realizacoes IS 'Histórico imutável de briefings realizados para visitantes.';

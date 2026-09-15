-- Portaria de obra: documentos, briefing SMS e credenciais temporárias.
-- A validação fica no banco para que uma entrada não possa ser liberada apenas
-- por uma alteração na tela.

ALTER TABLE public.visitantes
  ADD COLUMN IF NOT EXISTS documento_validade date,
  ADD COLUMN IF NOT EXISTS documento_url text,
  ADD COLUMN IF NOT EXISTS cnh_numero text,
  ADD COLUMN IF NOT EXISTS cnh_categoria text,
  ADD COLUMN IF NOT EXISTS cnh_validade date,
  ADD COLUMN IF NOT EXISTS cnh_url text;

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

CREATE INDEX IF NOT EXISTS visitas_credencial_validade_idx ON public.visitas(cracha_validade)
  WHERE status IN ('autorizado','dentro');
CREATE INDEX IF NOT EXISTS visitas_veiculo_placa_idx ON public.visitas(placa_veiculo)
  WHERE placa_veiculo IS NOT NULL;

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

ALTER TABLE public.sms_briefings_visitantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS briefing_visitante_select ON public.sms_briefings_visitantes;
DROP POLICY IF EXISTS briefing_visitante_manage ON public.sms_briefings_visitantes;
CREATE POLICY briefing_visitante_select ON public.sms_briefings_visitantes FOR SELECT TO authenticated
  USING (obra_id IS NULL OR public.can_manage_obra_data(obra_id));
CREATE POLICY briefing_visitante_manage ON public.sms_briefings_visitantes FOR ALL TO authenticated
  USING (public.access_is_admin() OR (obra_id IS NOT NULL AND public.can_manage_obra_data(obra_id)))
  WITH CHECK (public.access_is_admin() OR (obra_id IS NOT NULL AND public.can_manage_obra_data(obra_id)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_briefings_visitantes TO authenticated;

CREATE OR REPLACE FUNCTION public.visita_validar_liberacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_visitante public.visitantes%ROWTYPE;
DECLARE v_validade timestamptz;
BEGIN
  IF NEW.status NOT IN ('autorizado','dentro') THEN RETURN NEW; END IF;

  SELECT * INTO v_visitante FROM public.visitantes WHERE id=NEW.visitante_id;
  IF v_visitante.id IS NULL OR trim(coalesce(v_visitante.numero_doc,''))='' THEN
    RAISE EXCEPTION 'Documento de identificação do visitante é obrigatório para liberar a entrada';
  END IF;
  IF v_visitante.documento_validade IS NOT NULL AND v_visitante.documento_validade < current_date THEN
    RAISE EXCEPTION 'Documento de identificação do visitante está vencido';
  END IF;
  IF NOT NEW.briefing_sms_aceite OR NEW.briefing_sms_realizado_em IS NULL OR trim(coalesce(NEW.briefing_sms_versao,''))='' THEN
    RAISE EXCEPTION 'Realize e registre o briefing SMS de segurança antes de liberar a entrada';
  END IF;

  IF NEW.conduz_veiculo THEN
    IF trim(coalesce(NEW.placa_veiculo,''))='' OR trim(coalesce(NEW.veiculo_documento,''))='' THEN
      RAISE EXCEPTION 'Placa e documento do veículo são obrigatórios para o condutor';
    END IF;
    IF NEW.veiculo_documento_validade IS NULL OR NEW.veiculo_documento_validade < current_date THEN
      RAISE EXCEPTION 'Documento do veículo ausente ou vencido';
    END IF;
    IF trim(coalesce(v_visitante.cnh_numero,''))='' OR v_visitante.cnh_validade IS NULL OR v_visitante.cnh_validade < current_date THEN
      RAISE EXCEPTION 'CNH do condutor ausente ou vencida';
    END IF;
  END IF;

  v_validade := coalesce(NEW.cracha_validade, date_trunc('day', now()) + interval '1 day' - interval '1 second');
  IF v_validade <= now() THEN RAISE EXCEPTION 'Informe uma validade futura para o crachá'; END IF;
  NEW.cracha_validade := v_validade;
  IF NEW.conduz_veiculo THEN
    NEW.credencial_veiculo_numero := coalesce(NEW.credencial_veiculo_numero, 'V-' || replace(coalesce(NEW.placa_veiculo,''), '-', ''));
    NEW.credencial_veiculo_validade := coalesce(NEW.credencial_veiculo_validade, v_validade);
  ELSE
    NEW.credencial_veiculo_numero := NULL;
    NEW.credencial_veiculo_validade := NULL;
  END IF;
  NEW.requisitos_conferidos := jsonb_build_object(
    'documento_pessoal', true, 'briefing_sms', true, 'condutor', NEW.conduz_veiculo,
    'veiculo', CASE WHEN NEW.conduz_veiculo THEN true ELSE null END,
    'conferido_em', now()
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_visita_validar_liberacao ON public.visitas;
CREATE TRIGGER trg_visita_validar_liberacao
  BEFORE INSERT OR UPDATE OF status, visitante_id, conduz_veiculo, placa_veiculo, veiculo_documento,
    veiculo_documento_validade, briefing_sms_aceite, briefing_sms_realizado_em, briefing_sms_versao,
    cracha_validade, credencial_veiculo_validade
  ON public.visitas FOR EACH ROW EXECUTE FUNCTION public.visita_validar_liberacao();

CREATE OR REPLACE VIEW public.v_visitas_ativas
WITH (security_invoker = true) AS
SELECT
  v.id, v.obra_id, v.motivo, v.setor_destino, v.entrada,
  -- As colunas originais precisam manter exatamente a mesma ordem. O
  -- PostgreSQL permite acrescentar campos a uma view, mas não reposicioná-los.
  v.cracha_numero, v.placa_veiculo, v.status,
  o.nome AS obra_nome,
  vi.nome AS visitante_nome, vi.empresa AS visitante_empresa,
  vi.tipo_doc, vi.numero_doc,
  EXTRACT(EPOCH FROM (now() - v.entrada)) / 60 AS minutos_dentro,
  e.nome AS responsavel_nome,
  -- Novos dados de portaria acrescentados ao final.
  v.cracha_validade, v.conduz_veiculo,
  v.credencial_veiculo_numero, v.credencial_veiculo_validade,
  v.briefing_sms_versao, v.briefing_sms_realizado_em
FROM public.visitas v
JOIN public.obras o ON o.id = v.obra_id
JOIN public.visitantes vi ON vi.id = v.visitante_id
LEFT JOIN public.employees e ON e.id = v.responsavel_id
WHERE v.status IN ('autorizado','dentro');

GRANT SELECT ON public.v_visitas_ativas TO authenticated;

COMMENT ON TABLE public.sms_briefings_visitantes IS 'Briefings SMS que a portaria aplica antes da entrada de visitantes.';
COMMENT ON COLUMN public.visitas.requisitos_conferidos IS 'Registro imutável dos requisitos conferidos na liberação de acesso.';

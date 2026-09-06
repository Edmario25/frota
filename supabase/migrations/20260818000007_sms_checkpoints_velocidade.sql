-- =====================================================================
-- SMS — CHECKPOINTS DE VELOCIDADE
--
-- Radar automático em estradas internas de obra/parque eólico.
-- Cada checkpoint identifica o veículo por tag RFID UHF e mede a
-- velocidade por radar Doppler. Passagens acima do limite viram
-- infração automaticamente, com opção de escalar para desvio SMS.
--
-- REUTILIZA: public.obras, public.vehicles, public.employees, public.sms_desvios
-- PREFIXO: sms_
-- =====================================================================

-- ─── 1. CHECKPOINTS ──────────────────────────────────────────────────
-- Pontos fixos de medição. device_token autentica o Raspberry Pi na
-- ingestão via RPC (o RPi não usa sessão de usuário).

CREATE TABLE IF NOT EXISTS public.sms_checkpoints (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id                uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome                   text NOT NULL,
  descricao              text,
  -- Limite da zona monitorada por este ponto
  limite_velocidade_kmh  integer NOT NULL DEFAULT 40
                           CHECK (limite_velocidade_kmh BETWEEN 5 AND 200),
  -- Tolerância antes de considerar infração (ex.: 5 km/h de margem do radar)
  tolerancia_kmh         integer NOT NULL DEFAULT 0
                           CHECK (tolerancia_kmh BETWEEN 0 AND 20),
  latitude               numeric(10,7),
  longitude              numeric(10,7),
  -- Token do dispositivo (Raspberry Pi) para ingestão automática
  device_token           text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  device_ultimo_contato  timestamptz,
  modo                   text NOT NULL DEFAULT 'automatico'
                           CHECK (modo IN ('automatico', 'manual')),
  ativo                  boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_checkpoints_obra  ON public.sms_checkpoints(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_checkpoints_ativo ON public.sms_checkpoints(ativo);

-- ─── 2. TAGS RFID ↔ VEÍCULO ──────────────────────────────────────────
-- Etiqueta UHF colada no para-brisa, vinculada ao veículo da frota.

CREATE TABLE IF NOT EXISTS public.sms_veiculos_rfid (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tag_epc       text NOT NULL UNIQUE,       -- EPC da etiqueta UHF (hex)
  data_vinculo  date NOT NULL DEFAULT CURRENT_DATE,
  data_remocao  date,
  ativa         boolean NOT NULL DEFAULT true,
  observacoes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_rfid_vehicle ON public.sms_veiculos_rfid(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sms_rfid_tag     ON public.sms_veiculos_rfid(tag_epc) WHERE ativa;

-- ─── 3. PASSAGENS ────────────────────────────────────────────────────
-- Toda passagem detectada, dentro ou fora do limite.
-- vehicle_id fica NULL quando a tag não foi reconhecida (veículo externo).

CREATE TABLE IF NOT EXISTS public.sms_checkpoint_passagens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id      uuid NOT NULL REFERENCES public.sms_checkpoints(id) ON DELETE CASCADE,
  vehicle_id         uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  tag_epc            text,                  -- registrado mesmo se não reconhecida
  motorista_id       uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  velocidade_kmh     numeric(5,1) NOT NULL CHECK (velocidade_kmh >= 0),
  limite_no_momento  integer NOT NULL,      -- snapshot do limite (histórico fiel)
  sentido            text CHECK (sentido IN ('entrada', 'saida', 'indefinido')),
  foto_url           text,
  origem             text NOT NULL DEFAULT 'dispositivo'
                       CHECK (origem IN ('dispositivo', 'manual')),
  registrado_por     uuid REFERENCES auth.users(id),  -- preenchido no modo manual
  detectado_em       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_passagens_checkpoint ON public.sms_checkpoint_passagens(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_sms_passagens_vehicle    ON public.sms_checkpoint_passagens(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sms_passagens_detectado  ON public.sms_checkpoint_passagens(detectado_em DESC);

-- ─── 4. INFRAÇÕES ────────────────────────────────────────────────────
-- Criadas automaticamente pelo trigger quando a passagem excede o limite.

CREATE TABLE IF NOT EXISTS public.sms_infracoes_velocidade (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passagem_id       uuid NOT NULL UNIQUE REFERENCES public.sms_checkpoint_passagens(id) ON DELETE CASCADE,
  checkpoint_id     uuid NOT NULL REFERENCES public.sms_checkpoints(id) ON DELETE CASCADE,
  obra_id           uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  vehicle_id        uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  motorista_id      uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  velocidade_kmh    numeric(5,1) NOT NULL,
  limite_kmh        integer NOT NULL,
  excesso_kmh       numeric(5,1) NOT NULL,
  excesso_percentual numeric(5,1) NOT NULL,
  gravidade         text NOT NULL CHECK (gravidade IN ('leve', 'media', 'grave', 'gravissima')),
  status            text NOT NULL DEFAULT 'aberta'
                      CHECK (status IN ('aberta', 'em_tratativa', 'notificada', 'encerrada', 'cancelada')),
  -- Escalonamento para o módulo de desvios SMS (ação humana, não automática)
  desvio_id         uuid REFERENCES public.sms_desvios(id) ON DELETE SET NULL,
  tratativa         text,
  encerrada_por     uuid REFERENCES auth.users(id),
  encerrada_em      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_infracoes_obra      ON public.sms_infracoes_velocidade(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_infracoes_vehicle   ON public.sms_infracoes_velocidade(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sms_infracoes_status    ON public.sms_infracoes_velocidade(status);
CREATE INDEX IF NOT EXISTS idx_sms_infracoes_gravidade ON public.sms_infracoes_velocidade(gravidade);
CREATE INDEX IF NOT EXISTS idx_sms_infracoes_created   ON public.sms_infracoes_velocidade(created_at DESC);

-- ─── 5. TRIGGER: gera infração ao exceder o limite ───────────────────
-- Gravidade pelo percentual de excesso sobre o limite:
--   até 20%  → leve   | 20–50% → media
--   50–80%   → grave  | acima  → gravissima

CREATE OR REPLACE FUNCTION public.sms_fn_gerar_infracao_velocidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tolerancia integer;
  v_obra_id    uuid;
  v_teto       numeric;
  v_excesso    numeric;
  v_pct        numeric;
  v_gravidade  text;
BEGIN
  SELECT c.tolerancia_kmh, c.obra_id
  INTO   v_tolerancia, v_obra_id
  FROM   public.sms_checkpoints c
  WHERE  c.id = NEW.checkpoint_id;

  v_teto := NEW.limite_no_momento + COALESCE(v_tolerancia, 0);

  -- Dentro do limite (com tolerância): passagem normal, sem infração
  IF NEW.velocidade_kmh <= v_teto THEN
    RETURN NEW;
  END IF;

  v_excesso := NEW.velocidade_kmh - NEW.limite_no_momento;
  v_pct     := ROUND((v_excesso / NULLIF(NEW.limite_no_momento, 0)) * 100, 1);

  v_gravidade := CASE
    WHEN v_pct <= 20 THEN 'leve'
    WHEN v_pct <= 50 THEN 'media'
    WHEN v_pct <= 80 THEN 'grave'
    ELSE 'gravissima'
  END;

  INSERT INTO public.sms_infracoes_velocidade (
    passagem_id, checkpoint_id, obra_id, vehicle_id, motorista_id,
    velocidade_kmh, limite_kmh, excesso_kmh, excesso_percentual, gravidade
  ) VALUES (
    NEW.id, NEW.checkpoint_id, v_obra_id, NEW.vehicle_id, NEW.motorista_id,
    NEW.velocidade_kmh, NEW.limite_no_momento, v_excesso, v_pct, v_gravidade
  )
  ON CONFLICT (passagem_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_passagem_gerar_infracao ON public.sms_checkpoint_passagens;
CREATE TRIGGER sms_passagem_gerar_infracao
  AFTER INSERT ON public.sms_checkpoint_passagens
  FOR EACH ROW EXECUTE FUNCTION public.sms_fn_gerar_infracao_velocidade();

-- ─── 6. RPC DE INGESTÃO (Raspberry Pi) ───────────────────────────────
-- O dispositivo envia tag + velocidade autenticando pelo device_token.
-- Resolve o veículo pela tag, aplica o limite vigente e grava a passagem.
-- O trigger acima decide se vira infração.

CREATE OR REPLACE FUNCTION public.registrar_passagem_checkpoint(
  p_device_token   text,
  p_tag_epc        text,
  p_velocidade_kmh numeric,
  p_sentido        text DEFAULT 'indefinido',
  p_foto_url       text DEFAULT NULL,
  p_detectado_em   timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkpoint   RECORD;
  v_vehicle_id   uuid;
  v_motorista_id uuid;
  v_passagem_id  uuid;
  v_infracao     RECORD;
BEGIN
  -- 1. Autentica o dispositivo
  SELECT * INTO v_checkpoint
  FROM   public.sms_checkpoints
  WHERE  device_token = p_device_token AND ativo;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'device_token invalido ou checkpoint inativo');
  END IF;

  -- 2. Resolve veículo pela tag RFID (NULL se desconhecida)
  SELECT r.vehicle_id INTO v_vehicle_id
  FROM   public.sms_veiculos_rfid r
  WHERE  r.tag_epc = p_tag_epc AND r.ativa;

  IF v_vehicle_id IS NOT NULL THEN
    SELECT responsavel_id INTO v_motorista_id
    FROM   public.vehicles WHERE id = v_vehicle_id;
  END IF;

  -- 3. Grava a passagem (trigger avalia infração)
  INSERT INTO public.sms_checkpoint_passagens (
    checkpoint_id, vehicle_id, tag_epc, motorista_id,
    velocidade_kmh, limite_no_momento, sentido, foto_url,
    origem, detectado_em
  ) VALUES (
    v_checkpoint.id, v_vehicle_id, p_tag_epc, v_motorista_id,
    p_velocidade_kmh, v_checkpoint.limite_velocidade_kmh,
    COALESCE(p_sentido, 'indefinido'), p_foto_url,
    'dispositivo', COALESCE(p_detectado_em, now())
  )
  RETURNING id INTO v_passagem_id;

  -- 4. Marca contato do dispositivo (heartbeat)
  UPDATE public.sms_checkpoints
  SET    device_ultimo_contato = now()
  WHERE  id = v_checkpoint.id;

  SELECT * INTO v_infracao
  FROM   public.sms_infracoes_velocidade
  WHERE  passagem_id = v_passagem_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'passagem_id',     v_passagem_id,
    'veiculo_conhecido', v_vehicle_id IS NOT NULL,
    'limite_kmh',      v_checkpoint.limite_velocidade_kmh,
    'infracao',        FOUND,
    'gravidade',       COALESCE(v_infracao.gravidade, 'nenhuma')
  );
END;
$$;

-- anon pode chamar: a autenticação é o device_token, não a sessão
GRANT EXECUTE ON FUNCTION public.registrar_passagem_checkpoint(text, text, numeric, text, text, timestamptz) TO anon, authenticated;

-- ─── 7. RPC: escalar infração para desvio SMS ────────────────────────
-- Ação humana — cria um desvio no módulo de desvios e vincula à infração.

CREATE OR REPLACE FUNCTION public.sms_escalar_infracao_para_desvio(p_infracao_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inf       RECORD;
  v_autor_id  uuid;
  v_placa     text;
  v_check     text;
  v_desvio_id uuid;
BEGIN
  SELECT * INTO v_inf FROM public.sms_infracoes_velocidade WHERE id = p_infracao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Infração não encontrada';
  END IF;

  IF v_inf.desvio_id IS NOT NULL THEN
    RETURN v_inf.desvio_id;  -- já escalada
  END IF;

  SELECT id INTO v_autor_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário atual não está vinculado a um colaborador';
  END IF;

  SELECT placa INTO v_placa FROM public.vehicles WHERE id = v_inf.vehicle_id;
  SELECT nome  INTO v_check FROM public.sms_checkpoints WHERE id = v_inf.checkpoint_id;

  INSERT INTO public.sms_desvios (
    obra_id, origem, origem_ref_id, tipo, descricao, gravidade, status, autor_id
  ) VALUES (
    v_inf.obra_id,
    'registro_livre',
    v_inf.id,
    'ato_inseguro',
    format('Excesso de velocidade: %s km/h em zona de %s km/h no checkpoint %s%s.',
           v_inf.velocidade_kmh, v_inf.limite_kmh, COALESCE(v_check, '—'),
           CASE WHEN v_placa IS NOT NULL THEN ' — veículo ' || v_placa ELSE '' END),
    CASE v_inf.gravidade
      WHEN 'leve'       THEN 'baixa'
      WHEN 'media'      THEN 'media'
      WHEN 'grave'      THEN 'alta'
      ELSE                   'critica'
    END,
    'aberto',
    v_autor_id
  )
  RETURNING id INTO v_desvio_id;

  UPDATE public.sms_infracoes_velocidade
  SET    desvio_id = v_desvio_id,
         status    = 'em_tratativa',
         updated_at = now()
  WHERE  id = p_infracao_id;

  RETURN v_desvio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sms_escalar_infracao_para_desvio(uuid) TO authenticated;

-- ─── 8. TRIGGERS updated_at ──────────────────────────────────────────
CREATE TRIGGER sms_checkpoints_updated_at
  BEFORE UPDATE ON public.sms_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_veiculos_rfid_updated_at
  BEFORE UPDATE ON public.sms_veiculos_rfid
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sms_infracoes_updated_at
  BEFORE UPDATE ON public.sms_infracoes_velocidade
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 9. RLS ──────────────────────────────────────────────────────────
-- Leitura: gestores/tecnico_sms ou quem tem acesso à obra.
-- Escrita: gestores de contrato/frota, tecnico_sms e gestor de obra.

ALTER TABLE public.sms_checkpoints            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_veiculos_rfid          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_checkpoint_passagens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_infracoes_velocidade   ENABLE ROW LEVEL SECURITY;

-- Checkpoints
CREATE POLICY "sms_checkpoints_select" ON public.sms_checkpoints
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_checkpoints_write" ON public.sms_checkpoints
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- Tags RFID (não são por obra — leitura aberta a autenticados)
CREATE POLICY "sms_rfid_select" ON public.sms_veiculos_rfid
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sms_rfid_write" ON public.sms_veiculos_rfid
  FOR ALL TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- Passagens
CREATE POLICY "sms_passagens_select" ON public.sms_checkpoint_passagens
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR checkpoint_id IN (
      SELECT id FROM public.sms_checkpoints
      WHERE obra_id IN (SELECT public.get_my_obra_ids())
    ));

CREATE POLICY "sms_passagens_insert" ON public.sms_checkpoint_passagens
  FOR INSERT TO authenticated
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- Infrações
CREATE POLICY "sms_infracoes_select" ON public.sms_infracoes_velocidade
  FOR SELECT TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

CREATE POLICY "sms_infracoes_update" ON public.sms_infracoes_velocidade
  FOR UPDATE TO authenticated
  USING (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra())
  WITH CHECK (is_gestor_contrato() OR is_tecnico_sms() OR is_gestor_obra());

-- ─── 10. PERMISSÃO POR CARGO ─────────────────────────────────────────
ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS acesso_sms_velocidade boolean NOT NULL DEFAULT false;

-- Concede aos perfis que já administram o módulo SMS
UPDATE public.cargos SET acesso_sms_velocidade = true
WHERE nivel_acesso IN ('gestor_contrato', 'gestor_obra')
   OR acesso_sms_dashboard = true;

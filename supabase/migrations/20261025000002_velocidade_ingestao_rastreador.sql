-- ============================================================================
-- Ingestão das amostras do rastreador (Fase 2)
--
-- Uma posição do Traccar sozinha não é infração. O caminho é:
--   amostra → filtro de qualidade → zona → acumula evento → fecha evento → passagem
-- e a passagem cai no trigger que já existe, que decide gravidade e, se a zona
-- estiver em 'autuacao', grava a infração.
--
-- Duas regras evitam o falso positivo que mataria a confiança no módulo:
--   · amostra isolada acima do teto não vira nada — exige `amostras_minimas`
--     consecutivas e `duracao_minima_seg` de duração;
--   · amostra com sinal ruim (inválida, poucos satélites, HDOP alto) é
--     descartada antes de qualquer conta.
--
-- Reprocessar a mesma janela é seguro: `sms_rastreador_estado` guarda o último
-- fix processado por veículo e amostra repetida é ignorada.
--
-- Rodar inteiro, de uma vez, no SQL editor. Idempotente.
-- ============================================================================

-- ─── 1. EVENTO EM ABERTO ────────────────────────────────────────────────────
-- Acumula a sequência de amostras acima do teto enquanto o veículo não sai da
-- zona, não desacelera e não some. Fechado, vira passagem (ou é descartado).

CREATE TABLE IF NOT EXISTS public.sms_zona_eventos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_id            uuid NOT NULL REFERENCES public.sms_zonas_velocidade(id) ON DELETE CASCADE,
  vehicle_id         uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  obra_id            uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  iniciado_em        timestamptz NOT NULL,
  ultima_amostra_em  timestamptz NOT NULL,
  amostras_acima     integer NOT NULL DEFAULT 0,
  velocidade_max     numeric(5,1) NOT NULL DEFAULT 0,
  velocidade_max_em  timestamptz,
  limite_no_momento  integer NOT NULL,
  amostras           jsonb NOT NULL DEFAULT '[]'::jsonb,
  fechado_em         timestamptz,
  descartado_motivo  text,
  passagem_id        uuid REFERENCES public.sms_checkpoint_passagens(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Um evento aberto por veículo: a amostra seguinte sempre sabe onde continuar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_zona_evento_aberto
  ON public.sms_zona_eventos(vehicle_id) WHERE fechado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_sms_zona_eventos_zona
  ON public.sms_zona_eventos(zona_id, iniciado_em DESC);

-- ─── 2. ESTADO POR VEÍCULO ──────────────────────────────────────────────────
-- Último fix já processado. É o que torna a varredura de reconciliação
-- idempotente: webhook e varredura podem trazer a mesma posição.

CREATE TABLE IF NOT EXISTS public.sms_rastreador_estado (
  vehicle_id      uuid PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  ultimo_fix_em   timestamptz,
  ultima_zona_id  uuid REFERENCES public.sms_zonas_velocidade(id) ON DELETE SET NULL,
  amostras_vistas bigint NOT NULL DEFAULT 0,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. FECHAMENTO DO EVENTO ────────────────────────────────────────────────
-- Fecha o evento e, se ele cumpre o mínimo de amostras e duração, grava a
-- passagem. A velocidade registrada é a máxima da sequência, no instante dela.

CREATE OR REPLACE FUNCTION public.sms_fechar_evento_velocidade(p_evento_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento      public.sms_zona_eventos%ROWTYPE;
  v_zona        public.sms_zonas_velocidade%ROWTYPE;
  v_duracao     numeric;
  v_motorista   uuid;
  v_passagem_id uuid;
BEGIN
  SELECT * INTO v_evento FROM public.sms_zona_eventos
  WHERE id = p_evento_id AND fechado_em IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_zona FROM public.sms_zonas_velocidade WHERE id = v_evento.zona_id;

  v_duracao := EXTRACT(EPOCH FROM (v_evento.ultima_amostra_em - v_evento.iniciado_em));

  -- Curto demais para ser excesso de verdade: fecha sem gerar passagem.
  IF v_evento.amostras_acima < v_zona.amostras_minimas
     OR v_duracao < v_zona.duracao_minima_seg THEN
    UPDATE public.sms_zona_eventos
    SET fechado_em = now(),
        descartado_motivo = format(
          'Sequência curta: %s amostra(s) em %s s; a zona exige %s e %s s.',
          v_evento.amostras_acima, round(v_duracao), v_zona.amostras_minimas, v_zona.duracao_minima_seg)
    WHERE id = p_evento_id;
    RETURN NULL;
  END IF;

  -- Sem jornada registrada, o responsável pelo veículo é quem responde —
  -- mesma regra que o caminho do radar já usa.
  SELECT responsavel_id INTO v_motorista FROM public.vehicles WHERE id = v_evento.vehicle_id;

  INSERT INTO public.sms_checkpoint_passagens (
    zona_id, vehicle_id, motorista_id, velocidade_kmh, limite_no_momento,
    sentido, origem, detectado_em, amostras
  ) VALUES (
    v_evento.zona_id, v_evento.vehicle_id, v_motorista,
    v_evento.velocidade_max, v_evento.limite_no_momento,
    'indefinido', 'rastreador',
    COALESCE(v_evento.velocidade_max_em, v_evento.ultima_amostra_em),
    v_evento.amostras
  )
  RETURNING id INTO v_passagem_id;

  UPDATE public.sms_zona_eventos
  SET fechado_em = now(), passagem_id = v_passagem_id
  WHERE id = p_evento_id;

  RETURN v_passagem_id;
END $$;

-- ─── 4. INGESTÃO DE UMA AMOSTRA ─────────────────────────────────────────────
-- Chamada pela edge function, uma vez por posição, em ordem cronológica.
-- Devolve o que decidiu, para o diagnóstico em campo não virar adivinhação.

CREATE OR REPLACE FUNCTION public.sms_registrar_amostra_rastreador(
  p_device_id   integer,
  p_latitude    double precision,
  p_longitude   double precision,
  p_velocidade_kmh numeric,
  p_fix_em      timestamptz,
  p_satelites   integer DEFAULT NULL,
  p_hdop        numeric DEFAULT NULL,
  p_valida      boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k_parado_kmh   constant numeric := 5;    -- abaixo disso o veículo não está em marcha
  k_sat_minimo   constant integer := 5;
  k_hdop_maximo  constant numeric := 5;
  k_gap_segundos constant integer := 120;  -- silêncio que quebra a sequência

  v_vehicle_id uuid;
  v_estado     public.sms_rastreador_estado%ROWTYPE;
  v_zona_id    uuid;
  v_zona       public.sms_zonas_velocidade%ROWTYPE;
  v_evento     public.sms_zona_eventos%ROWTYPE;
  v_teto       numeric;
  v_amostra    jsonb;
  v_passagem   uuid;
BEGIN
  SELECT id INTO v_vehicle_id FROM public.vehicles WHERE traccar_device_id = p_device_id;
  IF v_vehicle_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'decisao', 'veiculo_nao_vinculado', 'device_id', p_device_id);
  END IF;

  INSERT INTO public.sms_rastreador_estado (vehicle_id) VALUES (v_vehicle_id)
  ON CONFLICT (vehicle_id) DO NOTHING;

  SELECT * INTO v_estado FROM public.sms_rastreador_estado WHERE vehicle_id = v_vehicle_id FOR UPDATE;

  -- Reprocessamento: a varredura repete posições que o webhook já trouxe.
  IF v_estado.ultimo_fix_em IS NOT NULL AND p_fix_em <= v_estado.ultimo_fix_em THEN
    RETURN jsonb_build_object('ok', true, 'decisao', 'ja_processada');
  END IF;

  UPDATE public.sms_rastreador_estado
  SET ultimo_fix_em = p_fix_em, amostras_vistas = amostras_vistas + 1, atualizado_em = now()
  WHERE vehicle_id = v_vehicle_id;

  -- Sinal ruim não vira infração; sat/hdop nem sempre vêm do rastreador.
  IF p_valida IS FALSE
     OR (p_satelites IS NOT NULL AND p_satelites < k_sat_minimo)
     OR (p_hdop IS NOT NULL AND p_hdop > k_hdop_maximo) THEN
    RETURN jsonb_build_object('ok', true, 'decisao', 'descartada_qualidade',
      'satelites', p_satelites, 'hdop', p_hdop);
  END IF;

  SELECT * INTO v_evento FROM public.sms_zona_eventos
  WHERE vehicle_id = v_vehicle_id AND fechado_em IS NULL FOR UPDATE;

  -- Parado: encerra o que estava acumulando.
  IF p_velocidade_kmh < k_parado_kmh THEN
    IF v_evento.id IS NOT NULL THEN v_passagem := public.sms_fechar_evento_velocidade(v_evento.id); END IF;
    RETURN jsonb_build_object('ok', true, 'decisao', 'parado', 'passagem_id', v_passagem);
  END IF;

  v_zona_id := public.sms_zona_do_ponto(NULL::uuid, p_latitude, p_longitude, p_fix_em);

  UPDATE public.sms_rastreador_estado SET ultima_zona_id = v_zona_id WHERE vehicle_id = v_vehicle_id;

  IF v_zona_id IS NULL THEN
    IF v_evento.id IS NOT NULL THEN v_passagem := public.sms_fechar_evento_velocidade(v_evento.id); END IF;
    RETURN jsonb_build_object('ok', true, 'decisao', 'fora_de_zona', 'passagem_id', v_passagem);
  END IF;

  SELECT * INTO v_zona FROM public.sms_zonas_velocidade WHERE id = v_zona_id;
  v_teto := v_zona.limite_velocidade_kmh + v_zona.tolerancia_kmh;

  -- Dentro do limite: fecha a sequência anterior, se havia.
  IF p_velocidade_kmh <= v_teto THEN
    IF v_evento.id IS NOT NULL THEN v_passagem := public.sms_fechar_evento_velocidade(v_evento.id); END IF;
    RETURN jsonb_build_object('ok', true, 'decisao', 'dentro_do_limite',
      'zona_id', v_zona_id, 'teto_kmh', v_teto, 'passagem_id', v_passagem);
  END IF;

  -- Acima do teto. Zona diferente ou silêncio longo quebram a sequência.
  IF v_evento.id IS NOT NULL
     AND (v_evento.zona_id <> v_zona_id
          OR EXTRACT(EPOCH FROM (p_fix_em - v_evento.ultima_amostra_em)) > k_gap_segundos) THEN
    v_passagem := public.sms_fechar_evento_velocidade(v_evento.id);
    v_evento := NULL;
  END IF;

  v_amostra := jsonb_build_object(
    'lat', round(p_latitude::numeric, 6), 'lng', round(p_longitude::numeric, 6),
    'kmh', round(p_velocidade_kmh, 1), 't', p_fix_em,
    'sat', p_satelites, 'hdop', p_hdop
  );

  IF v_evento.id IS NULL THEN
    INSERT INTO public.sms_zona_eventos (
      zona_id, vehicle_id, obra_id, iniciado_em, ultima_amostra_em,
      amostras_acima, velocidade_max, velocidade_max_em, limite_no_momento, amostras
    ) VALUES (
      v_zona_id, v_vehicle_id, v_zona.obra_id, p_fix_em, p_fix_em,
      1, p_velocidade_kmh, p_fix_em, v_zona.limite_velocidade_kmh, jsonb_build_array(v_amostra)
    )
    RETURNING * INTO v_evento;
  ELSE
    UPDATE public.sms_zona_eventos
    SET ultima_amostra_em = p_fix_em,
        amostras_acima    = amostras_acima + 1,
        velocidade_max    = GREATEST(velocidade_max, p_velocidade_kmh),
        velocidade_max_em = CASE WHEN p_velocidade_kmh > velocidade_max THEN p_fix_em ELSE velocidade_max_em END,
        -- Rastro limitado: 60 amostras bastam como evidência e não incham a linha.
        amostras          = CASE WHEN jsonb_array_length(amostras) < 60
                                 THEN amostras || v_amostra ELSE amostras END
    WHERE id = v_evento.id
    RETURNING * INTO v_evento;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'decisao', 'acima_do_teto',
    'zona_id', v_zona_id, 'zona', v_zona.nome, 'modo', v_zona.modo_operacao,
    'evento_id', v_evento.id, 'amostras_acima', v_evento.amostras_acima,
    'velocidade_max_kmh', v_evento.velocidade_max, 'teto_kmh', v_teto
  );
END $$;

-- ─── 5. INGESTÃO EM LOTE ────────────────────────────────────────────────────
-- Uma chamada por veículo, com as posições da janela em ordem cronológica.
-- `p_amostras` = [{lat, lng, kmh, t, sat, hdop, valida}, ...] — kmh já em km/h.

CREATE OR REPLACE FUNCTION public.sms_registrar_amostras_rastreador(
  p_device_id integer,
  p_amostras  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item     jsonb;
  v_resposta jsonb;
  v_decisoes jsonb := '{}'::jsonb;
  v_decisao  text;
  v_total    integer := 0;
  v_passagens uuid[] := ARRAY[]::uuid[];
BEGIN
  IF jsonb_typeof(p_amostras) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'p_amostras deve ser um array');
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_amostras)
    ORDER BY (value->>'t')::timestamptz
  LOOP
    v_resposta := public.sms_registrar_amostra_rastreador(
      p_device_id,
      (v_item->>'lat')::double precision,
      (v_item->>'lng')::double precision,
      (v_item->>'kmh')::numeric,
      (v_item->>'t')::timestamptz,
      NULLIF(v_item->>'sat', '')::integer,
      NULLIF(v_item->>'hdop', '')::numeric,
      COALESCE((v_item->>'valida')::boolean, true)
    );

    v_total   := v_total + 1;
    v_decisao := v_resposta->>'decisao';
    v_decisoes := jsonb_set(
      v_decisoes, ARRAY[v_decisao],
      to_jsonb(COALESCE((v_decisoes->>v_decisao)::integer, 0) + 1), true);

    IF v_resposta ? 'passagem_id' AND v_resposta->>'passagem_id' IS NOT NULL THEN
      v_passagens := v_passagens || (v_resposta->>'passagem_id')::uuid;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'device_id', p_device_id,
    'amostras', v_total, 'decisoes', v_decisoes,
    'passagens', to_jsonb(v_passagens)
  );
END $$;

-- ─── 6. VARREDURA DE FECHAMENTO ─────────────────────────────────────────────
-- O veículo pode sair da zona e perder sinal: sem isso o evento ficaria aberto
-- para sempre. Chamada pelo mesmo agendamento da ingestão.

CREATE OR REPLACE FUNCTION public.sms_fechar_eventos_velocidade(p_ocioso_seg integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento record;
  v_total integer := 0;
BEGIN
  FOR v_evento IN
    SELECT id FROM public.sms_zona_eventos
    WHERE fechado_em IS NULL
      AND ultima_amostra_em < now() - make_interval(secs => p_ocioso_seg)
  LOOP
    PERFORM public.sms_fechar_evento_velocidade(v_evento.id);
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END $$;

-- ─── 7. PERMISSÕES ──────────────────────────────────────────────────────────
-- A ingestão roda pela edge function com service role. `authenticated` recebe
-- execute para teste e operação manual; `anon` não entra aqui — diferente do
-- radar, não há device_token para autenticar a origem.

ALTER TABLE public.sms_zona_eventos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_rastreador_estado   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_zona_eventos_read" ON public.sms_zona_eventos;
CREATE POLICY "sms_zona_eventos_read" ON public.sms_zona_eventos FOR SELECT TO authenticated
  USING (public.is_gestor_contrato() OR public.is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

DROP POLICY IF EXISTS "sms_rastreador_estado_read" ON public.sms_rastreador_estado;
CREATE POLICY "sms_rastreador_estado_read" ON public.sms_rastreador_estado FOR SELECT TO authenticated
  USING (public.is_gestor_contrato() OR public.is_tecnico_sms());

GRANT SELECT ON public.sms_zona_eventos      TO authenticated;
GRANT SELECT ON public.sms_rastreador_estado TO authenticated;

REVOKE ALL ON FUNCTION public.sms_registrar_amostra_rastreador(integer, double precision, double precision, numeric, timestamptz, integer, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sms_fechar_evento_velocidade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sms_registrar_amostras_rastreador(integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sms_fechar_eventos_velocidade(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_registrar_amostra_rastreador(integer, double precision, double precision, numeric, timestamptz, integer, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sms_fechar_evento_velocidade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sms_registrar_amostras_rastreador(integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sms_fechar_eventos_velocidade(integer) TO authenticated;

-- ─── 8. TRILHA DE AUDITORIA ─────────────────────────────────────────────────

DO $$ DECLARE tab text; BEGIN
  IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
    FOREACH tab IN ARRAY ARRAY['sms_zona_eventos'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.%I', tab);
      EXECUTE format('CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao()', tab);
    END LOOP;
  END IF;
END $$;

-- ─── 9. DOCUMENTAÇÃO ────────────────────────────────────────────────────────

COMMENT ON TABLE  public.sms_zona_eventos IS 'Sequência de amostras acima do teto de uma zona. Fechado vira passagem; curto demais é descartado com o motivo registrado.';
COMMENT ON COLUMN public.sms_zona_eventos.descartado_motivo IS 'Por que a sequência não virou passagem — o que permite calibrar amostras_minimas e duracao_minima_seg com dado real.';
COMMENT ON TABLE  public.sms_rastreador_estado IS 'Último fix processado por veículo. Torna a varredura de reconciliação idempotente.';
COMMENT ON FUNCTION public.sms_registrar_amostra_rastreador(integer, double precision, double precision, numeric, timestamptz, integer, numeric, boolean) IS 'Ingestão de uma posição do Traccar, em km/h (converta de nós antes). Devolve a decisão tomada.';
COMMENT ON FUNCTION public.sms_fechar_eventos_velocidade(integer) IS 'Fecha eventos sem amostra nova há p_ocioso_seg. Chamar junto da varredura de posições.';
COMMENT ON FUNCTION public.sms_registrar_amostras_rastreador(integer, jsonb) IS 'Ingestão em lote das posições de um veículo, em ordem cronológica. Uma chamada por veículo por varredura.';

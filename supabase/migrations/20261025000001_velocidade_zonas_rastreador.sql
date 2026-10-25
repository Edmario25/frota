-- ============================================================================
-- Controle de velocidade por rastreador (zonas GPS)
--
-- Acrescenta uma segunda fonte de medição ao módulo de velocidade, sem tocar no
-- caminho do radar fixo: o checkpoint continua medindo o instante da passagem, e
-- a zona passa a medir o trecho inteiro usando as posições que o Traccar já
-- recebe da frota.
--
-- Decisões desta migration:
--   · Passagem e infração continuam nas MESMAS tabelas. Radar tem checkpoint_id,
--     zona tem zona_id, e um CHECK garante exatamente um dos dois.
--   · Geometria em plpgsql puro (sem PostGIS): corredor é distância ao segmento,
--     polígono é ray casting. Precisão sobra para estrada interna.
--   · Zona nasce em 'observacao': registra passagem e NÃO gera infração. Só
--     depois de calibrar tolerância e buffer em campo se passa para 'autuacao'.
--   · Velocidade de GPS não é medição aferida como a do radar. Por isso a zona
--     não tem campo de calibração, e a tolerância padrão é maior.
--
-- Rodar inteiro, de uma vez, no SQL editor. Idempotente.
-- ============================================================================

-- ─── 1. ZONAS ───────────────────────────────────────────────────────────────
-- Corredor: linha do leito da estrada + buffer em metros de cada lado.
-- Polígono: área fechada (pátio, canteiro, entorno de aerogerador).

CREATE TABLE IF NOT EXISTS public.sms_zonas_velocidade (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id                uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome                   text NOT NULL,
  descricao              text,
  tipo                   text NOT NULL DEFAULT 'corredor'
                           CHECK (tipo IN ('corredor', 'poligono')),
  limite_velocidade_kmh  integer NOT NULL DEFAULT 40
                           CHECK (limite_velocidade_kmh BETWEEN 5 AND 200),
  -- Tolerância maior que a do radar: absorve o erro de velocidade do GPS.
  tolerancia_kmh         integer NOT NULL DEFAULT 5
                           CHECK (tolerancia_kmh BETWEEN 0 AND 30),
  -- Só vale para corredor: metade da largura da faixa considerada "na via".
  buffer_metros          integer NOT NULL DEFAULT 30
                           CHECK (buffer_metros BETWEEN 10 AND 200),
  -- Quantas amostras consecutivas acima do teto fecham uma infração. Uma
  -- amostra isolada é ruído de GPS, não excesso de velocidade.
  amostras_minimas       integer NOT NULL DEFAULT 2
                           CHECK (amostras_minimas BETWEEN 1 AND 10),
  duracao_minima_seg     integer NOT NULL DEFAULT 3
                           CHECK (duracao_minima_seg BETWEEN 0 AND 120),
  modo_operacao          text NOT NULL DEFAULT 'observacao'
                           CHECK (modo_operacao IN ('observacao', 'autuacao')),
  -- Vigência opcional por horário. inicio > fim atravessa a meia-noite.
  horario_inicio         time,
  horario_fim            time,
  -- Espelho da geofence no Traccar, quando a detecção é delegada a ele.
  traccar_geofence_id    integer,
  ativo                  boolean NOT NULL DEFAULT true,
  created_by             uuid REFERENCES auth.users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_zona_horario_par CHECK (
    (horario_inicio IS NULL) = (horario_fim IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_zonas_obra  ON public.sms_zonas_velocidade(obra_id);
CREATE INDEX IF NOT EXISTS idx_sms_zonas_ativo ON public.sms_zonas_velocidade(ativo) WHERE ativo;

-- ─── 2. VÉRTICES ────────────────────────────────────────────────────────────
-- Linha (corredor) ou anel (polígono), na ordem em que foram capturados.
-- Capturáveis dirigindo o trecho com o app, importados de GPX/KML ou digitados.

CREATE TABLE IF NOT EXISTS public.sms_zona_vertices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_id     uuid NOT NULL REFERENCES public.sms_zonas_velocidade(id) ON DELETE CASCADE,
  ordem       integer NOT NULL CHECK (ordem >= 0),
  latitude    numeric(10,7) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude   numeric(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  UNIQUE (zona_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_sms_zona_vertices_zona ON public.sms_zona_vertices(zona_id, ordem);

-- ─── 3. GEOMETRIA ───────────────────────────────────────────────────────────

-- Distância entre dois pontos, em metros (haversine).
CREATE OR REPLACE FUNCTION public.sms_distancia_metros(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(
    sqrt(
      pow(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      pow(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )
  );
$$;

-- Distância do ponto ao segmento, em metros. Projeção equirretangular em torno
-- do primeiro vértice: o erro é desprezível na escala de uma estrada interna.
CREATE OR REPLACE FUNCTION public.sms_distancia_ponto_segmento_m(
  p_lat  double precision, p_lng  double precision,
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) RETURNS double precision LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k_lat  constant double precision := 110540;          -- metros por grau de latitude
  k_lng  double precision;                              -- varia com o cosseno da latitude
  v_px double precision; v_py double precision;   -- ponto avaliado
  v_x1 double precision; v_y1 double precision;   -- início do segmento (origem local)
  v_x2 double precision; v_y2 double precision;   -- fim do segmento
  v_dx double precision; v_dy double precision;
  v_t  double precision;
BEGIN
  k_lng := 111320 * cos(radians(p_lat1));

  v_x1 := 0;                             v_y1 := 0;
  v_x2 := (p_lng2 - p_lng1) * k_lng;     v_y2 := (p_lat2 - p_lat1) * k_lat;
  v_px := (p_lng  - p_lng1) * k_lng;     v_py := (p_lat  - p_lat1) * k_lat;

  v_dx := v_x2 - v_x1;  v_dy := v_y2 - v_y1;

  IF v_dx = 0 AND v_dy = 0 THEN       -- segmento degenerado: distância ao vértice
    RETURN sqrt(v_px * v_px + v_py * v_py);
  END IF;

  v_t := ((v_px - v_x1) * v_dx + (v_py - v_y1) * v_dy) / (v_dx * v_dx + v_dy * v_dy);
  v_t := greatest(0, least(1, v_t));  -- projeta dentro do segmento

  RETURN sqrt(pow(v_px - (v_x1 + v_t * v_dx), 2) + pow(v_py - (v_y1 + v_t * v_dy), 2));
END $$;

-- Ponto dentro do polígono (ray casting sobre o anel de vértices).
CREATE OR REPLACE FUNCTION public.sms_ponto_em_poligono(
  p_zona_id uuid, p_lat double precision, p_lng double precision
) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_dentro boolean := false;
  v_lat_i double precision; v_lng_i double precision;
  v_lat_j double precision; v_lng_j double precision;
  v_lista double precision[][];
  v_n integer;
  i integer;
  j integer;
BEGIN
  SELECT array_agg(ARRAY[latitude::double precision, longitude::double precision] ORDER BY ordem)
  INTO v_lista
  FROM public.sms_zona_vertices WHERE zona_id = p_zona_id;

  IF v_lista IS NULL THEN RETURN false; END IF;
  v_n := array_length(v_lista, 1);
  IF v_n < 3 THEN RETURN false; END IF;

  j := v_n;
  FOR i IN 1..v_n LOOP
    v_lat_i := v_lista[i][1]; v_lng_i := v_lista[i][2];
    v_lat_j := v_lista[j][1]; v_lng_j := v_lista[j][2];

    IF ((v_lng_i > p_lng) <> (v_lng_j > p_lng))
       AND (p_lat < (v_lat_j - v_lat_i) * (p_lng - v_lng_i) / NULLIF(v_lng_j - v_lng_i, 0) + v_lat_i)
    THEN
      v_dentro := NOT v_dentro;
    END IF;
    j := i;
  END LOOP;

  RETURN v_dentro;
END $$;

-- A zona contém o ponto? Corredor compara com o buffer; polígono usa ray casting.
CREATE OR REPLACE FUNCTION public.sms_zona_contem_ponto(
  p_zona_id uuid, p_lat double precision, p_lng double precision
) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_tipo   text;
  v_buffer integer;
  v_minima double precision;
BEGIN
  SELECT tipo, buffer_metros INTO v_tipo, v_buffer
  FROM public.sms_zonas_velocidade WHERE id = p_zona_id;

  IF v_tipo IS NULL THEN RETURN false; END IF;
  IF v_tipo = 'poligono' THEN
    RETURN public.sms_ponto_em_poligono(p_zona_id, p_lat, p_lng);
  END IF;

  SELECT min(public.sms_distancia_ponto_segmento_m(
           p_lat, p_lng,
           a.latitude::double precision,  a.longitude::double precision,
           b.latitude::double precision,  b.longitude::double precision))
  INTO v_minima
  FROM public.sms_zona_vertices a
  JOIN public.sms_zona_vertices b
    ON b.zona_id = a.zona_id AND b.ordem = a.ordem + 1
  WHERE a.zona_id = p_zona_id;

  RETURN v_minima IS NOT NULL AND v_minima <= v_buffer;
END $$;

-- Em qual zona o ponto está, no momento informado. Zonas sobrepostas: vale a
-- mais restritiva, para a regra não depender da ordem de cadastro.
CREATE OR REPLACE FUNCTION public.sms_zona_do_ponto(
  p_obra_id uuid,
  p_lat     double precision,
  p_lng     double precision,
  p_momento timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT z.id
  FROM public.sms_zonas_velocidade z
  WHERE z.ativo
    AND (p_obra_id IS NULL OR z.obra_id = p_obra_id)
    AND (
      z.horario_inicio IS NULL
      OR (z.horario_inicio <= z.horario_fim
            AND (p_momento AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN z.horario_inicio AND z.horario_fim)
      OR (z.horario_inicio > z.horario_fim   -- janela que atravessa a meia-noite
            AND ((p_momento AT TIME ZONE 'America/Sao_Paulo')::time >= z.horario_inicio
              OR (p_momento AT TIME ZONE 'America/Sao_Paulo')::time <= z.horario_fim))
    )
    AND public.sms_zona_contem_ponto(z.id, p_lat, p_lng)
  ORDER BY z.limite_velocidade_kmh ASC, z.nome ASC
  LIMIT 1;
$$;

-- ─── 4. PASSAGEM E INFRAÇÃO ACEITAM AS DUAS FONTES ──────────────────────────
-- O radar continua gravando como sempre: checkpoint_id preenchido, zona_id nulo.

ALTER TABLE public.sms_checkpoint_passagens
  ALTER COLUMN checkpoint_id DROP NOT NULL;

ALTER TABLE public.sms_checkpoint_passagens
  ADD COLUMN IF NOT EXISTS zona_id  uuid REFERENCES public.sms_zonas_velocidade(id) ON DELETE CASCADE,
  -- Rastro que sustenta a infração de GPS: [{lat,lng,kmh,t,sat,hdop}, ...]
  ADD COLUMN IF NOT EXISTS amostras jsonb;

ALTER TABLE public.sms_checkpoint_passagens DROP CONSTRAINT IF EXISTS sms_passagem_origem_unica;
ALTER TABLE public.sms_checkpoint_passagens
  ADD CONSTRAINT sms_passagem_origem_unica
  CHECK ((checkpoint_id IS NOT NULL) <> (zona_id IS NOT NULL));

ALTER TABLE public.sms_checkpoint_passagens DROP CONSTRAINT IF EXISTS sms_passagem_amostras_lista;
ALTER TABLE public.sms_checkpoint_passagens
  ADD CONSTRAINT sms_passagem_amostras_lista
  CHECK (amostras IS NULL OR jsonb_typeof(amostras) = 'array');

-- 'rastreador' entra junto de 'dispositivo' (radar) e 'manual' (operador).
-- O check antigo nasceu inline, com nome gerado pelo banco: derruba pelo conteúdo.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM   pg_constraint con
    JOIN   pg_class rel ON rel.oid = con.conrelid
    JOIN   pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE  ns.nspname = 'public'
      AND  rel.relname = 'sms_checkpoint_passagens'
      AND  con.contype = 'c'
      AND  pg_get_constraintdef(con.oid) ILIKE '%origem%'
      AND  pg_get_constraintdef(con.oid) ILIKE '%dispositivo%'
  LOOP
    EXECUTE format('ALTER TABLE public.sms_checkpoint_passagens DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.sms_checkpoint_passagens
  ADD CONSTRAINT sms_checkpoint_passagens_origem_check
  CHECK (origem IN ('dispositivo', 'manual', 'rastreador'));

CREATE INDEX IF NOT EXISTS idx_sms_passagens_zona ON public.sms_checkpoint_passagens(zona_id, detectado_em DESC)
  WHERE zona_id IS NOT NULL;

ALTER TABLE public.sms_infracoes_velocidade
  ALTER COLUMN checkpoint_id DROP NOT NULL;

ALTER TABLE public.sms_infracoes_velocidade
  ADD COLUMN IF NOT EXISTS zona_id uuid REFERENCES public.sms_zonas_velocidade(id) ON DELETE CASCADE;

ALTER TABLE public.sms_infracoes_velocidade DROP CONSTRAINT IF EXISTS sms_infracao_origem_unica;
ALTER TABLE public.sms_infracoes_velocidade
  ADD CONSTRAINT sms_infracao_origem_unica
  CHECK ((checkpoint_id IS NOT NULL) <> (zona_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_sms_infracoes_zona ON public.sms_infracoes_velocidade(zona_id)
  WHERE zona_id IS NOT NULL;

-- ─── 5. TRIGGER DE GRAVIDADE — AGORA COM DUAS FONTES ────────────────────────
-- Comportamento do radar idêntico ao anterior. A zona acrescenta duas regras:
-- a tolerância é a dela, e em modo 'observacao' a passagem fica registrada sem
-- gerar infração.

CREATE OR REPLACE FUNCTION public.sms_fn_gerar_infracao_velocidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tolerancia integer;
  v_obra_id    uuid;
  v_autua      boolean := true;
  v_teto       numeric;
  v_excesso    numeric;
  v_pct        numeric;
  v_gravidade  text;
BEGIN
  IF NEW.checkpoint_id IS NOT NULL THEN
    SELECT c.tolerancia_kmh, c.obra_id
    INTO   v_tolerancia, v_obra_id
    FROM   public.sms_checkpoints c
    WHERE  c.id = NEW.checkpoint_id;
  ELSIF NEW.zona_id IS NOT NULL THEN
    SELECT z.tolerancia_kmh, z.obra_id, (z.modo_operacao = 'autuacao')
    INTO   v_tolerancia, v_obra_id, v_autua
    FROM   public.sms_zonas_velocidade z
    WHERE  z.id = NEW.zona_id;
  ELSE
    RETURN NEW;
  END IF;

  v_teto := NEW.limite_no_momento + COALESCE(v_tolerancia, 0);

  -- Dentro do limite (com tolerância): passagem normal, sem infração
  IF NEW.velocidade_kmh <= v_teto THEN
    RETURN NEW;
  END IF;

  -- Zona em observação: mede e registra, mas não autua
  IF NOT v_autua THEN
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
    passagem_id, checkpoint_id, zona_id, obra_id, vehicle_id, motorista_id,
    velocidade_kmh, limite_kmh, excesso_kmh, excesso_percentual, gravidade
  ) VALUES (
    NEW.id, NEW.checkpoint_id, NEW.zona_id, v_obra_id, NEW.vehicle_id, NEW.motorista_id,
    NEW.velocidade_kmh, NEW.limite_no_momento, v_excesso, v_pct, v_gravidade
  )
  ON CONFLICT (passagem_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ─── 6. PERMISSÕES ──────────────────────────────────────────────────────────
-- Mesma regra de autorização do resto do módulo: sempre limitada à obra.

ALTER TABLE public.sms_zonas_velocidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_zona_vertices    ENABLE ROW LEVEL SECURITY;

-- Leitura na mesma regra do sms_checkpoints_select: SMS e contrato veem tudo,
-- gestor de obra vê as zonas das obras dele.
DROP POLICY IF EXISTS "sms_zonas_read" ON public.sms_zonas_velocidade;
CREATE POLICY "sms_zonas_read" ON public.sms_zonas_velocidade FOR SELECT TO authenticated
  USING (public.is_gestor_contrato() OR public.is_tecnico_sms()
    OR obra_id IN (SELECT public.get_my_obra_ids()));

DROP POLICY IF EXISTS "sms_zonas_write" ON public.sms_zonas_velocidade;
CREATE POLICY "sms_zonas_write" ON public.sms_zonas_velocidade FOR ALL TO authenticated
  USING (public.sms_velocidade_pode_gerir(obra_id))
  WITH CHECK (public.sms_velocidade_pode_gerir(obra_id));

DROP POLICY IF EXISTS "sms_zona_vertices_read" ON public.sms_zona_vertices;
CREATE POLICY "sms_zona_vertices_read" ON public.sms_zona_vertices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sms_zonas_velocidade z
                 WHERE z.id = zona_id
                   AND (public.is_gestor_contrato() OR public.is_tecnico_sms()
                        OR z.obra_id IN (SELECT public.get_my_obra_ids()))));

DROP POLICY IF EXISTS "sms_zona_vertices_write" ON public.sms_zona_vertices;
CREATE POLICY "sms_zona_vertices_write" ON public.sms_zona_vertices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sms_zonas_velocidade z
                 WHERE z.id = zona_id AND public.sms_velocidade_pode_gerir(z.obra_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sms_zonas_velocidade z
                 WHERE z.id = zona_id AND public.sms_velocidade_pode_gerir(z.obra_id)));

-- A política anterior exigia checkpoint; agora aceita a zona também.
DROP POLICY IF EXISTS "sms_passagens_insert" ON public.sms_checkpoint_passagens;
CREATE POLICY "sms_passagens_insert" ON public.sms_checkpoint_passagens FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.sms_checkpoints c
            WHERE c.id = checkpoint_id AND public.sms_velocidade_pode_gerir(c.obra_id))
    OR EXISTS (SELECT 1 FROM public.sms_zonas_velocidade z
            WHERE z.id = zona_id AND public.sms_velocidade_pode_gerir(z.obra_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_zonas_velocidade TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_zona_vertices    TO authenticated;

REVOKE ALL ON FUNCTION public.sms_zona_contem_ponto(uuid, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sms_zona_do_ponto(uuid, double precision, double precision, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_zona_contem_ponto(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sms_zona_do_ponto(uuid, double precision, double precision, timestamptz) TO authenticated;

-- ─── 7. TRILHA DE AUDITORIA ─────────────────────────────────────────────────

DO $$ DECLARE tab text; BEGIN
  IF to_regprocedure('public.auditoria_capturar_alteracao()') IS NOT NULL THEN
    FOREACH tab IN ARRAY ARRAY['sms_zonas_velocidade','sms_zona_vertices'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_sistema ON public.%I', tab);
      EXECUTE format('CREATE TRIGGER trg_auditoria_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditoria_capturar_alteracao()', tab);
    END LOOP;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_sms_zonas_updated_at ON public.sms_zonas_velocidade;
CREATE TRIGGER trg_sms_zonas_updated_at
  BEFORE UPDATE ON public.sms_zonas_velocidade
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── 8. DOCUMENTAÇÃO ────────────────────────────────────────────────────────

COMMENT ON TABLE  public.sms_zonas_velocidade IS 'Trechos com limite de velocidade medidos pelo rastreador GPS, alternativa ao radar fixo. Velocidade de GPS não é medição aferida: serve para gestão de comportamento, não para autuação metrológica.';
COMMENT ON COLUMN public.sms_zonas_velocidade.modo_operacao IS 'observacao registra a passagem sem gerar infração — usar nas primeiras semanas para calibrar tolerância e buffer; autuacao liga a infração automática.';
COMMENT ON COLUMN public.sms_zonas_velocidade.buffer_metros IS 'Meia-largura da faixa considerada dentro da via, em metros. Compensa o erro de posição do GPS (5–15 m); 30 m é o ponto de partida.';
COMMENT ON COLUMN public.sms_zonas_velocidade.amostras_minimas IS 'Amostras consecutivas acima do teto necessárias para fechar infração. Uma amostra isolada é ruído.';
COMMENT ON COLUMN public.sms_zonas_velocidade.traccar_geofence_id IS 'Geofence espelhada no Traccar quando a detecção é delegada ao servidor GPS.';
COMMENT ON TABLE  public.sms_zona_vertices IS 'Linha do corredor ou anel do polígono, na ordem de captura.';
COMMENT ON COLUMN public.sms_checkpoint_passagens.zona_id IS 'Preenchido quando a medição vem do rastreador; mutuamente exclusivo com checkpoint_id.';
COMMENT ON COLUMN public.sms_checkpoint_passagens.amostras IS 'Rastro de posições que sustenta a infração de GPS: [{lat,lng,kmh,t,sat,hdop}]. É a evidência equivalente à foto do radar.';
COMMENT ON FUNCTION public.sms_zona_do_ponto(uuid, double precision, double precision, timestamptz) IS 'Zona vigente que contém o ponto. Em sobreposição, vale a de menor limite.';

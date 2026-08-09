-- ============================================================
-- Chat entre motorista e gestor
-- ============================================================

-- Tabela de conversas (uma por motorista)
CREATE TABLE IF NOT EXISTS public.chat_conversas (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id        UUID        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  criada_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_mensagem_em  TIMESTAMPTZ,
  ultima_mensagem     TEXT,
  nao_lidas_motorista INT         NOT NULL DEFAULT 0,
  nao_lidas_gestor    INT         NOT NULL DEFAULT 0
);

-- Uma conversa por motorista
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversas_motorista_unique
  ON public.chat_conversas(motorista_id);

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS public.chat_mensagens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  UUID        NOT NULL REFERENCES public.chat_conversas(id) ON DELETE CASCADE,
  autor_id     UUID        NOT NULL,
  tipo_autor   TEXT        NOT NULL CHECK (tipo_autor IN ('motorista', 'gestor')),
  mensagem     TEXT        NOT NULL,
  lida         BOOLEAN     NOT NULL DEFAULT false,
  criada_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_mensagens_conversa_idx
  ON public.chat_mensagens(conversa_id, criada_em DESC);

-- RLS (controle de acesso no app, mas exige autenticação)
ALTER TABLE public.chat_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversas_all" ON public.chat_conversas;
CREATE POLICY "chat_conversas_all" ON public.chat_conversas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_mensagens_all" ON public.chat_mensagens;
CREATE POLICY "chat_mensagens_all" ON public.chat_mensagens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;

-- Trigger: atualiza metadados e contadores de não lidas ao inserir mensagem
CREATE OR REPLACE FUNCTION public.chat_on_mensagem_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_conversas
  SET
    ultima_mensagem     = NEW.mensagem,
    ultima_mensagem_em  = NEW.criada_em,
    nao_lidas_motorista = CASE
      WHEN NEW.tipo_autor = 'gestor'    THEN nao_lidas_motorista + 1
      ELSE nao_lidas_motorista
    END,
    nao_lidas_gestor    = CASE
      WHEN NEW.tipo_autor = 'motorista' THEN nao_lidas_gestor + 1
      ELSE nao_lidas_gestor
    END
  WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chat_mensagem_insert ON public.chat_mensagens;
CREATE TRIGGER trg_chat_mensagem_insert
  AFTER INSERT ON public.chat_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.chat_on_mensagem_insert();

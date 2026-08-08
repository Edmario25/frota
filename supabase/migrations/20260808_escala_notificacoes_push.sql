-- ============================================================
-- Migration: Notificações de escala + Push subscriptions
-- Data: 08/08/2026
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- ── 1. Tabela de notificações de escala ─────────────────────
CREATE TABLE IF NOT EXISTS public.escala_notificacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  periodo_id  uuid REFERENCES public.escala_periodos(id) ON DELETE SET NULL,
  tipo        text NOT NULL CHECK (tipo IN (
                'folga_proxima', 'folga_atrasada',
                'escala_remarcada', 'conflito_autorizado'
              )),
  titulo      text NOT NULL,
  mensagem    text NOT NULL,
  lida        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.escala_notificacoes ENABLE ROW LEVEL SECURITY;

-- Funcionário vê suas próprias notificações
CREATE POLICY "notif_select_own" ON public.escala_notificacoes
  FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- Qualquer autenticado pode inserir (gestores criam notificações)
CREATE POLICY "notif_insert_auth" ON public.escala_notificacoes
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Funcionário marca suas próprias como lidas
CREATE POLICY "notif_update_own" ON public.escala_notificacoes
  FOR UPDATE TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- Realtime: habilitar para que o app receba mudanças em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.escala_notificacoes;


-- ── 2. Tabela de push subscriptions ────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth_key   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuário gerencia suas próprias subscriptions
CREATE POLICY "push_own" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

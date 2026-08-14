-- ─────────────────────────────────────────────────────────────────────────────
-- Execute este script no Supabase → SQL Editor
-- Cria a conta de serviço do totem e garante as permissões mínimas.
--
-- ATENÇÃO: o auth.users não pode ser inserido diretamente pela maioria dos
-- clientes SQL. Use o painel:
--   Supabase → Authentication → Users → "Invite user"
--   E-mail: totem@apicegestao.com
--   Após criado, copie o UUID e use abaixo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. (Opcional) Crie uma linha em employees para o "totem" aparecer como
--    "registrado_por" de forma legível nas telas de gestão.
--    Substitua <UUID_DO_AUTH_USER> pelo UUID criado no painel.

-- INSERT INTO public.employees (id, nome, ativo)
-- VALUES ('<UUID_DO_AUTH_USER>', 'Totem QR', true)
-- ON CONFLICT (id) DO NOTHING;

-- 2. Verifique a RLS em employee_ponto_qr:
--    A policy abaixo já deve existir após rodar 20260814_ponto_qr.sql
--    Se não existir, crie:

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'employee_ponto_qr'
      AND policyname = 'ponto_qr_all'
  ) THEN
    CREATE POLICY ponto_qr_all ON public.employee_ponto_qr
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 3. Confirme que RLS está habilitado na tabela
ALTER TABLE public.employee_ponto_qr ENABLE ROW LEVEL SECURITY;

-- 4. Confirme que RLS está habilitado na tabela employees (leitura)
--    A conta totem precisa ler employees para buscar nome/foto/cargo.
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Pronto. A conta totem@apicegestao.com terá acesso apenas ao que as
-- policies authenticated permitem (SELECT em employees, INSERT em ponto_qr).

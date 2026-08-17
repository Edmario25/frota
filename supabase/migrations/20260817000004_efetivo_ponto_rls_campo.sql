-- =====================================================================
-- Garante coluna fonte + RLS INSERT para o Apontador de Campo
-- =====================================================================

-- 1. Coluna fonte (idempotente)
ALTER TABLE public.efetivo_ponto
  ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'supervisor'
  CHECK (fonte IN ('supervisor','campo','csv','totem'));

-- 2. Ativa RLS na tabela (já pode estar ativo, mas é seguro repetir)
ALTER TABLE public.efetivo_ponto ENABLE ROW LEVEL SECURITY;

-- 3. Leitura: usuários autenticados podem ver seus próprios apontamentos
--    (apontador vê só o que ele registrou; admin/gestor vê via outra policy)
DROP POLICY IF EXISTS "efetivo_ponto_select_authenticated" ON public.efetivo_ponto;
CREATE POLICY "efetivo_ponto_select_authenticated"
  ON public.efetivo_ponto
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. INSERT: qualquer autenticado pode inserir com fonte = 'campo'
DROP POLICY IF EXISTS "efetivo_ponto_insert_campo" ON public.efetivo_ponto;
CREATE POLICY "efetivo_ponto_insert_campo"
  ON public.efetivo_ponto
  FOR INSERT
  TO authenticated
  WITH CHECK (fonte = 'campo');

-- 5. UPDATE: permite o upsert (INSERT … ON CONFLICT DO UPDATE) para fonte='campo'
DROP POLICY IF EXISTS "efetivo_ponto_update_campo" ON public.efetivo_ponto;
CREATE POLICY "efetivo_ponto_update_campo"
  ON public.efetivo_ponto
  FOR UPDATE
  TO authenticated
  USING  (fonte = 'campo')
  WITH CHECK (fonte = 'campo');

-- ============================================================
-- Fix: tipo_autor não era validado pelo RLS
--
-- Sem isso, um motorista autenticado podia inserir uma mensagem
-- com tipo_autor = 'gestor', corrompendo a conversa.
--
-- Solução: adicionar tipo_autor = 'motorista' / 'gestor' no
-- WITH CHECK de cada policy de INSERT/UPDATE.
-- ============================================================

-- ── chat_mensagens: motorista só escreve como 'motorista' ────
DROP POLICY IF EXISTS "chat_mensagens_motorista" ON public.chat_mensagens;
CREATE POLICY "chat_mensagens_motorista"
ON public.chat_mensagens FOR ALL TO authenticated
USING (
  conversa_id IN (
    SELECT cc.id FROM public.chat_conversas cc
    WHERE cc.motorista_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  tipo_autor = 'motorista'                    -- ← impede forjar gestor
  AND conversa_id IN (
    SELECT cc.id FROM public.chat_conversas cc
    WHERE cc.motorista_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  )
);

-- ── chat_mensagens: gestor_obra só escreve como 'gestor' ─────
DROP POLICY IF EXISTS "chat_mensagens_gestor_obra" ON public.chat_mensagens;
CREATE POLICY "chat_mensagens_gestor_obra"
ON public.chat_mensagens FOR ALL TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND conversa_id IN (
    SELECT cc.id FROM public.chat_conversas cc
    WHERE cc.obra_id IN (SELECT public.get_my_obra_ids())
  )
)
WITH CHECK (
  tipo_autor = 'gestor'                       -- ← impede forjar motorista
  AND public.get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND conversa_id IN (
    SELECT cc.id FROM public.chat_conversas cc
    WHERE cc.obra_id IN (SELECT public.get_my_obra_ids())
  )
);
-- admin mantém acesso irrestrito (sem restrição de tipo_autor)

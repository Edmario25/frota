-- ============================================================
-- Chat: RLS por obra
--
-- Regras:
--   - Motorista (funcionário): vê SOMENTE sua própria conversa
--   - Gestor de obra: vê SOMENTE conversas de funcionários da sua obra
--   - Admin: acesso total
--   - gestor_contrato / gestor_frota: SEM ACESSO
-- ============================================================

-- 1. Adiciona obra_id à tabela de conversas (nullable → conversa existe mesmo sem obra)
ALTER TABLE public.chat_conversas
  ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES public.obras(id) ON DELETE SET NULL;

-- 2. Trigger: preenche obra_id automaticamente ao criar a conversa
CREATE OR REPLACE FUNCTION public.chat_set_obra_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Busca a obra ativa mais recente do motorista
  SELECT of1.obra_id INTO NEW.obra_id
  FROM public.obra_funcionarios of1
  WHERE of1.employee_id = NEW.motorista_id
    AND of1.status = true
  ORDER BY of1.created_at DESC
  LIMIT 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chat_set_obra_id ON public.chat_conversas;
CREATE TRIGGER trg_chat_set_obra_id
  BEFORE INSERT ON public.chat_conversas
  FOR EACH ROW EXECUTE FUNCTION public.chat_set_obra_id();

-- 3. Preenche obra_id nas conversas já existentes
UPDATE public.chat_conversas cc
SET obra_id = (
  SELECT of1.obra_id
  FROM public.obra_funcionarios of1
  WHERE of1.employee_id = cc.motorista_id
    AND of1.status = true
  ORDER BY of1.created_at DESC
  LIMIT 1
)
WHERE cc.obra_id IS NULL;

-- 4. Remove policies permissivas antigas
DROP POLICY IF EXISTS "chat_conversas_all" ON public.chat_conversas;
DROP POLICY IF EXISTS "chat_mensagens_all" ON public.chat_mensagens;

-- ── Novas policies para chat_conversas ──────────────────────────────────────

-- Motorista: vê apenas sua própria conversa
CREATE POLICY "chat_conversas_motorista"
ON public.chat_conversas FOR ALL TO authenticated
USING (
  motorista_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  motorista_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  )
);

-- Gestor de obra: vê conversas cujo obra_id está entre as obras dele
CREATE POLICY "chat_conversas_gestor_obra"
ON public.chat_conversas FOR ALL TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND obra_id IN (SELECT public.get_my_obra_ids())
)
WITH CHECK (
  public.get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND obra_id IN (SELECT public.get_my_obra_ids())
);

-- Admin: acesso total
CREATE POLICY "chat_conversas_admin"
ON public.chat_conversas FOR ALL TO authenticated
USING  (public.get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (public.get_user_role(auth.uid()) = 'admin'::app_role);

-- ── Novas policies para chat_mensagens ──────────────────────────────────────

-- Motorista: acessa mensagens da sua própria conversa
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
  conversa_id IN (
    SELECT cc.id FROM public.chat_conversas cc
    WHERE cc.motorista_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  )
);

-- Gestor de obra: acessa mensagens das conversas da sua obra
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
  public.get_user_role(auth.uid()) = 'gestor_obra'::app_role
  AND conversa_id IN (
    SELECT cc.id FROM public.chat_conversas cc
    WHERE cc.obra_id IN (SELECT public.get_my_obra_ids())
  )
);

-- Admin: acesso total
CREATE POLICY "chat_mensagens_admin"
ON public.chat_mensagens FOR ALL TO authenticated
USING  (public.get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (public.get_user_role(auth.uid()) = 'admin'::app_role);

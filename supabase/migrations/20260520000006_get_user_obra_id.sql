-- =====================================================================
-- Função auxiliar: retorna o obra_id do usuário autenticado
-- Usada nas RLS policies (fundo_fixo, veículos, etc.)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_user_obra_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT of1.obra_id
  FROM public.obra_funcionarios of1
  JOIN public.employees e ON e.id = of1.employee_id
  WHERE e.user_id = auth.uid()
    AND of1.status = true
  ORDER BY of1.created_at DESC
  LIMIT 1;
$$;

-- =====================================================================
-- RPC pública: retorna obra_id + nome para o frontend usar no hook
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_my_obra()
RETURNS TABLE(obra_id uuid, obra_nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id AS obra_id, o.nome AS obra_nome
  FROM public.obra_funcionarios of1
  JOIN public.employees e   ON e.id  = of1.employee_id
  JOIN public.obras      o  ON o.id  = of1.obra_id
  WHERE e.user_id = auth.uid()
    AND of1.status = true
  ORDER BY of1.created_at DESC
  LIMIT 1;
$$;

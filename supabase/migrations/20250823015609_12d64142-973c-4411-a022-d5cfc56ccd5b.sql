-- Remove a FK de profiles.user_id → auth.users para permitir perfis gerenciados pela aplicação
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- Inserção de usuário de teste ignorada em produção.

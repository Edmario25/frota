-- Auditoria somente leitura para executar no SQL Editor do Supabase.
-- O resultado reflete o estado efetivamente aplicado, ao contrário de uma
-- busca textual no histórico de migrations.

-- 1. Tabelas públicas sem RLS habilitado.
select schemaname, tablename
from pg_tables
where schemaname = 'public'
  and not rowsecurity
order by tablename;

-- 2. Tabelas com RLS, mas sem política (ficam inacessíveis via API comum).
select t.schemaname, t.tablename
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname
 and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.rowsecurity
group by t.schemaname, t.tablename
having count(p.policyname) = 0
order by t.tablename;

-- 3. Políticas permissivas para qualquer usuário autenticado.
-- Revisar principalmente ALL/INSERT/UPDATE/DELETE e dados pessoais/financeiros.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and 'authenticated' = any(roles)
  and (
    regexp_replace(coalesce(qual, ''), '[[:space:]]', '', 'g') in ('true', '(true)')
    or regexp_replace(coalesce(with_check, ''), '[[:space:]]', '', 'g') in ('true', '(true)')
  )
order by tablename, cmd, policyname;

-- 4. Políticas concedidas explicitamente a anon ou public.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and (roles && array['anon', 'public']::name[])
order by tablename, cmd, policyname;

-- 5. Funções SECURITY DEFINER e sua configuração de search_path.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- 6. Funções públicas executáveis por anon/public.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('public', p.oid, 'EXECUTE')
  )
order by p.proname;

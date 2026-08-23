-- Exportação consolidada da auditoria de segurança.
-- Execute este arquivo inteiro no SQL Editor e copie a única célula JSON.

select jsonb_pretty(jsonb_build_object(
  'generated_at', now(),
  'tables_without_rls', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', t.schemaname,
      'table', t.tablename
    ) order by t.tablename)
    from pg_tables t
    where t.schemaname = 'public'
      and not t.rowsecurity
  ), '[]'::jsonb),
  'rls_tables_without_policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', missing.schemaname,
      'table', missing.tablename
    ) order by missing.tablename)
    from (
      select t.schemaname, t.tablename
      from pg_tables t
      left join pg_policies p
        on p.schemaname = t.schemaname
       and p.tablename = t.tablename
      where t.schemaname = 'public'
        and t.rowsecurity
      group by t.schemaname, t.tablename
      having count(p.policyname) = 0
    ) missing
  ), '[]'::jsonb),
  'permissive_authenticated_policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', p.tablename,
      'policy', p.policyname,
      'command', p.cmd,
      'using', p.qual,
      'with_check', p.with_check
    ) order by p.tablename, p.cmd, p.policyname)
    from pg_policies p
    where p.schemaname = 'public'
      and 'authenticated' = any(p.roles)
      and (
        regexp_replace(coalesce(p.qual, ''), '[[:space:]]', '', 'g') in ('true', '(true)')
        or regexp_replace(coalesce(p.with_check, ''), '[[:space:]]', '', 'g') in ('true', '(true)')
      )
  ), '[]'::jsonb),
  'anon_or_public_policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', p.tablename,
      'policy', p.policyname,
      'command', p.cmd,
      'roles', p.roles,
      'using', p.qual,
      'with_check', p.with_check
    ) order by p.tablename, p.cmd, p.policyname)
    from pg_policies p
    where p.schemaname = 'public'
      and p.roles && array['anon', 'public']::name[]
  ), '[]'::jsonb),
  'security_definer_functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'function', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'configuration', p.proconfig,
      'owner', pg_get_userbyid(p.proowner)
    ) order by p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  ), '[]'::jsonb)
)) as security_audit;

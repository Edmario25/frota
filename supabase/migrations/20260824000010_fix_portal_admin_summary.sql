-- Corrige a view administrativa criada como security_invoker.
-- A view-base teve o acesso revogado; por isso a view segura retornava permission denied.

ALTER VIEW public.v_portal_resumo_seguro SET (security_invoker = false);
REVOKE ALL ON public.v_portal_resumo FROM authenticated;
GRANT SELECT ON public.v_portal_resumo_seguro TO authenticated;

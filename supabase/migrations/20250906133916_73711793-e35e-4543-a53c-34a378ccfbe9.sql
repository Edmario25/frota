-- Fix security vulnerabilities in profiles table
-- Drop existing overly permissive policies that allow public access
DROP POLICY "Admins can view all profiles" ON public.profiles;
DROP POLICY "Users can update their own profile" ON public.profiles;
DROP POLICY "Users can view their own profile" ON public.profiles;

-- Create secure policies that require authentication
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Also fix any remaining vulnerabilities in system_logs table
-- Ensure only admins can access system logs
DROP POLICY IF EXISTS "Only admins can view system logs" ON public.system_logs;
DROP POLICY IF EXISTS "Only admins can view system logs" ON public.system_logs;
CREATE POLICY "Only admins can view system logs"
ON public.system_logs
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- Confirm emails for registered employees (corrected)
UPDATE auth.users 
SET 
  email_confirmed_at = NOW(),
  updated_at = NOW()
WHERE email IN ('edimario.ribeiro@conexx.net.br', 'arthur@conexx.net.br') 
  AND email_confirmed_at IS NULL;
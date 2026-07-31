-- Reset admin password in auth.users
-- Note: This will update the password hash to match "123456"

UPDATE auth.users 
SET 
  encrypted_password = crypt('123456', gen_salt('bf')),
  updated_at = NOW()
WHERE email = 'admin@teste.com';
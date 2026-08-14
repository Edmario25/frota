-- Adiciona coluna de controle de acesso ao App SMS Campo
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS acesso_app_sms boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN employees.acesso_app_sms IS
  'Autoriza o funcionário a acessar /app-sms (App SMS Campo para técnicos de segurança)';

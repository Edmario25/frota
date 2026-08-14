-- Adiciona coluna de controle de acesso ao App SMS Campo
-- DEFAULT true: quem já tem conta não é bloqueado de imediato.
-- O admin desmarca no gerencial para revogar o acesso.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS acesso_app_sms boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN employees.acesso_app_sms IS
  'Autoriza o funcionário a acessar /app-sms (App SMS Campo para técnicos de segurança)';

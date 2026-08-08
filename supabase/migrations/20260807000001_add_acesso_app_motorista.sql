-- Adiciona flag de acesso ao app do motorista no cadastro de funcionários
-- Permite que qualquer cargo (gestor, admin, etc.) acesse o /app se habilitado

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS acesso_app_motorista boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN employees.acesso_app_motorista
  IS 'Permite acesso ao app mobile do motorista independente do cargo';

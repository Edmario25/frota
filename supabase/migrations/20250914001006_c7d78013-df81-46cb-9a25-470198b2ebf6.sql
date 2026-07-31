-- Atualizar a constraint do campo tipo_acesso na tabela employees
-- Remover a constraint antiga se existir
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_tipo_acesso_check;

-- Adicionar nova constraint com os valores atualizados
ALTER TABLE employees 
ADD CONSTRAINT employees_tipo_acesso_check 
CHECK (tipo_acesso IN ('gestor_geral', 'gestor_obra', 'colaborador'));

-- Atualizar registros existentes que possam ter valores antigos
UPDATE employees 
SET tipo_acesso = 'gestor_geral' 
WHERE tipo_acesso = 'admin';

UPDATE employees 
SET tipo_acesso = 'colaborador' 
WHERE tipo_acesso NOT IN ('gestor_geral', 'gestor_obra', 'colaborador');
-- Adiciona nível de acesso ao cargo
-- A permissão do funcionário passa a ser definida pelo cargo, não manualmente

ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS nivel_acesso text NOT NULL DEFAULT 'funcionario'
  CHECK (nivel_acesso IN ('funcionario', 'gestor_obra', 'gestor_contrato'));

-- Atualizar banco_completo.sql também deve incluir essa coluna
-- Execute no Supabase Studio > SQL Editor

-- Adicionar novos campos para a Escala Ringelmann no teste de fumaça
ALTER TABLE smoke_tests 
ADD COLUMN motor_tipo text,
ADD COLUMN quilometragem_atual integer,
ADD COLUMN data_hora_teste timestamp with time zone DEFAULT now(),
ADD COLUMN distancia_observador integer,
ADD COLUMN indice_ringelmann integer CHECK (indice_ringelmann >= 1 AND indice_ringelmann <= 5),
ADD COLUMN densidade_percentual integer,
ADD COLUMN dentro_limite boolean,
ADD COLUMN evidencias_url text,
ADD COLUMN condicoes_teste text DEFAULT 'Veículo em movimento com carga no motor, fumaça contínua por no mínimo 5 segundos';

-- Atualizar registros existentes com valores padrão
UPDATE smoke_tests 
SET 
    motor_tipo = 'diesel',
    quilometragem_atual = 0,
    data_hora_teste = created_at,
    distancia_observador = 30,
    indice_ringelmann = 1,
    densidade_percentual = 20,
    dentro_limite = true
WHERE motor_tipo IS NULL;
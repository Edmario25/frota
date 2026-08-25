-- Regras mínimas de integridade para escalas e folgas.
-- Evita que gravações externas ao frontend criem ciclos impossíveis.

ALTER TABLE public.escala_tipos
  ADD CONSTRAINT escala_tipos_dias_trabalho_positivo CHECK (dias_trabalho > 0),
  ADD CONSTRAINT escala_tipos_dias_folga_positivo CHECK (dias_folga > 0);

ALTER TABLE public.escala_periodos
  ADD CONSTRAINT escala_periodos_datas_validas CHECK (
    data_fim_trabalho >= data_inicio_trabalho
    AND data_inicio_folga > data_fim_trabalho
    AND data_fim_folga >= data_inicio_folga
  ),
  ADD CONSTRAINT escala_periodos_status_valido CHECK (
    status IN ('agendado', 'em_folga', 'concluido', 'cancelado')
  );

CREATE INDEX IF NOT EXISTS escala_periodos_employee_datas_idx
  ON public.escala_periodos(employee_id, data_inicio_trabalho, data_fim_folga);

CREATE INDEX IF NOT EXISTS escala_periodos_status_folga_idx
  ON public.escala_periodos(status, data_inicio_folga, data_fim_folga);

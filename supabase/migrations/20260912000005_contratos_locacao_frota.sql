-- Frota locada: fornecedor único, regras de cobrança e custos automáticos por obra.
-- rental_companies permanece apenas como legado; novos contratos usam fornecedores.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_contrato_locacao text,
  ADD COLUMN IF NOT EXISTS data_inicio_locacao date,
  ADD COLUMN IF NOT EXISTS data_fim_locacao date,
  ADD COLUMN IF NOT EXISTS franquia_km_mensal numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_km_excedente numeric(14,4),
  ADD COLUMN IF NOT EXISTS franquia_horas_mensal numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_hora_excedente numeric(14,4);

ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_locacao_valores_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_locacao_valores_check CHECK (
    COALESCE(valor_aluguel_mensal,0)>=0
    AND COALESCE(franquia_km_mensal,0)>=0
    AND COALESCE(valor_km_excedente,0)>=0
    AND COALESCE(franquia_horas_mensal,0)>=0
    AND COALESCE(valor_hora_excedente,0)>=0
    AND (data_fim_locacao IS NULL OR data_inicio_locacao IS NULL OR data_fim_locacao>=data_inicio_locacao)
  );

CREATE INDEX IF NOT EXISTS vehicles_fornecedor_locacao_idx ON public.vehicles(fornecedor_id)
  WHERE fornecedor_id IS NOT NULL;

-- Migra locadoras já cadastradas para o cadastro corporativo de fornecedores,
-- preservando os veículos legados que ainda apontam para rental_companies.
INSERT INTO public.fornecedores(nome,cnpj,telefone,email,endereco,observacoes,tipo_fornecedor,status)
SELECT r.nome,r.cnpj,r.telefone,r.email,r.endereco,
  COALESCE(r.observacoes,'Migrado do cadastro legado de locadoras'),'servicos','ativo'
FROM public.rental_companies r
WHERE NOT EXISTS (
  SELECT 1 FROM public.fornecedores f
  WHERE lower(f.nome)=lower(r.nome) AND f.cnpj IS NOT DISTINCT FROM r.cnpj
);

UPDATE public.vehicles v
SET fornecedor_id=f.id
FROM public.rental_companies r
JOIN public.fornecedores f ON lower(f.nome)=lower(r.nome) AND f.cnpj IS NOT DISTINCT FROM r.cnpj
WHERE v.rental_company_id=r.id AND v.fornecedor_id IS NULL;

-- Custo variável para veículos medidos por KM. O ciclo de quilometragem é a
-- fonte da medição; a franquia e a tarifa pertencem ao contrato do veículo.
CREATE OR REPLACE VIEW public.v_frota_custos_obra WITH (security_invoker=true) AS
SELECT m.id::text referencia_id,m.obra_id,COALESCE(m.data_realizada,m.data_agendada) data_lancamento,
  'Manutenção: '||v.placa||' · '||m.descricao descricao,m.custo::numeric valor,'manutencao' origem
FROM public.maintenance_records m JOIN public.vehicles v ON v.id=m.vehicle_id WHERE m.obra_id IS NOT NULL AND m.status='concluida' AND m.custo>0
UNION ALL SELECT f.id::text,f.obra_id,f.data_abastecimento,'Combustível: '||v.placa,f.valor_total,'combustivel' FROM public.vehicle_fuel_logs f JOIN public.vehicles v ON v.id=f.vehicle_id WHERE f.obra_id IS NOT NULL AND f.valor_total>0
UNION ALL SELECT w.id::text,w.obra_id,w.data_lavagem,'Lavagem: '||v.placa,w.valor,'lavagem' FROM public.wash_records w JOIN public.vehicles v ON v.id=w.vehicle_id WHERE w.obra_id IS NOT NULL AND w.valor>0
UNION ALL SELECT t.id::text,t.obra_id,t.data_servico,'Pneus: '||v.placa,t.valor_servico,'pneus' FROM public.tire_services t JOIN public.vehicles v ON v.id=t.vehicle_id WHERE t.obra_id IS NOT NULL AND t.valor_servico>0
UNION ALL SELECT a.id::text,a.obra_id,a.data_instalacao,'Acessório: '||v.placa,a.valor,'acessorio' FROM public.vehicle_accessories a JOIN public.vehicles v ON v.id=a.vehicle_id WHERE a.obra_id IS NOT NULL AND a.valor>0
UNION ALL SELECT f.id::text,f.obra_id,f.data_multa,'Multa: '||v.placa,f.valor,'multa' FROM public.traffic_fines f JOIN public.vehicles v ON v.id=f.vehicle_id WHERE f.obra_id IS NOT NULL AND f.valor>0 AND f.situacao='paga'
UNION ALL SELECT ov.id::text||'-'||to_char(m,'YYYYMM'),ov.obra_id,m::date,
 'Locação/depreciação: '||v.placa,round(v.valor_aluguel_mensal*(LEAST(COALESCE(ov.data_saida,(m+interval '1 month'-interval '1 day')::date),(m+interval '1 month'-interval '1 day')::date)-GREATEST(ov.data_entrada,m::date)+1)::numeric/EXTRACT(day FROM (m+interval '1 month'-interval '1 day'))::numeric,2),'aluguel'
FROM public.obra_veiculos ov JOIN public.vehicles v ON v.id=ov.vehicle_id CROSS JOIN LATERAL generate_series(date_trunc('month',ov.data_entrada)::date,date_trunc('month',LEAST(COALESCE(ov.data_saida,current_date),current_date))::date,interval '1 month') m
WHERE v.valor_aluguel_mensal>0
UNION ALL SELECT 'km-excedente-'||c.id::text,public.obra_do_veiculo_na_data(c.vehicle_id,c.cycle_end_date),c.cycle_end_date,
 'KM excedente: '||v.placa||' · '||GREATEST(COALESCE(c.km_rodados,0)-COALESCE(v.franquia_km_mensal,c.limite_km_mensal,0),0)::text||' km',
 round(GREATEST(COALESCE(c.km_rodados,0)-COALESCE(v.franquia_km_mensal,c.limite_km_mensal,0),0)*v.valor_km_excedente,2),'km_excedente'
FROM public.vehicle_km_cycles c JOIN public.vehicles v ON v.id=c.vehicle_id
WHERE v.tipo_propriedade='alugado' AND v.tipo_medicao='km' AND COALESCE(v.valor_km_excedente,0)>0
  AND public.obra_do_veiculo_na_data(c.vehicle_id,c.cycle_end_date) IS NOT NULL
UNION ALL SELECT 'hora-excedente-'||h.vehicle_id::text||'-'||to_char(h.competencia,'YYYYMM'),h.obra_id,
 (h.competencia+interval '1 month'-interval '1 day')::date,
 'Horímetro excedente: '||v.placa||' · '||GREATEST(h.horas-COALESCE(v.franquia_horas_mensal,0),0)::text||' h',
 round(GREATEST(h.horas-COALESCE(v.franquia_horas_mensal,0),0)*v.valor_hora_excedente,2),'hora_excedente'
FROM (
  SELECT vehicle_id,obra_id,date_trunc('month',data_abastecimento)::date competencia,
    max(horimetro_no_abastecimento)-min(horimetro_no_abastecimento) horas
  FROM public.vehicle_fuel_logs
  WHERE obra_id IS NOT NULL AND horimetro_no_abastecimento IS NOT NULL
  GROUP BY vehicle_id,obra_id,date_trunc('month',data_abastecimento)::date
  HAVING max(horimetro_no_abastecimento)>min(horimetro_no_abastecimento)
) h JOIN public.vehicles v ON v.id=h.vehicle_id
WHERE v.tipo_propriedade='alugado' AND v.tipo_medicao='horimetro' AND COALESCE(v.valor_hora_excedente,0)>0;

GRANT SELECT ON public.v_frota_custos_obra TO authenticated;

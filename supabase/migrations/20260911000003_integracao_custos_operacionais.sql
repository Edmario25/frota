-- Razão automático de custos operacionais por obra.
-- Cada origem mantém o registro original; as views evitam cópia e duplicidade.

INSERT INTO public.orcamento_categorias(nome,cor,icone,ordem,ativo) VALUES
  ('Frota','#0f766e','truck',8,true)
ON CONFLICT(nome) DO UPDATE SET ativo=true;

-- O centro de custo fica congelado no evento da frota. Transferir o veículo
-- posteriormente não altera o histórico financeiro já registrado.
ALTER TABLE public.maintenance_records ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;
ALTER TABLE public.wash_records ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;
ALTER TABLE public.tire_services
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_servico numeric(14,2);
ALTER TABLE public.vehicle_accessories
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor numeric(14,2);
ALTER TABLE public.traffic_fines ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maintenance_records_obra_data_idx ON public.maintenance_records(obra_id,data_realizada);
CREATE INDEX IF NOT EXISTS vehicle_fuel_logs_obra_data_idx ON public.vehicle_fuel_logs(obra_id,data_abastecimento);
CREATE INDEX IF NOT EXISTS wash_records_obra_data_idx ON public.wash_records(obra_id,data_lavagem);
CREATE INDEX IF NOT EXISTS tire_services_obra_data_idx ON public.tire_services(obra_id,data_servico);
CREATE INDEX IF NOT EXISTS vehicle_accessories_obra_data_idx ON public.vehicle_accessories(obra_id,data_instalacao);
CREATE INDEX IF NOT EXISTS traffic_fines_obra_data_idx ON public.traffic_fines(obra_id,data_multa);

CREATE OR REPLACE FUNCTION public.obra_do_veiculo_na_data(p_vehicle uuid,p_data date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT ov.obra_id FROM public.obra_veiculos ov
  WHERE ov.vehicle_id=p_vehicle AND ov.data_entrada<=COALESCE(p_data,current_date)
    AND (ov.data_saida IS NULL OR ov.data_saida>=COALESCE(p_data,current_date))
  ORDER BY ov.data_entrada DESC,ov.created_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.obra_do_veiculo_na_data(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.obra_do_veiculo_na_data(uuid,date) TO authenticated;

UPDATE public.maintenance_records SET obra_id=public.obra_do_veiculo_na_data(vehicle_id,COALESCE(data_realizada,data_agendada)) WHERE obra_id IS NULL;
UPDATE public.vehicle_fuel_logs SET obra_id=public.obra_do_veiculo_na_data(vehicle_id,data_abastecimento) WHERE obra_id IS NULL;
UPDATE public.wash_records SET obra_id=public.obra_do_veiculo_na_data(vehicle_id,data_lavagem) WHERE obra_id IS NULL;
UPDATE public.tire_services SET obra_id=public.obra_do_veiculo_na_data(vehicle_id,data_servico) WHERE obra_id IS NULL;
UPDATE public.vehicle_accessories SET obra_id=public.obra_do_veiculo_na_data(vehicle_id,data_instalacao) WHERE obra_id IS NULL;
UPDATE public.traffic_fines SET obra_id=public.obra_do_veiculo_na_data(vehicle_id,data_multa) WHERE obra_id IS NULL;

CREATE OR REPLACE FUNCTION public.frota_fixar_obra_evento()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_data date;
BEGIN
  v_data := CASE TG_TABLE_NAME
    WHEN 'maintenance_records' THEN COALESCE((to_jsonb(NEW)->>'data_realizada')::date,(to_jsonb(NEW)->>'data_agendada')::date)
    WHEN 'vehicle_fuel_logs' THEN (to_jsonb(NEW)->>'data_abastecimento')::date
    WHEN 'wash_records' THEN (to_jsonb(NEW)->>'data_lavagem')::date
    WHEN 'tire_services' THEN (to_jsonb(NEW)->>'data_servico')::date
    WHEN 'vehicle_accessories' THEN (to_jsonb(NEW)->>'data_instalacao')::date
    WHEN 'traffic_fines' THEN (to_jsonb(NEW)->>'data_multa')::date END;
  IF NEW.obra_id IS NULL THEN NEW.obra_id:=public.obra_do_veiculo_na_data(NEW.vehicle_id,v_data); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_manut_fixar_obra ON public.maintenance_records;
CREATE TRIGGER trg_manut_fixar_obra BEFORE INSERT OR UPDATE OF vehicle_id,data_realizada,data_agendada ON public.maintenance_records FOR EACH ROW EXECUTE FUNCTION public.frota_fixar_obra_evento();
DROP TRIGGER IF EXISTS trg_comb_fixar_obra ON public.vehicle_fuel_logs;
CREATE TRIGGER trg_comb_fixar_obra BEFORE INSERT OR UPDATE OF vehicle_id,data_abastecimento ON public.vehicle_fuel_logs FOR EACH ROW EXECUTE FUNCTION public.frota_fixar_obra_evento();
DROP TRIGGER IF EXISTS trg_lav_fixar_obra ON public.wash_records;
CREATE TRIGGER trg_lav_fixar_obra BEFORE INSERT OR UPDATE OF vehicle_id,data_lavagem ON public.wash_records FOR EACH ROW EXECUTE FUNCTION public.frota_fixar_obra_evento();
DROP TRIGGER IF EXISTS trg_pneu_fixar_obra ON public.tire_services;
CREATE TRIGGER trg_pneu_fixar_obra BEFORE INSERT OR UPDATE OF vehicle_id,data_servico ON public.tire_services FOR EACH ROW EXECUTE FUNCTION public.frota_fixar_obra_evento();
DROP TRIGGER IF EXISTS trg_acess_fixar_obra ON public.vehicle_accessories;
CREATE TRIGGER trg_acess_fixar_obra BEFORE INSERT OR UPDATE OF vehicle_id,data_instalacao ON public.vehicle_accessories FOR EACH ROW EXECUTE FUNCTION public.frota_fixar_obra_evento();
DROP TRIGGER IF EXISTS trg_multa_fixar_obra ON public.traffic_fines;
CREATE TRIGGER trg_multa_fixar_obra BEFORE INSERT OR UPDATE OF vehicle_id,data_multa ON public.traffic_fines FOR EACH ROW EXECUTE FUNCTION public.frota_fixar_obra_evento();

-- Classificação configurável do fundo fixo; pode ser desligada quando a saída
-- apenas paga um custo já apropriado por outro módulo.
ALTER TABLE public.fundo_fixo_lancamentos
  ADD COLUMN IF NOT EXISTS integrar_custo_obra boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS categoria_orcamento_id uuid REFERENCES public.orcamento_categorias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fundo_lanc_categoria_orc_idx ON public.fundo_fixo_lancamentos(categoria_orcamento_id)
  WHERE tipo='saida' AND status='aprovado' AND integrar_custo_obra;

CREATE OR REPLACE VIEW public.v_frota_custos_obra WITH (security_invoker=true) AS
SELECT m.id::text referencia_id,m.obra_id,COALESCE(m.data_realizada,m.data_agendada) data_lancamento,
  'Manutenção: '||v.placa||' · '||m.descricao descricao,m.custo::numeric valor,'manutencao' origem
FROM public.maintenance_records m JOIN public.vehicles v ON v.id=m.vehicle_id WHERE m.obra_id IS NOT NULL AND m.status='concluida' AND m.custo>0
UNION ALL SELECT f.id::text,f.obra_id,f.data_abastecimento,'Combustível: '||v.placa,f.valor_total,'combustivel' FROM public.vehicle_fuel_logs f JOIN public.vehicles v ON v.id=f.vehicle_id WHERE f.obra_id IS NOT NULL AND f.valor_total>0
UNION ALL SELECT w.id::text,w.obra_id,w.data_lavagem,'Lavagem: '||v.placa,w.valor,'lavagem' FROM public.wash_records w JOIN public.vehicles v ON v.id=w.vehicle_id WHERE w.obra_id IS NOT NULL AND w.valor>0
UNION ALL SELECT t.id::text,t.obra_id,t.data_servico,'Pneus: '||v.placa,t.valor_servico,'pneus' FROM public.tire_services t JOIN public.vehicles v ON v.id=t.vehicle_id WHERE t.obra_id IS NOT NULL AND t.valor_servico>0
UNION ALL SELECT a.id::text,a.obra_id,a.data_instalacao,'Acessório: '||v.placa,a.valor,'acessorio' FROM public.vehicle_accessories a JOIN public.vehicles v ON v.id=a.vehicle_id WHERE a.obra_id IS NOT NULL AND a.valor>0
UNION ALL SELECT f.id::text,f.obra_id,f.data_multa,'Multa: '||v.placa,f.valor,'multa' FROM public.traffic_fines f JOIN public.vehicles v ON v.id=f.vehicle_id WHERE f.obra_id IS NOT NULL AND f.valor>0 AND f.situacao='paga'
UNION ALL SELECT ov.id::text||'-'||to_char(m,'YYYYMM'),ov.obra_id,m::date,'Aluguel/depreciação: '||v.placa,
 round(v.valor_aluguel_mensal*(LEAST(COALESCE(ov.data_saida,(m+interval '1 month'-interval '1 day')::date),(m+interval '1 month'-interval '1 day')::date)-GREATEST(ov.data_entrada,m::date)+1)::numeric/EXTRACT(day FROM (m+interval '1 month'-interval '1 day'))::numeric,2),'aluguel'
FROM public.obra_veiculos ov JOIN public.vehicles v ON v.id=ov.vehicle_id CROSS JOIN LATERAL generate_series(date_trunc('month',ov.data_entrada)::date,date_trunc('month',LEAST(COALESCE(ov.data_saida,current_date),current_date))::date,interval '1 month') m WHERE v.valor_aluguel_mensal>0;

CREATE OR REPLACE VIEW public.v_subcontratadas_custos_obra WITH (security_invoker=true) AS
SELECT m.id::text referencia_id,m.obra_id,COALESCE(m.data_aprovacao,m.data_medicao) data_lancamento,
 'BM-'||lpad(m.numero_bm::text,3,'0')||' · '||COALESCE(s.nome_fantasia,s.razao_social) descricao,
 m.valor_medido valor,'medicao_aprovada'::text origem
FROM public.medicoes m JOIN public.subcontratadas s ON s.id=m.subcontratada_id
WHERE m.status='aprovada' AND m.valor_medido>0;

CREATE OR REPLACE VIEW public.v_fundo_fixo_custos_obra WITH (security_invoker=true) AS
SELECT l.id::text referencia_id,f.obra_id,l.data_lancamento,l.descricao,l.valor,'fundo_fixo'::text origem,
 COALESCE(l.categoria_orcamento_id,(SELECT id FROM public.orcamento_categorias WHERE nome=CASE l.categoria
   WHEN 'material' THEN 'Materiais' WHEN 'equipamento' THEN 'Equipamentos'
   WHEN 'hospedagem' THEN 'Alojamento' ELSE 'Administração' END LIMIT 1)) categoria_id,
 l.fornecedor,l.numero_documento nota_fiscal
FROM public.fundo_fixo_lancamentos l JOIN public.fundo_fixo f ON f.id=l.fundo_fixo_id
WHERE l.tipo='saida' AND l.status='aprovado' AND l.integrar_custo_obra;

-- Mão de obra gerencial: salário e benefícios são distribuídos entre as obras
-- proporcionalmente às horas apontadas no mês; HE usa adicional de 50%.
CREATE OR REPLACE VIEW public.v_mao_obra_custos_obra WITH (security_invoker=true) AS
WITH horas AS (
 SELECT ep.employee_id,ep.obra_id,ep.data,date_trunc('month',ep.data)::date competencia,
   sum(CASE WHEN ep.ausencia THEN 0 ELSE COALESCE(ep.horas_trabalhadas,0) END) horas,
   sum(CASE WHEN ep.ausencia THEN 0 ELSE COALESCE(ep.horas_extras,0) END) he
 FROM public.efetivo_ponto ep GROUP BY 1,2,3,4
), totais AS (SELECT employee_id,competencia,sum(horas) total_horas FROM horas GROUP BY 1,2)
SELECT h.employee_id::text||'-'||h.obra_id::text||'-'||to_char(h.data,'YYYYMMDD') referencia_id,
 h.obra_id,h.data data_lancamento,'Mão de obra: '||e.nome descricao,
 round(((COALESCE(r.salario_base,0)+COALESCE(r.vale_alimentacao,0)+COALESCE(r.vale_transporte,0))
   * CASE WHEN t.total_horas>0 THEN h.horas/t.total_horas ELSE 0 END)
   + h.he*(COALESCE(r.salario_base,0)/NULLIF(COALESCE(r.jornada_horas,220),0))*1.5,2) valor,
 'folha_estimada'::text origem
FROM horas h JOIN totais t USING(employee_id,competencia) JOIN public.employees e ON e.id=h.employee_id
JOIN public.employee_dados_rh r ON r.employee_id=h.employee_id
WHERE h.horas>0 AND COALESCE(r.salario_base,0)>0;

-- Uma interface única para o painel, lançamentos e exportações.
CREATE OR REPLACE VIEW public.v_custos_automaticos_obra WITH (security_invoker=true) AS
SELECT ac.referencia_id::text,ac.obra_id,ac.data_lancamento,ac.descricao,ac.valor,'alojamento'::text tipo,ac.origem,
 (SELECT id FROM public.orcamento_categorias WHERE nome='Alojamento' LIMIT 1) categoria_id,ac.fornecedor,ac.nota_fiscal
FROM public.v_alojamento_custos_obra ac
UNION ALL SELECT mc.referencia_id::text,mc.obra_id,mc.data_lancamento,mc.descricao,mc.valor,'almoxarifado',mc.origem,mc.categoria_id,NULL,NULL FROM public.v_almoxarifado_custos_obra mc WHERE mc.valor<>0 AND mc.categoria_id IS NOT NULL
UNION ALL SELECT fc.referencia_id,fc.obra_id,fc.data_lancamento,fc.descricao,fc.valor,'frota',fc.origem,(SELECT id FROM public.orcamento_categorias WHERE nome='Frota' LIMIT 1),NULL,NULL FROM public.v_frota_custos_obra fc
UNION ALL SELECT sc.referencia_id,sc.obra_id,sc.data_lancamento,sc.descricao,sc.valor,'subcontratada',sc.origem,(SELECT id FROM public.orcamento_categorias WHERE nome='Subcontratadas' LIMIT 1),NULL,NULL FROM public.v_subcontratadas_custos_obra sc
UNION ALL SELECT mo.referencia_id,mo.obra_id,mo.data_lancamento,mo.descricao,mo.valor,'folha',mo.origem,(SELECT id FROM public.orcamento_categorias WHERE nome='Mão de Obra' LIMIT 1),NULL,NULL FROM public.v_mao_obra_custos_obra mo
UNION ALL SELECT ff.referencia_id,ff.obra_id,ff.data_lancamento,ff.descricao,ff.valor,'fundo_fixo',ff.origem,ff.categoria_id,ff.fornecedor,ff.nota_fiscal FROM public.v_fundo_fixo_custos_obra ff;

CREATE OR REPLACE VIEW public.v_orcado_realizado WITH (security_invoker=true) AS
WITH custos AS (
 SELECT obra_id,categoria_id,valor FROM public.lancamentos_custos WHERE cancelado_em IS NULL
 UNION ALL SELECT obra_id,categoria_id,valor FROM public.v_custos_automaticos_obra WHERE categoria_id IS NOT NULL
)
SELECT o.id obra_id,o.nome obra_nome,oc.id categoria_id,oc.nome categoria_nome,oc.cor categoria_cor,oc.ordem categoria_ordem,
 oi.id orcamento_item_id,coalesce(oi.valor_previsto,0) valor_previsto,coalesce(oi.alerta_perc,80) alerta_perc,
 coalesce(sum(c.valor),0) valor_realizado,CASE WHEN coalesce(oi.valor_previsto,0)>0 THEN round(coalesce(sum(c.valor),0)/oi.valor_previsto*100,2) ELSE 0 END perc_consumido,
 coalesce(oi.valor_previsto,0)-coalesce(sum(c.valor),0) saldo,oi.descricao,oi.observacoes
FROM public.obras o CROSS JOIN public.orcamento_categorias oc LEFT JOIN public.orcamento_itens oi ON oi.obra_id=o.id AND oi.categoria_id=oc.id
LEFT JOIN custos c ON c.obra_id=o.id AND c.categoria_id=oc.id WHERE oc.ativo OR oi.id IS NOT NULL OR c.obra_id IS NOT NULL
GROUP BY o.id,o.nome,oc.id,oc.nome,oc.cor,oc.ordem,oi.id,oi.valor_previsto,oi.alerta_perc,oi.descricao,oi.observacoes;

CREATE OR REPLACE VIEW public.v_custos_mensais WITH (security_invoker=true) AS
WITH custos AS (
 SELECT obra_id,categoria_id,data_lancamento,valor FROM public.lancamentos_custos WHERE cancelado_em IS NULL
 UNION ALL SELECT obra_id,categoria_id,data_lancamento,valor FROM public.v_custos_automaticos_obra WHERE categoria_id IS NOT NULL
)
SELECT c.obra_id,to_char(c.data_lancamento,'YYYY-MM') mes,oc.id categoria_id,oc.nome categoria_nome,oc.cor categoria_cor,sum(c.valor) valor_mes,
 sum(sum(c.valor)) OVER(PARTITION BY c.obra_id,oc.id ORDER BY to_char(c.data_lancamento,'YYYY-MM')) valor_acumulado
FROM custos c JOIN public.orcamento_categorias oc ON oc.id=c.categoria_id GROUP BY c.obra_id,mes,oc.id,oc.nome,oc.cor;

GRANT SELECT ON public.v_frota_custos_obra,public.v_subcontratadas_custos_obra,public.v_fundo_fixo_custos_obra,
 public.v_mao_obra_custos_obra,public.v_custos_automaticos_obra,public.v_orcado_realizado,public.v_custos_mensais TO authenticated;

-- Ciclo de inspecao patrimonial: agenda, bloqueio, alertas e notificacoes SMS.

ALTER TABLE public.sms_inspecoes
  ADD COLUMN IF NOT EXISTS ferramenta_id uuid REFERENCES public.ferramentas_catalogo(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sms_inspecoes_ferramenta_idx ON public.sms_inspecoes(ferramenta_id, data_inspecao DESC);

ALTER TABLE public.sms_notificacoes DROP CONSTRAINT IF EXISTS sms_notificacoes_tipo_check;
ALTER TABLE public.sms_notificacoes ADD CONSTRAINT sms_notificacoes_tipo_check CHECK (tipo IN (
  'vencimento_treinamento','vencimento_aso','vencimento_epi','vencimento_ca','estoque_minimo',
  'desvio_critico','desvio_prazo','desvio_novo','dds_pendente','apr_pendente',
  'admissao_bloqueada','inspecao_equipamento'
));

CREATE OR REPLACE FUNCTION public.atualizar_equipamento_apos_inspecao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_nao_conforme boolean;
  v_periodicidade integer;
  v_alocado boolean;
BEGIN
  IF NEW.status='concluida' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.ferramenta_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.sms_inspecoes_respostas r WHERE r.inspecao_id=NEW.id AND r.conforme=false)
      INTO v_nao_conforme;
    SELECT periodicidade_inspecao_dias INTO v_periodicidade FROM public.ferramentas_catalogo WHERE id=NEW.ferramenta_id;
    SELECT EXISTS(SELECT 1 FROM public.ferramentas_alocacao a WHERE a.ferramenta_id=NEW.ferramenta_id AND a.data_devolucao IS NULL)
      INTO v_alocado;

    UPDATE public.ferramentas_catalogo
       SET ultima_inspecao=NEW.data_inspecao,
           proxima_inspecao=CASE WHEN v_periodicidade IS NOT NULL THEN NEW.data_inspecao+v_periodicidade ELSE NULL END,
           status_operacional=CASE WHEN v_nao_conforme THEN 'bloqueado' WHEN v_alocado THEN 'operando' ELSE 'disponivel' END
     WHERE id=NEW.ferramenta_id;

    IF v_nao_conforme THEN
      INSERT INTO public.sms_notificacoes(tipo,destinatario_id,canal,titulo,mensagem,referencia_tabela,referencia_id)
      SELECT 'inspecao_equipamento', e.id, 'app', 'Equipamento bloqueado por inspecao',
             f.nome || COALESCE(' ('||f.codigo_patrimonio||')','') || ' apresentou item nao conforme e foi bloqueado.',
             'ferramentas_catalogo', f.id
      FROM public.ferramentas_catalogo f
      CROSS JOIN public.employees e
      JOIN public.user_roles ur ON ur.user_id=e.user_id AND ur.role='tecnico_sms'::public.app_role
      WHERE f.id=NEW.ferramenta_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_atualizar_equipamento_apos_inspecao ON public.sms_inspecoes;
CREATE TRIGGER trg_atualizar_equipamento_apos_inspecao
  AFTER UPDATE OF status ON public.sms_inspecoes
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_equipamento_apos_inspecao();

CREATE OR REPLACE FUNCTION public.processar_alertas_inspecao_equipamentos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_total integer := 0;
BEGIN
  -- Inicializa a primeira data prevista a partir de hoje para cadastros ainda sem historico.
  UPDATE public.ferramentas_catalogo
     SET proxima_inspecao=current_date+periodicidade_inspecao_dias
   WHERE ativo AND periodicidade_inspecao_dias IS NOT NULL AND proxima_inspecao IS NULL;

  -- Bloqueio automatico no vencimento.
  UPDATE public.ferramentas_catalogo
     SET status_operacional='bloqueado'
   WHERE ativo AND proxima_inspecao < current_date
     AND status_operacional NOT IN ('inativo','manutencao','bloqueado');

  INSERT INTO public.sms_notificacoes(tipo,destinatario_id,canal,titulo,mensagem,referencia_tabela,referencia_id)
  SELECT 'inspecao_equipamento', e.id, 'app',
         CASE WHEN f.proxima_inspecao < current_date THEN 'Inspecao de equipamento vencida' ELSE 'Inspecao de equipamento proxima' END,
         f.nome || COALESCE(' ('||f.codigo_patrimonio||')','') ||
         CASE WHEN f.proxima_inspecao < current_date
              THEN ' esta bloqueado. Inspecao vencida em '||to_char(f.proxima_inspecao,'DD/MM/YYYY')||'.'
              ELSE ' deve ser inspecionado ate '||to_char(f.proxima_inspecao,'DD/MM/YYYY')||'.' END,
         'ferramentas_catalogo', f.id
    FROM public.ferramentas_catalogo f
    CROSS JOIN public.employees e
    JOIN public.user_roles ur ON ur.user_id=e.user_id AND ur.role='tecnico_sms'::public.app_role
   WHERE f.ativo AND f.proxima_inspecao <= current_date+30
     AND NOT EXISTS (
       SELECT 1 FROM public.sms_notificacoes n
       WHERE n.tipo='inspecao_equipamento' AND n.destinatario_id=e.id
         AND n.referencia_id=f.id AND n.created_at::date=current_date
     );
  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END $$;
GRANT EXECUTE ON FUNCTION public.processar_alertas_inspecao_equipamentos() TO authenticated;

CREATE OR REPLACE VIEW public.v_alertas_inspecao_equipamentos
WITH (security_invoker=true) AS
SELECT f.id, f.nome, f.codigo_patrimonio, f.tipo_item, f.status_operacional,
       f.ultima_inspecao, f.proxima_inspecao, f.periodicidade_inspecao_dias,
       a.obra_id, o.nome AS obra_nome,
       CASE WHEN f.proxima_inspecao < current_date THEN 'vencida'
            WHEN f.proxima_inspecao <= current_date+7 THEN 'vence_7_dias'
            WHEN f.proxima_inspecao <= current_date+30 THEN 'vence_30_dias'
            ELSE 'em_dia' END AS nivel_alerta,
       f.proxima_inspecao-current_date AS dias_restantes
FROM public.ferramentas_catalogo f
LEFT JOIN public.ferramentas_alocacao a ON a.ferramenta_id=f.id AND a.data_devolucao IS NULL
LEFT JOIN public.obras o ON o.id=a.obra_id
WHERE f.ativo AND f.periodicidade_inspecao_dias IS NOT NULL;
GRANT SELECT ON public.v_alertas_inspecao_equipamentos TO authenticated;

-- Em projetos com pg_cron habilitado, prepara alertas diariamente às 07:00 UTC.
-- A entrega push ocorre pela Edge Function já usada pelo sistema.
DO $$
DECLARE v_existe boolean := false;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname=$1)'
      INTO v_existe USING 'alertas-inspecao-equipamentos-diario';
    IF NOT v_existe THEN
      EXECUTE 'SELECT cron.schedule($1,$2,$3)'
        USING 'alertas-inspecao-equipamentos-diario', '0 10 * * *',
              'SELECT public.processar_alertas_inspecao_equipamentos();';
    END IF;
  END IF;
END $$;

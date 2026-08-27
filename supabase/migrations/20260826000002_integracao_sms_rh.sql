-- Integra os eventos de SMS com o ciclo de vida de RH.

-- 1. Admissao de SMS nasce quando o funcionario e vinculado a uma obra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_admissao_colaborador_obra
  ON public.sms_admissoes(colaborador_id, obra_id) WHERE status <> 'cancelada';

CREATE OR REPLACE FUNCTION public.fn_sms_criar_admissao_por_vinculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS TRUE THEN
    INSERT INTO public.sms_admissoes(
      colaborador_id, obra_id, data_admissao, status, observacoes, registrado_por
    ) VALUES (
      NEW.employee_id, NEW.obra_id, COALESCE(NEW.data_entrada, CURRENT_DATE),
      'em_andamento', 'Processo criado automaticamente pelo vínculo do RH com a obra.', auth.uid()
    ) ON CONFLICT (colaborador_id, obra_id) WHERE status <> 'cancelada' DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_admissao_vinculo ON public.obra_funcionarios;
CREATE TRIGGER trg_sms_admissao_vinculo
  AFTER INSERT OR UPDATE OF status ON public.obra_funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_sms_criar_admissao_por_vinculo();

-- Cria os processos faltantes para vínculos já existentes.
INSERT INTO public.sms_admissoes(colaborador_id, obra_id, data_admissao, status, observacoes)
SELECT of.employee_id, of.obra_id, COALESCE(of.data_entrada, CURRENT_DATE),
       'em_andamento', 'Processo criado pela integração RH × SMS.'
FROM public.obra_funcionarios of
WHERE of.status IS TRUE
ON CONFLICT (colaborador_id, obra_id) WHERE status <> 'cancelada' DO NOTHING;

-- 2. ASO unico: todo exame ocupacional aparece também nos documentos do perfil RH.
ALTER TABLE public.employee_documentos
  ADD COLUMN IF NOT EXISTS sms_saude_id uuid REFERENCES public.sms_saude_ocupacional(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_documento_sms_saude
  ON public.employee_documentos(sms_saude_id) WHERE sms_saude_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_sms_saude_para_documento_rh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.employee_documentos(
    employee_id, tipo, descricao, arquivo_url, data_emissao, data_vencimento,
    observacoes, sms_saude_id
  ) VALUES (
    NEW.colaborador_id, 'ASO',
    'ASO ' || replace(NEW.tipo_exame, '_', ' '), NEW.aso_url,
    NEW.data_exame, NEW.vencimento,
    'Aptidão: ' || NEW.aptidao || COALESCE(' · Restrições: ' || NULLIF(NEW.restricoes, ''), ''),
    NEW.id
  )
  ON CONFLICT (sms_saude_id) WHERE sms_saude_id IS NOT NULL DO UPDATE SET
    employee_id = EXCLUDED.employee_id,
    descricao = EXCLUDED.descricao,
    arquivo_url = EXCLUDED.arquivo_url,
    data_emissao = EXCLUDED.data_emissao,
    data_vencimento = EXCLUDED.data_vencimento,
    observacoes = EXCLUDED.observacoes;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_saude_documento_rh ON public.sms_saude_ocupacional;
CREATE TRIGGER trg_sms_saude_documento_rh
  AFTER INSERT OR UPDATE ON public.sms_saude_ocupacional
  FOR EACH ROW EXECUTE FUNCTION public.fn_sms_saude_para_documento_rh();

-- 3. Acidente com afastamento abre afastamento no RH e retira disponibilidade.
ALTER TABLE public.sms_acidentes
  ADD COLUMN IF NOT EXISTS rh_afastamento_id uuid REFERENCES public.employee_ferias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS colaborador_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.fn_sms_acidente_para_afastamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_leave_id uuid;
  v_start date;
BEGIN
  IF NEW.afastamento IS TRUE AND NEW.colaborador_id IS NOT NULL AND NEW.rh_afastamento_id IS NULL THEN
    v_start := NEW.data_hora::date;
    INSERT INTO public.employee_ferias(
      employee_id, tipo, data_inicio, data_fim, dias_corridos,
      motivo, aprovado, observacoes
    ) VALUES (
      NEW.colaborador_id, 'afastamento', v_start,
      CASE WHEN COALESCE(NEW.dias_afastamento, 0) > 0
        THEN v_start + (NEW.dias_afastamento - 1) ELSE NULL END,
      NEW.dias_afastamento,
      'Acidente de trabalho', true,
      'Gerado automaticamente pela ocorrência SMS ' || NEW.id::text
    ) RETURNING id INTO v_leave_id;

    UPDATE public.sms_acidentes SET rh_afastamento_id = v_leave_id WHERE id = NEW.id;
    IF v_start <= CURRENT_DATE AND (NEW.dias_afastamento IS NULL OR v_start + NEW.dias_afastamento > CURRENT_DATE) THEN
      UPDATE public.employees SET status = 'licenca', updated_at = now() WHERE id = NEW.colaborador_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_acidente_afastamento ON public.sms_acidentes;
CREATE TRIGGER trg_sms_acidente_afastamento
  AFTER INSERT OR UPDATE OF afastamento, dias_afastamento, colaborador_id ON public.sms_acidentes
  FOR EACH ROW EXECUTE FUNCTION public.fn_sms_acidente_para_afastamento();

-- 4. Regra central de aptidao para trabalho em campo.
CREATE OR REPLACE FUNCTION public.sms_validar_aptidao_colaborador(
  p_employee_id uuid,
  p_obra_id uuid DEFAULT NULL
)
RETURNS TABLE(apto boolean, motivo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_aso record;
BEGIN
  SELECT status::text INTO v_status FROM public.employees WHERE id = p_employee_id;
  IF v_status IS NULL THEN RETURN QUERY SELECT false, 'Funcionário não encontrado'; RETURN; END IF;
  IF v_status <> 'ativo' THEN RETURN QUERY SELECT false, 'Funcionário indisponível no RH (' || v_status || ')'; RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.employee_ferias f
    WHERE f.employee_id = p_employee_id AND f.aprovado
      AND CURRENT_DATE >= f.data_inicio AND CURRENT_DATE <= COALESCE(f.data_fim, CURRENT_DATE)
  ) THEN RETURN QUERY SELECT false, 'Funcionário em férias, licença ou afastamento'; RETURN; END IF;

  SELECT s.aptidao, s.vencimento INTO v_aso
  FROM public.sms_saude_ocupacional s
  WHERE s.colaborador_id = p_employee_id
  ORDER BY s.data_exame DESC, s.created_at DESC LIMIT 1;
  IF FOUND AND (v_aso.aptidao = 'inapto' OR (v_aso.vencimento IS NOT NULL AND v_aso.vencimento < CURRENT_DATE)) THEN
    RETURN QUERY SELECT false, CASE WHEN v_aso.aptidao = 'inapto' THEN 'ASO inapto' ELSE 'ASO vencido' END;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sms_colaborador_treinamentos ct
    JOIN public.sms_treinamentos_catalogo tc ON tc.id = ct.treinamento_id
    WHERE ct.colaborador_id = p_employee_id AND tc.obrigatorio
      AND (ct.status = 'vencido' OR (ct.data_vencimento IS NOT NULL AND ct.data_vencimento < CURRENT_DATE))
      AND (p_obra_id IS NULL OR ct.obra_id IS NULL OR ct.obra_id = p_obra_id)
  ) THEN RETURN QUERY SELECT false, 'Treinamento obrigatório vencido'; RETURN; END IF;

  RETURN QUERY SELECT true, 'Apto para atividade';
END;
$$;
GRANT EXECUTE ON FUNCTION public.sms_validar_aptidao_colaborador(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_sms_bloquear_apr_inapto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean; v_reason text; v_obra uuid;
BEGIN
  SELECT obra_id INTO v_obra FROM public.sms_aprs WHERE id = NEW.apr_id;
  SELECT apto, motivo INTO v_ok, v_reason
  FROM public.sms_validar_aptidao_colaborador(NEW.colaborador_id, v_obra);
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'Colaborador não pode ser incluído na APR: %', v_reason;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_apr_bloqueio_rh ON public.sms_apr_envolvidos;
CREATE TRIGGER trg_sms_apr_bloqueio_rh
  BEFORE INSERT OR UPDATE OF colaborador_id ON public.sms_apr_envolvidos
  FOR EACH ROW EXECUTE FUNCTION public.fn_sms_bloquear_apr_inapto();

-- Consulta unificada usada pelo perfil do funcionário.
CREATE OR REPLACE VIEW public.vw_employee_sms_resumo
WITH (security_invoker = true) AS
SELECT e.id AS employee_id,
  (SELECT count(*) FROM public.sms_colaborador_treinamentos t WHERE t.colaborador_id=e.id AND t.status='vencido') AS treinamentos_vencidos,
  (SELECT count(*) FROM public.sms_colaborador_epis ep WHERE ep.colaborador_id=e.id AND ep.data_devolucao IS NULL) AS epis_em_responsabilidade,
  (SELECT count(*) FROM public.sms_dds_presencas d WHERE d.colaborador_id=e.id AND d.presente) AS dds_participacoes,
  (SELECT count(*) FROM public.sms_apr_envolvidos a WHERE a.colaborador_id=e.id) AS apr_participacoes,
  (SELECT count(*) FROM public.sms_acidentes ac WHERE ac.colaborador_id=e.id) AS acidentes,
  (SELECT s.aptidao FROM public.sms_saude_ocupacional s WHERE s.colaborador_id=e.id ORDER BY s.data_exame DESC LIMIT 1) AS aso_aptidao,
  (SELECT s.vencimento FROM public.sms_saude_ocupacional s WHERE s.colaborador_id=e.id ORDER BY s.data_exame DESC LIMIT 1) AS aso_vencimento
FROM public.employees e;

GRANT SELECT ON public.vw_employee_sms_resumo TO authenticated;

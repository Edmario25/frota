import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useVehicleKmCycles } from "@/hooks/useVehicleKmCycles";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
import { usePermissions } from "@/hooks/usePermissions";
import { getVehicleIdsByObra } from "@/utils/obraFilters";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type VehicleInsert = Database['public']['Tables']['vehicles']['Insert'];
type VehicleUpdate = Database['public']['Tables']['vehicles']['Update'];

export const useVehicles = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { getCurrentCycle, getCurrentCycleSilent, autoRenewCycles } = useVehicleKmCycles();

  // Renova ciclos automaticamente ao carregar o módulo:
  // fecha ciclos vencidos e abre o próximo mantendo o aniversário de cada veículo
  useEffect(() => { autoRenewCycles(); }, []);
  const { role, shouldFilterByObra, loading: loadingRole } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();
  const { canAction, obrasCom, loading: loadingPermissions } = usePermissions();
  const acessoFrota = obrasCom('frota.visualizar');
  const obrasPermitidas = acessoFrota.ids.length ? acessoFrota.ids : (shouldFilterByObra && obraId ? [obraId] : []);
  const acessoLegadoCompleto = role === 'admin' || role === 'gestor_contrato' || role === 'gestor_frota';
  const acessoEmpresa = acessoFrota.todas || acessoLegadoCompleto;

  const QK = ['vehicles', acessoEmpresa, obrasPermitidas.join(',')] as const;

  const query = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Vehicle[]> => {
      if (!acessoEmpresa && obrasPermitidas.length) {
        const idsPorObra = await Promise.all(obrasPermitidas.map(getVehicleIdsByObra));
        const vehicleIds = [...new Set(idsPorObra.flat())];
        if (!vehicleIds.length) return [];
        const { data, error } = await (supabase as any)
          .from('vehicles').select('*').in('id', vehicleIds).is('baixado_em', null).order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      if (acessoEmpresa) {
        const { data, error } = await (supabase as any)
          .from('vehicles').select('*').is('baixado_em', null).order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      return [];
    },
    enabled: !loadingRole && !loadingObra && !loadingPermissions,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vehicles'] });

  const vincularFornecedorLocacao = async (obraId?: string | null, fornecedorId?: string | null, valor?: number | null) => {
    if (!obraId || !fornecedorId) return;
    const { error } = await (supabase as any).from('obra_fornecedores').upsert({
      obra_id: obraId,
      fornecedor_id: fornecedorId,
      data_inicio: new Date().toISOString().slice(0, 10),
      tipo_contrato: 'locacao_frota',
      valor_contrato: valor || null,
      status: true,
      observacoes: 'Vínculo criado automaticamente a partir da locação de veículo.',
    }, { onConflict: 'obra_id,fornecedor_id', ignoreDuplicates: true });
    if (error) throw new Error(`Veículo cadastrado, mas não foi possível vincular o fornecedor à obra: ${error.message}`);
  };

  const configurarOperacao = async (vehicleId: string, data: any) => {
    const { error } = await (supabase as any).rpc('configurar_operacao_veiculo', {
      p_vehicle_id: vehicleId,
      p_obra_id: data.obra_id || null,
      p_setor_id: data.setor_id || null,
      p_responsavel_id: data.responsavel_id || null,
      p_tipo_uso: data.tipo_uso || 'compartilhado',
      p_status: data.status || 'disponivel',
    });
    if (error) throw new Error(error.message);
  };

  const createMutation = useMutation({
    mutationFn: async (vehicleData: any) => {
      const { obra_id, ...vehicleDataWithoutObra } = vehicleData;
      const { data, error } = await supabase.from('vehicles').insert([vehicleDataWithoutObra]).select().single();
      if (error) throw error;

      if (obra_id && obra_id !== "") {
        try {
          await configurarOperacao(data.id, vehicleData);
        } catch (operacaoError: any) {
          // Compensacao: nao deixa cadastro orfao quando o vinculo obrigatorio falhar.
          await supabase.from('vehicles').delete().eq('id', data.id);
          throw new Error(`Não foi possível configurar a operação do veículo: ${operacaoError.message}`);
        }
        await vincularFornecedorLocacao(obra_id, vehicleDataWithoutObra.fornecedor_id, vehicleDataWithoutObra.valor_aluguel_mensal);
        toast({ title: "Veículo cadastrado", description: "Cadastro e vínculo com a obra concluídos com sucesso." });
      } else throw new Error('Selecione a obra responsável pelo veículo.');
      return data;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Erro ao cadastrar veículo", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, vehicleData }: { id: string; vehicleData: any }) => {
      const { obra_id, setor_id, tipo_uso, ...rest } = vehicleData;
      const vehicleDataWithoutObra: VehicleUpdate = {
        placa: rest.placa, modelo: rest.modelo, marca: rest.marca, ano: rest.ano,
        tipo: rest.tipo, cor: rest.cor,
        quilometragem_atual: rest.quilometragem_atual,
        quilometragem_maxima_mensal: rest.quilometragem_maxima_mensal,
        tipo_medicao: rest.tipo_medicao, horimetro_atual: rest.horimetro_atual,
        limite_horimetro_mensal: rest.limite_horimetro_mensal,
        limite_lavagens_mensal: rest.limite_lavagens_mensal,
        valor_aluguel_mensal: rest.valor_aluguel_mensal,
        status: rest.status, observacoes: rest.observacoes,
        tipo_propriedade: rest.tipo_propriedade,
        rental_company_id: rest.rental_company_id,
        fornecedor_id: rest.fornecedor_id,
        numero_contrato_locacao: rest.numero_contrato_locacao,
        data_inicio_locacao: rest.data_inicio_locacao,
        data_fim_locacao: rest.data_fim_locacao,
        franquia_km_mensal: rest.franquia_km_mensal,
        valor_km_excedente: rest.valor_km_excedente,
        franquia_horas_mensal: rest.franquia_horas_mensal,
        valor_hora_excedente: rest.valor_hora_excedente,
        responsavel_id: rest.responsavel_id,
        traccar_device_id: rest.traccar_device_id ?? null,
      } as any;

      // Não solicitamos o registro de volta: em alguns perfis a política de
      // leitura filtra a linha atualizada, e o `.single()` transforma uma
      // atualização válida em erro técnico de objeto JSON único.
      const { error } = await supabase.from('vehicles').update(vehicleDataWithoutObra).eq('id', id);
      if (error) throw error;

      await configurarOperacao(id, { ...rest, obra_id, setor_id, tipo_uso });
      await vincularFornecedorLocacao(obra_id, rest.fornecedor_id, rest.valor_aluguel_mensal);
      return { id };
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Veículo atualizado", description: "O veículo foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar veículo", description: e.message, variant: "destructive" }),
  });

  const retireMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const { error } = await (supabase as any).rpc('baixar_veiculo', {
        p_vehicle_id: id,
        p_motivo: motivo || 'Baixa administrativa solicitada na gestão de frota',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Veículo baixado", description: "O ativo foi retirado da operação e seu histórico foi preservado." });
    },
    onError: (e: any) => toast({ title: "Erro ao baixar veículo", description: e.message, variant: "destructive" }),
  });

  const getVehicleStats = async (filterType?: 'leve' | 'pesado') => {
    const filtered = filterType
      ? (query.data ?? []).filter(v => v.tipo === filterType)
      : (query.data ?? []);

    const disponivel = filtered.filter(v => v.status === 'disponivel').length;
    const em_uso = filtered.filter(v => v.status === 'em_uso').length;
    const manutencao = filtered.filter(v => v.status === 'manutencao').length;

    let alertas_km = 0;
    const batchSize = 10;
    for (let i = 0; i < filtered.length; i += batchSize) {
      const results = await Promise.allSettled(
        filtered.slice(i, i + batchSize).map(v => getCurrentCycleSilent(v.id))
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value && r.value.percentage_used >= 80) alertas_km++;
      }
    }
    return { disponivel, em_uso, manutencao, alertas_km };
  };

  const getVehicleKmInfo = async (vehicleId: string) => {
    try {
      const cycle = await getCurrentCycle(vehicleId);
      if (!cycle) return null;
      return {
        kmAtual: cycle.km_inicial + cycle.km_rodados,
        kmRodadosNoCiclo: cycle.km_rodados,
        limiteMensal: cycle.limite_km_mensal,
        percentualUsado: cycle.percentage_used,
        diasRestantes: cycle.days_remaining,
        inicioCiclo: cycle.cycle_start_date,
        fimCiclo: cycle.cycle_end_date,
        excedeuLimite: cycle.percentage_used >= 100,
        proximoDoLimite: cycle.percentage_used >= 80,
      };
    } catch {
      return null;
    }
  };

  return {
    vehicles: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    accessMessage: !query.isLoading && !acessoEmpresa && !obrasPermitidas.length
      ? (canAction('frota.visualizar') ? 'Seu acesso à frota não possui uma obra definida.' : 'Seu perfil não possui permissão para consultar a frota.')
      : (!query.isLoading && !acessoEmpresa && obrasPermitidas.length > 0 && (query.data?.length ?? 0) === 0
          ? 'Não há veículos ativos vinculados às obras permitidas para este perfil.'
          : null),
    createVehicle: (d: any) => createMutation.mutateAsync(d),
    updateVehicle: (id: string, vehicleData: any) => updateMutation.mutateAsync({ id, vehicleData }),
    deleteVehicle: (id: string, motivo?: string) => retireMutation.mutateAsync({ id, motivo }),
    refetchVehicles: query.refetch,
    getVehicleStats,
    getVehicleKmInfo,
  };
};

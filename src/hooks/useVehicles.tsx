import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useVehicleKmCycles } from "@/hooks/useVehicleKmCycles";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
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
  const { shouldFilterByObra, loading: loadingRole } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();

  const QK = ['vehicles', shouldFilterByObra, obraId] as const;

  const query = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Vehicle[]> => {
      if (shouldFilterByObra && obraId) {
        const vehicleIds = await getVehicleIdsByObra(obraId);
        if (!vehicleIds.length) return [];
        const { data, error } = await (supabase as any)
          .from('vehicles').select('*').in('id', vehicleIds).is('baixado_em', null).order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      if (!shouldFilterByObra) {
        const { data, error } = await (supabase as any)
          .from('vehicles').select('*').is('baixado_em', null).order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      return [];
    },
    enabled: !loadingRole && !loadingObra,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vehicles'] });

  const createMutation = useMutation({
    mutationFn: async (vehicleData: any) => {
      const { obra_id, ...vehicleDataWithoutObra } = vehicleData;
      const { data, error } = await supabase.from('vehicles').insert([vehicleDataWithoutObra]).select().single();
      if (error) throw error;

      if (obra_id && obra_id !== "") {
        const { error: obraError } = await (supabase as any).rpc('vincular_veiculo_obra', {
          p_vehicle_id: data.id,
          p_obra_id: obra_id,
          p_tipo_vinculo: 'compartilhado',
        });
        if (obraError) {
          // Compensacao: nao deixa cadastro orfao quando o vinculo obrigatorio falhar.
          await supabase.from('vehicles').delete().eq('id', data.id);
          throw new Error(`Não foi possível vincular o veículo à obra: ${obraError.message}`);
        }
        toast({ title: "Veículo cadastrado", description: "Cadastro e vínculo com a obra concluídos com sucesso." });
      } else {
        toast({ title: "Veículo cadastrado", description: "O veículo foi cadastrado com sucesso." });
      }
      return data;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Erro ao cadastrar veículo", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, vehicleData }: { id: string; vehicleData: any }) => {
      const { obra_id, ...rest } = vehicleData;
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
        responsavel_id: rest.responsavel_id,
        traccar_device_id: rest.traccar_device_id ?? null,
      };

      const { data, error } = await supabase.from('vehicles').update(vehicleDataWithoutObra).eq('id', id).select().single();
      if (error) throw error;

      const { error: linkError } = await (supabase as any).rpc('vincular_veiculo_obra', {
        p_vehicle_id: id,
        p_obra_id: obra_id || null,
        p_tipo_vinculo: 'compartilhado',
      });
      if (linkError) throw new Error(`Veículo atualizado, mas a alocação não pôde ser concluída: ${linkError.message}`);
      return data;
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
    createVehicle: (d: any) => createMutation.mutateAsync(d),
    updateVehicle: (id: string, vehicleData: any) => updateMutation.mutateAsync({ id, vehicleData }),
    deleteVehicle: (id: string, motivo?: string) => retireMutation.mutateAsync({ id, motivo }),
    refetchVehicles: query.refetch,
    getVehicleStats,
    getVehicleKmInfo,
  };
};

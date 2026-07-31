import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const { getCurrentCycle, getCurrentCycleSilent } = useVehicleKmCycles();
  const { shouldFilterByObra, loading: loadingRole } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();

  const QK = ['vehicles', shouldFilterByObra, obraId] as const;

  const query = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Vehicle[]> => {
      if (shouldFilterByObra && obraId) {
        const vehicleIds = await getVehicleIdsByObra(obraId);
        if (!vehicleIds.length) return [];
        const { data, error } = await supabase
          .from('vehicles').select('*').in('id', vehicleIds).order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      if (!shouldFilterByObra) {
        const { data, error } = await supabase
          .from('vehicles').select('*').order('created_at', { ascending: false });
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
        const { error: obraError } = await supabase.from('obra_veiculos').insert([{
          obra_id, vehicle_id: data.id,
          tipo_vinculo: 'compartilhado',
          data_entrada: new Date().toISOString().split('T')[0],
          status: true,
        }]);
        toast({
          title: "Veículo cadastrado",
          description: obraError
            ? "Veículo criado, mas houve erro ao vincular à obra."
            : "O veículo foi cadastrado e vinculado à obra com sucesso.",
        });
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

      if (obra_id && obra_id !== "") {
        const { data: existingLink } = await supabase
          .from('obra_veiculos').select('id').eq('vehicle_id', id).eq('status', true).single();
        if (existingLink) {
          await supabase.from('obra_veiculos').update({ obra_id, updated_at: new Date().toISOString() }).eq('id', existingLink.id);
        } else {
          await supabase.from('obra_veiculos').insert([{
            obra_id, vehicle_id: id, tipo_vinculo: 'compartilhado',
            data_entrada: new Date().toISOString().split('T')[0], status: true,
          }]);
        }
      }
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Veículo atualizado", description: "O veículo foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar veículo", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Veículo excluído", description: "O veículo foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir veículo", description: e.message, variant: "destructive" }),
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
    deleteVehicle: (id: string) => deleteMutation.mutateAsync(id),
    refetchVehicles: query.refetch,
    getVehicleStats,
    getVehicleKmInfo,
  };
};

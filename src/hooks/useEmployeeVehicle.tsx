import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface FleetConfig {
  limite_km_mensal_padrao: number;
  alerta_km_percentual: number;        // % para disparar alerta de km mensal
  intervalo_manutencao_km: number;     // km entre preventivas
  intervalo_manutencao_dias: number;   // dias entre preventivas
  alerta_documentacao_dias: number;    // dias de antecedência para alertas de doc
  criar_ciclos_auto: boolean;
  fechar_ciclos_expirados: boolean;
}

export interface LastMaintenance {
  data_realizada: string;
  quilometragem: number | null;
  tipo: string;
}

// Defaults se a tabela fleet_config ainda não foi criada/populada
export const DEFAULT_FLEET_CONFIG: FleetConfig = {
  limite_km_mensal_padrao: 2000,
  alerta_km_percentual: 80,
  intervalo_manutencao_km: 10000,
  intervalo_manutencao_dias: 180,
  alerta_documentacao_dias: 30,
  criar_ciclos_auto: true,
  fechar_ciclos_expirados: true,
};

// ─── Query key ───────────────────────────────────────────────────────────────

const QK = (userId: string | undefined) => ["employeeVehicle", userId] as const;

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useEmployeeVehicle = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QK(user?.id),
    queryFn: async () => {
      // 1. Employee
      const { data: employee, error: empError } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (empError || !employee) {
        return { vehicle: null, kmCycle: null, fleetConfig: DEFAULT_FLEET_CONFIG, lastMaintenance: null };
      }

      // 2. Vehicle atribuído ao funcionário
      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select(`*, rental_companies(nome)`)
        .eq("responsavel_id", employee.id)
        .maybeSingle();
      if (vehicleError || !vehicleData) {
        return { vehicle: null, kmCycle: null, fleetConfig: DEFAULT_FLEET_CONFIG, lastMaintenance: null };
      }

      // 3. Busca paralela: ciclo de km, config de frota, última manutenção preventiva
      const [cycleRes, configRes, maintRes] = await Promise.all([
        supabase.rpc("get_current_km_cycle", { p_vehicle_id: vehicleData.id }),
        (supabase as any).from("fleet_config").select("*").eq("id", 1).maybeSingle(),
        (supabase as any)
          .from("maintenance_records")
          .select("data_realizada, quilometragem, tipo")
          .eq("vehicle_id", vehicleData.id)
          .eq("tipo", "preventiva")
          .eq("status", "concluida")
          .order("data_realizada", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Monta o objeto de config — usa defaults se a row não existir
      const fleetConfig: FleetConfig = configRes.data
        ? {
            limite_km_mensal_padrao: configRes.data.limite_km_mensal_padrao,
            alerta_km_percentual: configRes.data.alerta_km_percentual,
            intervalo_manutencao_km: configRes.data.intervalo_manutencao_km,
            intervalo_manutencao_dias: configRes.data.intervalo_manutencao_dias,
            alerta_documentacao_dias: configRes.data.alerta_documentacao_dias,
            criar_ciclos_auto: configRes.data.criar_ciclos_auto,
            fechar_ciclos_expirados: configRes.data.fechar_ciclos_expirados,
          }
        : DEFAULT_FLEET_CONFIG;

      // Ciclo base vindo do banco
      const baseCycle = cycleRes.data?.[0] ?? null;

      // km_rodados real: recalcula a partir do odômetro GPS (quilometragem_atual - km_inicial)
      // Isso garante que o app sempre reflete o GPS mesmo antes do trigger processar.
      // O trigger trg_sync_cycle_km_from_odometer mantém o banco em sincronia.
      const kmCycle = baseCycle
        ? {
            ...baseCycle,
            km_rodados:
              vehicleData.quilometragem_atual != null
                ? Math.max(0, vehicleData.quilometragem_atual - baseCycle.km_inicial)
                : baseCycle.km_rodados,
          }
        : null;

      return {
        vehicle: vehicleData,
        kmCycle,
        fleetConfig,
        lastMaintenance: (maintRes.data as LastMaintenance | null) ?? null,
      };
    },
    enabled: !!user,
  });

  const updateVehicleKm = async (newKm: number) => {
    const vehicle = query.data?.vehicle;
    if (!vehicle) return;

    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ quilometragem_atual: newKm })
        .eq("id", vehicle.id);
      if (error) throw error;

      // Aguarda trigger do banco processar antes de revalidar
      setTimeout(() => qc.invalidateQueries({ queryKey: QK(user?.id) }), 500);

      toast({
        title: "Quilometragem atualizada",
        description: "A quilometragem do veículo foi atualizada com sucesso.",
      });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
  };

  return {
    vehicle: query.data?.vehicle ?? null,
    kmCycle: query.data?.kmCycle ?? null,
    fleetConfig: query.data?.fleetConfig ?? DEFAULT_FLEET_CONFIG,
    lastMaintenance: query.data?.lastMaintenance ?? null,
    loading: query.isLoading,
    updateVehicleKm,
    refetch: query.refetch,
  };
};

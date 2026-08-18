import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type VehicleKmCycle = Database['public']['Tables']['vehicle_km_cycles']['Row'];

export interface KmCycleInfo {
  cycle_id: string;
  cycle_start_date: string;
  cycle_end_date: string;
  km_inicial: number;
  limite_km_mensal: number;
  km_rodados: number;
  days_remaining: number;
  percentage_used: number;
}

export const useVehicleKmCycles = () => {
  const [cycles, setCycles] = useState<VehicleKmCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Versão silenciosa - não exibe toast em caso de erro (para uso em loops/batch)
  const getCurrentCycleSilent = useCallback(async (vehicleId: string): Promise<KmCycleInfo | null> => {
    try {
      const { data, error } = await supabase
        .rpc('get_current_km_cycle', { p_vehicle_id: vehicleId });

      if (error) throw error;
      
      if (data && data.length > 0) {
        const cycle = data[0];
        return {
          cycle_id: cycle.cycle_id,
          cycle_start_date: cycle.cycle_start_date,
          cycle_end_date: cycle.cycle_end_date,
          km_inicial: cycle.km_inicial,
          limite_km_mensal: cycle.limite_km_mensal,
          km_rodados: cycle.km_rodados,
          days_remaining: cycle.days_remaining,
          percentage_used: cycle.percentage_used,
        };
      }
      
      return null;
    } catch (error: any) {
      console.error('Error fetching current cycle:', error);
      return null;
    }
  }, []);

  // Versão com feedback - exibe toast em caso de erro (para uso individual)
  const getCurrentCycle = useCallback(async (vehicleId: string): Promise<KmCycleInfo | null> => {
    try {
      setLoading(true);
      const result = await getCurrentCycleSilent(vehicleId);
      return result;
    } catch (error: any) {
      console.error('Error fetching current cycle:', error);
      toast({
        title: "Erro ao buscar ciclo de KM",
        description: error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [getCurrentCycleSilent, toast]);

  const getVehicleCycles = async (vehicleId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vehicle_km_cycles')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('cycle_start_date', { ascending: false });

      if (error) throw error;
      setCycles(data || []);
      return data || [];
    } catch (error: any) {
      toast({
        title: "Erro ao carregar ciclos de KM",
        description: error.message,
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cria ciclos mensais automaticamente para todos os veículos sem ciclo ativo.
   * Chama a função SQL create_monthly_km_cycles() via RPC.
   * Deve ser invocada no início de cada sessão do módulo de frota.
   */
  const createMonthlyCycles = useCallback(async (): Promise<number> => {
    try {
      const { data, error } = await (supabase as any)
        .rpc("create_monthly_km_cycles");
      if (error) throw error;
      const created = Number(data ?? 0);
      if (created > 0) {
        toast({
          title: "Ciclos do mês criados",
          description: `${created} ciclo(s) mensal(is) iniciado(s) automaticamente.`,
        });
      }
      return created;
    } catch (error: any) {
      console.error("Erro ao criar ciclos mensais:", error);
      return 0;
    }
  }, [toast]);

  const closeExpiredCycles = async () => {
    try {
      const { data, error } = await supabase
        .rpc('close_expired_km_cycles');

      if (error) throw error;
      
      if (data > 0) {
        toast({
          title: "Ciclos fechados",
          description: `${data} ciclo(s) expirado(s) foram fechados automaticamente.`,
        });
      }
      
      return data;
    } catch (error: any) {
      console.error('Error closing expired cycles:', error);
      toast({
        title: "Erro ao fechar ciclos expirados",
        description: error.message,
        variant: "destructive",
      });
      return 0;
    }
  };

  const getKmProgress = useCallback((atual: number, limite: number) => {
    const percentage = (atual / limite) * 100;
    return Math.min(percentage, 100);
  }, []);

  const getKmProgressColor = useCallback((percentage: number) => {
    if (percentage >= 100) return "gradient-warning";
    if (percentage >= 80) return "bg-warning";
    return "gradient-success";
  }, []);

  const formatCycleDate = useCallback((date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  }, []);

  const getDaysText = useCallback((days: number) => {
    if (days < 0) return "Ciclo expirado";
    if (days === 0) return "Último dia";
    if (days === 1) return "1 dia restante";
    return `${days} dias restantes`;
  }, []);

  return {
    cycles,
    loading,
    getCurrentCycle,
    getCurrentCycleSilent,
    createMonthlyCycles,
    getVehicleCycles,
    closeExpiredCycles,
    getKmProgress,
    getKmProgressColor,
    formatCycleDate,
    getDaysText,
  };
};

export const useKmCyclesBatch = (vehicleIds: string[]): Record<string, KmCycleInfo> => {
  const { data = {} } = useQuery({
    queryKey: ['kmCyclesBatch', [...vehicleIds].sort()],
    queryFn: async (): Promise<Record<string, KmCycleInfo>> => {
      if (!vehicleIds.length) return {};
      const { data, error } = await supabase
        .from('vehicle_km_cycles')
        .select('id, vehicle_id, cycle_start_date, cycle_end_date, km_inicial, km_rodados, limite_km_mensal')
        .in('vehicle_id', vehicleIds)
        .eq('status', 'ativo');
      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const map: Record<string, KmCycleInfo> = {};

      for (const cycle of data ?? []) {
        const km_rodados = cycle.km_rodados ?? 0;
        const endDate = new Date(cycle.cycle_end_date);
        endDate.setHours(0, 0, 0, 0);
        const days_remaining = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const percentage_used = cycle.limite_km_mensal > 0
          ? Math.round((km_rodados / cycle.limite_km_mensal) * 100)
          : 0;

        map[cycle.vehicle_id] = {
          cycle_id: cycle.id,
          cycle_start_date: cycle.cycle_start_date,
          cycle_end_date: cycle.cycle_end_date,
          km_inicial: cycle.km_inicial,
          limite_km_mensal: cycle.limite_km_mensal,
          km_rodados,
          days_remaining,
          percentage_used,
        };
      }
      return map;
    },
    enabled: vehicleIds.length > 0,
  });
  return data;
};
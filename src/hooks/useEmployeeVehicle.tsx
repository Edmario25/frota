import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const QK = (userId: string | undefined) => ['employeeVehicle', userId] as const;

export const useEmployeeVehicle = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QK(user?.id),
    queryFn: async () => {
      const { data: employee, error: empError } = await supabase
        .from('employees').select('id').eq('user_id', user!.id).maybeSingle();
      if (empError || !employee) return { vehicle: null, kmCycle: null };

      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select(`*, rental_companies(nome)`)
        .eq('responsavel_id', employee.id)
        .maybeSingle();
      if (vehicleError || !vehicleData) return { vehicle: null, kmCycle: null };

      const { data: cycleData } = await supabase
        .rpc('get_current_km_cycle', { p_vehicle_id: vehicleData.id });

      return {
        vehicle: vehicleData,
        kmCycle: cycleData?.[0] ?? null,
      };
    },
    enabled: !!user,
  });

  const updateVehicleKm = async (newKm: number) => {
    const vehicle = query.data?.vehicle;
    if (!vehicle) return;

    try {
      const { error } = await supabase
        .from('vehicles')
        .update({ quilometragem_atual: newKm })
        .eq('id', vehicle.id);
      if (error) throw error;

      // Aguarda trigger do banco processar antes de revalidar
      setTimeout(() => qc.invalidateQueries({ queryKey: QK(user?.id) }), 500);

      toast({ title: "Quilometragem atualizada", description: "A quilometragem do veículo foi atualizada com sucesso." });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
  };

  return {
    vehicle: query.data?.vehicle ?? null,
    kmCycle: query.data?.kmCycle ?? null,
    loading: query.isLoading,
    updateVehicleKm,
    refetch: query.refetch,
  };
};

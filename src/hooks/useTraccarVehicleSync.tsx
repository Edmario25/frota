/**
 * useTraccarVehicleSync
 *
 * Sincroniza o odômetro do veículo do motorista com o GPS Traccar.
 * Usado no AppHome para atualizar km rodados no mês ao abrir o app.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadTraccarConfig, useTraccar } from "@/hooks/useTraccar";

export function useTraccarVehicleSync() {
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const { getPositions } = useTraccar();

  /**
   * Sincroniza o veículo com o GPS.
   * @param vehicleId - ID do veículo na tabela vehicles
   * @param onSuccess - callback após atualização bem-sucedida
   */
  const syncVehicleGps = useCallback(async (
    vehicleId: string,
    onSuccess?: () => void,
  ) => {
    if (syncing) return;
    setSyncing(true);
    try {
      // 1. Carrega config Traccar
      const config = await loadTraccarConfig();
      if (!config?.url) return; // rastreador não configurado — ignora silenciosamente

      // 2. Busca dados do veículo (precisa do traccar_device_id e odômetro baseline)
      const { data: vehicle, error: vErr } = await (supabase as any)
        .from("vehicles")
        .select("id, quilometragem_atual, traccar_device_id, traccar_last_distance")
        .eq("id", vehicleId)
        .maybeSingle();

      if (vErr || !vehicle?.traccar_device_id) return; // sem rastreador vinculado

      // 3. Busca posição atual do dispositivo
      const positions = await getPositions(config, [vehicle.traccar_device_id]);
      if (!positions?.length) return;

      const currentGpsMeters: number | null =
        positions[0]?.attributes?.totalDistance ?? null;
      if (currentGpsMeters === null) return;

      // 4. Calcula novo km incremental
      let novoKm: number = vehicle.quilometragem_atual ?? 0;
      const newLastDistance: number = Math.round(currentGpsMeters);

      if (vehicle.traccar_last_distance === null) {
        // Primeiro sync: não altera odômetro, só registra baseline
      } else {
        const deltaMeters = currentGpsMeters - vehicle.traccar_last_distance;
        const deltaKm = Math.round(deltaMeters / 1000);
        if (deltaKm > 0) {
          novoKm = (vehicle.quilometragem_atual ?? 0) + deltaKm;
        }
      }

      // 5. Persiste no banco (trigger atualiza km_rodados do ciclo ativo)
      const payload: Record<string, any> = {
        traccar_last_distance: newLastDistance,
        updated_at: new Date().toISOString(),
      };
      if (novoKm !== vehicle.quilometragem_atual) {
        payload.quilometragem_atual = novoKm;
      }

      await (supabase as any)
        .from("vehicles")
        .update(payload)
        .eq("id", vehicleId);

      setLastSynced(new Date());
      onSuccess?.();
    } catch (err) {
      // Sync silencioso — não exibe erro para o motorista
      console.warn("[TraccarVehicleSync] Erro ao sincronizar GPS:", err);
    } finally {
      setSyncing(false);
    }
  }, [syncing, getPositions]);

  return { syncVehicleGps, syncing, lastSynced };
}

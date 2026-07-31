/**
 * TraccarSyncPanel — painel de sincronização GPS
 *
 * Mostra todos os veículos com rastreador vinculado,
 * permite sincronizar odômetro e exibe consumo médio (km/L).
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  useTraccar,
  loadTraccarConfig,
  type TraccarConfig,
  type TraccarDevice,
} from "@/hooks/useTraccar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Satellite, RefreshCw, Loader2, AlertCircle, CheckCircle2,
  Fuel, Route, TrendingUp, WifiOff, Settings, MapPin,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── Tipos ───────────────────────────────────────────────────────────

interface VehicleWithTraccar {
  id: string;
  placa: string;
  modelo: string;
  marca: string;
  tipo: string;
  quilometragem_atual: number;
  quilometragem_maxima_mensal: number;
  traccar_device_id: number;
  traccar_last_distance: number | null;
  // enriquecidos após sync
  gps_km?: number | null;
  gps_delta_km?: number | null;
  gps_status?: "online" | "offline" | "unknown";
  gps_last_update?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  km_mes?: number | null;
  combustivel_mes?: number | null;
  eficiencia?: number | null;
  syncing?: boolean;
  synced?: boolean;
  syncError?: string;
  locating?: boolean;
}

// ─── Componente ──────────────────────────────────────────────────────

interface TraccarSyncPanelProps {
  /** Chamado após sync que alterou quilometragem_atual — recarrega a lista de veículos */
  onKmUpdate?: (vehicleId: string, newKm: number) => void;
}

export function TraccarSyncPanel({ onKmUpdate }: TraccarSyncPanelProps = {}) {
  const navigate = useNavigate();
  const { getDevices, getPositions, getMonthlySummary } = useTraccar();

  const [config, setConfig]     = useState<TraccarConfig | null>(null);
  const [vehicles, setVehicles] = useState<VehicleWithTraccar[]>([]);
  const [devices,  setDevices]  = useState<TraccarDevice[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [syncingAll, setSyncingAll]   = useState(false);

  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;

  // ── Carrega veículos com traccar_device_id e config ────────────────
  useEffect(() => {
    (async () => {
      setLoadingInit(true);
      try {
        const [cfg, vehiclesRes] = await Promise.all([
          loadTraccarConfig(),
          (supabase as any)
            .from("vehicles")
            .select("id, placa, modelo, marca, tipo, quilometragem_atual, quilometragem_maxima_mensal, traccar_device_id, traccar_last_distance")
            .not("traccar_device_id", "is", null)
            .order("placa"),
        ]);

        setConfig(cfg);

        // Se a coluna traccar_last_distance ainda não existe, faz fallback sem ela
        let vData = vehiclesRes.data;
        if (vehiclesRes.error) {
          const { data: fallback } = await (supabase as any)
            .from("vehicles")
            .select("id, placa, modelo, marca, tipo, quilometragem_atual, quilometragem_maxima_mensal, traccar_device_id")
            .not("traccar_device_id", "is", null)
            .order("placa");
          vData = fallback;
        }

        setVehicles((vData ?? []).map((v: any) => ({
          ...v,
          traccar_last_distance: v.traccar_last_distance ?? null,
        })));

        // Carrega lista de devices para mostrar status
        if (cfg) {
          const devs = await getDevices(cfg).catch(() => []);
          setDevices(devs);
        }
      } finally {
        setLoadingInit(false);
      }
    })();
  }, []);

  // ── Busca litros abastecidos no mês para uma lista de vehicles ──────
  const fetchFuelInMonth = useCallback(async (vehicleIds: string[]) => {
    if (!vehicleIds.length) return {} as Record<string, number>;

    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const endOfMonth   = new Date(year, month, 0).toISOString().split("T")[0];

    const { data } = await (supabase as any)
      .from("vehicle_fuel_logs")
      .select("vehicle_id, litros")
      .in("vehicle_id", vehicleIds)
      .gte("data_abastecimento", startOfMonth)
      .lte("data_abastecimento", endOfMonth);

    const totals: Record<string, number> = {};
    for (const row of (data ?? [])) {
      totals[row.vehicle_id] = (totals[row.vehicle_id] ?? 0) + (row.litros ?? 0);
    }
    return totals;
  }, [year, month]);

  // ── Sincroniza UM veículo ────────────────────────────────────────
  const syncVehicle = useCallback(async (v: VehicleWithTraccar) => {
    setVehicles(prev =>
      prev.map(x => x.id === v.id ? { ...x, syncing: true, syncError: undefined } : x)
    );

    try {
      // 1. Busca posição atual do GPS e resumo mensal em paralelo
      const [positions, summary] = await Promise.all([
        getPositions(config!, [v.traccar_device_id]),
        getMonthlySummary(config!, v.traccar_device_id, year, month),
      ]);

      const currentGpsMeters: number | null = positions[0]?.attributes?.totalDistance ?? null;
      const kmMes = summary ? Math.round(summary.distance / 1000) : null;

      // 2. Calcula novo km do veículo (lógica incremental)
      let novoKm = v.quilometragem_atual;
      let deltaKm: number | null = null;
      let newLastDistance = v.traccar_last_distance;

      if (currentGpsMeters !== null) {
        if (v.traccar_last_distance === null) {
          // ── Primeiro sync ──────────────────────────────────────────
          // Aplica imediatamente os km do mês atual ao odômetro manual.
          // Define o baseline como o totalDistance atual para que syncs
          // futuros calculem apenas o delta incremental a partir daqui.
          newLastDistance = currentGpsMeters;
          if (kmMes && kmMes > 0) {
            novoKm = v.quilometragem_atual + kmMes;
            deltaKm = kmMes;
          }
        } else {
          // ── Syncs seguintes: delta incremental ─────────────────────
          const deltaMeters = currentGpsMeters - v.traccar_last_distance;
          deltaKm = Math.round(deltaMeters / 1000);
          if (deltaKm > 0) {
            novoKm = v.quilometragem_atual + deltaKm;
          }
          newLastDistance = currentGpsMeters;
        }
      }

      // 4. Litros no mês
      const fuelMap = await fetchFuelInMonth([v.id]);
      const litrosMes = fuelMap[v.id] ?? 0;

      // 5. Eficiência km/L
      const eficiencia = (kmMes && litrosMes > 0)
        ? parseFloat((kmMes / litrosMes).toFixed(2))
        : null;

      // 6. Persiste no banco — update único para garantir atomicidade
      // Arredonda para inteiro (bigint no PG não aceita float)
      const lastDistanceToSave = newLastDistance !== null ? Math.round(newLastDistance) : null;

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (novoKm !== v.quilometragem_atual) {
        updatePayload.quilometragem_atual = novoKm;
      }
      if (lastDistanceToSave !== null) {
        updatePayload.traccar_last_distance = lastDistanceToSave;
      }

      const { error: saveError } = await (supabase as any)
        .from("vehicles")
        .update(updatePayload)
        .eq("id", v.id);

      if (saveError) {
        console.error("[TraccarSync] Erro ao salvar veículo:", saveError);
        throw new Error(`Erro ao salvar: ${saveError.message}`);
      }

      // Notifica Frota.tsx se o km mudou
      if (novoKm !== v.quilometragem_atual) {
        onKmUpdate?.(v.id, novoKm);
      }

      // 6b. Inicializa/atualiza o ciclo mensal de km
      try {
        await (supabase as any).rpc("get_current_km_cycle", { p_vehicle_id: v.id });
      } catch (cycleErr: any) {
        console.warn("[TraccarSync] Aviso: ciclo KM não inicializado:", cycleErr?.message);
      }

      // 7. Status do dispositivo
      const dev = devices.find(d => d.id === v.traccar_device_id);

      setVehicles(prev =>
        prev.map(x =>
          x.id === v.id
            ? {
                ...x,
                syncing: false,
                synced: true,
                gps_km: novoKm,
                gps_delta_km: deltaKm,
                gps_status: dev?.status ?? "unknown",
                gps_last_update: dev?.lastUpdate ?? null,
                km_mes: kmMes,
                combustivel_mes: litrosMes > 0 ? litrosMes : null,
                eficiencia,
                quilometragem_atual: novoKm,
                traccar_last_distance: lastDistanceToSave,
              }
            : x
        )
      );
    } catch (e: any) {
      setVehicles(prev =>
        prev.map(x =>
          x.id === v.id
            ? { ...x, syncing: false, syncError: e.message }
            : x
        )
      );
    }
  }, [config, devices, getPositions, getMonthlySummary, fetchFuelInMonth, year, month]);

  // ── Sincroniza TODOS ─────────────────────────────────────────────
  async function syncAll() {
    if (!config || vehicles.length === 0) return;
    setSyncingAll(true);
    try {
      for (const v of vehicles) {
        await syncVehicle(v);
      }
      toast.success("Sincronização concluída!");
    } catch (err: any) {
      console.error("[TraccarSync] Erro inesperado no syncAll:", err?.message);
      toast.error("Erro na sincronização", { description: err?.message });
    } finally {
      setSyncingAll(false);
    }
  }

  // ── Ver localização atual no mapa ────────────────────────────────
  async function locateVehicle(v: VehicleWithTraccar) {
    if (!config) return;

    setVehicles(prev =>
      prev.map(x => x.id === v.id ? { ...x, locating: true } : x)
    );

    try {
      const positions = await getPositions(config, [v.traccar_device_id]);

      if (!positions.length || !positions[0].latitude) {
        toast.error("Posição não disponível", {
          description: "O dispositivo ainda não enviou coordenadas.",
        });
        return;
      }

      const { latitude, longitude, speed, fixTime } = positions[0];

      // Atualiza coordenadas no estado
      setVehicles(prev =>
        prev.map(x =>
          x.id === v.id
            ? { ...x, gps_lat: latitude, gps_lng: longitude }
            : x
        )
      );

      // Abre Google Maps em nova aba
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=16`;
      window.open(mapsUrl, "_blank");

      toast.success(`${v.placa} localizado`, {
        description: `${speed > 0 ? `${Math.round(speed)} km/h` : "Parado"} • ${new Date(fixTime).toLocaleString("pt-BR")}`,
      });
    } catch (e: any) {
      toast.error("Erro ao localizar veículo", { description: e.message });
    } finally {
      setVehicles(prev =>
        prev.map(x => x.id === v.id ? { ...x, locating: false } : x)
      );
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando integração GPS...</span>
      </div>
    );
  }

  if (!config?.url) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
          <div className="h-14 w-14 rounded-2xl bg-sky-100 flex items-center justify-center">
            <Satellite className="h-7 w-7 text-sky-500" />
          </div>
          <div>
            <p className="font-semibold text-base">Traccar não configurado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Configure o servidor GPS para sincronizar odômetro e consumo automaticamente.
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2 rounded-xl"
            onClick={() => navigate("/configuracoes?tab=traccar")}
          >
            <Settings className="h-4 w-4" />
            Configurar Traccar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (vehicles.length === 0) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
          <div className="h-14 w-14 rounded-2xl bg-amber-100 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-amber-500" />
          </div>
          <div>
            <p className="font-semibold text-base">Nenhum veículo com rastreador vinculado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Edite os veículos e informe o <strong>ID do dispositivo Traccar</strong> para ativar a sincronização.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-medium rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <Satellite className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Sincronização GPS</CardTitle>
              <CardDescription>
                {vehicles.length} veículo{vehicles.length > 1 ? "s" : ""} com rastreador •{" "}
                {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </CardDescription>
            </div>
          </div>
          <Button
            onClick={syncAll}
            disabled={syncingAll}
            className="gap-2 rounded-xl"
          >
            {syncingAll
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            Sincronizar Todos
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="rounded-b-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-t border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Veículo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status GPS</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">KM Atual (GPS)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">KM no Mês</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Combustível Mês</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Eficiência</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v, i) => {
                const pct = v.km_mes != null && v.quilometragem_maxima_mensal > 0
                  ? Math.min((v.km_mes / v.quilometragem_maxima_mensal) * 100, 100)
                  : null;

                return (
                  <tr
                    key={v.id}
                    className={
                      (i % 2 === 0 ? "bg-background" : "bg-muted/20") +
                      " border-t border-border/50 hover:bg-muted/40 transition-colors"
                    }
                  >
                    {/* Veículo */}
                    <td className="px-4 py-3">
                      <div className="font-semibold">{v.placa}</div>
                      <div className="text-xs text-muted-foreground">{v.marca} {v.modelo}</div>
                    </td>

                    {/* Status GPS */}
                    <td className="px-4 py-3">
                      {v.gps_status ? (
                        <Badge className={
                          v.gps_status === "online"
                            ? "bg-green-100 text-green-700 border-0 text-xs"
                            : "bg-gray-100 text-gray-500 border-0 text-xs"
                        }>
                          {v.gps_status === "online"
                            ? <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1.5 animate-pulse" />Online</>
                            : <><WifiOff className="h-3 w-3 mr-1 inline" />Offline</>
                          }
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </td>

                    {/* KM Atual */}
                    <td className="px-4 py-3 text-right">
                      <div>
                        <span className="font-semibold">
                          {v.quilometragem_atual.toLocaleString("pt-BR")}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">km</span>
                      </div>
                      {v.synced && v.gps_delta_km !== null && v.gps_delta_km !== undefined && (
                        <div className={`text-xs font-medium ${v.gps_delta_km > 0 ? "text-sky-600" : "text-muted-foreground"}`}>
                          {v.gps_delta_km > 0 ? `+${v.gps_delta_km} km rodados` : "sem movimento"}
                        </div>
                      )}
                      {v.synced && v.traccar_last_distance === null && (
                        <div className="text-xs text-amber-600">baseline registrada</div>
                      )}
                    </td>

                    {/* KM no Mês */}
                    <td className="px-4 py-3 text-right">
                      {v.km_mes != null ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-end gap-1">
                            <Route className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{v.km_mes.toLocaleString("pt-BR")} km</span>
                          </div>
                          {pct !== null && (
                            <div className="w-24 ml-auto">
                              <Progress
                                value={pct}
                                className="h-1.5"
                              />
                              <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% do limite</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    {/* Combustível mês */}
                    <td className="px-4 py-3 text-right">
                      {v.combustivel_mes != null ? (
                        <div className="flex items-center justify-end gap-1">
                          <Fuel className="h-3.5 w-3.5 text-amber-500" />
                          <span>{v.combustivel_mes.toFixed(1)} L</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    {/* Eficiência km/L */}
                    <td className="px-4 py-3 text-right">
                      {v.eficiencia != null ? (
                        <div className="flex items-center justify-end gap-1">
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="font-semibold text-emerald-700">
                            {v.eficiencia.toFixed(1)} km/L
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">

                        {/* Botão localizar */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 rounded-lg text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                          onClick={() => locateVehicle(v)}
                          disabled={v.locating}
                          title="Ver localização atual no mapa"
                        >
                          {v.locating
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <MapPin className="h-3.5 w-3.5" />
                          }
                        </Button>

                        {/* Botão sincronizar */}
                        {v.syncing ? (
                          <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                        ) : v.syncError ? (
                          <div title={v.syncError}>
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          </div>
                        ) : v.synced ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 rounded-lg"
                            onClick={() => syncVehicle(v)}
                            title="Sincronizar odômetro"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

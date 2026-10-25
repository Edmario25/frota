import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UpdateKmModal } from "./UpdateKmModal";
import { VehicleDetailModal } from "@/components/frota/VehicleDetailModal";
import {
  Car,
  Gauge,
  Calendar,
  AlertTriangle,
  Clock,
  Wrench,
  LayoutDashboard,
  Bell,
  CheckCircle2,
} from "lucide-react";
import { getVehicleStatusBadge, getVehicleStatusText } from "@/lib/statusHelpers";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { useI18n } from "@/i18n";

// ─── Push notification helper ─────────────────────────────────────────────────
// Mostra uma notificação de sistema (apenas uma vez por sessão por tag)
async function sendPushNotification(title: string, body: string, tag: string) {
  if (!("Notification" in window)) return;
  if (sessionStorage.getItem(`notif_${tag}`)) return; // já enviada nesta sessão

  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm === "granted") {
    new Notification(title, { body, tag, icon: "/favicon.ico" });
    sessionStorage.setItem(`notif_${tag}`, "1");
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const MyVehicleCard = () => {
  const { t, number, date } = useI18n();
  const { vehicle, kmCycle, fleetConfig, lastMaintenance, loading, refetch } =
    useEmployeeVehicle();
  const [showUpdateKm, setShowUpdateKm] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // ── Métricas de KM mensal ──────────────────────────────────────────────────
  const alertPct = fleetConfig.alerta_km_percentual;
  const kmPercentage = kmCycle
    ? (kmCycle.km_rodados / kmCycle.limite_km_mensal) * 100
    : 0;
  const isOverLimit = kmPercentage > 100;
  const isNearLimit = !isOverLimit && kmPercentage >= alertPct;

  // ── Métricas de manutenção preventiva ─────────────────────────────────────
  const kmAtual = vehicle?.quilometragem_atual ?? 0;
  const maintIntervalKm = fleetConfig.intervalo_manutencao_km;
  const maintIntervalDays = fleetConfig.intervalo_manutencao_dias;

  let kmUntilMaint: number | null = null;
  let daysUntilMaint: number | null = null;
  let maintKmPercent = 0;
  let maintOverdueKm = false;
  let maintOverdueDays = false;
  let isNearMaintKm = false;
  let isNearMaintDays = false;

  if (lastMaintenance) {
    const lastKm = lastMaintenance.quilometragem ?? 0;
    const nextKm = lastKm + maintIntervalKm;
    kmUntilMaint = nextKm - kmAtual;
    // Percentual de avanço em relação ao próximo intervalo (0–100%)
    maintKmPercent = Math.min(((kmAtual - lastKm) / maintIntervalKm) * 100, 100);
    maintOverdueKm = kmUntilMaint <= 0;
    // Alerta quando faltam ≤ 10% do intervalo
    isNearMaintKm = !maintOverdueKm && kmUntilMaint <= maintIntervalKm * 0.1;

    if (lastMaintenance.data_realizada) {
      const lastDate = new Date(lastMaintenance.data_realizada);
      const nextDate = new Date(
        lastDate.getTime() + maintIntervalDays * 24 * 60 * 60 * 1000
      );
      daysUntilMaint = Math.ceil(
        (nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      maintOverdueDays = daysUntilMaint <= 0;
      isNearMaintDays =
        !maintOverdueDays && daysUntilMaint <= fleetConfig.alerta_documentacao_dias;
    }
  }

  const isMaintAlert =
    maintOverdueKm || maintOverdueDays || isNearMaintKm || isNearMaintDays;
  const hasAnyAlert = isOverLimit || isNearLimit || isMaintAlert;

  // ── Push notifications ao carregar ────────────────────────────────────────
  useEffect(() => {
    if (!vehicle || loading) return;

    if (isOverLimit) {
      sendPushNotification(
        t("⚠️ Limite de KM Excedido"),
        t("{plate} — {km} km acima do limite mensal", {
          plate: vehicle.placa,
          km: number((kmCycle?.km_rodados ?? 0) - (kmCycle?.limite_km_mensal ?? 0)),
        }),
        `km_over_${vehicle.id}`
      );
    } else if (isNearLimit) {
      sendPushNotification(
        t("🔶 Atenção: KM Mensal"),
        t("{plate} — {percent}% do limite mensal utilizado", {
          plate: vehicle.placa,
          percent: Math.round(kmPercentage),
        }),
        `km_near_${vehicle.id}`
      );
    }

    if (maintOverdueKm || maintOverdueDays) {
      sendPushNotification(
        t("🔧 Manutenção Preventiva Vencida"),
        t("{plate} — agende a manutenção preventiva imediatamente", { plate: vehicle.placa }),
        `maint_overdue_${vehicle.id}`
      );
    } else if (isNearMaintKm || isNearMaintDays) {
      const hint =
        kmUntilMaint !== null && !maintOverdueKm
          ? t("{km} km", { km: number(kmUntilMaint) })
          : t("{days} dias", { days: daysUntilMaint });
      sendPushNotification(
        t("🔧 Manutenção Preventiva Próxima"),
        t("{plate} — faltam {hint} para a próxima manutenção", { plate: vehicle.placa, hint }),
        `maint_near_${vehicle.id}`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id, isOverLimit, isNearLimit, maintOverdueKm, maintOverdueDays, isNearMaintKm, isNearMaintDays]);

  const handleKmUpdated = () => {
    setShowUpdateKm(false);
    refetch();
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {t("Meu Veículo")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
            <p className="text-muted-foreground">{t("Carregando informações...")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Sem veículo ───────────────────────────────────────────────────────────
  if (!vehicle) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {t("Meu Veículo")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Car className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{t("Nenhum veículo atribuído")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Entre em contato com o gestor para atribuição de veículo")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Render principal ──────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {t("Meu Veículo")}
          </div>
          <div className="flex items-center gap-2">
            {hasAnyAlert && (
              <Bell className="h-4 w-4 text-amber-500 animate-pulse" />
            )}
            <Badge
              variant="outline"
              className={`${getVehicleStatusBadge(vehicle.status)} text-white border-0`}
            >
              {getVehicleStatusText(vehicle.status)}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Informações básicas ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("Veículo")}</p>
            <p className="font-medium text-sm">{vehicle.marca} {vehicle.modelo}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("Placa")}</p>
            <p className="font-medium text-sm">{vehicle.placa}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("Ano")}</p>
            <p className="font-medium text-sm">{vehicle.ano}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("KM Atual")}</p>
            <p className="font-medium text-sm">{number(vehicle.quilometragem_atual ?? 0)} km</p>
          </div>
        </div>

        {/* ── Painel KM Mensal ────────────────────────────────────────────── */}
        {kmCycle ? (
          <div
            className={`rounded-xl p-4 border ${
              isOverLimit
                ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                : isNearLimit
                ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                : "bg-muted/30 border-border"
            }`}
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Gauge
                  className={`h-4 w-4 ${
                    isOverLimit ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-muted-foreground"
                  }`}
                />
                <span className="text-sm font-semibold">{t("KM Mensal")}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {kmCycle.days_remaining} {t("dias restantes no ciclo")}
              </span>
            </div>

            {/* Valores */}
            <div className="flex justify-between text-sm mb-2">
              <div>
                <span className="font-bold text-base">
                  {number(kmCycle.km_rodados)}
                </span>
                <span className="text-muted-foreground text-xs"> {t("km rodados")}</span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground text-xs">{t("Contratado:")} </span>
                <span className="font-semibold">
                  {number(kmCycle.limite_km_mensal)} km
                </span>
              </div>
            </div>

            {/* Barra de progresso */}
            <Progress
              value={Math.min(kmPercentage, 100)}
              className={`h-2.5 mb-2 ${
                isOverLimit
                  ? "[&>div]:bg-red-500"
                  : isNearLimit
                  ? "[&>div]:bg-amber-500"
                  : "[&>div]:bg-green-500"
              }`}
            />

            {/* Status */}
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-1 text-xs font-medium ${
                  isOverLimit ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-green-600"
                }`}
              >
                {isOverLimit ? (
                  <>
                    <AlertTriangle className="h-3 w-3" />
                    {t("Excedeu")}{" "}
                    {number(kmCycle.km_rodados - kmCycle.limite_km_mensal)} {t("km acima do limite")}
                  </>
                ) : isNearLimit ? (
                  <>
                    <Clock className="h-3 w-3" />
                    {Math.round(kmPercentage)}{t("% utilizado — próximo do limite")}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    {Math.round(kmPercentage)}{t("% utilizado — dentro do limite")}
                  </>
                )}
              </div>
              {!isOverLimit && (
                <span className="text-xs text-muted-foreground">
                  {number(kmCycle.limite_km_mensal - kmCycle.km_rodados)} {t("km disponíveis")}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl p-4 border bg-muted/20 border-border text-center">
            <Gauge className="h-6 w-6 mx-auto mb-1 opacity-40" />
            <p className="text-xs text-muted-foreground">{t("Sem ciclo de km ativo")}</p>
          </div>
        )}

        {/* ── Painel Manutenção Preventiva ───────────────────────────────── */}
        <div
          className={`rounded-xl p-4 border ${
            maintOverdueKm || maintOverdueDays
              ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
              : isMaintAlert
              ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
              : "bg-muted/30 border-border"
          }`}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Wrench
                className={`h-4 w-4 ${
                  maintOverdueKm || maintOverdueDays
                    ? "text-red-600"
                    : isMaintAlert
                    ? "text-amber-600"
                    : "text-muted-foreground"
                }`}
              />
              <span className="text-sm font-semibold">{t("Manutenção Preventiva")}</span>
            </div>
            {lastMaintenance && (
              <span className="text-xs text-muted-foreground">
                {t("Intervalo: {km} km / {days} dias", { km: number(maintIntervalKm), days: maintIntervalDays })}
              </span>
            )}
          </div>

          {lastMaintenance ? (
            <div className="space-y-3">
              {/* Por quilometragem */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{t("Por quilometragem")}</span>
                  <span
                    className={`text-xs font-semibold ${
                      maintOverdueKm
                        ? "text-red-600"
                        : isNearMaintKm
                        ? "text-amber-600"
                        : "text-foreground"
                    }`}
                  >
                    {maintOverdueKm
                      ? t("Vencida ({km} km atrás)", { km: number(Math.abs(kmUntilMaint!)) })
                      : t("{km} km restantes", { km: number(kmUntilMaint!) })}
                  </span>
                </div>
                <Progress
                  value={maintKmPercent}
                  className={`h-2 ${
                    maintOverdueKm
                      ? "[&>div]:bg-red-500"
                      : isNearMaintKm
                      ? "[&>div]:bg-amber-500"
                      : "[&>div]:bg-blue-500"
                  }`}
                />
              </div>

              {/* Por tempo */}
              {daysUntilMaint !== null && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{t("Por tempo")}</span>
                  <span
                    className={`font-semibold ${
                      maintOverdueDays
                        ? "text-red-600"
                        : isNearMaintDays
                        ? "text-amber-600"
                        : "text-foreground"
                    }`}
                  >
                    {maintOverdueDays
                      ? `Vencida (${Math.abs(daysUntilMaint)} dias atrás)`
                      : `${daysUntilMaint} dias restantes`}
                  </span>
                </div>
              )}

              {/* Última manutenção */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border/60 pt-2">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                {t("Última:")}{" "}
                {date(lastMaintenance.data_realizada)}
                {lastMaintenance.quilometragem
                  ? ` — ${number(lastMaintenance.quilometragem)} km`
                  : ""}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              {t("Nenhuma manutenção preventiva concluída registrada")}
            </p>
          )}
        </div>

        {/* ── Ações rápidas ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setShowUpdateKm(true)}
          >
            <Gauge className="h-4 w-4" />
            {t("Atualizar KM")}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setShowDetailModal(true)}
          >
            <LayoutDashboard className="h-4 w-4" />
            {t("Controle do Veículo")}
          </Button>
        </div>

        {/* Modals */}
        <UpdateKmModal
          open={showUpdateKm}
          onOpenChange={setShowUpdateKm}
          vehicle={vehicle}
          onKmUpdated={handleKmUpdated}
        />
        <VehicleDetailModal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          vehicle={vehicle}
          isEmployeeMode={true}
        />
      </CardContent>
    </Card>
  );
};

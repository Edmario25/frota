import { AlertTriangle } from "lucide-react";
import { KmCycleInfo } from "@/hooks/useVehicleKmCycles";
import { useI18n } from "@/i18n";

interface VehicleKmCellProps {
  type: 'mensal' | 'total';
  quilometragem_atual?: number;
  quilometragem_maxima_mensal?: number;
  /** Cycle data from the parent's batch query. undefined = loading, null = no active cycle. */
  cycleInfo?: KmCycleInfo | null;
}

const getKmProgressColor = (percentage: number) => {
  if (percentage >= 100) return "gradient-warning";
  if (percentage >= 80) return "bg-warning";
  return "gradient-success";
};

export const VehicleKmCell = ({
  type,
  quilometragem_atual,
  quilometragem_maxima_mensal,
  cycleInfo,
}: VehicleKmCellProps) => {
  const { t, number } = useI18n();

  // ── Km Total ─────────────────────────────────────────────────────
  if (type === 'total') {
    const kmAtual = quilometragem_atual ?? null;
    if (kmAtual === null) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <div className="space-y-1">
        <span className="text-sm font-medium">{number(kmAtual)} km</span>
        <div className="text-xs text-muted-foreground">{t("Odômetro total")}</div>
      </div>
    );
  }

  // ── Km Mensal ────────────────────────────────────────────────────
  if (cycleInfo === undefined) {
    return (
      <div className="space-y-1">
        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
        <div className="h-2 w-24 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (cycleInfo) {
    const { km_rodados, limite_km_mensal, percentage_used, days_remaining } = cycleInfo;
    const color = getKmProgressColor(percentage_used);
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium">{number(km_rodados)}</span>
          <span className="text-muted-foreground">/ {number(limite_km_mensal)} km</span>
          {percentage_used >= 80 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
        </div>
        <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${color}`}
            style={{ width: `${Math.min(percentage_used, 100)}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {days_remaining > 0
            ? t("{count}d restantes", { count: number(days_remaining) })
            : days_remaining === 0
              ? t("Último dia")
              : t("Ciclo expirado")}
        </div>
      </div>
    );
  }

  // cycleInfo === null: no active cycle — show limit as reference
  const limite = quilometragem_maxima_mensal ?? 0;
  if (limite > 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">0</span>
          <span className="text-muted-foreground">/ {number(limite)} km</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-1.5" />
        <div className="text-xs text-muted-foreground italic">{t("Sem ciclo ativo")}</div>
      </div>
    );
  }

  return <span className="text-xs text-muted-foreground">—</span>;
};

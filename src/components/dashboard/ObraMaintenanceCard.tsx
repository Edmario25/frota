import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wrench, Calendar, Clock, CheckCircle, XCircle, AlertTriangle, Play, Check, X,
} from "lucide-react";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  agendada:     { label: "Agendada",     color: "bg-blue-100 text-blue-700",   icon: Calendar },
  em_andamento: { label: "Em andamento", color: "bg-amber-100 text-amber-700", icon: Clock },
  concluida:    { label: "Concluída",    color: "bg-green-100 text-green-700", icon: CheckCircle },
  cancelada:    { label: "Cancelada",    color: "bg-gray-100 text-gray-500",   icon: XCircle },
};

const tipoLabel: Record<string, string> = {
  preventiva: "Preventiva",
  corretiva:  "Corretiva",
  revisao:    "Revisão",
  pneu:       "Pneu",
  outro:      "Outro",
};

export const ObraMaintenanceCard = () => {
  const { t, date } = useI18n();
  const { maintenanceRecords, loading, updateMaintenanceRecord } = useMaintenance();
  const { toast } = useToast();
  const [updating, setUpdating] = useState<string | null>(null);

  // Show active records: agendada and em_andamento first, then recently concluded
  const activeRecords = maintenanceRecords.filter(r => r.status === "agendada" || r.status === "em_andamento");
  const recentConcluded = maintenanceRecords
    .filter(r => r.status === "concluida")
    .slice(0, 3);

  const displayRecords = [...activeRecords, ...recentConcluded];

  const handleStatusChange = async (
    id: string,
    newStatus: "em_andamento" | "concluida" | "cancelada"
  ) => {
    setUpdating(id);
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === "concluida") {
        updateData.data_realizada = new Date().toISOString().split("T")[0];
      }
      await updateMaintenanceRecord(id, updateData);
    } catch {
      // toast already shown by hook
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            {t("Manutenções da Obra")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            {t("Manutenções da Obra")}
          </div>
          {activeRecords.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-0 text-xs rounded-full">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {t("{count} pendentes", { count: activeRecords.length })}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayRecords.length === 0 ? (
          <div className="text-center py-8">
            <Wrench className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">{t("Nenhuma manutenção registrada")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayRecords.map(record => {
              const cfg = statusConfig[record.status] ?? statusConfig.agendada;
              const StatusIcon = cfg.icon;
              const isLoading = updating === record.id;
              const isActive = record.status === "agendada" || record.status === "em_andamento";

              return (
                <div
                  key={record.id}
                  className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cfg.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{record.descricao}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.color}`}>
                          {t(cfg.label)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span>{t(tipoLabel[record.tipo] ?? record.tipo)}</span>
                        <span>·</span>
                        <span>
                          {record.status === "concluida" && record.data_realizada
                            ? t("Concluída em {date}", { date: date(record.data_realizada) })
                            : t("Agendada para {date}", { date: date(record.data_agendada) })}
                        </span>
                        {record.oficina && (
                          <>
                            <span>·</span>
                            <span>{record.oficina}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons — only for active records */}
                  {isActive && (
                    <div className="flex gap-2 mt-2.5 ml-10 flex-wrap">
                      {record.status === "agendada" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
                          disabled={isLoading}
                          onClick={() => handleStatusChange(record.id, "em_andamento")}
                        >
                          <Play className="h-3 w-3" />
                          {t("Iniciar")}
                        </Button>
                      )}
                      {record.status === "em_andamento" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                          disabled={isLoading}
                          onClick={() => handleStatusChange(record.id, "concluida")}
                        >
                          <Check className="h-3 w-3" />
                          {t("Concluir")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={isLoading}
                        onClick={() => handleStatusChange(record.id, "cancelada")}
                      >
                        <X className="h-3 w-3" />
                        {t("Cancelar")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, Calendar, Clock, CheckCircle, XCircle, AlertTriangle, Play, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type MaintenanceRecord = {
  id: string;
  descricao: string;
  tipo: string;
  status: string;
  data_agendada: string;
  data_realizada: string | null;
  oficina: string | null;
  custo: number | null;
  observacoes: string | null;
};

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

export const MyMaintenanceCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

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
      const { error } = await supabase
        .from("maintenance_records")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updateData } : r));
      toast({ title: "Status atualizado", description: "Manutenção atualizada com sucesso." });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  useEffect(() => {
    const fetchMaintenance = async () => {
      if (!user) return;
      try {
        setLoading(true);

        // Find employee row
        const { data: emp } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!emp) return;

        // Find vehicle assigned to employee
        const { data: veh } = await supabase
          .from("vehicles")
          .select("id")
          .eq("responsavel_id", emp.id)
          .maybeSingle();

        if (!veh) return;

        // Fetch maintenance records for that vehicle (active ones)
        const { data, error } = await supabase
          .from("maintenance_records")
          .select("id, descricao, tipo, status, data_agendada, data_realizada, oficina, custo, observacoes")
          .eq("vehicle_id", veh.id)
          .in("status", ["agendada", "em_andamento", "concluida"])
          .order("data_agendada", { ascending: false })
          .limit(10);

        if (!error && data) setRecords(data as MaintenanceRecord[]);
      } finally {
        setLoading(false);
      }
    };

    fetchMaintenance();
  }, [user]);

  const pending = records.filter(r => r.status === "agendada" || r.status === "em_andamento");

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Manutenções do Meu Veículo
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
            Manutenções do Meu Veículo
          </div>
          {pending.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-0 text-xs rounded-full">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {pending.length} pendente{pending.length > 1 ? "s" : ""}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <div className="text-center py-8">
            <Wrench className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">Nenhuma manutenção registrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(record => {
              const cfg = statusConfig[record.status] ?? statusConfig.agendada;
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={record.id}
                  className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
                >
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cfg.color}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{record.descricao}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span>{tipoLabel[record.tipo] ?? record.tipo}</span>
                      <span>·</span>
                      <span>
                        {record.status === "concluida" && record.data_realizada
                          ? `Concluída em ${new Date(record.data_realizada).toLocaleDateString("pt-BR")}`
                          : `Agendada para ${new Date(record.data_agendada).toLocaleDateString("pt-BR")}`}
                      </span>
                      {record.oficina && (
                        <>
                          <span>·</span>
                          <span>{record.oficina}</span>
                        </>
                      )}
                    </div>
                    {record.observacoes && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{record.observacoes}</p>
                    )}

                    {/* Status actions — only for active records */}
                    {(record.status === "agendada" || record.status === "em_andamento") && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {record.status === "agendada" && (
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
                            disabled={updating === record.id}
                            onClick={() => handleStatusChange(record.id, "em_andamento")}>
                            <Play className="h-3 w-3" />Iniciar
                          </Button>
                        )}
                        {record.status === "em_andamento" && (
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                            disabled={updating === record.id}
                            onClick={() => handleStatusChange(record.id, "concluida")}>
                            <Check className="h-3 w-3" />Concluir
                          </Button>
                        )}
                        <Button size="sm" variant="outline"
                          className="h-7 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                          disabled={updating === record.id}
                          onClick={() => handleStatusChange(record.id, "cancelada")}>
                          <X className="h-3 w-3" />Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

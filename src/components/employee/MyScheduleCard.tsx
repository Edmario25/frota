import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Briefcase, Coffee } from "lucide-react";
import { format, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Periodo {
  id: string;
  data_inicio_trabalho: string;
  data_fim_trabalho: string;
  data_inicio_folga: string;
  data_fim_folga: string;
  escala_tipo?: { nome: string; dias_trabalho: number; dias_folga: number } | null;
}

export const MyScheduleCard = () => {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!emp) { setLoading(false); return; }

      const hoje = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("escala_periodos")
        .select("id, data_inicio_trabalho, data_fim_trabalho, data_inicio_folga, data_fim_folga, escala_tipo:escala_tipo_id(nome, dias_trabalho, dias_folga)")
        .eq("employee_id", emp.id)
        .lte("data_inicio_trabalho", hoje)
        .gte("data_fim_folga", hoje)
        .maybeSingle();

      setPeriodo((data as any) ?? null);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const hoje = new Date();

  const emFolga = periodo
    ? isWithinInterval(hoje, {
        start: parseISO(periodo.data_inicio_folga),
        end: parseISO(periodo.data_fim_folga),
      })
    : false;

  const diasRestantes = periodo && !emFolga
    ? Math.ceil((parseISO(periodo.data_inicio_folga).getTime() - hoje.getTime()) / 86400000)
    : periodo && emFolga
    ? Math.ceil((parseISO(periodo.data_fim_folga).getTime() - hoje.getTime()) / 86400000)
    : null;

  return (
    <Card className={periodo ? (emFolga ? "border-blue-200" : "border-emerald-200") : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          Minha Escala
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : !periodo ? (
          <div className="text-center py-6">
            <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum período de escala ativo</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status badge */}
            <div className="flex items-center gap-2">
              {emFolga ? (
                <Badge className="bg-blue-100 text-blue-700 border-0 gap-1">
                  <Coffee className="h-3 w-3" /> Em Folga
                </Badge>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1">
                  <Briefcase className="h-3 w-3" /> Trabalhando
                </Badge>
              )}
              {periodo.escala_tipo && (
                <span className="text-xs text-muted-foreground">
                  {periodo.escala_tipo.nome} ({periodo.escala_tipo.dias_trabalho}x{periodo.escala_tipo.dias_folga})
                </span>
              )}
            </div>

            <Separator />

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> Trabalho
                </p>
                <p className="font-medium">
                  {format(parseISO(periodo.data_inicio_trabalho), "dd/MM", { locale: ptBR })} →{" "}
                  {format(parseISO(periodo.data_fim_trabalho), "dd/MM", { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Coffee className="h-3 w-3" /> Folga
                </p>
                <p className="font-medium">
                  {format(parseISO(periodo.data_inicio_folga), "dd/MM", { locale: ptBR })} →{" "}
                  {format(parseISO(periodo.data_fim_folga), "dd/MM", { locale: ptBR })}
                </p>
              </div>
            </div>

            {/* Contagem regressiva */}
            {diasRestantes !== null && diasRestantes > 0 && (
              <div className={`rounded-lg p-3 text-center ${emFolga ? "bg-blue-50" : "bg-emerald-50"}`}>
                <p className="text-xs text-muted-foreground">
                  {emFolga ? "Retorno ao trabalho em" : "Folga começa em"}
                </p>
                <p className={`text-xl font-extrabold ${emFolga ? "text-blue-700" : "text-emerald-700"}`}>
                  {diasRestantes === 1 ? "Amanhã" : `${diasRestantes} dias`}
                </p>
              </div>
            )}
            {diasRestantes !== null && diasRestantes <= 0 && emFolga && (
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Retorno</p>
                <p className="text-xl font-extrabold text-blue-700">Hoje</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar, AlertTriangle, CheckCircle, User, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserObra } from "@/hooks/useUserObra";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";

interface UpcomingLeave {
  id: string;
  employee_id: string;
  employee_nome: string;
  employee_foto: string | null;
  escala_nome: string;
  data_inicio_folga: string;
  data_fim_folga: string;
  dias_para_folga: number;
  em_folga: boolean;
  conflito_detectado: boolean;
  conflito_autorizado: boolean;
}

export function UpcomingLeavesCard() {
  const [leaves, setLeaves] = useState<UpcomingLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const { obraId } = useUserObra();

  useEffect(() => {
    const fetchUpcomingLeaves = async () => {
      if (!obraId) {
        setLoading(false);
        return;
      }

      try {
        const { data: obraEmployees } = await supabase
          .from('obra_funcionarios')
          .select('employee_id')
          .eq('obra_id', obraId)
          .eq('status', true);

        if (!obraEmployees || obraEmployees.length === 0) {
          setLeaves([]);
          setLoading(false);
          return;
        }

        const employeeIds = obraEmployees.map(e => e.employee_id);
        const today = new Date().toISOString().split('T')[0];

        const { data: periods } = await supabase
          .from('escala_periodos')
          .select(`
            id,
            employee_id,
            data_inicio_folga,
            data_fim_folga,
            conflito_detectado,
            conflito_autorizado,
            escala_tipo:escala_tipos(nome),
            employee:employees(id, nome, foto_url)
          `)
          .in('employee_id', employeeIds)
          .gte('data_fim_folga', today)
          .order('data_inicio_folga', { ascending: true })
          .limit(10);

        if (periods) {
          const upcomingLeaves: UpcomingLeave[] = periods.map((p: any) => {
            const dataInicioFolga = new Date(p.data_inicio_folga);
            const dataFimFolga = new Date(p.data_fim_folga);
            const todayDate = new Date();
            const diasParaFolga = differenceInDays(dataInicioFolga, todayDate);
            const emFolga = todayDate >= dataInicioFolga && todayDate <= dataFimFolga;

            return {
              id: p.id,
              employee_id: p.employee_id,
              employee_nome: p.employee?.nome || 'Desconhecido',
              employee_foto: p.employee?.foto_url,
              escala_nome: p.escala_tipo?.nome || 'N/A',
              data_inicio_folga: p.data_inicio_folga,
              data_fim_folga: p.data_fim_folga,
              dias_para_folga: diasParaFolga,
              em_folga: emFolga,
              conflito_detectado: p.conflito_detectado,
              conflito_autorizado: p.conflito_autorizado,
            };
          });

          upcomingLeaves.sort((a, b) => {
            if (a.em_folga && !b.em_folga) return -1;
            if (!a.em_folga && b.em_folga) return 1;
            return a.dias_para_folga - b.dias_para_folga;
          });

          setLeaves(upcomingLeaves);
        }
      } catch (error) {
        console.error('Erro ao buscar folgas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUpcomingLeaves();
  }, [obraId]);

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const emFolgaHoje = leaves.filter(l => l.em_folga).length;
  const proximasFolgas = leaves.filter(l => !l.em_folga && l.dias_para_folga <= 7).length;

  if (loading) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <Calendar className="h-6 w-6 text-primary" />
            Próximas Folgas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-medium rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-3 text-xl font-bold">
              <Calendar className="h-6 w-6 text-primary" />
              Próximas Folgas
            </CardTitle>
            <CardDescription className="mt-1">Folgas agendadas da sua equipe</CardDescription>
          </div>
          <Link 
            to="/escalas" 
            className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Ver todas
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-emerald-50 rounded-xl text-center">
            <p className="text-3xl font-bold text-emerald-600">{emFolgaHoje}</p>
            <p className="text-sm text-muted-foreground font-medium">Em folga hoje</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-xl text-center">
            <p className="text-3xl font-bold text-blue-600">{proximasFolgas}</p>
            <p className="text-sm text-muted-foreground font-medium">Próximos 7 dias</p>
          </div>
        </div>

        {/* List */}
        {leaves.length > 0 ? (
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {leaves.slice(0, 6).map((leave) => (
              <div 
                key={leave.id} 
                className={`flex items-center justify-between p-4 rounded-xl ${
                  leave.em_folga ? 'bg-emerald-50' : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-11 w-11 ring-2 ring-background shadow-md">
                    <AvatarImage src={leave.employee_foto || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-blue-600 text-white text-sm font-bold">
                      {getInitials(leave.employee_nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{leave.employee_nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(leave.data_inicio_folga), "dd/MM", { locale: ptBR })} - {format(new Date(leave.data_fim_folga), "dd/MM", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {leave.conflito_detectado && (
                    leave.conflito_autorizado ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )
                  )}
                  {leave.em_folga ? (
                    <Badge className="bg-emerald-500 text-white border-0 text-xs font-semibold px-3 py-1 rounded-full">
                      Em folga
                    </Badge>
                  ) : leave.dias_para_folga === 0 ? (
                    <Badge className="bg-primary text-white border-0 text-xs font-semibold px-3 py-1 rounded-full">
                      Hoje
                    </Badge>
                  ) : leave.dias_para_folga === 1 ? (
                    <Badge variant="outline" className="text-xs font-semibold px-3 py-1 rounded-full">
                      Amanhã
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs font-semibold px-3 py-1 rounded-full">
                      {leave.dias_para_folga} dias
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma folga agendada</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

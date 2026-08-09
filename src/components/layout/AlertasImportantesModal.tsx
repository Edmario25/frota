import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CalendarX, ArrowRight, X } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Alerta {
  id: string;
  tipo: "atrasada" | "proxima";
  nome: string;
  dataInicioFolga: string;
  dataFimFolga: string;
  diasRestantes: number; // negativo = atrasado
}

/** Chave no localStorage para controlar "já visto hoje" */
function getDismissKey() {
  return `alertas_dismissed_${new Date().toISOString().slice(0, 10)}`;
}

function getDiasAviso(): number {
  try {
    const raw = localStorage.getItem("fleet_settings");
    const saved = raw ? JSON.parse(raw) : {};
    return typeof saved.diasAvisoFolga === "number" ? saved.diasAvisoFolga : 5;
  } catch { return 5; }
}

export function AlertasImportantesModal() {
  const { hasEscalaManagement, loading: loadingRole } = useUserRole();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  useEffect(() => {
    if (loadingRole) return;
    if (!hasEscalaManagement) return;

    // Só mostra uma vez por dia
    if (localStorage.getItem(getDismissKey())) return;

    carregarAlertas();
  }, [loadingRole, isAdmin, isGestor]);

  async function carregarAlertas() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diasAviso = getDiasAviso();
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + diasAviso);

    const { data } = await supabase
      .from("escala_periodos")
      .select(`
        id,
        data_inicio_folga,
        data_fim_folga,
        status,
        employees:employee_id (nome)
      `)
      .eq("status", "agendado")
      .order("data_inicio_folga");

    if (!data) return;

    const lista: Alerta[] = [];

    for (const p of data) {
      const inicio = parseISO(p.data_inicio_folga);
      const fim = parseISO(p.data_fim_folga);
      const nome = (p.employees as any)?.nome ?? "—";
      const diasParaInicio = differenceInDays(inicio, hoje);
      const diasParaFim = differenceInDays(fim, hoje);

      // Folga atrasada: fim da folga já passou mas status ainda é "agendado"
      if (diasParaFim < 0) {
        lista.push({
          id: p.id,
          tipo: "atrasada",
          nome,
          dataInicioFolga: p.data_inicio_folga,
          dataFimFolga: p.data_fim_folga,
          diasRestantes: diasParaFim,
        });
      }
      // Folga próxima: começa dentro de N dias
      else if (diasParaInicio >= 0 && diasParaInicio <= diasAviso) {
        lista.push({
          id: p.id,
          tipo: "proxima",
          nome,
          dataInicioFolga: p.data_inicio_folga,
          dataFimFolga: p.data_fim_folga,
          diasRestantes: diasParaInicio,
        });
      }
    }

    if (lista.length > 0) {
      // Ordenar: atrasadas primeiro, depois proximas por dias
      lista.sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo === "atrasada" ? -1 : 1;
        return a.diasRestantes - b.diasRestantes;
      });
      setAlertas(lista);
      setOpen(true);
    }
  }

  function handleFechar() {
    localStorage.setItem(getDismissKey(), "1");
    setOpen(false);
  }

  function handleVerEscalas() {
    handleFechar();
    navigate("/escalas");
  }

  const atrasadas = alertas.filter(a => a.tipo === "atrasada");
  const proximas  = alertas.filter(a => a.tipo === "proxima");

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleFechar(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
        {/* Header colorido */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg font-bold m-0">
                  Avisos Importantes
                </DialogTitle>
                <p className="text-amber-100 text-sm mt-0.5">
                  {alertas.length} alerta{alertas.length > 1 ? "s" : ""} de escala requer{alertas.length === 1 ? "" : "em"} atenção
                </p>
              </div>
            </div>
            <button
              onClick={handleFechar}
              className="h-7 w-7 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        {/* Lista de alertas */}
        <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100">

          {atrasadas.length > 0 && (
            <div>
              <div className="px-6 py-2 bg-red-50 flex items-center gap-2">
                <CalendarX className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-bold text-red-600 uppercase tracking-wide">
                  Folgas Atrasadas ({atrasadas.length})
                </span>
              </div>
              {atrasadas.map(a => (
                <div key={a.id} className="px-6 py-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CalendarX className="h-4 w-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{a.nome}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Folga: {format(parseISO(a.dataInicioFolga), "dd/MM", { locale: ptBR })} –{" "}
                      {format(parseISO(a.dataFimFolga), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="destructive" className="text-xs flex-shrink-0">
                    {Math.abs(a.diasRestantes)}d atraso
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {proximas.length > 0 && (
            <div>
              <div className="px-6 py-2 bg-amber-50 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">
                  Folgas Próximas ({proximas.length})
                </span>
              </div>
              {proximas.map(a => (
                <div key={a.id} className="px-6 py-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{a.nome}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Início: {format(parseISO(a.dataInicioFolga), "dd 'de' MMMM", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge className={cn(
                    "text-xs flex-shrink-0",
                    a.diasRestantes === 0
                      ? "bg-red-100 text-red-700 hover:bg-red-100"
                      : a.diasRestantes <= 2
                      ? "bg-orange-100 text-orange-700 hover:bg-orange-100"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                  )}>
                    {a.diasRestantes === 0 ? "Hoje" : `em ${a.diasRestantes}d`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            Não será exibido novamente hoje
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleFechar}>
              Fechar
            </Button>
            <Button size="sm" onClick={handleVerEscalas} className="gap-1.5">
              Ver Escalas
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

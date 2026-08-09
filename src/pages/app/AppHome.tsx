import { Car, Fuel, Wrench, MapPin, ChevronRight, Gauge, AlertCircle } from "lucide-react";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useEscalas } from "@/hooks/useEscalas";
import { format, isWithinInterval, parseISO, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Tab = "home" | "lancar" | "checklist" | "fumaca" | "escala" | "perfil";

const today = new Date();
const todayStr = today.toISOString().split("T")[0];

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

export function AppHome({ onNavigate }: { onNavigate: (tab: Tab, subType?: string) => void }) {
  const { vehicle, kmCycle, loading: vLoading } = useEmployeeVehicle();
  const { employee, loading: eLoading } = useCurrentEmployee();
  const { escalaPeriodos, loading: esLoading } = useEscalas();

  // Escala atual do funcionário
  const myPeriodos = employee
    ? escalaPeriodos.filter(p => p.employee_id === employee.id)
    : [];

  const currentPeriodo = myPeriodos.find(p =>
    isWithinInterval(today, {
      start: parseISO(p.data_inicio_trabalho),
      end: parseISO(p.data_fim_trabalho),
    })
  );

  const nextFolga = myPeriodos
    .filter(p => parseISO(p.data_inicio_folga) >= today)
    .sort((a, b) => a.data_inicio_folga.localeCompare(b.data_inicio_folga))[0];

  const loading = vLoading || eLoading || esLoading;

  const greeting = () => {
    const h = today.getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-700 px-4 pt-10 pb-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
            {employee ? getInitials(employee.nome) : "?"}
          </div>
          <div>
            <p className="text-blue-200 text-xs">{greeting()},</p>
            <p className="font-semibold text-sm leading-tight">
              {employee?.nome ?? "Carregando..."}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-blue-200 text-[10px]">
              {format(today, "EEEE", { locale: ptBR })}
            </p>
            <p className="text-sm font-semibold">
              {format(today, "dd/MM", { locale: ptBR })}
            </p>
          </div>
        </div>

        {/* Escala status */}
        {currentPeriodo && (
          <div className="bg-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-blue-100">Escala ativa</p>
              <p className="text-sm font-medium truncate">
                {currentPeriodo.escala_tipo?.nome ?? "—"}
                {" · "}trabalho até {format(parseISO(currentPeriodo.data_fim_trabalho), "dd/MM", { locale: ptBR })}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 -mt-4 space-y-4 pb-6">
        {/* Veículo card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Meu Veículo</p>
            {vehicle && (
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                vehicle.status === "em_uso"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-green-100 text-green-700"
              )}>
                {vehicle.status === "em_uso" ? "Em uso" : "Disponível"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : vehicle ? (
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Car className="h-7 w-7 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base text-slate-800 dark:text-slate-100">
                    {vehicle.placa}
                  </p>
                  <p className="text-sm text-slate-500 truncate">
                    {vehicle.marca} {vehicle.modelo} · {vehicle.ano}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Gauge className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">
                      {vehicle.quilometragem_atual?.toLocaleString("pt-BR") ?? "—"} km
                    </span>
                  </div>
                </div>
              </div>

              {kmCycle && (
                <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-amber-700 font-medium">Ciclo de KM</p>
                    <p className="text-xs text-amber-600">
                      {Number(kmCycle.km_atual ?? 0).toLocaleString("pt-BR")} /
                      {" "}{Number(kmCycle.km_limite ?? 0).toLocaleString("pt-BR")} km
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center">
              <Car className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Nenhum veículo atribuído</p>
            </div>
          )}
        </div>

        {/* Próxima folga */}
        {nextFolga && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🌴</span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500">Próxima folga</p>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                {format(parseISO(nextFolga.data_inicio_folga), "dd 'de' MMMM", { locale: ptBR })}
                {" – "}
                {format(parseISO(nextFolga.data_fim_folga), "dd 'de' MMMM", { locale: ptBR })}
              </p>
              <p className="text-xs text-green-600">
                {nextFolga.escala_tipo?.dias_folga ?? "?"} dias de folga
              </p>
            </div>
          </div>
        )}

        {/* Ações rápidas */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Ações Rápidas</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Fuel, label: "Abastecer",  color: "bg-blue-500",  tab: "lancar", subType: "abastecimento" },
              { icon: Wrench, label: "Manutenção", color: "bg-amber-500", tab: "lancar", subType: "manutencao" },
              { icon: ClipboardListIcon, label: "Checklist",  color: "bg-violet-500", tab: "checklist", subType: undefined },
              { icon: WindIcon, label: "Fumaça",     color: "bg-teal-500",  tab: "fumaca",  subType: undefined },
            ].map(({ icon: Icon, label, color, tab, subType }) => (
              <button
                key={label}
                onClick={() => onNavigate(tab as Tab, subType)}
                className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4 text-left active:scale-95 transition-transform"
              >
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0", color)}>
                  <Icon className="h-4.5 w-4.5 text-white" />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline icons to avoid extra imports
function ClipboardListIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>;
}
function WindIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2" /></svg>;
}

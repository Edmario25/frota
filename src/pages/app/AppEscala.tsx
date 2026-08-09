import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Bell, X, CheckCheck, PlaneTakeoff, PlaneLanding, Clock } from "lucide-react";
import { useEscalas } from "@/hooks/useEscalas";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useEscalaNotificacoes } from "@/hooks/useEscalaNotificacoes";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  parseISO, isWithinInterval, isSameMonth, isToday,
  addMonths, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type DayType = "trabalho" | "folga" | "neutro";

function getDayType(date: Date, periodos: any[], employeeId: string): DayType {
  for (const p of periodos) {
    if (p.employee_id !== employeeId) continue;
    if (isWithinInterval(date, { start: parseISO(p.data_inicio_trabalho), end: parseISO(p.data_fim_trabalho) }))
      return "trabalho";
    if (isWithinInterval(date, { start: parseISO(p.data_inicio_folga), end: parseISO(p.data_fim_folga) }))
      return "folga";
  }
  return "neutro";
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function AppEscala() {
  const { employee, loading: eLoading } = useCurrentEmployee();
  const { escalaPeriodos, escalaTipos, loading: esLoading } = useEscalas();
  const { notificacoes, marcarComoLida, marcarTodasComoLidas } = useEscalaNotificacoes();
  const [mes, setMes] = useState(new Date());

  const loading = eLoading || esLoading;

  const myPeriodos = employee
    ? escalaPeriodos.filter(p => p.employee_id === employee.id)
    : [];

  const today = new Date();
  const firstDay = startOfMonth(mes);
  const lastDay  = endOfMonth(mes);
  const days     = eachDayOfInterval({ start: firstDay, end: lastDay });

  // Pad início com dias vazios
  const startPad = firstDay.getDay(); // 0=Dom

  // Período de folga atual (em_folga confirmado OU dentro do intervalo de datas)
  const periodoEmFolga = myPeriodos.find(p =>
    p.status === 'em_folga' ||
    (p.status === 'agendado' && isWithinInterval(today, {
      start: parseISO(p.data_inicio_folga),
      end: parseISO(p.data_fim_folga),
    }))
  );

  // Próxima folga agendada (ainda não começou)
  const nextFolga = myPeriodos
    .filter(p => p.status !== 'concluido' && parseISO(p.data_inicio_folga) > today)
    .sort((a, b) => a.data_inicio_folga.localeCompare(b.data_inicio_folga))[0];

  // Escala atual (período de trabalho)
  const currentPeriodo = !periodoEmFolga
    ? myPeriodos.find(p =>
        isWithinInterval(today, {
          start: parseISO(p.data_inicio_trabalho),
          end: parseISO(p.data_fim_trabalho),
        })
      )
    : undefined;

  // Dias de trabalho e folga no mês
  const diasTrabalho = days.filter(d => getDayType(d, myPeriodos, employee?.id ?? "") === "trabalho").length;
  const diasFolga    = days.filter(d => getDayType(d, myPeriodos, employee?.id ?? "") === "folga").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-900 to-indigo-700 px-4 pt-10 pb-5 text-white">
        <h1 className="text-lg font-bold">Minha Escala</h1>
        <p className="text-indigo-200 text-sm">{employee?.nome ?? "—"}</p>
        {currentPeriodo && (
          <div className="mt-3 bg-white/10 rounded-xl px-3 py-2">
            <p className="text-xs text-indigo-200">Escala atual</p>
            <p className="text-sm font-semibold">{currentPeriodo.escala_tipo?.nome ?? "—"}</p>
            <p className="text-xs text-indigo-300">
              {currentPeriodo.escala_tipo?.dias_trabalho}d trabalho /
              {" "}{currentPeriodo.escala_tipo?.dias_folga}d folga
            </p>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4 pb-8">

        {/* ── Banner: Em folga agora ──────────────────────────────── */}
        {periodoEmFolga && (
          <div className="bg-green-500 rounded-2xl p-4 flex items-center gap-3 text-white shadow-md">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 text-2xl">
              🌴
            </div>
            <div className="flex-1">
              <p className="font-bold text-base">Você está de folga!</p>
              <p className="text-green-100 text-xs mt-0.5">
                Retorno previsto:{" "}
                <span className="font-semibold text-white">
                  {format(parseISO(periodoEmFolga.data_fim_folga), "dd 'de' MMMM", { locale: ptBR })}
                </span>
              </p>
              {periodoEmFolga.status === 'em_folga' && (
                <p className="text-green-100 text-[10px] mt-0.5 flex items-center gap-1">
                  <PlaneTakeoff className="h-3 w-3" />
                  Saída confirmada pelo gestor
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Notificações de escala ──────────────────────────────── */}
        {notificacoes.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-blue-600" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                  Notificações ({notificacoes.length})
                </p>
              </div>
              <button
                onClick={marcarTodasComoLidas}
                className="flex items-center gap-1 text-xs text-blue-600 font-medium"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {notificacoes.map(n => (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={cn(
                    "h-2 w-2 rounded-full mt-1.5 flex-shrink-0",
                    n.tipo === "conflito_autorizado" ? "bg-green-500"
                    : n.tipo === "escala_remarcada"  ? "bg-blue-500"
                    : n.tipo === "folga_atrasada"     ? "bg-red-500"
                    : "bg-amber-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{n.titulo}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{n.mensagem}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {format(new Date(n.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <button
                    onClick={() => marcarComoLida(n.id)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats do mês */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-2xl font-extrabold text-blue-600">{diasTrabalho}</p>
            <p className="text-xs text-slate-500 mt-0.5">Dias de trabalho</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-2xl font-extrabold text-green-600">{diasFolga}</p>
            <p className="text-xs text-slate-500 mt-0.5">Dias de folga</p>
          </div>
        </div>

        {/* Próxima folga */}
        {nextFolga && !periodoEmFolga && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-start gap-3">
              <span className="text-3xl flex-shrink-0">🌴</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Próxima folga</p>
                  {/* Badge: Prevista ou Confirmada */}
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full",
                    nextFolga.status === 'em_folga'
                      ? "bg-green-200 text-green-800"
                      : "bg-amber-100 text-amber-700"
                  )}>
                    {nextFolga.status === 'em_folga' ? "✅ Confirmada" : "⏳ Prevista"}
                  </span>
                </div>
                <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                  {format(parseISO(nextFolga.data_inicio_folga), "dd 'de' MMMM", { locale: ptBR })}
                  {" "}–{" "}
                  {format(parseISO(nextFolga.data_fim_folga), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {nextFolga.escala_tipo?.dias_folga ?? "?"} dias de descanso
                  </p>
                  <p className="text-xs text-slate-400">
                    {(() => {
                      const diff = Math.ceil((parseISO(nextFolga.data_inicio_folga).getTime() - today.getTime()) / 86400000);
                      return diff === 1 ? "Começa amanhã" : `Em ${diff} dias`;
                    })()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calendário */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Navegação do mês */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <button onClick={() => setMes(m => subMonths(m, 1))} className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>
            <p className="font-bold text-slate-800 dark:text-slate-100 capitalize">
              {format(mes, "MMMM yyyy", { locale: ptBR })}
            </p>
            <button
              onClick={() => setMes(m => addMonths(m, 1))}
              className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"
            >
              <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-700">
            {WEEKDAYS.map(w => (
              <div key={w} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase">
                {w}
              </div>
            ))}
          </div>

          {/* Dias */}
          <div className="grid grid-cols-7 p-2 gap-1">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map(day => {
              const type = getDayType(day, myPeriodos, employee?.id ?? "");
              const inMonth = isSameMonth(day, mes);
              const todayMark = isToday(day);

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all",
                    !inMonth && "opacity-30",
                    type === "trabalho" && "bg-blue-500 text-white",
                    type === "folga"    && "bg-green-500 text-white",
                    type === "neutro"   && "text-slate-600 dark:text-slate-300",
                    todayMark && type === "neutro" && "ring-2 ring-blue-400 ring-offset-1",
                    todayMark && type !== "neutro" && "ring-2 ring-white ring-offset-1 ring-offset-transparent",
                  )}
                >
                  {format(day, "d")}
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-slate-100 dark:border-slate-700">
            <LegendItem color="bg-blue-500"  label="Trabalho" />
            <LegendItem color="bg-green-500" label="Folga" />
            <LegendItem color="bg-slate-200 dark:bg-slate-600" label="Sem escala" />
          </div>
        </div>

        {/* Períodos do mês */}
        {myPeriodos.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Períodos Registrados</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {myPeriodos.slice(0, 5).map(p => (
                <div key={p.id} className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {p.escala_tipo?.nome ?? "—"}
                  </p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      Trab: {format(parseISO(p.data_inicio_trabalho), "dd/MM")} – {format(parseISO(p.data_fim_trabalho), "dd/MM")}
                    </span>
                    <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                      Folga: {format(parseISO(p.data_inicio_folga), "dd/MM")} – {format(parseISO(p.data_fim_folga), "dd/MM")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {myPeriodos.length === 0 && (
          <div className="text-center py-8">
            <CalendarDays className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Nenhuma escala cadastrada ainda.</p>
            <p className="text-slate-300 text-xs">Fale com o seu gestor.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-3 w-3 rounded-sm", color)} />
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

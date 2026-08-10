import { useState, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDepartamentos } from "@/hooks/useDepartamentos";
import { useCargos } from "@/hooks/useCargos";
import { useEscalas } from "@/hooks/useEscalas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PlaneTakeoff, PlaneLanding, Users, CalendarRange,
  AlertTriangle, Download, RefreshCw, Search, X,
  CheckCircle, Clock, CalendarDays, Loader2,
} from "lucide-react";
import {
  format, parseISO, differenceInDays, isWithinInterval,
  addDays, isAfter, isBefore, startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── tipos ────────────────────────────────────────────────────────────────────

interface PeriodoCompleto {
  id: string;
  employee_id: string;
  escala_tipo_id: string;
  data_inicio_trabalho: string;
  data_fim_trabalho: string;
  data_inicio_folga: string;
  data_fim_folga: string;
  status: string;
  conflito_detectado: boolean;
  conflito_autorizado: boolean;
  observacoes: string | null;
  // relações
  employee_nome: string;
  cargo_id: string | null;
  cargo_nome: string | null;
  departamento_id: string | null;
  departamento_nome: string | null;
  escala_tipo_nome: string;
  dias_trabalho: number;
  dias_folga_ciclo: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function downloadCSV(rows: string[][], filename: string) {
  const bom = "﻿";
  const csv = bom + rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function getStatusInfo(p: PeriodoCompleto, hoje: Date) {
  const folgaInicio = parseISO(p.data_inicio_folga);
  const folgaFim    = parseISO(p.data_fim_folga);
  const trabInicio  = parseISO(p.data_inicio_trabalho);
  const trabFim     = parseISO(p.data_fim_trabalho);

  if (p.status === "em_folga") {
    const diasRetorno = differenceInDays(folgaFim, hoje);
    return {
      label: "Em folga",
      color: "bg-green-100 text-green-800 border-green-200",
      icon: <PlaneTakeoff className="h-3 w-3" />,
      detalhe: diasRetorno >= 0 ? `Retorna em ${diasRetorno}d` : `Atrasado ${Math.abs(diasRetorno)}d`,
      detalheColor: diasRetorno >= 0 ? "text-green-600" : "text-red-600",
    };
  }
  if (p.status === "concluido") {
    return {
      label: "Concluído",
      color: "bg-slate-100 text-slate-600 border-slate-200",
      icon: <CheckCircle className="h-3 w-3" />,
      detalhe: `Retornou ${format(folgaFim, "dd/MM/yy")}`,
      detalheColor: "text-slate-400",
    };
  }
  // agendado
  const estaNoTrabalho = isWithinInterval(hoje, { start: trabInicio, end: trabFim });
  const estaNaFolga    = isWithinInterval(hoje, { start: folgaInicio, end: folgaFim });
  const diasParaFolga  = differenceInDays(folgaInicio, hoje);

  if (estaNaFolga) {
    return {
      label: "Folga pendente",
      color: "bg-amber-100 text-amber-800 border-amber-200",
      icon: <Clock className="h-3 w-3" />,
      detalhe: "Saída não confirmada",
      detalheColor: "text-amber-600",
    };
  }
  if (estaNoTrabalho) {
    return {
      label: "Trabalhando",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: <CalendarDays className="h-3 w-3" />,
      detalhe: diasParaFolga >= 0 ? `Folga em ${diasParaFolga}d` : "Escala activa",
      detalheColor: "text-blue-600",
    };
  }
  return {
    label: "Agendado",
    color: "bg-violet-100 text-violet-800 border-violet-200",
    icon: <CalendarDays className="h-3 w-3" />,
    detalhe: diasParaFolga >= 0 ? `Folga em ${diasParaFolga}d` : `Início em ${differenceInDays(trabInicio, hoje)}d`,
    detalheColor: "text-violet-600",
  };
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string; color: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={cn("text-3xl font-extrabold mt-1", color)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center opacity-80", color.replace("text-", "bg-").replace("-600", "-100").replace("-700", "-100"))}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function RelatorioEscalas() {
  const hoje = startOfDay(new Date());

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const [dataInicio,  setDataInicio]  = useState("");
  const [dataFim,     setDataFim]     = useState("");
  const [deptoId,     setDeptoId]     = useState("todos");
  const [cargoId,     setCargoId]     = useState("todos");
  const [tipoEscala,  setTipoEscala]  = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [quickFilter, setQuickFilter] = useState<"todos" | "hoje" | "7d" | "15d" | "30d" | "folga_agora" | "proximas" | "conflito">("todos");
  const [busca,       setBusca]       = useState("");

  // ── Dados base ───────────────────────────────────────────────────────────────
  const { departamentos } = useDepartamentos();
  const { cargos }        = useCargos();
  const { escalaTipos }   = useEscalas();

  const { data: periodos = [], isLoading, refetch } = useQuery({
    queryKey: ["relatorioEscalas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escala_periodos")
        .select(`
          *,
          employee:employees(
            id, nome, cargo_id,
            cargo:cargos(id, nome),
            departamento:departamentos!fk_employees_departamento(id, nome)
          ),
          escala_tipo:escala_tipos(id, nome, dias_trabalho, dias_folga)
        `)
        .order("data_inicio_folga", { ascending: false });

      if (error) throw error;

      return ((data ?? []) as any[]).map((p): PeriodoCompleto => ({
        id: p.id,
        employee_id: p.employee_id,
        escala_tipo_id: p.escala_tipo_id,
        data_inicio_trabalho: p.data_inicio_trabalho,
        data_fim_trabalho: p.data_fim_trabalho,
        data_inicio_folga: p.data_inicio_folga,
        data_fim_folga: p.data_fim_folga,
        status: p.status,
        conflito_detectado: p.conflito_detectado,
        conflito_autorizado: p.conflito_autorizado,
        observacoes: p.observacoes,
        employee_nome: p.employee?.nome ?? "—",
        cargo_id: p.employee?.cargo_id ?? null,
        cargo_nome: p.employee?.cargo?.nome ?? null,
        departamento_id: p.employee?.departamento?.id ?? null,
        departamento_nome: p.employee?.departamento?.nome ?? null,
        escala_tipo_nome: p.escala_tipo?.nome ?? "—",
        dias_trabalho: p.escala_tipo?.dias_trabalho ?? 0,
        dias_folga_ciclo: p.escala_tipo?.dias_folga ?? 0,
      }));
    },
  });

  // ── KPIs (sobre TODOS os dados, sem filtro de data) ──────────────────────────
  const kpis = useMemo(() => {
    const emFolga = periodos.filter(p =>
      p.status === "em_folga" ||
      (p.status === "agendado" && isWithinInterval(hoje, {
        start: parseISO(p.data_inicio_folga),
        end:   parseISO(p.data_fim_folga),
      }))
    );
    const proximas7 = periodos.filter(p =>
      p.status === "agendado" &&
      isAfter(parseISO(p.data_inicio_folga), hoje) &&
      isBefore(parseISO(p.data_inicio_folga), addDays(hoje, 8))
    );
    const proximas30 = periodos.filter(p =>
      p.status === "agendado" &&
      isAfter(parseISO(p.data_inicio_folga), hoje) &&
      isBefore(parseISO(p.data_inicio_folga), addDays(hoje, 31))
    );
    const retornando7 = periodos.filter(p =>
      (p.status === "em_folga") &&
      isAfter(parseISO(p.data_fim_folga), hoje) &&
      isBefore(parseISO(p.data_fim_folga), addDays(hoje, 8))
    );
    const conflitos = periodos.filter(p => p.conflito_detectado && !p.conflito_autorizado);
    const uniqueEmps = new Set(periodos.map(p => p.employee_id)).size;

    return { emFolga, proximas7, proximas30, retornando7, conflitos, uniqueEmps };
  }, [periodos, hoje]);

  // ── Filtros aplicados ─────────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    let result = periodos;

    // Busca por nome
    if (busca.trim()) {
      const q = busca.toLowerCase();
      result = result.filter(p =>
        p.employee_nome.toLowerCase().includes(q) ||
        (p.cargo_nome ?? "").toLowerCase().includes(q) ||
        (p.departamento_nome ?? "").toLowerCase().includes(q)
      );
    }

    // Departamento
    if (deptoId !== "todos")
      result = result.filter(p => p.departamento_id === deptoId);

    // Cargo
    if (cargoId !== "todos")
      result = result.filter(p => p.cargo_id === cargoId);

    // Tipo de escala
    if (tipoEscala !== "todos")
      result = result.filter(p => p.escala_tipo_id === tipoEscala);

    // Status
    if (statusFiltro !== "todos")
      result = result.filter(p => p.status === statusFiltro);

    // Filtro de data (pelo período de folga)
    if (dataInicio)
      result = result.filter(p => p.data_inicio_folga >= dataInicio || p.data_fim_folga >= dataInicio);
    if (dataFim)
      result = result.filter(p => p.data_inicio_folga <= dataFim);

    // Quick filters
    switch (quickFilter) {
      case "folga_agora":
        result = result.filter(p =>
          p.status === "em_folga" ||
          (p.status === "agendado" && isWithinInterval(hoje, {
            start: parseISO(p.data_inicio_folga),
            end:   parseISO(p.data_fim_folga),
          }))
        );
        break;
      case "proximas":
        result = result.filter(p =>
          p.status === "agendado" && isAfter(parseISO(p.data_inicio_folga), hoje)
        );
        break;
      case "7d":
        result = result.filter(p =>
          p.status === "agendado" &&
          isAfter(parseISO(p.data_inicio_folga), hoje) &&
          isBefore(parseISO(p.data_inicio_folga), addDays(hoje, 8))
        );
        break;
      case "15d":
        result = result.filter(p =>
          p.status === "agendado" &&
          isAfter(parseISO(p.data_inicio_folga), hoje) &&
          isBefore(parseISO(p.data_inicio_folga), addDays(hoje, 16))
        );
        break;
      case "30d":
        result = result.filter(p =>
          p.status === "agendado" &&
          isAfter(parseISO(p.data_inicio_folga), hoje) &&
          isBefore(parseISO(p.data_inicio_folga), addDays(hoje, 31))
        );
        break;
      case "conflito":
        result = result.filter(p => p.conflito_detectado && !p.conflito_autorizado);
        break;
    }

    return result;
  }, [periodos, busca, deptoId, cargoId, tipoEscala, statusFiltro, dataInicio, dataFim, quickFilter, hoje]);

  // ── Limpar filtros ───────────────────────────────────────────────────────────
  const limparFiltros = () => {
    setDataInicio(""); setDataFim(""); setDeptoId("todos"); setCargoId("todos");
    setTipoEscala("todos"); setStatusFiltro("todos"); setQuickFilter("todos"); setBusca("");
  };

  const temFiltro = busca || deptoId !== "todos" || cargoId !== "todos" ||
    tipoEscala !== "todos" || statusFiltro !== "todos" ||
    dataInicio || dataFim || quickFilter !== "todos";

  // ── Export CSV ───────────────────────────────────────────────────────────────
  const exportarCSV = () => {
    const header = [
      "Funcionário", "Cargo", "Departamento", "Tipo de Escala",
      "Início Trabalho", "Fim Trabalho", "Saída (Folga)", "Retorno (Folga)",
      "Dias Folga Ciclo", "Status", "Conflito", "Observações",
    ];
    const rows = filtrados.map(p => [
      p.employee_nome,
      p.cargo_nome ?? "",
      p.departamento_nome ?? "",
      p.escala_tipo_nome,
      format(parseISO(p.data_inicio_trabalho), "dd/MM/yyyy"),
      format(parseISO(p.data_fim_trabalho), "dd/MM/yyyy"),
      format(parseISO(p.data_inicio_folga), "dd/MM/yyyy"),
      format(parseISO(p.data_fim_folga), "dd/MM/yyyy"),
      String(p.dias_folga_ciclo),
      p.status,
      p.conflito_detectado ? (p.conflito_autorizado ? "Autorizado" : "Detectado") : "Não",
      p.observacoes ?? "",
    ]);
    downloadCSV([header, ...rows], `relatorio-escalas-${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  // ─────────────────────────────────────────────────────────────────────────────

  const quickBtns: { key: typeof quickFilter; label: string; count?: number; color?: string }[] = [
    { key: "todos",       label: "Todos",              count: periodos.length },
    { key: "folga_agora", label: "Em folga agora",     count: kpis.emFolga.length,    color: "green"  },
    { key: "proximas",    label: "Próximas folgas",    count: kpis.proximas30.length, color: "violet" },
    { key: "7d",          label: "Próx. 7 dias",       count: kpis.proximas7.length,  color: "blue"   },
    { key: "15d",         label: "Próx. 15 dias",                                     color: "blue"   },
    { key: "30d",         label: "Próx. 30 dias",      count: kpis.proximas30.length, color: "blue"   },
    { key: "conflito",    label: "Conflitos",          count: kpis.conflitos.length,  color: "red"    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatório de Escalas</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Visão completa dos períodos de trabalho e folga dos funcionários
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCSV} disabled={filtrados.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* ── KPIs ──────────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard
              icon={<Users className="h-5 w-5 text-blue-600" />}
              label="Funcionários com escala"
              value={kpis.uniqueEmps}
              sub="registros únicos"
              color="text-blue-600"
            />
            <KpiCard
              icon={<PlaneTakeoff className="h-5 w-5 text-green-600" />}
              label="Em folga agora"
              value={kpis.emFolga.length}
              sub="período ativo"
              color="text-green-600"
            />
            <KpiCard
              icon={<CalendarRange className="h-5 w-5 text-violet-600" />}
              label="Folgas — próx. 7 dias"
              value={kpis.proximas7.length}
              sub="saídas programadas"
              color="text-violet-600"
            />
            <KpiCard
              icon={<PlaneLanding className="h-5 w-5 text-amber-600" />}
              label="Retornando — 7 dias"
              value={kpis.retornando7.length}
              sub="previsão de retorno"
              color="text-amber-600"
            />
            <KpiCard
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
              label="Conflitos abertos"
              value={kpis.conflitos.length}
              sub="aguardando revisão"
              color="text-red-600"
            />
          </div>
        )}

        {/* ── Filtros rápidos ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {quickBtns.map(b => {
            const active = quickFilter === b.key;
            const colorMap: Record<string, string> = {
              green:  active ? "bg-green-600 text-white hover:bg-green-700 border-green-600" : "border-green-300 text-green-700 hover:bg-green-50",
              violet: active ? "bg-violet-600 text-white hover:bg-violet-700 border-violet-600" : "border-violet-300 text-violet-700 hover:bg-violet-50",
              blue:   active ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-600" : "border-blue-300 text-blue-700 hover:bg-blue-50",
              red:    active ? "bg-red-600 text-white hover:bg-red-700 border-red-600" : "border-red-300 text-red-700 hover:bg-red-50",
            };
            const cls = b.color
              ? colorMap[b.color]
              : active
                ? "bg-slate-900 text-white hover:bg-slate-800 border-slate-900"
                : "border-slate-300 text-slate-700 hover:bg-slate-50";

            return (
              <button
                key={b.key}
                onClick={() => setQuickFilter(b.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                  cls
                )}
              >
                {b.label}
                {b.count !== undefined && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                    active ? "bg-white/20" : "bg-slate-100 text-slate-600"
                  )}>
                    {b.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Painel de filtros ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Search className="h-4 w-4" />
                Filtros avançados
              </CardTitle>
              {temFiltro && (
                <button
                  onClick={limparFiltros}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar filtros
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Busca por nome */}
              <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs">Buscar funcionário</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Nome, cargo, departamento..."
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>

              {/* Departamento */}
              <div className="space-y-1">
                <Label className="text-xs">Departamento</Label>
                <Select value={deptoId} onValueChange={setDeptoId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os departamentos</SelectItem>
                    {departamentos.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cargo */}
              <div className="space-y-1">
                <Label className="text-xs">Cargo / Função</Label>
                <Select value={cargoId} onValueChange={setCargoId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os cargos</SelectItem>
                    {cargos.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo de escala */}
              <div className="space-y-1">
                <Label className="text-xs">Tipo de escala</Label>
                <Select value={tipoEscala} onValueChange={setTipoEscala}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    {escalaTipos.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="agendado">Agendado</SelectItem>
                    <SelectItem value="em_folga">Em folga</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Período de folga — data início */}
              <div className="space-y-1">
                <Label className="text-xs">Folga a partir de</Label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={e => setDataInicio(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {/* Período de folga — data fim */}
              <div className="space-y-1">
                <Label className="text-xs">Folga até</Label>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={e => setDataFim(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Tabela ────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold">
                Períodos de escala
                <span className="ml-2 text-muted-foreground font-normal">
                  {filtrados.length} resultado{filtrados.length !== 1 ? "s" : ""}
                  {periodos.length !== filtrados.length && ` de ${periodos.length}`}
                </span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <CalendarDays className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Nenhum período encontrado</p>
                {temFiltro && (
                  <button onClick={limparFiltros} className="text-xs text-primary mt-1 underline underline-offset-2">
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-xs font-semibold">Funcionário</TableHead>
                      <TableHead className="text-xs font-semibold">Cargo</TableHead>
                      <TableHead className="text-xs font-semibold hidden md:table-cell">Departamento</TableHead>
                      <TableHead className="text-xs font-semibold hidden lg:table-cell">Escala</TableHead>
                      <TableHead className="text-xs font-semibold">Saída</TableHead>
                      <TableHead className="text-xs font-semibold">Retorno</TableHead>
                      <TableHead className="text-xs font-semibold hidden lg:table-cell">Dias</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold">Detalhe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.map(p => {
                      const st = getStatusInfo(p, hoje);
                      const diasFolga = differenceInDays(
                        parseISO(p.data_fim_folga),
                        parseISO(p.data_inicio_folga)
                      ) + 1;

                      return (
                        <TableRow key={p.id} className="hover:bg-muted/20">
                          {/* Funcionário */}
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                {p.employee_nome.split(" ").map(s => s[0]).slice(0, 2).join("")}
                              </div>
                              <span className="font-medium text-sm">{p.employee_nome}</span>
                            </div>
                          </TableCell>

                          {/* Cargo */}
                          <TableCell className="py-3">
                            <span className="text-sm text-muted-foreground">
                              {p.cargo_nome ?? <span className="text-slate-300">—</span>}
                            </span>
                          </TableCell>

                          {/* Departamento */}
                          <TableCell className="py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {p.departamento_nome ?? <span className="text-slate-300">—</span>}
                            </span>
                          </TableCell>

                          {/* Escala */}
                          <TableCell className="py-3 hidden lg:table-cell">
                            <Badge variant="outline" className="text-xs font-medium">
                              {p.escala_tipo_nome}
                            </Badge>
                          </TableCell>

                          {/* Saída */}
                          <TableCell className="py-3">
                            <div>
                              <p className="text-sm font-semibold text-green-600">
                                {format(parseISO(p.data_inicio_folga), "dd/MM/yy")}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(parseISO(p.data_inicio_folga), "EEE", { locale: ptBR })}
                              </p>
                            </div>
                          </TableCell>

                          {/* Retorno */}
                          <TableCell className="py-3">
                            <div>
                              <p className="text-sm font-semibold text-blue-600">
                                {format(parseISO(p.data_fim_folga), "dd/MM/yy")}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(parseISO(p.data_fim_folga), "EEE", { locale: ptBR })}
                              </p>
                            </div>
                          </TableCell>

                          {/* Dias de folga */}
                          <TableCell className="py-3 hidden lg:table-cell">
                            <span className="text-sm font-semibold">{diasFolga}d</span>
                            <span className="text-[10px] text-muted-foreground ml-1">folga</span>
                          </TableCell>

                          {/* Status badge */}
                          <TableCell className="py-3">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                              st.color
                            )}>
                              {st.icon}
                              {st.label}
                            </span>
                            {p.conflito_detectado && !p.conflito_autorizado && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                                <span className="text-[9px] text-amber-600 font-medium">Conflito</span>
                              </div>
                            )}
                          </TableCell>

                          {/* Detalhe */}
                          <TableCell className="py-3">
                            <span className={cn("text-xs font-medium", st.detalheColor)}>
                              {st.detalhe}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

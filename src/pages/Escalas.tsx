import { useState, useEffect, useMemo, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, Clock, Plus, Edit, Trash2, Settings,
  AlertTriangle, CheckCircle, Briefcase, Coffee,
  Bell, CalendarRange, MoreHorizontal, X,
  LogOut, RotateCcw, Coffee as CoffeeIcon, ArrowLeftRight,
  PlaneTakeoff, PlaneLanding,
} from "lucide-react";
import { addDays, format, isWithinInterval, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEscalas, EscalaTipo, EscalaPeriodo } from "@/hooks/useEscalas";
import { useEscalaNotificacoes } from "@/hooks/useEscalaNotificacoes";
import { EscalaTipoFormModal } from "@/components/escalas/EscalaTipoFormModal";
import { EscalaPeriodoFormModal } from "@/components/escalas/EscalaPeriodoFormModal";
import { ConfirmDeleteModal } from "@/components/escalas/ConfirmDeleteModal";

/** Lê diasAvisoFolga do localStorage (padrão: 5) */
function getDiasAviso(): number {
  try {
    const raw = localStorage.getItem("fleet_settings");
    const saved = raw ? JSON.parse(raw) : {};
    return typeof saved.diasAvisoFolga === "number" ? saved.diasAvisoFolga : 5;
  } catch { return 5; }
}

// ─── View do funcionário: mostra apenas os próprios períodos ───────────────
const MinhaEscalaView = () => {
  const { user } = useAuth();
  const [periodos, setPeriodos] = useState<EscalaPeriodo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      // descobrir o employee_id do usuário logado
      const { data: emp } = await supabase
        .from('employees')
        .select('id, escala_tipo_id, escala_tipos:escala_tipo_id(nome, dias_trabalho, dias_folga)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!emp) { setLoading(false); return; }

      const { data } = await supabase
        .from('escala_periodos')
        .select(`
          *,
          escala_tipo:escala_tipo_id(nome, dias_trabalho, dias_folga)
        `)
        .eq('employee_id', emp.id)
        .order('data_inicio_trabalho', { ascending: false });

      setPeriodos((data as any) || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const hoje = new Date();

  const periodoAtual = periodos.find(p => {
    try {
      return isWithinInterval(hoje, {
        start: parseISO(p.data_inicio_trabalho),
        end: parseISO(p.data_fim_folga),
      });
    } catch { return false; }
  });

  const proximoPeriodo = periodos.find(p => parseISO(p.data_inicio_trabalho) > hoje);

  const emFolga = periodoAtual
    ? isWithinInterval(hoje, {
        start: parseISO(periodoAtual.data_inicio_folga),
        end: parseISO(periodoAtual.data_fim_folga),
      })
    : false;

  const getStatusBadge = (p: EscalaPeriodo) => {
    if (p.conflito_detectado && !p.conflito_autorizado)
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Conflito</Badge>;
    if (p.conflito_detectado && p.conflito_autorizado)
      return <Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />Autorizado</Badge>;
    if (emFolga && periodoAtual?.id === p.id)
      return <Badge className="bg-blue-100 text-blue-700 border-0"><Coffee className="h-3 w-3 mr-1" />Em Folga</Badge>;
    if (periodoAtual?.id === p.id)
      return <Badge className="bg-emerald-100 text-emerald-700 border-0"><Briefcase className="h-3 w-3 mr-1" />Trabalhando</Badge>;
    if (parseISO(p.data_inicio_trabalho) > hoje)
      return <Badge variant="outline">Agendado</Badge>;
    return <Badge variant="secondary">Concluído</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-2 text-muted-foreground">Carregando escala...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-screen-md mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-foreground tracking-tight">Minha Escala</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Acompanhe seus períodos de trabalho e folga</p>
      </div>

      {/* Status atual */}
      {periodoAtual ? (
        <Card className={`border-2 ${emFolga ? 'border-blue-300 bg-blue-50/50' : 'border-emerald-300 bg-emerald-50/50'}`}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3 mb-4">
              {emFolga
                ? <Coffee className="h-8 w-8 text-blue-600" />
                : <Briefcase className="h-8 w-8 text-emerald-600" />}
              <div>
                <p className={`text-lg font-bold ${emFolga ? 'text-blue-700' : 'text-emerald-700'}`}>
                  {emFolga ? 'Você está de folga' : 'Você está trabalhando'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Escala: {(periodoAtual as any).escala_tipo?.nome ?? '—'}
                  {(periodoAtual as any).escala_tipo && ` (${(periodoAtual as any).escala_tipo.dias_trabalho}x${(periodoAtual as any).escala_tipo.dias_folga})`}
                </p>
              </div>
            </div>

            <Separator className="mb-4" />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground font-medium mb-1 flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> Período de Trabalho
                </p>
                <p className="font-semibold">
                  {format(parseISO(periodoAtual.data_inicio_trabalho), "dd 'de' MMM", { locale: ptBR })} →{' '}
                  {format(parseISO(periodoAtual.data_fim_trabalho), "dd 'de' MMM", { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1 flex items-center gap-1">
                  <Coffee className="h-3.5 w-3.5" /> Período de Folga
                </p>
                <p className="font-semibold">
                  {format(parseISO(periodoAtual.data_inicio_folga), "dd 'de' MMM", { locale: ptBR })} →{' '}
                  {format(parseISO(periodoAtual.data_fim_folga), "dd 'de' MMM", { locale: ptBR })}
                </p>
              </div>
            </div>

            {/* Dias restantes */}
            {!emFolga && (() => {
              const diasParaFolga = Math.ceil((parseISO(periodoAtual.data_inicio_folga).getTime() - hoje.getTime()) / 86400000);
              return diasParaFolga > 0 ? (
                <div className="mt-4 rounded-lg bg-white/60 border border-emerald-200 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Folga começa em</p>
                  <p className="text-2xl font-extrabold text-emerald-700">
                    {diasParaFolga === 1 ? 'Amanhã' : `${diasParaFolga} dias`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(periodoAtual.data_inicio_folga), "dd/MM/yyyy")}
                  </p>
                </div>
              ) : null;
            })()}

            {emFolga && (() => {
              const diasRetorno = Math.ceil((parseISO(periodoAtual.data_fim_folga).getTime() - hoje.getTime()) / 86400000);
              return (
                <div className="mt-4 rounded-lg bg-white/60 border border-blue-200 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Retorno ao trabalho em</p>
                  <p className="text-2xl font-extrabold text-blue-700">
                    {diasRetorno <= 0 ? 'Hoje' : diasRetorno === 1 ? 'Amanhã' : `${diasRetorno} dias`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(periodoAtual.data_fim_folga), "dd/MM/yyyy")}
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-muted-foreground">Nenhum período de escala ativo no momento</p>
          </CardContent>
        </Card>
      )}

      {/* Histórico de períodos */}
      {periodos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Histórico de Períodos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trabalho</TableHead>
                  <TableHead>Folga</TableHead>
                  <TableHead>Escala</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {format(parseISO(p.data_inicio_trabalho), "dd/MM/yy", { locale: ptBR })} –{' '}
                      {format(parseISO(p.data_fim_trabalho), "dd/MM/yy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(parseISO(p.data_inicio_folga), "dd/MM/yy", { locale: ptBR })} –{' '}
                      {format(parseISO(p.data_fim_folga), "dd/MM/yy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(p as any).escala_tipo?.nome ?? '—'}
                    </TableCell>
                    <TableCell>{getStatusBadge(p)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── View do gestor: visão completa ────────────────────────────────────────
const Escalas = () => {
  const { hasEscalaManagement, isFuncionario } = useUserRole();
  const { escalaTipos, escalaPeriodos, loading, deleteEscalaTipo, deleteEscalaPeriodo, updateEscalaPeriodo } = useEscalas();
  const { criarNotificacao, enviarPush } = useEscalaNotificacoes();

  const [activeTab, setActiveTab] = useState("periodos");
  const [tipoModalOpen, setTipoModalOpen] = useState(false);
  const [periodoModalOpen, setPeriodoModalOpen] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<EscalaTipo | null>(null);
  const [selectedPeriodo, setSelectedPeriodo] = useState<EscalaPeriodo | null>(null);
  const [isRemarcando, setIsRemarcando] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'tipo' | 'periodo'; id: string; name: string } | null>(null);
  const [alertasDismissed, setAlertasDismissed] = useState<string[]>([]);
  const [autorizando, setAutorizando] = useState<string | null>(null);
  const [atualizandoStatus, setAtualizandoStatus] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "agendado" | "em_folga" | "concluido">("todos");

  const diasAviso = useMemo(getDiasAviso, []);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  /** Folgas próximas (dentro de N dias) que ainda não foram dispensadas */
  const alertasFolgaProxima = useMemo(() => {
    return escalaPeriodos.filter(p => {
      if (alertasDismissed.includes(p.id)) return false;
      const inicioFolga = new Date(p.data_inicio_folga);
      inicioFolga.setHours(0, 0, 0, 0);
      const diff = differenceInDays(inicioFolga, hoje);
      return diff >= 0 && diff <= diasAviso;
    });
  }, [escalaPeriodos, diasAviso, alertasDismissed, hoje]);

  /** Folgas atrasadas: data_fim_folga já passou mas período ainda está como 'agendado' */
  const alertasFolgaAtrasada = useMemo(() => {
    return escalaPeriodos.filter(p => {
      if (alertasDismissed.includes(`late-${p.id}`)) return false;
      const fimFolga = new Date(p.data_fim_folga);
      fimFolga.setHours(0, 0, 0, 0);
      return fimFolga < hoje && p.status === 'agendado';
    });
  }, [escalaPeriodos, alertasDismissed, hoje]);

  const handleEditTipo = (tipo: EscalaTipo) => {
    setSelectedTipo(tipo);
    setTipoModalOpen(true);
  };

  const handleEditPeriodo = (periodo: EscalaPeriodo) => {
    setIsRemarcando(false);
    setSelectedPeriodo(periodo);
    setPeriodoModalOpen(true);
  };

  const handleRemarcar = (periodo: EscalaPeriodo) => {
    setIsRemarcando(true);
    setSelectedPeriodo(periodo);
    setPeriodoModalOpen(true);
  };

  const handlePeriodoSaved = async (saved: EscalaPeriodo) => {
    if (!isRemarcando) return;
    const nome = saved.employee?.nome ?? "Funcionário";
    const dataFolga = format(new Date(saved.data_inicio_folga), "dd/MM/yyyy", { locale: ptBR });
    await criarNotificacao({
      employee_id: saved.employee_id,
      periodo_id: saved.id,
      tipo: "escala_remarcada",
      titulo: "Escala remarcada",
      mensagem: `Sua folga foi remarcada para ${dataFolga}.`,
    });
    await enviarPush(
      saved.employee_id,
      "Escala remarcada",
      `${nome}, sua folga foi remarcada para ${dataFolga}.`
    );
  };

  const handleConfirmarSaida = async (periodo: EscalaPeriodo) => {
    setAtualizandoStatus(periodo.id);
    try {
      await updateEscalaPeriodo(periodo.id, { status: 'em_folga' });
      const nome = periodo.employee?.nome ?? "Funcionário";
      const dataRetorno = format(addDays(parseISO(periodo.data_fim_folga), 1), "dd/MM/yyyy", { locale: ptBR });
      await criarNotificacao({
        employee_id: periodo.employee_id,
        periodo_id: periodo.id,
        tipo: "escala_remarcada",
        titulo: "Saída para folga confirmada ✅",
        mensagem: `Sua saída foi confirmada. Retorno previsto em ${dataRetorno}.`,
      });
      await enviarPush(
        periodo.employee_id,
        "Saída confirmada ✅",
        `${nome}, sua saída para folga foi registrada. Retorno em ${dataRetorno}.`
      );
    } catch (e) {
      console.error("Erro ao confirmar saída:", e);
    } finally {
      setAtualizandoStatus(null);
    }
  };

  const handleConfirmarRetorno = async (periodo: EscalaPeriodo) => {
    setAtualizandoStatus(periodo.id);
    try {
      await updateEscalaPeriodo(periodo.id, { status: 'concluido' });
      const nome = periodo.employee?.nome ?? "Funcionário";
      await criarNotificacao({
        employee_id: periodo.employee_id,
        periodo_id: periodo.id,
        tipo: "escala_remarcada",
        titulo: "Retorno ao trabalho confirmado",
        mensagem: `Seu retorno ao trabalho foi registrado pelo gestor.`,
      });
      await enviarPush(
        periodo.employee_id,
        "Retorno confirmado",
        `${nome}, seu retorno ao trabalho foi registrado.`
      );
    } catch (e) {
      console.error("Erro ao confirmar retorno:", e);
    } finally {
      setAtualizandoStatus(null);
    }
  };

  const handleAutorizar = async (periodo: EscalaPeriodo) => {
    setAutorizando(periodo.id);
    try {
      const updated = await updateEscalaPeriodo(periodo.id, { conflito_autorizado: true });
      const nome = periodo.employee?.nome ?? "Funcionário";
      const dataFolga = format(new Date(periodo.data_inicio_folga), "dd/MM/yyyy", { locale: ptBR });
      await criarNotificacao({
        employee_id: periodo.employee_id,
        periodo_id: periodo.id,
        tipo: "conflito_autorizado",
        titulo: "Conflito de escala autorizado",
        mensagem: `Seu conflito de folga para ${dataFolga} foi autorizado pelo gestor.`,
      });
      await enviarPush(
        periodo.employee_id,
        "Folga autorizada ✅",
        `${nome}, o conflito na sua folga de ${dataFolga} foi autorizado.`
      );
    } catch (e) {
      console.error("Erro ao autorizar:", e);
    } finally {
      setAutorizando(null);
    }
  };

  const handleDeleteClick = (type: 'tipo' | 'periodo', id: string, name: string) => {
    setDeleteTarget({ type, id, name });
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'tipo') {
        await deleteEscalaTipo(deleteTarget.id);
      } else {
        await deleteEscalaPeriodo(deleteTarget.id);
      }
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  const getStatusBadge = (periodo: EscalaPeriodo) => {
    if (periodo.status === 'em_folga') {
      return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400"><PlaneTakeoff className="h-3 w-3 mr-1" />Em Folga</Badge>;
    }
    if (periodo.status === 'concluido') {
      return <Badge variant="secondary"><PlaneLanding className="h-3 w-3 mr-1" />Concluído</Badge>;
    }
    if (periodo.conflito_detectado && !periodo.conflito_autorizado) {
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Conflito</Badge>;
    }
    if (periodo.conflito_detectado && periodo.conflito_autorizado) {
      return <div className="flex flex-wrap gap-1"><Badge variant="outline">Agendado</Badge><Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />Conflito autorizado</Badge></div>;
    }
    return <Badge variant="outline">Agendado</Badge>;
  };

  // Stats
  const periodosAtivos   = escalaPeriodos.filter(p => p.status === 'em_folga').length;
  const periodosAgendados = escalaPeriodos.filter(p => p.status === 'agendado').length;
  const conflitos         = escalaPeriodos.filter(p => p.conflito_detectado && !p.conflito_autorizado).length;

  // Períodos filtrados para a tabela
  const periodosFiltrados = useMemo(() =>
    filtroStatus === "todos"
      ? escalaPeriodos
      : escalaPeriodos.filter(p => p.status === filtroStatus),
    [escalaPeriodos, filtroStatus]
  );

  // A decisão de visualização precisa ocorrer depois de todos os hooks para
  // preservar a mesma ordem entre renderizações enquanto o perfil é carregado.
  if (isFuncionario) {
    return (
      <Layout>
        <MinhaEscalaView />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Escalas</h1>
            <p className="text-muted-foreground">
              Gerencie as escalas de trabalho e folgas da equipe
            </p>
          </div>
          {hasEscalaManagement && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSelectedTipo(null); setTipoModalOpen(true); }}>
                <Settings className="mr-2 h-4 w-4" />
                Tipos de Escala
              </Button>
              <Button className="gradient-primary" onClick={() => { setSelectedPeriodo(null); setPeriodoModalOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Período
              </Button>
            </div>
          )}
        </div>

        {/* ── Painel de alertas de folgas ─────────────────────────────── */}
        {(alertasFolgaAtrasada.length > 0 || alertasFolgaProxima.length > 0) && (
          <div className="space-y-2">
            {/* Folgas atrasadas — crítico */}
            {alertasFolgaAtrasada.map(p => {
              const dias = differenceInDays(hoje, new Date(p.data_fim_folga));
              return (
                <div
                  key={`late-${p.id}`}
                  className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 px-4 py-3"
                >
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                      Folga atrasada — {p.employee?.nome ?? "—"}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Deveria ter saído em{" "}
                      {format(new Date(p.data_inicio_folga), "dd/MM/yyyy")} e retornado em{" "}
                      {format(new Date(p.data_fim_folga), "dd/MM/yyyy")} · há {dias} dia{dias !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-red-700 hover:bg-red-100"
                      onClick={() => handleRemarcar(p)}
                    >
                      <CalendarRange className="h-3 w-3 mr-1" />
                      Remarcar
                    </Button>
                    <button
                      onClick={() => setAlertasDismissed(d => [...d, `late-${p.id}`])}
                      className="h-7 w-7 rounded flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Folgas próximas — aviso */}
            {alertasFolgaProxima.map(p => {
              const inicioFolga = new Date(p.data_inicio_folga);
              inicioFolga.setHours(0, 0, 0, 0);
              const dias = differenceInDays(inicioFolga, hoje);
              const podeConfirmar = p.status === 'agendado' && inicioFolga <= hoje;
              return (
                <div
                  key={p.id}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                    podeConfirmar
                      ? "border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-800"
                      : "border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800"
                  }`}
                >
                  {podeConfirmar
                    ? <PlaneTakeoff className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    : <Bell className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${podeConfirmar ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}`}>
                      {podeConfirmar ? "⏳ Aguardando confirmação de saída" : "Folga próxima"} — {p.employee?.nome ?? "—"}
                    </p>
                    <p className={`text-xs ${podeConfirmar ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {dias === 0
                        ? "Começa hoje"
                        : dias === 1
                        ? "Começa amanhã"
                        : `Começa em ${dias} dias`}
                      {" "}({format(inicioFolga, "dd/MM")} –{" "}
                      {format(new Date(p.data_fim_folga), "dd/MM/yyyy")}) · Escala{" "}
                      {p.escala_tipo?.nome ?? "—"}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {podeConfirmar && (
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                        disabled={atualizandoStatus === p.id}
                        onClick={() => handleConfirmarSaida(p)}
                      >
                        <PlaneTakeoff className="h-3 w-3 mr-1" />
                        {atualizandoStatus === p.id ? "Confirmando..." : "Confirmar saída"}
                      </Button>
                    )}
                    <button
                      onClick={() => setAlertasDismissed(d => [...d, p.id])}
                      className={`h-7 w-7 rounded flex items-center justify-center flex-shrink-0 ${
                        podeConfirmar
                          ? "text-green-400 hover:text-green-600 hover:bg-green-100"
                          : "text-amber-400 hover:text-amber-600 hover:bg-amber-100"
                      }`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tipos de Escala</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{escalaTipos.length}</div>
              <p className="text-xs text-muted-foreground">Configurados</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Períodos Agendados</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodosAgendados}</div>
              <p className="text-xs text-muted-foreground">Aguardando</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Em Folga Hoje</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodosAtivos}</div>
              <p className="text-xs text-muted-foreground">Funcionários</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conflitos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{conflitos}</div>
              <p className="text-xs text-muted-foreground">Não autorizados</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="periodos">Períodos de Escala</TabsTrigger>
            <TabsTrigger value="tipos">Tipos de Escala</TabsTrigger>
          </TabsList>

          <TabsContent value="periodos" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                <CardTitle>Períodos de Escala</CardTitle>
                {/* Filtro rápido por status */}
                <div className="flex gap-1 flex-wrap">
                  {([
                    { v: "todos",    label: "Todos" },
                    { v: "agendado", label: "Agendados" },
                    { v: "em_folga", label: "Em Folga" },
                    { v: "concluido",label: "Concluídos" },
                  ] as const).map(({ v, label }) => (
                    <button
                      key={v}
                      onClick={() => setFiltroStatus(v)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        filtroStatus === v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {label}
                      {v !== "todos" && (
                        <span className="ml-1 opacity-70">
                          ({escalaPeriodos.filter(p => p.status === v).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : periodosFiltrados.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="mx-auto h-12 w-12 mb-4 opacity-30" />
                    <p>Nenhum período {filtroStatus !== "todos" ? `com status "${filtroStatus}"` : "cadastrado"}</p>
                    {hasEscalaManagement && filtroStatus === "todos" && (
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => { setSelectedPeriodo(null); setPeriodoModalOpen(true); }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Primeiro Período
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Funcionário</TableHead>
                        <TableHead>Escala</TableHead>
                        <TableHead>Trabalho</TableHead>
                        <TableHead>Folga</TableHead>
                        <TableHead>Status</TableHead>
                        {hasEscalaManagement && <TableHead className="text-right">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {periodosFiltrados.map((periodo) => {
                        const inicioFolga = new Date(periodo.data_inicio_folga);
                        const fimFolga    = new Date(periodo.data_fim_folga);
                        const podeConfirmarSaida   = periodo.status === 'agendado' && inicioFolga <= hoje;
                        const podeConfirmarRetorno = periodo.status === 'em_folga';
                        return (
                        <TableRow
                          key={periodo.id}
                          className={
                            periodo.status === 'em_folga'  ? "bg-green-50/40 dark:bg-green-950/20" :
                            periodo.status === 'concluido' ? "opacity-60" : ""
                          }
                        >
                          <TableCell className="font-medium">{periodo.employee?.nome}</TableCell>
                          <TableCell>{periodo.escala_tipo?.nome}</TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(periodo.data_inicio_trabalho), "dd/MM/yy", { locale: ptBR })} –{" "}
                            {format(new Date(periodo.data_fim_trabalho), "dd/MM/yy", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className={periodo.status === 'em_folga' ? "text-green-700 dark:text-green-400 font-medium" : ""}>
                              {format(inicioFolga, "dd/MM/yy", { locale: ptBR })} –{" "}
                              {format(fimFolga, "dd/MM/yy", { locale: ptBR })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(periodo)}
                              {/* Botão inline de confirmação — visível sem abrir o "..." */}
                              {podeConfirmarSaida && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px] border-green-400 text-green-700 hover:bg-green-50"
                                  disabled={atualizandoStatus === periodo.id}
                                  onClick={() => handleConfirmarSaida(periodo)}
                                >
                                  <PlaneTakeoff className="h-3 w-3 mr-1" />
                                  {atualizandoStatus === periodo.id ? "..." : "Confirmar saída"}
                                </Button>
                              )}
                              {podeConfirmarRetorno && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px] border-blue-400 text-blue-700 hover:bg-blue-50"
                                  disabled={atualizandoStatus === periodo.id}
                                  onClick={() => handleConfirmarRetorno(periodo)}
                                >
                                  <PlaneLanding className="h-3 w-3 mr-1" />
                                  {atualizandoStatus === periodo.id ? "..." : "Confirmar retorno"}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          {hasEscalaManagement && (
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" disabled={atualizandoStatus === periodo.id}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {podeConfirmarSaida && (
                                    <DropdownMenuItem
                                      onClick={() => handleConfirmarSaida(periodo)}
                                      className="text-green-700 focus:text-green-700"
                                    >
                                      <PlaneTakeoff className="mr-2 h-4 w-4" />
                                      Confirmar saída para folga
                                    </DropdownMenuItem>
                                  )}
                                  {podeConfirmarRetorno && (
                                    <DropdownMenuItem
                                      onClick={() => handleConfirmarRetorno(periodo)}
                                      className="text-blue-700 focus:text-blue-700"
                                    >
                                      <PlaneLanding className="mr-2 h-4 w-4" />
                                      Confirmar retorno ao trabalho
                                    </DropdownMenuItem>
                                  )}
                                  {(podeConfirmarSaida || podeConfirmarRetorno) && <DropdownMenuSeparator />}
                                  <DropdownMenuItem onClick={() => handleRemarcar(periodo)}>
                                    <CalendarRange className="mr-2 h-4 w-4 text-blue-600" />
                                    Remarcar
                                  </DropdownMenuItem>
                                  {periodo.conflito_detectado && !periodo.conflito_autorizado && (
                                    <DropdownMenuItem onClick={() => handleAutorizar(periodo)} disabled={autorizando === periodo.id}>
                                      <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                                      {autorizando === periodo.id ? "Autorizando..." : "Autorizar conflito"}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleEditPeriodo(periodo)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => handleDeleteClick('periodo', periodo.id, periodo.employee?.nome || '')}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tipos" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Tipos de Escala</CardTitle>
                {hasEscalaManagement && (
                  <Button onClick={() => { setSelectedTipo(null); setTipoModalOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Tipo
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : escalaTipos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Settings className="mx-auto h-12 w-12 mb-4" />
                    <p>Nenhum tipo de escala cadastrado</p>
                    {hasEscalaManagement && (
                      <Button 
                        className="mt-4" 
                        variant="outline"
                        onClick={() => { setSelectedTipo(null); setTipoModalOpen(true); }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Primeiro Tipo
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Dias Trabalho</TableHead>
                        <TableHead>Dias Folga</TableHead>
                        <TableHead>Sobreposição</TableHead>
                        <TableHead>Descrição</TableHead>
                        {hasEscalaManagement && <TableHead className="text-right">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {escalaTipos.map((tipo) => (
                        <TableRow key={tipo.id}>
                          <TableCell className="font-medium">{tipo.nome}</TableCell>
                          <TableCell>{tipo.dias_trabalho}</TableCell>
                          <TableCell>{tipo.dias_folga}</TableCell>
                          <TableCell>
                            {tipo.permite_sobreposicao ? (
                              <Badge variant="secondary">Permitida</Badge>
                            ) : (
                              <Badge variant="outline">Não Permitida</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{tipo.descricao || "-"}</TableCell>
                          {hasEscalaManagement && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleEditTipo(tipo)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteClick('tipo', tipo.id, tipo.nome)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <EscalaTipoFormModal
        isOpen={tipoModalOpen}
        onClose={() => { setTipoModalOpen(false); setSelectedTipo(null); }}
        escalaTipo={selectedTipo}
      />

      <EscalaPeriodoFormModal
        isOpen={periodoModalOpen}
        onClose={() => { setPeriodoModalOpen(false); setSelectedPeriodo(null); setIsRemarcando(false); }}
        periodo={selectedPeriodo}
        onSaved={handlePeriodoSaved}
        resetStatusOnSave={isRemarcando}
      />

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteTarget(null); }}
        onConfirm={handleConfirmDelete}
        title={`Excluir ${deleteTarget?.type === 'tipo' ? 'Tipo de Escala' : 'Período'}`}
        description={`Tem certeza que deseja excluir ${deleteTarget?.type === 'tipo' ? 'o tipo de escala' : 'o período de'} "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
      />
    </Layout>
  );
};

export default Escalas;

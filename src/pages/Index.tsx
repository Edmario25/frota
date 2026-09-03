import { useI18n } from "@/i18n";
import { Layout } from "@/components/layout/Layout";
import { VehicleStatusChart } from "@/components/dashboard/VehicleStatusChart";
import { VehicleTypeChart } from "@/components/dashboard/VehicleTypeChart";
import { KilometrageChart } from "@/components/dashboard/KilometrageChart";
import { ObrasSummaryCard } from "@/components/dashboard/ObrasSummaryCard";
import { UpcomingLeavesCard } from "@/components/dashboard/UpcomingLeavesCard";
import { VencimentosCard } from "@/components/dashboard/VencimentosCard";
import { MyVehicleCard } from "@/components/employee/MyVehicleCard";
import { MyScheduleCard } from "@/components/employee/MyScheduleCard";
import { MyMaintenanceCard } from "@/components/employee/MyMaintenanceCard";
import { ObraEmployeesList } from "@/components/dashboard/ObraEmployeesList";
import { ObraMaintenanceCard } from "@/components/dashboard/ObraMaintenanceCard";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useObras } from "@/hooks/useObras";
import { useMaintenance } from "@/hooks/useMaintenance";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import {
  Users, Car, Wrench, HardHat, Truck, AlertTriangle,
  ArrowRight, BarChart3, ShieldAlert, ClipboardCheck, TriangleAlert,
  GraduationCap,
  Sparkles, Activity,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, iconBg, label, value, sub, subColor, footer,
}: {
  icon: React.ElementType;
  iconBg: string;
  label: string;
  value: number | string;
  sub?: string;
  subColor?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg flex flex-col gap-3">
      <div className={cn("absolute inset-x-0 top-0 h-1 opacity-80", iconBg)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
          <p className="text-3xl font-extrabold text-foreground tracking-tight leading-none">{value}</p>
          {sub && <p className={cn("text-xs mt-1.5 font-medium", subColor ?? "text-muted-foreground")}>{sub}</p>}
        </div>
        <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105", iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      {footer && <div className="border-t border-border/50 pt-2">{footer}</div>}
    </div>
  );
}

// ── Quick Link ────────────────────────────────────────────────────────────────
function QuickLink({ to, icon: Icon, color, label, sub }: {
  to: string; icon: React.ElementType; color: string; label: string; sub: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 px-3 py-3 rounded-xl border border-transparent hover:border-border/70 hover:bg-muted/50 transition-all"
    >
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm", color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Index = () => {
  const { t, date } = useI18n();
  const navigate = useNavigate();
  const { isFuncionario, hasAdminAccess, shouldFilterByObra, isGestorObra, hasFullAccess, loading: loadingRole } = useUserRole();
  const { employee, loading: loadingEmployee } = useCurrentEmployee();
  const { vehicles, getVehicleStats } = useVehicles();
  const { employees } = useEmployees();
  const { obras, getObraStats } = useObras();
  const { maintenanceRecords } = useMaintenance();
  const { user } = useAuth();
  const [vehicleStats, setVehicleStats] = useState({ disponivel: 0, em_uso: 0, manutencao: 0, alertas_km: 0 });
  const [smsStats, setSmsStats] = useState({ nearMissSemana: 0, desviosAbertos: 0, inspecoesHoje: 0 });
  const [trStats, setTrStats]   = useState({ vencidos: 0, aVencer: 0 });

  // Apenas funcionários puros (cargo funcionario) são redirecionados ao /app
  // Usuários com acesso_app_motorista podem usar ambas as interfaces
  useEffect(() => {
    if (loadingRole) return;
    if (isFuncionario) {
      navigate("/app", { replace: true });
    }
  }, [loadingRole, isFuncionario, navigate]);

  useEffect(() => {
    if (vehicles.length > 0) {
      getVehicleStats().then(setVehicleStats);
    }
  }, [vehicles, getVehicleStats]);

  // Busca estatísticas de SMS / Segurança
  useEffect(() => {
    const fetchSmsStats = async () => {
      const hoje = new Date().toISOString().split("T")[0];
      const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [nm, dev, insp] = await Promise.all([
        (supabase as any).from("sms_near_miss").select("id", { count: "exact", head: true }).gte("created_at", seteDiasAtras),
        (supabase as any).from("sms_desvios").select("id", { count: "exact", head: true }).eq("status", "aberto"),
        (supabase as any).from("sms_inspecoes").select("id", { count: "exact", head: true }).gte("created_at", hoje),
      ]);
      setSmsStats({
        nearMissSemana: nm.count ?? 0,
        desviosAbertos: dev.count ?? 0,
        inspecoesHoje: insp.count ?? 0,
      });
    };
    fetchSmsStats();
  }, []);

  // Busca totais de treinamentos vencidos / a vencer
  useEffect(() => {
    const hoje   = new Date().toISOString().split("T")[0]
    const limite = new Date(Date.now() + 60 * 86_400_000).toISOString().split("T")[0]
    Promise.all([
      (supabase as any).from("sms_colaborador_treinamentos")
        .select("id", { count: "exact", head: true }).eq("status", "vencido"),
      (supabase as any).from("sms_colaborador_treinamentos")
        .select("id", { count: "exact", head: true }).eq("status", "a_vencer")
        .lte("data_vencimento", limite),
    ]).then(([v, a]) => setTrStats({ vencidos: v.count ?? 0, aVencer: a.count ?? 0 }))
  }, []);

  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName   = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || t("usuário");
  const obraStats   = getObraStats();
  const manutAgend  = maintenanceRecords.filter(m => m.status === "agendada").length;
  const veicLeves   = vehicles.filter(v => v.tipo === "leve").length;
  const veicPesados = vehicles.filter(v => v.tipo === "pesado").length;
  const empAtivos   = employees.filter(e => e.status === "ativo").length;
  const smsTotal    = smsStats.nearMissSemana + smsStats.desviosAbertos;

  return (
    <Layout>
      <div className="space-y-6 max-w-[1440px] mx-auto">

        {/* ── Saudação ─────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-primary px-6 py-6 text-white shadow-lg md:px-8 md:py-7">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-400/15 blur-3xl"/><div className="absolute bottom-0 right-1/3 h-28 w-28 rounded-full bg-violet-400/10 blur-2xl"/>
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="mb-3 flex items-center gap-2 text-blue-200"><Sparkles className="h-4 w-4"/><p className="text-xs font-bold uppercase tracking-[.16em]">{date(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p></div><h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{t(greeting)}, {firstName}</h1><p className="mt-1 text-sm text-slate-300">{t(isFuncionario ? "Acompanhe seu veículo e suas atividades" : "Visão executiva da operação, obras, pessoas e segurança")}</p></div>
            {hasFullAccess&&<div className="grid grid-cols-3 gap-2 sm:gap-3">{[[HardHat,obraStats.em_andamento,"Obras"],[Users,empAtivos,"Pessoas"],[Activity,vehicles.length,"Veículos"]].map(([Icon,value,label])=><div key={String(label)} className="min-w-24 rounded-xl border border-white/10 bg-white/10 px-3 py-3 backdrop-blur-sm"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-blue-200"/><strong className="text-lg">{String(value)}</strong></div><p className="mt-1 text-[10px] uppercase tracking-wide text-slate-300">{t(String(label))}</p></div>)}</div>}
          </div>
        </div>

        {/* ── Vista do funcionário ─────────────────────────────────── */}
        {isFuncionario && (
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <MyVehicleCard />
              <MyScheduleCard />
            </div>
            <MyMaintenanceCard />
          </div>
        )}

        {/* ── Vista do gestor de obra ──────────────────────────────── */}
        {shouldFilterByObra && (
          <div className="space-y-5">
            <ObraEmployeesList />
            <ObraMaintenanceCard />
          </div>
        )}

        {/* ── Dashboard completo (admin / gestor_contrato) ─────────── */}
        {hasFullAccess && (
          <>
            <div className="flex items-end justify-between"><div><h2 className="text-lg font-bold">{t("Indicadores principais")}</h2><p className="text-xs text-muted-foreground">{t("Situação consolidada da operação neste momento")}</p></div><span className="hidden text-xs text-muted-foreground sm:block">{t("Atualização automática")}</span></div>
            {/* 5 KPIs principais */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

              {/* Obras */}
              <KpiCard
                icon={HardHat} iconBg="bg-violet-500" label={t("Obras Ativas")}
                value={obraStats.em_andamento}
                sub={t("{count} cadastradas", { count: obraStats.total })}
                subColor="text-violet-600"
                footer={
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{t("{count} funcionários ativos", { count: empAtivos })}</span>
                  </div>
                }
              />

              {/* Frota */}
              <KpiCard
                icon={Car} iconBg="bg-emerald-500" label={t("Frota Total")}
                value={vehicles.length}
                sub={t("{used} em uso · {available} disponíveis", { used: vehicleStats.em_uso, available: vehicleStats.disponivel })}
                footer={
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3 text-blue-500" />
                      {t("{count} leves", { count: veicLeves })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3 text-emerald-500" />
                      {t("{count} pesados", { count: veicPesados })}
                    </span>
                    {vehicleStats.alertas_km > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        {t("{count} alertas KM", { count: vehicleStats.alertas_km })}
                      </span>
                    )}
                  </div>
                }
              />

              {/* SMS / Segurança */}
              <KpiCard
                icon={ShieldAlert}
                iconBg={smsStats.nearMissSemana > 0 ? "bg-orange-500" : "bg-teal-500"}
                label={t("SMS · Segurança")}
                value={smsTotal}
                sub={t("{near} near-miss (7d) · {open} desvios abertos", { near: smsStats.nearMissSemana, open: smsStats.desviosAbertos })}
                subColor={smsTotal > 0 ? "text-orange-600" : "text-teal-600"}
                footer={
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ClipboardCheck className="h-3 w-3 text-teal-500" />
                    <span>{t("{count} inspeções hoje", { count: smsStats.inspecoesHoje })}</span>
                  </div>
                }
              />

              {/* Manutenções */}
              <KpiCard
                icon={Wrench}
                iconBg={manutAgend > 5 ? "bg-red-500" : "bg-amber-500"}
                label={t("Manutenções")}
                value={manutAgend}
                sub={t("Agendadas")}
                subColor={manutAgend > 5 ? "text-red-600" : "text-amber-600"}
              />

              {/* Treinamentos */}
              <KpiCard
                icon={GraduationCap}
                iconBg={trStats.vencidos > 0 ? "bg-red-500" : trStats.aVencer > 0 ? "bg-amber-500" : "bg-emerald-500"}
                label={t("Treinamentos")}
                value={trStats.vencidos + trStats.aVencer}
                sub={trStats.vencidos > 0
                  ? t("{expired} vencidos · {due} a vencer", { expired: trStats.vencidos, due: trStats.aVencer })
                  : trStats.aVencer > 0
                    ? t("{count} a vencer (60 dias)", { count: trStats.aVencer })
                    : t("Todos em dia ✅")}
                subColor={trStats.vencidos > 0 ? "text-red-600" : trStats.aVencer > 0 ? "text-amber-600" : "text-emerald-600"}
                footer={
                  <Link to="/sms/treinamentos" className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                    {t("Ver matriz")} <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />

            </div>

            {/* Corpo: gráficos + acesso rápido */}
            <div className="grid gap-5 xl:grid-cols-3">

              {/* Gráficos — 2/3 */}
              <div className="xl:col-span-2 space-y-5">
                <VehicleStatusChart />
                <VehicleTypeChart />
              </div>

              {/* Sidebar direita — 1/3 */}
              <div className="space-y-5">

                {/* Acesso Rápido */}
                <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
                  <div className="px-4 pt-4 pb-2 border-b border-border/50">
                    <p className="text-sm font-semibold text-foreground">{t("Acesso Rápido")}</p>
                  </div>
                  <div className="px-1 py-2 divide-y divide-border/30">
                    <QuickLink to="/obras"            icon={HardHat}     color="bg-violet-500"  label={t("Obras")}              sub={t("{count} em andamento", { count: obraStats.em_andamento })} />
                    <QuickLink to="/frota"            icon={Car}         color="bg-blue-500"    label={t("Veículos Leves")}      sub={t("{count} veículos", { count: veicLeves })} />
                    <QuickLink to="/veiculos-pesados" icon={Truck}       color="bg-emerald-500" label={t("Veículos Pesados")}    sub={t("{count} veículos", { count: veicPesados })} />
                    <QuickLink to="/manutencao"       icon={Wrench}      color="bg-amber-500"   label={t("Manutenção")}          sub={t("{count} agendadas", { count: manutAgend })} />
                    <QuickLink to="/funcionarios"     icon={Users}       color="bg-indigo-500"  label={t("Funcionários")}        sub={t("{count} ativos", { count: empAtivos })} />
                    <QuickLink to="/relatorios"       icon={BarChart3}   color="bg-slate-500"   label={t("Relatórios")}          sub={t("Custo de frota")} />
                  </div>
                </div>

                {/* Alertas de KM */}
                {vehicleStats.alertas_km > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("Alertas de Quilometragem")}</p>
                    </div>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      {t("Veículos próximos do limite de KM: {count}.", { count: vehicleStats.alertas_km })}
                    </p>
                    <Link
                      to="/frota"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 mt-2 hover:underline"
                    >
                      {t("Ver veículos")} <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                {/* Manutenções urgentes */}
                {manutAgend > 0 && (
                  <div className={cn(
                    "rounded-xl border p-4",
                    manutAgend > 5
                      ? "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800"
                      : "border-border/50 bg-card"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className={cn("h-4 w-4", manutAgend > 5 ? "text-red-600" : "text-amber-600")} />
                      <p className={cn("text-sm font-semibold", manutAgend > 5 ? "text-red-800 dark:text-red-300" : "text-foreground")}>
                        {t("Manutenções Agendadas")}
                      </p>
                    </div>
                    <p className={cn("text-sm", manutAgend > 5 ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
                      {t("Manutenções pendentes: {count}.", { count: manutAgend })}
                    </p>
                    <Link
                      to="/manutencao"
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold mt-2 hover:underline",
                        manutAgend > 5 ? "text-red-700 dark:text-red-300" : "text-primary"
                      )}
                    >
                      {t("Ver manutenções")} <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Vencimentos: treinamentos + documentos */}
            <VencimentosCard diasJanela={60} maxItens={10} />

            {/* Linha inferior: Obras + Escalas */}
            <div className="grid gap-5 lg:grid-cols-2">
              <ObrasSummaryCard />
              <UpcomingLeavesCard />
            </div>

            {/* KM Chart — linha completa */}
            <KilometrageChart />
          </>
        )}

        {/* ── Vista simplificada para gestor de obra ───────────────── */}
        {isGestorObra && !hasFullAccess && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard icon={Users}         iconBg="bg-blue-500"   label={t("Funcionários")}  value={empAtivos} sub={t("{count} cadastrados", { count: employees.length })} />
              <KpiCard icon={Car}           iconBg="bg-emerald-500" label={t("Veículos")}      value={vehicles.length} sub={t("{count} em uso", { count: vehicleStats.em_uso })} />
              <KpiCard icon={Wrench}        iconBg="bg-amber-500"  label={t("Manutenções")}   value={manutAgend} sub={t("Agendadas")} />
              <KpiCard icon={AlertTriangle} iconBg={vehicleStats.alertas_km > 0 ? "bg-red-500" : "bg-slate-400"} label={t("Alertas KM")} value={vehicleStats.alertas_km} sub={t("Próximos do limite")} />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <VehicleStatusChart />
              <UpcomingLeavesCard />
            </div>
            <KilometrageChart />
          </>
        )}

      </div>
    </Layout>
  );
};

export default Index;

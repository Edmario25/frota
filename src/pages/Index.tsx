import { Layout } from "@/components/layout/Layout";
import { VehicleStatusChart } from "@/components/dashboard/VehicleStatusChart";
import { VehicleTypeChart } from "@/components/dashboard/VehicleTypeChart";
import { KilometrageChart } from "@/components/dashboard/KilometrageChart";
import { ObrasSummaryCard } from "@/components/dashboard/ObrasSummaryCard";
import { UpcomingLeavesCard } from "@/components/dashboard/UpcomingLeavesCard";
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
import { Link, useNavigate } from "react-router-dom";
import {
  Users, Car, Wrench, HardHat, Truck, AlertTriangle,
  ArrowRight, BarChart3,
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
    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
          <p className="text-3xl font-extrabold text-foreground tracking-tight leading-none">{value}</p>
          {sub && <p className={cn("text-xs mt-1.5 font-medium", subColor ?? "text-muted-foreground")}>{sub}</p>}
        </div>
        <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", iconBg)}>
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
      className="group flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/60 transition-colors"
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
  const navigate = useNavigate();
  const { isFuncionario, hasAdminAccess, shouldFilterByObra, isGestorObra, hasFullAccess, loading: loadingRole } = useUserRole();
  const { employee, loading: loadingEmployee } = useCurrentEmployee();
  const { vehicles, getVehicleStats } = useVehicles();
  const { employees } = useEmployees();
  const { obras, getObraStats } = useObras();
  const { maintenanceRecords } = useMaintenance();
  const { user } = useAuth();
  const [vehicleStats, setVehicleStats] = useState({ disponivel: 0, em_uso: 0, manutencao: 0, alertas_km: 0 });

  // Funcionários e usuários com acesso ao app → redireciona ao /app
  // Aguarda dados carregarem antes de decidir
  useEffect(() => {
    if (loadingRole || loadingEmployee) return;
    if (isFuncionario || employee?.acesso_app_motorista === true) {
      navigate("/app", { replace: true });
    }
  }, [loadingRole, loadingEmployee, isFuncionario, employee?.acesso_app_motorista, navigate]);

  useEffect(() => {
    if (vehicles.length > 0) {
      getVehicleStats().then(setVehicleStats);
    }
  }, [vehicles, getVehicleStats]);

  const hour       = new Date().getHours();
  const greeting   = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName  = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "usuário";
  const obraStats  = getObraStats();
  const manutAgend = maintenanceRecords.filter(m => m.status === "agendada").length;
  const veicLeves  = vehicles.filter(v => v.tipo === "leve").length;
  const veicPesados = vehicles.filter(v => v.tipo === "pesado").length;
  const empAtivos  = employees.filter(e => e.status === "ativo").length;

  return (
    <Layout>
      <div className="space-y-6 max-w-screen-xl mx-auto">

        {/* ── Saudação ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border/50 bg-gradient-to-r from-primary/5 via-background to-background px-6 py-5">
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">{greeting}, {firstName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isFuncionario ? "Acompanhe seu veículo e suas atividades" : "Visão geral do sistema de gestão de frota"}
          </p>
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
            {/* 4 KPIs principais */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                icon={Users} iconBg="bg-blue-500" label="Funcionários"
                value={empAtivos}
                sub={`${employees.length} cadastrados`}
                subColor="text-blue-600"
              />

              <KpiCard
                icon={Car} iconBg="bg-emerald-500" label="Frota Total"
                value={vehicles.length}
                sub={`${vehicleStats.em_uso} em uso · ${vehicleStats.disponivel} disponíveis`}
                footer={
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3 text-blue-500" />
                      {veicLeves} leves
                    </span>
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3 text-emerald-500" />
                      {veicPesados} pesados
                    </span>
                    {vehicleStats.alertas_km > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        {vehicleStats.alertas_km} alertas KM
                      </span>
                    )}
                  </div>
                }
              />

              <KpiCard
                icon={Wrench}
                iconBg={manutAgend > 5 ? "bg-red-500" : "bg-amber-500"}
                label="Manutenções"
                value={manutAgend}
                sub="Agendadas"
                subColor={manutAgend > 5 ? "text-red-600" : "text-amber-600"}
              />

              <KpiCard
                icon={HardHat} iconBg="bg-violet-500" label="Obras Ativas"
                value={obraStats.em_andamento}
                sub={`${obraStats.total} no total`}
                subColor="text-violet-600"
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
                <div className="rounded-xl border border-border/50 bg-card shadow-card">
                  <div className="px-4 pt-4 pb-2 border-b border-border/50">
                    <p className="text-sm font-semibold text-foreground">Acesso Rápido</p>
                  </div>
                  <div className="px-1 py-2 divide-y divide-border/30">
                    <QuickLink to="/frota"        icon={Car}         color="bg-blue-500"   label="Veículos Leves"  sub={`${veicLeves} veículos`} />
                    <QuickLink to="/veiculos-pesados" icon={Truck}   color="bg-emerald-500" label="Veículos Pesados" sub={`${veicPesados} veículos`} />
                    <QuickLink to="/manutencao"   icon={Wrench}      color="bg-amber-500"  label="Manutenção"      sub={`${manutAgend} agendadas`} />
                    <QuickLink to="/funcionarios" icon={Users}       color="bg-indigo-500" label="Funcionários"    sub={`${empAtivos} ativos`} />
                    <QuickLink to="/obras"        icon={HardHat}     color="bg-violet-500" label="Obras"           sub={`${obraStats.em_andamento} em andamento`} />
                    <QuickLink to="/relatorios"   icon={BarChart3}   color="bg-slate-500"  label="Relatórios"      sub="Custo de frota" />
                  </div>
                </div>

                {/* Alertas de KM */}
                {vehicleStats.alertas_km > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Alertas de Quilometragem</p>
                    </div>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      <span className="font-bold">{vehicleStats.alertas_km}</span> veículo{vehicleStats.alertas_km > 1 ? "s" : ""} próximo do limite de KM.
                    </p>
                    <Link
                      to="/frota"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 mt-2 hover:underline"
                    >
                      Ver veículos <ArrowRight className="h-3 w-3" />
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
                        Manutenções Agendadas
                      </p>
                    </div>
                    <p className={cn("text-sm", manutAgend > 5 ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
                      <span className="font-bold">{manutAgend}</span> manutenção{manutAgend > 1 ? "ões" : ""} pendente{manutAgend > 1 ? "s" : ""}.
                    </p>
                    <Link
                      to="/manutencao"
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold mt-2 hover:underline",
                        manutAgend > 5 ? "text-red-700 dark:text-red-300" : "text-primary"
                      )}
                    >
                      Ver manutenções <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            </div>

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
              <KpiCard icon={Users}         iconBg="bg-blue-500"   label="Funcionários"  value={empAtivos} sub={`${employees.length} cadastrados`} />
              <KpiCard icon={Car}           iconBg="bg-emerald-500" label="Veículos"      value={vehicles.length} sub={`${vehicleStats.em_uso} em uso`} />
              <KpiCard icon={Wrench}        iconBg="bg-amber-500"  label="Manutenções"   value={manutAgend} sub="Agendadas" />
              <KpiCard icon={AlertTriangle} iconBg={vehicleStats.alertas_km > 0 ? "bg-red-500" : "bg-slate-400"} label="Alertas KM" value={vehicleStats.alertas_km} sub="Próximos do limite" />
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

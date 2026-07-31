import { Layout } from "@/components/layout/Layout";
import { MetricCard } from "@/components/dashboard/MetricCard";
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
import { Link } from "react-router-dom";
import { Users, Car, HardHat, Wrench, Truck, AlertTriangle, CheckCircle, Link2, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const Index = () => {
  const { role, isFuncionario, hasAdminAccess, shouldFilterByObra, hasObraManagement, isGestorObra, hasFullAccess } = useUserRole();
  const { employee } = useCurrentEmployee();
  const { vehicles, getVehicleStats } = useVehicles();
  const { employees } = useEmployees();
  const { obras, getObraStats } = useObras();
  const { maintenanceRecords } = useMaintenance();
  const { user } = useAuth();
  const [vehicleStats, setVehicleStats] = useState({ disponivel: 0, em_uso: 0, manutencao: 0, alertas_km: 0 });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || "usuário";

  useEffect(() => {
    const loadStats = async () => {
      const stats = await getVehicleStats();
      setVehicleStats(stats);
    };
    if (vehicles.length > 0) loadStats();
  }, [vehicles, getVehicleStats]);

  const getEmployeeVehicleCount = () => {
    if (!employee) return 0;
    return vehicles.filter(v => v.responsavel_id === employee.id).length;
  };

  const activeVehiclesCount = isFuncionario ? getEmployeeVehicleCount() : vehicleStats.disponivel + vehicleStats.em_uso;
  const obraStats = getObraStats();
  const manutencoesPendentes = maintenanceRecords.filter(m => m.status === 'agendada').length;
  const veiculosLeves = vehicles.filter(v => v.tipo === 'leve').length;
  const veiculosPesados = vehicles.filter(v => v.tipo === 'pesado').length;

  return (
    <Layout>
      <div className="space-y-6 max-w-screen-xl mx-auto">

        {/* Hero section */}
        <div className="rounded-xl border border-border/50 bg-gradient-to-r from-primary/5 via-background to-background px-6 py-5">
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isFuncionario
              ? "Acompanhe seu veículo e suas atividades"
              : "Visão geral do sistema de gestão de frota"}
          </p>
        </div>

        {/* Employee Section */}
        {isFuncionario && (
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <MyVehicleCard />
              <MyScheduleCard />
            </div>
            <MyMaintenanceCard />
          </div>
        )}

        {/* Gestor de Obra - Lista de Funcionários da Obra */}
        {shouldFilterByObra && (
          <div className="space-y-5">
            <ObraEmployeesList />
            <ObraMaintenanceCard />
          </div>
        )}

        {/* Gestor Geral / Admin Dashboard */}
        {hasFullAccess && (
          <>
            {/* Primary Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Funcionários"
                value={employees.length}
                change={`${employees.filter(e => e.status === 'ativo').length} ativos`}
                changeType="positive"
                icon={Users}
                variant="blue"
              />
              <MetricCard
                title="Veículos"
                value={vehicles.length}
                change={`${vehicleStats.em_uso} em uso`}
                changeType="positive"
                icon={Link2}
                variant="default"
              />
              <MetricCard
                title="Manutenções"
                value={manutencoesPendentes}
                change="Agendadas"
                changeType={manutencoesPendentes > 5 ? "negative" : "neutral"}
                icon={Wrench}
                variant={manutencoesPendentes > 5 ? "warning" : "default"}
              />
              <MetricCard
                title="Obras Ativas"
                value={obraStats.em_andamento}
                change={`${obraStats.total} total`}
                changeType="positive"
                icon={HardHat}
                variant="purple"
              />
            </div>

            {/* Secondary Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: "Veículos Leves",
                  count: veiculosLeves,
                  icon: Car,
                  color: "blue",
                  avail: vehicles.filter(v => v.tipo === 'leve' && v.status === 'disponivel').length,
                  uso: vehicles.filter(v => v.tipo === 'leve' && v.status === 'em_uso').length,
                },
                {
                  label: "Veículos Pesados",
                  count: veiculosPesados,
                  icon: Truck,
                  color: "emerald",
                  avail: vehicles.filter(v => v.tipo === 'pesado' && v.status === 'disponivel').length,
                  uso: vehicles.filter(v => v.tipo === 'pesado' && v.status === 'em_uso').length,
                },
                {
                  label: "Alertas de KM",
                  count: vehicleStats.alertas_km,
                  icon: AlertTriangle,
                  color: "amber",
                  avail: null,
                  uso: null,
                },
              ].map(item => (
                <div key={item.label} className="rounded-xl border border-border/50 bg-card p-5 shadow-card hover:shadow-md-custom transition-all duration-200 hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{item.label}</p>
                      <p className="text-3xl font-extrabold text-foreground tracking-tight">{item.count}</p>
                    </div>
                    <div className={cn(
                      "h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm",
                      item.color === "blue" ? "bg-blue-500" :
                      item.color === "emerald" ? "bg-emerald-500" : "bg-amber-500"
                    )}>
                      <item.icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  {item.avail !== null ? (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Badge className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-0 rounded-full">
                        <CheckCircle className="h-3 w-3 mr-1" />{item.avail} disponíveis
                      </Badge>
                      <Badge className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-50 border-0 rounded-full">
                        {item.uso} em uso
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-3">Próximos do limite de KM</p>
                  )}
                </div>
              ))}
            </div>

            {/* Quick access */}
            <div className="rounded-xl border border-border/50 bg-card p-5 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-foreground">Acesso Rápido</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { to: "/frota", icon: Car, color: "bg-blue-500", label: "Gerenciar Frota", sub: `${vehicles.length} veículos` },
                  { to: "/manutencao", icon: Wrench, color: "bg-amber-500", label: "Manutenções", sub: `${manutencoesPendentes} agendadas` },
                  { to: "/funcionarios", icon: Users, color: "bg-emerald-500", label: "Funcionários", sub: `${employees.filter(e => e.status === 'ativo').length} ativos` },
                  { to: "/obras", icon: HardHat, color: "bg-violet-500", label: "Obras", sub: `${obraStats.em_andamento} em andamento` },
                ].map(item => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group flex items-center gap-3 p-3.5 rounded-lg bg-muted/30 hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all duration-200"
                  >
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform", item.color)}>
                      <item.icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.sub}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Charts */}
            <div className="grid gap-5 lg:grid-cols-2">
              <VehicleStatusChart />
              <VehicleTypeChart />
            </div>

            <ObrasSummaryCard />
            <KilometrageChart />
          </>
        )}

        {/* Gestor de Obra simplified view */}
        {isGestorObra && !hasFullAccess && hasObraManagement && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Funcionários"
                value={employees.length}
                change={`${employees.filter(e => e.status === 'ativo').length} ativos`}
                changeType="positive"
                icon={Users}
                variant="blue"
              />
              <MetricCard
                title="Veículos"
                value={activeVehiclesCount}
                change={`${vehicleStats.em_uso} em uso`}
                changeType="positive"
                icon={Link2}
                variant="default"
              />
              <MetricCard
                title="Manutenções"
                value={manutencoesPendentes}
                change="Agendadas"
                changeType="neutral"
                icon={Wrench}
              />
              <MetricCard
                title="Alertas"
                value={vehicleStats.alertas_km}
                change="KM próximo do limite"
                changeType={vehicleStats.alertas_km > 0 ? "negative" : "positive"}
                icon={AlertTriangle}
                variant={vehicleStats.alertas_km > 0 ? "warning" : "default"}
              />
            </div>
            <UpcomingLeavesCard />
            <div className="grid gap-5 lg:grid-cols-2">
              <VehicleStatusChart />
              <KilometrageChart />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Index;

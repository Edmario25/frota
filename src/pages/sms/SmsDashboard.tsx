import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  ShieldCheck, AlertOctagon, ClipboardList, BookOpen,
  FileWarning, Package, GraduationCap, UserCheck, FileText,
  ArrowRight, TrendingUp, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ─────────────────────────────────────────────────────────────────
interface KpiData {
  desvios_abertos: number;
  desvios_criticos: number;
  treinamentos_vencidos: number;
  treinamentos_a_vencer: number;
  aprs_abertas: number;
  inspecoes_pendentes: number;
  dds_mes: number;
}

interface DesvioRecente {
  id: string;
  tipo_desvio: string;
  severidade: "leve" | "moderado" | "grave" | "critico";
  status: string;
  data_ocorrencia: string;
  obras: { nome: string } | null;
}

// ─── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, iconBg, label, value, sub, subColor, loading,
}: {
  icon: React.ElementType;
  iconBg: string;
  label: string;
  value: number;
  sub?: string;
  subColor?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-5 shadow-card">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-card flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        <p className="text-3xl font-extrabold text-foreground tracking-tight leading-none">{value}</p>
        {sub && <p className={cn("text-xs mt-1.5 font-medium", subColor ?? "text-muted-foreground")}>{sub}</p>}
      </div>
      <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", iconBg)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
    </div>
  );
}

// ─── Module Card ────────────────────────────────────────────────────────────
function ModuleCard({ to, icon: Icon, color, label, desc }: {
  to: string; icon: React.ElementType; color: string; label: string; desc: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card px-4 py-4 shadow-card hover:border-primary/30 hover:bg-muted/40 transition-all"
    >
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </Link>
  );
}

// ─── Severidade badge ────────────────────────────────────────────────────────
const sevColors: Record<string, string> = {
  leve:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  moderado: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  grave:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  critico:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsDashboard() {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [recentes, setRecentes] = useState<DesvioRecente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const hoje = new Date().toISOString().split("T")[0];
      const umMesAtras = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().split("T")[0];
      const umMesAfrente = new Date(Date.now() + 30 * 24 * 3600_000).toISOString().split("T")[0];

      const [
        { count: desvAbertos },
        { count: desvCriticos },
        { count: trVencidos },
        { count: trAVencer },
        { count: aprsAbertas },
        { count: inspPendentes },
        { count: ddsMes },
        { data: devs },
      ] = await Promise.all([
        (supabase as any).from("sms_desvios").select("id", { count: "exact", head: true }).in("status", ["aberto", "em_tratamento"]),
        (supabase as any).from("sms_desvios").select("id", { count: "exact", head: true }).eq("status", "aberto").eq("severidade", "critico"),
        (supabase as any).from("sms_colaborador_treinamentos").select("id", { count: "exact", head: true }).eq("status", "vencido"),
        (supabase as any).from("sms_colaborador_treinamentos").select("id", { count: "exact", head: true }).eq("status", "a_vencer"),
        (supabase as any).from("sms_aprs").select("id", { count: "exact", head: true }).eq("status", "aberta"),
        (supabase as any).from("sms_inspecoes").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        (supabase as any).from("sms_dds_sessoes").select("id", { count: "exact", head: true }).gte("data_sessao", umMesAtras).lte("data_sessao", hoje),
        (supabase as any)
          .from("sms_desvios")
          .select("id, tipo_desvio, severidade, status, data_ocorrencia, obras(nome)")
          .in("status", ["aberto", "em_tratamento"])
          .order("data_ocorrencia", { ascending: false })
          .limit(6),
      ]);

      setKpi({
        desvios_abertos:      desvAbertos ?? 0,
        desvios_criticos:     desvCriticos ?? 0,
        treinamentos_vencidos: trVencidos ?? 0,
        treinamentos_a_vencer: trAVencer ?? 0,
        aprs_abertas:         aprsAbertas ?? 0,
        inspecoes_pendentes:  inspPendentes ?? 0,
        dds_mes:              ddsMes ?? 0,
      });
      setRecentes((devs ?? []) as DesvioRecente[]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <Layout>
      <div className="space-y-6 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="rounded-xl border border-border/50 bg-gradient-to-r from-green-600/5 via-background to-background px-6 py-5">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-widest mb-1">SMS / SSMA</p>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Painel de Segurança</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestão integrada de saúde, segurança e meio ambiente
          </p>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={AlertOctagon}
            iconBg={kpi?.desvios_criticos ? "bg-red-500" : "bg-orange-500"}
            label="Desvios Abertos"
            value={kpi?.desvios_abertos ?? 0}
            sub={kpi?.desvios_criticos ? `${kpi.desvios_criticos} críticos` : "Nenhum crítico"}
            subColor={kpi?.desvios_criticos ? "text-red-600" : "text-green-600"}
            loading={loading}
          />
          <KpiCard
            icon={GraduationCap}
            iconBg={kpi?.treinamentos_vencidos ? "bg-red-500" : "bg-emerald-500"}
            label="Treinamentos"
            value={kpi?.treinamentos_vencidos ?? 0}
            sub={`${kpi?.treinamentos_a_vencer ?? 0} a vencer em 30 dias`}
            subColor={kpi?.treinamentos_vencidos ? "text-red-600" : "text-muted-foreground"}
            loading={loading}
          />
          <KpiCard
            icon={FileWarning}
            iconBg="bg-violet-500"
            label="APRs Abertas"
            value={kpi?.aprs_abertas ?? 0}
            sub="Análise de risco"
            loading={loading}
          />
          <KpiCard
            icon={ClipboardList}
            iconBg="bg-blue-500"
            label="Inspeções Pendentes"
            value={kpi?.inspecoes_pendentes ?? 0}
            sub={`${kpi?.dds_mes ?? 0} DDS este mês`}
            loading={loading}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">

          {/* Desvios recentes */}
          <div className="xl:col-span-2 rounded-xl border border-border/50 bg-card shadow-card">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
              <p className="text-sm font-semibold text-foreground">Desvios em Aberto</p>
              <Link to="/sms/desvios" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/30">
              {loading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
              {!loading && recentes.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">Nenhum desvio em aberto</p>
                  <p className="text-xs text-muted-foreground mt-1">Ótimo desempenho da equipe!</p>
                </div>
              )}
              {!loading && recentes.map(d => (
                <div key={d.id} className="px-5 py-3 flex items-center gap-3">
                  <AlertOctagon className={cn("h-4 w-4 flex-shrink-0", {
                    "text-blue-500": d.severidade === "leve",
                    "text-amber-500": d.severidade === "moderado",
                    "text-orange-500": d.severidade === "grave",
                    "text-red-500": d.severidade === "critico",
                  })} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{d.tipo_desvio}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.obras?.nome ?? "–"} · {new Date(d.data_ocorrencia + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize", sevColors[d.severidade])}>
                    {d.severidade}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Módulos */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1 mb-3">Módulos</p>
            <ModuleCard to="/sms/desvios"      icon={AlertOctagon}   color="bg-orange-500" label="Desvios"              desc="Registro e tratamento de não-conformidades" />
            <ModuleCard to="/sms/inspecoes"    icon={ClipboardList}  color="bg-blue-500"   label="Inspeções"            desc="Listas de verificação e auditorias" />
            <ModuleCard to="/sms/dds"          icon={BookOpen}       color="bg-teal-500"   label="DDS"                  desc="Diálogo Diário de Segurança" />
            <ModuleCard to="/sms/apr"          icon={FileWarning}    color="bg-violet-500" label="APR"                  desc="Análise Preliminar de Riscos" />
            <ModuleCard to="/sms/epis"         icon={Package}        color="bg-slate-500"  label="EPIs"                 desc="Controle de equipamentos de proteção" />
            <ModuleCard to="/sms/treinamentos" icon={GraduationCap}  color="bg-emerald-500" label="Treinamentos / ASO" desc="Matriz de treinamentos e exames" />
            <ModuleCard to="/sms/admissao"     icon={UserCheck}      color="bg-indigo-500" label="Admissão Digital"     desc="Checklist de integração de colaboradores" />
            <ModuleCard to="/sms/rdo"          icon={FileText}       color="bg-cyan-600"   label="RDO"                  desc="Relatório Diário de Obra" />
          </div>
        </div>
      </div>
    </Layout>
  );
}

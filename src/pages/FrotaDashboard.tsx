/**
 * Painel da Frota — a visão que faltava.
 *
 * O módulo de frota tinha telas (leves, pesados, manutenção, velocidade) mas
 * nenhuma porta de entrada: para saber como a frota estava, era preciso abrir
 * quatro telas e somar de cabeça. Este painel responde de uma vez o que o
 * gestor pergunta de manhã: quantos veículos estão de pé, o que venceu, o que
 * está parado, o que está bloqueado para sair e quanto isso custa.
 *
 * Segue a linguagem do Painel SMS de propósito — mesmos cartões, mesma grade,
 * mesma lista de módulos à direita. Quem usa um usa o outro sem reaprender.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleLiberacao } from "@/hooks/useVehicleLiberacao";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowRight, AlertTriangle, Car, CheckCircle2, ClipboardCheck, FileText,
  Gauge, ShieldAlert, Truck, Wrench, Ban, Activity, CalendarRange, Receipt,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Vencimento = {
  item_id: string;
  vehicle_id: string;
  placa: string;
  servico: string;
  situacao: "vencida" | "a_vencer" | "em_dia";
  gatilho: "km" | "horas" | "dias";
  bloqueia_veiculo: boolean;
  km_restante: number | null;
  horas_restantes: number | null;
  dias_restantes: number | null;
  folga_fracao: number | null;
};

type DocumentoVenc = {
  id: string;
  tipo: string;
  descricao: string | null;
  data_vencimento: string;
  vehicles: { placa: string } | null;
};

type Indicadores = {
  aderencia_pct: number | null;
  custo_total: number;
  custo_por_km: number | null;
  custo_por_hora: number | null;
  disponibilidade_pct: number | null;
  corretiva_pct_custo: number | null;
  ordens_corretivas: number;
  ordens_preventivas: number;
};

// ─── Formatação ──────────────────────────────────────────────────────────────

const brl = (v: number | null) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (v: number | null) =>
  v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** O que falta, na unidade do gatilho que vence primeiro — dizer "15 dias" de
 *  um item que vence por quilometragem confunde quem agenda a oficina. */
function restante(v: Vencimento) {
  const n = (x: number) => Math.abs(Math.round(x)).toLocaleString("pt-BR");
  if (v.gatilho === "km" && v.km_restante != null)
    return v.km_restante < 0 ? `${n(v.km_restante)} km vencidos` : `faltam ${n(v.km_restante)} km`;
  if (v.gatilho === "horas" && v.horas_restantes != null)
    return v.horas_restantes < 0 ? `${n(v.horas_restantes)} h vencidas` : `faltam ${n(v.horas_restantes)} h`;
  if (v.dias_restantes != null)
    return v.dias_restantes < 0 ? `${n(v.dias_restantes)} dias vencidos` : `faltam ${n(v.dias_restantes)} dias`;
  return "";
}

// ─── Cartões ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, iconBg, label, value, sub, subColor, loading, to,
}: {
  icon: React.ElementType;
  iconBg: string;
  label: string;
  value: string | number;
  sub?: string;
  subColor?: string;
  loading?: boolean;
  to?: string;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-5 shadow-card">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="mb-1 h-8 w-16" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const conteudo = (
    <>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-3xl font-extrabold leading-none tracking-tight text-foreground">{value}</p>
        {sub && <p className={cn("mt-1.5 text-xs font-medium", subColor ?? "text-muted-foreground")}>{sub}</p>}
      </div>
      <div className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl shadow-sm", iconBg)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
    </>
  );

  const classe = "rounded-xl border border-border/50 bg-card p-5 shadow-card flex items-start justify-between gap-3";
  return to
    ? <Link to={to} className={cn(classe, "transition-colors hover:border-primary/30 hover:bg-muted/40")}>{conteudo}</Link>
    : <div className={classe}>{conteudo}</div>;
}

function ModuleCard({ to, icon: Icon, color, label, desc }: {
  to: string; icon: React.ElementType; color: string; label: string; desc: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card px-4 py-4 shadow-card transition-all hover:border-primary/30 hover:bg-muted/40"
    >
      <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-sm", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight text-foreground">{label}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
    </Link>
  );
}

/** Indicador pequeno, para a faixa de desempenho do período. */
function Mini({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-extrabold leading-none", color ?? "text-foreground")}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Painel ──────────────────────────────────────────────────────────────────

export default function FrotaDashboard() {
  const { vehicles, loading: carregandoVeiculos, accessMessage } = useVehicles();

  const ativos = useMemo(
    () => vehicles.filter((v: any) => v.status !== "inativo"),
    [vehicles],
  );
  const { liberacaoMap, liberacaoLoading } = useVehicleLiberacao(ativos.map((v: any) => v.id));

  const [vencimentos, setVencimentos] = useState<Vencimento[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoVenc[]>([]);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [emOficina, setEmOficina] = useState(0);
  const [agendadas, setAgendadas] = useState(0);
  const [multasPendentes, setMultasPendentes] = useState(0);
  const [avarias30d, setAvarias30d] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setAviso("");
      const hoje = new Date().toISOString().slice(0, 10);
      const em30dias = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const ha30dias = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const ha90dias = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

      const resultados = await Promise.all([
        (supabase as any)
          .from("v_manutencao_vencimentos")
          .select("item_id, vehicle_id, placa, servico, situacao, gatilho, bloqueia_veiculo, km_restante, horas_restantes, dias_restantes, folga_fracao")
          .in("situacao", ["vencida", "a_vencer"])
          .order("folga_fracao", { ascending: true })
          .limit(60),
        (supabase as any)
          .from("vehicle_documentos")
          .select("id, tipo, descricao, data_vencimento, vehicles(placa)")
          .eq("vigente", true)
          .lte("data_vencimento", em30dias)
          .order("data_vencimento", { ascending: true })
          .limit(30),
        (supabase as any).rpc("manutencao_indicadores", { p_inicio: ha90dias, p_fim: hoje, p_obra_id: null }),
        (supabase as any).from("maintenance_records").select("id", { count: "exact", head: true }).eq("status", "em_andamento"),
        (supabase as any).from("maintenance_records").select("id", { count: "exact", head: true }).eq("status", "agendada"),
        (supabase as any).from("traffic_fines").select("id", { count: "exact", head: true }).eq("situacao", "pendente"),
        (supabase as any).from("damage_reports").select("id", { count: "exact", head: true }).gte("data_avaria", ha30dias),
      ]);

      if (cancelado) return;

      const primeiroErro = resultados.find((r: any) => r?.error)?.error;
      if (primeiroErro) setAviso(`Alguns indicadores não puderam ser carregados: ${primeiroErro.message}`);

      const [venc, docs, ind, oficina, agenda, multas, avarias] = resultados;
      setVencimentos((venc.data as Vencimento[]) ?? []);
      setDocumentos((docs.data as DocumentoVenc[]) ?? []);
      setIndicadores(((ind.data as Indicadores[]) ?? [])[0] ?? null);
      setEmOficina(oficina.count ?? 0);
      setAgendadas(agenda.count ?? 0);
      setMultasPendentes(multas.count ?? 0);
      setAvarias30d(avarias.count ?? 0);
      setCarregando(false);
    }

    void carregar();
    return () => { cancelado = true; };
  }, []);

  // ─── Contagens ─────────────────────────────────────────────────────────────

  const disponiveis = ativos.filter((v: any) => v.status === "disponivel").length;
  const emUso = ativos.filter((v: any) => v.status === "em_uso").length;
  const emManutencao = ativos.filter((v: any) => v.status === "manutencao").length;
  const leves = ativos.filter((v: any) => v.tipo !== "pesado").length;
  const pesados = ativos.filter((v: any) => v.tipo === "pesado").length;

  const vencidas = vencimentos.filter(v => v.situacao === "vencida");
  const criticasVencidas = vencidas.filter(v => v.bloqueia_veiculo);
  const aVencer = vencimentos.filter(v => v.situacao === "a_vencer");
  // Um veículo com três itens vencidos é um problema, não três.
  const veiculosComVencida = new Set(vencidas.map(v => v.vehicle_id)).size;

  const docsVencidos = documentos.filter(d => d.data_vencimento < new Date().toISOString().slice(0, 10)).length;

  const liberacoes = Object.values(liberacaoMap);
  const bloqueados = liberacoes.filter(l => l.status === "bloqueado").length;
  const aguardando = liberacoes.filter(l => l.status === "aguardando").length;
  const liberados = liberacoes.filter(l => l.status === "liberado").length;

  const carregandoTudo = carregando || carregandoVeiculos;

  return (
    <Layout>
      <div className="mx-auto max-w-screen-xl space-y-6">

        {/* Cabeçalho */}
        <div className="rounded-xl border border-border/50 bg-gradient-to-r from-blue-600/5 via-background to-background px-6 py-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-blue-600">Frota</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Painel da Frota</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Veículos, manutenção, liberação e custo em uma tela só
          </p>
        </div>

        {accessMessage && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
            {accessMessage}
          </div>
        )}
        {aviso && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
            <strong>Atenção:</strong> {aviso}
          </div>
        )}

        {/* Faixa de alerta: o que impede veículo de rodar hoje */}
        {!carregandoTudo && (criticasVencidas.length > 0 || bloqueados > 0) && (
          <div className="overflow-hidden rounded-xl border border-red-300 bg-red-50/70 dark:bg-red-950/20">
            <div className="flex items-center justify-between border-b border-red-200 px-5 py-3">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-red-700" />
                <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                  Veículos impedidos de sair
                </p>
              </div>
              <Link to="/manutencao" className="text-xs text-primary hover:underline">Abrir manutenção</Link>
            </div>
            <div className="grid gap-px bg-red-200/60 sm:grid-cols-2">
              <div className="bg-card px-4 py-3">
                <p className="text-2xl font-extrabold text-red-600">{bloqueados}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  bloqueados na liberação — checklist reprovado, documento vencido ou item crítico vencido
                </p>
              </div>
              <div className="bg-card px-4 py-3">
                <p className="text-2xl font-extrabold text-red-600">{criticasVencidas.length}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  itens críticos do plano vencidos — correia, freio, inspeção
                </p>
              </div>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={Car}
            iconBg="bg-blue-500"
            label="Frota ativa"
            value={ativos.length}
            sub={`${leves} leves · ${pesados} pesados`}
            loading={carregandoVeiculos}
            to="/frota"
          />
          <KpiCard
            icon={Wrench}
            iconBg={veiculosComVencida > 0 ? "bg-red-500" : "bg-emerald-500"}
            label="Manutenção vencida"
            value={veiculosComVencida}
            sub={aVencer.length > 0 ? `${aVencer.length} itens a vencer` : "Nada a vencer"}
            subColor={veiculosComVencida > 0 ? "text-red-600" : "text-green-600"}
            loading={carregandoTudo}
            to="/manutencao"
          />
          <KpiCard
            icon={ClipboardCheck}
            iconBg={bloqueados > 0 ? "bg-red-500" : aguardando > 0 ? "bg-amber-500" : "bg-emerald-500"}
            label="Liberação"
            value={liberados}
            sub={`${bloqueados} bloqueados · ${aguardando} aguardando checklist`}
            subColor={bloqueados > 0 ? "text-red-600" : "text-muted-foreground"}
            loading={liberacaoLoading || carregandoVeiculos}
          />
          <KpiCard
            icon={FileText}
            iconBg={docsVencidos > 0 ? "bg-red-500" : documentos.length > 0 ? "bg-amber-500" : "bg-emerald-500"}
            label="Documentos"
            value={documentos.length}
            sub={docsVencidos > 0 ? `${docsVencidos} já vencidos` : "Nenhum vencido"}
            subColor={docsVencidos > 0 ? "text-red-600" : "text-green-600"}
            loading={carregando}
            to="/manutencao"
          />
        </div>

        {/* Operação de hoje */}
        <div className="grid divide-x divide-border/50 rounded-xl border border-border/50 bg-card shadow-card sm:grid-cols-2 lg:grid-cols-6">
          <Mini label="Disponíveis" value={String(disponiveis)} color="text-emerald-600" />
          <Mini label="Em uso" value={String(emUso)} color="text-blue-600" />
          <Mini label="Em manutenção" value={String(emManutencao)} color="text-amber-600" hint={`${emOficina} OS em andamento`} />
          <Mini label="Agendadas" value={String(agendadas)} hint="serviços na fila" />
          <Mini label="Multas pendentes" value={String(multasPendentes)} color={multasPendentes > 0 ? "text-orange-600" : undefined} />
          <Mini label="Avarias (30 dias)" value={String(avarias30d)} color={avarias30d > 0 ? "text-orange-600" : undefined} />
        </div>

        {/* Desempenho do período */}
        <div className="rounded-xl border border-border/50 bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border/50 px-5 pb-3 pt-5">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Desempenho — últimos 90 dias</p>
            </div>
            <Link to="/manutencao" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver indicadores <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid divide-x divide-border/50 sm:grid-cols-2 lg:grid-cols-5">
            <Mini
              label="Aderência ao plano"
              value={pct(indicadores?.aderencia_pct ?? null)}
              hint="concluídas no prazo"
              color={indicadores?.aderencia_pct == null ? undefined
                : indicadores.aderencia_pct >= 90 ? "text-green-600"
                  : indicadores.aderencia_pct < 70 ? "text-destructive" : "text-amber-600"}
            />
            <Mini label="Custo por km" value={brl(indicadores?.custo_por_km ?? null)} hint="veículos medidos em km" />
            <Mini label="Custo por hora" value={brl(indicadores?.custo_por_hora ?? null)} hint="equipamentos com horímetro" />
            <Mini
              label="Disponibilidade"
              value={pct(indicadores?.disponibilidade_pct ?? null)}
              hint="fora da oficina"
              color={indicadores?.disponibilidade_pct == null ? undefined
                : indicadores.disponibilidade_pct >= 95 ? "text-green-600"
                  : indicadores.disponibilidade_pct < 85 ? "text-destructive" : "text-amber-600"}
            />
            <Mini
              label="Corretiva no custo"
              value={pct(indicadores?.corretiva_pct_custo ?? null)}
              hint={`${indicadores?.ordens_corretivas ?? 0} corretivas · ${indicadores?.ordens_preventivas ?? 0} preventivas`}
              color={indicadores?.corretiva_pct_custo == null ? undefined
                : indicadores.corretiva_pct_custo <= 30 ? "text-green-600"
                  : indicadores.corretiva_pct_custo > 50 ? "text-destructive" : "text-amber-600"}
            />
          </div>
          {!carregando && (indicadores?.custo_por_km == null && indicadores?.custo_por_hora == null) && (
            <p className="border-t border-border/50 px-5 py-2.5 text-xs text-amber-600">
              Sem custo por unidade no período: é falta de medição registrada, não manutenção de graça.
            </p>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-3">

          {/* Vencimentos mais críticos */}
          <div className="rounded-xl border border-border/50 bg-card shadow-card xl:col-span-2">
            <div className="flex items-center justify-between border-b border-border/50 px-5 pb-3 pt-5">
              <p className="text-sm font-semibold text-foreground">O que vence primeiro</p>
              <Link to="/manutencao" className="flex items-center gap-1 text-xs text-primary hover:underline">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/30">
              {carregando && Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}

              {!carregando && vencimentos.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
                  <p className="text-sm font-medium text-foreground">Nenhum vencimento à vista</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Se nenhum plano foi aplicado ainda, esta lista fica vazia por falta de plano, não por frota em dia.
                  </p>
                </div>
              )}

              {!carregando && vencimentos.slice(0, 8).map(v => (
                <div key={`${v.item_id}-${v.vehicle_id}`} className="flex items-center gap-3 px-5 py-3">
                  {v.situacao === "vencida"
                    ? <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
                    : <CalendarRange className="h-4 w-4 flex-shrink-0 text-amber-500" />}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                      {v.servico}
                      {v.bloqueia_veiculo && <ShieldAlert className="h-3 w-3 flex-shrink-0 text-destructive" />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{v.placa}</p>
                  </div>
                  <Badge
                    variant={v.situacao === "vencida" ? "destructive" : "outline"}
                    className={cn("flex-shrink-0 text-[11px]", v.situacao !== "vencida" && "border-amber-300 text-amber-700")}
                  >
                    {restante(v)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Módulos */}
          <div className="space-y-2">
            <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Módulos</p>
            <ModuleCard to="/frota"            icon={Car}            color="bg-blue-500"   label="Veículos Leves"       desc="Cadastro, quilometragem e locação" />
            <ModuleCard to="/veiculos-pesados" icon={Truck}          color="bg-slate-600"  label="Veículos Pesados"     desc="Equipamentos por horímetro e inspeções" />
            <ModuleCard to="/manutencao"       icon={Wrench}         color="bg-amber-500"  label="Manutenção"           desc="Planos, vencimentos, OS e indicadores" />
            <ModuleCard to="/sms/velocidade"   icon={Gauge}          color="bg-orange-500" label="Controle de Velocidade" desc="Radares, zonas GPS e infrações" />
            <ModuleCard to="/relatorios"       icon={Receipt}        color="bg-teal-600"   label="Relatórios"           desc="Custos, consumo e uso da frota" />
          </div>
        </div>
      </div>
    </Layout>
  );
}

/**
 * Vencimentos da frota no painel principal.
 *
 * O dashboard mostrava só os vencimentos de RH. Manutenção vencida e documento
 * de veículo a vencer apareciam apenas dentro de Manutenção e nas telas de
 * frota — longe de quem abre o sistema de manhã.
 *
 * O card fala a mesma língua do VencimentosCard do RH de propósito: mesma
 * contagem (vencido, crítico, a vencer), mesmo formato. Quem já lê um lê o
 * outro sem reaprender.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { useI18n } from "@/i18n";

type Item = {
  id: string;
  tipo: "manutencao" | "documento";
  nome: string;        // serviço ou documento
  veiculo: string;     // placa
  critico: boolean;    // item do plano que para o veículo
  detalhe: string;     // "faltam 320 km", "venceu há 4 dias"
  ordem: number;       // folga para ordenar: negativo = vencido
  status: "vencido" | "critico" | "atencao";
};

const statusCfg = {
  vencido: { cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", dot: "bg-red-500", label: "Vencido" },
  critico: { cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", dot: "bg-orange-500", label: "Crítico" },
  atencao: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", dot: "bg-amber-500", label: "A vencer" },
};

function diasAte(iso: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc = new Date(iso); venc.setHours(0, 0, 0, 0);
  return Math.round((venc.getTime() - hoje.getTime()) / 86_400_000);
}

export function VencimentosFrotaCard({
  diasJanela = 60,
  maxItens = 6,
}: { diasJanela?: number; maxItens?: number }) {
  const { t } = useI18n();
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(false);
    try {
      const limiteISO = new Date(Date.now() + diasJanela * 86_400_000).toISOString().slice(0, 10);

      const [manut, docs] = await Promise.all([
        (supabase as any)
          .from("v_manutencao_vencimentos")
          .select("item_id, vehicle_id, placa, servico, situacao, gatilho, bloqueia_veiculo, km_restante, horas_restantes, dias_restantes, folga_fracao")
          .in("situacao", ["vencida", "a_vencer"])
          .order("folga_fracao", { ascending: true })
          .limit(50),
        (supabase as any)
          .from("vehicle_documentos")
          .select("id, tipo, descricao, data_vencimento, vehicles(placa)")
          .eq("vigente", true)
          .lte("data_vencimento", limiteISO)
          .order("data_vencimento", { ascending: true })
          .limit(50),
      ]);

      if (manut.error) throw manut.error;

      const lista: Item[] = [];

      for (const m of (manut.data as any[]) ?? []) {
        // O detalhe fala na unidade do gatilho que vence primeiro: dizer "faltam
        // 15 dias" de um item que vence por quilômetro confunde quem agenda.
        const detalhe =
          m.gatilho === "km" && m.km_restante != null
            ? (m.km_restante < 0
                ? t("Venceu há {count} km", { count: Math.abs(Math.round(m.km_restante)) })
                : t("Faltam {count} km", { count: Math.round(m.km_restante) }))
            : m.gatilho === "horas" && m.horas_restantes != null
              ? (m.horas_restantes < 0
                  ? t("Venceu há {count} h", { count: Math.abs(Math.round(m.horas_restantes)) })
                  : t("Faltam {count} h", { count: Math.round(m.horas_restantes) }))
              : (m.dias_restantes != null && m.dias_restantes < 0
                  ? t("Venceu há {count} dias", { count: Math.abs(m.dias_restantes) })
                  : t("{count} dias", { count: m.dias_restantes ?? 0 }));

        lista.push({
          id: `m-${m.item_id}-${m.vehicle_id}`,
          tipo: "manutencao",
          nome: m.servico,
          veiculo: m.placa,
          critico: Boolean(m.bloqueia_veiculo),
          detalhe,
          ordem: m.situacao === "vencida" ? -1 : Number(m.folga_fracao ?? 1),
          status: m.situacao === "vencida" ? "vencido" : m.bloqueia_veiculo ? "critico" : "atencao",
        });
      }

      for (const d of (docs.data as any[]) ?? []) {
        const dias = diasAte(d.data_vencimento);
        lista.push({
          id: `d-${d.id}`,
          tipo: "documento",
          nome: d.descricao || d.tipo,
          veiculo: d.vehicles?.placa ?? "—",
          critico: false,
          detalhe: dias < 0
            ? t("Venceu há {count} dias", { count: Math.abs(dias) })
            : dias === 0 ? t("Vence hoje") : t("{count} dias", { count: dias }),
          ordem: dias < 0 ? -1 : dias / Math.max(diasJanela, 1),
          status: dias < 0 ? "vencido" : dias <= 15 ? "critico" : "atencao",
        });
      }

      lista.sort((a, b) => a.ordem - b.ordem);
      setItens(lista);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }, [diasJanela, t]);

  useEffect(() => { void carregar(); }, [carregar]);

  const vencidos = itens.filter(i => i.status === "vencido").length;
  const criticos = itens.filter(i => i.status === "critico").length;
  const atencao = itens.filter(i => i.status === "atencao").length;
  const exibidos = itens.slice(0, maxItens);

  if (!loading && !erro && itens.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card shadow-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <p className="text-sm font-semibold text-foreground">{t("Vencimentos da Frota")}</p>
        </div>
        <p className="text-sm font-medium text-green-600">
          {t("Nenhuma manutenção ou documento de veículo vencendo nos próximos {count} dias", { count: diasJanela })}
        </p>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-xl border bg-card shadow-card",
      vencidos > 0 ? "border-red-200 dark:border-red-800"
        : criticos > 0 ? "border-orange-200 dark:border-orange-800"
          : "border-amber-200 dark:border-amber-800",
    )}>
      <div className={cn(
        "flex items-center justify-between border-b px-5 pb-3 pt-4",
        vencidos > 0 ? "border-red-100 dark:border-red-900/40" : "border-border/50",
      )}>
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn("h-4 w-4",
            vencidos > 0 ? "text-red-500" : criticos > 0 ? "text-orange-500" : "text-amber-500")} />
          <p className="text-sm font-semibold text-foreground">{t("Vencimentos da Frota")}</p>
          {loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1.5">
          {vencidos > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
              {t("{count} vencidos", { count: vencidos })}
            </span>
          )}
          {criticos > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
              {t("{count} críticos", { count: criticos })}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border/50 border-b border-border/50">
        {[
          { label: "Vencidos", value: vencidos, color: "text-red-600" },
          { label: "Críticos", value: criticos, color: "text-orange-600" },
          { label: "A vencer", value: atencao, color: "text-amber-600" },
        ].map(k => (
          <div key={k.label} className="flex flex-col items-center px-2 py-3">
            <p className={cn("text-xl font-extrabold leading-none", k.color)}>{k.value}</p>
            <p className="mt-1 text-[10px] font-medium text-muted-foreground">{t(k.label)}</p>
          </div>
        ))}
      </div>

      <div className="divide-y divide-border/40">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-2 w-2 flex-shrink-0 rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))
        ) : erro ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("Erro ao carregar vencimentos.")}{" "}
            <button onClick={() => void carregar()} className="text-primary underline">
              {t("Tentar novamente")}
            </button>
          </div>
        ) : (
          exibidos.map(item => {
            const cfg = statusCfg[item.status];
            const Icon = item.tipo === "manutencao" ? Wrench : FileText;
            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", cfg.dot)} />
                <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {item.nome}
                    {item.critico && <ShieldAlert className="h-3 w-3 flex-shrink-0 text-destructive" />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{item.veiculo}</p>
                </div>
                <span className={cn("flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", cfg.cls)}>
                  {item.detalhe}
                </span>
              </div>
            );
          })
        )}
      </div>

      <Link
        to="/manutencao"
        className="flex items-center justify-center gap-1.5 border-t border-border/50 px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-accent"
      >
        {t("Ver todos os vencimentos da frota")}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

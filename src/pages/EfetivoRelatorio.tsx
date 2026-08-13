import { useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, RefreshCw, BarChart3, Users, Clock, AlertCircle, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, getDaysInMonth, startOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Obra { id: string; nome: string }

interface DiaInfo {
  ausencia:         boolean;
  horas_trabalhadas: number | null;
  hora_entrada:     string | null;
  hora_saida:       string | null;
  frente:           string | null;
}

interface EmpRow {
  employee_id: string;
  nome:        string;
  cargo_nome:  string | null;
  dias:        Record<number, DiaInfo>; // key = dia do mês (1-31)
  total_hht:   number;
  total_hhe:   number;
  presencas:   number;
  faltas:      number;
  nao_reg:     number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtH(h: number): string {
  if (!h) return "0h";
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return `${hrs}h${min > 0 ? `${min}m` : ""}`;
}

// Meses para select
const currentYear = new Date().getFullYear();
const MESES = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(currentYear, new Date().getMonth() - 12 + i, 1);
  return { value: format(d, "yyyy-MM"), label: format(d, "MMMM/yyyy", { locale: ptBR }) };
}).reverse();

// ─── Componente ───────────────────────────────────────────────────────────────
export default function EfetivoRelatorio() {
  const [obras, setObras]     = useState<Obra[]>([]);
  const [obraId, setObraId]   = useState("");
  const [mes, setMes]         = useState(format(new Date(), "yyyy-MM"));
  const [empRows, setEmpRows] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    supabase.from("obras").select("id, nome").order("nome")
      .then(({ data }) => setObras((data ?? []) as Obra[]));
  }, []);

  // ─── Carregar dados do mês ──────────────────────────────────────────────
  const handleCarregar = useCallback(async () => {
    if (!obraId || !mes) { toast.error("Selecione obra e mês"); return; }
    setLoading(true);
    setLoaded(false);
    try {
      const [ano, mesNum] = mes.split("-").map(Number);
      const diasNoMes = getDaysInMonth(new Date(ano, mesNum - 1));
      const dataIni   = `${mes}-01`;
      const dataFim   = `${mes}-${String(diasNoMes).padStart(2, "0")}`;

      // Funcionários da obra
      const { data: emps } = await (supabase as any)
        .from("employee_obra_assignments")
        .select("employee_id, employees(id, nome, cargos(nome))")
        .eq("obra_id", obraId);

      // Todos os apontamentos do mês
      const { data: pontos } = await (supabase as any)
        .from("efetivo_ponto")
        .select("employee_id, data, ausencia, horas_trabalhadas, horas_extras, hora_entrada, hora_saida, frente")
        .eq("obra_id", obraId)
        .gte("data", dataIni)
        .lte("data", dataFim);

      // Montar mapa employee_id → ponto[]
      const pontoMap: Record<string, Record<number, DiaInfo>> = {};
      (pontos ?? []).forEach((p: any) => {
        const dia = parseInt(p.data.split("-")[2]);
        if (!pontoMap[p.employee_id]) pontoMap[p.employee_id] = {};
        pontoMap[p.employee_id][dia] = {
          ausencia:          p.ausencia,
          horas_trabalhadas: p.horas_trabalhadas,
          hora_entrada:      p.hora_entrada?.slice(0, 5) ?? null,
          hora_saida:        p.hora_saida?.slice(0, 5) ?? null,
          frente:            p.frente,
        };
      });

      const rows: EmpRow[] = (emps ?? [])
        .map((a: any) => a.employees)
        .filter(Boolean)
        .map((e: any) => {
          const diasEmp = pontoMap[e.id] ?? {};
          let total_hht = 0, total_hhe = 0, presencas = 0, faltas = 0;
          for (let d = 1; d <= diasNoMes; d++) {
            const dia = diasEmp[d];
            if (!dia) continue;
            if (dia.ausencia) { faltas++; }
            else {
              presencas++;
              total_hht += dia.horas_trabalhadas ?? 0;
            }
          }
          // horas extras não estão no select acima, mas pontos tem o campo
          const pontosEmp = (pontos ?? []).filter((p: any) => p.employee_id === e.id);
          total_hhe = pontosEmp.reduce((s: number, p: any) => s + (p.horas_extras ?? 0), 0);

          return {
            employee_id: e.id,
            nome:        e.nome,
            cargo_nome:  e.cargos?.nome ?? null,
            dias:        diasEmp,
            total_hht,
            total_hhe,
            presencas,
            faltas,
            nao_reg:     diasNoMes - presencas - faltas,
          } satisfies EmpRow;
        })
        .sort((a: EmpRow, b: EmpRow) => a.nome.localeCompare(b.nome));

      setEmpRows(rows);
      setLoaded(true);
      if (rows.length === 0) toast.info("Nenhum funcionário vinculado a essa obra.");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar relatório");
    } finally {
      setLoading(false);
    }
  }, [obraId, mes]);

  // ─── Exportar CSV completo do mês ───────────────────────────────────────
  function handleExport() {
    const [ano, mesNum] = mes.split("-").map(Number);
    const diasNoMes = getDaysInMonth(new Date(ano, mesNum - 1));
    const obraNome  = obras.find(o => o.id === obraId)?.nome ?? obraId;

    const header = ["Funcionário", "Cargo", ...Array.from({length: diasNoMes}, (_,i) => `${i+1}`), "Presença", "Faltas", "HHT", "H.Extra"];
    const csvRows = empRows.map(r => {
      const dias = Array.from({length: diasNoMes}, (_, i) => {
        const d = r.dias[i + 1];
        if (!d) return "";
        return d.ausencia ? "A" : `P(${d.horas_trabalhadas ?? 0}h)`;
      });
      return [r.nome, r.cargo_nome ?? "", ...dias, r.presencas, r.faltas, fmtH(r.total_hht), fmtH(r.total_hhe)];
    });

    const csv  = [header, ...csvRows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `efetivo_${obraNome}_${mes}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Dados do mês ──────────────────────────────────────────────────────
  const [ano, mesNum] = mes.split("-").map(Number);
  const diasNoMes = loaded ? getDaysInMonth(new Date(ano, mesNum - 1)) : 0;
  const diasArr   = Array.from({ length: diasNoMes }, (_, i) => i + 1);

  // KPIs
  const totalPresencas = empRows.reduce((s, r) => s + r.presencas, 0);
  const totalFaltas    = empRows.reduce((s, r) => s + r.faltas, 0);
  const totalHHT       = empRows.reduce((s, r) => s + r.total_hht, 0);
  const totalHHE       = empRows.reduce((s, r) => s + r.total_hhe, 0);
  const obraNome       = obras.find(o => o.id === obraId)?.nome ?? "";
  const mesLabel       = MESES.find(m => m.value === mes)?.label ?? mes;

  return (
    <Layout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Espelho de Ponto</h1>
            <p className="text-muted-foreground text-sm">Relatório mensal de presença e HHT por funcionário</p>
          </div>
          {loaded && (
            <Button variant="outline" onClick={handleExport} className="gap-2 rounded-xl">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          )}
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-medium rounded-2xl">
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="space-y-1.5">
                <Label>Obra</Label>
                <Select value={obraId} onValueChange={setObraId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecione a obra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Mês de referência</Label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {MESES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleCarregar} disabled={loading || !obraId} className="gap-2 rounded-xl">
                {loading
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Carregando...</>
                  : <><BarChart3 className="h-4 w-4" /> Gerar Relatório</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Skeletons */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        )}

        {/* KPIs */}
        {loaded && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Presenças",    value: totalPresencas, icon: Users,        color: "bg-green-100 text-green-600 dark:bg-green-900/30" },
              { label: "Total Faltas",       value: totalFaltas,    icon: AlertCircle,  color: totalFaltas > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-muted/50 text-muted-foreground" },
              { label: "HHT Mensal",         value: fmtH(totalHHT), icon: Clock,        color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30" },
              { label: "H. Extras no Mês",   value: fmtH(totalHHE), icon: CalendarDays, color: totalHHE > 0 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" : "bg-muted/50 text-muted-foreground" },
            ].map(s => (
              <Card key={s.label} className="border-0 shadow-subtle rounded-2xl">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0", s.color)}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-tight">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Grid espelho de ponto */}
        {loaded && !loading && empRows.length > 0 && (
          <Card className="border-0 shadow-medium rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {obraNome} · {mesLabel}
              </CardTitle>
              <CardDescription>{empRows.length} funcionários · {diasNoMes} dias</CardDescription>
              <div className="flex gap-3 text-xs mt-1 flex-wrap">
                <span className="flex items-center gap-1"><span className="h-4 w-4 rounded bg-green-100 dark:bg-green-900/30 inline-block" /> P = Presente</span>
                <span className="flex items-center gap-1"><span className="h-4 w-4 rounded bg-red-100 dark:bg-red-900/30 inline-block" /> A = Ausente</span>
                <span className="flex items-center gap-1"><span className="h-4 w-4 rounded bg-muted inline-block" /> — = Não registrado</span>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-semibold min-w-44 sticky left-0 bg-card z-10">Funcionário</th>
                      {diasArr.map(d => (
                        <th key={d} className="py-2 px-1 font-semibold w-8 text-center text-muted-foreground">{d}</th>
                      ))}
                      <th className="py-2 px-2 font-semibold text-center text-green-600 min-w-12">P</th>
                      <th className="py-2 px-2 font-semibold text-center text-red-600 min-w-12">F</th>
                      <th className="py-2 px-2 font-semibold text-center text-blue-600 min-w-16">HHT</th>
                      <th className="py-2 px-2 font-semibold text-center text-amber-600 min-w-16">HHE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empRows.map((r, ri) => (
                      <tr key={r.employee_id} className={cn("border-b hover:bg-muted/20", ri % 2 === 0 ? "" : "bg-muted/10")}>
                        <td className="py-2 px-3 sticky left-0 bg-card z-10" style={{ backgroundColor: ri % 2 === 0 ? undefined : undefined }}>
                          <p className="font-medium truncate max-w-40">{r.nome}</p>
                          {r.cargo_nome && <p className="text-muted-foreground text-[10px]">{r.cargo_nome}</p>}
                        </td>
                        {diasArr.map(d => {
                          const dia = r.dias[d];
                          return (
                            <td key={d} className="py-1 px-0.5 text-center">
                              {!dia ? (
                                <span className="text-muted-foreground/40">·</span>
                              ) : dia.ausencia ? (
                                <span className="inline-flex items-center justify-center h-6 w-7 rounded text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">A</span>
                              ) : (
                                <span
                                  title={`${dia.hora_entrada ?? ""}–${dia.hora_saida ?? ""} (${dia.horas_trabalhadas ?? 0}h)${dia.frente ? ` · ${dia.frente}` : ""}`}
                                  className="inline-flex items-center justify-center h-6 w-7 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-help"
                                >
                                  P
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-2 text-center font-bold text-green-600">{r.presencas}</td>
                        <td className="py-2 px-2 text-center font-bold text-red-500">{r.faltas || "—"}</td>
                        <td className="py-2 px-2 text-center font-medium text-blue-600">{fmtH(r.total_hht)}</td>
                        <td className="py-2 px-2 text-center font-medium text-amber-600">{r.total_hhe > 0 ? fmtH(r.total_hhe) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totais */}
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40">
                      <td className="py-2 px-3 font-bold sticky left-0 bg-muted/40 z-10">TOTAIS</td>
                      {diasArr.map(d => {
                        const pD = empRows.filter(r => r.dias[d] && !r.dias[d].ausencia).length;
                        const aD = empRows.filter(r => r.dias[d]?.ausencia).length;
                        return (
                          <td key={d} className="py-1 px-0.5 text-center">
                            {(pD + aD) > 0 && (
                              <span className="text-[9px] font-bold text-muted-foreground leading-tight block">{pD}/{pD+aD}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-bold text-green-600">{totalPresencas}</td>
                      <td className="py-2 px-2 text-center font-bold text-red-500">{totalFaltas || "—"}</td>
                      <td className="py-2 px-2 text-center font-bold text-blue-600">{fmtH(totalHHT)}</td>
                      <td className="py-2 px-2 text-center font-bold text-amber-600">{totalHHE > 0 ? fmtH(totalHHE) : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loaded && !loading && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CalendarDays className="h-7 w-7 text-primary" />
            </div>
            <p className="font-medium">Selecione a obra e o mês</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Gere o espelho de ponto com presença, ausências e HHT de cada funcionário no período.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

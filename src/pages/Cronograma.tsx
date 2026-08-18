import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CalendarRange, Plus, Pencil, RefreshCw, ChevronRight,
  ChevronDown, TrendingUp, TrendingDown, Minus, Save,
  BarChart2, ClipboardCheck, Download, AlertTriangle,
  CheckCircle2, Target, Upload, FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line, ReferenceLine,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Obra { id: string; nome: string }

interface CronItem {
  id: string; obra_id: string; pai_id: string | null;
  codigo: string | null; descricao: string; unidade: string | null;
  quantidade_total: number | null; data_inicio_plan: string | null;
  data_fim_plan: string | null; peso_percentual: number; ordem: number;
  // da view
  perc_realizado: number; quantidade_realizada: number | null;
  ultima_data_avanco: string | null; perc_plan_hoje: number; status_item: string;
  // computado no front
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
}

interface CurvaSPoint {
  date: string;
  label: string;
  planejado: number | null;
  realizado: number | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS = {
  concluido: { label: "Concluído",  color: "bg-green-100 text-green-700 border-green-200",  icon: CheckCircle2 },
  em_dia:    { label: "Em dia",     color: "bg-blue-100 text-blue-700 border-blue-200",      icon: TrendingUp },
  atencao:   { label: "Atenção",    color: "bg-amber-100 text-amber-700 border-amber-200",   icon: AlertTriangle },
  atrasado:  { label: "Atrasado",   color: "bg-red-100 text-red-700 border-red-200",         icon: TrendingDown },
  sem_data:  { label: "Sem datas",  color: "bg-muted text-muted-foreground border-border",   icon: Minus },
};
function getStatus(s: string) { return STATUS[s as keyof typeof STATUS] ?? STATUS.sem_data; }

function desvioColor(d: number) {
  if (d >= 5)   return "text-green-600";
  if (d >= 0)   return "text-blue-600";
  if (d >= -10) return "text-amber-600";
  return "text-red-600";
}

// Profundidade de cada item na hierarquia
function computeDepths(items: Omit<CronItem, "depth"|"expanded"|"hasChildren">[]): CronItem[] {
  const map: Record<string, number> = {};
  const childSet = new Set(items.map(i => i.pai_id).filter(Boolean));

  function depth(id: string, visited = new Set<string>()): number {
    if (map[id] !== undefined) return map[id];
    if (visited.has(id)) return 0;
    visited.add(id);
    const item = items.find(i => i.id === id);
    if (!item || !item.pai_id) { map[id] = 0; return 0; }
    map[id] = depth(item.pai_id, visited) + 1;
    return map[id];
  }

  return items.map(i => ({
    ...i,
    depth:       depth(i.id),
    expanded:    true,
    hasChildren: childSet.has(i.id),
  }));
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Cronograma() {
  const [obras, setObras]     = useState<Obra[]>([]);
  const [obraId, setObraId]   = useState("");
  const [items, setItems]     = useState<CronItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [curvaSData, setCurvaSData] = useState<CurvaSPoint[]>([]);

  useEffect(() => {
    supabase.from("obras").select("id, nome").order("nome")
      .then(({ data }) => setObras((data ?? []) as Obra[]));
  }, []);

  const fetchItems = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("v_cronograma_situacao")
      .select("*")
      .eq("obra_id", obraId)
      .order("ordem");
    const raw = (data ?? []) as Omit<CronItem, "depth"|"expanded"|"hasChildren">[];
    setItems(computeDepths(raw));
    setLoading(false);
  }, [obraId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── Curva S: recalcula sempre que items muda ──────────────────────────────
  useEffect(() => {
    if (!obraId || items.length === 0) { setCurvaSData([]); return; }

    async function buildCurvaS() {
      const itemIds = items.map(i => i.id);
      const { data: avancos } = await (supabase as any)
        .from("cronograma_avancos")
        .select("item_id, data_referencia, percentual_realizado")
        .in("item_id", itemIds)
        .order("data_referencia");

      const avArr = (avancos ?? []) as {
        item_id: string; data_referencia: string; percentual_realizado: number;
      }[];

      // Realizado acumulado por data de registro
      const uniqueDates = [...new Set(avArr.map(a => a.data_referencia))].sort();
      const lastKnown: Record<string, number> = {};
      const realizedPts: Record<string, number> = {};

      for (const date of uniqueDates) {
        avArr.filter(a => a.data_referencia === date)
             .forEach(a => { lastKnown[a.item_id] = a.percentual_realizado; });
        let w = 0;
        items.forEach(i => { w += (lastKnown[i.id] ?? 0) * i.peso_percentual / 100; });
        realizedPts[date] = Math.round(w * 10) / 10;
      }

      // Planejado: interpolação linear semanal entre início e fim de cada item
      const withDates = items.filter(i => i.data_inicio_plan && i.data_fim_plan);
      const planPts: Record<string, number> = {};

      if (withDates.length > 0) {
        const minD = withDates.reduce(
          (m, i) => i.data_inicio_plan! < m ? i.data_inicio_plan! : m,
          withDates[0].data_inicio_plan!,
        );
        const maxD = withDates.reduce(
          (m, i) => i.data_fim_plan! > m ? i.data_fim_plan! : m,
          withDates[0].data_fim_plan!,
        );

        const planDates: string[] = [];
        const d = new Date(minD);
        const end = new Date(maxD);
        while (d <= end) {
          planDates.push(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 7);
        }
        if (!planDates.includes(maxD)) planDates.push(maxD);

        for (const date of planDates) {
          let w = 0;
          items.forEach(i => {
            if (!i.data_inicio_plan || !i.data_fim_plan) return;
            let plan: number;
            if (date <= i.data_inicio_plan) plan = 0;
            else if (date >= i.data_fim_plan) plan = 100;
            else {
              const total   = new Date(i.data_fim_plan).getTime()   - new Date(i.data_inicio_plan).getTime();
              const elapsed = new Date(date).getTime() - new Date(i.data_inicio_plan).getTime();
              plan = (elapsed / total) * 100;
            }
            w += plan * i.peso_percentual / 100;
          });
          planPts[date] = Math.round(w * 10) / 10;
        }
      }

      const allDates = [...new Set([...Object.keys(planPts), ...Object.keys(realizedPts)])].sort();
      setCurvaSData(allDates.map(date => ({
        date,
        label:     format(parseISO(date), "dd/MM/yy"),
        planejado: planPts[date]     ?? null,
        realizado: realizedPts[date] ?? null,
      })));
    }

    buildCurvaS();
  }, [obraId, items]);

  // Toggle expand/collapse
  function toggleExpand(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, expanded: !i.expanded } : i));
  }

  // Filtrar itens visíveis (respeitando collapse)
  function visibleItems(): CronItem[] {
    const result: CronItem[] = [];
    for (const item of items) {
      let hidden = false;
      let cur = item.pai_id;
      while (cur) {
        const parent = items.find(i => i.id === cur);
        if (!parent) break;
        if (!parent.expanded) { hidden = true; break; }
        cur = parent.pai_id;
      }
      if (!hidden) result.push(item);
    }
    return result;
  }

  // KPIs globais
  const concluidos   = items.filter(i => i.status_item === "concluido").length;
  const atrasados    = items.filter(i => i.status_item === "atrasado").length;
  const percGlobal   = items.length > 0
    ? items.reduce((s, i) => s + (i.perc_realizado * i.peso_percentual / 100), 0) : 0;
  const percPlanHoje = items.length > 0
    ? items.reduce((s, i) => s + (i.perc_plan_hoje * i.peso_percentual / 100), 0) : 0;

  const obraNome = obras.find(o => o.id === obraId)?.nome ?? "";

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cronograma Físico</h1>
          <p className="text-muted-foreground text-sm">WBS da obra, avanço de atividades e curva Planejado × Realizado</p>
        </div>

        {/* Seletor de obra */}
        <Card className="border-0 shadow-medium rounded-2xl">
          <CardContent className="pt-5 pb-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="flex-1 min-w-60 space-y-1.5">
                <Label>Obra</Label>
                <Select value={obraId} onValueChange={v => { setObraId(v); setItems([]); }}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                  <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {obraId && (
                <Button variant="ghost" size="sm" onClick={fetchItems} className="gap-1.5 rounded-xl">
                  <RefreshCw className="h-4 w-4" /> Atualizar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        )}

        {obraId && !loading && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Avanço Realizado",  value: `${percGlobal.toFixed(1)}%`,   icon: Target,        color: "bg-primary/10 text-primary" },
                { label: "Avanço Planejado",  value: `${percPlanHoje.toFixed(1)}%`, icon: CalendarRange, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30" },
                { label: "Atividades Concl.", value: concluidos,                     icon: CheckCircle2,  color: "bg-green-100 text-green-600 dark:bg-green-900/30" },
                { label: "Atrasadas",         value: atrasados,                      icon: AlertTriangle, color: atrasados > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-muted/50 text-muted-foreground" },
              ].map(s => (
                <Card key={s.label} className="border-0 shadow-subtle rounded-2xl">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0", s.color)}>
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold leading-tight">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Barra de progresso global */}
            <Card className="border-0 shadow-subtle rounded-2xl">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Avanço Global da Obra — {obraNome}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" />
                      Realizado: <strong>{percGlobal.toFixed(1)}%</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-400 inline-block" />
                      Planejado hoje: <strong>{percPlanHoje.toFixed(1)}%</strong>
                    </span>
                  </div>
                </div>
                <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-blue-300/50 rounded-full transition-all" style={{ width: `${Math.min(percPlanHoje, 100)}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all" style={{ width: `${Math.min(percGlobal, 100)}%` }} />
                </div>
                <div className={cn("text-xs mt-1.5 font-medium", desvioColor(percGlobal - percPlanHoje))}>
                  {percGlobal - percPlanHoje >= 0 ? "▲" : "▼"} {Math.abs(percGlobal - percPlanHoje).toFixed(1)}% em relação ao planejado
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="wbs">
              <TabsList className="rounded-xl h-10">
                <TabsTrigger value="wbs"         className="rounded-lg gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> WBS / Cronograma</TabsTrigger>
                <TabsTrigger value="apontamento" className="rounded-lg gap-1.5"><Target         className="h-3.5 w-3.5" /> Apontamento</TabsTrigger>
                <TabsTrigger value="grafico"     className="rounded-lg gap-1.5"><BarChart2      className="h-3.5 w-3.5" /> Plan. × Real.</TabsTrigger>
                <TabsTrigger value="curvas"      className="rounded-lg gap-1.5"><TrendingUp     className="h-3.5 w-3.5" /> Curva S</TabsTrigger>
              </TabsList>

              <TabsContent value="wbs">
                <WbsTab items={items} visibleItems={visibleItems()} onToggle={toggleExpand} obraId={obraId} obras={obras} onRefresh={fetchItems} />
              </TabsContent>
              <TabsContent value="apontamento">
                <ApontamentoTab items={items.filter(i => !i.hasChildren)} obraId={obraId} onRefresh={fetchItems} />
              </TabsContent>
              <TabsContent value="grafico">
                <GraficoTab items={items} />
              </TabsContent>
              <TabsContent value="curvas">
                <CurvaSTab data={curvaSData} />
              </TabsContent>
            </Tabs>
          </>
        )}

        {!obraId && !loading && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CalendarRange className="h-7 w-7 text-primary" />
            </div>
            <p className="font-medium">Selecione uma obra</p>
            <p className="text-sm text-muted-foreground max-w-xs">Escolha a obra para visualizar e gerenciar o cronograma físico.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: WBS
// ═══════════════════════════════════════════════════════════════
function WbsTab({ items, visibleItems, onToggle, obraId, obras, onRefresh }: {
  items: CronItem[]; visibleItems: CronItem[]; onToggle: (id: string) => void;
  obraId: string; obras: Obra[]; onRefresh: () => void;
}) {
  const [itemOpen,   setItemOpen]   = useState(false);
  const [editing,    setEditing]    = useState<CronItem | null>(null);
  const [avancOpen,  setAvancOpen]  = useState(false);
  const [selItem,    setSelItem]    = useState<CronItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Peso total das atividades folha (sem filhos) — deve somar 100%
  const leafPeso = items.filter(i => !i.hasChildren).reduce((s, i) => s + i.peso_percentual, 0);
  const pesoOk   = items.length === 0 || Math.abs(leafPeso - 100) < 0.1;

  return (
    <div className="space-y-4 mt-4">
      {/* Cabeçalho: indicador de peso + botões */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {items.length > 0 ? (
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border",
            pesoOk
              ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
              : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400",
          )}>
            {pesoOk
              ? <CheckCircle2 className="h-3.5 w-3.5" />
              : <AlertTriangle className="h-3.5 w-3.5" />}
            Pesos das atividades folha: <strong className="ml-0.5">{leafPeso.toFixed(1)}%</strong>
            {!pesoOk && (
              <span className="ml-1 font-normal opacity-80">
                — {leafPeso < 100 ? `faltam ${(100 - leafPeso).toFixed(1)}%` : `excede em ${(leafPeso - 100).toFixed(1)}%`}
              </span>
            )}
          </div>
        ) : <div />}

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2 rounded-xl">
            <Upload className="h-4 w-4" /> Importar CSV
          </Button>
          <Button onClick={() => { setEditing(null); setItemOpen(true); }} className="gap-2 rounded-xl">
            <Plus className="h-4 w-4" /> Nova Atividade
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
          <CalendarRange className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhuma atividade cadastrada. Crie a estrutura WBS da obra ou importe via CSV.</p>
        </div>
      ) : (
        <Card className="border-0 shadow-medium rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="text-left py-3 px-4 font-semibold min-w-72">Atividade</th>
                  <th className="py-3 px-3 font-semibold text-center w-20">Peso</th>
                  <th className="py-3 px-3 font-semibold text-center w-28">Início plan.</th>
                  <th className="py-3 px-3 font-semibold text-center w-28">Fim plan.</th>
                  <th className="py-3 px-3 font-semibold text-center w-28">% Plan. hoje</th>
                  <th className="py-3 px-3 font-semibold text-center w-36">% Realizado</th>
                  <th className="py-3 px-3 font-semibold text-center w-24">Desvio</th>
                  <th className="py-3 px-3 font-semibold text-center w-24">Status</th>
                  <th className="py-3 px-4 font-semibold text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item, idx) => {
                  const st     = getStatus(item.status_item);
                  const desvio = item.perc_realizado - item.perc_plan_hoje;
                  return (
                    <tr key={item.id} className={cn("border-b hover:bg-muted/20 transition-colors", idx % 2 === 1 ? "bg-muted/5" : "")}>
                      {/* Atividade com recuo hierárquico */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1" style={{ paddingLeft: `${item.depth * 20}px` }}>
                          {item.hasChildren ? (
                            <button onClick={() => onToggle(item.id)} className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded hover:bg-muted/60">
                              {item.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : <span className="h-5 w-5 flex-shrink-0" />}
                          <div className="min-w-0">
                            {item.codigo && <span className="text-xs text-muted-foreground mr-1.5">{item.codigo}</span>}
                            <span className={cn("font-medium", item.hasChildren ? "text-foreground" : "text-muted-foreground")}>
                              {item.descricao}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground">
                        {item.peso_percentual > 0 ? `${item.peso_percentual}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground whitespace-nowrap">
                        {item.data_inicio_plan ? format(parseISO(item.data_inicio_plan), "dd/MM/yy") : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground whitespace-nowrap">
                        {item.data_fim_plan ? format(parseISO(item.data_fim_plan), "dd/MM/yy") : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-blue-600">
                        {item.perc_plan_hoje > 0 ? `${item.perc_plan_hoje.toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden min-w-12">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(item.perc_realizado, 100)}%` }} />
                          </div>
                          <span className="font-bold text-sm w-10 text-right">{item.perc_realizado.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className={cn("py-2.5 px-3 text-center font-semibold", desvioColor(desvio))}>
                        {item.data_inicio_plan ? `${desvio >= 0 ? "+" : ""}${desvio.toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="outline" className={cn("text-xs rounded-full px-2 py-0.5", st.color)}>
                          {st.label}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex gap-1 justify-end">
                          {!item.hasChildren && (
                            <button
                              onClick={() => { setSelItem(item); setAvancOpen(true); }}
                              className="h-7 px-2 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
                              % Avançar
                            </button>
                          )}
                          <button
                            onClick={() => { setEditing(item); setItemOpen(true); }}
                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ItemModal   open={itemOpen}   onClose={() => setItemOpen(false)}   editing={editing} obraId={obraId} items={items} onSaved={onRefresh} />
      <AvancModal  open={avancOpen}  onClose={() => setAvancOpen(false)}  item={selItem} onSaved={onRefresh} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} obraId={obraId} onSaved={onRefresh} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Apontamento rápido (mobile-friendly)
// ═══════════════════════════════════════════════════════════════
function ApontamentoTab({ items, obraId, onRefresh }: { items: CronItem[]; obraId: string; onRefresh: () => void }) {
  const [data, setData]     = useState(format(new Date(), "yyyy-MM-dd"));
  const [percs, setPercs]   = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init: Record<string, string> = {};
    items.forEach(i => { init[i.id] = i.perc_realizado.toFixed(0); });
    setPercs(init);
  }, [items]);

  async function handleSalvar() {
    if (!obraId || !data) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const upsertData = items
        .filter(i => percs[i.id] !== undefined)
        .map(i => ({
          item_id: i.id,
          data_referencia: data,
          percentual_realizado: Math.min(100, Math.max(0, parseFloat(percs[i.id]) || 0)),
          registrado_por: user?.id,
        }));
      const { error } = await (supabase as any)
        .from("cronograma_avancos")
        .upsert(upsertData, { onConflict: "item_id,data_referencia" });
      if (error) throw new Error(error.message);
      toast.success("Avanço salvo com sucesso!");
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border/60 py-12 text-center">
        <Target className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Cadastre as atividades no WBS para registrar o avanço.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label>Data de referência</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="rounded-xl w-44" />
            </div>
            <p className="text-sm text-muted-foreground pb-1">Informe o % realizado até esta data para cada atividade.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.map(item => {
          const val = parseFloat(percs[item.id] ?? "0") || 0;
          return (
            <Card key={item.id} className="border-0 shadow-subtle rounded-xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-48">
                    {item.codigo && <span className="text-xs text-muted-foreground">{item.codigo} · </span>}
                    <span className="font-medium text-sm">{item.descricao}</span>
                    <div className="flex gap-2 mt-1 items-center">
                      <Progress value={val} className="h-1.5 flex-1 max-w-32" />
                      <span className="text-xs text-muted-foreground">{val}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Anterior: {item.perc_realizado}%</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number" min="0" max="100" step="1"
                        value={percs[item.id] ?? ""}
                        onChange={e => setPercs(p => ({ ...p, [item.id]: e.target.value }))}
                        className="rounded-xl w-20 text-right font-bold"
                      />
                      <span className="text-sm font-semibold">%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSalvar} disabled={saving} size="lg" className="gap-2 rounded-xl">
          {saving
            ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</>
            : <><Save className="h-4 w-4" />Salvar Avanço</>}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Gráfico Planejado × Realizado
// ═══════════════════════════════════════════════════════════════
function GraficoTab({ items }: { items: CronItem[] }) {
  const leafItems = items.filter(i => !i.hasChildren && i.peso_percentual > 0);

  const chartData = leafItems.map(i => ({
    name:      i.codigo ? `${i.codigo} ${i.descricao}` : i.descricao,
    shortName: i.codigo ?? i.descricao.slice(0, 20),
    planejado: Math.round(i.perc_plan_hoje),
    realizado: Math.round(i.perc_realizado),
    desvio:    Math.round(i.perc_realizado - i.perc_plan_hoje),
  }));

  if (chartData.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border/60 py-12 text-center">
        <BarChart2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Cadastre atividades com datas e pesos para ver o gráfico.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Planejado × Realizado por Atividade</CardTitle>
          <CardDescription>% planejado para hoje vs % efetivamente realizado</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="shortName" width={120} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, name: string) => [`${v}%`, name === "planejado" ? "Planejado hoje" : "Realizado"]}
                contentStyle={{ borderRadius: "12px", fontSize: 12 }}
              />
              <Legend formatter={v => v === "planejado" ? "Planejado hoje" : "Realizado"} />
              <Bar dataKey="planejado" fill="hsl(217 91% 75%)" radius={[0, 4, 4, 0]} name="planejado" />
              <Bar dataKey="realizado" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="realizado" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Análise de Desvios</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {chartData
              .sort((a, b) => a.desvio - b.desvio)
              .map(d => (
                <div key={d.name} className="flex items-center gap-3">
                  <p className="text-sm flex-1 truncate">{d.name}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground w-16 text-right">Plan: {d.planejado}%</span>
                    <span className="text-xs text-muted-foreground w-16 text-right">Real: {d.realizado}%</span>
                    <span className={cn("text-xs font-bold w-14 text-right", desvioColor(d.desvio))}>
                      {d.desvio >= 0 ? "+" : ""}{d.desvio}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Curva S — Avanço Acumulado ao Longo do Tempo
// ═══════════════════════════════════════════════════════════════
function CurvaSTab({ data }: { data: CurvaSPoint[] }) {
  const hasPlanned  = data.some(d => d.planejado  !== null);
  const hasRealized = data.some(d => d.realizado  !== null);
  const todayLabel  = format(new Date(), "dd/MM/yy");

  if (!hasPlanned && !hasRealized) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border/60 py-12 text-center">
        <TrendingUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">Sem dados para exibir a Curva S</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
          Cadastre atividades com datas de início e fim, e registre avanços no tab Apontamento.
        </p>
      </div>
    );
  }

  // Cards de resumo: último registro realizado + planejado mais próximo de hoje
  const lastReal  = [...data].reverse().find(d => d.realizado !== null);
  const planToday = (() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const cands = data.filter(d => d.date <= today && d.planejado !== null);
    return cands.length > 0 ? cands[cands.length - 1] : null;
  })();
  const desvio = lastReal && planToday
    ? (lastReal.realizado ?? 0) - (planToday.planejado ?? 0)
    : null;

  return (
    <div className="space-y-4 mt-4">
      {/* Cards de resumo */}
      {lastReal && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-subtle rounded-2xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{lastReal.realizado}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Realizado ({lastReal.label})</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-subtle rounded-2xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-500">{planToday?.planejado?.toFixed(1) ?? "—"}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Planejado hoje</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-subtle rounded-2xl">
            <CardContent className="p-4 text-center">
              {desvio !== null ? (
                <>
                  <p className={cn("text-2xl font-bold", desvioColor(desvio))}>
                    {desvio >= 0 ? "+" : ""}{desvio.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {desvio >= 5 ? "Adiantado ▲" : desvio >= 0 ? "No prazo ✓" : desvio >= -10 ? "Atenção ⚠" : "Atrasado ▼"}
                  </p>
                </>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráfico Curva S */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Curva S — Avanço Acumulado ao Longo do Tempo</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-6 border-t-2 border-dashed border-blue-400" /> Planejado
            </span>
            {" · "}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-6 border-t-2 border-primary" /> Realizado
            </span>
            {" · "}
            <span className="text-destructive font-medium">Linha vermelha = hoje</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={data} margin={{ left: 0, right: 28, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.ceil(data.length / 9) - 1)}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 11 }}
                width={42}
              />
              <Tooltip
                formatter={(v: number | null, name: string) => [
                  v !== null ? `${v}%` : "—",
                  name === "planejado" ? "Planejado" : "Realizado",
                ]}
                contentStyle={{ borderRadius: "12px", fontSize: 12 }}
                labelStyle={{ fontSize: 12, fontWeight: "bold" }}
              />
              <Legend formatter={v => v === "planejado" ? "Planejado (previsto)" : "Realizado (acumulado)"} />

              {hasPlanned && (
                <Line
                  type="monotone"
                  dataKey="planejado"
                  stroke="hsl(217 91% 65%)"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  dot={false}
                  name="planejado"
                  connectNulls
                />
              )}
              {hasRealized && (
                <Line
                  type="monotone"
                  dataKey="realizado"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "hsl(var(--primary))" }}
                  activeDot={{ r: 6 }}
                  name="realizado"
                  connectNulls
                />
              )}
              {data.some(d => d.label === todayLabel) && (
                <ReferenceLine
                  x={todayLabel}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                  label={{ value: "Hoje", position: "top", fontSize: 10, fill: "hsl(var(--destructive))" }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Cadastro / Edição de Item WBS
// ═══════════════════════════════════════════════════════════════
function ItemModal({ open, onClose, editing, obraId, items, onSaved }: {
  open: boolean; onClose: () => void; editing: CronItem | null;
  obraId: string; items: CronItem[]; onSaved: () => void;
}) {
  const [codigo,   setCodigo]  = useState("");
  const [descricao, setDesc]   = useState("");
  const [paiId,    setPaiId]   = useState("");
  const [unidade,  setUnidade] = useState("");
  const [qtdTotal, setQtd]     = useState("");
  const [peso,     setPeso]    = useState("");
  const [dataIni,  setDataIni] = useState("");
  const [dataFim,  setDataFim] = useState("");
  const [ordem,    setOrdem]   = useState("");
  const [saving,   setSaving]  = useState(false);

  useEffect(() => {
    if (open && editing) {
      setCodigo(editing.codigo ?? ""); setDesc(editing.descricao); setPaiId(editing.pai_id ?? "");
      setUnidade(editing.unidade ?? ""); setQtd(editing.quantidade_total?.toString() ?? "");
      setPeso(editing.peso_percentual.toString()); setDataIni(editing.data_inicio_plan ?? "");
      setDataFim(editing.data_fim_plan ?? ""); setOrdem(editing.ordem.toString());
    } else if (open) {
      setCodigo(""); setDesc(""); setPaiId(""); setUnidade(""); setQtd(""); setPeso("0");
      setDataIni(""); setDataFim(""); setOrdem("");
    }
  }, [open, editing]);

  // Verificador de peso: soma das atividades folha (excluindo o item atual)
  const leafItems     = items.filter(i => !i.hasChildren);
  const otherLeafPeso = leafItems.filter(i => i.id !== editing?.id).reduce((s, i) => s + i.peso_percentual, 0);
  const newPeso       = parseFloat(peso) || 0;
  // Mostrar apenas se for atividade folha (sem filhos) ou nova atividade
  const showPesoCheck = editing ? !editing.hasChildren : true;
  const totalPeso     = showPesoCheck ? otherLeafPeso + newPeso : null;

  async function handleSave() {
    if (!descricao.trim()) { toast.error("Informe a descrição da atividade"); return; }
    setSaving(true);
    try {
      const payload = {
        obra_id: obraId, pai_id: paiId || null, codigo: codigo || null,
        descricao: descricao.trim(), unidade: unidade || null,
        quantidade_total: qtdTotal ? parseFloat(qtdTotal) : null,
        peso_percentual: parseFloat(peso) || 0,
        data_inicio_plan: dataIni || null, data_fim_plan: dataFim || null,
        ordem: parseInt(ordem) || 0,
      };
      const { error } = editing
        ? await (supabase as any).from("cronograma_itens").update(payload).eq("id", editing.id)
        : await (supabase as any).from("cronograma_itens").insert(payload);
      if (error) throw new Error(error.message);
      toast.success(editing ? "Atividade atualizada!" : "Atividade criada!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  const pais = items.filter(i => i.id !== editing?.id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            {editing ? "Editar Atividade" : "Nova Atividade"}
          </DialogTitle>
          <DialogDescription>Defina os dados da atividade no cronograma WBS</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="1.1.2" className="rounded-xl" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Descrição <span className="text-red-500">*</span></Label>
              <Input value={descricao} onChange={e => setDesc(e.target.value)} placeholder="Ex: Fundações" className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Atividade pai (opcional)</Label>
            <Select value={paiId || "__root__"} onValueChange={v => setPaiId(v === "__root__" ? "" : v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Nível raiz" /></SelectTrigger>
              <SelectContent className="max-h-48">
                <SelectItem value="__root__">— Raiz (sem pai) —</SelectItem>
                {pais.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.codigo ? `${i.codigo} ` : ""}{i.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input value={unidade} onChange={e => setUnidade(e.target.value)} placeholder="m², vb..." className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Qtd. Total</Label>
              <Input type="number" value={qtdTotal} onChange={e => setQtd(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Peso (%)</Label>
              <Input
                type="number" min="0" max="100" step="0.01"
                value={peso} onChange={e => setPeso(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Indicador de soma dos pesos */}
          {totalPeso !== null && (
            <div className={cn(
              "flex items-center gap-2 text-xs rounded-xl px-3 py-2 border",
              Math.abs(totalPeso - 100) < 0.1
                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400",
            )}>
              {Math.abs(totalPeso - 100) < 0.1
                ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />}
              <span>
                Soma dos pesos (atividades folha): <strong>{totalPeso.toFixed(1)}%</strong>
                {Math.abs(totalPeso - 100) >= 0.1 && (
                  <span className="ml-1 opacity-80">
                    ({totalPeso < 100
                      ? `faltam ${(100 - totalPeso).toFixed(1)}%`
                      : `excede em ${(totalPeso - 100).toFixed(1)}%`})
                  </span>
                )}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início planejado</Label>
              <Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Fim planejado</Label>
              <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ordem de exibição</Label>
            <Input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} placeholder="0" className="rounded-xl w-24" />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</>
              : <><CalendarRange className="h-4 w-4" />{editing ? "Salvar" : "Criar"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Registrar Avanço de uma atividade
// ═══════════════════════════════════════════════════════════════
function AvancModal({ open, onClose, item, onSaved }: {
  open: boolean; onClose: () => void; item: CronItem | null; onSaved: () => void;
}) {
  const [data,   setData]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [perc,   setPerc]   = useState("");
  const [qtd,    setQtd]    = useState("");
  const [obs,    setObs]    = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setPerc(item.perc_realizado.toString()); setQtd(""); setObs("");
      setData(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open, item]);

  async function handleSave() {
    if (!item || !perc) { toast.error("Informe o percentual realizado"); return; }
    const pNum = Math.min(100, Math.max(0, parseFloat(perc) || 0));
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("cronograma_avancos").upsert({
        item_id: item.id, data_referencia: data, percentual_realizado: pNum,
        quantidade_realizada: qtd ? parseFloat(qtd) : null,
        observacoes: obs || null, registrado_por: user?.id,
      }, { onConflict: "item_id,data_referencia" });
      if (error) throw new Error(error.message);
      toast.success("Avanço registrado!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Registrar Avanço
          </DialogTitle>
          {item && (
            <DialogDescription>
              {item.codigo && `${item.codigo} — `}{item.descricao}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Data de referência</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>% Realizado <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input type="number" min="0" max="100" value={perc} onChange={e => setPerc(e.target.value)} className="rounded-xl pr-7" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Qtd. realizada</Label>
              <Input type="number" value={qtd} onChange={e => setQtd(e.target.value)} placeholder={item?.unidade ?? ""} className="rounded-xl" />
            </div>
          </div>
          {perc && (
            <div className="rounded-xl bg-muted/40 px-4 py-2">
              <Progress value={Math.min(parseFloat(perc) || 0, 100)} className="h-2 mb-1" />
              <p className="text-xs text-muted-foreground">
                Anterior: {item?.perc_realizado ?? 0}% → Novo: {Math.min(parseFloat(perc) || 0, 100)}%
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="rounded-xl resize-none text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</>
              : <><Target className="h-4 w-4" />Salvar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Importar WBS via CSV
// ═══════════════════════════════════════════════════════════════
const CSV_TEMPLATE = [
  "codigo;descricao;pai_codigo;unidade;quantidade_total;peso_percentual;data_inicio_plan;data_fim_plan;ordem",
  "1;TERRAPLENAGEM;;;1000;30;2026-01-01;2026-03-31;1",
  "1.1;Corte de terra;1;m³;500;15;2026-01-01;2026-02-28;1",
  "1.2;Aterro compactado;1;m³;500;15;2026-02-01;2026-03-31;2",
  "2;FUNDAÇÕES;;;500;40;2026-02-01;2026-05-31;2",
  "2.1;Escavação;2;m³;200;20;2026-02-01;2026-03-15;1",
  "2.2;Concreto;2;m³;300;20;2026-03-15;2026-05-31;2",
  "3;ESTRUTURA;;;1;30;2026-04-01;2026-08-31;3",
].join("\n");

function ImportModal({ open, onClose, obraId, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; onSaved: () => void;
}) {
  const [csvText,   setCsvText]   = useState("");
  const [importing, setImporting] = useState(false);
  const [result,    setResult]    = useState<{ success: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!open) { setCsvText(""); setResult(null); } }, [open]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText((ev.target?.result as string) ?? "");
    reader.readAsText(file, "utf-8");
    // reset input so same file can be re-selected
    e.target.value = "";
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "template_wbs.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!csvText.trim()) { toast.error("Carregue ou cole o CSV antes de importar."); return; }
    setImporting(true);
    setResult(null);

    const lines  = csvText.trim().split(/\r?\n/);
    const header = lines[0].split(";").map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
    const get    = (row: string[], col: string) => row[header.indexOf(col)]?.trim() ?? "";

    const codeToId: Record<string, string> = {};
    const errors: string[] = [];
    let success = 0;

    for (let li = 1; li < lines.length; li++) {
      const row = lines[li].split(";");
      if (row.every(c => !c.trim())) continue; // linha em branco

      const codigo    = get(row, "codigo");
      const descricao = get(row, "descricao");
      const paiCod    = get(row, "pai_codigo");

      if (!descricao) {
        errors.push(`Linha ${li + 1}: coluna 'descricao' é obrigatória`);
        continue;
      }

      if (paiCod && !codeToId[paiCod]) {
        errors.push(`Linha ${li + 1} (${descricao}): código pai "${paiCod}" não encontrado — insira o pai antes do filho`);
        continue;
      }

      const payload = {
        obra_id:           obraId,
        codigo:            codigo || null,
        descricao,
        pai_id:            paiCod ? (codeToId[paiCod] ?? null) : null,
        unidade:           get(row, "unidade")           || null,
        quantidade_total:  get(row, "quantidade_total")  ? parseFloat(get(row, "quantidade_total"))  : null,
        peso_percentual:   parseFloat(get(row, "peso_percentual"))  || 0,
        data_inicio_plan:  get(row, "data_inicio_plan")  || null,
        data_fim_plan:     get(row, "data_fim_plan")     || null,
        ordem:             parseInt(get(row, "ordem"))   || li,
      };

      const { data: ins, error } = await (supabase as any)
        .from("cronograma_itens")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        errors.push(`Linha ${li + 1} (${descricao}): ${error.message}`);
        continue;
      }

      if (codigo && ins?.id) codeToId[codigo] = ins.id;
      success++;
    }

    setResult({ success, errors });
    setImporting(false);
    if (success > 0) { onSaved(); toast.success(`${success} atividade(s) importada(s)!`); }
    if (errors.length === 0) onClose();
  }

  const lineCount = csvText.trim() ? csvText.trim().split(/\r?\n/).length - 1 : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Importar WBS via CSV
          </DialogTitle>
          <DialogDescription>
            Importe múltiplas atividades de uma só vez. Use ponto-e-vírgula como separador.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template info */}
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Formato do arquivo</p>
                <p className="text-xs text-muted-foreground">
                  Separador: ponto-e-vírgula <code className="bg-muted px-1 rounded">(;)</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Datas: <code className="bg-muted px-1 rounded">AAAA-MM-DD</code>
                  {" · "}O pai deve aparecer antes do filho no arquivo
                </p>
                <p className="text-xs text-muted-foreground">
                  Colunas: <code className="bg-muted px-1 rounded text-xs">
                    codigo · descricao · pai_codigo · unidade · quantidade_total · peso_percentual · data_inicio_plan · data_fim_plan · ordem
                  </code>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 rounded-xl flex-shrink-0">
                <Download className="h-3.5 w-3.5" /> Template
              </Button>
            </div>
          </div>

          {/* Seleção de arquivo */}
          <div className="space-y-1.5">
            <Label>Arquivo CSV</Label>
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2 rounded-xl w-full">
              <Upload className="h-4 w-4" />
              {csvText ? "Trocar arquivo" : "Selecionar arquivo .csv"}
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          </div>

          {/* Área de cola */}
          <div className="space-y-1.5">
            <Label>Ou cole o conteúdo CSV aqui</Label>
            <Textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={8}
              className="rounded-xl font-mono text-xs resize-none"
              placeholder={`${CSV_TEMPLATE.split("\n")[0]}\n...`}
            />
            {lineCount > 0 && (
              <p className="text-xs text-muted-foreground">{lineCount} linha(s) detectada(s) para importar</p>
            )}
          </div>

          {/* Resultado da importação */}
          {result && (
            <div className="space-y-2">
              {result.success > 0 && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-xl px-3 py-2 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  {result.success} atividade(s) importada(s) com sucesso
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> {result.errors.length} erro(s) durante a importação:
                  </p>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-300">{e}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={importing} className="rounded-xl">Fechar</Button>
          <Button onClick={handleImport} disabled={importing || !csvText.trim()} className="rounded-xl gap-2">
            {importing
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Importando...</>
              : <><FileSpreadsheet className="h-4 w-4" />Importar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useCallback } from "react";
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
  CheckCircle2, Clock, Target,
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
  if (d >= 5)  return "text-green-600";
  if (d >= 0)  return "text-blue-600";
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
  const [obras, setObras]   = useState<Obra[]>([]);
  const [obraId, setObraId] = useState("");
  const [items, setItems]   = useState<CronItem[]>([]);
  const [loading, setLoading] = useState(false);

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

  // Toggle expand/collapse
  function toggleExpand(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, expanded: !i.expanded } : i));
  }

  // Filtrar itens visíveis (respeitando collapse)
  function visibleItems(): CronItem[] {
    const collapsedParents = new Set<string>();
    const result: CronItem[] = [];
    for (const item of items) {
      // verifica se algum ancestral está colapsado
      let hidden = false;
      let cur = item.pai_id;
      while (cur) {
        const parent = items.find(i => i.id === cur);
        if (!parent) break;
        if (!parent.expanded) { hidden = true; break; }
        cur = parent.pai_id;
      }
      if (!hidden) result.push(item);
      if (!item.expanded) collapsedParents.add(item.id);
    }
    return result;
  }

  // KPIs globais
  const concluidos    = items.filter(i => i.status_item === "concluido").length;
  const atrasados     = items.filter(i => i.status_item === "atrasado").length;
  const percGlobal    = items.length > 0
    ? items.reduce((s, i) => s + (i.perc_realizado * i.peso_percentual / 100), 0)
    : 0;
  const percPlanHoje  = items.length > 0
    ? items.reduce((s, i) => s + (i.perc_plan_hoje * i.peso_percentual / 100), 0)
    : 0;

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

        {loading && <div className="space-y-2">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>}

        {obraId && !loading && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Avanço Realizado",  value: `${percGlobal.toFixed(1)}%`,  icon: Target,        color: "bg-primary/10 text-primary" },
                { label: "Avanço Planejado",  value: `${percPlanHoje.toFixed(1)}%`, icon: CalendarRange, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30" },
                { label: "Atividades Concl.", value: concluidos,                    icon: CheckCircle2,  color: "bg-green-100 text-green-600 dark:bg-green-900/30" },
                { label: "Atrasadas",         value: atrasados,                     icon: AlertTriangle, color: atrasados > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-muted/50 text-muted-foreground" },
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
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" /> Realizado: <strong>{percGlobal.toFixed(1)}%</strong></span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400 inline-block" /> Planejado hoje: <strong>{percPlanHoje.toFixed(1)}%</strong></span>
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
                <TabsTrigger value="wbs"       className="rounded-lg gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> WBS / Cronograma</TabsTrigger>
                <TabsTrigger value="apontamento" className="rounded-lg gap-1.5"><Target className="h-3.5 w-3.5" /> Apontamento</TabsTrigger>
                <TabsTrigger value="grafico"   className="rounded-lg gap-1.5"><BarChart2 className="h-3.5 w-3.5" /> Planejado × Realizado</TabsTrigger>
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
  const [itemOpen, setItemOpen]   = useState(false);
  const [editing, setEditing]     = useState<CronItem | null>(null);
  const [avancOpen, setAvancOpen] = useState(false);
  const [selItem, setSelItem]     = useState<CronItem | null>(null);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setItemOpen(true); }} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> Nova Atividade
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
          <CalendarRange className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhuma atividade cadastrada. Crie a estrutura WBS da obra.</p>
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
                  const st    = getStatus(item.status_item);
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
                            <span className={cn("font-medium", item.hasChildren ? "text-foreground" : "text-muted-foreground")}>{item.descricao}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground">{item.peso_percentual > 0 ? `${item.peso_percentual}%` : "—"}</td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground whitespace-nowrap">
                        {item.data_inicio_plan ? format(parseISO(item.data_inicio_plan), "dd/MM/yy") : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground whitespace-nowrap">
                        {item.data_fim_plan ? format(parseISO(item.data_fim_plan), "dd/MM/yy") : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-blue-600">{item.perc_plan_hoje > 0 ? `${item.perc_plan_hoje.toFixed(0)}%` : "—"}</td>
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
                            <button onClick={() => { setSelItem(item); setAvancOpen(true); }}
                              className="h-7 px-2 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
                              % Avançar
                            </button>
                          )}
                          <button onClick={() => { setEditing(item); setItemOpen(true); }}
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

      <ItemModal open={itemOpen} onClose={() => setItemOpen(false)} editing={editing} obraId={obraId} items={items} onSaved={onRefresh} />
      <AvancModal open={avancOpen} onClose={() => setAvancOpen(false)} item={selItem} onSaved={onRefresh} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Apontamento rápido (mobile-friendly)
// ═══════════════════════════════════════════════════════════════
function ApontamentoTab({ items, obraId, onRefresh }: { items: CronItem[]; obraId: string; onRefresh: () => void }) {
  const [data, setData]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [percs, setPercs] = useState<Record<string, string>>({});
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
          {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</> : <><Save className="h-4 w-4" />Salvar Avanço</>}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Gráfico Planejado × Realizado
// ═══════════════════════════════════════════════════════════════
function GraficoTab({ items }: { items: CronItem[] }) {
  // Apenas atividades folha (sem filhos) com peso > 0
  const leafItems = items.filter(i => !i.hasChildren && i.peso_percentual > 0);

  const chartData = leafItems.map(i => ({
    name: i.codigo ? `${i.codigo} ${i.descricao}` : i.descricao,
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
      {/* Gráfico de barras: planejado vs realizado por atividade */}
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

      {/* Tabela de desvios */}
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
              ))
            }
          </div>
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
  const [codigo, setCodigo]     = useState("");
  const [descricao, setDesc]    = useState("");
  const [paiId, setPaiId]       = useState("");
  const [unidade, setUnidade]   = useState("");
  const [qtdTotal, setQtd]      = useState("");
  const [peso, setPeso]         = useState("");
  const [dataIni, setDataIni]   = useState("");
  const [dataFim, setDataFim]   = useState("");
  const [ordem, setOrdem]       = useState("");
  const [saving, setSaving]     = useState(false);

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
            <div className="space-y-1.5"><Label>Código</Label><Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="1.1.2" className="rounded-xl" /></div>
            <div className="col-span-2 space-y-1.5"><Label>Descrição <span className="text-red-500">*</span></Label><Input value={descricao} onChange={e => setDesc(e.target.value)} placeholder="Ex: Fundações" className="rounded-xl" /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Atividade pai (opcional)</Label>
            <Select value={paiId || "__root__"} onValueChange={v => setPaiId(v === "__root__" ? "" : v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Nível raiz" /></SelectTrigger>
              <SelectContent className="max-h-48">
                <SelectItem value="__root__">— Raiz (sem pai) —</SelectItem>
                {pais.map(i => <SelectItem key={i.id} value={i.id}>{i.codigo ? `${i.codigo} ` : ""}{i.descricao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Unidade</Label><Input value={unidade} onChange={e => setUnidade(e.target.value)} placeholder="m², vb..." className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Qtd. Total</Label><Input type="number" value={qtdTotal} onChange={e => setQtd(e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Peso (%)</Label><Input type="number" min="0" max="100" step="0.01" value={peso} onChange={e => setPeso(e.target.value)} className="rounded-xl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Início planejado</Label><Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Fim planejado</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="rounded-xl" /></div>
          </div>
          <div className="space-y-1.5"><Label>Ordem de exibição</Label><Input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} placeholder="0" className="rounded-xl w-24" /></div>
        </div>
        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</> : <><CalendarRange className="h-4 w-4" />{editing ? "Salvar" : "Criar"}</>}
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
  const [data, setData]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [perc, setPerc]   = useState("");
  const [qtd, setQtd]     = useState("");
  const [obs, setObs]     = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) { setPerc(item.perc_realizado.toString()); setQtd(""); setObs(""); setData(format(new Date(), "yyyy-MM-dd")); }
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
          <DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Registrar Avanço</DialogTitle>
          {item && <DialogDescription>{item.codigo && `${item.codigo} — `}{item.descricao}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Data de referência</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} className="rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>% Realizado <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input type="number" min="0" max="100" value={perc} onChange={e => setPerc(e.target.value)} className="rounded-xl pr-7" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Qtd. realizada</Label><Input type="number" value={qtd} onChange={e => setQtd(e.target.value)} placeholder={item?.unidade ?? ""} className="rounded-xl" /></div>
          </div>
          {perc && (
            <div className="rounded-xl bg-muted/40 px-4 py-2">
              <Progress value={Math.min(parseFloat(perc) || 0, 100)} className="h-2 mb-1" />
              <p className="text-xs text-muted-foreground">Anterior: {item?.perc_realizado ?? 0}% → Novo: {Math.min(parseFloat(perc) || 0, 100)}%</p>
            </div>
          )}
          <div className="space-y-1.5"><Label>Observações</Label><Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="rounded-xl resize-none text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</> : <><Target className="h-4 w-4" />Salvar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

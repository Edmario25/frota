import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  AlertTriangle, Plus, Pencil, Trash2, CheckCircle2, ClipboardList,
  ChevronRight, ChevronDown, ShieldAlert, BarChart3, ArrowRight,
  Clock, RotateCcw,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type Obra = { id: string; nome: string };
type Employee = { id: string; nome: string };

type NC = {
  id: string; obra_id: string; numero_nc: number;
  titulo: string; descricao: string | null;
  categoria: string; gravidade: string; status: string;
  local_ocorrencia: string | null; data_ocorrencia: string; data_limite: string | null;
  data_encerramento: string | null; responsavel_id: string | null;
  causa_raiz: string | null;
  por1: string | null; por2: string | null; por3: string | null; por4: string | null; por5: string | null;
  observacoes_verif: string | null; reincidente: boolean; nc_origem_id: string | null;
  // join
  responsavel?: { nome: string };
};

type NcAcao = {
  id: string; nc_id: string; o_que: string; por_que: string | null;
  quem: string | null; onde: string | null; quando: string | null;
  como: string | null; quanto: number | null;
  status: string; data_conclusao: string | null; observacoes: string | null; ordem: number;
};

type NcResumo = {
  obra_id: string; obra_nome: string; total_ncs: number;
  abertas: number; em_analise: number; em_tratamento: number;
  encerradas: number; criticas: number; graves: number;
  reincidentes: number; atrasadas: number; tempo_medio_dias: number | null;
};

// ─── Lookups ────────────────────────────────────────────────────────────────

const STATUS_NC: Record<string, { label: string; cls: string; next?: string }> = {
  aberta:         { label: "Aberta",         cls: "bg-red-100    text-red-700",     next: "em_analise"    },
  em_analise:     { label: "Em Análise",     cls: "bg-amber-100  text-amber-700",   next: "em_tratamento" },
  em_tratamento:  { label: "Em Tratamento",  cls: "bg-blue-100   text-blue-700",    next: "verificada"    },
  verificada:     { label: "Verificada",     cls: "bg-purple-100 text-purple-700",  next: "encerrada"     },
  encerrada:      { label: "Encerrada",      cls: "bg-green-100  text-green-700"                          },
  cancelada:      { label: "Cancelada",      cls: "bg-slate-100  text-slate-500"                          },
};

const STATUS_NEXT_LABEL: Record<string, string> = {
  aberta:        "Iniciar Análise",
  em_analise:    "Iniciar Tratamento",
  em_tratamento: "Verificar",
  verificada:    "Encerrar",
};

const GRAV: Record<string, { label: string; cls: string; dot: string }> = {
  leve:     { label: "Leve",     cls: "bg-green-100 text-green-700",  dot: "bg-green-400"  },
  moderada: { label: "Moderada", cls: "bg-amber-100 text-amber-700",  dot: "bg-amber-400"  },
  grave:    { label: "Grave",    cls: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
  critica:  { label: "Crítica",  cls: "bg-red-100   text-red-700",    dot: "bg-red-500"    },
};

const CAT_NC: Record<string, string> = {
  procedimento: "Procedimento", material: "Material", equipamento: "Equipamento",
  seguranca: "Segurança", ambiental: "Ambiental", qualidade: "Qualidade", outro: "Outro",
};

const STATUS_ACAO: Record<string, { label: string; cls: string }> = {
  pendente:     { label: "Pendente",     cls: "bg-slate-100  text-slate-600" },
  em_andamento: { label: "Em andamento", cls: "bg-blue-100   text-blue-700"  },
  concluida:    { label: "Concluída",    cls: "bg-green-100  text-green-700" },
  cancelada:    { label: "Cancelada",    cls: "bg-red-100    text-red-500"   },
};

const CHART_COLORS = ["#ef4444","#f97316","#f59e0b","#3b82f6","#8b5cf6","#10b981","#64748b"];

// ─── Modal: NC ────────────────────────────────────────────────────────────

function NcModal({
  open, onClose, onSaved, obras, employees, editing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; employees: Employee[]; editing: NC | null;
}) {
  const { toast } = useToast();
  const blank = {
    obra_id: "", titulo: "", descricao: "",
    categoria: "qualidade", gravidade: "moderada", status: "aberta",
    local_ocorrencia: "", data_ocorrencia: new Date().toISOString().slice(0, 10),
    data_limite: "", responsavel_id: "",
    causa_raiz: "", por1: "", por2: "", por3: "", por4: "", por5: "",
    reincidente: false,
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"geral" | "causa">("geral");

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          obra_id: editing.obra_id, titulo: editing.titulo, descricao: editing.descricao ?? "",
          categoria: editing.categoria, gravidade: editing.gravidade, status: editing.status,
          local_ocorrencia: editing.local_ocorrencia ?? "",
          data_ocorrencia: editing.data_ocorrencia, data_limite: editing.data_limite ?? "",
          responsavel_id: editing.responsavel_id ?? "",
          causa_raiz: editing.causa_raiz ?? "",
          por1: editing.por1 ?? "", por2: editing.por2 ?? "",
          por3: editing.por3 ?? "", por4: editing.por4 ?? "", por5: editing.por5 ?? "",
          reincidente: editing.reincidente,
        });
      } else { setF(blank); setTab("geral"); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.obra_id || !f.titulo.trim()) {
      toast({ title: "Obra e título são obrigatórios", variant: "destructive" }); return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      obra_id: f.obra_id, titulo: f.titulo, descricao: f.descricao || null,
      categoria: f.categoria, gravidade: f.gravidade, status: f.status,
      local_ocorrencia: f.local_ocorrencia || null,
      data_ocorrencia: f.data_ocorrencia, data_limite: f.data_limite || null,
      responsavel_id: f.responsavel_id || null,
      detectado_por_id: editing ? undefined : (user?.id ?? null),
      causa_raiz: f.causa_raiz || null,
      por1: f.por1 || null, por2: f.por2 || null, por3: f.por3 || null,
      por4: f.por4 || null, por5: f.por5 || null,
      reincidente: f.reincidente,
    };
    const q = editing
      ? (supabase as any).from("nao_conformidades").update(payload).eq("id", editing.id)
      : (supabase as any).from("nao_conformidades").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "NC atualizada" : "NC registrada" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar NC-${String(editing.numero_nc).padStart(4, "0")}` : "Registrar Não Conformidade"}</DialogTitle>
        </DialogHeader>

        {/* Sub-tabs dentro do modal */}
        <div className="flex border-b mb-4">
          {(["geral", "causa"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t === "geral" ? "Dados Gerais" : "Análise de Causa (5 Porquês)"}
            </button>
          ))}
        </div>

        {tab === "geral" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Obra *</Label>
              <Select value={f.obra_id} onValueChange={v => set("obra_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Título *</Label>
              <Input value={f.titulo} onChange={e => set("titulo", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Textarea value={f.descricao} onChange={e => set("descricao", e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={f.categoria} onValueChange={v => set("categoria", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CAT_NC).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gravidade</Label>
              <Select value={f.gravidade} onValueChange={v => set("gravidade", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GRAV).map(([k, g]) => <SelectItem key={k} value={k}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data da Ocorrência</Label>
              <Input type="date" value={f.data_ocorrencia} onChange={e => set("data_ocorrencia", e.target.value)} />
            </div>
            <div>
              <Label>Prazo Limite</Label>
              <Input type="date" value={f.data_limite} onChange={e => set("data_limite", e.target.value)} />
            </div>
            <div>
              <Label>Local / Frente</Label>
              <Input value={f.local_ocorrencia} onChange={e => set("local_ocorrencia", e.target.value)} />
            </div>
            <div>
              <Label>Responsável pelo Tratamento</Label>
              <Select value={f.responsavel_id || "__none"} onValueChange={v => set("responsavel_id", v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editing && (
              <div>
                <Label>Status</Label>
                <Select value={f.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_NC).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2 col-span-2">
              <input type="checkbox" id="reincidente" checked={f.reincidente}
                onChange={e => set("reincidente", e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="reincidente" className="font-normal">NC reincidente</Label>
            </div>
          </div>
        )}

        {tab === "causa" && (
          <div className="space-y-4">
            <div>
              <Label>Causa Raiz (resumo)</Label>
              <Textarea value={f.causa_raiz} onChange={e => set("causa_raiz", e.target.value)} rows={2} placeholder="Qual é a causa raiz identificada?" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">Metodologia 5 Porquês</p>
              {[
                { key: "por1", label: "1º Porquê — Por que ocorreu o problema?" },
                { key: "por2", label: "2º Porquê — Por que isso aconteceu?" },
                { key: "por3", label: "3º Porquê — Por que essa condição existia?" },
                { key: "por4", label: "4º Porquê — Por que não foi detectado antes?" },
                { key: "por5", label: "5º Porquê — Causa raiz confirmada?" },
              ].map(item => (
                <div key={item.key}>
                  <Label className="text-xs text-muted-foreground">{item.label}</Label>
                  <Textarea value={f[item.key as keyof typeof f] as string}
                    onChange={e => set(item.key, e.target.value)} rows={2} />
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Plano de Ação (5W2H) ─────────────────────────────────────────

function PlanoAcaoModal({
  open, onClose, onSaved, ncId, ncTitulo,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  ncId: string; ncTitulo: string;
}) {
  const { toast } = useToast();
  const [acoes, setAcoes] = useState<NcAcao[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const emptyAcao = (): NcAcao => ({
    id: crypto.randomUUID(), nc_id: ncId, o_que: "", por_que: null,
    quem: null, onde: null, quando: null, como: null, quanto: null,
    status: "pendente", data_conclusao: null, observacoes: null, ordem: acoes.length,
  });

  useEffect(() => {
    if (!open || !ncId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("nc_acoes").select("*").eq("nc_id", ncId).order("ordem");
      setAcoes(data ?? []);
      setLoading(false);
    })();
  }, [open, ncId]);

  const updateAcao = (idx: number, k: keyof NcAcao, v: string | number | null) => {
    setAcoes(prev => prev.map((a, i) => i === idx ? { ...a, [k]: v } : a));
  };

  const save = async () => {
    setSaving(true);
    await (supabase as any).from("nc_acoes").delete().eq("nc_id", ncId);
    if (acoes.length > 0) {
      const rows = acoes.map((a, i) => ({
        nc_id: ncId, o_que: a.o_que, por_que: a.por_que,
        quem: a.quem, onde: a.onde, quando: a.quando,
        como: a.como, quanto: a.quanto, status: a.status,
        data_conclusao: a.data_conclusao, observacoes: a.observacoes, ordem: i,
      }));
      const { error } = await (supabase as any).from("nc_acoes").insert(rows);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        setSaving(false); return;
      }
    }
    toast({ title: "Plano de ação salvo" });
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plano de Ação — {ncTitulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setAcoes(p => [...p, emptyAcao()])}>
              <Plus className="h-3 w-3 mr-1" /> Adicionar Ação
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>
          ) : (
            <div className="space-y-3">
              {acoes.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma ação. Clique em "Adicionar Ação".
                </p>
              )}
              {acoes.map((a, idx) => (
                <div key={a.id} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Ação {idx + 1}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500"
                      onClick={() => setAcoes(p => p.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div className="col-span-2 md:col-span-3">
                      <Label className="text-xs">O QUÊ? (ação a tomar) *</Label>
                      <Input className="h-7 text-xs" value={a.o_que}
                        onChange={e => updateAcao(idx, "o_que", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">POR QUÊ?</Label>
                      <Input className="h-7 text-xs" value={a.por_que ?? ""}
                        onChange={e => updateAcao(idx, "por_que", e.target.value || null)} />
                    </div>
                    <div>
                      <Label className="text-xs">QUEM?</Label>
                      <Input className="h-7 text-xs" value={a.quem ?? ""}
                        onChange={e => updateAcao(idx, "quem", e.target.value || null)} />
                    </div>
                    <div>
                      <Label className="text-xs">ONDE?</Label>
                      <Input className="h-7 text-xs" value={a.onde ?? ""}
                        onChange={e => updateAcao(idx, "onde", e.target.value || null)} />
                    </div>
                    <div>
                      <Label className="text-xs">QUANDO? (prazo)</Label>
                      <Input type="date" className="h-7 text-xs" value={a.quando ?? ""}
                        onChange={e => updateAcao(idx, "quando", e.target.value || null)} />
                    </div>
                    <div>
                      <Label className="text-xs">QUANTO? (R$)</Label>
                      <Input type="number" className="h-7 text-xs" value={a.quanto ?? ""}
                        onChange={e => updateAcao(idx, "quanto", e.target.value ? parseFloat(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={a.status} onValueChange={v => updateAcao(idx, "status", v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_ACAO).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 md:col-span-3">
                      <Label className="text-xs">COMO?</Label>
                      <Textarea className="text-xs" value={a.como ?? ""}
                        onChange={e => updateAcao(idx, "como", e.target.value || null)} rows={2} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar Plano"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Lista de NCs ─────────────────────────────────────────────────────

function ListaTab({
  obraId, obras, employees, refresh, triggerRefresh,
}: {
  obraId: string; obras: Obra[]; employees: Employee[]; refresh: number; triggerRefresh: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<NC[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<NC | null>(null);
  const [planoNc, setPlanoNc] = useState<NC | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterGrav, setFilterGrav] = useState("todas");

  const load = useCallback(async () => {
    if (!obraId) { setData([]); return; }
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("nao_conformidades")
      .select("*, responsavel:employees(nome)")
      .eq("obra_id", obraId)
      .order("numero_nc", { ascending: false });
    setData(rows ?? []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load, refresh]);

  const del = async (id: string) => {
    if (!confirm("Excluir NC?")) return;
    await (supabase as any).from("nao_conformidades").delete().eq("id", id);
    toast({ title: "NC excluída" });
    triggerRefresh();
  };

  const avançarStatus = async (nc: NC) => {
    const next = STATUS_NC[nc.status]?.next;
    if (!next) return;
    const patch: Record<string, string | null> = { status: next };
    if (next === "encerrada") patch.data_encerramento = new Date().toISOString().slice(0, 10);
    await (supabase as any).from("nao_conformidades").update(patch).eq("id", nc.id);
    toast({ title: `Status atualizado: ${STATUS_NC[next].label}` });
    triggerRefresh();
  };

  const toggle = (id: string) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  const filtered = data.filter(n => {
    if (filterStatus !== "todos" && n.status !== filterStatus) return false;
    if (filterGrav !== "todas" && n.gravidade !== filterGrav) return false;
    return true;
  });

  const atrasadas = filtered.filter(n =>
    n.data_limite && n.data_limite < new Date().toISOString().slice(0, 10)
    && !["encerrada","cancelada"].includes(n.status)
  ).length;

  return (
    <div className="space-y-4">
      {/* KPIs rápidos */}
      {obraId && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total",      val: filtered.length,                                           cls: "text-primary"    },
            { label: "Abertas",    val: filtered.filter(n => n.status === "aberta").length,        cls: "text-red-600"    },
            { label: "Críticas",   val: filtered.filter(n => n.gravidade === "critica").length,    cls: "text-orange-600" },
            { label: "Atrasadas",  val: atrasadas,                                                 cls: "text-amber-600"  },
          ].map(k => (
            <Card key={k.label} className="p-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold ${k.cls}`}>{k.val}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Filtros + botão */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              {Object.entries(STATUS_NC).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterGrav} onValueChange={setFilterGrav}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas gravidades</SelectItem>
              {Object.entries(GRAV).map(([k, g]) => <SelectItem key={k} value={k}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova NC
        </Button>
      </div>

      {!obraId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma NC encontrada.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(nc => {
            const st   = STATUS_NC[nc.status] ?? STATUS_NC.aberta;
            const gv   = GRAV[nc.gravidade] ?? GRAV.moderada;
            const open = expanded.has(nc.id);
            const atrasada = nc.data_limite && nc.data_limite < new Date().toISOString().slice(0, 10)
              && !["encerrada","cancelada"].includes(nc.status);
            const nextLabel = STATUS_NEXT_LABEL[nc.status];
            return (
              <div key={nc.id} className={`border rounded-lg overflow-hidden ${atrasada ? "border-amber-400" : ""}`}>
                {/* Header do card */}
                <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30" onClick={() => toggle(nc.id)}>
                  <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${gv.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">
                        NC-{String(nc.numero_nc).padStart(4, "0")}
                      </span>
                      <span className="font-semibold text-sm truncate">{nc.titulo}</span>
                      {nc.reincidente && (
                        <Badge className="bg-purple-100 text-purple-700 border-0 text-xs gap-1">
                          <RotateCcw className="h-2.5 w-2.5" /> Reincidente
                        </Badge>
                      )}
                      {atrasada && (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-xs gap-1">
                          <Clock className="h-2.5 w-2.5" /> Atrasada
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                      <Badge className={`${st.cls} border-0 text-xs`}>{st.label}</Badge>
                      <Badge className={`${gv.cls} border-0 text-xs`}>{gv.label}</Badge>
                      <span>{CAT_NC[nc.categoria]}</span>
                      <span>{nc.data_ocorrencia}</span>
                      {nc.responsavel && <span>→ {(nc.responsavel as any).nome}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                {/* Expandido */}
                {open && (
                  <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
                    {nc.descricao && <p className="text-sm">{nc.descricao}</p>}
                    {nc.local_ocorrencia && <p className="text-xs text-muted-foreground">📍 {nc.local_ocorrencia}</p>}
                    {nc.causa_raiz && (
                      <div className="border rounded p-2 bg-amber-50 text-xs">
                        <strong>Causa Raiz:</strong> {nc.causa_raiz}
                      </div>
                    )}
                    {/* 5 Porquês resumido */}
                    {(nc.por1 || nc.por2) && (
                      <div className="text-xs space-y-1">
                        {[nc.por1, nc.por2, nc.por3, nc.por4, nc.por5].filter(Boolean).map((p, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="font-semibold text-muted-foreground w-4">{i + 1}.</span>
                            <span>{p}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Ações */}
                    <div className="flex gap-2 flex-wrap pt-1">
                      {nextLabel && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => avançarStatus(nc)}>
                          <ArrowRight className="h-3 w-3 mr-1" /> {nextLabel}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => setPlanoNc(nc)}>
                        <ClipboardList className="h-3 w-3 mr-1" /> Plano de Ação
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setEditing(nc); setModal(true); }}>
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500"
                        onClick={() => del(nc.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NcModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras} employees={employees} editing={editing}
      />

      {planoNc && (
        <PlanoAcaoModal
          open={!!planoNc} onClose={() => setPlanoNc(null)}
          onSaved={() => { setPlanoNc(null); triggerRefresh(); }}
          ncId={planoNc.id}
          ncTitulo={`NC-${String(planoNc.numero_nc).padStart(4,"0")} — ${planoNc.titulo}`}
        />
      )}
    </div>
  );
}

// ─── Tab: Análise e Indicadores ────────────────────────────────────────────

function AnaliseTab({ obraId, refresh }: { obraId: string; refresh: number }) {
  const [resumo, setResumo] = useState<NcResumo | null>(null);
  const [ncs, setNcs] = useState<NC[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!obraId) { setResumo(null); setNcs([]); return; }
    setLoading(true);
    Promise.all([
      (supabase as any).from("v_nc_resumo").select("*").eq("obra_id", obraId).single(),
      (supabase as any).from("nao_conformidades").select("categoria,gravidade,status").eq("obra_id", obraId),
    ]).then(([r1, r2]) => {
      setResumo(r1.data ?? null);
      setNcs(r2.data ?? []);
      setLoading(false);
    });
  }, [obraId, refresh]);

  if (!obraId) return <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>;
  if (loading)  return <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>;
  if (!resumo || resumo.total_ncs === 0) return (
    <p className="text-sm text-muted-foreground py-8 text-center">Sem dados para análise.</p>
  );

  // Dados por status
  const byStatus = Object.entries(STATUS_NC)
    .map(([k, s]) => ({ name: s.label, value: ncs.filter(n => n.status === k).length }))
    .filter(d => d.value > 0);

  // Dados por categoria
  const byCat = Object.entries(CAT_NC)
    .map(([k, label]) => ({ name: label, value: ncs.filter(n => n.categoria === k).length }))
    .filter(d => d.value > 0);

  // Dados por gravidade
  const byGrav = Object.entries(GRAV)
    .map(([k, g]) => ({ name: g.label, value: ncs.filter(n => n.gravidade === k).length, cor: g.dot.replace("bg-","#") }))
    .filter(d => d.value > 0);

  const percEncerradas = resumo.total_ncs > 0
    ? Math.round((Number(resumo.encerradas) / resumo.total_ncs) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total de NCs",        val: resumo.total_ncs,         icon: ShieldAlert,    cls: "text-primary"    },
          { label: "Taxa de Encerramento", val: `${percEncerradas}%`,     icon: CheckCircle2,   cls: "text-green-600"  },
          { label: "Críticas + Graves",    val: Number(resumo.criticas) + Number(resumo.graves), icon: AlertTriangle, cls: "text-orange-600" },
          { label: "Tempo Médio (dias)",   val: resumo.tempo_medio_dias != null ? `${resumo.tempo_medio_dias}d` : "—", icon: Clock, cls: "text-blue-600" },
        ].map(k => (
          <Card key={k.label} className="p-3">
            <div className="flex items-center gap-2">
              <k.icon className={`h-4 w-4 ${k.cls}`} />
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </div>
            <p className="text-xl font-bold mt-1">{k.val}</p>
          </Card>
        ))}
      </div>

      {/* Barra de taxa encerramento */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold">Taxa de Encerramento</span>
          <span>{resumo.encerradas} de {resumo.total_ncs} NCs</span>
        </div>
        <Progress value={percEncerradas} className="h-3 [&>div]:bg-green-500" />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Abertas: {resumo.abertas} · Análise: {resumo.em_analise} · Tratamento: {resumo.em_tratamento}</span>
          {Number(resumo.reincidentes) > 0 && (
            <span className="text-purple-600 font-semibold">⚠ {resumo.reincidentes} reincidente(s)</span>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Por status */}
        {byStatus.length > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Por Status
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byStatus} layout="vertical" margin={{ left: 16, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <RechartTooltip />
                <Bar dataKey="value" name="NCs" fill="#3b82f6" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Por categoria */}
        {byCat.length > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Por Categoria
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byCat} layout="vertical" margin={{ left: 16, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <RechartTooltip />
                <Bar dataKey="value" name="NCs" radius={[0,4,4,0]}>
                  {byCat.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Por gravidade - pie */}
        {byGrav.length > 0 && (
          <div className="border rounded-lg p-4 md:col-span-2">
            <h3 className="text-sm font-semibold mb-3">Distribuição por Gravidade</h3>
            <div className="flex items-center gap-6 flex-wrap">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={byGrav} dataKey="value" cx="50%" cy="50%" outerRadius={70}>
                    {byGrav.map((_, i) => (
                      <Cell key={i} fill={["#22c55e","#f59e0b","#f97316","#ef4444"][i] ?? "#888"} />
                    ))}
                  </Pie>
                  <RechartTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {byGrav.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-full" style={{ background: ["#22c55e","#f59e0b","#f97316","#ef4444"][i] }} />
                    <span>{d.name}:</span>
                    <strong>{d.value}</strong>
                    <span className="text-muted-foreground">({Math.round(d.value / resumo.total_ncs * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function NaoConformidades() {
  const [obras, setObras]         = useState<Obra[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [obraId, setObraId]       = useState("");
  const [refresh, setRefresh]     = useState(0);
  const triggerRefresh = () => setRefresh(r => r + 1);

  useEffect(() => {
    (async () => {
      const [{ data: ob }, { data: emp }] = await Promise.all([
        (supabase as any).from("obras").select("id, nome").order("nome"),
        (supabase as any).from("employees").select("id, nome").order("nome"),
      ]);
      setObras(ob ?? []);
      setEmployees(emp ?? []);
      if (ob?.length) setObraId(ob[0].id);
    })();
  }, []);

  return (
    <Layout>
      <div className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Não Conformidades</h1>
              <p className="text-sm text-muted-foreground">Registro, análise e plano de ação</p>
            </div>
          </div>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione a obra" />
            </SelectTrigger>
            <SelectContent>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="lista">
          <TabsList className="mb-4">
            <TabsTrigger value="lista">Não Conformidades</TabsTrigger>
            <TabsTrigger value="analise">Indicadores</TabsTrigger>
          </TabsList>

          <TabsContent value="lista">
            <ListaTab
              obraId={obraId} obras={obras} employees={employees}
              refresh={refresh} triggerRefresh={triggerRefresh}
            />
          </TabsContent>

          <TabsContent value="analise">
            <AnaliseTab obraId={obraId} refresh={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseCost, accumulatedCosts } from "@/lib/costAnalysis";
import { downloadCsv } from "@/lib/exportCsv";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Legend, ResponsiveContainer, LineChart, Line,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Plus, Pencil, Trash2, BarChart3, ListOrdered,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type Obra = { id: string; nome: string };

type Categoria = {
  id: string; nome: string; cor: string; icone: string | null; ordem: number; ativo: boolean;
};

type OrcadoRow = {
  obra_id: string | null;
  obra_nome: string;
  categoria_id: string;
  categoria_nome: string;
  categoria_cor: string;
  categoria_ordem: number;
  orcamento_item_id: string | null;
  valor_previsto: number;
  alerta_perc: number;
  valor_realizado: number;
  perc_consumido: number;
  saldo: number;
  descricao: string | null;
  observacoes: string | null;
};

type Lancamento = {
  id: string;
  obra_id: string;
  categoria_id: string;
  descricao: string;
  valor: number;
  data_lancamento: string;
  tipo: string;
  fornecedor: string | null;
  nota_fiscal: string | null;
  observacoes: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  referencia_id: string | null;
  categoria?: { nome: string; cor: string };
};

type MesRow = {
  mes: string;
  categoria_id: string;
  categoria_nome: string;
  categoria_cor: string;
  valor_mes: number;
  valor_acumulado: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TIPOS = [
  { value: "manual",        label: "Manual" },
  { value: "subcontratada", label: "Subcontratada" },
  { value: "almoxarifado",  label: "Almoxarifado" },
  { value: "folha",         label: "Folha de Pagamento" },
  { value: "equipamento",   label: "Equipamento" },
];

function alertColor(perc: number, alerta: number): string {
  if (perc > 100) return "text-red-600";
  if (perc >= alerta) return "text-amber-600";
  return "text-emerald-700";
}
function alertBg(perc: number, alerta: number): string {
  if (perc > 100) return "bg-red-50 border-red-200";
  if (perc >= alerta) return "bg-amber-50 border-amber-200";
  return "";
}
function progressColor(perc: number, alerta: number): string {
  if (perc > 100) return "[&>div]:bg-red-500";
  if (perc >= alerta) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
}

// ─── Modal: Orçamento por categoria ───────────────────────────────────────

function OrcamentoModal({
  open, onClose, onSaved, obras, categorias, editing, obraId,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; categorias: Categoria[]; editing: OrcadoRow | null; obraId: string;
}) {
  const { toast } = useToast();
  const blank = { obra_id: "", categoria_id: "", valor_previsto: "", alerta_perc: "80", descricao: "", observacoes: "" };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) {
      setMotivo("");
      if (editing) {
        setF({
          obra_id: editing.obra_id ?? "",
          categoria_id: editing.categoria_id,
          valor_previsto: String(editing.valor_previsto),
          alerta_perc: String(editing.alerta_perc),
          descricao: editing.descricao ?? "",
          observacoes: editing.observacoes ?? "",
        });
      } else {
        setF({ ...blank, obra_id: obraId });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: keyof typeof blank, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.obra_id || !f.categoria_id) {
      toast({ title: "Selecione obra e categoria", variant: "destructive" }); return;
    }
    if (!Number.isFinite(parseCost(f.valor_previsto)) || Number(f.alerta_perc) < 1 || Number(f.alerta_perc) > 100 || !Number.isInteger(Number(f.alerta_perc))) {
      toast({ title: "Informe um valor válido e alerta entre 1 e 100%", variant: "destructive" }); return;
    }
    if (editing?.orcamento_item_id && motivo.trim().length < 5) {
      toast({ title: "Justifique a revisão do orçamento", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      obra_id: f.obra_id,
      categoria_id: f.categoria_id,
      valor_previsto: parseCost(f.valor_previsto),
      alerta_perc: parseInt(f.alerta_perc || "80", 10),
      descricao: f.descricao || null,
      observacoes: f.observacoes || null,
      motivo_revisao: motivo.trim() || null,
    };
    const query = (supabase as any).from("orcamento_itens");
    const { error } = await (editing?.orcamento_item_id
      ? query.update(payload).eq("id", editing.orcamento_item_id)
      : query.insert(payload));
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Orçamento salvo" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar Orçamento" : "Definir Orçamento"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Obra *</Label>
            <Select disabled={!!editing?.orcamento_item_id} value={f.obra_id} onValueChange={v => set("obra_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria *</Label>
            <Select disabled={!!editing?.orcamento_item_id} value={f.categoria_id} onValueChange={v => set("categoria_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {categorias.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full inline-block" style={{ background: c.cor }} />
                      {c.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor Previsto (R$) *</Label>
              <Input value={f.valor_previsto} onChange={e => set("valor_previsto", e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Alerta em (%) *</Label>
              <Input type="number" min="1" max="100" value={f.alerta_perc} onChange={e => set("alerta_perc", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Descrição / Composição</Label>
            <Textarea value={f.descricao} onChange={e => set("descricao", e.target.value)} rows={2} />
          </div>
          {editing?.orcamento_item_id && <div><Label>Justificativa da revisão *</Label><Textarea value={motivo} onChange={e => setMotivo(e.target.value)} /></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Lançamento de Custo ────────────────────────────────────────────

function LancamentoModal({
  open, onClose, onSaved, obras, categorias, editing, obraId,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; categorias: Categoria[]; editing: Lancamento | null; obraId: string;
}) {
  const { toast } = useToast();
  const blank = {
    obra_id: "", categoria_id: "", descricao: "", valor: "",
    data_lancamento: new Date().toISOString().slice(0, 10),
    tipo: "manual", fornecedor: "", nota_fiscal: "", observacoes: "",
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          obra_id: editing.obra_id,
          categoria_id: editing.categoria_id,
          descricao: editing.descricao,
          valor: String(editing.valor),
          data_lancamento: editing.data_lancamento,
          tipo: editing.tipo,
          fornecedor: editing.fornecedor ?? "",
          nota_fiscal: editing.nota_fiscal ?? "",
          observacoes: editing.observacoes ?? "",
        });
      } else { setF({ ...blank, obra_id: obraId }); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: keyof typeof blank, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.obra_id || !f.categoria_id || !f.descricao || !f.valor) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" }); return;
    }
    if (!Number.isFinite(parseCost(f.valor)) || parseCost(f.valor) <= 0 || !f.data_lancamento) {
      toast({ title: "Informe valor maior que zero e a data", variant: "destructive" }); return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      obra_id: f.obra_id,
      categoria_id: f.categoria_id,
      descricao: f.descricao,
      valor: parseCost(f.valor),
      data_lancamento: f.data_lancamento,
      tipo: f.tipo,
      fornecedor: f.fornecedor || null,
      nota_fiscal: f.nota_fiscal || null,
      observacoes: f.observacoes || null,
      ...(!editing ? { registrado_por: user?.id ?? null } : {}),
    };
    const q = editing
      ? (supabase as any).from("lancamentos_custos").update(payload).eq("id", editing.id)
      : (supabase as any).from("lancamentos_custos").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Lançamento atualizado" : "Lançamento registrado" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar Lançamento" : "Novo Lançamento de Custo"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Obra *</Label>
              <Select disabled={!!editing} value={f.obra_id} onValueChange={v => set("obra_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria *</Label>
              <Select value={f.categoria_id} onValueChange={v => set("categoria_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Descrição *</Label>
            <Input value={f.descricao} onChange={e => set("descricao", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor (R$) *</Label>
              <Input value={f.valor} onChange={e => set("valor", e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={f.data_lancamento} onChange={e => set("data_lancamento", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Classificação (lançamento manual)</Label>
              <Select value={f.tipo} onValueChange={v => set("tipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Input value={f.fornecedor} onChange={e => set("fornecedor", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nota Fiscal</Label>
              <Input value={f.nota_fiscal} onChange={e => set("nota_fiscal", e.target.value)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={f.observacoes} onChange={e => set("observacoes", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Orçamento ────────────────────────────────────────────────────────

function OrcamentoTab({
  obraId, obras, categorias, refresh, triggerRefresh,
}: { obraId: string; obras: Obra[]; categorias: Categoria[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<OrcadoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<OrcadoRow | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!obraId) { setData([]); return; }
    setLoading(true);
    const { data: rows, error } = await (supabase as any)
      .from("v_orcado_realizado")
      .select("*")
      .eq("obra_id", obraId)
      .order("categoria_ordem");
    setData(rows ?? []);
    setLoadError(error?.message ?? "");
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load, refresh]);

  const totalPrev = data.reduce((s, r) => s + r.valor_previsto, 0);
  const totalReal = data.reduce((s, r) => s + r.valor_realizado, 0);
  const percTotal = totalPrev > 0 ? Math.round(totalReal / totalPrev * 100) : 0;
  const alerts = data.filter(r => r.valor_realizado > 0 && (r.valor_previsto <= 0 || r.perc_consumido >= r.alerta_perc)).length;

  if (loadError) return <Card className="p-5 text-red-700">Não foi possível carregar o comparativo. {loadError}<Button variant="outline" onClick={load}>Tentar novamente</Button></Card>;
  if (loading) return <p className="py-8 text-center text-muted-foreground">Carregando comparativo…</p>;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          { label: "Total Orçado",    val: fmtBRL(totalPrev), icon: DollarSign,     cls: "text-primary" },
          { label: "Total Realizado", val: fmtBRL(totalReal), icon: TrendingUp,     cls: "text-blue-600" },
          { label: "Saldo orçamentário", val: fmtBRL(totalPrev - totalReal), icon: DollarSign, cls: totalReal > totalPrev ? "text-red-600" : "text-primary" },
          { label: "% Consumido",     val: totalPrev > 0 ? `${percTotal}%` : "Não definido", icon: BarChart3, cls: totalReal > totalPrev ? "text-red-600" : "text-muted-foreground" },
          { label: "Alertas",         val: alerts,            icon: AlertTriangle,  cls: alerts > 0 ? "text-amber-600" : "text-slate-400" },
        ].map(k => (
          <Card key={k.label} className="p-3">
            <div className="flex items-center gap-2">
              <k.icon className={`h-4 w-4 ${k.cls}`} />
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </div>
            <p className="text-lg font-bold mt-1">{k.val}</p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Valores acumulados da obra. Realizado considera lançamentos ativos, não representa pagamentos. Classificar uma despesa não importa dados de outros módulos.</p>

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Orçamento por Categoria</h3>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!data.length} onClick={() => downloadCsv(["Categoria", "Orçado", "Realizado", "Saldo"], data.map(r => [r.categoria_nome, r.valor_previsto, r.valor_realizado, r.saldo]), "orcado-realizado")}>Exportar CSV</Button>
        <Button disabled={!obraId} size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Definir Orçamento
        </Button></div>
      </div>

      {!obraId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="space-y-3">
          {data.length === 0 && <Card className="p-6 text-center text-muted-foreground">Nenhuma categoria disponível. Verifique o cadastro de categorias e suas permissões.</Card>}
          {data.map(row => {
            const perc    = Number(row.perc_consumido);
            const over = row.valor_previsto > 0 && row.valor_realizado > row.valor_previsto;
            const warning = perc >= row.alerta_perc && !over;
            return (
              <div
                key={row.categoria_id}
                className={`border rounded-lg p-4 ${row.valor_previsto <= 0 && row.valor_realizado > 0 ? "bg-red-50 border-red-200" : alertBg(perc, row.alerta_perc)}`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: row.categoria_cor }} />
                    <span className="font-semibold text-sm">{row.categoria_nome}</span>
                    {over    && <Badge className="bg-red-100 text-red-700 text-xs border-0">Estourado</Badge>}
                    {warning && <Badge className="bg-amber-100 text-amber-700 text-xs border-0">Atenção</Badge>}
                    {row.valor_previsto <= 0 && row.valor_realizado > 0 && <Badge variant="destructive">Despesa sem cobertura orçamentária</Badge>}
                    {!row.orcamento_item_id && <span className="text-xs text-muted-foreground italic">sem orçamento definido</span>}
                  </div>

                  {/* Valores */}
                  <div className="flex items-center gap-6 text-right text-sm ml-auto">
                    <div>
                      <p className="text-xs text-muted-foreground">Previsto</p>
                      <p className="font-mono font-semibold">{fmtBRL(row.valor_previsto)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Realizado</p>
                      <p className={`font-mono font-semibold ${alertColor(perc, row.alerta_perc)}`}>
                        {fmtBRL(row.valor_realizado)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className={`font-mono font-semibold ${row.saldo < 0 ? "text-red-600" : "text-slate-600"}`}>
                        {fmtBRL(row.saldo)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { setEditing(row); setModal(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Progress */}
                {row.valor_previsto > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress
                      value={Math.min(perc, 100)}
                      className={`h-2 flex-1 ${progressColor(perc, row.alerta_perc)}`}
                    />
                    <span className={`text-xs font-semibold w-10 text-right ${alertColor(perc, row.alerta_perc)}`}>
                      {perc}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <OrcamentoModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras} categorias={categorias} editing={editing} obraId={obraId}
      />
    </div>
  );
}

// ─── Tab: Lançamentos ──────────────────────────────────────────────────────

function LancamentosTab({
  obraId, obras, categorias, refresh, triggerRefresh,
}: { obraId: string; obras: Obra[]; categorias: Categoria[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [filterCat, setFilterCat] = useState("todas");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [situacao, setSituacao] = useState("ativos");
  const [cancelando, setCancelando] = useState<Lancamento | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!obraId) { setData([]); return; }
    setLoading(true);
    const { data: rows, error } = await (supabase as any)
      .from("lancamentos_custos")
      .select("*, categoria:orcamento_categorias(nome, cor)")
      .eq("obra_id", obraId)
      .order("data_lancamento", { ascending: false });
    setData(rows ?? []);
    setLoadError(error?.message ?? "");
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load, refresh]);

  const cancelar = async () => {
    if (!cancelando || motivo.trim().length < 5 || busy) return;
    setBusy(true);
    const { error } = await (supabase as any).from("lancamentos_custos").update({ cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo.trim() }).eq("id", cancelando.id).is("cancelado_em", null);
    setBusy(false);
    if (error) { toast({ title: "Cancelamento não realizado", description: error.message, variant: "destructive" }); return; }
    setCancelando(null);
    toast({ title: "Lançamento cancelado; histórico preservado" });
    triggerRefresh();
  };

  const filtered = data.filter(l => {
    if (filterCat !== "todas" && l.categoria_id !== filterCat) return false;
    if (filterTipo !== "todos" && l.tipo !== filterTipo) return false;
    if (inicio && l.data_lancamento < inicio) return false;
    if (fim && l.data_lancamento > fim) return false;
    if (situacao === "ativos" && l.cancelado_em) return false;
    if (situacao === "cancelados" && !l.cancelado_em) return false;
    return true;
  });

  const totalFiltrado = filtered.filter(l => !l.cancelado_em).reduce((s, l) => s + l.valor, 0);

  return (
    <div className="space-y-4">
      {loadError && <Card className="p-4 text-red-700">Falha ao carregar lançamentos: {loadError}</Card>}
      <div className="flex flex-wrap gap-3 items-end">
        <div><Label>De</Label><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
        <div><Label>Até</Label><Input type="date" min={inicio} value={fim} onChange={e => setFim(e.target.value)} /></div>
        <Select value={situacao} onValueChange={setSituacao}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ativos">Ativos</SelectItem><SelectItem value="cancelados">Cancelados</SelectItem><SelectItem value="todos">Todos</SelectItem></SelectContent></Select>
        <Button variant="outline" onClick={() => downloadCsv(["Data", "Descrição", "Valor", "Situação", "Motivo cancelamento"], filtered.map(l => [l.data_lancamento, l.descricao, l.valor, l.cancelado_em ? "Cancelado" : "Ativo", l.motivo_cancelamento]), "lancamentos-custos")}>Exportar CSV</Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos tipos</SelectItem>
              {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtered.length > 0 && (
            <div className="text-sm font-semibold self-center ml-1">
              Total ativo: <span className="text-primary">{fmtBRL(totalFiltrado)}</span>
            </div>
          )}
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Lançamento
        </Button>
      </div>

      {!obraId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>NF</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum lançamento.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm">{l.data_lancamento}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: (l.categoria as any)?.cor ?? "#888" }} />
                      {(l.categoria as any)?.nome ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm max-w-[250px]">{l.descricao}{l.cancelado_em && <div className="text-xs text-red-600">Cancelado: {l.motivo_cancelamento}</div>}{l.referencia_id && <div className="text-xs text-muted-foreground">Origem: {l.referencia_id}</div>}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {TIPOS.find(t => t.value === l.tipo)?.label ?? l.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{l.fornecedor ?? "—"}</TableCell>
                  <TableCell className="text-sm">{l.nota_fiscal ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{fmtBRL(l.valor)}</TableCell>
                  <TableCell>
                    {!l.cancelado_em && !l.referencia_id && <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { setEditing(l); setModal(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Cancelar lançamento"
                        onClick={() => { setCancelando(l); setMotivo(""); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LancamentoModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras} categorias={categorias} editing={editing} obraId={obraId}
      />
      <Dialog open={!!cancelando} onOpenChange={v => { if (!v && !busy) setCancelando(null); }}><DialogContent><DialogHeader><DialogTitle>Cancelar lançamento</DialogTitle></DialogHeader><p className="text-sm">O valor sairá do realizado. O registro e sua justificativa permanecerão no histórico.</p><Label>Justificativa *</Label><Textarea value={motivo} onChange={e => setMotivo(e.target.value)} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setCancelando(null)}>Voltar</Button><Button variant="destructive" disabled={busy || motivo.trim().length < 5} onClick={cancelar}>{busy ? "Cancelando…" : "Confirmar cancelamento"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

// ─── Tab: Análise Gráfica ──────────────────────────────────────────────────

function AnaliseTab({ obraId, refresh }: { obraId: string; refresh: number }) {
  const [orcado, setOrcado] = useState<OrcadoRow[]>([]);
  const [mensal, setMensal] = useState<MesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!obraId) { setOrcado([]); setMensal([]); return; }
    setLoading(true);
    Promise.all([
      (supabase as any).from("v_orcado_realizado").select("*").eq("obra_id", obraId).order("categoria_ordem"),
      (supabase as any).from("v_custos_mensais").select("*").eq("obra_id", obraId).order("mes"),
    ]).then(([r1, r2]) => {
      setError(r1.error?.message ?? r2.error?.message ?? "");
      setOrcado(r1.data ?? []);
      setMensal(r2.data ?? []);
      setLoading(false);
    });
  }, [obraId, refresh]);

  // Dados para bar chart: previsto vs realizado por categoria
  const barData = orcado
    .filter(r => r.valor_previsto > 0 || r.valor_realizado > 0)
    .map(r => ({
      nome: r.categoria_nome,
      Previsto: r.valor_previsto,
      Realizado: r.valor_realizado,
      cor: r.categoria_cor,
    }));

  // Dados para line chart: evolução mensal acumulada
  // Precisamos de uma linha por categoria
  const categoriasMes = [...new Set(mensal.map(m => m.categoria_nome))];
  const lineData = accumulatedCosts(mensal);

  const coresCategoria: Record<string, string> = {};
  mensal.forEach(m => { coresCategoria[m.categoria_nome] = m.categoria_cor; });

  // Tabela desvio
  const desvioData = orcado
    .filter(r => r.valor_previsto > 0 || r.valor_realizado > 0)
    .sort((a, b) => b.perc_consumido - a.perc_consumido);

  if (!obraId) return <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>;
  if (loading)  return <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>;
  if (error) return <Card className="p-4 text-red-700">Não foi possível gerar a análise: {error}</Card>;

  return (
    <div className="space-y-6">
      {/* Bar chart: previsto vs realizado */}
      {barData.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Orçado × Realizado por Categoria
          </h3>
          <div className="border rounded-lg p-4 bg-card">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => "R$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} tick={{ fontSize: 11 }} />
                <RechartTooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend />
                <Bar dataKey="Previsto"  fill="#94a3b8" radius={[4,4,0,0]} />
                <Bar dataKey="Realizado" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Line chart: evolução mensal acumulada */}
      {lineData.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Curva de Custo Acumulado por Categoria
          </h3>
          <div className="border rounded-lg p-4 bg-card">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={lineData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => "R$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} tick={{ fontSize: 11 }} />
                <RechartTooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend />
                {categoriasMes.map(cat => (
                  <Line
                    key={cat} type="monotone" dataKey={cat}
                    stroke={coresCategoria[cat] ?? "#888"}
                    strokeWidth={2} dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabela de desvios */}
      {desvioData.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-primary" />
            Análise de Desvios (por % consumido)
          </h3>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Previsto</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">% Consumido</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {desvioData.map(r => {
                  const perc = Number(r.perc_consumido);
                  const over = r.valor_realizado > r.valor_previsto;
                  const warn = perc >= r.alerta_perc && !over;
                  return (
                    <TableRow key={r.categoria_id} className={over ? "bg-red-50" : warn ? "bg-amber-50" : ""}>
                      <TableCell>
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className="h-2 w-2 rounded-full" style={{ background: r.categoria_cor }} />
                          {r.categoria_nome}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtBRL(r.valor_previsto)}</TableCell>
                      <TableCell className={`text-right font-mono ${alertColor(perc, r.alerta_perc)}`}>
                        {fmtBRL(r.valor_realizado)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${r.saldo < 0 ? "text-red-600 font-bold" : "text-slate-600"}`}>
                        {fmtBRL(r.saldo)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${alertColor(perc, r.alerta_perc)}`}>
                        {r.valor_previsto > 0 ? `${perc.toFixed(1)}%` : "Não definido"}
                      </TableCell>
                      <TableCell>
                        {r.valor_previsto <= 0 ? <Badge variant="destructive">Sem orçamento</Badge> : over ? (
                          <Badge className="bg-red-100 text-red-700 border-0 gap-1">
                            <TrendingDown className="h-3 w-3" /> Estourado
                          </Badge>
                        ) : warn ? (
                          <Badge className="bg-amber-100 text-amber-700 border-0 gap-1">
                            <AlertTriangle className="h-3 w-3" /> Atenção
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 border-0">Normal</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {barData.length === 0 && lineData.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nenhum dado disponível. Defina orçamentos e registre lançamentos.
        </p>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

type CostAudit = { id: string; tabela: string; criado_em: string; autor_id: string | null; anterior: Record<string, unknown> | null; atual: Record<string, unknown> };
function HistoricoCustos({ obraId, refresh }: { obraId: string; refresh: number }) {
  const [rows, setRows] = useState<CostAudit[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setRows([]);
    if (!obraId) return;
    setLoading(true);
    (async () => {
      const result = await (supabase as any).from("custos_auditoria").select("*").eq("obra_id", obraId).order("criado_em", { ascending: false }).limit(200);
      if (active) { setRows(result.data ?? []); setError(result.error?.message ?? ""); setLoading(false); }
    })();
    return () => { active = false; };
  }, [obraId, refresh]);
  if (loading) return <p>Carregando histórico…</p>;
  if (error) return <Card className="p-4 text-red-700">Não foi possível carregar o histórico: {error}</Card>;
  return <div className="space-y-3"><p className="text-sm text-muted-foreground">Últimos 200 eventos. Revisões e cancelamentos são registrados automaticamente, sem apagar os valores anteriores.</p><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Registro</TableHead><TableHead>Evento</TableHead><TableHead>Antes</TableHead><TableHead>Depois</TableHead><TableHead>Justificativa</TableHead></TableRow></TableHeader><TableBody>
    {!rows.length && <TableRow><TableCell colSpan={6}>Nenhuma alteração registrada após a ativação deste controle.</TableCell></TableRow>}
    {rows.map(r => { const budget = r.tabela === "orcamento_itens"; const key = budget ? "valor_previsto" : "valor"; const cancelled = !!r.atual.cancelado_em; return <TableRow key={r.id}><TableCell title={r.autor_id ?? "Sistema"}>{new Date(r.criado_em).toLocaleString("pt-BR")}</TableCell><TableCell>{budget ? "Orçamento" : "Custo"}: {String(r.atual.descricao || r.atual.categoria_id)}</TableCell><TableCell>{!r.anterior ? "Cadastro" : cancelled ? "Cancelamento" : "Revisão"}</TableCell><TableCell>{r.anterior ? fmtBRL(Number(r.anterior[key])) : "—"}</TableCell><TableCell>{fmtBRL(Number(r.atual[key]))}{cancelled && " (cancelado)"}</TableCell><TableCell>{String(r.atual.motivo_revisao || r.atual.motivo_cancelamento || "—")}</TableCell></TableRow>; })}
  </TableBody></Table></div>;
}

export default function OrcadoRealizado() {
  const [obras, setObras]             = useState<Obra[]>([]);
  const [obraId, setObraId]           = useState("");
  const [categorias, setCategorias]   = useState<Categoria[]>([]);
  const [refresh, setRefresh]         = useState(0);
  const [initialError, setInitialError] = useState("");
  const triggerRefresh = () => setRefresh(r => r + 1);

  useEffect(() => {
    (async () => {
      const [{ data: ob, error: obError }, { data: cat, error: catError }] = await Promise.all([
        (supabase as any).from("obras").select("id, nome").is("arquivada_em", null).order("nome"),
        (supabase as any).from("orcamento_categorias").select("*").eq("ativo", true).order("ordem"),
      ]);
      setInitialError(obError?.message ?? catError?.message ?? "");
      setObras(ob ?? []);
      setCategorias(cat ?? []);
      if (ob?.length) setObraId(ob[0].id);
    })();
  }, []);

  return (
    <Layout>
      <div className="space-y-4 p-6">
        {initialError && <Card className="p-4 text-red-700">Falha ao carregar obras ou categorias: {initialError}</Card>}
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Orçado × Realizado</h1>
              <p className="text-sm text-muted-foreground">Controle financeiro de custos por obra</p>
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

        {/* Tabs */}
        <Tabs defaultValue="orcamento">
          <TabsList className="mb-4">
            <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
            <TabsTrigger value="analise">Análise Gráfica</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="orcamento">
            <OrcamentoTab
              obraId={obraId} obras={obras} categorias={categorias}
              refresh={refresh} triggerRefresh={triggerRefresh}
            />
          </TabsContent>

          <TabsContent value="lancamentos">
            <LancamentosTab
              obraId={obraId} obras={obras} categorias={categorias}
              refresh={refresh} triggerRefresh={triggerRefresh}
            />
          </TabsContent>

          <TabsContent value="analise">
            <AnaliseTab obraId={obraId} refresh={refresh} />
          </TabsContent>
          <TabsContent value="historico"><HistoricoCustos obraId={obraId} refresh={refresh} /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

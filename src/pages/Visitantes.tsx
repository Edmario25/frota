import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  ResponsiveContainer,
} from "recharts";
import {
  UserCheck, Plus, Pencil, Trash2, LogIn, LogOut, XCircle,
  Clock, ShieldCheck, Users, BarChart3, Search, AlertTriangle,
  BadgeCheck,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type Obra = { id: string; nome: string };
type Employee = { id: string; nome: string };

type Visitante = {
  id: string; nome: string; tipo_doc: string; numero_doc: string;
  empresa: string | null; cargo_empresa: string | null; telefone: string | null;
  foto_url: string | null; bloqueado: boolean; motivo_bloqueio: string | null; observacoes: string | null;
};

type Visita = {
  id: string; obra_id: string; visitante_id: string; motivo: string;
  setor_destino: string | null; responsavel_id: string | null; autorizado_por: string | null;
  status: string; entrada: string | null; saida: string | null;
  placa_veiculo: string | null; cracha_numero: string | null;
  observacoes: string | null; motivo_negado: string | null; created_at: string;
  // joins
  visitante?: Visitante;
  responsavel?: { nome: string };
};

type VisitaAtiva = {
  id: string; obra_id: string; obra_nome: string; motivo: string; setor_destino: string | null;
  entrada: string | null; cracha_numero: string | null; placa_veiculo: string | null; status: string;
  visitante_nome: string; visitante_empresa: string | null; tipo_doc: string; numero_doc: string;
  minutos_dentro: number | null; responsavel_nome: string | null;
};

type Kpi = {
  obra_id: string; obra_nome: string; total_visitas: number; dentro_agora: number;
  negados: number; hoje: number; visitantes_distintos: number; tempo_medio_min: number | null;
};

// ─── Lookups ────────────────────────────────────────────────────────────────

const STATUS_VISITA: Record<string, { label: string; cls: string; dot: string }> = {
  aguardando: { label: "Aguardando",  cls: "bg-slate-100  text-slate-600",  dot: "bg-slate-400"  },
  autorizado: { label: "Autorizado",  cls: "bg-blue-100   text-blue-700",   dot: "bg-blue-400"   },
  dentro:     { label: "Dentro",      cls: "bg-green-100  text-green-700",  dot: "bg-green-500"  },
  saiu:       { label: "Saiu",        cls: "bg-slate-100  text-slate-500",  dot: "bg-slate-300"  },
  negado:     { label: "Negado",      cls: "bg-red-100    text-red-700",    dot: "bg-red-500"    },
};

const TIPO_DOC: Record<string, string> = {
  cpf: "CPF", rg: "RG", passaporte: "Passaporte", cnh: "CNH", outro: "Outro",
};

function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}min`;
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── Modal: Visitante ─────────────────────────────────────────────────────

function VisitanteModal({
  open, onClose, onSaved, editing,
}: {
  open: boolean; onClose: () => void; onSaved: (v: Visitante) => void; editing: Visitante | null;
}) {
  const { toast } = useToast();
  const blank = {
    nome: "", tipo_doc: "cpf", numero_doc: "", empresa: "", cargo_empresa: "",
    telefone: "", foto_url: "", observacoes: "",
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setF(editing ? {
        nome: editing.nome, tipo_doc: editing.tipo_doc, numero_doc: editing.numero_doc,
        empresa: editing.empresa ?? "", cargo_empresa: editing.cargo_empresa ?? "",
        telefone: editing.telefone ?? "", foto_url: editing.foto_url ?? "",
        observacoes: editing.observacoes ?? "",
      } : blank);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.nome.trim() || !f.numero_doc.trim()) {
      toast({ title: "Nome e documento são obrigatórios", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      nome: f.nome.trim(), tipo_doc: f.tipo_doc, numero_doc: f.numero_doc.trim(),
      empresa: f.empresa || null, cargo_empresa: f.cargo_empresa || null,
      telefone: f.telefone || null, foto_url: f.foto_url || null,
      observacoes: f.observacoes || null,
    };
    const q = editing
      ? (supabase as any).from("visitantes").update(payload).eq("id", editing.id).select().single()
      : (supabase as any).from("visitantes").insert(payload).select().single();
    const { data, error } = await q;
    setSaving(false);
    if (error) {
      const msg = error.message.includes("unique") ? "Documento já cadastrado." : error.message;
      toast({ title: "Erro", description: msg, variant: "destructive" }); return;
    }
    toast({ title: editing ? "Visitante atualizado" : "Visitante cadastrado" });
    onSaved(data as Visitante);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar Visitante" : "Cadastrar Visitante"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label>Nome Completo *</Label>
            <Input value={f.nome} onChange={e => set("nome", e.target.value)} />
          </div>
          <div>
            <Label>Tipo Doc *</Label>
            <Select value={f.tipo_doc} onValueChange={v => set("tipo_doc", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_DOC).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nº Documento *</Label>
            <Input value={f.numero_doc} onChange={e => set("numero_doc", e.target.value)} />
          </div>
          <div>
            <Label>Empresa</Label>
            <Input value={f.empresa} onChange={e => set("empresa", e.target.value)} />
          </div>
          <div>
            <Label>Cargo na Empresa</Label>
            <Input value={f.cargo_empresa} onChange={e => set("cargo_empresa", e.target.value)} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={f.telefone} onChange={e => set("telefone", e.target.value)} />
          </div>
          <div>
            <Label>URL da Foto</Label>
            <Input value={f.foto_url} onChange={e => set("foto_url", e.target.value)} placeholder="https://..." />
          </div>
          <div className="col-span-2">
            <Label>Observações</Label>
            <Textarea value={f.observacoes} onChange={e => set("observacoes", e.target.value)} rows={2} />
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

// ─── Modal: Registrar Entrada ─────────────────────────────────────────────

function EntradaModal({
  open, onClose, onSaved, obras, employees, visitantePre,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; employees: Employee[]; visitantePre: Visitante | null;
}) {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [visitante, setVisitante] = useState<Visitante | null>(visitantePre);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Visitante[]>([]);
  const [novoModal, setNovoModal] = useState(false);
  const [f, setF] = useState({
    obra_id: obras[0]?.id ?? "", motivo: "", setor_destino: "",
    responsavel_id: "", placa_veiculo: "", observacoes: "", negar: false, motivo_negado: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setVisitante(visitantePre);
      setBusca("");
      setResultados([]);
      setF({ obra_id: obras[0]?.id ?? "", motivo: "", setor_destino: "", responsavel_id: "", placa_veiculo: "", observacoes: "", negar: false, motivo_negado: "" });
    }
  }, [open, visitantePre, obras]);

  const buscarVisitante = async () => {
    if (!busca.trim()) return;
    setBuscando(true);
    const { data } = await (supabase as any).from("visitantes")
      .select("*")
      .or(`nome.ilike.%${busca}%,numero_doc.ilike.%${busca}%`)
      .limit(10);
    setResultados(data ?? []);
    setBuscando(false);
  };

  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!visitante) { toast({ title: "Selecione um visitante", variant: "destructive" }); return; }
    if (!f.obra_id || !f.motivo.trim()) { toast({ title: "Obra e motivo são obrigatórios", variant: "destructive" }); return; }
    if (visitante.bloqueado) { toast({ title: "Visitante bloqueado", description: visitante.motivo_bloqueio ?? "", variant: "destructive" }); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const status = f.negar ? "negado" : "autorizado";
    const payload = {
      obra_id: f.obra_id, visitante_id: visitante.id, motivo: f.motivo,
      setor_destino: f.setor_destino || null, responsavel_id: f.responsavel_id || null,
      autorizado_por: user?.id ?? null, status,
      entrada: status === "autorizado" ? new Date().toISOString() : null,
      placa_veiculo: f.placa_veiculo || null,
      observacoes: f.observacoes || null,
      motivo_negado: f.negar ? (f.motivo_negado || null) : null,
    };
    const { error } = await (supabase as any).from("visitas").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: status === "autorizado" ? "Entrada registrada ✓" : "Acesso negado registrado" });
    onSaved();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrar Entrada</DialogTitle></DialogHeader>

          {/* Busca de visitante */}
          {!visitante ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou documento..."
                  onKeyDown={e => e.key === "Enter" && buscarVisitante()} />
                <Button onClick={buscarVisitante} disabled={buscando} variant="outline" size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {resultados.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {resultados.map(r => (
                    <button key={r.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      onClick={() => { setVisitante(r); setResultados([]); }}>
                      <div className="flex items-center gap-2">
                        {r.bloqueado && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                        <div>
                          <div className="font-medium">{r.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {TIPO_DOC[r.tipo_doc]}: {r.numero_doc}
                            {r.empresa ? ` · ${r.empresa}` : ""}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="text-center">
                <Button variant="outline" size="sm" onClick={() => setNovoModal(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Novo visitante
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cartão do visitante */}
              <div className={`border rounded-lg p-3 flex items-center gap-3 ${visitante.bloqueado ? "border-red-300 bg-red-50" : "bg-muted/30"}`}>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-lg font-bold text-primary">
                  {visitante.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{visitante.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {TIPO_DOC[visitante.tipo_doc]}: {visitante.numero_doc}
                    {visitante.empresa ? ` · ${visitante.empresa}` : ""}
                  </div>
                  {visitante.bloqueado && (
                    <div className="text-xs text-red-600 font-semibold mt-0.5">
                      🚫 Bloqueado: {visitante.motivo_bloqueio}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setVisitante(null)}>Trocar</Button>
              </div>

              {/* Formulário da visita */}
              <div className="grid gap-3">
                <div>
                  <Label>Obra *</Label>
                  <Select value={f.obra_id} onValueChange={v => set("obra_id", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Motivo da Visita *</Label>
                  <Input value={f.motivo} onChange={e => set("motivo", e.target.value)} placeholder="Ex: Reunião de coordenação" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Setor / Destino</Label>
                    <Input value={f.setor_destino} onChange={e => set("setor_destino", e.target.value)} />
                  </div>
                  <div>
                    <Label>Responsável (visitado)</Label>
                    <Select value={f.responsavel_id || "__none"} onValueChange={v => set("responsavel_id", v === "__none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Placa do Veículo</Label>
                  <Input value={f.placa_veiculo} onChange={e => set("placa_veiculo", e.target.value.toUpperCase())} placeholder="ABC-1234" />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={f.observacoes} onChange={e => set("observacoes", e.target.value)} rows={2} />
                </div>

                {/* Negar acesso */}
                <div className="border rounded-lg p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={f.negar} onChange={e => set("negar", e.target.checked)} className="h-4 w-4" />
                    <span className="font-medium text-red-600">Negar acesso</span>
                  </label>
                  {f.negar && (
                    <div>
                      <Label className="text-xs">Motivo da negação</Label>
                      <Input value={f.motivo_negado} onChange={e => set("motivo_negado", e.target.value)} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            {visitante && (
              <Button onClick={save} disabled={saving || visitante.bloqueado}
                variant={f.negar ? "destructive" : "default"}>
                {saving ? "Salvando…" : f.negar ? "Negar Acesso" : "Registrar Entrada"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VisitanteModal
        open={novoModal} onClose={() => setNovoModal(false)}
        editing={null}
        onSaved={v => { setVisitante(v); setNovoModal(false); }}
      />
    </>
  );
}

// ─── Tab: Recepção (visitas ativas) ───────────────────────────────────────

function RecepcaoTab({
  obras, employees, refresh, triggerRefresh,
}: { obras: Obra[]; employees: Employee[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [ativas, setAtivas] = useState<VisitaAtiva[]>([]);
  const [loading, setLoading] = useState(false);
  const [entradaModal, setEntradaModal] = useState(false);
  const [filterObra, setFilterObra] = useState("todas");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("v_visitas_ativas").select("*").order("entrada", { ascending: true });
    setAtivas(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  const registrarSaida = async (id: string) => {
    await (supabase as any).from("visitas").update({
      status: "saiu", saida: new Date().toISOString(),
    }).eq("id", id);
    toast({ title: "Saída registrada ✓" });
    triggerRefresh();
  };

  const filtradas = filterObra === "todas" ? ativas : ativas.filter(a => a.obra_id === filterObra);

  const dentroCount = ativas.filter(a => a.status === "dentro" || a.status === "autorizado").length;

  return (
    <div className="space-y-4">
      {/* KPI rápido */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-3 border-l-4 border-l-green-500">
          <p className="text-xs text-muted-foreground">Dentro agora</p>
          <p className="text-2xl font-bold text-green-600">{dentroCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Obras monitoradas</p>
          <p className="text-2xl font-bold">{new Set(ativas.map(a => a.obra_id)).size}</p>
        </Card>
        <Card className="p-3 md:col-span-1">
          <p className="text-xs text-muted-foreground">Tempo médio (hoje)</p>
          <p className="text-2xl font-bold">
            {fmtDuration(
              ativas.length > 0
                ? ativas.reduce((s, a) => s + (a.minutos_dentro ?? 0), 0) / ativas.length
                : null
            )}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Select value={filterObra} onValueChange={setFilterObra}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as obras</SelectItem>
            {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setEntradaModal(true)}>
          <LogIn className="h-4 w-4 mr-1" /> Registrar Entrada
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : filtradas.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg py-12 text-center">
          <UserCheck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">Nenhum visitante dentro da obra agora.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map(a => (
            <Card key={a.id} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-lg font-bold text-green-700">
                    {a.visitante_nome.charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{a.visitante_nome}</span>
                      {a.visitante_empresa && (
                        <span className="text-xs text-muted-foreground">· {a.visitante_empresa}</span>
                      )}
                      <Badge className="bg-green-100 text-green-700 border-0 text-xs gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                        Dentro
                      </Badge>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span>🏗 {a.obra_nome}</span>
                      <span>📋 {a.motivo}</span>
                      {a.responsavel_nome && <span>👤 {a.responsavel_nome}</span>}
                      {a.setor_destino && <span>📍 {a.setor_destino}</span>}
                      {a.placa_veiculo && <span>🚗 {a.placa_veiculo}</span>}
                    </div>
                  </div>
                  {/* Tempo + crachá */}
                  <div className="text-right text-xs flex-shrink-0">
                    {a.cracha_numero && (
                      <div className="flex items-center gap-1 font-mono font-semibold text-primary">
                        <BadgeCheck className="h-3 w-3" /> {a.cracha_numero}
                      </div>
                    )}
                    <div className="text-muted-foreground flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {fmtDuration(a.minutos_dentro)}
                    </div>
                    <div className="text-muted-foreground">
                      entrou {fmtDatetime(a.entrada)}
                    </div>
                  </div>
                  {/* Ação */}
                  <Button size="sm" variant="outline" className="h-8 text-xs flex-shrink-0"
                    onClick={() => registrarSaida(a.id)}>
                    <LogOut className="h-3 w-3 mr-1" /> Saída
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EntradaModal
        open={entradaModal} onClose={() => setEntradaModal(false)}
        onSaved={() => { setEntradaModal(false); triggerRefresh(); }}
        obras={obras} employees={employees} visitantePre={null}
      />
    </div>
  );
}

// ─── Tab: Histórico ───────────────────────────────────────────────────────

function HistoricoTab({ obraId, obras, refresh }: { obraId: string; obras: Obra[]; refresh: number }) {
  const [data, setData] = useState<Visita[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [obraFiltro, setObraFiltro] = useState(obraId || "todas");

  const load = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("visitas")
      .select("*, visitante:visitantes(*), responsavel:employees(nome)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (obraFiltro !== "todas") q = q.eq("obra_id", obraFiltro);
    const { data: rows } = await q;
    setData(rows ?? []);
    setLoading(false);
  }, [obraFiltro]);

  useEffect(() => { load(); }, [load, refresh]);

  const filtered = data.filter(v => {
    if (filterStatus !== "todos" && v.status !== filterStatus) return false;
    if (busca) {
      const term = busca.toLowerCase();
      const nome = (v.visitante as any)?.nome?.toLowerCase() ?? "";
      const doc  = (v.visitante as any)?.numero_doc?.toLowerCase() ?? "";
      if (!nome.includes(term) && !doc.includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="Buscar visitante..."
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={obraFiltro} onValueChange={setObraFiltro}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as obras</SelectItem>
            {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            {Object.entries(STATUS_VISITA).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visitante</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Crachá</TableHead>
                <TableHead>Placa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum registro.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(v => {
                const st = STATUS_VISITA[v.status] ?? STATUS_VISITA.aguardando;
                const durMin = v.entrada && v.saida
                  ? (new Date(v.saida).getTime() - new Date(v.entrada).getTime()) / 60000
                  : null;
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{(v.visitante as any)?.nome ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {(v.visitante as any)?.empresa ?? ""} · {TIPO_DOC[(v.visitante as any)?.tipo_doc ?? "outro"]}: {(v.visitante as any)?.numero_doc}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{v.motivo}</TableCell>
                    <TableCell>
                      <Badge className={`${st.cls} border-0 text-xs`}>{st.label}</Badge>
                      {v.motivo_negado && (
                        <div className="text-xs text-red-500 mt-0.5">{v.motivo_negado}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{fmtDatetime(v.entrada)}</TableCell>
                    <TableCell className="text-xs">{fmtDatetime(v.saida)}</TableCell>
                    <TableCell className="text-xs">{fmtDuration(durMin)}</TableCell>
                    <TableCell className="font-mono text-xs">{v.cracha_numero ?? "—"}</TableCell>
                    <TableCell className="text-xs">{v.placa_veiculo ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Cadastro de Visitantes ──────────────────────────────────────────

function CadastroTab({ refresh, triggerRefresh }: { refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Visitante[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Visitante | null>(null);
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("visitantes").select("*").order("nome");
    setData(rows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  const toggleBloqueio = async (v: Visitante) => {
    if (!v.bloqueado) {
      const motivo = prompt("Motivo do bloqueio:");
      if (!motivo) return;
      await (supabase as any).from("visitantes").update({ bloqueado: true, motivo_bloqueio: motivo }).eq("id", v.id);
    } else {
      if (!confirm("Desbloquear este visitante?")) return;
      await (supabase as any).from("visitantes").update({ bloqueado: false, motivo_bloqueio: null }).eq("id", v.id);
    }
    toast({ title: v.bloqueado ? "Visitante desbloqueado" : "Visitante bloqueado" });
    triggerRefresh();
  };

  const del = async (id: string) => {
    if (!confirm("Excluir visitante?")) return;
    const { error } = await (supabase as any).from("visitantes").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Excluído" });
    triggerRefresh();
  };

  const filtered = data.filter(v => {
    if (!busca) return true;
    const t = busca.toLowerCase();
    return v.nome.toLowerCase().includes(t) || v.numero_doc.includes(t) || (v.empresa ?? "").toLowerCase().includes(t);
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center justify-between">
        <div className="relative flex-1 max-w-64">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="Buscar..."
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Cadastrar Visitante
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum visitante cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(v => (
                <TableRow key={v.id} className={v.bloqueado ? "bg-red-50" : ""}>
                  <TableCell className="font-medium text-sm">{v.nome}</TableCell>
                  <TableCell className="text-sm">{TIPO_DOC[v.tipo_doc]}: {v.numero_doc}</TableCell>
                  <TableCell className="text-sm">{v.empresa ?? "—"}</TableCell>
                  <TableCell className="text-sm">{v.telefone ?? "—"}</TableCell>
                  <TableCell>
                    {v.bloqueado
                      ? <Badge className="bg-red-100 text-red-700 border-0 text-xs">Bloqueado</Badge>
                      : <Badge className="bg-green-100 text-green-700 border-0 text-xs">Liberado</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { setEditing(v); setModal(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className={`h-7 w-7 ${v.bloqueado ? "text-green-600" : "text-amber-600"}`}
                        onClick={() => toggleBloqueio(v)} title={v.bloqueado ? "Desbloquear" : "Bloquear"}>
                        {v.bloqueado ? <ShieldCheck className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500"
                        onClick={() => del(v.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <VisitanteModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        editing={editing}
      />
    </div>
  );
}

// ─── Tab: Relatório ───────────────────────────────────────────────────────

function RelatorioTab({ refresh }: { refresh: number }) {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    (supabase as any).from("v_visitantes_kpi").select("*").then(({ data }: { data: Kpi[] | null }) => {
      setKpis(data ?? []);
      setLoading(false);
    });
  }, [refresh]);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>;
  if (kpis.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">Sem dados para o relatório.</p>;

  const totalVisitas = kpis.reduce((s, k) => s + Number(k.total_visitas), 0);
  const totalHoje    = kpis.reduce((s, k) => s + Number(k.hoje), 0);
  const totalDentro  = kpis.reduce((s, k) => s + Number(k.dentro_agora), 0);
  const totalNegados = kpis.reduce((s, k) => s + Number(k.negados), 0);

  const barData = kpis.map(k => ({
    nome: k.obra_nome.length > 18 ? k.obra_nome.slice(0, 18) + "…" : k.obra_nome,
    Total: Number(k.total_visitas),
    Hoje:  Number(k.hoje),
  }));

  return (
    <div className="space-y-6">
      {/* KPIs globais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total de Visitas",   val: totalVisitas,  icon: Users,      cls: "text-primary"    },
          { label: "Hoje",               val: totalHoje,     icon: Clock,      cls: "text-blue-600"   },
          { label: "Dentro agora",       val: totalDentro,   icon: UserCheck,  cls: "text-green-600"  },
          { label: "Acessos Negados",    val: totalNegados,  icon: XCircle,    cls: "text-red-600"    },
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

      {/* Bar chart por obra */}
      {barData.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Visitas por Obra
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartTooltip />
              <Bar dataKey="Total" fill="#94a3b8" radius={[4,4,0,0]} name="Total" />
              <Bar dataKey="Hoje"  fill="#3b82f6" radius={[4,4,0,0]} name="Hoje"  />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela por obra */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obra</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Hoje</TableHead>
              <TableHead className="text-right">Dentro</TableHead>
              <TableHead className="text-right">Negados</TableHead>
              <TableHead className="text-right">Visitantes únicos</TableHead>
              <TableHead className="text-right">Tempo Médio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.map(k => (
              <TableRow key={k.obra_id}>
                <TableCell className="font-medium text-sm">{k.obra_nome}</TableCell>
                <TableCell className="text-right">{k.total_visitas}</TableCell>
                <TableCell className="text-right text-blue-600 font-semibold">{k.hoje}</TableCell>
                <TableCell className="text-right text-green-600 font-semibold">{k.dentro_agora}</TableCell>
                <TableCell className="text-right text-red-600">{k.negados}</TableCell>
                <TableCell className="text-right">{k.visitantes_distintos}</TableCell>
                <TableCell className="text-right text-sm">{fmtDuration(k.tempo_medio_min)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function Visitantes() {
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
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-teal-100 flex items-center justify-center">
            <UserCheck className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Controle de Visitantes</h1>
            <p className="text-sm text-muted-foreground">Recepção, histórico e gestão de acessos</p>
          </div>
        </div>

        <Tabs defaultValue="recepcao">
          <TabsList className="mb-4">
            <TabsTrigger value="recepcao">
              <LogIn className="h-3.5 w-3.5 mr-1.5" /> Recepção
            </TabsTrigger>
            <TabsTrigger value="historico">
              <Clock className="h-3.5 w-3.5 mr-1.5" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="cadastro">
              <Users className="h-3.5 w-3.5 mr-1.5" /> Visitantes
            </TabsTrigger>
            <TabsTrigger value="relatorio">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Relatório
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recepcao">
            <RecepcaoTab
              obras={obras} employees={employees}
              refresh={refresh} triggerRefresh={triggerRefresh}
            />
          </TabsContent>
          <TabsContent value="historico">
            <HistoricoTab obraId={obraId} obras={obras} refresh={refresh} />
          </TabsContent>
          <TabsContent value="cadastro">
            <CadastroTab refresh={refresh} triggerRefresh={triggerRefresh} />
          </TabsContent>
          <TabsContent value="relatorio">
            <RelatorioTab refresh={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

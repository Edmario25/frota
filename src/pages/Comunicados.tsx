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
import { Switch } from "@/components/ui/switch";
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
  Megaphone, Plus, Pencil, Trash2, Send, Pin, Eye,
  CheckCircle2, Clock, AlertTriangle, Bell, Users, BookOpen,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type Obra = { id: string; nome: string };
type Cargo = { id: string; nome: string };

type Comunicado = {
  id: string; titulo: string; corpo: string;
  categoria: string; prioridade: string; publicado: boolean;
  fixado: boolean; exige_leitura: boolean; destino: string;
  data_publicacao: string | null; data_validade: string | null;
  autor_id: string | null; created_at: string;
  // view
  autor_nome?: string; total_leituras?: number; obras_nomes?: string[];
};

type Leitura = {
  comunicado_id: string; user_id: string; data_leitura: string;
  profile?: { full_name: string };
};

// ─── Lookups ────────────────────────────────────────────────────────────────

const CAT: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  aviso:        { label: "Aviso",        icon: Bell,          cls: "bg-blue-100   text-blue-700"    },
  comunicado:   { label: "Comunicado",   icon: Megaphone,     cls: "bg-slate-100  text-slate-700"   },
  alerta:       { label: "Alerta",       icon: AlertTriangle, cls: "bg-red-100    text-red-700"     },
  procedimento: { label: "Procedimento", icon: BookOpen,      cls: "bg-amber-100  text-amber-700"   },
  treinamento:  { label: "Treinamento",  icon: Users,         cls: "bg-emerald-100 text-emerald-700"},
};

const PRIO: Record<string, { label: string; cls: string; border: string }> = {
  normal:     { label: "Normal",     cls: "bg-slate-100  text-slate-600",  border: "border-l-slate-300"  },
  importante: { label: "Importante", cls: "bg-blue-100   text-blue-700",   border: "border-l-blue-400"   },
  urgente:    { label: "Urgente",    cls: "bg-amber-100  text-amber-700",  border: "border-l-amber-400"  },
  critico:    { label: "Crítico",    cls: "bg-red-100    text-red-700",    border: "border-l-red-500"    },
};

// ─── Modal: Comunicado ────────────────────────────────────────────────────

function ComunicadoModal({
  open, onClose, onSaved, obras, cargos, editing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; cargos: Cargo[]; editing: Comunicado | null;
}) {
  const { toast } = useToast();
  const blank = {
    titulo: "", corpo: "", categoria: "aviso", prioridade: "normal",
    destino: "todos", publicado: false, fixado: false, exige_leitura: false,
    data_publicacao: new Date().toISOString().slice(0, 10), data_validade: "",
  };
  const [f, setF] = useState(blank);
  const [obrasSelected, setObrasSelected] = useState<string[]>([]);
  const [cargosSelected, setCargosSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          titulo: editing.titulo, corpo: editing.corpo,
          categoria: editing.categoria, prioridade: editing.prioridade,
          destino: editing.destino, publicado: editing.publicado,
          fixado: editing.fixado, exige_leitura: editing.exige_leitura,
          data_publicacao: editing.data_publicacao ?? new Date().toISOString().slice(0, 10),
          data_validade: editing.data_validade ?? "",
        });
        // Carregar obras/cargos vinculados
        Promise.all([
          (supabase as any).from("comunicados_obras").select("obra_id").eq("comunicado_id", editing.id),
          (supabase as any).from("comunicados_cargos").select("cargo_id").eq("comunicado_id", editing.id),
        ]).then(([r1, r2]) => {
          setObrasSelected((r1.data ?? []).map((x: { obra_id: string }) => x.obra_id));
          setCargosSelected((r2.data ?? []).map((x: { cargo_id: string }) => x.cargo_id));
        });
      } else {
        setF(blank);
        setObrasSelected([]);
        setCargosSelected([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  const toggleObra  = (id: string) => setObrasSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleCargo = (id: string) => setCargosSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const save = async () => {
    if (!f.titulo.trim() || !f.corpo.trim()) {
      toast({ title: "Título e corpo são obrigatórios", variant: "destructive" }); return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      titulo: f.titulo, corpo: f.corpo, categoria: f.categoria, prioridade: f.prioridade,
      destino: f.destino, publicado: f.publicado, fixado: f.fixado, exige_leitura: f.exige_leitura,
      data_publicacao: f.data_publicacao || null, data_validade: f.data_validade || null,
      autor_id: editing ? undefined : (user?.id ?? null),
    };
    let id = editing?.id;
    if (editing) {
      const { error } = await (supabase as any).from("comunicados").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setSaving(false); return; }
    } else {
      const { data, error } = await (supabase as any).from("comunicados").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setSaving(false); return; }
      id = data.id;
    }
    // Salvar vínculos
    if (id) {
      await Promise.all([
        (supabase as any).from("comunicados_obras").delete().eq("comunicado_id", id),
        (supabase as any).from("comunicados_cargos").delete().eq("comunicado_id", id),
      ]);
      if (f.destino === "por_obra" && obrasSelected.length > 0) {
        await (supabase as any).from("comunicados_obras").insert(
          obrasSelected.map(oid => ({ comunicado_id: id, obra_id: oid }))
        );
      }
      if (f.destino === "por_cargo" && cargosSelected.length > 0) {
        await (supabase as any).from("comunicados_cargos").insert(
          cargosSelected.map(cid => ({ comunicado_id: id, cargo_id: cid }))
        );
      }
    }
    toast({ title: editing ? "Comunicado atualizado" : "Comunicado criado" });
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Comunicado" : "Novo Comunicado"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Título *</Label>
            <Input value={f.titulo} onChange={e => set("titulo", e.target.value)} />
          </div>
          <div>
            <Label>Conteúdo *</Label>
            <Textarea value={f.corpo} onChange={e => set("corpo", e.target.value)} rows={5}
              placeholder="Digite o comunicado completo..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select value={f.categoria} onValueChange={v => set("categoria", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CAT).map(([k, c]) => <SelectItem key={k} value={k}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={f.prioridade} onValueChange={v => set("prioridade", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIO).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data Publicação</Label>
              <Input type="date" value={f.data_publicacao} onChange={e => set("data_publicacao", e.target.value)} />
            </div>
            <div>
              <Label>Data Validade (opcional)</Label>
              <Input type="date" value={f.data_validade} onChange={e => set("data_validade", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Destinatário</Label>
            <Select value={f.destino} onValueChange={v => set("destino", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="por_obra">Por Obra</SelectItem>
                <SelectItem value="por_cargo">Por Cargo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {f.destino === "por_obra" && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Selecione as obras</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                {obras.map(o => (
                  <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={obrasSelected.includes(o.id)}
                      onChange={() => toggleObra(o.id)} className="h-3.5 w-3.5" />
                    {o.nome}
                  </label>
                ))}
              </div>
            </div>
          )}
          {f.destino === "por_cargo" && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Selecione os cargos</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                {cargos.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={cargosSelected.includes(c.id)}
                      onChange={() => toggleCargo(c.id)} className="h-3.5 w-3.5" />
                    {c.nome}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 border rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Switch checked={f.publicado} onCheckedChange={v => set("publicado", v)} />
              <Label className="font-normal text-sm">Publicado</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={f.fixado} onCheckedChange={v => set("fixado", v)} />
              <Label className="font-normal text-sm">Fixado no mural</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={f.exige_leitura} onCheckedChange={v => set("exige_leitura", v)} />
              <Label className="font-normal text-sm">Exige confirmação</Label>
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

// ─── Modal: Leituras ─────────────────────────────────────────────────────

function LeiturasModal({
  open, onClose, comunicadoId, comunicadoTitulo,
}: {
  open: boolean; onClose: () => void; comunicadoId: string; comunicadoTitulo: string;
}) {
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !comunicadoId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("comunicados_leituras")
        .select("*, profile:profiles(full_name)")
        .eq("comunicado_id", comunicadoId)
        .order("data_leitura", { ascending: false });
      setLeituras(data ?? []);
      setLoading(false);
    })();
  }, [open, comunicadoId]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmações de Leitura</DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{comunicadoTitulo}</p>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>
        ) : leituras.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma leitura confirmada ainda.</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {leituras.map(l => (
              <div key={l.user_id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span>{(l.profile as any)?.full_name ?? l.user_id}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(l.data_leitura).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Gestão (admin) ──────────────────────────────────────────────────

function GestaoTab({
  obras, cargos, refresh, triggerRefresh,
}: { obras: Obra[]; cargos: Cargo[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Comunicado | null>(null);
  const [leiturasModal, setLeiturasModal] = useState<Comunicado | null>(null);
  const [filterCat, setFilterCat] = useState("todas");
  const [filterPub, setFilterPub] = useState("todos");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("v_comunicados_resumo")
      .select("*")
      .order("fixado", { ascending: false })
      .order("data_publicacao", { ascending: false });
    setData(rows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  const del = async (id: string) => {
    if (!confirm("Excluir comunicado?")) return;
    await (supabase as any).from("comunicados").delete().eq("id", id);
    toast({ title: "Excluído" });
    triggerRefresh();
  };

  const publish = async (id: string, current: boolean) => {
    await (supabase as any).from("comunicados").update({
      publicado: !current,
      data_publicacao: !current ? new Date().toISOString().slice(0, 10) : undefined,
    }).eq("id", id);
    toast({ title: !current ? "Publicado" : "Despublicado" });
    triggerRefresh();
  };

  const filtered = data.filter(c => {
    if (filterCat !== "todas" && c.categoria !== filterCat) return false;
    if (filterPub === "publicados"  && !c.publicado) return false;
    if (filterPub === "rascunhos"   &&  c.publicado) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total",       val: data.length },
          { label: "Publicados",  val: data.filter(c => c.publicado).length },
          { label: "Fixados",     val: data.filter(c => c.fixado).length },
          { label: "Críticos",    val: data.filter(c => c.prioridade === "critico" && c.publicado).length },
        ].map(k => (
          <Card key={k.label} className="p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-xl font-bold">{k.val}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              {Object.entries(CAT).map(([k, c]) => <SelectItem key={k} value={k}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPub} onValueChange={setFilterPub}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="publicados">Publicados</SelectItem>
              <SelectItem value="rascunhos">Rascunhos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Comunicado
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Publicado</TableHead>
                <TableHead>Leituras</TableHead>
                <TableHead>Data</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum comunicado.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(c => {
                const cat  = CAT[c.categoria]  ?? CAT.aviso;
                const prio = PRIO[c.prioridade] ?? PRIO.normal;
                const CatIcon = cat.icon;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {c.fixado && <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                        <span className="font-medium text-sm truncate max-w-[200px]">{c.titulo}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${cat.cls} border-0 gap-1 text-xs`}>
                        <CatIcon className="h-2.5 w-2.5" />{cat.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${prio.cls} border-0 text-xs`}>{prio.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.destino === "todos" ? "Todos" :
                       c.destino === "por_obra" ? (c.obras_nomes?.join(", ") ?? "Por obra") : "Por cargo"}
                    </TableCell>
                    <TableCell>
                      <Switch checked={c.publicado} onCheckedChange={() => publish(c.id, c.publicado)} />
                    </TableCell>
                    <TableCell>
                      {c.exige_leitura ? (
                        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1"
                          onClick={() => setLeiturasModal(c)}>
                          <Eye className="h-3 w-3" />
                          {c.total_leituras ?? 0}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.data_publicacao ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => { setEditing(c); setModal(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500"
                          onClick={() => del(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ComunicadoModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras} cargos={cargos} editing={editing}
      />
      {leiturasModal && (
        <LeiturasModal
          open={!!leiturasModal} onClose={() => setLeiturasModal(null)}
          comunicadoId={leiturasModal.id} comunicadoTitulo={leiturasModal.titulo}
        />
      )}
    </div>
  );
}

// ─── Tab: Mural (visão de todos) ──────────────────────────────────────────

function MuralTab({ refresh, triggerRefresh }: { refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Comunicado[]>([]);
  const [minhasLeituras, setMinhasLeituras] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = useState("todas");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: d }) => setUserId(d.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("v_comunicados_resumo")
      .select("*")
      .eq("publicado", true)
      .order("fixado", { ascending: false })
      .order("data_publicacao", { ascending: false });
    setData(rows ?? []);

    // Carregar minhas leituras
    if (userId) {
      const { data: lr } = await (supabase as any)
        .from("comunicados_leituras").select("comunicado_id").eq("user_id", userId);
      setMinhasLeituras(new Set((lr ?? []).map((l: { comunicado_id: string }) => l.comunicado_id)));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load, refresh]);

  const confirmarLeitura = async (id: string) => {
    if (!userId) return;
    const { error } = await (supabase as any)
      .from("comunicados_leituras")
      .insert({ comunicado_id: id, user_id: userId });
    if (error && !error.message.includes("duplicate")) {
      toast({ title: "Erro", description: error.message, variant: "destructive" }); return;
    }
    setMinhasLeituras(p => new Set([...p, id]));
    toast({ title: "Leitura confirmada ✓" });
    triggerRefresh();
  };

  const toggle = (id: string) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  const today = new Date().toISOString().slice(0, 10);
  const filtered = data.filter(c => {
    if (c.data_validade && c.data_validade < today) return false;
    if (filterCat !== "todas" && c.categoria !== filterCat) return false;
    return true;
  });

  const naolidos = filtered.filter(c => c.exige_leitura && !minhasLeituras.has(c.id)).length;

  return (
    <div className="space-y-4">
      {/* Alerta pendentes */}
      {naolidos > 0 && (
        <div className="flex items-center gap-3 border border-amber-300 bg-amber-50 rounded-lg px-4 py-3 text-sm text-amber-800">
          <Bell className="h-4 w-4 flex-shrink-0" />
          <span>Você tem <strong>{naolidos} comunicado(s)</strong> que exigem confirmação de leitura.</span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas categorias</SelectItem>
            {Object.entries(CAT).map(([k, c]) => <SelectItem key={k} value={k}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhum comunicado publicado.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const cat  = CAT[c.categoria]  ?? CAT.aviso;
            const prio = PRIO[c.prioridade] ?? PRIO.normal;
            const CatIcon = cat.icon;
            const lido = minhasLeituras.has(c.id);
            const isOpen = expanded.has(c.id);
            return (
              <Card key={c.id} className={`border-l-4 ${prio.border} overflow-hidden ${!lido && c.exige_leitura ? "ring-1 ring-amber-300" : ""}`}>
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start gap-3 cursor-pointer" onClick={() => toggle(c.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.fixado && <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                        <span className={`font-semibold text-sm ${!lido && c.exige_leitura ? "font-bold" : ""}`}>
                          {c.titulo}
                        </span>
                        <Badge className={`${cat.cls} border-0 gap-1 text-xs`}>
                          <CatIcon className="h-2.5 w-2.5" />{cat.label}
                        </Badge>
                        <Badge className={`${prio.cls} border-0 text-xs`}>{prio.label}</Badge>
                        {c.exige_leitura && lido && (
                          <Badge className="bg-green-100 text-green-700 border-0 text-xs gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Lido
                          </Badge>
                        )}
                        {c.exige_leitura && !lido && (
                          <Badge className="bg-amber-100 text-amber-700 border-0 text-xs gap-1">
                            <Clock className="h-2.5 w-2.5" /> Pendente
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                        {c.autor_nome && <span>por {c.autor_nome}</span>}
                        {c.data_publicacao && <span>{c.data_publicacao}</span>}
                        {c.data_validade && <span>· válido até {c.data_validade}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Corpo expandido */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-sm whitespace-pre-wrap">{c.corpo}</p>
                      {c.exige_leitura && !lido && (
                        <Button className="mt-3 h-8 text-xs" onClick={() => confirmarLeitura(c.id)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmar Leitura
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function Comunicados() {
  const [obras, setObras]   = useState<Obra[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [refresh, setRefresh] = useState(0);
  const triggerRefresh = () => setRefresh(r => r + 1);

  useEffect(() => {
    (async () => {
      const [{ data: ob }, { data: ca }] = await Promise.all([
        (supabase as any).from("obras").select("id, nome").order("nome"),
        (supabase as any).from("cargos").select("id, nome").order("nome"),
      ]);
      setObras(ob ?? []);
      setCargos(ca ?? []);
    })();
  }, []);

  return (
    <Layout>
      <div className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Comunicação Interna</h1>
            <p className="text-sm text-muted-foreground">Comunicados, avisos e mural da equipe</p>
          </div>
        </div>

        <Tabs defaultValue="mural">
          <TabsList className="mb-4">
            <TabsTrigger value="mural">
              <Bell className="h-3.5 w-3.5 mr-1.5" /> Mural
            </TabsTrigger>
            <TabsTrigger value="gestao">
              <Send className="h-3.5 w-3.5 mr-1.5" /> Gestão
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mural">
            <MuralTab refresh={refresh} triggerRefresh={triggerRefresh} />
          </TabsContent>

          <TabsContent value="gestao">
            <GestaoTab
              obras={obras} cargos={cargos}
              refresh={refresh} triggerRefresh={triggerRefresh}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

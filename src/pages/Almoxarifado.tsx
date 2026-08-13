import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Package, Plus, Pencil, RefreshCw, Search, Download,
  AlertTriangle, CheckCircle2, ArrowDownToLine, ArrowUpFromLine,
  ClipboardList, BookOpen, RotateCcw, Building2, TrendingDown,
  ShoppingCart, Check, X, ChevronDown, Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Obra    { id: string; nome: string }
interface Material { id: string; nome: string; unidade: string; categoria: string | null; codigo_interno: string | null; ativo: boolean; descricao: string | null }
interface Estoque { id: string; obra_id: string; material_id: string; quantidade: number; quantidade_minima: number; localizacao: string | null; materiais_catalogo: Material }
interface Movimento { id: string; data_movimento: string; tipo: string; quantidade: number; frente: string | null; fornecedor: string | null; nota_fiscal: string | null; observacoes: string | null; materiais_catalogo: { nome: string; unidade: string } }
interface Requisicao { id: string; material_id: string; quantidade: number; urgencia: string; status: string; justificativa: string | null; data_solicitacao: string; data_necessidade: string | null; materiais_catalogo: { nome: string; unidade: string } }

const CATEGORIAS = ["Cimento e Argamassa","Ferro e Aço","Madeira","Elétrico","Hidráulico","Acabamento","Ferragens","Impermeabilização","EPI","Outro"];
const UNIDADES   = ["un","kg","m","m²","m³","L","cx","sc","pc","t","rolo"];
const TIPOS_MOV  = [
  { value: "entrada",       label: "Entrada de Material",  icon: ArrowDownToLine, color: "text-green-600" },
  { value: "saida",         label: "Saída / Consumo",      icon: ArrowUpFromLine, color: "text-red-600" },
  { value: "ajuste",        label: "Ajuste de Inventário", icon: RotateCcw,       color: "text-blue-600" },
];
const URGENCIAS  = [
  { value: "normal",  label: "Normal",   color: "bg-gray-100 text-gray-600" },
  { value: "urgente", label: "Urgente",  color: "bg-amber-100 text-amber-700" },
  { value: "critico", label: "Crítico",  color: "bg-red-100 text-red-700" },
];
const STATUS_REQ = [
  { value: "pendente",  label: "Pendente",  color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "aprovada",  label: "Aprovada",  color: "bg-green-100 text-green-700 border-green-200" },
  { value: "rejeitada", label: "Rejeitada", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "entregue",  label: "Entregue",  color: "bg-blue-100 text-blue-700 border-blue-200" },
];

function statusColor(s: string) { return STATUS_REQ.find(x => x.value === s)?.color ?? "bg-muted text-muted-foreground"; }
function urgColor(u: string)    { return URGENCIAS.find(x => x.value === u)?.color ?? ""; }
function fmtQtd(q: number, u: string) { return `${q % 1 === 0 ? q.toFixed(0) : q.toFixed(2)} ${u}`; }
function today() { return format(new Date(), "yyyy-MM-dd"); }

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Almoxarifado() {
  const [obras, setObras]         = useState<Obra[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [obraId, setObraId]       = useState("");

  useEffect(() => {
    supabase.from("obras").select("id, nome").order("nome").then(({ data }) => setObras((data ?? []) as Obra[]));
    fetchMateriais();
  }, []);

  async function fetchMateriais() {
    const { data } = await (supabase as any).from("materiais_catalogo").select("*").order("nome");
    setMateriais((data ?? []) as Material[]);
  }

  const obraNome = obras.find(o => o.id === obraId)?.nome ?? "";

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Almoxarifado</h1>
          <p className="text-muted-foreground text-sm">Controle de materiais, estoque e requisições por obra</p>
        </div>

        <Tabs defaultValue="estoque">
          <TabsList className="rounded-xl h-10">
            <TabsTrigger value="estoque"       className="rounded-lg gap-1.5"><Package className="h-3.5 w-3.5" /> Estoque</TabsTrigger>
            <TabsTrigger value="movimentacoes" className="rounded-lg gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Movimentações</TabsTrigger>
            <TabsTrigger value="requisicoes"   className="rounded-lg gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Requisições</TabsTrigger>
            <TabsTrigger value="catalogo"      className="rounded-lg gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Catálogo</TabsTrigger>
          </TabsList>

          <TabsContent value="estoque">
            <EstoqueTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} />
          </TabsContent>
          <TabsContent value="movimentacoes">
            <MovimentacoesTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} obraNome={obraNome} />
          </TabsContent>
          <TabsContent value="requisicoes">
            <RequisicoesTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} />
          </TabsContent>
          <TabsContent value="catalogo">
            <CatalogoTab materiais={materiais} onRefresh={fetchMateriais} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Estoque
// ═══════════════════════════════════════════════════════════════
function EstoqueTab({ obras, obraId, setObraId, materiais }: { obras: Obra[]; obraId: string; setObraId: (v: string) => void; materiais: Material[] }) {
  const [estoque, setEstoque] = useState<Estoque[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [movOpen, setMovOpen] = useState(false);
  const [selMaterial, setSelMaterial] = useState<Estoque | null>(null);

  const fetchEstoque = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("almoxarifado_estoque")
      .select("*, materiais_catalogo(*)")
      .eq("obra_id", obraId)
      .order("quantidade", { ascending: true });
    setEstoque((data ?? []) as Estoque[]);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  // KPIs
  const emAlerta   = estoque.filter(e => e.quantidade <= e.quantidade_minima && e.quantidade_minima > 0).length;
  const semEstoque = estoque.filter(e => e.quantidade === 0).length;
  const totalItens = estoque.length;

  const filtered = estoque.filter(e =>
    !search || e.materiais_catalogo.nome.toLowerCase().includes(search.toLowerCase())
  );

  // Exportar CSV do estoque
  function exportCSV() {
    const obraNome = obras.find(o => o.id === obraId)?.nome ?? obraId;
    const csv = ["Material,Categoria,Unidade,Quantidade,Qtd.Mínima,Localização,Status"]
      .concat(filtered.map(e => {
        const status = e.quantidade === 0 ? "Zerado" : e.quantidade <= e.quantidade_minima ? "Alerta" : "OK";
        return `"${e.materiais_catalogo.nome}","${e.materiais_catalogo.categoria ?? ""}","${e.materiais_catalogo.unidade}",${e.quantidade},${e.quantidade_minima},"${e.localizacao ?? ""}","${status}"`;
      })).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `estoque_${obraNome}_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Filtro de obra */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="pt-5 pb-5">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-48 space-y-1.5">
              <Label>Obra</Label>
              <Select value={obraId} onValueChange={setObraId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {obraId && (
              <>
                <Button onClick={() => { setSelMaterial(null); setMovOpen(true); }} className="gap-2 rounded-xl">
                  <Plus className="h-4 w-4" /> Nova Movimentação
                </Button>
                <Button variant="outline" onClick={exportCSV} className="gap-2 rounded-xl">
                  <Download className="h-4 w-4" /> Exportar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {obraId && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Itens em estoque",  value: totalItens, icon: Boxes,         color: "bg-primary/10 text-primary" },
              { label: "Em alerta (baixo)", value: emAlerta,   icon: AlertTriangle, color: emAlerta > 0   ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" : "bg-muted/50 text-muted-foreground" },
              { label: "Sem estoque",       value: semEstoque, icon: TrendingDown,  color: semEstoque > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30"   : "bg-muted/50 text-muted-foreground" },
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

          {/* Tabela de estoque */}
          <Card className="border-0 shadow-medium rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl h-9 text-sm" />
                </div>
                <Button variant="ghost" size="sm" onClick={fetchEstoque} className="gap-1.5 rounded-xl"><RefreshCw className="h-3.5 w-3.5" /></Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? <div className="space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-12 rounded-xl"/>)}</div> : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Material</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Mínimo</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Nenhum material em estoque. Registre a primeira entrada.</TableCell></TableRow>}
                    {filtered.map(e => {
                      const zerado = e.quantidade === 0;
                      const alerta = !zerado && e.quantidade_minima > 0 && e.quantidade <= e.quantidade_minima;
                      return (
                        <TableRow key={e.id} className={cn(zerado ? "bg-red-50/50 dark:bg-red-950/10" : alerta ? "bg-amber-50/50 dark:bg-amber-950/10" : "")}>
                          <TableCell>
                            <p className="font-medium text-sm">{e.materiais_catalogo.nome}</p>
                            {e.materiais_catalogo.codigo_interno && <p className="text-xs text-muted-foreground">{e.materiais_catalogo.codigo_interno}</p>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.materiais_catalogo.categoria ?? "—"}</TableCell>
                          <TableCell className="text-right font-bold text-sm">{fmtQtd(e.quantidade, e.materiais_catalogo.unidade)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{e.quantidade_minima > 0 ? fmtQtd(e.quantidade_minima, e.materiais_catalogo.unidade) : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.localizacao ?? "—"}</TableCell>
                          <TableCell>
                            {zerado ? (
                              <Badge variant="outline" className="text-xs rounded-full bg-red-50 text-red-600 border-red-200">Zerado</Badge>
                            ) : alerta ? (
                              <Badge variant="outline" className="text-xs rounded-full bg-amber-50 text-amber-600 border-amber-200"><AlertTriangle className="h-2.5 w-2.5 mr-1" />Alerta</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs rounded-full bg-green-50 text-green-600 border-green-200"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />OK</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs rounded-lg"
                              onClick={() => { setSelMaterial(e); setMovOpen(true); }}>
                              <Plus className="h-3 w-3" /> Mov.
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!obraId && (
        <EmptyObra icon={Package} msg="Selecione uma obra para ver o estoque de materiais." />
      )}

      {/* Modal Nova Movimentação */}
      <MovimentacaoModal
        open={movOpen}
        onClose={() => setMovOpen(false)}
        obraId={obraId}
        materiais={materiais}
        preselMaterialId={selMaterial?.material_id}
        onSaved={fetchEstoque}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Movimentações
// ═══════════════════════════════════════════════════════════════
function MovimentacoesTab({ obras, obraId, setObraId, materiais, obraNome }: { obras: Obra[]; obraId: string; setObraId: (v: string) => void; materiais: Material[]; obraNome: string }) {
  const [movs, setMovs]     = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [movOpen, setMovOpen] = useState(false);
  const [dataIni, setDataIni] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(today());

  const fetchMovs = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("almoxarifado_movimentos")
      .select("*, materiais_catalogo(nome, unidade)")
      .eq("obra_id", obraId)
      .gte("data_movimento", dataIni)
      .lte("data_movimento", dataFim)
      .order("created_at", { ascending: false });
    setMovs((data ?? []) as Movimento[]);
    setLoading(false);
  }, [obraId, dataIni, dataFim]);

  useEffect(() => { fetchMovs(); }, [fetchMovs]);

  const tipoInfo = (t: string) => TIPOS_MOV.find(x => x.value === t) ?? TIPOS_MOV[0];

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <Select value={obraId} onValueChange={setObraId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>De</Label><Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="rounded-xl" /></div>
            <Button onClick={() => setMovOpen(true)} disabled={!obraId} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Nova Movimentação
            </Button>
          </div>
        </CardContent>
      </Card>

      {obraId ? (
        <Card className="border-0 shadow-medium rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{obraNome} — {movs.length} movimentações</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? <Skeleton className="h-40 rounded-xl" /> : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Frente / Fornecedor</TableHead>
                    <TableHead>NF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhuma movimentação no período.</TableCell></TableRow>}
                  {movs.map(m => {
                    const ti = tipoInfo(m.tipo);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm whitespace-nowrap">{format(new Date(m.data_movimento + "T12:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          <span className={cn("flex items-center gap-1.5 text-sm font-medium", ti.color)}>
                            <ti.icon className="h-3.5 w-3.5" />{ti.label}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{m.materiais_catalogo.nome}</TableCell>
                        <TableCell className={cn("text-right font-bold text-sm", m.tipo === "saida" ? "text-red-600" : "text-green-600")}>
                          {m.tipo === "saida" ? "-" : "+"}{fmtQtd(m.quantidade, m.materiais_catalogo.unidade)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.frente ?? m.fornecedor ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.nota_fiscal ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : <EmptyObra icon={ClipboardList} msg="Selecione uma obra para ver as movimentações." />}

      <MovimentacaoModal open={movOpen} onClose={() => setMovOpen(false)} obraId={obraId} materiais={materiais} onSaved={fetchMovs} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Requisições de Compra
// ═══════════════════════════════════════════════════════════════
function RequisicoesTab({ obras, obraId, setObraId, materiais }: { obras: Obra[]; obraId: string; setObraId: (v: string) => void; materiais: Material[] }) {
  const [reqs, setReqs]         = useState<Requisicao[]>([]);
  const [loading, setLoading]   = useState(false);
  const [reqOpen, setReqOpen]   = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("pendente");

  const fetchReqs = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    let q = (supabase as any).from("requisicoes_compra").select("*, materiais_catalogo(nome, unidade)").eq("obra_id", obraId);
    if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
    const { data } = await q.order("created_at", { ascending: false });
    setReqs((data ?? []) as Requisicao[]);
    setLoading(false);
  }, [obraId, filtroStatus]);

  useEffect(() => { fetchReqs(); }, [fetchReqs]);

  async function handleStatus(id: string, status: string) {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase as any).from("requisicoes_compra").update({ status, aprovado_por: user?.id }).eq("id", id);
    toast.success(`Requisição ${status}!`);
    fetchReqs();
  }

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="pt-5 pb-5">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-48 space-y-1.5">
              <Label>Obra</Label>
              <Select value={obraId} onValueChange={setObraId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="rounded-xl w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {STATUS_REQ.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setReqOpen(true)} disabled={!obraId} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Nova Requisição
            </Button>
          </div>
        </CardContent>
      </Card>

      {obraId ? (
        <div className="space-y-3">
          {loading && <Skeleton className="h-40 rounded-2xl" />}
          {!loading && reqs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
              <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma requisição {filtroStatus !== "todos" ? `com status "${filtroStatus}"` : ""}.</p>
            </div>
          )}
          {!loading && reqs.map(r => (
            <Card key={r.id} className="border-0 shadow-subtle rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm">{r.materiais_catalogo.nome}</p>
                      <Badge className={cn("text-xs rounded-full", urgColor(r.urgencia))}>{r.urgencia}</Badge>
                      <Badge variant="outline" className={cn("text-xs rounded-full", statusColor(r.status))}>{r.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Quantidade: <strong>{fmtQtd(r.quantidade, r.materiais_catalogo.unidade)}</strong>
                      {r.data_necessidade && <> · Necessário até: <strong>{format(new Date(r.data_necessidade + "T12:00"), "dd/MM/yyyy")}</strong></>}
                    </p>
                    {r.justificativa && <p className="text-xs text-muted-foreground mt-1">{r.justificativa}</p>}
                    <p className="text-xs text-muted-foreground/60 mt-1">Solicitada em {format(new Date(r.data_solicitacao + "T12:00"), "dd/MM/yyyy", { locale: ptBR })}</p>
                  </div>
                  {r.status === "pendente" && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" className="gap-1 rounded-xl text-green-600 border-green-300 hover:bg-green-50" onClick={() => handleStatus(r.id, "aprovada")}>
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 rounded-xl text-red-600 border-red-300 hover:bg-red-50" onClick={() => handleStatus(r.id, "rejeitada")}>
                        <X className="h-3.5 w-3.5" /> Rejeitar
                      </Button>
                    </div>
                  )}
                  {r.status === "aprovada" && (
                    <Button size="sm" variant="outline" className="gap-1 rounded-xl text-blue-600 border-blue-300" onClick={() => handleStatus(r.id, "entregue")}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Marcar Entregue
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : <EmptyObra icon={ShoppingCart} msg="Selecione uma obra para ver as requisições de compra." />}

      <RequisicaoModal open={reqOpen} onClose={() => setReqOpen(false)} obraId={obraId} materiais={materiais} onSaved={fetchReqs} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Catálogo de Materiais
// ═══════════════════════════════════════════════════════════════
function CatalogoTab({ materiais, onRefresh }: { materiais: Material[]; onRefresh: () => void }) {
  const [search, setSearch]   = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);

  const filtered = materiais.filter(m =>
    !search || m.nome.toLowerCase().includes(search.toLowerCase()) || (m.categoria ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function openNew() { setEditing(null); setCatOpen(true); }
  function openEdit(m: Material) { setEditing(m); setCatOpen(true); }

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Catálogo de Materiais</CardTitle>
              <CardDescription>{materiais.length} materiais cadastrados</CardDescription>
            </div>
            <Button onClick={openNew} className="gap-2 rounded-xl"><Plus className="h-4 w-4" /> Novo Material</Button>
          </div>
          <div className="relative mt-3 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou categoria..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl h-9 text-sm" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhum material encontrado.</TableCell></TableRow>}
              {filtered.map(m => (
                <TableRow key={m.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{m.nome}</p>
                    {m.descricao && <p className="text-xs text-muted-foreground truncate max-w-48">{m.descricao}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.categoria ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs rounded-full">{m.unidade}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.codigo_interno ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs rounded-full", m.ativo ? "text-green-600 border-green-200" : "text-muted-foreground")}>
                      {m.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1.5 h-7 rounded-lg" onClick={() => openEdit(m)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MaterialModal open={catOpen} onClose={() => setCatOpen(false)} editing={editing} onSaved={onRefresh} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Nova Movimentação
// ═══════════════════════════════════════════════════════════════
function MovimentacaoModal({ open, onClose, obraId, materiais, preselMaterialId, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; materiais: Material[];
  preselMaterialId?: string; onSaved: () => void;
}) {
  const [tipo, setTipo]             = useState("entrada");
  const [materialId, setMaterialId] = useState("");
  const [qtd, setQtd]               = useState("");
  const [frente, setFrente]         = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [nf, setNf]                 = useState("");
  const [obs, setObs]               = useState("");
  const [dataMov, setDataMov]       = useState(today());
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (open) { setMaterialId(preselMaterialId ?? ""); setQtd(""); setFrente(""); setFornecedor(""); setNf(""); setObs(""); setTipo("entrada"); setDataMov(today()); }
  }, [open, preselMaterialId]);

  async function handleSave() {
    if (!materialId || !qtd || parseFloat(qtd) <= 0) { toast.error("Selecione o material e informe a quantidade"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("almoxarifado_movimentos").insert({
        obra_id: obraId, material_id: materialId, tipo,
        quantidade: parseFloat(qtd),
        frente: frente || null, fornecedor: fornecedor || null,
        nota_fiscal: nf || null, observacoes: obs || null,
        registrado_por: user?.id, data_movimento: dataMov,
      });
      if (error) throw new Error(error.message);
      toast.success("Movimentação registrada!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  const tipoAtual = TIPOS_MOV.find(t => t.value === tipo)!;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <tipoAtual.icon className={cn("h-5 w-5", tipoAtual.color)} /> Movimentação de Material
          </DialogTitle>
          <DialogDescription>Registre entrada, saída ou ajuste de inventário</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS_MOV.map(t => (
                <button key={t.value} onClick={() => setTipo(t.value)}
                  className={cn("rounded-xl border px-3 py-2 text-xs font-medium flex flex-col items-center gap-1 transition-colors",
                    tipo === t.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50"
                  )}>
                  <t.icon className="h-4 w-4" />{t.label.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Material <span className="text-red-500">*</span></Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione o material..." /></SelectTrigger>
              <SelectContent className="max-h-56">
                {materiais.filter(m => m.ativo).map(m => <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade <span className="text-red-500">*</span></Label>
              <Input type="number" min="0.001" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          {tipo === "entrada" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Fornecedor</Label><Input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Nome do fornecedor" className="rounded-xl" /></div>
              <div className="space-y-1.5"><Label>Nota Fiscal</Label><Input value={nf} onChange={e => setNf(e.target.value)} placeholder="NF-000" className="rounded-xl" /></div>
            </div>
          )}
          {tipo === "saida" && (
            <div className="space-y-1.5"><Label>Frente de Consumo</Label><Input value={frente} onChange={e => setFrente(e.target.value)} placeholder="Fundação, Estrutura..." className="rounded-xl" /></div>
          )}
          <div className="space-y-1.5"><Label>Observações</Label><Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="rounded-xl resize-none text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</> : <><tipoAtual.icon className="h-4 w-4" />Registrar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Nova Requisição de Compra
// ═══════════════════════════════════════════════════════════════
function RequisicaoModal({ open, onClose, obraId, materiais, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; materiais: Material[]; onSaved: () => void;
}) {
  const [materialId, setMaterialId]   = useState("");
  const [qtd, setQtd]                 = useState("");
  const [urgencia, setUrgencia]       = useState("normal");
  const [justificativa, setJustif]    = useState("");
  const [dataNec, setDataNec]         = useState("");
  const [saving, setSaving]           = useState(false);

  useEffect(() => { if (open) { setMaterialId(""); setQtd(""); setUrgencia("normal"); setJustif(""); setDataNec(""); } }, [open]);

  async function handleSave() {
    if (!materialId || !qtd || parseFloat(qtd) <= 0) { toast.error("Selecione o material e a quantidade"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("requisicoes_compra").insert({
        obra_id: obraId, material_id: materialId, quantidade: parseFloat(qtd),
        urgencia, justificativa: justificativa || null,
        data_necessidade: dataNec || null, solicitado_por: user?.id,
      });
      if (error) throw new Error(error.message);
      toast.success("Requisição enviada!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /> Nova Requisição de Compra</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Material <span className="text-red-500">*</span></Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent className="max-h-56">
                {materiais.filter(m => m.ativo).map(m => <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade <span className="text-red-500">*</span></Label>
              <Input type="number" min="0.001" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Urgência</Label>
              <Select value={urgencia} onValueChange={setUrgencia}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{URGENCIAS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Data necessária</Label><Input type="date" value={dataNec} onChange={e => setDataNec(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-1.5"><Label>Justificativa</Label><Textarea value={justificativa} onChange={e => setJustif(e.target.value)} rows={2} placeholder="Por que este material é necessário..." className="rounded-xl resize-none text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Enviando...</> : <><ShoppingCart className="h-4 w-4" />Enviar Requisição</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Cadastro / Edição de Material no Catálogo
// ═══════════════════════════════════════════════════════════════
function MaterialModal({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing: Material | null; onSaved: () => void }) {
  const [nome, setNome]           = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade]     = useState("un");
  const [categoria, setCategoria] = useState("");
  const [codigo, setCodigo]       = useState("");
  const [ativo, setAtivo]         = useState(true);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (open && editing) { setNome(editing.nome); setDescricao(editing.descricao ?? ""); setUnidade(editing.unidade); setCategoria(editing.categoria ?? ""); setCodigo(editing.codigo_interno ?? ""); setAtivo(editing.ativo); }
    else if (open) { setNome(""); setDescricao(""); setUnidade("un"); setCategoria(""); setCodigo(""); setAtivo(true); }
  }, [open, editing]);

  async function handleSave() {
    if (!nome.trim()) { toast.error("Informe o nome do material"); return; }
    setSaving(true);
    try {
      const payload = { nome: nome.trim(), descricao: descricao || null, unidade, categoria: categoria || null, codigo_interno: codigo || null, ativo };
      const { error } = editing
        ? await (supabase as any).from("materiais_catalogo").update(payload).eq("id", editing.id)
        : await (supabase as any).from("materiais_catalogo").insert(payload);
      if (error) throw new Error(error.message);
      toast.success(editing ? "Material atualizado!" : "Material cadastrado!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> {editing ? "Editar Material" : "Novo Material"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Nome <span className="text-red-500">*</span></Label><Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Cimento Portland CP-II" className="rounded-xl" /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className="rounded-xl resize-none text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={setUnidade}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Código interno</Label><Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="MAT-001" className="rounded-xl" /></div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
            <Label className="cursor-pointer">Material ativo</Label>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</> : <><Package className="h-4 w-4" />{editing ? "Salvar" : "Cadastrar"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Empty state helper ──────────────────────────────────────────────────────
function EmptyObra({ icon: Icon, msg }: { icon: React.ElementType; msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center py-16 text-center space-y-3">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{msg}</p>
    </div>
  );
}

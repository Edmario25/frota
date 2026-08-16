import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useObras } from "@/hooks/useObras";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Package, Plus, Pencil, RefreshCw, Search, Download,
  AlertTriangle, CheckCircle2, ArrowDownToLine, ArrowUpFromLine,
  ClipboardList, BookOpen, RotateCcw, TrendingDown, ShoppingCart,
  Check, X, Boxes, Building2, ArrowLeftRight, Truck, BarChart3,
  Clock, ShieldCheck, Ban, Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Material {
  id: string; nome: string; unidade: string;
  categoria: string | null; codigo_interno: string | null;
  ativo: boolean; descricao: string | null;
}
interface Estoque {
  id: string; obra_id: string; material_id: string;
  quantidade: number; quantidade_minima: number; localizacao: string | null;
  materiais_catalogo: Material; obras?: { nome: string };
}
interface Movimento {
  id: string; data_movimento: string; tipo: string; quantidade: number;
  preco_unitario: number | null; frente: string | null;
  fornecedor: string | null; nota_fiscal: string | null; observacoes: string | null;
  obra_destino_id: string | null;
  materiais_catalogo: { nome: string; unidade: string };
  obras_destino?: { nome: string } | null;
}
interface ReqItem {
  id?: string; material_id: string; quantidade: string; qtd_aprovada?: string; observacao?: string;
  _mat?: Material;
}
interface Requisicao {
  id: string; numero_req: string | null; material_id: string; quantidade: number;
  urgencia: string; status: string; justificativa: string | null;
  motivo_rejeicao: string | null; observacoes_aprovador: string | null;
  data_solicitacao: string; data_necessidade: string | null;
  materiais_catalogo: { nome: string; unidade: string };
  requisicao_itens?: Array<{ id: string; quantidade: number; qtd_aprovada: number | null; material_id: string; materiais_catalogo: { nome: string; unidade: string } }>;
}
interface Fornecedor {
  id: string; nome: string; cnpj: string | null; contato_nome: string | null;
  telefone: string | null; email: string | null; categorias: string[];
  observacoes: string | null; ativo: boolean;
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS = ["Cimento e Argamassa","Ferro e Aço","Madeira","Elétrico","Hidráulico",
  "Acabamento","Ferragens","Impermeabilização","EPI","Ferramentas","Outro"];
const UNIDADES   = ["un","kg","m","m²","m³","L","cx","sc","pc","t","rolo","par","jg"];
const URGENCIAS  = [
  { value: "normal",  label: "Normal",   cls: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "urgente", label: "Urgente",  cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "critico", label: "Crítico",  cls: "bg-red-100 text-red-700 border-red-200" },
];
const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pendente:  { label: "Pendente",  cls: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  aprovada:  { label: "Aprovada",  cls: "bg-green-100 text-green-700 border-green-200",   icon: Check },
  rejeitada: { label: "Rejeitada", cls: "bg-red-100 text-red-700 border-red-200",         icon: Ban },
  entregue:  { label: "Entregue",  cls: "bg-blue-100 text-blue-700 border-blue-200",      icon: CheckCircle2 },
};
const TIPOS_MOV = [
  { value: "entrada",        label: "Entrada",      icon: ArrowDownToLine,  color: "text-green-600" },
  { value: "saida",          label: "Saída",        icon: ArrowUpFromLine,  color: "text-red-600"   },
  { value: "transferencia",  label: "Transferência",icon: ArrowLeftRight,   color: "text-blue-600"  },
  { value: "ajuste",         label: "Ajuste",       icon: RotateCcw,        color: "text-purple-600"},
];
const CAN_APPROVE = ["admin","gestor_contrato","gestor_frota","gestor_obra"];

const today = () => format(new Date(), "yyyy-MM-dd");
const fmtDate = (d: string) => format(new Date(d + "T12:00"), "dd/MM/yyyy", { locale: ptBR });
const fmtQtd  = (q: number, u: string) => `${q % 1 === 0 ? q.toFixed(0) : q.toFixed(2)} ${u}`;
const moedaBR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function Almoxarifado() {
  const { role } = useUserRole();
  const { obras } = useObras();
  const [materiais,    setMateriais]   = useState<Material[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [obraId,       setObraId]      = useState("");
  const [tabPendentes, setTabPendentes] = useState(0);

  const canApprove = CAN_APPROVE.includes(role ?? "");

  const fetchMateriais = useCallback(async () => {
    const { data } = await (supabase as any).from("materiais_catalogo").select("*").order("nome");
    setMateriais((data ?? []) as Material[]);
  }, []);

  const fetchFornecedores = useCallback(async () => {
    const { data } = await (supabase as any).from("fornecedores").select("*").order("nome");
    setFornecedores((data ?? []) as Fornecedor[]);
  }, []);

  const fetchPendentes = useCallback(async () => {
    const { count } = await (supabase as any)
      .from("requisicoes_compra").select("id", { count: "exact", head: true })
      .eq("status", "pendente");
    setTabPendentes(count ?? 0);
  }, []);

  useEffect(() => { fetchMateriais(); fetchFornecedores(); fetchPendentes(); }, [fetchMateriais, fetchFornecedores, fetchPendentes]);

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-500" /> Almoxarifado
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Controle de materiais, estoque, requisições e fornecedores por obra
            </p>
          </div>
          {canApprove && tabPendentes > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-700">
                {tabPendentes} requisição{tabPendentes > 1 ? "ões" : ""} aguardando aprovação
              </span>
            </div>
          )}
        </div>

        <Tabs defaultValue={canApprove && tabPendentes > 0 ? "requisicoes" : "estoque"}>
          <TabsList className="h-10 flex-wrap">
            <TabsTrigger value="estoque"       className="gap-1.5 text-xs"><Package className="h-3.5 w-3.5" /> Estoque</TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1.5 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Movimentações</TabsTrigger>
            <TabsTrigger value="requisicoes"   className="gap-1.5 text-xs relative">
              <ShoppingCart className="h-3.5 w-3.5" /> Requisições
              {tabPendentes > 0 && (
                <span className="ml-1 h-4 min-w-4 px-1 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {tabPendentes}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="fornecedores"  className="gap-1.5 text-xs"><Truck className="h-3.5 w-3.5" /> Fornecedores</TabsTrigger>
            <TabsTrigger value="catalogo"      className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" /> Catálogo</TabsTrigger>
          </TabsList>

          <TabsContent value="estoque">
            <EstoqueTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} fornecedores={fornecedores} />
          </TabsContent>
          <TabsContent value="movimentacoes">
            <MovimentacoesTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} fornecedores={fornecedores} />
          </TabsContent>
          <TabsContent value="requisicoes">
            <RequisicoesTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} canApprove={canApprove} onPendentesChange={fetchPendentes} />
          </TabsContent>
          <TabsContent value="fornecedores">
            <FornecedoresTab fornecedores={fornecedores} onRefresh={fetchFornecedores} canEdit={canApprove} />
          </TabsContent>
          <TabsContent value="catalogo">
            <CatalogoTab materiais={materiais} onRefresh={fetchMateriais} canEdit={canApprove} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTOQUE
// ═══════════════════════════════════════════════════════════════════════════════
function EstoqueTab({ obras, obraId, setObraId, materiais, fornecedores }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
  materiais: Material[]; fornecedores: Fornecedor[];
}) {
  const [estoque, setEstoque]     = useState<Estoque[]>([]);
  const [loading, setLoading]     = useState(false);
  const [search,  setSearch]      = useState("");
  const [catFiltro, setCatFiltro] = useState("all");
  const [movOpen, setMovOpen]     = useState(false);
  const [selMat,  setSelMat]      = useState<Estoque | null>(null);

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

  const zerado  = estoque.filter(e => e.quantidade === 0).length;
  const alerta  = estoque.filter(e => e.quantidade > 0 && e.quantidade_minima > 0 && e.quantidade <= e.quantidade_minima).length;
  const ok      = estoque.length - zerado - alerta;
  const valorTotal = estoque.reduce((s, e) => s + e.quantidade, 0);

  const categorias = [...new Set(estoque.map(e => e.materiais_catalogo.categoria).filter(Boolean))];

  const filtered = estoque.filter(e => {
    const matchSearch = !search || e.materiais_catalogo.nome.toLowerCase().includes(search.toLowerCase()) ||
      (e.materiais_catalogo.codigo_interno ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCat = catFiltro === "all" || e.materiais_catalogo.categoria === catFiltro;
    return matchSearch && matchCat;
  });

  function exportCSV() {
    const obraNome = obras.find(o => o.id === obraId)?.nome ?? obraId;
    const rows = ["Material,Categoria,Unidade,Quantidade,Mínimo,Localização,Status"].concat(
      filtered.map(e => {
        const s = e.quantidade === 0 ? "Zerado" : e.quantidade <= e.quantidade_minima && e.quantidade_minima > 0 ? "Alerta" : "OK";
        return `"${e.materiais_catalogo.nome}","${e.materiais_catalogo.categoria ?? ""}","${e.materiais_catalogo.unidade}",${e.quantidade},${e.quantidade_minima},"${e.localizacao ?? ""}","${s}"`;
      })
    ).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8" }));
    a.download = `estoque_${obraNome}_${today()}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Filtro de obra */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
            <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {obraId && (
          <>
            <Button onClick={() => { setSelMat(null); setMovOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Movimentação
            </Button>
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchEstoque}><RefreshCw className="h-4 w-4" /></Button>
          </>
        )}
      </div>

      {!obraId && <EmptyState icon={Package} msg="Selecione uma obra para ver o estoque." />}

      {obraId && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Itens em estoque", value: estoque.length,  icon: Boxes,         cls: "bg-muted/50" },
              { label: "Zerados",          value: zerado,          icon: TrendingDown,  cls: zerado  > 0 ? "bg-red-50 border-red-200" : "bg-muted/50" },
              { label: "Abaixo do mínimo", value: alerta,          icon: AlertTriangle, cls: alerta  > 0 ? "bg-amber-50 border-amber-200" : "bg-muted/50" },
              { label: "Regulares",        value: ok,              icon: CheckCircle2,  cls: "bg-green-50 border-green-200" },
            ].map(s => (
              <div key={s.label} className={cn("rounded-xl border p-4 flex items-center gap-3", s.cls)}>
                <s.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-2xl font-extrabold leading-none">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros da tabela */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <Select value={catFiltro} onValueChange={setCatFiltro}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categorias.map(c => <SelectItem key={c!} value={c!}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tabela */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Material</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    {estoque.length === 0 ? "Nenhum material no estoque. Registre a primeira entrada." : "Nenhum resultado para os filtros aplicados."}
                  </TableCell></TableRow>
                )}
                {!loading && filtered.map(e => {
                  const isZerado = e.quantidade === 0;
                  const isAlerta = !isZerado && e.quantidade_minima > 0 && e.quantidade <= e.quantidade_minima;
                  return (
                    <TableRow key={e.id} className={cn("hover:bg-muted/30", isZerado ? "bg-red-50/40" : isAlerta ? "bg-amber-50/40" : "")}>
                      <TableCell>
                        <p className="font-medium text-sm">{e.materiais_catalogo.nome}</p>
                        {e.materiais_catalogo.codigo_interno && <p className="text-xs text-muted-foreground font-mono">{e.materiais_catalogo.codigo_interno}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{e.materiais_catalogo.categoria ?? "—"}</TableCell>
                      <TableCell className={cn("text-right font-bold text-sm tabular-nums", isZerado ? "text-red-600" : isAlerta ? "text-amber-600" : "text-foreground")}>
                        {fmtQtd(e.quantidade, e.materiais_catalogo.unidade)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {e.quantidade_minima > 0 ? fmtQtd(e.quantidade_minima, e.materiais_catalogo.unidade) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.localizacao ?? "—"}</TableCell>
                      <TableCell>
                        {isZerado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            <TrendingDown className="h-3 w-3" /> Zerado
                          </span>
                        ) : isAlerta ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                            <AlertTriangle className="h-3 w-3" /> Alerta
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => { setSelMat(e); setMovOpen(true); }}>
                          <Plus className="h-3 w-3" /> Mov.
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <MovimentacaoModal open={movOpen} onClose={() => setMovOpen(false)} obraId={obraId} obras={obras} materiais={materiais} fornecedores={fornecedores} preselMaterialId={selMat?.material_id} onSaved={fetchEstoque} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVIMENTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
function MovimentacoesTab({ obras, obraId, setObraId, materiais, fornecedores }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
  materiais: Material[]; fornecedores: Fornecedor[];
}) {
  const [movs,    setMovs]    = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [movOpen, setMovOpen] = useState(false);
  const [dataIni, setDataIni] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(today());
  const [filtroTipo, setFiltroTipo] = useState("all");
  const [search, setSearch]   = useState("");

  const fetchMovs = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("almoxarifado_movimentos")
      .select("*, materiais_catalogo(nome, unidade), obras_destino:obra_destino_id(nome)")
      .eq("obra_id", obraId)
      .gte("data_movimento", dataIni)
      .lte("data_movimento", dataFim)
      .order("created_at", { ascending: false });
    setMovs((data ?? []) as Movimento[]);
    setLoading(false);
  }, [obraId, dataIni, dataFim]);

  useEffect(() => { fetchMovs(); }, [fetchMovs]);

  const totalEntradas = movs.filter(m => m.tipo === "entrada").reduce((s, m) => s + m.quantidade, 0);
  const totalSaidas   = movs.filter(m => m.tipo === "saida").reduce((s, m) => s + m.quantidade, 0);

  const filtered = movs.filter(m => {
    const matchTipo   = filtroTipo === "all" || m.tipo === filtroTipo;
    const matchSearch = !search || m.materiais_catalogo.nome.toLowerCase().includes(search.toLowerCase());
    return matchTipo && matchSearch;
  });

  return (
    <div className="space-y-4 mt-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>De</Label><Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="w-36" /></div>
        <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" /></div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TIPOS_MOV.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setMovOpen(true)} disabled={!obraId} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Movimentação
        </Button>
        <Button variant="ghost" size="icon" onClick={fetchMovs}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {!obraId && <EmptyState icon={ClipboardList} msg="Selecione uma obra para ver as movimentações." />}

      {obraId && (
        <>
          {/* Mini KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-lg font-extrabold text-green-600">{movs.filter(m => m.tipo === "entrada").length}</p>
              <p className="text-xs text-muted-foreground">Entradas no período</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-lg font-extrabold text-red-600">{movs.filter(m => m.tipo === "saida").length}</p>
              <p className="text-xs text-muted-foreground">Saídas no período</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-lg font-extrabold">{movs.length}</p>
              <p className="text-xs text-muted-foreground">Total de registros</p>
            </div>
          </div>

          {/* Busca */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Frente / Destino</TableHead>
                  <TableHead>Fornecedor / NF</TableHead>
                  <TableHead className="text-right">Valor Unit.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Nenhuma movimentação no período.</TableCell></TableRow>
                )}
                {!loading && filtered.map(m => {
                  const ti = TIPOS_MOV.find(t => t.value === m.tipo)!;
                  const isEntrada = m.tipo === "entrada";
                  const isSaida   = m.tipo === "saida";
                  return (
                    <TableRow key={m.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm tabular-nums whitespace-nowrap">{fmtDate(m.data_movimento)}</TableCell>
                      <TableCell>
                        <span className={cn("flex items-center gap-1 text-xs font-semibold", ti.color)}>
                          <ti.icon className="h-3.5 w-3.5" />{ti.label}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{m.materiais_catalogo.nome}</TableCell>
                      <TableCell className={cn("text-right font-bold text-sm tabular-nums",
                        isEntrada ? "text-green-600" : isSaida ? "text-red-600" : "text-blue-600")}>
                        {isEntrada ? "+" : isSaida ? "−" : "↔"}{fmtQtd(m.quantidade, m.materiais_catalogo.unidade)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.frente ?? (m.obras_destino?.nome ? `→ ${m.obras_destino.nome}` : "—")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.fornecedor && <span>{m.fornecedor}</span>}
                        {m.fornecedor && m.nota_fiscal && " · "}
                        {m.nota_fiscal && <span className="font-mono text-xs">NF {m.nota_fiscal}</span>}
                        {!m.fornecedor && !m.nota_fiscal && "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {m.preco_unitario ? moedaBR(m.preco_unitario) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <MovimentacaoModal open={movOpen} onClose={() => setMovOpen(false)} obraId={obraId} obras={obras} materiais={materiais} fornecedores={fornecedores} onSaved={fetchMovs} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUISIÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
function RequisicoesTab({ obras, obraId, setObraId, materiais, canApprove, onPendentesChange }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
  materiais: Material[]; canApprove: boolean; onPendentesChange: () => void;
}) {
  const [reqs,         setReqs]         = useState<Requisicao[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [reqOpen,      setReqOpen]      = useState(false);
  const [rejDialog,    setRejDialog]    = useState<Requisicao | null>(null);
  const [motivoRej,    setMotivoRej]    = useState("");
  const [saving,       setSaving]       = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("pendente");

  const fetchReqs = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("requisicoes_compra")
      .select("*, materiais_catalogo(nome, unidade), requisicao_itens(id, quantidade, qtd_aprovada, material_id, materiais_catalogo(nome, unidade))")
    if (obraId) q = q.eq("obra_id", obraId);
    if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
    const { data } = await q.order("created_at", { ascending: false }).limit(100);
    setReqs((data ?? []) as Requisicao[]);
    setLoading(false);
  }, [obraId, filtroStatus]);

  useEffect(() => { fetchReqs(); }, [fetchReqs]);

  async function handleAprovar(req: Requisicao) {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("requisicoes_compra")
        .update({ status: "aprovada", aprovado_por: user?.id, motivo_rejeicao: null })
        .eq("id", req.id);
      if (error) throw error;
      toast.success(`✅ Requisição ${req.numero_req ?? ""} aprovada!`);
      fetchReqs(); onPendentesChange();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleRejeitar() {
    if (!rejDialog) return;
    if (!motivoRej.trim()) { toast.error("Informe o motivo da rejeição"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("requisicoes_compra")
        .update({ status: "rejeitada", aprovado_por: user?.id, motivo_rejeicao: motivoRej.trim() })
        .eq("id", rejDialog.id);
      if (error) throw error;
      toast.success("Requisição rejeitada.");
      setRejDialog(null); setMotivoRej("");
      fetchReqs(); onPendentesChange();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleEntregue(req: Requisicao) {
    setSaving(true);
    try {
      await (supabase as any).from("requisicoes_compra").update({ status: "entregue" }).eq("id", req.id);
      toast.success("Marcado como entregue!");
      fetchReqs(); onPendentesChange();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  const counts = {
    pendente:  reqs.filter(r => r.status === "pendente").length,
    aprovada:  reqs.filter(r => r.status === "aprovada").length,
    rejeitada: reqs.filter(r => r.status === "rejeitada").length,
    entregue:  reqs.filter(r => r.status === "entregue").length,
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId || "all"} onValueChange={v => setObraId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas as obras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setReqOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Requisição
        </Button>
        <Button variant="ghost" size="icon" onClick={fetchReqs}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 flex-wrap">
        {([["todos","Todos","bg-muted text-muted-foreground"],
           ["pendente","Pendentes","bg-amber-100 text-amber-700 border border-amber-200"],
           ["aprovada","Aprovadas","bg-green-100 text-green-700 border border-green-200"],
           ["rejeitada","Rejeitadas","bg-red-100 text-red-700 border border-red-200"],
           ["entregue","Entregues","bg-blue-100 text-blue-700 border border-blue-200"],
        ] as const).map(([val, label, cls]) => (
          <button key={val} onClick={() => setFiltroStatus(val)}
            className={cn("px-3 py-1 rounded-full text-xs font-semibold transition-all border border-transparent",
              filtroStatus === val ? cls + " ring-2 ring-offset-1 ring-current" : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}>
            {label}
            {val !== "todos" && counts[val as keyof typeof counts] > 0 && (
              <span className="ml-1.5 font-mono">{counts[val as keyof typeof counts]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Banner de permissão para não-gestores */}
      {!canApprove && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <ShieldCheck className="h-4 w-4 flex-shrink-0" />
          <span>Apenas <strong>Gestores de Obra</strong> podem aprovar ou rejeitar requisições.</span>
        </div>
      )}

      {/* Lista */}
      {loading && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>}

      {!loading && reqs.length === 0 && (
        <EmptyState icon={ShoppingCart} msg={`Nenhuma requisição ${filtroStatus !== "todos" ? `"${filtroStatus}"` : ""} encontrada.`} />
      )}

      <div className="space-y-3">
        {!loading && reqs.map(r => {
          const urg = URGENCIAS.find(u => u.value === r.urgencia);
          const sts = STATUS_CFG[r.status] ?? STATUS_CFG.pendente;
          const StsIcon = sts.icon;

          // Itens: multi-item ou item único da requisição
          const itens = r.requisicao_itens && r.requisicao_itens.length > 0
            ? r.requisicao_itens
            : [{ id: r.id, material_id: r.material_id, quantidade: r.quantidade, qtd_aprovada: null, materiais_catalogo: r.materiais_catalogo }];

          return (
            <div key={r.id} className={cn("rounded-xl border bg-card p-4 shadow-sm",
              r.status === "pendente" && canApprove ? "border-amber-200 shadow-amber-100/50" : "")}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  {/* Cabeçalho */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {r.numero_req && (
                      <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {r.numero_req}
                      </span>
                    )}
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", sts.cls)}>
                      <StsIcon className="h-3 w-3" /> {sts.label}
                    </span>
                    {urg && (
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", urg.cls)}>
                        {urg.label}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {fmtDate(r.data_solicitacao)}
                      {r.data_necessidade && <> · necessário até <strong>{fmtDate(r.data_necessidade)}</strong></>}
                    </span>
                  </div>

                  {/* Itens */}
                  <div className="space-y-1 mb-2">
                    {itens.map((it, idx) => (
                      <div key={it.id ?? idx} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground text-xs w-4 text-right">{idx + 1}.</span>
                        <span className="font-medium">{it.materiais_catalogo?.nome ?? "—"}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="tabular-nums">{fmtQtd(it.quantidade, it.materiais_catalogo?.unidade ?? "un")}</span>
                        {it.qtd_aprovada != null && it.qtd_aprovada !== it.quantidade && (
                          <span className="text-xs text-amber-600">(aprovado: {fmtQtd(it.qtd_aprovada, it.materiais_catalogo?.unidade ?? "un")})</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {r.justificativa && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{r.justificativa}</p>
                  )}
                  {r.motivo_rejeicao && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                      <Ban className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span><strong>Motivo da rejeição:</strong> {r.motivo_rejeicao}</span>
                    </div>
                  )}
                  {r.observacoes_aprovador && !r.motivo_rejeicao && (
                    <p className="text-xs text-muted-foreground mt-1">Obs. do aprovador: {r.observacoes_aprovador}</p>
                  )}
                </div>

                {/* Ações */}
                {canApprove && r.status === "pendente" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" className="gap-1 bg-green-700 hover:bg-green-800 text-white h-8"
                      onClick={() => handleAprovar(r)} disabled={saving}>
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 h-8"
                      onClick={() => { setRejDialog(r); setMotivoRej(""); }} disabled={saving}>
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </Button>
                  </div>
                )}
                {r.status === "aprovada" && (
                  <Button size="sm" variant="outline" className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 h-8"
                    onClick={() => handleEntregue(r)} disabled={saving}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Marcar entregue
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Rejeição */}
      <Dialog open={!!rejDialog} onOpenChange={v => !v && setRejDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" /> Rejeitar Requisição
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {rejDialog?.numero_req && (
              <p className="text-sm text-muted-foreground">Requisição <strong>{rejDialog.numero_req}</strong></p>
            )}
            <div className="space-y-1.5">
              <Label>Motivo da rejeição <span className="text-red-500">*</span></Label>
              <Textarea
                rows={3}
                placeholder="Informe o motivo para o solicitante..."
                value={motivoRej}
                onChange={e => setMotivoRej(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejDialog(null)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRejeitar} disabled={saving || !motivoRej.trim()} className="gap-1">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova Requisição */}
      <RequisicaoModal open={reqOpen} onClose={() => setReqOpen(false)} obraId={obraId} obras={obras} materiais={materiais} onSaved={() => { fetchReqs(); onPendentesChange(); }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORNECEDORES
// ═══════════════════════════════════════════════════════════════════════════════
function FornecedoresTab({ fornecedores, onRefresh, canEdit }: {
  fornecedores: Fornecedor[]; onRefresh: () => void; canEdit: boolean;
}) {
  const [search,    setSearch]   = useState("");
  const [open,      setOpen]     = useState(false);
  const [editing,   setEditing]  = useState<Fornecedor | null>(null);
  const [form,      setForm]     = useState({ nome: "", cnpj: "", contato_nome: "", telefone: "", email: "", categorias: "", observacoes: "", ativo: true });
  const [saving,    setSaving]   = useState(false);

  function openNew()  { setEditing(null); setForm({ nome:"",cnpj:"",contato_nome:"",telefone:"",email:"",categorias:"",observacoes:"",ativo:true }); setOpen(true); }
  function openEdit(f: Fornecedor) {
    setEditing(f);
    setForm({ nome:f.nome, cnpj:f.cnpj??"", contato_nome:f.contato_nome??"", telefone:f.telefone??"", email:f.email??"", categorias:(f.categorias??[]).join(", "), observacoes:f.observacoes??"", ativo:f.ativo });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error("Informe o nome do fornecedor"); return; }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(), cnpj: form.cnpj || null,
      contato_nome: form.contato_nome || null, telefone: form.telefone || null,
      email: form.email || null,
      categorias: form.categorias ? form.categorias.split(",").map(c => c.trim()).filter(Boolean) : [],
      observacoes: form.observacoes || null, ativo: form.ativo,
    };
    const { error } = editing
      ? await (supabase as any).from("fornecedores").update(payload).eq("id", editing.id)
      : await (supabase as any).from("fornecedores").insert([payload]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Fornecedor atualizado!" : "Fornecedor cadastrado!");
    setOpen(false); onRefresh();
  }

  const filtered = fornecedores.filter(f =>
    !search || f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.cnpj ?? "").includes(search) || (f.contato_nome ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        {canEdit && <Button onClick={openNew} className="gap-2 ml-auto"><Plus className="h-4 w-4" /> Novo Fornecedor</Button>}
        <Button variant="ghost" size="icon" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Truck} msg={fornecedores.length === 0 ? "Nenhum fornecedor cadastrado ainda." : "Nenhum resultado para a busca."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(f => (
            <div key={f.id} className={cn("rounded-xl border bg-card p-4 space-y-2", !f.ativo && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{f.nome}</p>
                  {f.cnpj && <p className="text-xs font-mono text-muted-foreground">{f.cnpj}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    f.ativo ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                    {f.ativo ? "Ativo" : "Inativo"}
                  </span>
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {f.contato_nome && <p className="text-xs text-muted-foreground">👤 {f.contato_nome}</p>}
              {f.telefone     && <p className="text-xs text-muted-foreground">📞 {f.telefone}</p>}
              {f.email        && <p className="text-xs text-muted-foreground truncate">✉️ {f.email}</p>}
              {f.categorias?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {f.categorias.map(c => (
                    <span key={c} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-slate-500" /> {editing ? "Editar Fornecedor" : "Novo Fornecedor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input placeholder="Razão social ou nome fantasia" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>CNPJ</Label><Input placeholder="00.000.000/0001-00" value={form.cnpj} onChange={e => setForm(f => ({...f, cnpj: e.target.value}))} /></div>
              <div className="space-y-1.5"><Label>Contato</Label><Input placeholder="Nome do contato" value={form.contato_nome} onChange={e => setForm(f => ({...f, contato_nome: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Telefone</Label><Input placeholder="(00) 00000-0000" value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} /></div>
              <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" placeholder="contato@..." value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Categorias fornecidas <span className="text-xs text-muted-foreground">(separadas por vírgula)</span></Label>
              <Input placeholder="Cimento, Ferro, Hidráulico..." value={form.categorias} onChange={e => setForm(f => ({...f, categorias: e.target.value}))} />
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} /></div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
              <Label className="cursor-pointer">Fornecedor ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({...f, ativo: v}))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════════
function CatalogoTab({ materiais, onRefresh, canEdit }: { materiais: Material[]; onRefresh: () => void; canEdit: boolean }) {
  const [search,    setSearch]  = useState("");
  const [catFiltro, setCat]     = useState("all");
  const [open,      setOpen]    = useState(false);
  const [editing,   setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState({ nome:"", descricao:"", unidade:"un", categoria:"", codigo:"", ativo:true });
  const [saving, setSaving] = useState(false);

  function openNew()  { setEditing(null); setForm({nome:"",descricao:"",unidade:"un",categoria:"",codigo:"",ativo:true}); setOpen(true); }
  function openEdit(m: Material) {
    setEditing(m);
    setForm({nome:m.nome,descricao:m.descricao??"",unidade:m.unidade,categoria:m.categoria??"",codigo:m.codigo_interno??"",ativo:m.ativo});
    setOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error("Informe o nome do material"); return; }
    setSaving(true);
    const payload = { nome:form.nome.trim(), descricao:form.descricao||null, unidade:form.unidade, categoria:form.categoria||null, codigo_interno:form.codigo||null, ativo:form.ativo };
    const { error } = editing
      ? await (supabase as any).from("materiais_catalogo").update(payload).eq("id", editing.id)
      : await (supabase as any).from("materiais_catalogo").insert([payload]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Material atualizado!" : "Material cadastrado!");
    setOpen(false); onRefresh();
  }

  const cats = [...new Set(materiais.map(m => m.categoria).filter(Boolean))];
  const filtered = materiais.filter(m => {
    const ms = !search || m.nome.toLowerCase().includes(search.toLowerCase()) || (m.categoria ?? "").toLowerCase().includes(search.toLowerCase()) || (m.codigo_interno ?? "").toLowerCase().includes(search.toLowerCase());
    const mc = catFiltro === "all" || m.categoria === catFiltro;
    return ms && mc;
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={catFiltro} onValueChange={setCat}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {cats.map(c => <SelectItem key={c!} value={c!}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} de {materiais.length}</span>
        {canEdit && <Button onClick={openNew} className="gap-2 ml-auto"><Plus className="h-4 w-4" /> Novo Material</Button>}
        <Button variant="ghost" size="icon" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Material</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                {materiais.length === 0 ? "Nenhum material cadastrado." : "Sem resultados para os filtros."}
              </TableCell></TableRow>
            )}
            {filtered.map(m => (
              <TableRow key={m.id} className={cn("hover:bg-muted/30", !m.ativo && "opacity-50")}>
                <TableCell>
                  <p className="font-medium text-sm">{m.nome}</p>
                  {m.descricao && <p className="text-xs text-muted-foreground truncate max-w-56">{m.descricao}</p>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground capitalize">{m.categoria ?? "—"}</TableCell>
                <TableCell><span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{m.unidade}</span></TableCell>
                <TableCell className="text-sm font-mono text-muted-foreground">{m.codigo_interno ?? "—"}</TableCell>
                <TableCell>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                    m.ativo ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                    {m.ativo ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(m)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-500" /> {editing ? "Editar Material" : "Novo Material"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5"><Label>Nome <span className="text-red-500">*</span></Label><Input value={form.nome} onChange={e => setForm(f=>({...f,nome:e.target.value}))} placeholder="Ex: Cimento Portland CP-II" /></div>
            <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={e => setForm(f=>({...f,descricao:e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select value={form.unidade} onValueChange={v => setForm(f=>({...f,unidade:v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIDADES.map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={v => setForm(f=>({...f,categoria:v}))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Código interno</Label><Input value={form.codigo} onChange={e => setForm(f=>({...f,codigo:e.target.value}))} placeholder="MAT-001" /></div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
              <Label className="cursor-pointer">Material ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={v => setForm(f=>({...f,ativo:v}))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: MOVIMENTAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
function MovimentacaoModal({ open, onClose, obraId, obras, materiais, fornecedores, preselMaterialId, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; obras: any[];
  materiais: Material[]; fornecedores: Fornecedor[];
  preselMaterialId?: string; onSaved: () => void;
}) {
  const [tipo,        setTipo]       = useState("entrada");
  const [materialId,  setMaterialId] = useState("");
  const [qtd,         setQtd]        = useState("");
  const [preco,       setPreco]      = useState("");
  const [frente,      setFrente]     = useState("");
  const [fornId,      setFornId]     = useState("");
  const [nf,          setNf]         = useState("");
  const [obs,         setObs]        = useState("");
  const [dataMov,     setDataMov]    = useState(today());
  const [obraDestino, setObraDestino] = useState("");
  const [saving,      setSaving]     = useState(false);

  useEffect(() => {
    if (open) { setMaterialId(preselMaterialId ?? ""); setQtd(""); setPreco(""); setFrente(""); setFornId(""); setNf(""); setObs(""); setTipo("entrada"); setDataMov(today()); setObraDestino(""); }
  }, [open, preselMaterialId]);

  async function handleSave() {
    if (!obraId)    { toast.error("Selecione uma obra"); return; }
    if (!materialId){ toast.error("Selecione o material"); return; }
    if (!qtd || parseFloat(qtd) <= 0) { toast.error("Informe a quantidade"); return; }
    if (tipo === "transferencia" && !obraDestino) { toast.error("Selecione a obra de destino"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        obra_id: obraId, material_id: materialId, tipo,
        quantidade: parseFloat(qtd),
        preco_unitario: preco ? parseFloat(preco) : null,
        frente: frente || null,
        fornecedor_id: fornId || null,
        fornecedor: fornecedores.find(f => f.id === fornId)?.nome || null,
        nota_fiscal: nf || null,
        observacoes: obs || null,
        registrado_por: user?.id,
        data_movimento: dataMov,
        obra_destino_id: tipo === "transferencia" ? obraDestino : null,
      };
      const { error } = await (supabase as any).from("almoxarifado_movimentos").insert(payload);
      if (error) throw new Error(error.message);

      // Se transferência, soma no destino
      if (tipo === "transferencia" && obraDestino) {
        await (supabase as any).from("almoxarifado_movimentos").insert({
          ...payload, obra_id: obraDestino, tipo: "entrada",
          observacoes: `Transferência recebida de ${obras.find(o=>o.id===obraId)?.nome ?? obraId}`,
          obra_destino_id: null,
        });
      }

      toast.success("Movimentação registrada!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  const tipoAtual = TIPOS_MOV.find(t => t.value === tipo)!;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <tipoAtual.icon className={cn("h-5 w-5", tipoAtual.color)} /> Movimentação de Material
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Tipo */}
          <div className="grid grid-cols-4 gap-2">
            {TIPOS_MOV.map(t => (
              <button key={t.value} onClick={() => setTipo(t.value)}
                className={cn("rounded-lg border px-2 py-2.5 text-xs font-semibold flex flex-col items-center gap-1 transition-colors",
                  tipo === t.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50 text-muted-foreground"
                )}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Material <span className="text-red-500">*</span></Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger><SelectValue placeholder="Selecione o material..." /></SelectTrigger>
              <SelectContent className="max-h-56">
                {materiais.filter(m => m.ativo).map(m => <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade <span className="text-red-500">*</span></Label>
              <Input type="number" min="0.001" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />
            </div>
          </div>

          {tipo === "transferencia" && (
            <div className="space-y-1.5">
              <Label>Obra de destino <span className="text-red-500">*</span></Label>
              <Select value={obraDestino} onValueChange={setObraDestino}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{obras.filter(o => o.id !== obraId).map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {tipo === "entrada" && (
            <>
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={fornId} onValueChange={setFornId}>
                  <SelectTrigger><SelectValue placeholder="Selecione ou deixe em branco..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem fornecedor</SelectItem>
                    {fornecedores.filter(f => f.ativo).map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nota Fiscal</Label><Input value={nf} onChange={e => setNf(e.target.value)} placeholder="NF-000" /></div>
                <div className="space-y-1.5"><Label>Preço unitário (R$)</Label><Input type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} placeholder="0,00" /></div>
              </div>
            </>
          )}

          {tipo === "saida" && (
            <div className="space-y-1.5">
              <Label>Frente de consumo</Label>
              <Input value={frente} onChange={e => setFrente(e.target.value)} placeholder="Fundação, Estrutura, Acabamento..." />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="resize-none text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <tipoAtual.icon className="h-4 w-4" />}
            {saving ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: REQUISIÇÃO MULTI-ITENS
// ═══════════════════════════════════════════════════════════════════════════════
function RequisicaoModal({ open, onClose, obraId, obras, materiais, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; obras: any[];
  materiais: Material[]; onSaved: () => void;
}) {
  const [obraLocal,    setObraLocal]  = useState(obraId);
  const [urgencia,     setUrgencia]   = useState("normal");
  const [justificativa,setJust]       = useState("");
  const [dataNec,      setDataNec]    = useState("");
  const [itens,        setItens]      = useState<ReqItem[]>([{ material_id: "", quantidade: "1" }]);
  const [saving,       setSaving]     = useState(false);

  useEffect(() => {
    if (open) { setObraLocal(obraId); setUrgencia("normal"); setJust(""); setDataNec(""); setItens([{ material_id: "", quantidade: "1" }]); }
  }, [open, obraId]);

  function addItem()    { setItens(prev => [...prev, { material_id: "", quantidade: "1" }]); }
  function removeItem(i: number) { setItens(prev => prev.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof ReqItem, val: string) {
    setItens(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  async function handleSave() {
    const obraFinal = obraLocal || obraId;
    if (!obraFinal)      { toast.error("Selecione a obra"); return; }
    const itensValidos = itens.filter(it => it.material_id && parseFloat(it.quantidade) > 0);
    if (itensValidos.length === 0) { toast.error("Adicione pelo menos um item com material e quantidade"); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Usa o primeiro item no campo legado (backward compat) e cria requisicao_itens para todos
      const primeiroItem = itensValidos[0];
      const { data: req, error: reqErr } = await (supabase as any)
        .from("requisicoes_compra")
        .insert({
          obra_id:          obraFinal,
          material_id:      primeiroItem.material_id,
          quantidade:       parseFloat(primeiroItem.quantidade),
          urgencia, justificativa: justificativa || null,
          data_necessidade: dataNec || null,
          solicitado_por:   user?.id,
        })
        .select("id")
        .single();
      if (reqErr) throw new Error(reqErr.message);

      // Insere todos os itens na tabela de itens
      const itensPayload = itensValidos.map(it => ({
        requisicao_id: req.id,
        material_id:   it.material_id,
        quantidade:    parseFloat(it.quantidade),
        observacao:    it.observacao || null,
      }));
      await (supabase as any).from("requisicao_itens").insert(itensPayload);

      toast.success(`✅ Requisição enviada com ${itensValidos.length} item(s)!`);
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Nova Requisição de Material
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Obra <span className="text-red-500">*</span></Label>
              <Select value={obraLocal} onValueChange={setObraLocal}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Urgência</Label>
              <Select value={urgencia} onValueChange={setUrgencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{URGENCIAS.map(u=><SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Data necessária</Label>
            <Input type="date" value={dataNec} onChange={e => setDataNec(e.target.value)} />
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Materiais solicitados <span className="text-red-500">*</span></Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={addItem}>
                <Plus className="h-3 w-3" /> Adicionar item
              </Button>
            </div>
            {itens.map((it, i) => (
              <div key={i} className="flex gap-2 items-end bg-muted/30 rounded-lg p-2">
                <div className="flex-1 space-y-1">
                  <Select value={it.material_id} onValueChange={v => updateItem(i, "material_id", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Material..." /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {materiais.filter(m => m.ativo).map(m => <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Input type="number" min="0.001" step="any" className="h-8 text-sm text-center"
                    value={it.quantidade} onChange={e => updateItem(i, "quantidade", e.target.value)} placeholder="Qtd." />
                </div>
                {itens.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600 flex-shrink-0"
                    onClick={() => removeItem(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Justificativa</Label>
            <Textarea rows={2} placeholder="Por que este(s) material(is) é(são) necessário(s)?" value={justificativa} onChange={e => setJust(e.target.value)} className="resize-none text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            {saving ? "Enviando..." : `Enviar Requisição${itens.filter(it => it.material_id).length > 1 ? ` (${itens.filter(it => it.material_id).length} itens)` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, msg }: { icon: React.ElementType; msg: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center py-14 text-center gap-3">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{msg}</p>
    </div>
  );
}

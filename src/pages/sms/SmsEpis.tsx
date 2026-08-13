import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Package, Plus, Search, RefreshCw, AlertTriangle, CheckCircle2,
  ArrowRightLeft, Archive, BookMarked, Pencil, ToggleLeft, ToggleRight,
} from "lucide-react";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";
import { Switch } from "@/components/ui/switch";

// ─── Types ──────────────────────────────────────────────────────────────────
interface EpiCatalogo {
  id: string;
  nome: string;
  descricao: string | null;
  ca_numero: string | null;
  ca_vencimento: string | null;
  categoria: string | null;
  ativo: boolean;
}

interface EpiEstoque {
  id: string;
  epi_id: string;
  obra_id: string;
  quantidade: number;
  quantidade_minima: number;
  obras: { nome: string } | null;
  sms_epis_catalogo: { nome: string; categoria: string | null } | null;
}

interface ColabEpi {
  id: string;
  colaborador_id: string;
  epi_id: string;
  obra_id: string | null;
  data_entrega: string;
  data_devolucao: string | null;
  quantidade: number;
  condicao: string | null;
  observacoes: string | null;
  employees: { nome: string } | null;
  sms_epis_catalogo: { nome: string } | null;
  obras: { nome: string } | null;
}

interface EntregaForm {
  colaborador_id: string;
  epi_id: string;
  obra_id: string;
  data_entrega: string;
  quantidade: string;
  condicao: string;
  observacoes: string;
}

interface CatForm {
  nome: string;
  descricao: string;
  ca_numero: string;
  ca_vencimento: string;
  categoria: string;
  ativo: boolean;
}

const EPI_CATEGORIAS = [
  "Proteção da Cabeça",
  "Proteção dos Olhos e Face",
  "Proteção Auditiva",
  "Proteção Respiratória",
  "Proteção das Mãos",
  "Proteção dos Pés e Pernas",
  "Proteção do Tronco",
  "Proteção contra Quedas",
  "Proteção do Corpo Inteiro",
  "Sinalização",
];

const entregaDefault: EntregaForm = {
  colaborador_id: "",
  epi_id: "",
  obra_id: "",
  data_entrega: new Date().toISOString().split("T")[0],
  quantidade: "1",
  condicao: "novo",
  observacoes: "",
};

const catDefault: CatForm = {
  nome: "",
  descricao: "",
  ca_numero: "",
  ca_vencimento: "",
  categoria: "",
  ativo: true,
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsEpis() {
  const { toast } = useToast();
  const { obras } = useObras();
  const { employees } = useEmployees();

  const [catalogo, setCatalogo] = useState<EpiCatalogo[]>([]);
  const [estoque, setEstoque] = useState<EpiEstoque[]>([]);
  const [entregas, setEntregas] = useState<ColabEpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState("estoque");
  const [search, setSearch] = useState("");
  const [filtroObra, setFiltroObra] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EntregaForm>(entregaDefault);

  // ─── Catálogo CRUD ───────────────────────────────────────────────────────
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [catForm, setCatForm] = useState<CatForm>(catDefault);

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const estoqueAbaixoMin = estoque.filter(e => e.quantidade <= e.quantidade_minima).length;
  const entregasAtivas   = entregas.filter(e => !e.data_devolucao).length;

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [
      { data: cat },
      { data: est },
      { data: ent },
    ] = await Promise.all([
      (supabase as any)
        .from("sms_epis_catalogo")
        .select("id, nome, descricao, ca_numero, ca_vencimento, categoria, ativo")
        .order("nome"),
      (supabase as any)
        .from("sms_epis_estoque")
        .select("id, epi_id, obra_id, quantidade, quantidade_minima, obras(nome), sms_epis_catalogo(nome, categoria)")
        .order("obras(nome)"),
      (supabase as any)
        .from("sms_colaborador_epis")
        .select("id, colaborador_id, epi_id, obra_id, data_entrega, data_devolucao, quantidade, condicao, observacoes, employees(nome), sms_epis_catalogo(nome), obras(nome)")
        .order("data_entrega", { ascending: false })
        .limit(300),
    ]);
    setCatalogo((cat ?? []) as EpiCatalogo[]);
    setEstoque((est ?? []) as EpiEstoque[]);
    setEntregas((ent ?? []) as ColabEpi[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Registrar entrega ────────────────────────────────────────────────────
  async function handleSaveEntrega() {
    if (!form.colaborador_id || !form.epi_id || !form.data_entrega) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("sms_colaborador_epis").insert([{
      colaborador_id: form.colaborador_id,
      epi_id:         form.epi_id,
      obra_id:        form.obra_id || null,
      data_entrega:   form.data_entrega,
      quantidade:     parseInt(form.quantidade) || 1,
      condicao:       form.condicao || null,
      observacoes:    form.observacoes || null,
    }]);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao registrar entrega", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Entrega de EPI registrada!" });
    setModalOpen(false);
    setForm(entregaDefault);
    fetchAll();
  }

  // ─── Catálogo: abrir modal ────────────────────────────────────────────────
  function openNovoCat() {
    setEditCatId(null);
    setCatForm(catDefault);
    setCatModalOpen(true);
  }

  function openEditCat(e: EpiCatalogo) {
    setEditCatId(e.id);
    setCatForm({
      nome:          e.nome,
      descricao:     e.descricao ?? "",
      ca_numero:     e.ca_numero ?? "",
      ca_vencimento: e.ca_vencimento ?? "",
      categoria:     e.categoria ?? "",
      ativo:         e.ativo,
    });
    setCatModalOpen(true);
  }

  // ─── Catálogo: salvar ─────────────────────────────────────────────────────
  async function handleSaveCat() {
    if (!catForm.nome.trim()) {
      toast({ title: "Informe o nome do EPI", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      nome:          catForm.nome.trim(),
      descricao:     catForm.descricao || null,
      ca_numero:     catForm.ca_numero || null,
      ca_vencimento: catForm.ca_vencimento || null,
      categoria:     catForm.categoria || null,
      ativo:         catForm.ativo,
    };
    const { error } = editCatId
      ? await (supabase as any).from("sms_epis_catalogo").update(payload).eq("id", editCatId)
      : await (supabase as any).from("sms_epis_catalogo").insert([payload]);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar EPI", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editCatId ? "EPI atualizado!" : "EPI cadastrado no catálogo!" });
    setCatModalOpen(false);
    fetchAll();
  }

  // ─── Registrar devolução ──────────────────────────────────────────────────
  async function handleDevolucao(id: string) {
    const { error } = await (supabase as any)
      .from("sms_colaborador_epis")
      .update({ data_devolucao: new Date().toISOString().split("T")[0] })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao registrar devolução", variant: "destructive" });
      return;
    }
    toast({ title: "Devolução registrada!" });
    fetchAll();
  }

  // ─── Filtros ──────────────────────────────────────────────────────────────
  const estoqueFiltrado = estoque.filter(e => {
    const matchObra = filtroObra === "all" || e.obra_id === filtroObra;
    const matchSearch = !search ||
      e.sms_epis_catalogo?.nome?.toLowerCase().includes(search.toLowerCase()) ||
      e.obras?.nome?.toLowerCase().includes(search.toLowerCase());
    return matchObra && matchSearch;
  });

  const entregasFiltradas = entregas.filter(e => {
    const matchObra = filtroObra === "all" || e.obra_id === filtroObra;
    const matchSearch = !search ||
      e.employees?.nome?.toLowerCase().includes(search.toLowerCase()) ||
      e.sms_epis_catalogo?.nome?.toLowerCase().includes(search.toLowerCase());
    return matchObra && matchSearch;
  });

  const catalogoFiltrado = catalogo.filter(e =>
    !search ||
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    e.categoria?.toLowerCase().includes(search.toLowerCase()) ||
    e.ca_numero?.toLowerCase().includes(search.toLowerCase())
  );

  const isCAVencido = (dt: string | null) =>
    dt ? new Date(dt) < new Date() : false;

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <Package className="h-6 w-6 text-slate-500" />
              EPIs — Equipamentos de Proteção Individual
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Controle de estoque, entregas e devoluções por colaborador
            </p>
          </div>
          <div className="flex gap-2">
            {tab === "catalogo" ? (
              <Button onClick={openNovoCat} className="gap-2">
                <Plus className="h-4 w-4" /> Novo EPI
              </Button>
            ) : (
              <Button onClick={() => { setForm(entregaDefault); setModalOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" /> Registrar Entrega
              </Button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "EPIs no catálogo", value: catalogo.filter(e => e.ativo).length, color: "text-foreground", bg: "bg-muted/50" },
            { label: "Estoque abaixo mín.", value: estoqueAbaixoMin, color: estoqueAbaixoMin > 0 ? "text-red-600" : "text-green-600", bg: estoqueAbaixoMin > 0 ? "bg-red-50 dark:bg-red-900/10" : "bg-green-50 dark:bg-green-900/10" },
            { label: "Entregas ativas", value: entregasAtivas, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/10" },
            { label: "Total entregas", value: entregas.length, color: "text-foreground", bg: "bg-muted/50" },
          ].map(k => (
            <div key={k.label} className={cn("rounded-lg border border-border/50 px-4 py-3", k.bg)}>
              <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
              <p className={cn("text-2xl font-extrabold mt-0.5", k.color)}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar EPI, colaborador..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {tab !== "catalogo" && (
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Obra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" onClick={fetchAll} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="estoque" className="gap-1.5">
              <Archive className="h-3.5 w-3.5" /> Estoque
              {estoqueAbaixoMin > 0 && (
                <span className="h-4 min-w-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {estoqueAbaixoMin}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="entregas" className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Entregas
            </TabsTrigger>
            <TabsTrigger value="catalogo" className="gap-1.5">
              <BookMarked className="h-3.5 w-3.5" /> Catálogo
            </TabsTrigger>
          </TabsList>

          {/* ── Estoque ──────────────────────────────────────────────────── */}
          <TabsContent value="estoque" className="mt-4">
            <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>EPI</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead className="text-center">Qtd. Atual</TableHead>
                      <TableHead className="text-center">Qtd. Mínima</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {!loading && estoqueFiltrado.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          Nenhum estoque cadastrado
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && estoqueFiltrado.map(e => {
                      const abaixo = e.quantidade <= e.quantidade_minima;
                      return (
                        <TableRow key={e.id} className={cn("hover:bg-muted/30", abaixo && "bg-red-50/40 dark:bg-red-900/5")}>
                          <TableCell className="text-sm font-medium">{e.sms_epis_catalogo?.nome ?? "–"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground capitalize">{e.sms_epis_catalogo?.categoria ?? "–"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.obras?.nome ?? "–"}</TableCell>
                          <TableCell className={cn("text-center font-bold text-sm", abaixo ? "text-red-600" : "text-foreground")}>
                            {e.quantidade}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{e.quantidade_minima}</TableCell>
                          <TableCell>
                            {abaixo ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                <AlertTriangle className="h-3 w-3" /> Abaixo do mínimo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3" /> OK
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* ── Entregas ─────────────────────────────────────────────────── */}
          <TabsContent value="entregas" className="mt-4">
            <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Colaborador</TableHead>
                      <TableHead>EPI</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead className="text-center">Qtd.</TableHead>
                      <TableHead>Entrega</TableHead>
                      <TableHead>Devolução</TableHead>
                      <TableHead>Condição</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {!loading && entregasFiltradas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                          Nenhuma entrega registrada
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && entregasFiltradas.map(e => (
                      <TableRow key={e.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-medium">{e.employees?.nome ?? "–"}</TableCell>
                        <TableCell className="text-sm">{e.sms_epis_catalogo?.nome ?? "–"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{e.obras?.nome ?? "–"}</TableCell>
                        <TableCell className="text-center text-sm">{e.quantidade}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(e.data_entrega + "T12:00:00").toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {e.data_devolucao
                            ? new Date(e.data_devolucao + "T12:00:00").toLocaleDateString("pt-BR")
                            : <span className="text-blue-600 font-medium">Em uso</span>}
                        </TableCell>
                        <TableCell className="text-sm capitalize">{e.condicao ?? "–"}</TableCell>
                        <TableCell className="text-right">
                          {!e.data_devolucao && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleDevolucao(e.id)}
                            >
                              Devolver
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* ── Catálogo ─────────────────────────────────────────────────── */}
          <TabsContent value="catalogo" className="mt-4">
            <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>EPI</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>CA Nº</TableHead>
                      <TableHead>Validade CA</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {!loading && catalogoFiltrado.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center">
                          <BookMarked className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">Nenhum EPI cadastrado</p>
                          <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={openNovoCat}>
                            <Plus className="h-3.5 w-3.5" /> Cadastrar primeiro EPI
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && catalogoFiltrado.map(e => {
                      const caVencido = isCAVencido(e.ca_vencimento);
                      return (
                        <TableRow key={e.id} className={cn("hover:bg-muted/30", !e.ativo && "opacity-50")}>
                          <TableCell>
                            <p className="text-sm font-medium">{e.nome}</p>
                            {e.descricao && <p className="text-xs text-muted-foreground">{e.descricao}</p>}
                          </TableCell>
                          <TableCell className="text-sm capitalize text-muted-foreground">{e.categoria ?? "–"}</TableCell>
                          <TableCell className="text-sm font-mono">{e.ca_numero ?? "–"}</TableCell>
                          <TableCell className={cn("text-sm whitespace-nowrap", caVencido ? "text-red-600 font-medium" : "text-muted-foreground")}>
                            {e.ca_vencimento
                              ? new Date(e.ca_vencimento + "T12:00:00").toLocaleDateString("pt-BR")
                              : "–"}
                            {caVencido && " ⚠️"}
                          </TableCell>
                          <TableCell>
                            {e.ativo ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Ativo
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800">
                                Inativo
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs"
                              onClick={() => openEditCat(e)}
                            >
                              <Pencil className="h-3 w-3" /> Editar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Modal Entrega ───────────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-500" />
              Registrar Entrega de EPI
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Colaborador <span className="text-red-500">*</span></Label>
              <Select value={form.colaborador_id} onValueChange={v => setForm(f => ({ ...f, colaborador_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>EPI <span className="text-red-500">*</span></Label>
              <Select value={form.epi_id} onValueChange={v => setForm(f => ({ ...f, epi_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o EPI" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {catalogo.filter(e => e.ativo).map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome} {e.ca_numero ? `(CA ${e.ca_numero})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Obra</Label>
                <Select value={form.obra_id} onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Obra (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data Entrega <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={form.data_entrega}
                  onChange={e => setForm(f => ({ ...f, data_entrega: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantidade}
                  onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Condição</Label>
                <Select value={form.condicao} onValueChange={v => setForm(f => ({ ...f, condicao: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="bom">Bom estado</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="danificado">Danificado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações sobre a entrega..."
                value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEntrega} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Catálogo EPI ──────────────────────────────────────────────── */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-slate-500" />
              {editCatId ? "Editar EPI" : "Cadastrar EPI no Catálogo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome do EPI <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ex: Capacete de Segurança Aba Frontal"
                value={catForm.nome}
                onChange={e => setCatForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descrição detalhada, modelo, cor, tamanho..."
                value={catForm.descricao}
                onChange={e => setCatForm(f => ({ ...f, descricao: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Categoria */}
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={catForm.categoria} onValueChange={v => setCatForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {EPI_CATEGORIAS.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* CA */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nº do CA</Label>
                <Input
                  placeholder="Ex: 12345"
                  value={catForm.ca_numero}
                  onChange={e => setCatForm(f => ({ ...f, ca_numero: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Validade do CA</Label>
                <Input
                  type="date"
                  value={catForm.ca_vencimento}
                  onChange={e => setCatForm(f => ({ ...f, ca_vencimento: e.target.value }))}
                />
              </div>
            </div>

            {/* Ativo */}
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium">EPI Ativo</p>
                <p className="text-xs text-muted-foreground">EPIs inativos não aparecem nas entregas</p>
              </div>
              <Switch
                checked={catForm.ativo}
                onCheckedChange={v => setCatForm(f => ({ ...f, ativo: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCatModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCat} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
              {saving ? "Salvando..." : editCatId ? "Salvar Alterações" : "Cadastrar EPI"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

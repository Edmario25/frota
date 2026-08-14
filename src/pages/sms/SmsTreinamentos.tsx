import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GraduationCap, Search, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Plus, Trash2, Upload, BarChart3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useObras } from "@/hooks/useObras";
import { addMonths, format } from "date-fns";
import { ImportacaoTreinamentosModal } from "@/components/sms/ImportacaoTreinamentosModal";

// ─── Types ───────────────────────────────────────────────────────────────────
type TrStatus = "pendente" | "em_dia" | "a_vencer" | "vencido";

interface Catalogo {
  id: string;
  nome: string;
  nr_referencia: string | null;
  carga_horaria_h: number | null;
  validade_meses: number | null;
}

interface Funcionario { id: string; nome: string }

interface ColabTreinamento {
  id: string;
  status: TrStatus;
  data_realizacao: string | null;
  data_vencimento: string | null;
  instituicao: string | null;
  instrutor: string | null;
  obra_id: string | null;
  colaborador_id: string;
  treinamento_id: string;
  employees: { nome: string } | null;
  sms_treinamentos_catalogo: {
    nome: string;
    nr_referencia: string | null;
    carga_horaria_h: number | null;
    validade_meses: number | null;
  } | null;
  obras: { nome: string } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const statusStyle: Record<TrStatus, string> = {
  pendente: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  em_dia:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  a_vencer: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  vencido:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};
const statusLabel: Record<TrStatus, string> = {
  pendente: "Pendente", em_dia: "Em Dia", a_vencer: "A Vencer", vencido: "Vencido",
};
const statusIcon: Record<TrStatus, React.ElementType> = {
  pendente: Clock, em_dia: CheckCircle2, a_vencer: AlertTriangle, vencido: AlertTriangle,
};

function calcStatus(dataVenc: string | null): TrStatus {
  if (!dataVenc) return "pendente";
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(dataVenc + "T00:00:00");
  const dias = Math.ceil((venc.getTime() - hoje.getTime()) / 86_400_000);
  if (dias < 0)   return "vencido";
  if (dias <= 30) return "a_vencer";
  return "em_dia";
}

// ─── Form inicial ─────────────────────────────────────────────────────────────
const FORM_VAZIO = {
  colaborador_id:  "",
  treinamento_id:  "",
  obra_id:         "",
  data_realizacao: format(new Date(), "yyyy-MM-dd"),
  data_vencimento: "",
  instituicao:     "",
  instrutor:       "",
};

// ─── Componente principal ────────────────────────────────────────────────────
export default function SmsTreinamentos() {
  const { toast } = useToast();
  const { obras } = useObras();

  const [registros,   setRegistros]   = useState<ColabTreinamento[]>([]);
  const [catalogo,    setCatalogo]     = useState<Catalogo[]>([]);
  const [funcionarios,setFuncionarios] = useState<Funcionario[]>([]);
  const [loading,     setLoading]      = useState(true);
  const [saving,      setSaving]       = useState(false);
  const [deleting,    setDeleting]     = useState<string | null>(null);
  const [modalImport, setModalImport] = useState(false);

  // Filtros
  const [search,       setSearch]      = useState("");
  const [filtroObra,   setFiltroObra]  = useState("all");
  const [filtroStatus, setFiltroStatus]= useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...FORM_VAZIO });

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const total    = registros.length;
  const emDia    = registros.filter(r => r.status === "em_dia").length;
  const aVencer  = registros.filter(r => r.status === "a_vencer").length;
  const vencidos = registros.filter(r => r.status === "vencido").length;

  // ─── Fetch registros ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("sms_colaborador_treinamentos")
      .select(`
        id, status, data_realizacao, data_vencimento, instituicao, instrutor,
        obra_id, colaborador_id, treinamento_id,
        employees!sms_colaborador_treinamentos_colaborador_id_fkey(nome),
        sms_treinamentos_catalogo(nome, nr_referencia, carga_horaria_h, validade_meses),
        obras(nome)
      `)
      .order("data_vencimento", { ascending: true, nullsFirst: false });

    if (filtroObra   !== "all") q = q.eq("obra_id", filtroObra);
    if (filtroStatus !== "all") q = q.eq("status", filtroStatus);

    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar treinamentos", variant: "destructive" });
    setRegistros((data ?? []) as ColabTreinamento[]);
    setLoading(false);
  }, [filtroObra, filtroStatus, toast]);

  // ─── Fetch catálogo e funcionários ─────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      (supabase as any).from("sms_treinamentos_catalogo")
        .select("id, nome, nr_referencia, carga_horaria_h, validade_meses")
        .eq("ativo", true).order("nome"),
      (supabase as any).from("employees")
        .select("id, nome").eq("status", "ativo").order("nome"),
    ]).then(([cat, func]) => {
      setCatalogo(cat.data ?? []);
      setFuncionarios(func.data ?? []);
    });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Filtro local ───────────────────────────────────────────────────────────
  const filtered = registros.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.employees?.nome?.toLowerCase().includes(q) ||
      r.sms_treinamentos_catalogo?.nome?.toLowerCase().includes(q) ||
      r.obras?.nome?.toLowerCase().includes(q)
    );
  });

  // ─── Auto-calcular vencimento ao mudar treinamento ou data_realizacao ───────
  const handleTreinamentoChange = (trId: string) => {
    const cat = catalogo.find(c => c.id === trId);
    let venc = form.data_vencimento;
    if (cat?.validade_meses && form.data_realizacao) {
      const base = new Date(form.data_realizacao + "T12:00:00");
      venc = format(addMonths(base, cat.validade_meses), "yyyy-MM-dd");
    }
    setForm(f => ({ ...f, treinamento_id: trId, data_vencimento: venc }));
  };

  const handleDataRealizacaoChange = (val: string) => {
    let venc = form.data_vencimento;
    const cat = catalogo.find(c => c.id === form.treinamento_id);
    if (cat?.validade_meses && val) {
      const base = new Date(val + "T12:00:00");
      venc = format(addMonths(base, cat.validade_meses), "yyyy-MM-dd");
    }
    setForm(f => ({ ...f, data_realizacao: val, data_vencimento: venc }));
  };

  // ─── Salvar ─────────────────────────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!form.colaborador_id || !form.treinamento_id) {
      toast({ title: "Preencha o colaborador e o treinamento", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const status = calcStatus(form.data_vencimento || null);
      const { error } = await (supabase as any)
        .from("sms_colaborador_treinamentos")
        .insert({
          colaborador_id:  form.colaborador_id,
          treinamento_id:  form.treinamento_id,
          obra_id:         form.obra_id || null,
          data_realizacao: form.data_realizacao || null,
          data_vencimento: form.data_vencimento || null,
          instituicao:     form.instituicao || null,
          instrutor:       form.instrutor   || null,
          status,
        });
      if (error) throw error;
      toast({ title: "Treinamento registrado com sucesso!" });
      setModalOpen(false);
      setForm({ ...FORM_VAZIO });
      await fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Excluir ────────────────────────────────────────────────────────────────
  const handleExcluir = async (id: string) => {
    if (!confirm("Excluir este registro de treinamento?")) return;
    setDeleting(id);
    const { error } = await (supabase as any)
      .from("sms_colaborador_treinamentos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Registro excluído" });
      setRegistros(r => r.filter(x => x.id !== id));
    }
    setDeleting(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-emerald-500" />
              Treinamentos / ASO
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Matriz de treinamentos obrigatórios e exames ocupacionais por colaborador
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1.5" asChild>
              <Link to="/sms/conformidade">
                <BarChart3 className="h-4 w-4" />
                Conformidade
              </Link>
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={() => setModalImport(true)}>
              <Upload className="h-4 w-4" />
              Importar CSV
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={() => { setForm({ ...FORM_VAZIO }); setModalOpen(true); }}
            >
              <Plus className="h-4 w-4" />
              Registrar
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",    value: total,    color: "text-foreground",  bg: "bg-muted/50" },
            { label: "Em Dia",   value: emDia,    color: "text-green-600",   bg: "bg-green-50 dark:bg-green-900/10" },
            { label: "A Vencer", value: aVencer,  color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-900/10" },
            { label: "Vencidos", value: vencidos, color: "text-red-600",     bg: "bg-red-50 dark:bg-red-900/10" },
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
              placeholder="Buscar colaborador ou treinamento..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filtroObra} onValueChange={setFiltroObra}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Obra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="em_dia">Em Dia</SelectItem>
              <SelectItem value="a_vencer">A Vencer</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={fetchData} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Treinamento</TableHead>
                  <TableHead>NR</TableHead>
                  <TableHead>Carga</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Realização</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))}

                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-16 text-center">
                      <GraduationCap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-foreground">Nenhum registro encontrado</p>
                      <p className="text-xs text-muted-foreground mt-1 mb-4">
                        Registre o primeiro treinamento para começar
                      </p>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        onClick={() => { setForm({ ...FORM_VAZIO }); setModalOpen(true); }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Registrar Treinamento
                      </Button>
                    </TableCell>
                  </TableRow>
                )}

                {!loading && filtered.map(r => {
                  const Icon = statusIcon[r.status];
                  const diasVenc = r.data_vencimento
                    ? Math.ceil((new Date(r.data_vencimento).getTime() - Date.now()) / 86_400_000)
                    : null;
                  return (
                    <TableRow key={r.id} className={cn(
                      "hover:bg-muted/30 transition-colors",
                      r.status === "vencido" && "bg-red-50/40 dark:bg-red-900/5",
                    )}>
                      <TableCell>
                        <p className="text-sm font-medium">{r.employees?.nome ?? "–"}</p>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {r.sms_treinamentos_catalogo?.nome ?? "–"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.sms_treinamentos_catalogo?.nr_referencia ?? "–"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.sms_treinamentos_catalogo?.carga_horaria_h
                          ? `${r.sms_treinamentos_catalogo.carga_horaria_h}h`
                          : "–"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.obras?.nome ?? "–"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.data_realizacao
                          ? new Date(r.data_realizacao + "T12:00:00").toLocaleDateString("pt-BR")
                          : "–"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.data_vencimento ? (
                          <span className={cn(
                            "font-medium",
                            diasVenc !== null && diasVenc < 0  ? "text-red-600" :
                            diasVenc !== null && diasVenc <= 30 ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            {new Date(r.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                            {diasVenc !== null && diasVenc < 0   && <span className="text-xs ml-1">({Math.abs(diasVenc)}d atrás)</span>}
                            {diasVenc !== null && diasVenc >= 0 && diasVenc <= 30 && <span className="text-xs ml-1">({diasVenc}d)</span>}
                          </span>
                        ) : "–"}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                          statusStyle[r.status]
                        )}>
                          <Icon className="h-2.5 w-2.5" />
                          {statusLabel[r.status]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600"
                          disabled={deleting === r.id}
                          onClick={() => handleExcluir(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
              {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* ─── Modal de Importação CSV ──────────────────────────────────────── */}
      <ImportacaoTreinamentosModal
        open={modalImport}
        onOpenChange={setModalImport}
        onImportado={fetchData}
      />

      {/* ─── Modal de Cadastro ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-emerald-500" />
              Registrar Treinamento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Colaborador */}
            <div className="space-y-1.5">
              <Label>Colaborador <span className="text-red-500">*</span></Label>
              <Select value={form.colaborador_id} onValueChange={v => setForm(f => ({ ...f, colaborador_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {funcionarios.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Treinamento */}
            <div className="space-y-1.5">
              <Label>Treinamento <span className="text-red-500">*</span></Label>
              <Select value={form.treinamento_id} onValueChange={handleTreinamentoChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o treinamento" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {catalogo.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-medium">{c.nome}</span>
                      {c.nr_referencia && (
                        <span className="ml-2 text-xs text-muted-foreground">{c.nr_referencia}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.treinamento_id && (() => {
                const cat = catalogo.find(c => c.id === form.treinamento_id);
                if (!cat) return null;
                return (
                  <p className="text-xs text-muted-foreground">
                    {cat.carga_horaria_h && `${cat.carga_horaria_h}h · `}
                    {cat.validade_meses && `validade: ${cat.validade_meses} meses`}
                  </p>
                );
              })()}
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data de Realização</Label>
                <Input
                  type="date"
                  value={form.data_realizacao}
                  onChange={e => handleDataRealizacaoChange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Vencimento</Label>
                <Input
                  type="date"
                  value={form.data_vencimento}
                  onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
                />
                {form.data_vencimento && (
                  <p className="text-xs text-muted-foreground">
                    auto-calculado pela validade do treinamento
                  </p>
                )}
              </div>
            </div>

            {/* Obra */}
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <Select value={form.obra_id || "none"} onValueChange={v => setForm(f => ({ ...f, obra_id: v === "none" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Obra onde foi realizado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem obra vinculada</SelectItem>
                  {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Instituição e Instrutor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Instituição / Empresa</Label>
                <Input
                  placeholder="Ex: SENAI, empresa X..."
                  value={form.instituicao}
                  onChange={e => setForm(f => ({ ...f, instituicao: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Instrutor</Label>
                <Input
                  placeholder="Nome do instrutor"
                  value={form.instrutor}
                  onChange={e => setForm(f => ({ ...f, instrutor: e.target.value }))}
                />
              </div>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSalvar}
              disabled={saving || !form.colaborador_id || !form.treinamento_id}
            >
              {saving ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  FileWarning, Plus, Search, RefreshCw, ChevronRight,
  ChevronLeft, CheckCircle2, Users, ShieldAlert, AlertTriangle,
} from "lucide-react";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";

// ─── Types ──────────────────────────────────────────────────────────────────
type AprStatus = "aberta" | "em_execucao" | "concluida" | "cancelada";

interface TipoAtividade {
  id: string;
  nome: string;
  descricao: string | null;
}

interface RiscoCatalogo {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  probabilidade_padrao: string | null;
  severidade_padrao: string | null;
}

interface Apr {
  id: string;
  obra_id: string | null;
  tipo_atividade_id: string | null;
  local: string;
  data_hora_inicio: string;
  status: AprStatus;
  responsavel: string;
  observacoes: string | null;
  obras: { nome: string } | null;
  sms_apr_tipos_atividade: { nome: string } | null;
  total_riscos?: number;
  total_envolvidos?: number;
}

interface RiscoSelecionado {
  risco_id: string;
  nome: string;
  categoria: string | null;
  medida_controle: string;
}

const statusLabel: Record<AprStatus, string> = {
  aberta:      "Aberta",
  em_execucao: "Em Execução",
  concluida:   "Concluída",
  cancelada:   "Cancelada",
};

const statusStyle: Record<AprStatus, string> = {
  aberta:      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  em_execucao: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  concluida:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelada:   "bg-slate-100 text-slate-600 dark:bg-slate-800",
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsApr() {
  const { toast } = useToast();
  const { obras } = useObras();
  const { employees } = useEmployees();

  const [aprs, setAprs] = useState<Apr[]>([]);
  const [tiposAtividade, setTiposAtividade] = useState<TipoAtividade[]>([]);
  const [riscosCat, setRiscosCat] = useState<RiscoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filtroObra, setFiltroObra] = useState("all");
  const [filtroStatus, setFiltroStatus] = useState("all");

  // Modal multi-step
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [aprCriada, setAprCriada] = useState<string | null>(null); // id da APR criada
  const [saving, setSaving] = useState(false);

  // Step 1: info básica
  const [basicForm, setBasicForm] = useState({
    obra_id: "",
    tipo_atividade_id: "",
    local: "",
    data_hora_inicio: new Date().toISOString().slice(0, 16),
    responsavel: "",
    observacoes: "",
  });

  // Step 2: riscos
  const [riscosSel, setRiscosSel] = useState<Record<string, RiscoSelecionado>>({});
  const [riscoSearch, setRiscoSearch] = useState("");

  // Step 3: envolvidos
  const [envolvidosSel, setEnvolvidosSel] = useState<Set<string>>(new Set());
  const [empSearch, setEmpSearch] = useState("");

  // Modal detalhe/status APR existente
  const [detalheApr, setDetalheApr] = useState<Apr | null>(null);

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const abertas     = aprs.filter(a => a.status === "aberta").length;
  const emExecucao  = aprs.filter(a => a.status === "em_execucao").length;
  const hoje        = new Date().toDateString();
  const deHoje      = aprs.filter(a => new Date(a.data_hora_inicio).toDateString() === hoje).length;

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchAprs = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("sms_aprs")
      .select("id, obra_id, tipo_atividade_id, local, data_hora_inicio, status, responsavel, observacoes, obras(nome), sms_apr_tipos_atividade(nome)")
      .order("data_hora_inicio", { ascending: false })
      .limit(200);

    if (filtroObra !== "all")   q = q.eq("obra_id", filtroObra);
    if (filtroStatus !== "all") q = q.eq("status", filtroStatus);

    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar APRs", variant: "destructive" });

    const ids = (data ?? []).map((a: any) => a.id);
    const riscosCount: Record<string, number> = {};
    const envolvCount: Record<string, number> = {};
    if (ids.length > 0) {
      const [{ data: rData }, { data: eData }] = await Promise.all([
        (supabase as any).from("sms_apr_riscos_selecionados").select("apr_id").in("apr_id", ids),
        (supabase as any).from("sms_apr_envolvidos").select("apr_id").in("apr_id", ids),
      ]);
      (rData ?? []).forEach((r: any) => { riscosCount[r.apr_id] = (riscosCount[r.apr_id] ?? 0) + 1; });
      (eData ?? []).forEach((e: any) => { envolvCount[e.apr_id] = (envolvCount[e.apr_id] ?? 0) + 1; });
    }

    setAprs((data ?? []).map((a: any) => ({
      ...a,
      total_riscos: riscosCount[a.id] ?? 0,
      total_envolvidos: envolvCount[a.id] ?? 0,
    })));
    setLoading(false);
  }, [filtroObra, filtroStatus, toast]);

  const fetchCatalogos = useCallback(async () => {
    const [{ data: tipos }, { data: riscos }] = await Promise.all([
      (supabase as any).from("sms_apr_tipos_atividade").select("id, nome, descricao").order("nome"),
      (supabase as any).from("sms_apr_riscos_catalogo").select("id, nome, descricao, categoria, probabilidade_padrao, severidade_padrao").order("categoria").order("nome"),
    ]);
    setTiposAtividade((tipos ?? []) as TipoAtividade[]);
    setRiscosCat((riscos ?? []) as RiscoCatalogo[]);
  }, []);

  useEffect(() => { fetchAprs(); }, [fetchAprs]);
  useEffect(() => { fetchCatalogos(); }, [fetchCatalogos]);

  // ─── Step 1: Criar APR ────────────────────────────────────────────────────
  async function handleCriarApr() {
    if (!basicForm.local || !basicForm.responsavel || !basicForm.data_hora_inicio) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await (supabase as any).from("sms_aprs").insert([{
      obra_id:           basicForm.obra_id || null,
      tipo_atividade_id: basicForm.tipo_atividade_id || null,
      local:             basicForm.local,
      data_hora_inicio:  basicForm.data_hora_inicio,
      status:            "aberta",
      responsavel:       basicForm.responsavel,
      observacoes:       basicForm.observacoes || null,
    }]).select("id");
    setSaving(false);
    if (error || !data?.[0]?.id) {
      toast({ title: "Erro ao criar APR", description: error?.message, variant: "destructive" });
      return;
    }
    setAprCriada(data[0].id);
    setStep(2);
  }

  // ─── Step 2: Salvar riscos ────────────────────────────────────────────────
  async function handleSalvarRiscos() {
    if (!aprCriada) return;
    const riscos = Object.values(riscosSel);
    if (riscos.length === 0) {
      toast({ title: "Identifique ao menos um risco", description: "Uma APR não pode ser emitida sem riscos e medidas de controle.", variant: "destructive" });
      return;
    }
    if (riscos.some(r => !r.medida_controle?.trim())) {
      toast({ title: "Informe todas as medidas de controle", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("sms_apr_riscos_selecionados").insert(
      riscos.map(r => ({
        apr_id:          aprCriada,
        risco_id:        r.risco_id,
        medida_controle: r.medida_controle || null,
        eliminado:       false,
      }))
    );
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar riscos", variant: "destructive" }); return; }
    setStep(3);
  }

  // ─── Step 3: Salvar envolvidos + fechar ───────────────────────────────────
  async function handleSalvarEnvolvidos() {
    if (!aprCriada) return;
    if (envolvidosSel.size === 0) {
      toast({ title: "Selecione a equipe envolvida", description: "A APR precisa registrar quem recebeu a orientação.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("sms_apr_envolvidos").insert(
        Array.from(envolvidosSel).map(cid => ({
          apr_id:         aprCriada,
          colaborador_id: cid,
          assinou:        false,
        }))
      );
    setSaving(false);
    if (error) { toast({ title: "Erro ao vincular a equipe", description: error.message, variant: "destructive" }); return; }
    toast({ title: "APR criada com sucesso!" });
    setModalOpen(false);
    resetModal();
    fetchAprs();
  }

  function resetModal() {
    setStep(1);
    setAprCriada(null);
    setBasicForm({ obra_id: "", tipo_atividade_id: "", local: "", data_hora_inicio: new Date().toISOString().slice(0, 16), responsavel: "", observacoes: "" });
    setRiscosSel({});
    setEnvolvidosSel(new Set());
    setRiscoSearch("");
    setEmpSearch("");
  }

  // ─── Mudar status APR ─────────────────────────────────────────────────────
  async function handleStatusChange(id: string, novoStatus: AprStatus) {
    await (supabase as any).from("sms_aprs").update({ status: novoStatus }).eq("id", id);
    setAprs(prev => prev.map(a => a.id === id ? { ...a, status: novoStatus } : a));
    setDetalheApr(prev => prev && prev.id === id ? { ...prev, status: novoStatus } : prev);
  }

  // ─── Filtros ──────────────────────────────────────────────────────────────
  const filtered = aprs.filter(a => {
    const matchObra = filtroObra === "all" || a.obra_id === filtroObra;
    const matchStatus = filtroStatus === "all" || a.status === filtroStatus;
    const matchSearch = !search || a.local.toLowerCase().includes(search.toLowerCase()) ||
      a.responsavel.toLowerCase().includes(search.toLowerCase()) ||
      a.sms_apr_tipos_atividade?.nome?.toLowerCase().includes(search.toLowerCase()) ||
      a.obras?.nome?.toLowerCase().includes(search.toLowerCase());
    return matchObra && matchStatus && matchSearch;
  });

  const riscosFiltrados = riscosCat.filter(r =>
    !riscoSearch || r.nome.toLowerCase().includes(riscoSearch.toLowerCase()) || r.categoria?.toLowerCase().includes(riscoSearch.toLowerCase())
  );

  const empsFiltrados = employees.filter(e =>
    !empSearch || e.nome.toLowerCase().includes(empSearch.toLowerCase())
  );

  // Agrupar riscos por categoria
  const riscosPorCat = riscosFiltrados.reduce<Record<string, RiscoCatalogo[]>>((acc, r) => {
    const cat = r.categoria ?? "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  const stepTitle = ["", "Informações da Atividade", "Identificar Riscos", "Envolvidos na Atividade"];

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <FileWarning className="h-6 w-6 text-violet-500" />
              APR — Análise Preliminar de Riscos
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Formulário de análise antes de atividades críticas em campo
            </p>
          </div>
          <Button onClick={() => { resetModal(); setModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova APR
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Hoje", value: deHoje, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/10" },
            { label: "Em Aberto", value: abertas, color: abertas > 0 ? "text-amber-600" : "text-muted-foreground", bg: abertas > 0 ? "bg-amber-50 dark:bg-amber-900/10" : "bg-muted/50" },
            { label: "Em Execução", value: emExecucao, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/10" },
            { label: "Total", value: aprs.length, color: "text-foreground", bg: "bg-muted/50" },
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
            <Input placeholder="Buscar local, responsável, atividade..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filtroObra} onValueChange={setFiltroObra}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="aberta">Aberta</SelectItem>
              <SelectItem value="em_execucao">Em Execução</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={fetchAprs}><RefreshCw className="h-4 w-4" /></Button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Atividade</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead className="text-center">Riscos</TableHead>
                  <TableHead className="text-center">Envolvidos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 9 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center">
                      <FileWarning className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">Nenhuma APR encontrada</p>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.map(a => (
                  <TableRow key={a.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm whitespace-nowrap">
                      <p className="font-medium">{new Date(a.data_hora_inicio).toLocaleDateString("pt-BR")}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.data_hora_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                    </TableCell>
                    <TableCell className="text-sm">{a.sms_apr_tipos_atividade?.nome ?? <span className="text-muted-foreground italic">–</span>}</TableCell>
                    <TableCell className="text-sm max-w-[140px] truncate">{a.local}</TableCell>
                    <TableCell className="text-sm">{a.responsavel}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.obras?.nome ?? "–"}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                        (a.total_riscos ?? 0) > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-muted text-muted-foreground"
                      )}>
                        <ShieldAlert className="h-3 w-3" /> {a.total_riscos ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30">
                        <Users className="h-3 w-3" /> {a.total_envolvidos ?? 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusStyle[a.status])}>
                        {statusLabel[a.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDetalheApr(a)}>
                        Detalhe <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
              {filtered.length} APR{filtered.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* ─── Modal Nova APR (multi-step) ─────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={v => { if (!v) { setModalOpen(false); resetModal(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            {/* Steps indicator */}
            <div className="flex items-center gap-2 mb-2">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold",
                    step === s ? "bg-violet-600 text-white" :
                    step > s ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    {step > s ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
                  </div>
                  {s < 3 && <div className={cn("h-0.5 w-8", step > s ? "bg-green-500" : "bg-muted")} />}
                </div>
              ))}
              <span className="ml-2 text-sm font-semibold text-foreground">{stepTitle[step]}</span>
            </div>
          </DialogHeader>

          {/* ── Step 1: Info básica ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Tipo de Atividade</Label>
                <Select value={basicForm.tipo_atividade_id} onValueChange={v => setBasicForm(f => ({ ...f, tipo_atividade_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo de atividade (opcional)" /></SelectTrigger>
                  <SelectContent className="max-h-56">
                    {tiposAtividade.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Local <span className="text-red-500">*</span></Label>
                  <Input placeholder="Onde será a atividade" value={basicForm.local} onChange={e => setBasicForm(f => ({ ...f, local: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Responsável <span className="text-red-500">*</span></Label>
                  <Input placeholder="Nome do responsável" value={basicForm.responsavel} onChange={e => setBasicForm(f => ({ ...f, responsavel: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Data e Hora Início <span className="text-red-500">*</span></Label>
                  <Input type="datetime-local" value={basicForm.data_hora_inicio} onChange={e => setBasicForm(f => ({ ...f, data_hora_inicio: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Obra</Label>
                  <Select value={basicForm.obra_id} onValueChange={v => setBasicForm(f => ({ ...f, obra_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Obra (opcional)" /></SelectTrigger>
                    <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea placeholder="Contexto da atividade, condições especiais..." value={basicForm.observacoes} onChange={e => setBasicForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
              </div>
            </div>
          )}

          {/* ── Step 2: Riscos ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-3">
              <div className="relative flex-shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar risco..." value={riscoSearch} onChange={e => setRiscoSearch(e.target.value)} className="pl-9" />
              </div>
              {Object.keys(riscosSel).length > 0 && (
                <p className="text-xs text-violet-600 font-semibold flex-shrink-0">
                  {Object.keys(riscosSel).length} risco{Object.keys(riscosSel).length !== 1 ? "s" : ""} selecionado{Object.keys(riscosSel).length !== 1 ? "s" : ""}
                </p>
              )}
              <div className="flex-1 overflow-y-auto space-y-4">
                {Object.entries(riscosPorCat).map(([cat, riscos]) => (
                  <div key={cat}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 px-1">{cat}</p>
                    <div className="space-y-1">
                      {riscos.map(r => {
                        const sel = !!riscosSel[r.id];
                        return (
                          <div key={r.id} className={cn(
                            "rounded-lg border p-3 transition-colors",
                            sel ? "border-violet-200 bg-violet-50/50 dark:bg-violet-900/10 dark:border-violet-800" : "border-border/50"
                          )}>
                            <div className="flex items-start gap-2.5">
                              <Checkbox
                                checked={sel}
                                onCheckedChange={checked => {
                                  if (checked) {
                                    setRiscosSel(prev => ({ ...prev, [r.id]: { risco_id: r.id, nome: r.nome, categoria: r.categoria, medida_controle: "" } }));
                                  } else {
                                    setRiscosSel(prev => { const n = { ...prev }; delete n[r.id]; return n; });
                                  }
                                }}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground leading-tight">{r.nome}</p>
                                {r.descricao && <p className="text-xs text-muted-foreground mt-0.5">{r.descricao}</p>}
                                {sel && (
                                  <div className="mt-2">
                                    <Input
                                      placeholder="Medida de controle para este risco..."
                                      value={riscosSel[r.id]?.medida_controle ?? ""}
                                      onChange={e => setRiscosSel(prev => ({ ...prev, [r.id]: { ...prev[r.id], medida_controle: e.target.value } }))}
                                      className="text-xs h-8"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {Object.keys(riscosPorCat).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum risco encontrado</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Envolvidos ──────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-3">
              <div className="relative flex-shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar colaborador..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} className="pl-9" />
              </div>
              {envolvidosSel.size > 0 && (
                <p className="text-xs text-blue-600 font-semibold flex-shrink-0">
                  {envolvidosSel.size} envolvido{envolvidosSel.size !== 1 ? "s" : ""} selecionado{envolvidosSel.size !== 1 ? "s" : ""}
                </p>
              )}
              <div className="flex-1 overflow-y-auto space-y-1">
                {empsFiltrados.map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors">
                    <Checkbox
                      checked={envolvidosSel.has(emp.id)}
                      onCheckedChange={checked => {
                        setEnvolvidosSel(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(emp.id); else next.delete(emp.id);
                          return next;
                        });
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{emp.nome}</p>
                      {null}
                    </div>
                    {envolvidosSel.has(emp.id) && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 border-t border-border/40 pt-3">
            <Button variant="outline" onClick={() => { setModalOpen(false); resetModal(); }} disabled={saving}>Cancelar</Button>
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={saving} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
            )}
            {step === 1 && (
              <Button onClick={handleCriarApr} disabled={saving} className="gap-2">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Criando..." : "Próximo →"}
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleSalvarRiscos} disabled={saving} className="gap-2">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Salvando..." : "Próximo →"}
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handleSalvarEnvolvidos} disabled={saving} className="gap-2">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? "Finalizando..." : "Finalizar APR"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Detalhe / Alterar Status ──────────────────────────────────── */}
      <Dialog open={!!detalheApr} onOpenChange={v => { if (!v) setDetalheApr(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-violet-500" />
              Detalhe da APR
            </DialogTitle>
          </DialogHeader>
          {detalheApr && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Atividade</p><p className="font-medium">{detalheApr.sms_apr_tipos_atividade?.nome ?? "–"}</p></div>
                <div><p className="text-xs text-muted-foreground">Local</p><p className="font-medium">{detalheApr.local}</p></div>
                <div><p className="text-xs text-muted-foreground">Responsável</p><p className="font-medium">{detalheApr.responsavel}</p></div>
                <div><p className="text-xs text-muted-foreground">Obra</p><p className="font-medium">{detalheApr.obras?.nome ?? "–"}</p></div>
                <div><p className="text-xs text-muted-foreground">Data/Hora</p><p className="font-medium">{new Date(detalheApr.data_hora_inicio).toLocaleString("pt-BR")}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">Riscos / Envolvidos</p>
                  <p className="font-medium">{detalheApr.total_riscos ?? 0} riscos · {detalheApr.total_envolvidos ?? 0} pessoas</p>
                </div>
              </div>
              {detalheApr.observacoes && (
                <div className="rounded-lg bg-muted/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p>{detalheApr.observacoes}</p>
                </div>
              )}
              <div className="space-y-1.5 pt-1">
                <Label>Alterar Status</Label>
                <Select value={detalheApr.status} onValueChange={v => handleStatusChange(detalheApr.id, v as AprStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_execucao">Em Execução</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetalheApr(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

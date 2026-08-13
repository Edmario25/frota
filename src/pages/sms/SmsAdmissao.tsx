import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  UserCheck, Plus, Search, RefreshCw, CheckCircle2,
  ChevronRight, FileCheck, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";
import { DocumentoUploader } from "@/components/sms/FotoUploader";

// ─── Checklist padrão de documentos ─────────────────────────────────────────
const DOCS = [
  { key: "rg_cnh",                label: "RG ou CNH" },
  { key: "cpf",                   label: "CPF" },
  { key: "comprovante_residencia", label: "Comprovante de Residência" },
  { key: "aso",                   label: "ASO — Atestado de Saúde Ocupacional" },
  { key: "ficha_epi",             label: "Ficha de Entrega de EPI assinada" },
  { key: "contrato_trabalho",     label: "Contrato de Trabalho assinado" },
  { key: "foto_3x4",              label: "Foto 3x4" },
  { key: "nr18",                  label: "Cert. NR-18 (Canteiro de Obras)" },
  { key: "nr35",                  label: "Cert. NR-35 (Trabalho em Altura)" },
  { key: "nr10",                  label: "Cert. NR-10 (Instalações Elétricas)" },
  { key: "nr33",                  label: "Cert. NR-33 (Espaço Confinado)" },
  { key: "nr06",                  label: "Cert. NR-06 (EPIs) / Integração SMS" },
] as const;

type DocKey = typeof DOCS[number]["key"];
type Checklist = Record<DocKey, boolean>;

const defaultChecklist = (): Checklist =>
  Object.fromEntries(DOCS.map(d => [d.key, false])) as Checklist;

type AdmStatus = "pendente" | "em_andamento" | "concluida" | "cancelada";

interface Admissao {
  id: string;
  colaborador_id: string;
  obra_id: string | null;
  data_admissao: string;
  checklist_documentos: Checklist | null;
  epis_entregues: boolean;
  treinamento_integracao_em: string | null;
  status: AdmStatus;
  observacoes: string | null;
  employees: { nome: string } | null;
  obras: { nome: string } | null;
}

interface AdmForm {
  colaborador_id: string;
  obra_id: string;
  data_admissao: string;
  checklist_documentos: Checklist;
  epis_entregues: boolean;
  treinamento_integracao_em: string;
  observacoes: string;
  documentos_urls: string[];
}

const statusLabel: Record<AdmStatus, string> = {
  pendente:    "Pendente",
  em_andamento:"Em Andamento",
  concluida:   "Concluída",
  cancelada:   "Cancelada",
};

const statusStyle: Record<AdmStatus, string> = {
  pendente:    "bg-slate-100 text-slate-600 dark:bg-slate-800",
  em_andamento:"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  concluida:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelada:   "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

function pctChecklist(c: Checklist | null): number {
  if (!c) return 0;
  const vals = Object.values(c);
  if (!vals.length) return 0;
  return Math.round((vals.filter(Boolean).length / vals.length) * 100);
}

function formDefault(): AdmForm {
  return {
    colaborador_id: "",
    obra_id: "",
    data_admissao: new Date().toISOString().split("T")[0],
    checklist_documentos: defaultChecklist(),
    epis_entregues: false,
    treinamento_integracao_em: "",
    observacoes: "",
    documentos_urls: [],
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsAdmissao() {
  const { toast } = useToast();
  const { obras } = useObras();
  const { employees } = useEmployees();

  const [admissoes, setAdmissoes] = useState<Admissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtroObra, setFiltroObra] = useState("all");
  const [filtroStatus, setFiltroStatus] = useState("all");

  // Modal criar / editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AdmForm>(formDefault());

  // Modal detalhe
  const [detalhe, setDetalhe] = useState<Admissao | null>(null);

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const concluidas  = admissoes.filter(a => a.status === "concluida").length;
  const pendentes   = admissoes.filter(a => a.status !== "concluida" && a.status !== "cancelada").length;
  const mesAtual    = new Date().getMonth();
  const doMes       = admissoes.filter(a => new Date(a.data_admissao).getMonth() === mesAtual).length;

  // ─── Fetch ───────────────────────────────────────────────────────────────
  const fetchAdmissoes = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("sms_admissoes")
      .select("id, colaborador_id, obra_id, data_admissao, checklist_documentos, epis_entregues, treinamento_integracao_em, status, observacoes, employees(nome), obras(nome)")
      .order("data_admissao", { ascending: false })
      .limit(300);
    if (filtroObra !== "all")   q = q.eq("obra_id", filtroObra);
    if (filtroStatus !== "all") q = q.eq("status", filtroStatus);
    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar admissões", variant: "destructive" });
    setAdmissoes((data ?? []) as Admissao[]);
    setLoading(false);
  }, [filtroObra, filtroStatus, toast]);

  useEffect(() => { fetchAdmissoes(); }, [fetchAdmissoes]);

  // ─── Salvar ──────────────────────────────────────────────────────────────
  async function handleSave(concluir = false) {
    if (!form.colaborador_id || !form.data_admissao) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      colaborador_id:            form.colaborador_id,
      obra_id:                   form.obra_id || null,
      data_admissao:             form.data_admissao,
      checklist_documentos:      form.checklist_documentos,
      epis_entregues:            form.epis_entregues,
      treinamento_integracao_em: form.treinamento_integracao_em || null,
      observacoes:               form.observacoes || null,
      documentos_urls:           form.documentos_urls,
      status:                    concluir ? "concluida" : (editId ? undefined : "em_andamento"),
    };

    let error;
    if (editId) {
      ({ error } = await (supabase as any).from("sms_admissoes").update(payload).eq("id", editId));
    } else {
      ({ error } = await (supabase as any).from("sms_admissoes").insert([{ ...payload, status: concluir ? "concluida" : "em_andamento" }]));
    }

    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: concluir ? "Admissão concluída!" : "Admissão salva!" });
    setModalOpen(false);
    setEditId(null);
    setForm(formDefault());
    fetchAdmissoes();
  }

  function openEditar(adm: Admissao) {
    setEditId(adm.id);
    setForm({
      colaborador_id:            adm.colaborador_id,
      obra_id:                   adm.obra_id ?? "",
      data_admissao:             adm.data_admissao,
      checklist_documentos:      adm.checklist_documentos ?? defaultChecklist(),
      epis_entregues:            adm.epis_entregues,
      treinamento_integracao_em: adm.treinamento_integracao_em ?? "",
      observacoes:               adm.observacoes ?? "",
      documentos_urls:           (adm as any).documentos_urls ?? [],
    });
    setModalOpen(true);
  }

  // ─── Filtro local ─────────────────────────────────────────────────────────
  const filtered = admissoes.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.employees?.nome?.toLowerCase().includes(q) ||
      a.obras?.nome?.toLowerCase().includes(q) ||
      false
    );
  });

  const docsConcluidosPct = pctChecklist(form.checklist_documentos);

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <UserCheck className="h-6 w-6 text-indigo-500" />
              Admissão Digital
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Checklist de integração, documentos e EPIs para novos colaboradores
            </p>
          </div>
          <Button onClick={() => { setEditId(null); setForm(formDefault()); setModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Admissão
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Este mês", value: doMes, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-900/10" },
            { label: "Concluídas", value: concluidas, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/10" },
            { label: "Em Andamento", value: pendentes, color: pendentes > 0 ? "text-amber-600" : "text-muted-foreground", bg: pendentes > 0 ? "bg-amber-50 dark:bg-amber-900/10" : "bg-muted/50" },
            { label: "Total", value: admissoes.length, color: "text-foreground", bg: "bg-muted/50" },
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
            <Input placeholder="Buscar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={fetchAdmissoes}><RefreshCw className="h-4 w-4" /></Button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Documentos</TableHead>
                  <TableHead className="text-center">EPIs</TableHead>
                  <TableHead className="text-center">Integração</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <UserCheck className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">Nenhuma admissão encontrada</p>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.map(a => {
                  const pct = pctChecklist(a.checklist_documentos);
                  return (
                    <TableRow key={a.id} className="hover:bg-muted/30">
                      <TableCell>
                        <p className="text-sm font-medium">{a.employees?.nome ?? "–"}</p>
                        {null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.obras?.nome ?? "–"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(a.data_admissao + "T12:00:00").toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className={cn("text-xs font-semibold tabular-nums", pct === 100 ? "text-green-600" : pct >= 60 ? "text-amber-600" : "text-red-600")}>
                            {pct}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {a.epis_entregues
                          ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />}
                      </TableCell>
                      <TableCell className="text-center">
                        {a.treinamento_integracao_em
                          ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          : <span className="text-xs text-muted-foreground">–</span>}
                      </TableCell>
                      <TableCell>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusStyle[a.status])}>
                          {statusLabel[a.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openEditar(a)}>
                          Editar <ChevronRight className="h-3.5 w-3.5" />
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
              {filtered.length} admissão{filtered.length !== 1 ? "ões" : ""}
            </div>
          )}
        </div>
      </div>

      {/* ─── Modal ──────────────────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={v => { if (!v) { setModalOpen(false); setEditId(null); setForm(formDefault()); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-indigo-500" />
              {editId ? "Atualizar Admissão" : "Nova Admissão Digital"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">

            {/* Dados básicos */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Colaborador <span className="text-red-500">*</span></Label>
                <Select value={form.colaborador_id} onValueChange={v => setForm(f => ({ ...f, colaborador_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-56">
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Obra</Label>
                <Select value={form.obra_id} onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data de Admissão <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.data_admissao} onChange={e => setForm(f => ({ ...f, data_admissao: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Integração SMS realizada em</Label>
                <Input type="date" value={form.treinamento_integracao_em} onChange={e => setForm(f => ({ ...f, treinamento_integracao_em: e.target.value }))} />
              </div>
            </div>

            {/* EPIs */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
              <Switch
                checked={form.epis_entregues}
                onCheckedChange={v => setForm(f => ({ ...f, epis_entregues: v }))}
              />
              <div>
                <p className="text-sm font-medium">EPIs entregues</p>
                <p className="text-xs text-muted-foreground">Confirma que todos os EPIs foram entregues e assinados</p>
              </div>
              {form.epis_entregues && <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto" />}
            </div>

            {/* Checklist de documentos */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <FileCheck className="h-4 w-4 text-indigo-500" /> Checklist de Documentos
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Marque os documentos recebidos e validados</p>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={docsConcluidosPct} className="w-20 h-1.5" />
                  <span className={cn("text-xs font-bold", docsConcluidosPct === 100 ? "text-green-600" : "text-amber-600")}>
                    {docsConcluidosPct}%
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DOCS.map(doc => (
                  <label key={doc.key} className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors",
                    form.checklist_documentos[doc.key]
                      ? "border-green-200 bg-green-50/50 dark:bg-green-900/10 dark:border-green-800"
                      : "border-border/50 hover:bg-muted/40"
                  )}>
                    <Checkbox
                      checked={!!form.checklist_documentos[doc.key]}
                      onCheckedChange={checked => setForm(f => ({
                        ...f,
                        checklist_documentos: { ...f.checklist_documentos, [doc.key]: !!checked },
                      }))}
                    />
                    <span className="text-sm">{doc.label}</span>
                    {form.checklist_documentos[doc.key] && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto flex-shrink-0" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Atalho marcar todos */}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5 h-7"
              onClick={() => setForm(f => ({
                ...f,
                checklist_documentos: Object.fromEntries(DOCS.map(d => [d.key, true])) as Checklist,
              }))}
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Marcar todos como recebidos
            </Button>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea placeholder="Pendências, observações sobre a admissão..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>

            {/* Documentos em anexo */}
            <div className="space-y-1.5 border-t border-border/40 pt-4">
              <Label className="text-sm font-semibold">Documentos em Anexo</Label>
              <p className="text-xs text-muted-foreground">
                Digitalize e anexe cópias dos documentos recebidos (RG, CPF, ASO, contratos, certificados…)
              </p>
              <DocumentoUploader
                folder="admissao"
                urls={form.documentos_urls}
                onChange={documentos_urls => setForm(f => ({ ...f, documentos_urls }))}
                maxFiles={20}
              />
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 border-t border-border/40 pt-3">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Salvando..." : "Concluir Admissão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

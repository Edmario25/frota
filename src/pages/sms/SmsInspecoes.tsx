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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ClipboardList, Plus, Search, RefreshCw, CheckCircle2,
  XCircle, MinusCircle, AlertOctagon, ChevronRight,
} from "lucide-react";
import { useObras } from "@/hooks/useObras";

// ─── Types ──────────────────────────────────────────────────────────────────
interface InspecaoCatalogo {
  id: string;
  titulo: string;
  tipo: string | null;
  periodicidade: string | null;
}

interface InspecaoItem {
  id: string;
  ordem: number;
  descricao: string;
  categoria: string | null;
  obrigatorio: boolean;
}

interface RespItem {
  item_id: string;
  conforme: "sim" | "nao" | "na" | null;
  observacao: string;
}

interface Inspecao {
  id: string;
  catalogo_id: string | null;
  obra_id: string | null;
  realizada_por: string;
  data_inspecao: string;
  status: "pendente" | "em_andamento" | "concluida" | "cancelada";
  observacoes_gerais: string | null;
  obras: { nome: string } | null;
  sms_inspecoes_catalogo: { titulo: string } | null;
  ferramenta_id: string | null;
  ferramentas_catalogo: { nome: string; codigo_patrimonio: string | null } | null;
  total_itens?: number;
  itens_conformes?: number;
}

interface CriarForm {
  catalogo_id: string;
  obra_id: string;
  realizada_por: string;
  data_inspecao: string;
  observacoes_gerais: string;
  ferramenta_id: string;
}

interface EquipamentoInspecao { id: string; nome: string; codigo_patrimonio: string | null; cert_status: string }

const criarDefault: CriarForm = {
  catalogo_id: "",
  obra_id: "",
  realizada_por: "",
  data_inspecao: new Date().toISOString().split("T")[0],
  observacoes_gerais: "",
  ferramenta_id: "",
};

const statusLabel: Record<string, string> = {
  pendente:    "Pendente",
  em_andamento:"Em Andamento",
  concluida:   "Concluída",
  cancelada:   "Cancelada",
};

const statusStyle: Record<string, string> = {
  pendente:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  em_andamento:"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  concluida:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelada:   "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsInspecoes() {
  const { toast } = useToast();
  const { obras } = useObras();

  const [inspecoes, setInspecoes] = useState<Inspecao[]>([]);
  const [catalogos, setCatalogos] = useState<InspecaoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtroObra, setFiltroObra] = useState("all");
  const [filtroStatus, setFiltroStatus] = useState("all");

  // Modal criar
  const [criarOpen, setCriarOpen] = useState(false);
  const [criarForm, setCriarForm] = useState<CriarForm>(criarDefault);
  const [equipamentos, setEquipamentos] = useState<EquipamentoInspecao[]>([]);

  // Modal preencher itens
  const [preencherInsp, setPreencherInsp] = useState<Inspecao | null>(null);
  const [itens, setItens] = useState<InspecaoItem[]>([]);
  const [respostas, setRespostas] = useState<Record<string, RespItem>>({});
  const [preencherSaving, setPreencherSaving] = useState(false);
  const [gerandoDesvio, setGerandoDesvio] = useState<string | null>(null); // item_id

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const concluidas  = inspecoes.filter(i => i.status === "concluida").length;
  const pendentes   = inspecoes.filter(i => i.status === "pendente" || i.status === "em_andamento").length;
  const mesAtual    = new Date().getMonth();
  const doMes       = inspecoes.filter(i => new Date(i.data_inspecao).getMonth() === mesAtual).length;

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchInspecoes = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("sms_inspecoes")
      .select("id, catalogo_id, obra_id, ferramenta_id, realizada_por, data_inspecao, status, observacoes_gerais, obras(nome), sms_inspecoes_catalogo(titulo), ferramentas_catalogo(nome,codigo_patrimonio)")
      .order("data_inspecao", { ascending: false })
      .limit(200);

    if (filtroObra !== "all")   q = q.eq("obra_id", filtroObra);
    if (filtroStatus !== "all") q = q.eq("status", filtroStatus);

    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar inspeções", variant: "destructive" });

    // Buscar contagens de respostas por inspeção
    const ids = (data ?? []).map((i: any) => i.id);
    const totalMap: Record<string, number> = {};
    const conformeMap: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: rData } = await (supabase as any)
        .from("sms_inspecoes_respostas")
        .select("inspecao_id, conforme")
        .in("inspecao_id", ids);
      (rData ?? []).forEach((r: any) => {
        totalMap[r.inspecao_id] = (totalMap[r.inspecao_id] ?? 0) + 1;
        if (r.conforme === true) conformeMap[r.inspecao_id] = (conformeMap[r.inspecao_id] ?? 0) + 1;
      });
    }

    setInspecoes((data ?? []).map((i: any) => ({
      ...i,
      total_itens:    totalMap[i.id] ?? 0,
      itens_conformes: conformeMap[i.id] ?? 0,
    })));
    setLoading(false);
  }, [filtroObra, filtroStatus, toast]);

  const fetchCatalogos = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("sms_inspecoes_catalogo")
      .select("id, titulo, tipo, periodicidade")
      .eq("ativo", true)
      .order("titulo");
    setCatalogos((data ?? []) as InspecaoCatalogo[]);
  }, []);

  useEffect(() => { fetchInspecoes(); }, [fetchInspecoes]);
  useEffect(() => { fetchCatalogos(); }, [fetchCatalogos]);

  async function fetchEquipamentos(obraId: string) {
    if (!obraId) { setEquipamentos([]); return; }
    const { data } = await (supabase as any).from("v_ferramentas_situacao")
      .select("id,nome,codigo_patrimonio,cert_status").eq("obra_atual_id", obraId).order("nome");
    setEquipamentos((data ?? []) as EquipamentoInspecao[]);
  }

  // ─── Criar inspeção ───────────────────────────────────────────────────────
  async function handleCriar() {
    if (!criarForm.realizada_por || !criarForm.data_inspecao) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("sms_inspecoes").insert([{
      catalogo_id:       criarForm.catalogo_id || null,
      obra_id:           criarForm.obra_id || null,
      realizada_por:     criarForm.realizada_por,
      data_inspecao:     criarForm.data_inspecao,
      status:            "pendente",
      observacoes_gerais: criarForm.observacoes_gerais || null,
      ferramenta_id:     criarForm.ferramenta_id || null,
    }]);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar inspeção", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Inspeção criada! Preencha os itens." });
    setCriarOpen(false);
    setCriarForm(criarDefault);
    fetchInspecoes();
  }

  // ─── Abrir preenchimento ──────────────────────────────────────────────────
  async function openPreencher(insp: Inspecao) {
    setPreencherInsp(insp);
    setGerandoDesvio(null);

    // Buscar itens do catálogo
    if (insp.catalogo_id) {
      const { data } = await (supabase as any)
        .from("sms_inspecoes_itens_catalogo")
        .select("id, ordem, descricao, categoria, obrigatorio")
        .eq("inspecao_catalogo_id", insp.catalogo_id)
        .order("ordem");
      setItens((data ?? []) as InspecaoItem[]);
    } else {
      setItens([]);
    }

    // Buscar respostas já salvas
    const { data: respData } = await (supabase as any)
      .from("sms_inspecoes_respostas")
      .select("item_catalogo_id, conforme, observacao")
      .eq("inspecao_id", insp.id);

    const respMap: Record<string, RespItem> = {};
    (respData ?? []).forEach((r: any) => {
      respMap[r.item_catalogo_id] = {
        item_id:    r.item_catalogo_id,
        conforme:   r.conforme === true ? "sim" : r.conforme === false ? "nao" : "na",
        observacao: r.observacao ?? "",
      };
    });
    setRespostas(respMap);
  }

  function setResp(itemId: string, field: keyof RespItem, value: string) {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { item_id: itemId, conforme: null, observacao: "" }), [field]: value },
    }));
  }

  // ─── Salvar respostas ─────────────────────────────────────────────────────
  async function handleSalvarRespostas(concluir = false) {
    if (!preencherInsp) return;
    setPreencherSaving(true);

    // Deleta respostas antigas e reinsere
    await (supabase as any).from("sms_inspecoes_respostas").delete().eq("inspecao_id", preencherInsp.id);

    const rows = itens.map(item => {
      const r = respostas[item.id];
      return {
        inspecao_id:     preencherInsp.id,
        item_catalogo_id: item.id,
        conforme:        r?.conforme === "sim" ? true : r?.conforme === "nao" ? false : null,
        observacao:      r?.observacao || null,
      };
    }).filter(r => r.conforme !== null);

    if (rows.length > 0) {
      await (supabase as any).from("sms_inspecoes_respostas").insert(rows);
    }

    if (concluir) {
      await (supabase as any)
        .from("sms_inspecoes")
        .update({ status: "concluida" })
        .eq("id", preencherInsp.id);
    } else {
      await (supabase as any)
        .from("sms_inspecoes")
        .update({ status: "em_andamento" })
        .eq("id", preencherInsp.id);
    }

    setPreencherSaving(false);
    toast({ title: concluir ? "Inspeção concluída!" : "Respostas salvas!" });
    if (concluir) setPreencherInsp(null);
    fetchInspecoes();
  }

  // ─── Gerar desvio de item não-conforme ───────────────────────────────────
  async function handleGerarDesvio(item: InspecaoItem) {
    if (!preencherInsp) return;
    setGerandoDesvio(item.id);
    const { error } = await (supabase as any).from("sms_desvios").insert([{
      obra_id:       preencherInsp.obra_id,
      tipo_desvio:   `Inspeção: ${item.descricao}`,
      descricao:     respostas[item.id]?.observacao || `Item não-conforme na inspeção "${preencherInsp.sms_inspecoes_catalogo?.titulo ?? ""}"`,
      local:         `Inspeção ${new Date(preencherInsp.data_inspecao + "T12:00:00").toLocaleDateString("pt-BR")}`,
      severidade:    "leve",
      status:        "aberto",
      data_ocorrencia: preencherInsp.data_inspecao,
    }]);
    setGerandoDesvio(null);
    if (error) {
      toast({ title: "Erro ao gerar desvio", variant: "destructive" });
      return;
    }
    toast({ title: "Desvio gerado automaticamente!" });
  }

  // ─── Filtro ───────────────────────────────────────────────────────────────
  const filtered = inspecoes.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.realizada_por.toLowerCase().includes(q) ||
      i.sms_inspecoes_catalogo?.titulo?.toLowerCase().includes(q) ||
      i.obras?.nome?.toLowerCase().includes(q)
    );
  });

  // Progresso de conformidade no modal
  const totalRespondidos = itens.filter(i => respostas[i.id]?.conforme).length;
  const totalConformes   = itens.filter(i => respostas[i.id]?.conforme === "sim").length;
  const naoConformes     = itens.filter(i => respostas[i.id]?.conforme === "nao");
  const pct = itens.length > 0 ? Math.round((totalConformes / itens.length) * 100) : 0;

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-blue-500" />
              Inspeções de Segurança
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Verificações periódicas com checklist e geração automática de desvios
            </p>
          </div>
          <Button onClick={() => { setCriarForm(criarDefault); setCriarOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Inspeção
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Este mês", value: doMes, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/10" },
            { label: "Concluídas", value: concluidas, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/10" },
            { label: "Pendentes", value: pendentes, color: pendentes > 0 ? "text-amber-600" : "text-muted-foreground", bg: pendentes > 0 ? "bg-amber-50 dark:bg-amber-900/10" : "bg-muted/50" },
            { label: "No catálogo", value: catalogos.length, color: "text-foreground", bg: "bg-muted/50" },
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
            <Input placeholder="Buscar inspeção, responsável..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={fetchInspecoes} title="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo / Título</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Conformidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <ClipboardList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">Nenhuma inspeção encontrada</p>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.map(i => {
                  const pctConf = i.total_itens! > 0 ? Math.round((i.itens_conformes! / i.total_itens!) * 100) : null;
                  return (
                    <TableRow key={i.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm whitespace-nowrap font-medium">
                        {new Date(i.data_inspecao + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px]">
                        <p className="font-medium truncate">{i.sms_inspecoes_catalogo?.titulo ?? "Inspeção avulsa"}</p>
                        {i.ferramentas_catalogo && <p className="text-xs text-muted-foreground truncate">{i.ferramentas_catalogo.nome}{i.ferramentas_catalogo.codigo_patrimonio ? ` · ${i.ferramentas_catalogo.codigo_patrimonio}` : ""}</p>}
                      </TableCell>
                      <TableCell className="text-sm">{i.realizada_por}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.obras?.nome ?? "–"}</TableCell>
                      <TableCell>
                        {pctConf !== null ? (
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <Progress value={pctConf} className="h-1.5 flex-1" />
                            <span className={cn("text-xs font-semibold tabular-nums", pctConf >= 80 ? "text-green-600" : pctConf >= 50 ? "text-amber-600" : "text-red-600")}>
                              {pctConf}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusStyle[i.status])}>
                          {statusLabel[i.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openPreencher(i)}>
                          {i.status === "concluida" ? "Ver" : "Preencher"}
                          <ChevronRight className="h-3.5 w-3.5" />
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
              {filtered.length} inspeção{filtered.length !== 1 ? "ões" : ""}
            </div>
          )}
        </div>
      </div>

      {/* ─── Modal Criar ──────────────────────────────────────────────────────── */}
      <Dialog open={criarOpen} onOpenChange={setCriarOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-500" /> Nova Inspeção
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tipo de Inspeção (catálogo)</Label>
              <Select value={criarForm.catalogo_id} onValueChange={v => setCriarForm(f => ({ ...f, catalogo_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione um tipo (opcional)" /></SelectTrigger>
                <SelectContent>
                  {catalogos.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.titulo} {c.periodicidade ? `· ${c.periodicidade}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Responsável <span className="text-red-500">*</span></Label>
                <Input placeholder="Nome do inspetor" value={criarForm.realizada_por} onChange={e => setCriarForm(f => ({ ...f, realizada_por: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data <span className="text-red-500">*</span></Label>
                <Input type="date" value={criarForm.data_inspecao} onChange={e => setCriarForm(f => ({ ...f, data_inspecao: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <Select value={criarForm.obra_id} onValueChange={v => { setCriarForm(f => ({ ...f, obra_id: v, ferramenta_id: "" })); fetchEquipamentos(v); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a obra (opcional)" /></SelectTrigger>
                <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ferramenta, equipamento ou máquina</Label>
              <Select value={criarForm.ferramenta_id} onValueChange={v => setCriarForm(f => ({ ...f, ferramenta_id: v }))} disabled={!criarForm.obra_id}>
                <SelectTrigger><SelectValue placeholder={criarForm.obra_id ? "Selecione o patrimônio inspecionado" : "Selecione primeiro a obra"} /></SelectTrigger>
                <SelectContent>{equipamentos.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}{e.codigo_patrimonio ? ` · ${e.codigo_patrimonio}` : ""}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Ao concluir, a próxima inspeção será calculada e itens não conformes serão bloqueados.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Observações gerais</Label>
              <Textarea placeholder="Condições, contexto..." value={criarForm.observacoes_gerais} onChange={e => setCriarForm(f => ({ ...f, observacoes_gerais: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCriarOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleCriar} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Criando..." : "Criar Inspeção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Preencher Itens ────────────────────────────────────────────── */}
      <Dialog open={!!preencherInsp} onOpenChange={v => { if (!v) setPreencherInsp(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-500" />
              {preencherInsp?.sms_inspecoes_catalogo?.titulo ?? "Inspeção avulsa"}
            </DialogTitle>
            {preencherInsp && (
              <p className="text-xs text-muted-foreground">
                {new Date(preencherInsp.data_inspecao + "T12:00:00").toLocaleDateString("pt-BR")} · {preencherInsp.realizada_por}
                {preencherInsp.obras?.nome ? ` · ${preencherInsp.obras.nome}` : ""}
              </p>
            )}
          </DialogHeader>

          {itens.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-10 text-center">
              <div>
                <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Nenhum item no catálogo</p>
                <p className="text-xs text-muted-foreground mt-1">Este tipo de inspeção não tem itens configurados</p>
              </div>
            </div>
          )}

          {itens.length > 0 && (
            <>
              {/* Barra de progresso */}
              <div className="flex items-center gap-3 px-1 flex-shrink-0">
                <Progress value={pct} className="flex-1 h-2" />
                <span className="text-sm font-bold tabular-nums w-12 text-right">{totalRespondidos}/{itens.length}</span>
                {naoConformes.length > 0 && (
                  <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> {naoConformes.length} N/C
                  </span>
                )}
              </div>

              {/* Lista de itens */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {itens.map((item, idx) => {
                  const resp = respostas[item.id];
                  const isNaoConf = resp?.conforme === "nao";
                  return (
                    <div key={item.id} className={cn(
                      "rounded-lg border p-3 transition-colors",
                      isNaoConf ? "border-red-200 bg-red-50/40 dark:bg-red-900/5 dark:border-red-800" :
                      resp?.conforme === "sim" ? "border-green-200 bg-green-50/40 dark:bg-green-900/5 dark:border-green-800" :
                      "border-border/50 bg-background"
                    )}>
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-5 flex-shrink-0 mt-0.5">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {item.descricao}
                            {item.obrigatorio && <span className="ml-1 text-red-500 text-xs">*</span>}
                          </p>
                          {item.categoria && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.categoria}</p>
                          )}

                          {/* Resposta */}
                          <RadioGroup
                            value={resp?.conforme ?? ""}
                            onValueChange={v => setResp(item.id, "conforme", v)}
                            className="flex gap-4 mt-2"
                          >
                            {[
                              { value: "sim", label: "Conforme", icon: CheckCircle2, color: "text-green-600" },
                              { value: "nao", label: "Não-Conf.", icon: XCircle, color: "text-red-600" },
                              { value: "na",  label: "N/A", icon: MinusCircle, color: "text-muted-foreground" },
                            ].map(opt => (
                              <div key={opt.value} className="flex items-center gap-1.5">
                                <RadioGroupItem value={opt.value} id={`${item.id}-${opt.value}`} />
                                <label
                                  htmlFor={`${item.id}-${opt.value}`}
                                  className={cn("text-xs font-medium flex items-center gap-1 cursor-pointer", opt.color)}
                                >
                                  <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                                </label>
                              </div>
                            ))}
                          </RadioGroup>

                          {/* Observação e gerar desvio */}
                          {isNaoConf && (
                            <div className="mt-2 space-y-2">
                              <Input
                                placeholder="Descreva a não-conformidade..."
                                value={resp?.observacao ?? ""}
                                onChange={e => setResp(item.id, "observacao", e.target.value)}
                                className="text-xs h-8"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1.5 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                                onClick={() => handleGerarDesvio(item)}
                                disabled={gerandoDesvio === item.id}
                              >
                                {gerandoDesvio === item.id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <AlertOctagon className="h-3 w-3" />
                                )}
                                Gerar Desvio
                              </Button>
                            </div>
                          )}
                          {resp?.conforme === "sim" && resp.observacao === "" ? null : resp?.conforme === "sim" && (
                            <Input placeholder="Observação (opcional)..." value={resp?.observacao ?? ""} onChange={e => setResp(item.id, "observacao", e.target.value)} className="text-xs h-8 mt-2" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <DialogFooter className="flex-shrink-0 border-t border-border/40 pt-3">
            <Button variant="outline" onClick={() => setPreencherInsp(null)} disabled={preencherSaving}>Fechar</Button>
            {itens.length > 0 && (
              <>
                <Button variant="outline" onClick={() => handleSalvarRespostas(false)} disabled={preencherSaving} className="gap-2">
                  {preencherSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Salvar Rascunho
                </Button>
                <Button onClick={() => handleSalvarRespostas(true)} disabled={preencherSaving} className="gap-2">
                  {preencherSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Concluir
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

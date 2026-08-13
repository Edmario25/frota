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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  AlertOctagon, Plus, Search, Filter, RefreshCw,
  ChevronDown, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useObras } from "@/hooks/useObras";
import { FotoUploader } from "@/components/sms/FotoUploader";

// ─── Types ──────────────────────────────────────────────────────────────────
type Severidade = "leve" | "moderado" | "grave" | "critico";
type Status = "aberto" | "em_tratamento" | "fechado" | "cancelado";

interface Desvio {
  id: string;
  obra_id: string | null;
  tipo_desvio: string;
  descricao: string;
  local: string;
  severidade: Severidade;
  status: Status;
  data_ocorrencia: string;
  prazo_tratamento: string | null;
  created_at: string;
  obras: { nome: string } | null;
  employees: { nome: string } | null;
}

interface DesvioForm {
  obra_id: string;
  tipo_desvio: string;
  descricao: string;
  local: string;
  severidade: Severidade;
  data_ocorrencia: string;
  prazo_tratamento: string;
  fotos: string[];
}

// ─── Badge helpers ───────────────────────────────────────────────────────────
const sevVariant: Record<Severidade, string> = {
  leve:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  moderado: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  grave:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  critico:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const statusVariant: Record<Status, string> = {
  aberto:        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  em_tratamento: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  fechado:       "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  cancelado:     "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400",
};

const statusLabel: Record<Status, string> = {
  aberto:        "Aberto",
  em_tratamento: "Em Tratamento",
  fechado:       "Fechado",
  cancelado:     "Cancelado",
};

const formDefault: DesvioForm = {
  obra_id: "",
  tipo_desvio: "",
  descricao: "",
  local: "",
  severidade: "leve",
  data_ocorrencia: new Date().toISOString().split("T")[0],
  prazo_tratamento: "",
  fotos: [],
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsDesvios() {
  const { toast } = useToast();
  const { obras } = useObras();

  const [desvios, setDesvios] = useState<Desvio[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filtros
  const [search, setSearch] = useState("");
  const [filtroObra, setFiltroObra] = useState("all");
  const [filtroStatus, setFiltroStatus] = useState("all");
  const [filtroSev, setFiltroSev] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<DesvioForm>(formDefault);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchDesvios = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("sms_desvios")
      .select("id, obra_id, tipo_desvio, descricao, local, severidade, status, data_ocorrencia, prazo_tratamento, created_at, obras(nome), employees(nome)")
      .order("data_ocorrencia", { ascending: false })
      .limit(200);

    if (filtroObra !== "all")   q = q.eq("obra_id", filtroObra);
    if (filtroStatus !== "all") q = q.eq("status", filtroStatus);
    if (filtroSev !== "all")    q = q.eq("severidade", filtroSev);

    const { data, error } = await q;
    if (error) { toast({ title: "Erro ao carregar desvios", variant: "destructive" }); }
    setDesvios((data ?? []) as Desvio[]);
    setLoading(false);
  }, [filtroObra, filtroStatus, filtroSev, toast]);

  useEffect(() => { fetchDesvios(); }, [fetchDesvios]);

  // ─── Salvar ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.tipo_desvio || !form.descricao || !form.local) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("sms_desvios").insert([{
      obra_id: form.obra_id || null,
      tipo_desvio: form.tipo_desvio,
      descricao: form.descricao,
      local: form.local,
      severidade: form.severidade,
      data_ocorrencia: form.data_ocorrencia,
      prazo_tratamento: form.prazo_tratamento || null,
      status: "aberto",
      fotos: form.fotos,
    }]);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao registrar desvio", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Desvio registrado com sucesso!" });
    setModalOpen(false);
    setForm(formDefault);
    fetchDesvios();
  }

  // ─── Mudar status ─────────────────────────────────────────────────────────
  async function handleStatusChange(id: string, novoStatus: Status) {
    const { error } = await (supabase as any)
      .from("sms_desvios")
      .update({ status: novoStatus })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
      return;
    }
    setDesvios(prev => prev.map(d => d.id === id ? { ...d, status: novoStatus } : d));
  }

  // ─── Filtro local (search) ────────────────────────────────────────────────
  const filtered = desvios.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.tipo_desvio.toLowerCase().includes(q) ||
      d.local.toLowerCase().includes(q) ||
      d.obras?.nome?.toLowerCase().includes(q) ||
      d.descricao.toLowerCase().includes(q)
    );
  });

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <AlertOctagon className="h-6 w-6 text-orange-500" />
              Desvios / Não-Conformidades
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Registro, acompanhamento e tratamento de desvios de segurança
            </p>
          </div>
          <Button onClick={() => { setForm(formDefault); setModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Registrar Desvio
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar desvio..."
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
              {obras.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="em_tratamento">Em Tratamento</SelectItem>
              <SelectItem value="fechado">Fechado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtroSev} onValueChange={setFiltroSev}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Severidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="leve">Leve</SelectItem>
              <SelectItem value="moderado">Moderado</SelectItem>
              <SelectItem value="grave">Grave</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" onClick={fetchDesvios} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo / Descrição</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">Nenhum desvio encontrado</p>
                      <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou registre um novo desvio</p>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.map(d => (
                  <TableRow key={d.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(d.data_ocorrencia + "T12:00:00").toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-sm font-medium text-foreground truncate">{d.tipo_desvio}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.descricao}</p>
                    </TableCell>
                    <TableCell className="text-sm">{d.local}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.obras?.nome ?? "–"}</TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize", sevVariant[d.severidade])}>
                        {d.severidade}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusVariant[d.status])}>
                        {statusLabel[d.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {d.prazo_tratamento
                        ? new Date(d.prazo_tratamento + "T12:00:00").toLocaleDateString("pt-BR")
                        : "–"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={d.status}
                        onValueChange={v => handleStatusChange(d.id, v as Status)}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aberto">Aberto</SelectItem>
                          <SelectItem value="em_tratamento">Em Tratamento</SelectItem>
                          <SelectItem value="fechado">Fechado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
              {filtered.length} desvio{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Modal Registrar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-orange-500" />
              Registrar Desvio
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Obra */}
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <Select value={form.obra_id} onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a obra (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {obras.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <Label>Tipo de Desvio <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ex: Uso inadequado de EPI, Ordem e limpeza..."
                value={form.tipo_desvio}
                onChange={e => setForm(f => ({ ...f, tipo_desvio: e.target.value }))}
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label>Descrição <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Descreva o desvio observado..."
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Local */}
            <div className="space-y-1.5">
              <Label>Local <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Local exato onde ocorreu o desvio"
                value={form.local}
                onChange={e => setForm(f => ({ ...f, local: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Severidade */}
              <div className="space-y-1.5">
                <Label>Severidade</Label>
                <Select value={form.severidade} onValueChange={v => setForm(f => ({ ...f, severidade: v as Severidade }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leve">Leve</SelectItem>
                    <SelectItem value="moderado">Moderado</SelectItem>
                    <SelectItem value="grave">Grave</SelectItem>
                    <SelectItem value="critico">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Data ocorrência */}
              <div className="space-y-1.5">
                <Label>Data da Ocorrência</Label>
                <Input
                  type="date"
                  value={form.data_ocorrencia}
                  onChange={e => setForm(f => ({ ...f, data_ocorrencia: e.target.value }))}
                />
              </div>
            </div>

            {/* Prazo */}
            <div className="space-y-1.5">
              <Label>Prazo para Tratamento</Label>
              <Input
                type="date"
                value={form.prazo_tratamento}
                onChange={e => setForm(f => ({ ...f, prazo_tratamento: e.target.value }))}
              />
            </div>

            {/* Fotos / evidências */}
            <div className="space-y-1.5">
              <Label>Evidências fotográficas</Label>
              <FotoUploader
                folder="desvios"
                urls={form.fotos}
                onChange={fotos => setForm(f => ({ ...f, fotos }))}
                maxFiles={8}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

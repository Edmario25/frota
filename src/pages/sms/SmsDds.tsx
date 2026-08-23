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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  BookOpen, Plus, Search, RefreshCw, Users, Clock, ChevronRight, CheckCircle2,
} from "lucide-react";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";
import { FotoUploader } from "@/components/sms/FotoUploader";

// ─── Types ──────────────────────────────────────────────────────────────────
interface DdsTema {
  id: string;
  titulo: string;
  descricao: string | null;
  nr_relacionada: string | null;
}

interface DdsSessao {
  id: string;
  obra_id: string | null;
  tema_id: string | null;
  data_sessao: string;
  condutor: string;
  duracao_min: number | null;
  observacoes: string | null;
  total_presentes?: number;
  obras: { nome: string } | null;
  sms_dds_temas: { titulo: string } | null;
}

interface SessaoForm {
  obra_id: string;
  tema_id: string;
  data_sessao: string;
  condutor: string;
  duracao_min: string;
  observacoes: string;
  fotos: string[];
}

const formDefault: SessaoForm = {
  obra_id: "",
  tema_id: "",
  data_sessao: new Date().toISOString().split("T")[0],
  condutor: "",
  duracao_min: "15",
  observacoes: "",
  fotos: [],
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsDds() {
  const { toast } = useToast();
  const { obras } = useObras();
  const { employees } = useEmployees();

  const [sessoes, setSessoes] = useState<DdsSessao[]>([]);
  const [temas, setTemas] = useState<DdsTema[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtroObra, setFiltroObra] = useState("all");

  // Modal registrar sessão
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SessaoForm>(formDefault);

  // Modal presenças
  const [presencaModal, setPresencaModal] = useState<DdsSessao | null>(null);
  const [presencaChecked, setPresencaChecked] = useState<Set<string>>(new Set());
  const [presencaSaving, setPresencaSaving] = useState(false);
  const [presencaSearch, setPresencaSearch] = useState("");

  // ─── KPIs do mês ──────────────────────────────────────────────────────────
  const hoje = new Date();
  const mesAtual = sessoes.filter(s => {
    const d = new Date(s.data_sessao);
    return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
  });

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchSessoes = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("sms_dds_sessoes")
      .select("id, obra_id, tema_id, data_sessao, condutor, duracao_min, observacoes, obras(nome), sms_dds_temas(titulo)")
      .order("data_sessao", { ascending: false })
      .limit(200);

    if (filtroObra !== "all") q = q.eq("obra_id", filtroObra);

    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar DDS", variant: "destructive" });

    // Buscar contagem de presentes por sessão
    const sessaoIds = (data ?? []).map((s: any) => s.id);
    const presencaCounts: Record<string, number> = {};
    if (sessaoIds.length > 0) {
      const { data: pData } = await (supabase as any)
        .from("sms_dds_presencas")
        .select("sessao_id")
        .in("sessao_id", sessaoIds)
        .eq("presente", true);
      (pData ?? []).forEach((p: any) => {
        presencaCounts[p.sessao_id] = (presencaCounts[p.sessao_id] ?? 0) + 1;
      });
    }

    setSessoes((data ?? []).map((s: any) => ({
      ...s,
      total_presentes: presencaCounts[s.id] ?? 0,
    })) as DdsSessao[]);
    setLoading(false);
  }, [filtroObra, toast]);

  const fetchTemas = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("sms_dds_temas")
      .select("id, titulo, descricao, nr_relacionada")
      .eq("ativo", true)
      .order("titulo");
    setTemas((data ?? []) as DdsTema[]);
  }, []);

  useEffect(() => { fetchSessoes(); }, [fetchSessoes]);
  useEffect(() => { fetchTemas(); }, [fetchTemas]);

  // ─── Salvar sessão ────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.condutor || !form.data_sessao) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("sms_dds_sessoes").insert([{
      obra_id:    form.obra_id || null,
      tema_id:    form.tema_id || null,
      data_sessao: form.data_sessao,
      condutor:   form.condutor,
      duracao_min: form.duracao_min ? parseInt(form.duracao_min) : null,
      observacoes: form.observacoes || null,
      fotos:      form.fotos,
    }]);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao registrar DDS", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "DDS registrado com sucesso!" });
    setModalOpen(false);
    setForm(formDefault);
    fetchSessoes();
  }

  // ─── Abrir modal de presenças ──────────────────────────────────────────────
  async function openPresencas(sessao: DdsSessao) {
    setPresencaModal(sessao);
    setPresencaSearch("");
    // Buscar presenças já registradas
    const { data } = await (supabase as any)
      .from("sms_dds_presencas")
      .select("colaborador_id, presente")
      .eq("sessao_id", sessao.id);
    const checked = new Set<string>();
    (data ?? []).forEach((p: any) => {
      if (p.presente) checked.add(p.colaborador_id);
    });
    setPresencaChecked(checked);
  }

  // ─── Salvar presenças ─────────────────────────────────────────────────────
  async function handleSavePresencas() {
    if (!presencaModal) return;
    setPresencaSaving(true);

    // Deleta as presentes já existentes e reinsere
    await (supabase as any)
      .from("sms_dds_presencas")
      .delete()
      .eq("sessao_id", presencaModal.id);

    if (presencaChecked.size > 0) {
      const rows = Array.from(presencaChecked).map(colaborador_id => ({
        sessao_id: presencaModal.id,
        colaborador_id,
        presente: true,
      }));
      const { error } = await (supabase as any).from("sms_dds_presencas").insert(rows);
      if (error) {
        toast({ title: "Erro ao salvar presenças", description: error.message, variant: "destructive" });
        setPresencaSaving(false);
        return;
      }
    }

    toast({ title: `${presencaChecked.size} presença(s) salva(s)!` });
    setPresencaSaving(false);
    setPresencaModal(null);
    fetchSessoes();
  }

  // ─── Filtro local ─────────────────────────────────────────────────────────
  const filtered = sessoes.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.condutor.toLowerCase().includes(q) ||
      s.sms_dds_temas?.titulo?.toLowerCase().includes(q) ||
      s.obras?.nome?.toLowerCase().includes(q)
    );
  });

  // Employees filtrados para busca na lista de presença
  const empFiltrados = employees.filter(e => {
    if (!presencaSearch) return true;
    return e.nome.toLowerCase().includes(presencaSearch.toLowerCase());
  });

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-teal-500" />
              DDS — Diálogo Diário de Segurança
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Registro de sessões e controle de presença por obra
            </p>
          </div>
          <Button onClick={() => { setForm(formDefault); setModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Registrar DDS
          </Button>
        </div>

        {/* KPIs do mês */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "DDS este mês", value: mesAtual.length, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-900/10" },
            { label: "Total geral", value: sessoes.length, color: "text-foreground", bg: "bg-muted/50" },
            { label: "Obras cobertas", value: new Set(mesAtual.map(s => s.obra_id).filter(Boolean)).size, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/10" },
            { label: "Presenças (mês)", value: mesAtual.reduce((s, d) => s + (d.total_presentes ?? 0), 0), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/10" },
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
              placeholder="Buscar condutor, tema ou obra..."
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
          <Button variant="ghost" size="icon" onClick={fetchSessoes} title="Atualizar">
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
                  <TableHead>Tema</TableHead>
                  <TableHead>Condutor</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="text-center">Presentes</TableHead>
                  <TableHead className="text-right">Presenças</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <BookOpen className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">Nenhum DDS registrado</p>
                      <p className="text-xs text-muted-foreground mt-1">Clique em "Registrar DDS" para começar</p>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.map(s => (
                  <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-sm font-medium whitespace-nowrap">
                      {new Date(s.data_sessao + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      <p className="font-medium truncate">{s.sms_dds_temas?.titulo ?? <span className="text-muted-foreground italic">Tema livre</span>}</p>
                    </TableCell>
                    <TableCell className="text-sm">{s.condutor}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.obras?.nome ?? "–"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.duracao_min ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {s.duracao_min} min
                        </span>
                      ) : "–"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                        (s.total_presentes ?? 0) > 0
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                      )}>
                        <Users className="h-3 w-3" />
                        {s.total_presentes ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => openPresencas(s)}
                      >
                        <Users className="h-3.5 w-3.5" />
                        Presenças
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
              {filtered.length} sessão{filtered.length !== 1 ? "ões" : ""}
            </div>
          )}
        </div>
      </div>

      {/* ─── Modal Registrar DDS ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-teal-500" />
              Registrar DDS
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={form.data_sessao}
                  onChange={e => setForm(f => ({ ...f, data_sessao: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duração (min)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="15"
                  value={form.duracao_min}
                  onChange={e => setForm(f => ({ ...f, duracao_min: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Condutor / Ministrante <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Nome do responsável pelo DDS"
                value={form.condutor}
                onChange={e => setForm(f => ({ ...f, condutor: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Obra</Label>
              <Select value={form.obra_id} onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a obra (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tema</Label>
              <Select value={form.tema_id} onValueChange={v => setForm(f => ({ ...f, tema_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um tema (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {temas.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.titulo} {t.nr_relacionada ? `(${t.nr_relacionada})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Anotações sobre o DDS realizado..."
                value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Fotos da sessão */}
            <div className="space-y-1.5">
              <Label>Fotos da Sessão</Label>
              <FotoUploader
                folder="dds"
                urls={form.fotos}
                onChange={fotos => setForm(f => ({ ...f, fotos }))}
                maxFiles={6}
                addLabel="Adicionar foto do DDS"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Presenças ─────────────────────────────────────────────────── */}
      <Dialog open={!!presencaModal} onOpenChange={v => { if (!v) setPresencaModal(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-teal-500" />
              Lista de Presença
            </DialogTitle>
            {presencaModal && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(presencaModal.data_sessao + "T12:00:00").toLocaleDateString("pt-BR")} ·{" "}
                {presencaModal.sms_dds_temas?.titulo ?? "Tema livre"} ·{" "}
                {presencaModal.condutor}
              </p>
            )}
          </DialogHeader>

          <div className="relative mb-2 flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar colaborador..."
              value={presencaSearch}
              onChange={e => setPresencaSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {empFiltrados.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum colaborador encontrado</p>
            )}
            {empFiltrados.map(emp => (
              <label
                key={emp.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={presencaChecked.has(emp.id)}
                  onCheckedChange={checked => {
                    setPresencaChecked(prev => {
                      const next = new Set(prev);
                      if (checked) next.add(emp.id);
                      else next.delete(emp.id);
                      return next;
                    });
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{emp.nome}</p>
                  {null}
                </div>
                {presencaChecked.has(emp.id) && (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                )}
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/40 flex-shrink-0">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{presencaChecked.size}</span> selecionado{presencaChecked.size !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPresencaModal(null)} disabled={presencaSaving}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSavePresencas} disabled={presencaSaving} className="gap-2">
                {presencaSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  FileText, Plus, Search, RefreshCw, Trash2,
  Sun, Cloud, CloudRain, CloudLightning, PartlyCloudyIcon,
  Users, Wrench, ClipboardList, AlertTriangle,
  CheckCircle2, BookOpen, FileWarning, AlertOctagon,
  MapPin, Calendar, Hash,
} from "lucide-react";
import { useObras } from "@/hooks/useObras";
import { FotoUploader } from "@/components/sms/FotoUploader";

// ─── Types ───────────────────────────────────────────────────────────────────
type Clima = "ensolarado" | "parcialmente_nublado" | "nublado" | "chuva_leve" | "chuva_forte";

interface MaoDeObraItem  { tipo: string; quantidade: string }
interface EquipItem      { descricao: string; quantidade: string }
interface AtividadeItem  { setor: string; descricao: string; percentual: string }

interface Rdo {
  id: string;
  obra_id: string | null;
  data_rdo: string;
  numero_relatorio: string | null;
  responsavel: string;
  clima_manha: Clima | null;
  clima_tarde: Clima | null;
  condicao_climatica: Clima | null;
  temperatura_c: number | null;
  chuva: boolean;
  efetivo_total: number;
  mao_de_obra: MaoDeObraItem[];
  equipamentos: EquipItem[];
  atividades: AtividadeItem[];
  ocorrencias: string | null;
  observacoes: string | null;
  dds_realizado: boolean;
  aprs_realizadas: number;
  inspecoes_realizadas: number;
  desvios_registrados: number;
  fotos: string[];
  obras: { nome: string; endereco?: string; cidade?: string; estado?: string } | null;
}

interface RdoForm {
  obra_id: string;
  data_rdo: string;
  numero_relatorio: string;
  responsavel: string;
  clima_manha: Clima;
  clima_tarde: Clima;
  temperatura_c: string;
  chuva: boolean;
  efetivo_total: string;
  mao_de_obra: MaoDeObraItem[];
  equipamentos: EquipItem[];
  atividades: AtividadeItem[];
  ocorrencias: string;
  observacoes: string;
  dds_realizado: boolean;
  aprs_realizadas: string;
  inspecoes_realizadas: string;
  desvios_registrados: string;
  fotos: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CLIMA_OPTIONS: { value: Clima; label: string; emoji: string }[] = [
  { value: "ensolarado",          label: "Ensolarado",          emoji: "☀️" },
  { value: "parcialmente_nublado",label: "Parcialmente Nublado",emoji: "⛅" },
  { value: "nublado",             label: "Nublado",             emoji: "☁️" },
  { value: "chuva_leve",          label: "Chuva Leve",          emoji: "🌦️" },
  { value: "chuva_forte",         label: "Chuva Forte",         emoji: "⛈️" },
];

const TIPOS_MOB = [
  "Pedreiros","Serventes","Carpinteiros","Ferreiros","Eletricistas",
  "Encanadores","Pintores","Operadores de Máquina","Motoristas",
  "Técnicos SMS","Engenheiros","Encarregados","Estagiários","Terceiros",
];

const SETORES_PADRAO = [
  "Fundação","Estrutura","Alvenaria","Revestimentos","Instalações Elétricas",
  "Instalações Hidráulicas","Cobertura","Acabamentos","Infraestrutura","Serviços Gerais",
];

const today = () => new Date().toISOString().split("T")[0];

const defaultForm = (): RdoForm => ({
  obra_id: "",
  data_rdo: today(),
  numero_relatorio: "",
  responsavel: "",
  clima_manha: "ensolarado",
  clima_tarde: "ensolarado",
  temperatura_c: "",
  chuva: false,
  efetivo_total: "",
  mao_de_obra: [],
  equipamentos: [],
  atividades: [],
  ocorrencias: "",
  observacoes: "",
  dds_realizado: false,
  aprs_realizadas: "0",
  inspecoes_realizadas: "0",
  desvios_registrados: "0",
  fotos: [],
});

// ─── Clima Picker ────────────────────────────────────────────────────────────
function ClimaPicker({ value, onChange }: { value: Clima; onChange: (v: Clima) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {CLIMA_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:border-primary/50",
          )}
        >
          <span>{opt.emoji}</span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className={cn("flex items-center gap-2 pb-2 border-b border-border/50", color)}>
      <Icon className="h-4 w-4" />
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsRdo() {
  const { toast } = useToast();
  const { obras } = useObras();

  const [rdos, setRdos] = useState<Rdo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RdoForm>(defaultForm());
  const [search, setSearch] = useState("");
  const [filtroObra, setFiltroObra] = useState("all");

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("sms_rdo")
      .select(`
        id, obra_id, data_rdo, numero_relatorio, responsavel,
        clima_manha, clima_tarde, condicao_climatica, temperatura_c, chuva,
        efetivo_total, mao_de_obra, equipamentos, atividades,
        ocorrencias, observacoes,
        dds_realizado, aprs_realizadas, inspecoes_realizadas, desvios_registrados,
        fotos,
        obras(nome, endereco, cidade, estado)
      `)
      .order("data_rdo", { ascending: false })
      .limit(100);

    if (filtroObra !== "all") q = q.eq("obra_id", filtroObra);

    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar RDOs", variant: "destructive" });
    setRdos((data ?? []) as Rdo[]);
    setLoading(false);
  }, [filtroObra, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Auto-number ─────────────────────────────────────────────────────────
  function autoNumero() {
    const seq = (rdos.length + 1).toString().padStart(3, "0");
    const obra = obras.find(o => o.id === form.obra_id);
    const prefix = obra?.codigo_interno ?? "RDO";
    return `${prefix}-${seq}`;
  }

  // ─── Open modal ───────────────────────────────────────────────────────────
  function openNew() {
    const f = defaultForm();
    setEditId(null);
    setForm(f);
    setModalOpen(true);
  }

  function openEdit(r: Rdo) {
    setEditId(r.id);
    setForm({
      obra_id:            r.obra_id ?? "",
      data_rdo:           r.data_rdo,
      numero_relatorio:   r.numero_relatorio ?? "",
      responsavel:        r.responsavel,
      clima_manha:        r.clima_manha ?? "ensolarado",
      clima_tarde:        r.clima_tarde ?? "ensolarado",
      temperatura_c:      r.temperatura_c?.toString() ?? "",
      chuva:              r.chuva,
      efetivo_total:      r.efetivo_total.toString(),
      mao_de_obra:        Array.isArray(r.mao_de_obra) ? r.mao_de_obra : [],
      equipamentos:       Array.isArray(r.equipamentos) ? r.equipamentos : [],
      atividades:         Array.isArray(r.atividades)   ? r.atividades   : [],
      ocorrencias:        r.ocorrencias  ?? "",
      observacoes:        r.observacoes  ?? "",
      dds_realizado:      r.dds_realizado,
      aprs_realizadas:    r.aprs_realizadas.toString(),
      inspecoes_realizadas: r.inspecoes_realizadas.toString(),
      desvios_registrados:  r.desvios_registrados.toString(),
      fotos:              r.fotos ?? [],
    });
    setModalOpen(true);
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.responsavel) {
      toast({ title: "Informe o responsável", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      obra_id:             form.obra_id || null,
      data_rdo:            form.data_rdo,
      numero_relatorio:    form.numero_relatorio || null,
      responsavel:         form.responsavel,
      clima_manha:         form.clima_manha,
      clima_tarde:         form.clima_tarde,
      condicao_climatica:  form.clima_manha, // backward compat
      temperatura_c:       form.temperatura_c ? parseInt(form.temperatura_c) : null,
      chuva:               form.chuva,
      efetivo_total:       parseInt(form.efetivo_total) || 0,
      mao_de_obra:         form.mao_de_obra.filter(m => m.tipo && m.quantidade),
      equipamentos:        form.equipamentos.filter(e => e.descricao),
      atividades:          form.atividades.filter(a => a.descricao),
      ocorrencias:         form.ocorrencias || null,
      observacoes:         form.observacoes || null,
      dds_realizado:       form.dds_realizado,
      aprs_realizadas:     parseInt(form.aprs_realizadas) || 0,
      inspecoes_realizadas:parseInt(form.inspecoes_realizadas) || 0,
      desvios_registrados: parseInt(form.desvios_registrados) || 0,
      fotos:               form.fotos,
    };

    const { error } = editId
      ? await (supabase as any).from("sms_rdo").update(payload).eq("id", editId)
      : await (supabase as any).from("sms_rdo").insert([payload]);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar RDO", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editId ? "RDO atualizado!" : "RDO registrado!" });
    setModalOpen(false);
    fetchData();
  }

  // ─── Helpers: dynamic lists ───────────────────────────────────────────────
  function addMob()   { setForm(f => ({ ...f, mao_de_obra: [...f.mao_de_obra, { tipo: "", quantidade: "" }] })); }
  function rmMob(i: number) { setForm(f => ({ ...f, mao_de_obra: f.mao_de_obra.filter((_, idx) => idx !== i) })); }
  function updateMob(i: number, k: keyof MaoDeObraItem, v: string) {
    setForm(f => { const arr = [...f.mao_de_obra]; arr[i] = { ...arr[i], [k]: v }; return { ...f, mao_de_obra: arr }; });
  }

  function addEquip()  { setForm(f => ({ ...f, equipamentos: [...f.equipamentos, { descricao: "", quantidade: "1" }] })); }
  function rmEquip(i: number) { setForm(f => ({ ...f, equipamentos: f.equipamentos.filter((_, idx) => idx !== i) })); }
  function updateEquip(i: number, k: keyof EquipItem, v: string) {
    setForm(f => { const arr = [...f.equipamentos]; arr[i] = { ...arr[i], [k]: v }; return { ...f, equipamentos: arr }; });
  }

  function addAtiv()  { setForm(f => ({ ...f, atividades: [...f.atividades, { setor: "", descricao: "", percentual: "" }] })); }
  function rmAtiv(i: number)  { setForm(f => ({ ...f, atividades: f.atividades.filter((_, idx) => idx !== i) })); }
  function updateAtiv(i: number, k: keyof AtividadeItem, v: string) {
    setForm(f => { const arr = [...f.atividades]; arr[i] = { ...arr[i], [k]: v }; return { ...f, atividades: arr }; });
  }

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const hoje   = today();
  const rdoHoje = rdos.filter(r => r.data_rdo === hoje).length;
  const efeitoHoje = rdos.filter(r => r.data_rdo === hoje).reduce((s, r) => s + r.efetivo_total, 0);
  const ddsHoje = rdos.filter(r => r.data_rdo === hoje && r.dds_realizado).length;

  // ─── Filtro ──────────────────────────────────────────────────────────────
  const obraMap = new Map(obras.map(o => [o.id, o]));
  const filtered = rdos.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.obras?.nome?.toLowerCase().includes(q) ||
      r.responsavel?.toLowerCase().includes(q) ||
      (r.numero_relatorio ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="rounded-xl border border-border/50 bg-gradient-to-r from-cyan-600/5 via-background to-background px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold text-cyan-600 uppercase tracking-widest mb-1">SMS / SSMA</p>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">RDO — Relatório Diário de Obra</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Registro completo das atividades, equipes e condições do dia</p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Novo RDO
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "RDOs Hoje",       value: rdoHoje,    color: "bg-cyan-500",    icon: FileText },
            { label: "Efetivo Hoje",    value: efeitoHoje, color: "bg-blue-500",    icon: Users },
            { label: "DDS Realizados",  value: ddsHoje,    color: "bg-teal-500",    icon: BookOpen },
          ].map(k => (
            <div key={k.label} className="rounded-xl border border-border/50 bg-card p-4 shadow-card flex items-center gap-4">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{k.label}</p>
                <p className="text-2xl font-extrabold">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters + table */}
        <div className="rounded-xl border border-border/50 bg-card shadow-card">
          <div className="p-4 border-b border-border/50 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Buscar por obra, responsável ou número…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>N° / Data</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Clima Manhã</TableHead>
                  <TableHead>Clima Tarde</TableHead>
                  <TableHead className="text-center">Efetivo</TableHead>
                  <TableHead className="text-center">Atividades</TableHead>
                  <TableHead className="text-center">SMS</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      Nenhum RDO encontrado
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell>
                      <p className="text-xs font-mono font-semibold text-primary">{r.numero_relatorio ?? "–"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.data_rdo + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{r.obras?.nome ?? "–"}</p>
                      {r.obras?.cidade && <p className="text-xs text-muted-foreground">{r.obras.cidade}</p>}
                    </TableCell>
                    <TableCell className="text-sm">{r.responsavel}</TableCell>
                    <TableCell className="text-sm">
                      {r.clima_manha ? CLIMA_OPTIONS.find(c => c.value === r.clima_manha)?.emoji : "–"}
                      {r.clima_manha ? " " + CLIMA_OPTIONS.find(c => c.value === r.clima_manha)?.label : ""}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.clima_tarde ? CLIMA_OPTIONS.find(c => c.value === r.clima_tarde)?.emoji : "–"}
                      {r.clima_tarde ? " " + CLIMA_OPTIONS.find(c => c.value === r.clima_tarde)?.label : ""}
                    </TableCell>
                    <TableCell className="text-center font-semibold">{r.efetivo_total}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {Array.isArray(r.atividades) ? r.atividades.length : 0}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2 text-xs">
                        {r.dds_realizado && <span title="DDS"><BookOpen className="h-3.5 w-3.5 text-teal-500" /></span>}
                        {r.aprs_realizadas > 0 && <span title="APRs" className="text-violet-600 font-semibold">{r.aprs_realizadas}A</span>}
                        {r.desvios_registrados > 0 && <span title="Desvios" className="text-orange-600 font-semibold">{r.desvios_registrados}D</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(r)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* ─── Modal ──────────────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-600" />
              {editId ? "Editar RDO" : "Novo Relatório Diário de Obra"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">

            {/* ─ 1. DADOS GERAIS ─ */}
            <div className="space-y-3">
              <SectionHeader icon={Hash} title="1 — Dados Gerais" color="text-cyan-700 dark:text-cyan-400" />

              <div className="grid grid-cols-2 gap-3">
                {/* Obra */}
                <div className="col-span-2 space-y-1.5">
                  <Label>Obra</Label>
                  <Select value={form.obra_id} onValueChange={v => {
                    const obra = obras.find(o => o.id === v);
                    setForm(f => ({
                      ...f,
                      obra_id: v,
                      numero_relatorio: f.numero_relatorio || (() => {
                        const seq = (rdos.length + 1).toString().padStart(3, "0");
                        return `${obra?.codigo_interno ?? "RDO"}-${seq}`;
                      })(),
                    }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                    <SelectContent>
                      {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Endereço auto-fill */}
                {form.obra_id && (() => {
                  const obra = obras.find(o => o.id === form.obra_id);
                  if (!obra?.endereco && !obra?.cidade) return null;
                  return (
                    <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{[obra.endereco, obra.cidade, obra.estado].filter(Boolean).join(", ")}</span>
                    </div>
                  );
                })()}

                {/* Data */}
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input type="date" value={form.data_rdo}
                    onChange={e => setForm(f => ({ ...f, data_rdo: e.target.value }))} />
                </div>

                {/* Número relatório */}
                <div className="space-y-1.5">
                  <Label>N° do Relatório</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="ex: RDO-001"
                      value={form.numero_relatorio}
                      onChange={e => setForm(f => ({ ...f, numero_relatorio: e.target.value }))}
                    />
                    <Button type="button" variant="outline" size="sm" className="px-3 text-xs whitespace-nowrap"
                      onClick={() => setForm(f => ({ ...f, numero_relatorio: autoNumero() }))}>
                      Auto
                    </Button>
                  </div>
                </div>

                {/* Responsável */}
                <div className="col-span-2 space-y-1.5">
                  <Label>Responsável pelo RDO *</Label>
                  <Input placeholder="Nome do engenheiro ou encarregado"
                    value={form.responsavel}
                    onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} />
                </div>
              </div>
            </div>

            <Separator />

            {/* ─ 2. CONDIÇÕES CLIMÁTICAS ─ */}
            <div className="space-y-3">
              <SectionHeader icon={Sun} title="2 — Condições Climáticas" color="text-amber-600 dark:text-amber-400" />

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Manhã</Label>
                  <ClimaPicker value={form.clima_manha} onChange={v => setForm(f => ({ ...f, clima_manha: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tarde</Label>
                  <ClimaPicker value={form.clima_tarde} onChange={v => setForm(f => ({ ...f, clima_tarde: v }))} />
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="space-y-1.5">
                    <Label>Temperatura (°C)</Label>
                    <Input type="number" className="w-28"
                      placeholder="ex: 28"
                      value={form.temperatura_c}
                      onChange={e => setForm(f => ({ ...f, temperatura_c: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch checked={form.chuva} onCheckedChange={v => setForm(f => ({ ...f, chuva: v }))} />
                    <Label>Houve chuva</Label>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* ─ 3. MÃO DE OBRA ─ */}
            <div className="space-y-3">
              <SectionHeader icon={Users} title="3 — Mão de Obra" color="text-blue-600 dark:text-blue-400" />

              <div className="flex items-center gap-3">
                <div className="space-y-1.5">
                  <Label>Total de Profissionais</Label>
                  <Input type="number" className="w-28" placeholder="0"
                    value={form.efetivo_total}
                    onChange={e => setForm(f => ({ ...f, efetivo_total: e.target.value }))} />
                </div>
              </div>

              {/* Breakdown por tipo */}
              {form.mao_de_obra.length > 0 && (
                <div className="space-y-2">
                  {form.mao_de_obra.map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={m.tipo} onValueChange={v => updateMob(i, "tipo", v)}>
                        <SelectTrigger className="flex-1 h-8 text-xs">
                          <SelectValue placeholder="Tipo de profissional" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_MOB.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                          <SelectItem value="Outro" className="text-xs">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                      {m.tipo === "Outro" && (
                        <Input className="w-36 h-8 text-xs" placeholder="Especifique"
                          value={m.tipo === "Outro" ? "" : m.tipo}
                          onChange={e => updateMob(i, "tipo", e.target.value)} />
                      )}
                      <Input type="number" className="w-20 h-8 text-xs" placeholder="Qtd"
                        value={m.quantidade} onChange={e => updateMob(i, "quantidade", e.target.value)} />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => rmMob(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={addMob}>
                <Plus className="h-3 w-3" /> Adicionar tipo
              </Button>
            </div>

            <Separator />

            {/* ─ 4. EQUIPAMENTOS ─ */}
            <div className="space-y-3">
              <SectionHeader icon={Wrench} title="4 — Equipamentos e Máquinas" color="text-slate-600 dark:text-slate-400" />

              {form.equipamentos.length > 0 && (
                <div className="space-y-2">
                  {form.equipamentos.map((e, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="flex-1 h-8 text-xs" placeholder="Nome do equipamento/máquina"
                        value={e.descricao} onChange={v => updateEquip(i, "descricao", v.target.value)} />
                      <Input type="number" className="w-20 h-8 text-xs" placeholder="Qtd"
                        value={e.quantidade} onChange={v => updateEquip(i, "quantidade", v.target.value)} />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => rmEquip(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={addEquip}>
                <Plus className="h-3 w-3" /> Adicionar equipamento
              </Button>
            </div>

            <Separator />

            {/* ─ 5. ATIVIDADES ─ */}
            <div className="space-y-3">
              <SectionHeader icon={ClipboardList} title="5 — Atividades Executadas" color="text-emerald-600 dark:text-emerald-400" />

              {form.atividades.length > 0 && (
                <div className="space-y-2">
                  {form.atividades.map((a, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Select value={a.setor} onValueChange={v => updateAtiv(i, "setor", v)}>
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue placeholder="Setor / Área" />
                          </SelectTrigger>
                          <SelectContent>
                            {SETORES_PADRAO.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                            <SelectItem value="Outro" className="text-xs">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input type="number" min="0" max="100" className="w-24 h-8 text-xs" placeholder="% conclusão"
                          value={a.percentual} onChange={e => updateAtiv(i, "percentual", e.target.value)} />
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => rmAtiv(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Textarea className="min-h-[60px] text-xs resize-none" placeholder="Descrição do que foi executado neste setor…"
                        value={a.descricao} onChange={e => updateAtiv(i, "descricao", e.target.value)} />
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={addAtiv}>
                <Plus className="h-3 w-3" /> Adicionar atividade
              </Button>
            </div>

            <Separator />

            {/* ─ 6. OCORRÊNCIAS ─ */}
            <div className="space-y-3">
              <SectionHeader icon={AlertTriangle} title="6 — Ocorrências" color="text-orange-600 dark:text-orange-400" />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Registre acidentes, quase-acidentes, visitas de fiscalização, atrasos de materiais, falhas técnicas ou qualquer ocorrência relevante do dia
                </Label>
                <Textarea
                  className="min-h-[100px] text-sm"
                  placeholder="Descreva aqui qualquer ocorrência relevante…"
                  value={form.ocorrencias}
                  onChange={e => setForm(f => ({ ...f, ocorrencias: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Observações gerais</Label>
                <Textarea
                  className="min-h-[60px] text-sm"
                  placeholder="Outras observações relevantes do dia…"
                  value={form.observacoes}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

            {/* ─ 7. SMS DO DIA ─ */}
            <div className="space-y-3">
              <SectionHeader icon={CheckCircle2} title="7 — SMS do Dia" color="text-green-600 dark:text-green-400" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-4 flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <Switch checked={form.dds_realizado} onCheckedChange={v => setForm(f => ({ ...f, dds_realizado: v }))} />
                  <div>
                    <p className="text-sm font-medium">DDS Realizado</p>
                    <p className="text-xs text-muted-foreground">Diálogo Diário de Segurança foi conduzido?</p>
                  </div>
                </div>
                {[
                  { label: "APRs realizadas",    key: "aprs_realizadas"    as const, icon: FileWarning, color: "text-violet-600" },
                  { label: "Inspeções",           key: "inspecoes_realizadas" as const, icon: ClipboardList, color: "text-blue-600" },
                  { label: "Desvios registrados", key: "desvios_registrados" as const, icon: AlertOctagon, color: "text-orange-600" },
                ].map(({ label, key, icon: Icon, color }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className={cn("flex items-center gap-1.5 text-xs", color)}>
                      <Icon className="h-3.5 w-3.5" />{label}
                    </Label>
                    <Input type="number" min="0" className="h-9"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* ─ 8. FOTOS ─ */}
            <div className="space-y-3">
              <SectionHeader icon={FileText} title="8 — Fotos e Registros Visuais" color="text-slate-600 dark:text-slate-400" />
              <FotoUploader
                folder="rdo"
                urls={form.fotos}
                onChange={fotos => setForm(f => ({ ...f, fotos }))}
                maxFiles={20}
                addLabel="Adicionar foto do dia"
              />
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 bg-background pt-3 border-t border-border/50">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[120px]">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {saving ? "Salvando…" : editId ? "Atualizar" : "Salvar RDO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

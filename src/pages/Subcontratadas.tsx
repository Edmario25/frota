import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Plus, Pencil, Trash2, CheckCircle2, XCircle,
  FileText, DollarSign, TrendingUp, ChevronRight, ChevronDown,
  AlertCircle, Send, Eye, Archive, ShieldCheck,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ─────────────────────────────────────────────────────────────────

type Obra = { id: string; nome: string };

type Subcontratada = {
  id: string;
  obra_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  escopo: string | null;
  valor_contrato: number | null;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  status: "ativa" | "suspensa" | "encerrada";
  responsavel_contato: string | null;
  telefone_contato: string | null;
  observacoes: string | null;
  numero_contrato: string | null;
  email_contato: string | null;
  representante_legal: string | null;
  percentual_retencao: number;
  valor_aditivos: number;
  motivo_status: string | null;
  // da view
  obra_nome?: string;
  total_medicoes?: number;
  valor_medido_aprovado?: number;
  valor_medido_total?: number;
  perc_executado?: number;
};

type Medicao = {
  id: string;
  subcontratada_id: string;
  obra_id: string;
  numero_bm: number;
  periodo_referencia: string;
  data_medicao: string;
  valor_medido: number;
  percentual_avanco: number | null;
  status: "rascunho" | "enviada" | "aprovada" | "rejeitada" | "cancelada";
  observacoes: string | null;
  observacoes_aprovador: string | null;
  // join
  subcontratada?: { razao_social: string };
};

type MedicaoItem = {
  id: string;
  medicao_id: string;
  cronograma_item_id: string | null;
  descricao: string;
  unidade: string | null;
  quantidade_contrato: number | null;
  quantidade_medida: number;
  valor_unitario: number | null;
  valor_total: number | null;
  ordem: number;
};

type CronogramaItem = { id: string; descricao: string; codigo: string | null };

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : "R$ " + fmt(v);

const STATUS_SUBCONT: Record<string, { label: string; cls: string }> = {
  ativa:     { label: "Ativa",     cls: "bg-green-100  text-green-700  border-green-200"  },
  suspensa:  { label: "Suspensa",  cls: "bg-amber-100  text-amber-700  border-amber-200"  },
  encerrada: { label: "Encerrada", cls: "bg-slate-100  text-slate-600  border-slate-200"  },
};

const STATUS_MED: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  rascunho: { label: "Rascunho",  cls: "bg-slate-100  text-slate-600",  icon: FileText      },
  enviada:  { label: "Enviada",   cls: "bg-blue-100   text-blue-700",   icon: Send          },
  aprovada: { label: "Aprovada",  cls: "bg-green-100  text-green-700",  icon: CheckCircle2  },
  rejeitada:{ label: "Rejeitada", cls: "bg-red-100    text-red-700",    icon: XCircle       },
  cancelada:{ label: "Cancelada", cls: "bg-slate-200  text-slate-700",  icon: Archive       },
};

// ─── Sub-components ────────────────────────────────────────────────────────

function MedBadge({ status }: { status: string }) {
  const s = STATUS_MED[status] ?? STATUS_MED.rascunho;
  const Icon = s.icon;
  return (
    <Badge className={`${s.cls} gap-1 border-0`}>
      <Icon className="h-3 w-3" />
      {s.label}
    </Badge>
  );
}

// ─── Modal: Subcontratada ──────────────────────────────────────────────────

function SubcontratadaModal({
  open, onClose, onSaved, obras, editing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; editing: Subcontratada | null;
}) {
  const { toast } = useToast();
  const blank = {
    obra_id: "", razao_social: "", nome_fantasia: "", cnpj: "",
    escopo: "", valor_contrato: "", data_inicio: "", data_fim_prevista: "",
    status: "ativa" as "ativa" | "suspensa", responsavel_contato: "", telefone_contato: "", observacoes: "",
    numero_contrato: "", email_contato: "", representante_legal: "", percentual_retencao: "", valor_aditivos: "", motivo_status: "",
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          obra_id: editing.obra_id,
          razao_social: editing.razao_social,
          nome_fantasia: editing.nome_fantasia ?? "",
          cnpj: editing.cnpj ?? "",
          escopo: editing.escopo ?? "",
          valor_contrato: editing.valor_contrato != null ? String(editing.valor_contrato) : "",
          data_inicio: editing.data_inicio ?? "",
          data_fim_prevista: editing.data_fim_prevista ?? "",
          status: editing.status === "suspensa" ? "suspensa" : "ativa",
          responsavel_contato: editing.responsavel_contato ?? "",
          telefone_contato: editing.telefone_contato ?? "",
          observacoes: editing.observacoes ?? "",
          numero_contrato: editing.numero_contrato ?? "",
          email_contato: editing.email_contato ?? "",
          representante_legal: editing.representante_legal ?? "",
          percentual_retencao: String(editing.percentual_retencao ?? 0),
          valor_aditivos: String(editing.valor_aditivos ?? 0),
          motivo_status: editing.motivo_status ?? "",
        });
      } else {
        setF(blank);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: keyof typeof blank, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.obra_id || !f.razao_social.trim()) {
      toast({ title: "Preencha obra e razão social", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      obra_id: f.obra_id,
      razao_social: f.razao_social.trim(),
      nome_fantasia: f.nome_fantasia || null,
      cnpj: f.cnpj || null,
      escopo: f.escopo || null,
      valor_contrato: f.valor_contrato ? parseFloat(f.valor_contrato.replace(/\./g, "").replace(",", ".")) : null,
      data_inicio: f.data_inicio || null,
      data_fim_prevista: f.data_fim_prevista || null,
      status: f.status,
      responsavel_contato: f.responsavel_contato || null,
      telefone_contato: f.telefone_contato || null,
      observacoes: f.observacoes || null,
      numero_contrato: f.numero_contrato || null,
      email_contato: f.email_contato || null,
      representante_legal: f.representante_legal || null,
      percentual_retencao: Number(f.percentual_retencao || 0),
      valor_aditivos: Number(f.valor_aditivos || 0),
      motivo_status: f.status === "suspensa" ? f.motivo_status || null : null,
    };
    const q = editing
      ? (supabase as any).from("subcontratadas").update(payload).eq("id", editing.id)
      : (supabase as any).from("subcontratadas").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Subcontratada atualizada" : "Subcontratada cadastrada" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Subcontratada" : "Nova Subcontratada"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label>Obra *</Label>
            <Select value={f.obra_id} onValueChange={v => set("obra_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
              <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Razão Social *</Label>
            <Input value={f.razao_social} onChange={e => set("razao_social", e.target.value)} />
          </div>
          <div>
            <Label>Nome Fantasia</Label>
            <Input value={f.nome_fantasia} onChange={e => set("nome_fantasia", e.target.value)} />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input value={f.cnpj} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label>Nº do Contrato</Label>
            <Input value={f.numero_contrato} onChange={e => set("numero_contrato", e.target.value)} />
          </div>
          <div>
            <Label>Representante Legal</Label>
            <Input value={f.representante_legal} onChange={e => set("representante_legal", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Escopo do Serviço</Label>
            <Textarea value={f.escopo} onChange={e => set("escopo", e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Valor do Contrato (R$)</Label>
            <Input value={f.valor_contrato} onChange={e => set("valor_contrato", e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={v => set("status", v as typeof f.status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="suspensa">Suspensa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Aditivos (R$)</Label>
            <Input type="number" min="0" value={f.valor_aditivos} onChange={e => set("valor_aditivos", e.target.value)} />
          </div>
          <div>
            <Label>Retenção (%)</Label>
            <Input type="number" min="0" max="100" value={f.percentual_retencao} onChange={e => set("percentual_retencao", e.target.value)} />
          </div>
          <div>
            <Label>Início</Label>
            <Input type="date" value={f.data_inicio} onChange={e => set("data_inicio", e.target.value)} />
          </div>
          <div>
            <Label>Fim Previsto</Label>
            <Input type="date" value={f.data_fim_prevista} onChange={e => set("data_fim_prevista", e.target.value)} />
          </div>
          <div>
            <Label>Responsável / Contato</Label>
            <Input value={f.responsavel_contato} onChange={e => set("responsavel_contato", e.target.value)} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={f.telefone_contato} onChange={e => set("telefone_contato", e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={f.email_contato} onChange={e => set("email_contato", e.target.value)} />
          </div>
          {f.status === "suspensa" && <div>
            <Label>Motivo da suspensão</Label>
            <Input value={f.motivo_status} onChange={e => set("motivo_status", e.target.value)} />
          </div>}
          <div className="col-span-2">
            <Label>Observações</Label>
            <Textarea value={f.observacoes} onChange={e => set("observacoes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Nova Medição ───────────────────────────────────────────────────

function MedicaoModal({
  open, onClose, onSaved, subcontratadas, obraId, editing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  subcontratadas: Subcontratada[]; obraId: string; editing: Medicao | null;
}) {
  const { toast } = useToast();
  const blank = {
    subcontratada_id: "", periodo_referencia: "", data_medicao: new Date().toISOString().slice(0, 10),
    valor_medido: "", percentual_avanco: "", observacoes: "",
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          subcontratada_id: editing.subcontratada_id,
          periodo_referencia: editing.periodo_referencia,
          data_medicao: editing.data_medicao,
          valor_medido: String(editing.valor_medido),
          percentual_avanco: editing.percentual_avanco != null ? String(editing.percentual_avanco) : "",
          observacoes: editing.observacoes ?? "",
        });
      } else {
        const now = new Date();
        setF({ ...blank, periodo_referencia: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: keyof typeof blank, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.subcontratada_id || !f.periodo_referencia) {
      toast({ title: "Selecione a subcontratada e o período", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      subcontratada_id: f.subcontratada_id,
      obra_id: obraId,
      periodo_referencia: f.periodo_referencia,
      data_medicao: f.data_medicao,
      valor_medido: parseFloat(f.valor_medido || "0"),
      percentual_avanco: f.percentual_avanco ? parseFloat(f.percentual_avanco) : null,
      observacoes: f.observacoes || null,
    };
    const q = editing
      ? (supabase as any).from("medicoes").update(payload).eq("id", editing.id)
      : (supabase as any).from("medicoes").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Medição atualizada" : "Medição criada" });
    onSaved();
  };

  const opts = subcontratadas.filter(s => !obraId || s.obra_id === obraId);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar Medição" : "Nova Medição (BM)"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Subcontratada *</Label>
            <Select value={f.subcontratada_id} onValueChange={v => set("subcontratada_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {opts.map(s => <SelectItem key={s.id} value={s.id}>{s.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Período (mês)</Label>
              <Input type="month" value={f.periodo_referencia} onChange={e => set("periodo_referencia", e.target.value)} />
            </div>
            <div>
              <Label>Data da Medição</Label>
              <Input type="date" value={f.data_medicao} onChange={e => set("data_medicao", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor Medido (R$)</Label>
              <Input value={f.valor_medido} onChange={e => set("valor_medido", e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>% Avanço Físico</Label>
              <Input value={f.percentual_avanco} onChange={e => set("percentual_avanco", e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={f.observacoes} onChange={e => set("observacoes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Boletim de Medição (detalhes + itens) ─────────────────────────

function BoletimModal({
  open, onClose, medicao, subcontratadas, cronogramaItens, onItemsSaved,
}: {
  open: boolean; onClose: () => void;
  medicao: Medicao | null; subcontratadas: Subcontratada[];
  cronogramaItens: CronogramaItem[]; onItemsSaved: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<MedicaoItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [savingItems, setSavingItems] = useState(false);

  // Novo item vazio
  const emptyItem = (): MedicaoItem => ({
    id: crypto.randomUUID(),
    medicao_id: medicao?.id ?? "",
    cronograma_item_id: null,
    descricao: "",
    unidade: "",
    quantidade_contrato: null,
    quantidade_medida: 0,
    valor_unitario: null,
    valor_total: null,
    ordem: items.length,
  });

  useEffect(() => {
    if (!open || !medicao) return;
    const load = async () => {
      setLoadingItems(true);
      const { data } = await (supabase as any).from("medicoes_itens")
        .select("*").eq("medicao_id", medicao.id).order("ordem");
      setItems(data ?? []);
      setLoadingItems(false);
    };
    load();
  }, [open, medicao]);

  const subcont = subcontratadas.find(s => s.id === medicao?.subcontratada_id);
  const editable = medicao?.status === "rascunho";

  const totalValor = items.reduce((acc, i) => acc + ((i.quantidade_medida || 0) * (i.valor_unitario || 0)), 0);

  const updateItem = (idx: number, k: keyof MedicaoItem, v: string | number | null) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const saveItems = async () => {
    if (!medicao) return;
    if (!editable) { toast({ title: "Boletim bloqueado", description: "Itens só podem ser alterados enquanto o BM estiver em rascunho." }); return; }
    setSavingItems(true);
    // Delete all existing then insert current
    await (supabase as any).from("medicoes_itens").delete().eq("medicao_id", medicao.id);
    if (items.length > 0) {
      const rows = items.map((it, i) => ({
        medicao_id: medicao.id,
        cronograma_item_id: it.cronograma_item_id || null,
        descricao: it.descricao,
        unidade: it.unidade || null,
        quantidade_contrato: it.quantidade_contrato,
        quantidade_medida: it.quantidade_medida || 0,
        valor_unitario: it.valor_unitario,
        ordem: i,
      }));
      const { error } = await (supabase as any).from("medicoes_itens").insert(rows);
      if (error) {
        toast({ title: "Erro ao salvar itens", description: error.message, variant: "destructive" });
        setSavingItems(false);
        return;
      }
    }
    toast({ title: "Itens salvos com sucesso" });
    setSavingItems(false);
    onItemsSaved();
  };

  if (!medicao) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            BM-{String(medicao.numero_bm).padStart(3, "0")} — {subcont?.razao_social ?? ""}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {medicao.periodo_referencia} · {fmtBRL(medicao.valor_medido)}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Cabeçalho resumo */}
        <div className="flex gap-4 flex-wrap text-sm border rounded-lg p-3 bg-muted/30">
          <div><span className="text-muted-foreground">Status:</span> <MedBadge status={medicao.status} /></div>
          <div><span className="text-muted-foreground">Data:</span> {medicao.data_medicao}</div>
          <div><span className="text-muted-foreground">Valor declarado:</span> <strong>{fmtBRL(medicao.valor_medido)}</strong></div>
          {medicao.percentual_avanco != null && (
            <div><span className="text-muted-foreground">Avanço físico:</span> <strong>{medicao.percentual_avanco}%</strong></div>
          )}
          {medicao.observacoes && (
            <div className="w-full"><span className="text-muted-foreground">Obs:</span> {medicao.observacoes}</div>
          )}
          {medicao.observacoes_aprovador && (
            <div className="w-full text-amber-700">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              <span className="text-muted-foreground">Aprovador:</span> {medicao.observacoes_aprovador}
            </div>
          )}
        </div>

        {/* Itens */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Itens do Boletim</h3>
            {editable && <Button size="sm" variant="outline" onClick={() => setItems(p => [...p, emptyItem()])}>
              <Plus className="h-3 w-3 mr-1" /> Adicionar Item
            </Button>}
          </div>

          {loadingItems ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vínculo Cronograma</TableHead>
                    <TableHead>Un</TableHead>
                    <TableHead>Qtd Contrato</TableHead>
                    <TableHead>Qtd Medida</TableHead>
                    <TableHead>Vl. Unit. (R$)</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-6">
                        Nenhum item. Clique em "Adicionar Item" para começar.
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((it, idx) => (
                    <TableRow key={it.id} className="text-xs">
                      <TableCell>
                        <Input
                          className="h-7 text-xs min-w-[140px]"
                          value={it.descricao}
                          disabled={!editable}
                          onChange={e => updateItem(idx, "descricao", e.target.value)}
                          placeholder="Descrição do serviço"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          disabled={!editable}
                          value={it.cronograma_item_id ?? "__none"}
                          onValueChange={v => updateItem(idx, "cronograma_item_id", v === "__none" ? null : v)}
                        >
                          <SelectTrigger className="h-7 text-xs min-w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">—</SelectItem>
                            {cronogramaItens.map(ci => (
                              <SelectItem key={ci.id} value={ci.id}>
                                {ci.codigo ? `${ci.codigo} — ` : ""}{ci.descricao}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input disabled={!editable} className="h-7 text-xs w-16" value={it.unidade ?? ""} onChange={e => updateItem(idx, "unidade", e.target.value)} placeholder="m²" />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 text-xs w-24"
                          type="number" min="0"
                          disabled={!editable}
                          value={it.quantidade_contrato ?? ""}
                          onChange={e => updateItem(idx, "quantidade_contrato", e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 text-xs w-24"
                          type="number" min="0"
                          disabled={!editable}
                          value={it.quantidade_medida}
                          onChange={e => updateItem(idx, "quantidade_medida", parseFloat(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 text-xs w-28"
                          type="number" min="0"
                          disabled={!editable}
                          value={it.valor_unitario ?? ""}
                          onChange={e => updateItem(idx, "valor_unitario", e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtBRL((it.quantidade_medida || 0) * (it.valor_unitario || 0))}
                      </TableCell>
                      <TableCell>
                        {editable && <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {items.length > 0 && (
            <div className="text-right text-sm font-semibold pr-2">
              Total dos Itens: <span className="text-primary">{fmtBRL(totalValor)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {editable && <Button onClick={saveItems} disabled={savingItems}>
            {savingItems ? "Salvando…" : "Salvar Itens"}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Contratos ────────────────────────────────────────────────────────

function ContratosTab({
  obraId, obras, refresh, triggerRefresh,
}: { obraId: string; obras: Obra[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Subcontratada[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Subcontratada | null>(null);

  const load = useCallback(async () => {
    if (!obraId) { setData([]); return; }
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("v_subcontratadas_resumo")
      .select("*")
      .eq("obra_id", obraId)
      .order("razao_social");
    setData(rows ?? []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load, refresh]);

  const encerrar = async (id: string) => {
    const motivo = window.prompt("Informe o motivo do encerramento do contrato:");
    if (!motivo) return;
    const { error } = await (supabase as any).rpc("encerrar_subcontratada", { p_id: id, p_motivo: motivo });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Contrato encerrado", description: "O histórico e os boletins foram preservados." });
    triggerRefresh();
  };

  // KPIs
  const totalContrato = data.reduce((s, r) => s + (r.valor_contrato ?? 0), 0);
  const totalExec     = data.reduce((s, r) => s + (r.valor_medido_aprovado ?? 0), 0);
  const ativas        = data.filter(s => s.status === "ativa").length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Subcontratadas", val: data.length, icon: Building2, cls: "text-primary" },
          { label: "Ativas",         val: ativas,        icon: CheckCircle2, cls: "text-green-600" },
          { label: "Valor Total Contratos", val: fmtBRL(totalContrato), icon: DollarSign, cls: "text-blue-600" },
          { label: "Valor Executado (ap.)", val: fmtBRL(totalExec),    icon: TrendingUp,  cls: "text-emerald-600" },
        ].map(k => (
          <Card key={k.label} className="p-3">
            <div className="flex items-center gap-2">
              <k.icon className={`h-4 w-4 ${k.cls}`} />
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </div>
            <p className="text-lg font-bold mt-1">{k.val}</p>
          </Card>
        ))}
      </div>

      {/* Table */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Contratos</h3>
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Subcontratada
        </Button>
      </div>

      {!obraId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra para ver os contratos.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Escopo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor Contrato</TableHead>
                <TableHead>Executado</TableHead>
                <TableHead>% Exec.</TableHead>
                <TableHead>BMs</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhuma subcontratada cadastrada.
                  </TableCell>
                </TableRow>
              )}
              {data.map(s => {
                const ss = STATUS_SUBCONT[s.status];
                const perc = Number(s.perc_executado ?? 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{s.razao_social}</div>
                      {s.nome_fantasia && <div className="text-xs text-muted-foreground">{s.nome_fantasia}</div>}
                      {s.cnpj && <div className="text-xs text-muted-foreground">{s.cnpj}</div>}
                      {s.numero_contrato && <div className="text-xs text-primary">Contrato {s.numero_contrato}</div>}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{s.escopo ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ss.cls}>{ss.label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{fmtBRL(s.valor_contrato)}</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-700">{fmtBRL(s.valor_medido_aprovado)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <Progress value={perc} className="h-1.5 flex-1" />
                        <span className="text-xs w-9 text-right">{perc}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{s.total_medicoes ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => { setEditing(s); setModal(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {s.status !== "encerrada" && <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title="Encerrar contrato"
                          onClick={() => encerrar(s.id)}>
                          <Archive className="h-3 w-3" />
                        </Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <SubcontratadaModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras} editing={editing}
      />
    </div>
  );
}

// ─── Tab: Medições ─────────────────────────────────────────────────────────

function MedicoesTab({
  obraId, subcontratadas, cronogramaItens, refresh, triggerRefresh,
}: {
  obraId: string; subcontratadas: Subcontratada[];
  cronogramaItens: CronogramaItem[]; refresh: number; triggerRefresh: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Medicao[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Medicao | null>(null);
  const [boletimMed, setBoletimMed] = useState<Medicao | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSub, setFilterSub] = useState("todas");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectObs, setRejectObs] = useState("");
  const [statusAction, setStatusAction] = useState<"rejeitar" | "cancelar">("rejeitar");

  const load = useCallback(async () => {
    if (!obraId) { setData([]); return; }
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("medicoes")
      .select("*, subcontratada:subcontratadas(razao_social)")
      .eq("obra_id", obraId)
      .order("numero_bm", { ascending: false });
    setData(rows ?? []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load, refresh]);

  const changeStatus = async (id: string, status: string, obs?: string) => {
    const action = ({ enviada: "enviar", aprovada: "aprovar", rejeitada: "rejeitar", cancelada: "cancelar" } as Record<string, string>)[status];
    const { error } = await (supabase as any).rpc("processar_medicao_status", {
      p_medicao_id: id, p_acao: action, p_observacao: obs || null,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Medição ${status === "aprovada" ? "aprovada" : status === "rejeitada" ? "rejeitada" : "atualizada"}` });
    triggerRefresh();
  };

  const filtered = data.filter(m => {
    if (filterStatus !== "todos" && m.status !== filterStatus) return false;
    if (filterSub !== "todas" && m.subcontratada_id !== filterSub) return false;
    return true;
  });

  const totalAprovado = filtered.filter(m => m.status === "aprovada").reduce((s, m) => s + m.valor_medido, 0);
  const pendentes     = filtered.filter(m => m.status === "enviada").length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total BMs</p>
          <p className="text-xl font-bold">{filtered.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Aguardando Aprovação</p>
          <p className="text-xl font-bold text-amber-600">{pendentes}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total Aprovado</p>
          <p className="text-xl font-bold text-emerald-700">{fmtBRL(totalAprovado)}</p>
        </Card>
      </div>

      {/* Filtros + botão */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviada">Enviada</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="rejeitada">Rejeitada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSub} onValueChange={setFilterSub}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas subcontratadas</SelectItem>
              {subcontratadas.filter(s => s.obra_id === obraId).map(s => (
                <SelectItem key={s.id} value={s.id}>{s.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Medição
        </Button>
      </div>

      {!obraId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BM</TableHead>
                <TableHead>Subcontratada</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor Medido</TableHead>
                <TableHead>% Avanço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhuma medição encontrada.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono font-semibold">
                    BM-{String(m.numero_bm).padStart(3, "0")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(m.subcontratada as any)?.razao_social ?? "—"}
                  </TableCell>
                  <TableCell>{m.periodo_referencia}</TableCell>
                  <TableCell className="text-sm">{m.data_medicao}</TableCell>
                  <TableCell className="font-mono">{fmtBRL(m.valor_medido)}</TableCell>
                  <TableCell>
                    {m.percentual_avanco != null ? `${m.percentual_avanco}%` : "—"}
                  </TableCell>
                  <TableCell><MedBadge status={m.status} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {/* Ver Boletim */}
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver Boletim"
                        onClick={() => setBoletimMed(m)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      {/* Editar (só rascunho) */}
                      {m.status === "rascunho" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => { setEditing(m); setModal(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      {/* Enviar (rascunho → enviada) */}
                      {m.status === "rascunho" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Enviar para aprovação"
                          onClick={() => changeStatus(m.id, "enviada")}>
                          <Send className="h-3 w-3" />
                        </Button>
                      )}
                      {/* Aprovar (enviada → aprovada) */}
                      {m.status === "enviada" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Aprovar"
                          onClick={() => changeStatus(m.id, "aprovada")}>
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                      )}
                      {/* Rejeitar (enviada → rejeitada) */}
                      {m.status === "enviada" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Rejeitar"
                          onClick={() => { setStatusAction("rejeitar"); setRejectId(m.id); setRejectObs(""); }}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      )}
                      {/* Cancelar preservando histórico */}
                      {m.status !== "aprovada" && m.status !== "cancelada" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title="Cancelar BM"
                          onClick={() => { setStatusAction("cancelar"); setRejectId(m.id); setRejectObs(""); }}>
                          <Archive className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rejeição modal inline */}
      <Dialog open={!!rejectId} onOpenChange={v => !v && setRejectId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{statusAction === "rejeitar" ? "Rejeitar" : "Cancelar"} Medição</DialogTitle></DialogHeader>
          <div>
            <Label>Justificativa obrigatória</Label>
            <Textarea value={rejectObs} onChange={e => setRejectObs(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={rejectObs.trim().length < 5} onClick={async () => {
              if (!rejectId) return;
              await changeStatus(rejectId, statusAction === "rejeitar" ? "rejeitada" : "cancelada", rejectObs);
              setRejectId(null);
            }}>{statusAction === "rejeitar" ? "Rejeitar" : "Cancelar BM"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MedicaoModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        subcontratadas={subcontratadas} obraId={obraId} editing={editing}
      />

      <BoletimModal
        open={!!boletimMed} onClose={() => setBoletimMed(null)}
        medicao={boletimMed} subcontratadas={subcontratadas}
        cronogramaItens={cronogramaItens}
        onItemsSaved={() => { setBoletimMed(null); triggerRefresh(); }}
      />
    </div>
  );
}

// ─── Tab: Documentos e conformidade ───────────────────────────────────────

type DocumentoSub = { id: string; subcontratada_id: string; tipo: string; numero: string | null; data_vencimento: string | null; arquivo_url: string | null; status: string };

function DocumentosTab({ obraId, subcontratadas, refresh, triggerRefresh }: { obraId: string; subcontratadas: Subcontratada[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<DocumentoSub[]>([]);
  const [subId, setSubId] = useState("");
  const [tipo, setTipo] = useState("");
  const [numero, setNumero] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [url, setUrl] = useState("");
  const load = useCallback(async () => {
    if (!obraId) return setDocs([]);
    const { data } = await (supabase as any).from("subcontratada_documentos").select("*").eq("obra_id", obraId).order("data_vencimento");
    setDocs(data ?? []);
  }, [obraId]);
  useEffect(() => { load(); }, [load, refresh]);
  const save = async () => {
    if (!subId || !tipo.trim()) return toast({ title: "Informe a empresa e o tipo do documento", variant: "destructive" });
    const { error } = await (supabase as any).from("subcontratada_documentos").insert({ obra_id: obraId, subcontratada_id: subId, tipo: tipo.trim(), numero: numero || null, data_vencimento: vencimento || null, arquivo_url: url || null });
    if (error) return toast({ title: "Erro ao cadastrar documento", description: error.message, variant: "destructive" });
    setTipo(""); setNumero(""); setVencimento(""); setUrl(""); triggerRefresh(); toast({ title: "Documento cadastrado" });
  };
  const validar = async (id: string, status: "valido" | "rejeitado") => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("subcontratada_documentos").update({ status, validado_em: new Date().toISOString(), validado_por: auth.user?.id ?? null }).eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    triggerRefresh();
  };
  const hoje = new Date().toISOString().slice(0, 10);
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Conformidade documental</CardTitle></CardHeader><CardContent className="grid md:grid-cols-5 gap-3">
      <Select value={subId} onValueChange={setSubId}><SelectTrigger><SelectValue placeholder="Subcontratada" /></SelectTrigger><SelectContent>{subcontratadas.filter(s => s.status !== "encerrada").map(s => <SelectItem key={s.id} value={s.id}>{s.razao_social}</SelectItem>)}</SelectContent></Select>
      <Input value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Tipo: CND, seguro, NR..." />
      <Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Número" />
      <Input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} />
      <Button onClick={save}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      <Input className="md:col-span-5" value={url} onChange={e => setUrl(e.target.value)} placeholder="Link do arquivo (opcional)" />
    </CardContent></Card>
    <div className="border rounded-lg overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Documento</TableHead><TableHead>Número</TableHead><TableHead>Validade</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>
      {docs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum documento cadastrado.</TableCell></TableRow>}
      {docs.map(d => { const vencido = !!d.data_vencimento && d.data_vencimento < hoje; const status = vencido ? "vencido" : d.status; return <TableRow key={d.id}><TableCell>{subcontratadas.find(s => s.id === d.subcontratada_id)?.razao_social ?? "—"}</TableCell><TableCell>{d.arquivo_url ? <a className="text-primary underline" href={d.arquivo_url} target="_blank" rel="noreferrer">{d.tipo}</a> : d.tipo}</TableCell><TableCell>{d.numero ?? "—"}</TableCell><TableCell>{d.data_vencimento ?? "Sem vencimento"}</TableCell><TableCell><Badge variant="outline" className={status === "valido" ? "text-green-700" : status === "vencido" || status === "rejeitado" ? "text-red-700" : "text-amber-700"}>{status}</Badge></TableCell><TableCell className="space-x-1"><Button size="sm" variant="outline" onClick={() => validar(d.id, "valido")}>Validar</Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => validar(d.id, "rejeitado")}>Rejeitar</Button></TableCell></TableRow>; })}
    </TableBody></Table></div>
  </div>;
}

// ─── Tab: Painel (visão por subcontratada) ─────────────────────────────────

function PainelTab({ obraId, refresh }: { obraId: string; refresh: number }) {
  const [data, setData] = useState<Subcontratada[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [medicoesPorSub, setMedicoesPorSub] = useState<Record<string, Medicao[]>>({});

  useEffect(() => {
    if (!obraId) { setData([]); return; }
    (async () => {
      const { data: rows } = await (supabase as any)
        .from("v_subcontratadas_resumo").select("*").eq("obra_id", obraId).order("razao_social");
      setData(rows ?? []);
    })();
  }, [obraId, refresh]);

  const toggleExpand = async (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) { next.delete(id); }
    else {
      next.add(id);
      if (!medicoesPorSub[id]) {
        const { data: rows } = await (supabase as any)
          .from("medicoes").select("*").eq("subcontratada_id", id).order("numero_bm");
        setMedicoesPorSub(p => ({ ...p, [id]: rows ?? [] }));
      }
    }
    setExpanded(next);
  };

  if (!obraId) return <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>;

  return (
    <div className="space-y-3">
      {data.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma subcontratada cadastrada.</p>}
      {data.map(s => {
        const perc = Number(s.perc_executado ?? 0);
        const ss = STATUS_SUBCONT[s.status];
        const isOpen = expanded.has(s.id);
        const meds = medicoesPorSub[s.id] ?? [];
        return (
          <Card key={s.id} className="overflow-hidden">
            <CardHeader
              className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleExpand(s.id)}
            >
              <div className="flex items-center gap-3">
                <button className="text-muted-foreground">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{s.razao_social}</span>
                    <Badge variant="outline" className={`${ss.cls} text-xs`}>{ss.label}</Badge>
                  </div>
                  {s.escopo && <p className="text-xs text-muted-foreground truncate mt-0.5">{s.escopo}</p>}
                </div>
                <div className="hidden md:flex items-center gap-6 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">Contrato</p>
                    <p className="text-sm font-mono font-semibold">{fmtBRL(s.valor_contrato)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Executado</p>
                    <p className="text-sm font-mono font-semibold text-emerald-700">{fmtBRL(s.valor_medido_aprovado)}</p>
                  </div>
                  <div className="w-24">
                    <p className="text-xs text-muted-foreground mb-1">% Exec.</p>
                    <Progress value={perc} className="h-1.5" />
                    <p className="text-xs text-right">{perc}%</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="pt-0 pb-4 px-4 border-t">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 text-sm">
                  {s.cnpj && <div><span className="text-muted-foreground text-xs">CNPJ:</span> {s.cnpj}</div>}
                  {s.responsavel_contato && <div><span className="text-muted-foreground text-xs">Responsável:</span> {s.responsavel_contato}</div>}
                  {s.data_inicio && <div><span className="text-muted-foreground text-xs">Início:</span> {s.data_inicio}</div>}
                  {s.data_fim_prevista && <div><span className="text-muted-foreground text-xs">Fim previsto:</span> {s.data_fim_prevista}</div>}
                </div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Histórico de Medições ({meds.length})
                </h4>
                {meds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem medições cadastradas.</p>
                ) : (
                  <div className="space-y-1">
                    {meds.map(m => (
                      <div key={m.id} className="flex items-center gap-3 text-xs border rounded px-3 py-1.5">
                        <span className="font-mono font-semibold">BM-{String(m.numero_bm).padStart(3,"0")}</span>
                        <span className="text-muted-foreground">{m.periodo_referencia}</span>
                        <span className="font-mono">{fmtBRL(m.valor_medido)}</span>
                        <MedBadge status={m.status} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function Subcontratadas() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState("");
  const [subcontratadas, setSubcontratadas] = useState<Subcontratada[]>([]);
  const [cronogramaItens, setCronogramaItens] = useState<CronogramaItem[]>([]);
  const [refresh, setRefresh] = useState(0);
  const triggerRefresh = () => setRefresh(r => r + 1);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("obras").select("id, nome").is("arquivada_em", null).order("nome");
      setObras(data ?? []);
      if (data?.length) setObraId(data[0].id);
    })();
  }, []);

  // Carregar subcontratadas quando obra muda
  useEffect(() => {
    if (!obraId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("subcontratadas").select("*").eq("obra_id", obraId).order("razao_social");
      setSubcontratadas(data ?? []);
    })();
    // Carregar itens de cronograma para o obra selecionado
    (async () => {
      const { data } = await (supabase as any)
        .from("cronograma_itens").select("id, descricao, codigo").eq("obra_id", obraId).order("ordem");
      setCronogramaItens(data ?? []);
    })();
  }, [obraId, refresh]);

  return (
    <Layout>
      <div className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Subcontratadas e Medição</h1>
              <p className="text-sm text-muted-foreground">Gestão de contratos e boletins de medição</p>
            </div>
          </div>
          {/* Selector de obra */}
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione a obra" />
            </SelectTrigger>
            <SelectContent>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="contratos">
          <TabsList className="mb-4">
            <TabsTrigger value="contratos">Contratos</TabsTrigger>
            <TabsTrigger value="medicoes">Medições (BM)</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="painel">Painel por Empresa</TabsTrigger>
          </TabsList>

          <TabsContent value="contratos">
            <ContratosTab
              obraId={obraId} obras={obras}
              refresh={refresh} triggerRefresh={triggerRefresh}
            />
          </TabsContent>

          <TabsContent value="medicoes">
            <MedicoesTab
              obraId={obraId} subcontratadas={subcontratadas}
              cronogramaItens={cronogramaItens}
              refresh={refresh} triggerRefresh={triggerRefresh}
            />
          </TabsContent>

          <TabsContent value="documentos">
            <DocumentosTab obraId={obraId} subcontratadas={subcontratadas} refresh={refresh} triggerRefresh={triggerRefresh} />
          </TabsContent>

          <TabsContent value="painel">
            <PainelTab obraId={obraId} refresh={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

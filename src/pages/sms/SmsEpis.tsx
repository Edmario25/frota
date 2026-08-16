import { useEffect, useState, useCallback, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { loadBrandingFromDB } from "@/hooks/useSystemSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Package, Plus, Search, RefreshCw, AlertTriangle, CheckCircle2,
  ArrowRightLeft, Archive, BookMarked, Pencil, Users, History,
  Printer, TrendingUp, TrendingDown, ShieldAlert, FileCheck,
  X, Eraser,
} from "lucide-react";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── helpers ────────────────────────────────────────────────────────────────
const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—";

const hoje = () => new Date().toISOString().split("T")[0];

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
  assinatura_base64: string | null;
  employees: { nome: string } | null;
  sms_epis_catalogo: { nome: string; ca_numero: string | null } | null;
  obras: { nome: string } | null;
}

interface Movimentacao {
  id: string;
  epi_id: string;
  obra_id: string;
  tipo: string;
  quantidade: number;
  data: string;
  nota_fiscal: string | null;
  fornecedor: string | null;
  observacoes: string | null;
  obra_destino_id: string | null;
  obras: { nome: string } | null;
  destino: { nome: string } | null;
  sms_epis_catalogo: { nome: string } | null;
}

interface EntregaForm {
  colaborador_id: string;
  epi_id: string;
  obra_id: string;
  data_entrega: string;
  quantidade: string;
  condicao: string;
  observacoes: string;
  assinatura: string | null;
}

interface EntradaForm {
  tipo: "compra" | "transferencia";
  epi_id: string;
  obra_id: string;
  obra_destino_id: string;
  quantidade: string;
  nota_fiscal: string;
  fornecedor: string;
  data: string;
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

const TIPO_MOV_LABEL: Record<string, { label: string; cls: string; icon: string }> = {
  entrada_compra:       { label: "Compra / NF",           cls: "bg-green-100 text-green-800",  icon: "↑" },
  entrada_transferencia:{ label: "Transferência (entrada)", cls: "bg-teal-100 text-teal-800",  icon: "↑" },
  saida_entrega:        { label: "Entrega a colaborador",  cls: "bg-blue-100 text-blue-800",   icon: "↓" },
  saida_transferencia:  { label: "Transferência (saída)",  cls: "bg-orange-100 text-orange-800",icon: "↓" },
  ajuste_positivo:      { label: "Ajuste (+)",             cls: "bg-green-100 text-green-800", icon: "±" },
  ajuste_negativo:      { label: "Ajuste (−)",             cls: "bg-red-100 text-red-800",     icon: "±" },
};

// ─── SignaturePad ────────────────────────────────────────────────────────────
function SignaturePad({ onChange }: { onChange: (b64: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const lastPos   = useRef<{ x: number; y: number } | null>(null);
  const empty     = useRef(true);

  const relPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect();
    const t = (e as TouchEvent).touches?.[0];
    const cx = t ? t.clientX : (e as MouseEvent).clientX;
    const cy = t ? t.clientY : (e as MouseEvent).clientY;
    return { x: (cx - r.left) * (canvas.width / r.width), y: (cy - r.top) * (canvas.height / r.height) };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const down = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      lastPos.current = relPos(e, canvas);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!drawing.current || !lastPos.current) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const p = relPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      lastPos.current = p;
      empty.current = false;
      onChange(canvas.toDataURL("image/png"));
    };
    const up = () => { drawing.current = false; lastPos.current = null; };

    canvas.addEventListener("mousedown",  down);
    canvas.addEventListener("mousemove",  move);
    canvas.addEventListener("mouseup",    up);
    canvas.addEventListener("mouseleave", up);
    canvas.addEventListener("touchstart", down, { passive: false });
    canvas.addEventListener("touchmove",  move, { passive: false });
    canvas.addEventListener("touchend",   up);
    return () => {
      canvas.removeEventListener("mousedown",  down);
      canvas.removeEventListener("mousemove",  move);
      canvas.removeEventListener("mouseup",    up);
      canvas.removeEventListener("mouseleave", up);
      canvas.removeEventListener("touchstart", down);
      canvas.removeEventListener("touchmove",  move);
      canvas.removeEventListener("touchend",   up);
    };
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    empty.current = true;
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      <canvas
        ref={canvasRef}
        width={480}
        height={140}
        className="w-full border-2 border-dashed border-slate-300 rounded-xl bg-white touch-none cursor-crosshair"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Assine acima usando o dedo ou mouse</p>
        <button type="button" onClick={clear}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Eraser className="h-3 w-3" /> Limpar
        </button>
      </div>
    </div>
  );
}

// ─── Print Ficha ─────────────────────────────────────────────────────────────
async function printFichaEpi(e: ColabEpi) {
  const nomeEpi  = e.sms_epis_catalogo?.nome ?? "—";
  const ca       = e.sms_epis_catalogo?.ca_numero ?? "—";
  const colab    = e.employees?.nome ?? "—";
  const obra     = e.obras?.nome ?? "—";
  const sig      = e.assinatura_base64
    ? `<img src="${e.assinatura_base64}" style="height:70px;border:1px solid #cbd5e1;border-radius:4px;background:#fff"/>`
    : `<div style="height:70px;border:1px dashed #cbd5e1;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px">Sem assinatura digital</div>`;

  // Busca branding do localStorage (já sincronizado com o Supabase)
  let companyName = "Sistema de Gestão de Frota";
  let logoUrl = "";
  try {
    const raw = localStorage.getItem("fleet_settings");
    if (raw) {
      const s = JSON.parse(raw);
      if (s.companyName) companyName = s.companyName;
      if (s.logoUrl)     logoUrl     = s.logoUrl;
    }
  } catch { /* usa defaults */ }

  // Se não tiver no localStorage, tenta o banco (sem bloquear muito)
  if (!logoUrl) {
    try {
      const branding = await loadBrandingFromDB();
      if (branding.companyName) companyName = branding.companyName;
      if (branding.logoUrl)     logoUrl     = branding.logoUrl;
    } catch { /* usa defaults */ }
  }

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" style="height:52px;max-width:180px;object-fit:contain" />`
    : `<div style="width:52px;height:52px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:900">${companyName.charAt(0)}</div>`;

  const w = window.open("", "_blank", "width=780,height=720");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><title>Ficha de EPI</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;color:#111;padding:32px;font-size:12px}
      .company-header{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:3px solid #0f172a;margin-bottom:6px}
      .company-name{font-size:16px;font-weight:800;color:#0f172a;line-height:1.2}
      .company-sub{font-size:10px;color:#64748b;margin-top:2px}
      .doc-header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;padding-top:8px}
      .doc-title{font-size:15px;font-weight:700;color:#1e293b}
      .doc-sub{font-size:10px;color:#64748b;margin-top:2px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
      .field label{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:3px;display:block}
      .field .val{font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
      .section{margin-bottom:20px}
      .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid #e2e8f0}
      .sig-box{margin-bottom:20px}
      .footer{font-size:9px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:20px}
      @media print{@page{margin:15mm;size:A5}}
    </style>
  </head><body>
    <div class="company-header">
      ${logoHtml}
      <div>
        <div class="company-name">${companyName}</div>
        <div class="company-sub">Gestão de Segurança, Meio Ambiente e Saúde — SMS</div>
      </div>
    </div>
    <div class="doc-header">
      <div>
        <div class="doc-title">Ficha de Entrega de EPI</div>
        <div class="doc-sub">Comprovante de entrega de Equipamento de Proteção Individual</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#64748b">
        Emitido: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Dados do EPI</div>
      <div class="grid">
        <div class="field"><label>Equipamento</label><div class="val">${nomeEpi}</div></div>
        <div class="field"><label>Nº do CA (MTE)</label><div class="val">${ca}</div></div>
        <div class="field"><label>Quantidade entregue</label><div class="val">${e.quantidade ?? 1}</div></div>
        <div class="field"><label>Condição</label><div class="val">${e.condicao ?? "—"}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Dados do Colaborador</div>
      <div class="grid">
        <div class="field"><label>Colaborador</label><div class="val">${colab}</div></div>
        <div class="field"><label>Obra / Local</label><div class="val">${obra}</div></div>
        <div class="field"><label>Data de Entrega</label><div class="val">${fmtDate(e.data_entrega)}</div></div>
        <div class="field"><label>Devolução</label><div class="val">${e.data_devolucao ? fmtDate(e.data_devolucao) : "Em uso"}</div></div>
      </div>
      ${e.observacoes ? `<div class="field" style="margin-top:8px"><label>Observações</label><div class="val">${e.observacoes}</div></div>` : ""}
    </div>

    <div class="sig-box">
      <div class="section-title">Assinatura do Colaborador</div>
      <p style="font-size:10px;color:#64748b;margin-bottom:8px">
        Declaro ter recebido o(s) EPI(s) acima identificado(s), comprometendo-me a utilizá-lo(s) adequadamente
        e comunicar qualquer defeito ou dano ao responsável de SMS.
      </p>
      ${sig}
      <div style="margin-top:8px;font-size:10px;color:#64748b">${colab} — ${fmtDate(e.data_entrega)}</div>
    </div>

    <div class="footer">
      Sistema de Gestão SMS — Documento gerado automaticamente em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
    </div>
    <script>window.onload=()=>{window.print()}<\/script>
  </body></html>`);
  w.document.close();
}

// ─── defaults ─────────────────────────────────────────────────────────────────
const entregaDefault: EntregaForm = {
  colaborador_id: "", epi_id: "", obra_id: "",
  data_entrega: hoje(), quantidade: "1", condicao: "novo", observacoes: "", assinatura: null,
};
const entradaDefault: EntradaForm = {
  tipo: "compra", epi_id: "", obra_id: "", obra_destino_id: "",
  quantidade: "", nota_fiscal: "", fornecedor: "", data: hoje(), observacoes: "",
};
const catDefault: CatForm = {
  nome: "", descricao: "", ca_numero: "", ca_vencimento: "", categoria: "", ativo: true,
};

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════
export default function SmsEpis() {
  const { toast }     = useToast();
  const { obras }     = useObras();
  const { employees } = useEmployees();

  const [catalogo,   setCatalogo]   = useState<EpiCatalogo[]>([]);
  const [estoque,    setEstoque]    = useState<EpiEstoque[]>([]);
  const [entregas,   setEntregas]   = useState<ColabEpi[]>([]);
  const [movimentos, setMovimentos] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const [tab,        setTab]        = useState("estoque");
  const [search,     setSearch]     = useState("");
  const [filtroObra, setFiltroObra] = useState("all");
  const [filtroEntregaStatus, setFiltroEntregaStatus] = useState<"todos"|"em_uso"|"devolvido">("todos");

  // modais
  const [modalOpen,      setModalOpen]      = useState(false);
  const [form,           setForm]           = useState<EntregaForm>(entregaDefault);
  const [entradaOpen,    setEntradaOpen]    = useState(false);
  const [entradaForm,    setEntradaForm]    = useState<EntradaForm>(entradaDefault);
  const [catModalOpen,   setCatModalOpen]   = useState(false);
  const [editCatId,      setEditCatId]      = useState<string | null>(null);
  const [catForm,        setCatForm]        = useState<CatForm>(catDefault);
  const [devDialog,      setDevDialog]      = useState<ColabEpi | null>(null);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const estoqueAbaixoMin = estoque.filter(e => e.quantidade <= e.quantidade_minima).length;
  const entregasAtivas   = entregas.filter(e => !e.data_devolucao).length;
  const caVencidos       = catalogo.filter(e => e.ativo && e.ca_vencimento && new Date(e.ca_vencimento) < new Date()).length;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: cat }, { data: est }, { data: ent }, { data: mov }] = await Promise.all([
      (supabase as any).from("sms_epis_catalogo")
        .select("id, nome, descricao, ca_numero, ca_vencimento, categoria, ativo").order("nome"),
      (supabase as any).from("sms_epis_estoque")
        .select("id, epi_id, obra_id, quantidade, quantidade_minima, obras(nome), sms_epis_catalogo(nome, categoria)")
        .order("obras(nome)"),
      (supabase as any).from("sms_colaborador_epis")
        .select("id, colaborador_id, epi_id, obra_id, data_entrega, data_devolucao, quantidade, condicao, observacoes, assinatura_base64, employees(nome), sms_epis_catalogo(nome, ca_numero), obras(nome)")
        .order("data_entrega", { ascending: false }).limit(500),
      (supabase as any).from("sms_epis_movimentacoes")
        .select("id, epi_id, obra_id, tipo, quantidade, data, nota_fiscal, fornecedor, observacoes, obra_destino_id, obras:obra_id(nome), destino:obra_destino_id(nome), sms_epis_catalogo(nome)")
        .order("created_at", { ascending: false }).limit(300)
        .then((r: any) => r)
        .catch(() => ({ data: [] })),
    ]);
    setCatalogo((cat ?? []) as EpiCatalogo[]);
    setEstoque((est ?? []) as EpiEstoque[]);
    setEntregas((ent ?? []) as ColabEpi[]);
    setMovimentos((mov ?? []) as Movimentacao[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Atualiza estoque (upsert) ──────────────────────────────────────────────
  async function ajustarEstoque(epiId: string, obraId: string, delta: number) {
    if (!obraId) return;
    const existing = estoque.find(e => e.epi_id === epiId && e.obra_id === obraId);
    if (existing) {
      await (supabase as any).from("sms_epis_estoque")
        .update({ quantidade: Math.max(0, existing.quantidade + delta) })
        .eq("id", existing.id);
    }
    // se não existir, não criamos automaticamente (quantidade seria negativa)
  }

  // ── Registrar movimentação ────────────────────────────────────────────────
  async function registrarMov(payload: Partial<Movimentacao> & { tipo: string; quantidade: number }) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("sms_epis_movimentacoes").insert([{
        ...payload, created_by: user?.id, data: payload.data ?? hoje(),
      }]);
    } catch { /* tabela pode não existir ainda */ }
  }

  // ── Salvar Entrega ─────────────────────────────────────────────────────────
  async function handleSaveEntrega() {
    if (!form.colaborador_id || !form.epi_id || !form.data_entrega) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const qty = parseInt(form.quantidade) || 1;
      const { data: inserted, error } = await (supabase as any).from("sms_colaborador_epis").insert([{
        colaborador_id: form.colaborador_id,
        epi_id:         form.epi_id,
        obra_id:        form.obra_id || null,
        data_entrega:   form.data_entrega,
        quantidade:     qty,
        condicao:       form.condicao || null,
        observacoes:    form.observacoes || null,
        assinatura_base64: form.assinatura || null,
      }]).select("id").single();
      if (error) throw error;

      // Baixa estoque
      await ajustarEstoque(form.epi_id, form.obra_id, -qty);

      // Registra movimentação
      await registrarMov({
        epi_id: form.epi_id,
        obra_id: form.obra_id,
        tipo: "saida_entrega",
        quantidade: qty,
        colaborador_epi_id: inserted?.id,
      });

      toast({ title: "✅ EPI entregue e estoque atualizado!" });
      setModalOpen(false);
      setForm(entregaDefault);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro ao registrar entrega", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  // ── Devolver ──────────────────────────────────────────────────────────────
  async function handleDevolucao(item: ColabEpi) {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("sms_colaborador_epis")
        .update({ data_devolucao: hoje() }).eq("id", item.id);
      if (error) throw error;

      // Restitui estoque
      if (item.obra_id) await ajustarEstoque(item.epi_id, item.obra_id, item.quantidade ?? 1);

      await registrarMov({
        epi_id: item.epi_id,
        obra_id: item.obra_id ?? "",
        tipo: "ajuste_positivo",
        quantidade: item.quantidade ?? 1,
        observacoes: "Devolução de EPI",
        colaborador_epi_id: item.id,
      });

      toast({ title: "Devolução registrada e estoque reposto!" });
      setDevDialog(null);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro ao devolver", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  // ── Entrada de Estoque (compra / transferência) ───────────────────────────
  async function handleSaveEntrada() {
    if (!entradaForm.epi_id || !entradaForm.obra_id || !entradaForm.quantidade) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    const qty = parseInt(entradaForm.quantidade);
    if (!qty || qty <= 0) {
      toast({ title: "Quantidade inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const obraId = entradaForm.tipo === "transferencia"
        ? entradaForm.obra_destino_id
        : entradaForm.obra_id;

      // Upsert no estoque (destino para transferência, obra para compra)
      const existing = estoque.find(e => e.epi_id === entradaForm.epi_id && e.obra_id === obraId);
      if (existing) {
        await (supabase as any).from("sms_epis_estoque")
          .update({ quantidade: existing.quantidade + qty }).eq("id", existing.id);
      } else {
        await (supabase as any).from("sms_epis_estoque").insert([{
          epi_id: entradaForm.epi_id,
          obra_id: obraId,
          quantidade: qty,
          quantidade_minima: 5,
        }]);
      }

      // Se transferência: desconta da obra origem
      if (entradaForm.tipo === "transferencia") {
        await ajustarEstoque(entradaForm.epi_id, entradaForm.obra_id, -qty);
      }

      // Movimentação
      await registrarMov({
        epi_id: entradaForm.epi_id,
        obra_id: obraId,
        tipo: entradaForm.tipo === "compra" ? "entrada_compra" : "entrada_transferencia",
        quantidade: qty,
        data: entradaForm.data,
        nota_fiscal: entradaForm.nota_fiscal || null,
        fornecedor: entradaForm.fornecedor || null,
        observacoes: entradaForm.observacoes || null,
        obra_destino_id: entradaForm.tipo === "transferencia" ? entradaForm.obra_destino_id : null,
      });

      toast({ title: `✅ Estoque atualizado (+${qty} ${entradaForm.tipo === "compra" ? "via compra" : "via transferência"})` });
      setEntradaOpen(false);
      setEntradaForm(entradaDefault);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro ao registrar entrada", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────
  function openNovoCat() { setEditCatId(null); setCatForm(catDefault); setCatModalOpen(true); }
  function openEditCat(e: EpiCatalogo) {
    setEditCatId(e.id);
    setCatForm({ nome: e.nome, descricao: e.descricao ?? "", ca_numero: e.ca_numero ?? "", ca_vencimento: e.ca_vencimento ?? "", categoria: e.categoria ?? "", ativo: e.ativo });
    setCatModalOpen(true);
  }
  async function handleSaveCat() {
    if (!catForm.nome.trim()) { toast({ title: "Informe o nome do EPI", variant: "destructive" }); return; }
    setSaving(true);
    const payload = { nome: catForm.nome.trim(), descricao: catForm.descricao || null, ca_numero: catForm.ca_numero || null, ca_vencimento: catForm.ca_vencimento || null, categoria: catForm.categoria || null, ativo: catForm.ativo };
    const { error } = editCatId
      ? await (supabase as any).from("sms_epis_catalogo").update(payload).eq("id", editCatId)
      : await (supabase as any).from("sms_epis_catalogo").insert([payload]);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editCatId ? "EPI atualizado!" : "EPI cadastrado!" });
    setCatModalOpen(false);
    fetchAll();
  }

  // ── Filtros ───────────────────────────────────────────────────────────────
  const estoqueFiltrado = estoque.filter(e => {
    const matchObra   = filtroObra === "all" || e.obra_id === filtroObra;
    const matchSearch = !search || e.sms_epis_catalogo?.nome?.toLowerCase().includes(search.toLowerCase()) || e.obras?.nome?.toLowerCase().includes(search.toLowerCase());
    return matchObra && matchSearch;
  });

  const entregasFiltradas = entregas.filter(e => {
    const matchObra   = filtroObra === "all" || e.obra_id === filtroObra;
    const matchSearch = !search || e.employees?.nome?.toLowerCase().includes(search.toLowerCase()) || e.sms_epis_catalogo?.nome?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filtroEntregaStatus === "todos" ? true : filtroEntregaStatus === "em_uso" ? !e.data_devolucao : !!e.data_devolucao;
    return matchObra && matchSearch && matchStatus;
  });

  const catalogoFiltrado = catalogo.filter(e =>
    !search || e.nome.toLowerCase().includes(search.toLowerCase()) || e.categoria?.toLowerCase().includes(search.toLowerCase()) || e.ca_numero?.toLowerCase().includes(search.toLowerCase())
  );

  const movsFiltrados = movimentos.filter(m =>
    (filtroObra === "all" || m.obra_id === filtroObra) &&
    (!search || m.sms_epis_catalogo?.nome?.toLowerCase().includes(search.toLowerCase()))
  );

  // ── Colaboradores: EPIs em mãos ───────────────────────────────────────────
  const colaboradoresMap: Record<string, { nome: string; epis: ColabEpi[] }> = {};
  entregas.filter(e => !e.data_devolucao).forEach(e => {
    const nome = e.employees?.nome ?? e.colaborador_id;
    if (!colaboradoresMap[e.colaborador_id]) {
      colaboradoresMap[e.colaborador_id] = { nome, epis: [] };
    }
    colaboradoresMap[e.colaborador_id].epis.push(e);
  });
  const colaboradores = Object.values(colaboradoresMap).sort((a, b) => a.nome.localeCompare(b.nome));

  const isCAVencido = (dt: string | null) => dt ? new Date(dt) < new Date() : false;
  const isCAVencendo = (dt: string | null) => {
    if (!dt) return false;
    const d = new Date(dt);
    const em60 = new Date(); em60.setDate(em60.getDate() + 60);
    return d >= new Date() && d <= em60;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-500" />
              EPIs — Equipamentos de Proteção Individual
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Estoque, entregas, devoluções e movimentações por obra
            </p>
          </div>
          <div className="flex gap-2">
            {tab === "catalogo" && (
              <Button onClick={openNovoCat} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Novo EPI
              </Button>
            )}
            {tab === "estoque" && (
              <Button onClick={() => { setEntradaForm(entradaDefault); setEntradaOpen(true); }} size="sm" variant="outline" className="gap-1.5">
                <TrendingUp className="h-4 w-4" /> Entrada de Estoque
              </Button>
            )}
            {(tab === "entregas" || tab === "colaboradores") && (
              <Button onClick={() => { setForm(entregaDefault); setModalOpen(true); }} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Registrar Entrega
              </Button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "EPIs ativos",          value: catalogo.filter(e => e.ativo).length, color: "text-foreground",  bg: "bg-muted/50" },
            { label: "Estoque abaixo mín.",   value: estoqueAbaixoMin,                    color: estoqueAbaixoMin > 0 ? "text-red-600" : "text-green-600", bg: estoqueAbaixoMin > 0 ? "bg-red-50" : "bg-green-50" },
            { label: "Entregas ativas",       value: entregasAtivas,                      color: "text-blue-600",    bg: "bg-blue-50" },
            { label: "CAs vencidos",          value: caVencidos,                          color: caVencidos > 0 ? "text-amber-600" : "text-green-600", bg: caVencidos > 0 ? "bg-amber-50" : "bg-green-50" },
          ].map(k => (
            <div key={k.label} className={cn("rounded-lg border border-border/50 px-4 py-3", k.bg)}>
              <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
              <p className={cn("text-2xl font-extrabold mt-0.5", k.color)}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Filtros globais */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar EPI, colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          {tab !== "catalogo" && (
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {tab === "entregas" && (
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["todos","em_uso","devolvido"] as const).map(s => (
                <button key={s}
                  onClick={() => setFiltroEntregaStatus(s)}
                  className={cn("px-3 py-1.5 text-xs font-medium transition-colors",
                    filtroEntregaStatus === s ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"
                  )}>
                  {s === "todos" ? "Todos" : s === "em_uso" ? "Em uso" : "Devolvidos"}
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={fetchAll} className="h-9 w-9" title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* ══ Tabs ═════════════════════════════════════════════════════════════ */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-10">
            <TabsTrigger value="estoque" className="gap-1.5 text-xs">
              <Archive className="h-3.5 w-3.5" /> Estoque
              {estoqueAbaixoMin > 0 && (
                <span className="h-4 min-w-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{estoqueAbaixoMin}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="entregas"      className="gap-1.5 text-xs"><ArrowRightLeft className="h-3.5 w-3.5" /> Entregas</TabsTrigger>
            <TabsTrigger value="colaboradores" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" /> Colaboradores</TabsTrigger>
            <TabsTrigger value="movimentos"    className="gap-1.5 text-xs"><History className="h-3.5 w-3.5" /> Movimentações</TabsTrigger>
            <TabsTrigger value="catalogo"      className="gap-1.5 text-xs"><BookMarked className="h-3.5 w-3.5" /> Catálogo</TabsTrigger>
          </TabsList>

          {/* ── Estoque ──────────────────────────────────────────────────────── */}
          <TabsContent value="estoque" className="mt-4">
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>EPI</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-center">Qtd. Atual</TableHead>
                    <TableHead className="text-center">Qtd. Mínima</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
                  ))}
                  {!loading && estoqueFiltrado.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhum estoque cadastrado</TableCell></TableRow>
                  )}
                  {!loading && estoqueFiltrado.map(e => {
                    const abaixo = e.quantidade <= e.quantidade_minima;
                    const zerado = e.quantidade === 0;
                    return (
                      <TableRow key={e.id} className={cn("hover:bg-muted/30", zerado ? "bg-red-50/60" : abaixo && "bg-amber-50/40")}>
                        <TableCell className="font-medium text-sm">{e.sms_epis_catalogo?.nome ?? "–"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">{e.sms_epis_catalogo?.categoria ?? "–"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{e.obras?.nome ?? "–"}</TableCell>
                        <TableCell className={cn("text-center font-bold text-sm", zerado ? "text-red-600" : abaixo ? "text-amber-600" : "text-foreground")}>{e.quantidade}</TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">{e.quantidade_minima}</TableCell>
                        <TableCell>
                          {zerado ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              <AlertTriangle className="h-3 w-3" /> Sem estoque
                            </span>
                          ) : abaixo ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <ShieldAlert className="h-3 w-3" /> Abaixo do mínimo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
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
          </TabsContent>

          {/* ── Entregas ─────────────────────────────────────────────────────── */}
          <TabsContent value="entregas" className="mt-4">
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Colaborador</TableHead>
                    <TableHead>EPI</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-center">Qtd.</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Condição</TableHead>
                    <TableHead className="text-center">Assinatura</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 9 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                  ))}
                  {!loading && entregasFiltradas.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">Nenhuma entrega encontrada</TableCell></TableRow>
                  )}
                  {!loading && entregasFiltradas.map(e => (
                    <TableRow key={e.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{e.employees?.nome ?? "–"}</TableCell>
                      <TableCell className="text-sm">{e.sms_epis_catalogo?.nome ?? "–"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.obras?.nome ?? "–"}</TableCell>
                      <TableCell className="text-center text-sm">{e.quantidade ?? 1}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(e.data_entrega)}</TableCell>
                      <TableCell>
                        {e.data_devolucao ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            Devolvido {fmtDate(e.data_devolucao)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Em uso</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{e.condicao ?? "–"}</TableCell>
                      <TableCell className="text-center">
                        {e.assinatura_base64 ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">✓ Assinado</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => void printFichaEpi(e)} title="Imprimir ficha">
                            <Printer className="h-3 w-3" />
                          </Button>
                          {!e.data_devolucao && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDevDialog(e)}>
                              Devolver
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Colaboradores ─────────────────────────────────────────────────── */}
          <TabsContent value="colaboradores" className="mt-4">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : colaboradores.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
                <Users className="h-10 w-10 opacity-30" />
                <p className="text-sm">Nenhum colaborador com EPI em mãos no momento</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {colaboradores
                  .filter(c => !search || c.nome.toLowerCase().includes(search.toLowerCase()))
                  .map(c => (
                    <div key={c.nome} className="rounded-xl border bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{c.nome}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {c.epis.length} EPI{c.epis.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {c.epis.map(ep => (
                          <li key={ep.id} className="flex items-center justify-between text-xs">
                            <div>
                              <span className="font-medium">{ep.sms_epis_catalogo?.nome ?? "—"}</span>
                              {ep.obras?.nome && <span className="text-muted-foreground ml-1">· {ep.obras.nome}</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">desde {fmtDate(ep.data_entrega)}</span>
                              <button onClick={() => void printFichaEpi(ep)} className="text-muted-foreground hover:text-foreground">
                                <Printer className="h-3 w-3" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </TabsContent>

          {/* ── Movimentações ─────────────────────────────────────────────────── */}
          <TabsContent value="movimentos" className="mt-4">
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Data</TableHead>
                    <TableHead>EPI</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-center">Qtd.</TableHead>
                    <TableHead>NF / Fornecedor</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                  ))}
                  {!loading && movsFiltrados.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-14 text-center text-muted-foreground">
                        <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Nenhuma movimentação registrada ainda</p>
                        <p className="text-xs mt-1">As entradas e saídas de estoque aparecerão aqui</p>
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && movsFiltrados.map(m => {
                    const cfg = TIPO_MOV_LABEL[m.tipo] ?? { label: m.tipo, cls: "bg-gray-100 text-gray-700", icon: "·" };
                    const isEntrada = m.tipo.startsWith("entrada") || m.tipo === "ajuste_positivo";
                    return (
                      <TableRow key={m.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(m.data)}</TableCell>
                        <TableCell className="text-sm font-medium">{m.sms_epis_catalogo?.nome ?? "—"}</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", cfg.cls)}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.obras?.nome ?? "—"}
                          {m.destino?.nome && <span className="text-muted-foreground"> → {m.destino.nome}</span>}
                        </TableCell>
                        <TableCell className={cn("text-center font-bold text-sm", isEntrada ? "text-green-600" : "text-red-600")}>
                          {isEntrada ? "+" : "−"}{m.quantidade}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.nota_fiscal && <span>NF {m.nota_fiscal}</span>}
                          {m.nota_fiscal && m.fornecedor && " · "}
                          {m.fornecedor}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{m.observacoes ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Catálogo ─────────────────────────────────────────────────────── */}
          <TabsContent value="catalogo" className="mt-4">
            <div className="rounded-xl border bg-card overflow-hidden">
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
                    <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
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
                    const vencido  = isCAVencido(e.ca_vencimento);
                    const vencendo = isCAVencendo(e.ca_vencimento);
                    return (
                      <TableRow key={e.id} className={cn("hover:bg-muted/30", !e.ativo && "opacity-50")}>
                        <TableCell>
                          <p className="text-sm font-medium">{e.nome}</p>
                          {e.descricao && <p className="text-xs text-muted-foreground">{e.descricao}</p>}
                        </TableCell>
                        <TableCell className="text-sm capitalize text-muted-foreground">{e.categoria ?? "–"}</TableCell>
                        <TableCell className="text-sm font-mono">{e.ca_numero ?? "–"}</TableCell>
                        <TableCell className={cn("text-sm whitespace-nowrap", vencido ? "text-red-600 font-semibold" : vencendo ? "text-amber-600 font-semibold" : "text-muted-foreground")}>
                          {e.ca_vencimento ? fmtDate(e.ca_vencimento) : "–"}
                          {vencido  && <span className="ml-1">⚠️ Vencido</span>}
                          {vencendo && <span className="ml-1">⏰ Vence em 60 dias</span>}
                        </TableCell>
                        <TableCell>
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", e.ativo ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600")}>
                            {e.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => openEditCat(e)}>
                            <Pencil className="h-3 w-3" /> Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ═══ Modal: Registrar Entrega ════════════════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-500" />
              Registrar Entrega de EPI
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Colaborador <span className="text-red-500">*</span></Label>
              <Select value={form.colaborador_id} onValueChange={v => setForm(f => ({ ...f, colaborador_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent className="max-h-56">
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>EPI <span className="text-red-500">*</span></Label>
              <Select value={form.epi_id} onValueChange={v => setForm(f => ({ ...f, epi_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o EPI" /></SelectTrigger>
                <SelectContent className="max-h-56">
                  {catalogo.filter(e => e.ativo).map(e => {
                    const venc = isCAVencido(e.ca_vencimento);
                    return (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome} {e.ca_numero ? `(CA ${e.ca_numero})` : ""} {venc ? "⚠️" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Obra</Label>
                <Select value={form.obra_id} onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Obra (opcional)" /></SelectTrigger>
                  <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data Entrega <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.data_entrega} onChange={e => setForm(f => ({ ...f, data_entrega: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input type="number" min={1} value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Condição</Label>
                <Select value={form.condicao} onValueChange={v => setForm(f => ({ ...f, condicao: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Textarea placeholder="Observações..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>

            {/* Assinatura digital */}
            <div className="space-y-2 pt-1">
              <Label className="flex items-center gap-1.5">
                <FileCheck className="h-4 w-4 text-slate-500" />
                Assinatura digital do colaborador
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <SignaturePad onChange={sig => setForm(f => ({ ...f, assinatura: sig }))} />
              {form.assinatura && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Assinatura capturada
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEntrega} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Salvando..." : "Registrar Entrega"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Modal: Entrada de Estoque ═══════════════════════════════════════ */}
      <Dialog open={entradaOpen} onOpenChange={setEntradaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Entrada de Estoque
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Tipo */}
            <div className="flex gap-2">
              {[
                { v: "compra" as const,       l: "📦 Compra / NF" },
                { v: "transferencia" as const, l: "🔄 Transferência entre obras" },
              ].map(t => (
                <button key={t.v} type="button"
                  onClick={() => setEntradaForm(f => ({ ...f, tipo: t.v }))}
                  className={cn("flex-1 rounded-lg border text-sm font-medium py-2 px-3 transition-all",
                    entradaForm.tipo === t.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"
                  )}>
                  {t.l}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>EPI <span className="text-red-500">*</span></Label>
              <Select value={entradaForm.epi_id} onValueChange={v => setEntradaForm(f => ({ ...f, epi_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o EPI" /></SelectTrigger>
                <SelectContent className="max-h-56">
                  {catalogo.filter(e => e.ativo).map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {entradaForm.tipo === "compra" ? (
              <div className="space-y-1.5">
                <Label>Obra / Local de destino <span className="text-red-500">*</span></Label>
                <Select value={entradaForm.obra_id} onValueChange={v => setEntradaForm(f => ({ ...f, obra_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Obra de origem <span className="text-red-500">*</span></Label>
                  <Select value={entradaForm.obra_id} onValueChange={v => setEntradaForm(f => ({ ...f, obra_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                    <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Obra de destino <span className="text-red-500">*</span></Label>
                  <Select value={entradaForm.obra_destino_id} onValueChange={v => setEntradaForm(f => ({ ...f, obra_destino_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger>
                    <SelectContent>{obras.filter(o => o.id !== entradaForm.obra_id).map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade <span className="text-red-500">*</span></Label>
                <Input type="number" min={1} placeholder="Ex: 50" value={entradaForm.quantidade} onChange={e => setEntradaForm(f => ({ ...f, quantidade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={entradaForm.data} onChange={e => setEntradaForm(f => ({ ...f, data: e.target.value }))} />
              </div>
            </div>

            {entradaForm.tipo === "compra" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nº da NF</Label>
                  <Input placeholder="Ex: 001234" value={entradaForm.nota_fiscal} onChange={e => setEntradaForm(f => ({ ...f, nota_fiscal: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fornecedor</Label>
                  <Input placeholder="Nome do fornecedor" value={entradaForm.fornecedor} onChange={e => setEntradaForm(f => ({ ...f, fornecedor: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} placeholder="Observações sobre esta entrada..." value={entradaForm.observacoes} onChange={e => setEntradaForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEntradaOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEntrada} disabled={saving} className="gap-1.5 bg-green-700 hover:bg-green-800">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              {saving ? "Salvando..." : "Confirmar Entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Modal: Confirmação de Devolução ════════════════════════════════ */}
      <Dialog open={!!devDialog} onOpenChange={v => !v && setDevDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-blue-600" />
              Confirmar Devolução
            </DialogTitle>
          </DialogHeader>
          {devDialog && (
            <div className="space-y-3 py-1">
              <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Colaborador</span>
                  <span className="font-medium">{devDialog.employees?.nome}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">EPI</span>
                  <span className="font-medium">{devDialog.sms_epis_catalogo?.nome}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Entregue em</span>
                  <span className="font-medium">{fmtDate(devDialog.data_entrega)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quantidade</span>
                  <span className="font-medium">{devDialog.quantidade ?? 1}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A devolução será registrada com a data de hoje e a quantidade voltará ao estoque.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevDialog(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => devDialog && handleDevolucao(devDialog)} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Processando..." : "Confirmar Devolução"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Modal: Catálogo ════════════════════════════════════════════════ */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-slate-500" />
              {editCatId ? "Editar EPI" : "Cadastrar EPI no Catálogo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Nome do EPI <span className="text-red-500">*</span></Label>
              <Input placeholder="Ex: Capacete de Segurança Aba Frontal" value={catForm.nome} onChange={e => setCatForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea placeholder="Descrição, modelo, cor, tamanho..." value={catForm.descricao} onChange={e => setCatForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={catForm.categoria} onValueChange={v => setCatForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent className="max-h-56">
                  {EPI_CATEGORIAS.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nº do CA</Label>
                <Input placeholder="Ex: 12345" value={catForm.ca_numero} onChange={e => setCatForm(f => ({ ...f, ca_numero: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Validade do CA</Label>
                <Input type="date" value={catForm.ca_vencimento} onChange={e => setCatForm(f => ({ ...f, ca_vencimento: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">EPI Ativo</p>
                <p className="text-xs text-muted-foreground">Inativos não aparecem nas entregas</p>
              </div>
              <Switch checked={catForm.ativo} onCheckedChange={v => setCatForm(f => ({ ...f, ativo: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveCat} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
              {saving ? "Salvando..." : editCatId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

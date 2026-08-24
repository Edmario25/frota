import { useState, useEffect, useCallback, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useObras } from "@/hooks/useObras";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  Package, Plus, Pencil, RefreshCw, Search, Download,
  AlertTriangle, CheckCircle2, ArrowDownToLine, ArrowUpFromLine,
  ClipboardList, BookOpen, RotateCcw, TrendingDown, ShoppingCart,
  Check, X, Boxes, Building2, ArrowLeftRight, Truck, BarChart3,
  Clock, ShieldCheck, Ban, Trash2, FileText, Printer, Send,
  ClipboardCheck, Zap, FlaskConical, TrendingUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Material {
  id: string; nome: string; unidade: string;
  categoria: string | null; codigo_interno: string | null;
  ativo: boolean; descricao: string | null;
}
interface Estoque {
  id: string; obra_id: string; material_id: string;
  quantidade: number; quantidade_minima: number; localizacao: string | null;
  materiais_catalogo: Material; obras?: { nome: string };
}
interface Movimento {
  id: string; data_movimento: string; tipo: string; quantidade: number;
  preco_unitario: number | null; frente: string | null;
  fornecedor: string | null; nota_fiscal: string | null; observacoes: string | null;
  obra_destino_id: string | null;
  materiais_catalogo: { nome: string; unidade: string };
  obras_destino?: { nome: string } | null;
}
interface ReqItem {
  id?: string; material_id: string; quantidade: string; qtd_aprovada?: string; observacao?: string;
  _mat?: Material;
}
interface Requisicao {
  id: string; numero_req: string | null; material_id: string; quantidade: number;
  urgencia: string; status: string; justificativa: string | null;
  motivo_rejeicao: string | null; observacoes_aprovador: string | null;
  data_solicitacao: string; data_necessidade: string | null;
  materiais_catalogo: { nome: string; unidade: string };
  requisicao_itens?: Array<{ id: string; quantidade: number; qtd_aprovada: number | null; material_id: string; materiais_catalogo: { nome: string; unidade: string } }>;
}
interface Fornecedor {
  id: string; nome: string; cnpj: string | null; contato_nome: string | null;
  telefone: string | null; email: string | null; categorias: string[];
  observacoes: string | null; ativo: boolean;
}
interface OcItem {
  id?: string; material_id: string; quantidade: string; unidade: string; preco_unitario: string;
  valor_total?: number; materiais_catalogo?: { nome: string };
}
interface OrdemCompra {
  id: string; numero_oc: string; requisicao_id: string | null; fornecedor_id: string | null;
  obra_id: string; status: string; data_emissao: string; prazo_entrega: string | null;
  condicoes_pagamento: string | null; local_entrega: string | null; observacoes: string | null;
  valor_total: number; created_at: string;
  fornecedores?: { nome: string; cnpj: string | null; contato_nome: string | null; telefone: string | null };
  obras?: { nome: string };
  ordens_compra_itens?: Array<{
    id: string; material_id: string; quantidade: number; unidade: string;
    preco_unitario: number; valor_total: number; materiais_catalogo?: { nome: string };
  }>;
}
interface InventarioFisico {
  id: string; obra_id: string; data_inventario: string; status: string;
  observacoes: string | null; created_at: string; obras?: { nome: string };
}
interface InvItem {
  id: string; inventario_id: string; material_id: string;
  quantidade_sistema: number; quantidade_contada: number | null; ajustado: boolean;
  materiais_catalogo?: { nome: string; unidade: string; codigo_interno: string | null };
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS = ["Cimento e Argamassa","Ferro e Aço","Madeira","Elétrico","Hidráulico",
  "Acabamento","Ferragens","Impermeabilização","EPI","Ferramentas","Outro"];
const UNIDADES   = ["un","kg","m","m²","m³","L","cx","sc","pc","t","rolo","par","jg"];
const URGENCIAS  = [
  { value: "normal",  label: "Normal",   cls: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "urgente", label: "Urgente",  cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "critico", label: "Crítico",  cls: "bg-red-100 text-red-700 border-red-200" },
];
const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pendente:  { label: "Pendente",  cls: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  aprovada:  { label: "Aprovada",  cls: "bg-green-100 text-green-700 border-green-200",   icon: Check },
  rejeitada: { label: "Rejeitada", cls: "bg-red-100 text-red-700 border-red-200",         icon: Ban },
  entregue:  { label: "Entregue",  cls: "bg-blue-100 text-blue-700 border-blue-200",      icon: CheckCircle2 },
};
const TIPOS_MOV = [
  { value: "entrada",        label: "Entrada",      icon: ArrowDownToLine,  color: "text-green-600" },
  { value: "saida",          label: "Saída",        icon: ArrowUpFromLine,  color: "text-red-600"   },
  { value: "transferencia",  label: "Transferência",icon: ArrowLeftRight,   color: "text-blue-600"  },
  { value: "ajuste",         label: "Ajuste",       icon: RotateCcw,        color: "text-purple-600"},
];
const CAN_APPROVE = ["admin","gestor_contrato","gestor_frota","gestor_obra"];

const today = () => format(new Date(), "yyyy-MM-dd");
const fmtDate = (d: string) => format(new Date(d + "T12:00"), "dd/MM/yyyy", { locale: ptBR });
const fmtQtd  = (q: number, u: string) => `${q % 1 === 0 ? q.toFixed(0) : q.toFixed(2)} ${u}`;
const moedaBR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CHART_COLORS = ["#2563eb","#16a34a","#d97706","#dc2626","#7c3aed","#0891b2","#059669","#c2410c","#7e22ce","#0369a1"];

async function printOrdemCompra(oc: OrdemCompra) {
  let companyName = "Empresa"; let logoUrl = "";
  try {
    const saved = localStorage.getItem("fleet_settings");
    if (saved) { const s = JSON.parse(saved); companyName = s.companyName ?? "Empresa"; logoUrl = s.logoUrl ?? ""; }
    if (!logoUrl) {
      const { data } = await (supabase as any).from("system_settings").select("logo_url,company_name").maybeSingle();
      if (data) { companyName = data.company_name ?? companyName; logoUrl = data.logo_url ?? ""; }
    }
  } catch { /* Mantém a identidade visual padrão se a configuração estiver inválida. */ }
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) { toast.error("Habilite popups para imprimir"); return; }
  const itensHtml = (oc.ordens_compra_itens ?? []).map((it, i) => `
    <tr>
      <td>${i+1}</td><td>${it.materiais_catalogo?.nome ?? "—"}</td>
      <td>${it.unidade}</td>
      <td class="r">${Number(it.quantidade).toLocaleString("pt-BR",{minimumFractionDigits:2})}</td>
      <td class="r">${it.preco_unitario ? "R$ "+Number(it.preco_unitario).toLocaleString("pt-BR",{minimumFractionDigits:2}) : "—"}</td>
      <td class="r">${it.valor_total ? "R$ "+Number(it.valor_total).toLocaleString("pt-BR",{minimumFractionDigits:2}) : "—"}</td>
    </tr>`).join("");
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Ordem de Compra ${oc.numero_oc}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px}
.hdr{display:flex;align-items:center;gap:16px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
.logo{width:56px;height:56px;object-fit:contain}.co{font-size:17px;font-weight:700}.sub{font-size:11px;color:#555}
.ocn{margin-left:auto;text-align:right}.ocnum{font-size:22px;font-weight:700}.ocdt{font-size:10px;color:#666}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px}
.sec-t{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border-bottom:1px solid #ddd;padding-bottom:2px;margin-bottom:6px}
.f{margin-bottom:3px}.f label{font-size:9px;color:#888;display:block}.f span{font-weight:600}
table{width:100%;border-collapse:collapse;margin-top:6px}
th{background:#111;color:#fff;padding:5px 8px;font-size:10px;text-align:left}
td{padding:5px 8px;border-bottom:1px solid #eee;font-size:10px}
tr:nth-child(even) td{background:#f8f8f8}.r{text-align:right}th.r{text-align:right}
.tot td{font-weight:700;background:#f0f0f0;border-top:2px solid #111}
.footer{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:60px}
.sign{border-top:1px solid #333;padding-top:4px;text-align:center;font-size:10px;color:#555}
.badge{display:inline-block;padding:2px 10px;border-radius:4px;font-weight:700;font-size:10px;
  background:${oc.status==='recebida'?'#dcfce7':oc.status==='cancelada'?'#fee2e2':'#fef9c3'};
  color:${oc.status==='recebida'?'#166534':oc.status==='cancelada'?'#991b1b':'#713f12'}}
@media print{body{padding:10px}}
</style></head><body>
<div class="hdr">
  ${logoUrl?`<img src="${logoUrl}" class="logo"/>`:""}
  <div><div class="co">${companyName}</div><div class="sub">ORDEM DE COMPRA</div></div>
  <div class="ocn">
    <div class="ocnum">${oc.numero_oc}</div>
    <div class="ocdt">Emitida em ${new Date(oc.data_emissao+"T12:00").toLocaleDateString("pt-BR")}</div>
    <div style="margin-top:4px"><span class="badge">${oc.status.toUpperCase()}</span></div>
  </div>
</div>
<div class="g2">
  <div>
    <div class="sec-t">Fornecedor</div>
    <div class="f"><label>Nome</label><span>${oc.fornecedores?.nome ?? "Não informado"}</span></div>
    ${oc.fornecedores?.cnpj?`<div class="f"><label>CNPJ</label><span>${oc.fornecedores.cnpj}</span></div>`:""}
    ${oc.fornecedores?.contato_nome?`<div class="f"><label>Contato</label><span>${oc.fornecedores.contato_nome}</span></div>`:""}
    ${oc.fornecedores?.telefone?`<div class="f"><label>Telefone</label><span>${oc.fornecedores.telefone}</span></div>`:""}
  </div>
  <div>
    <div class="sec-t">Entrega</div>
    <div class="f"><label>Obra / Local</label><span>${oc.obras?.nome ?? "—"}</span></div>
    ${oc.local_entrega?`<div class="f"><label>Endereço</label><span>${oc.local_entrega}</span></div>`:""}
    ${oc.prazo_entrega?`<div class="f"><label>Prazo</label><span>${new Date(oc.prazo_entrega+"T12:00").toLocaleDateString("pt-BR")}</span></div>`:""}
    ${oc.condicoes_pagamento?`<div class="f"><label>Pagamento</label><span>${oc.condicoes_pagamento}</span></div>`:""}
  </div>
</div>
<div class="sec-t">Itens da Ordem</div>
<table>
  <thead><tr><th>#</th><th>Material</th><th>Un.</th><th class="r">Qtd.</th><th class="r">Preço Unit.</th><th class="r">Total</th></tr></thead>
  <tbody>${itensHtml}
    <tr class="tot"><td colspan="5">TOTAL GERAL</td><td class="r">R$ ${Number(oc.valor_total??0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
  </tbody>
</table>
${oc.observacoes?`<div style="margin-top:14px"><div class="sec-t">Observações</div><p>${oc.observacoes}</p></div>`:""}
<div class="footer">
  <div class="sign">Assinatura do Gestor / Solicitante</div>
  <div class="sign">Assinatura do Fornecedor / Recebimento</div>
</div>
</body></html>`);
  win.document.close(); setTimeout(() => win.print(), 500);
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function Almoxarifado() {
  const { role } = useUserRole();
  const { obras } = useObras();
  const [materiais,    setMateriais]   = useState<Material[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [obraId,       setObraId]      = useState("");
  const [tabPendentes, setTabPendentes] = useState(0);

  const canApprove = CAN_APPROVE.includes(role ?? "");

  const fetchMateriais = useCallback(async () => {
    const { data } = await (supabase as any).from("materiais_catalogo").select("*").order("nome");
    setMateriais((data ?? []) as Material[]);
  }, []);

  const fetchFornecedores = useCallback(async () => {
    const { data } = await (supabase as any).from("fornecedores").select("*").order("nome");
    setFornecedores((data ?? []) as Fornecedor[]);
  }, []);

  const fetchPendentes = useCallback(async () => {
    const { count } = await (supabase as any)
      .from("requisicoes_compra").select("id", { count: "exact", head: true })
      .eq("status", "pendente");
    setTabPendentes(count ?? 0);
  }, []);

  useEffect(() => { fetchMateriais(); fetchFornecedores(); fetchPendentes(); }, [fetchMateriais, fetchFornecedores, fetchPendentes]);

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-500" /> Almoxarifado
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Controle de materiais, estoque, requisições e fornecedores por obra
            </p>
          </div>
          {canApprove && tabPendentes > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-700">
                {tabPendentes} requisição{tabPendentes > 1 ? "ões" : ""} aguardando aprovação
              </span>
            </div>
          )}
        </div>

        <Tabs defaultValue={canApprove && tabPendentes > 0 ? "requisicoes" : "estoque"}>
          <TabsList className="h-10 flex-wrap">
            <TabsTrigger value="estoque"       className="gap-1.5 text-xs"><Package className="h-3.5 w-3.5" /> Estoque</TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1.5 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Movimentações</TabsTrigger>
            <TabsTrigger value="requisicoes"   className="gap-1.5 text-xs relative">
              <ShoppingCart className="h-3.5 w-3.5" /> Requisições
              {tabPendentes > 0 && (
                <span className="ml-1 h-4 min-w-4 px-1 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {tabPendentes}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ordens"        className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> Ordens de Compra</TabsTrigger>
            <TabsTrigger value="fornecedores"  className="gap-1.5 text-xs"><Truck className="h-3.5 w-3.5" /> Fornecedores</TabsTrigger>
            <TabsTrigger value="relatorios"    className="gap-1.5 text-xs"><TrendingUp className="h-3.5 w-3.5" /> Relatórios</TabsTrigger>
            <TabsTrigger value="inventario"    className="gap-1.5 text-xs"><ClipboardCheck className="h-3.5 w-3.5" /> Inventário</TabsTrigger>
            <TabsTrigger value="catalogo"      className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" /> Catálogo</TabsTrigger>
          </TabsList>

          <TabsContent value="estoque">
            <EstoqueTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} fornecedores={fornecedores} />
          </TabsContent>
          <TabsContent value="movimentacoes">
            <MovimentacoesTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} fornecedores={fornecedores} />
          </TabsContent>
          <TabsContent value="requisicoes">
            <RequisicoesTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} canApprove={canApprove} onPendentesChange={fetchPendentes} />
          </TabsContent>
          <TabsContent value="ordens">
            <OrdemCompraTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} fornecedores={fornecedores} canEdit={canApprove} />
          </TabsContent>
          <TabsContent value="fornecedores">
            <FornecedoresTab fornecedores={fornecedores} onRefresh={fetchFornecedores} canEdit={canApprove} />
          </TabsContent>
          <TabsContent value="relatorios">
            <RelatoriosTab obras={obras} obraId={obraId} setObraId={setObraId} />
          </TabsContent>
          <TabsContent value="inventario">
            <InventarioTab obras={obras} obraId={obraId} setObraId={setObraId} materiais={materiais} canEdit={canApprove} />
          </TabsContent>
          <TabsContent value="catalogo">
            <CatalogoTab materiais={materiais} onRefresh={fetchMateriais} canEdit={canApprove} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTOQUE
// ═══════════════════════════════════════════════════════════════════════════════
function EstoqueTab({ obras, obraId, setObraId, materiais, fornecedores }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
  materiais: Material[]; fornecedores: Fornecedor[];
}) {
  const [estoque,    setEstoque]    = useState<Estoque[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [catFiltro,  setCatFiltro]  = useState("all");
  const [movOpen,    setMovOpen]    = useState(false);
  const [selMat,     setSelMat]     = useState<Estoque | null>(null);
  const [autoReqOpen,setAutoReqOpen]= useState(false);

  const fetchEstoque = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("almoxarifado_estoque")
      .select("*, materiais_catalogo(*)")
      .eq("obra_id", obraId)
      .order("quantidade", { ascending: true });
    setEstoque((data ?? []) as Estoque[]);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  const zerado  = estoque.filter(e => e.quantidade === 0).length;
  const alerta  = estoque.filter(e => e.quantidade > 0 && e.quantidade_minima > 0 && e.quantidade <= e.quantidade_minima).length;
  const ok      = estoque.length - zerado - alerta;
  const valorTotal = estoque.reduce((s, e) => s + e.quantidade, 0);

  const categorias = [...new Set(estoque.map(e => e.materiais_catalogo.categoria).filter(Boolean))];

  const filtered = estoque.filter(e => {
    const matchSearch = !search || e.materiais_catalogo.nome.toLowerCase().includes(search.toLowerCase()) ||
      (e.materiais_catalogo.codigo_interno ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCat = catFiltro === "all" || e.materiais_catalogo.categoria === catFiltro;
    return matchSearch && matchCat;
  });

  function exportCSV() {
    const obraNome = obras.find(o => o.id === obraId)?.nome ?? obraId;
    const rows = ["Material,Categoria,Unidade,Quantidade,Mínimo,Localização,Status"].concat(
      filtered.map(e => {
        const s = e.quantidade === 0 ? "Zerado" : e.quantidade <= e.quantidade_minima && e.quantidade_minima > 0 ? "Alerta" : "OK";
        return `"${e.materiais_catalogo.nome}","${e.materiais_catalogo.categoria ?? ""}","${e.materiais_catalogo.unidade}",${e.quantidade},${e.quantidade_minima},"${e.localizacao ?? ""}","${s}"`;
      })
    ).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8" }));
    a.download = `estoque_${obraNome}_${today()}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Filtro de obra */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
            <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {obraId && (
          <>
            <Button onClick={() => { setSelMat(null); setMovOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Movimentação
            </Button>
            {(zerado + alerta) > 0 && (
              <Button variant="outline" onClick={() => setAutoReqOpen(true)}
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
                <Zap className="h-4 w-4" /> Auto-Requisição ({zerado + alerta})
              </Button>
            )}
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchEstoque}><RefreshCw className="h-4 w-4" /></Button>
          </>
        )}
      </div>

      {!obraId && <EmptyState icon={Package} msg="Selecione uma obra para ver o estoque." />}

      {obraId && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Itens em estoque", value: estoque.length,  icon: Boxes,         cls: "bg-muted/50" },
              { label: "Zerados",          value: zerado,          icon: TrendingDown,  cls: zerado  > 0 ? "bg-red-50 border-red-200" : "bg-muted/50" },
              { label: "Abaixo do mínimo", value: alerta,          icon: AlertTriangle, cls: alerta  > 0 ? "bg-amber-50 border-amber-200" : "bg-muted/50" },
              { label: "Regulares",        value: ok,              icon: CheckCircle2,  cls: "bg-green-50 border-green-200" },
            ].map(s => (
              <div key={s.label} className={cn("rounded-xl border p-4 flex items-center gap-3", s.cls)}>
                <s.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-2xl font-extrabold leading-none">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros da tabela */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <Select value={catFiltro} onValueChange={setCatFiltro}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categorias.map(c => <SelectItem key={c!} value={c!}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tabela */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Material</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    {estoque.length === 0 ? "Nenhum material no estoque. Registre a primeira entrada." : "Nenhum resultado para os filtros aplicados."}
                  </TableCell></TableRow>
                )}
                {!loading && filtered.map(e => {
                  const isZerado = e.quantidade === 0;
                  const isAlerta = !isZerado && e.quantidade_minima > 0 && e.quantidade <= e.quantidade_minima;
                  return (
                    <TableRow key={e.id} className={cn("hover:bg-muted/30", isZerado ? "bg-red-50/40" : isAlerta ? "bg-amber-50/40" : "")}>
                      <TableCell>
                        <p className="font-medium text-sm">{e.materiais_catalogo.nome}</p>
                        {e.materiais_catalogo.codigo_interno && <p className="text-xs text-muted-foreground font-mono">{e.materiais_catalogo.codigo_interno}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{e.materiais_catalogo.categoria ?? "—"}</TableCell>
                      <TableCell className={cn("text-right font-bold text-sm tabular-nums", isZerado ? "text-red-600" : isAlerta ? "text-amber-600" : "text-foreground")}>
                        {fmtQtd(e.quantidade, e.materiais_catalogo.unidade)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {e.quantidade_minima > 0 ? fmtQtd(e.quantidade_minima, e.materiais_catalogo.unidade) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.localizacao ?? "—"}</TableCell>
                      <TableCell>
                        {isZerado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            <TrendingDown className="h-3 w-3" /> Zerado
                          </span>
                        ) : isAlerta ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                            <AlertTriangle className="h-3 w-3" /> Alerta
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => { setSelMat(e); setMovOpen(true); }}>
                          <Plus className="h-3 w-3" /> Mov.
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <MovimentacaoModal open={movOpen} onClose={() => setMovOpen(false)} obraId={obraId} obras={obras} materiais={materiais} fornecedores={fornecedores} preselMaterialId={selMat?.material_id} onSaved={fetchEstoque} />
      <AutoReqDialog open={autoReqOpen} onClose={() => setAutoReqOpen(false)} obraId={obraId} obras={obras} itensAlerta={estoque.filter(e => (e.quantidade === 0 || (e.quantidade_minima > 0 && e.quantidade <= e.quantidade_minima)))} materiais={materiais} onSaved={fetchEstoque} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVIMENTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
function MovimentacoesTab({ obras, obraId, setObraId, materiais, fornecedores }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
  materiais: Material[]; fornecedores: Fornecedor[];
}) {
  const [movs,    setMovs]    = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [movOpen, setMovOpen] = useState(false);
  const [dataIni, setDataIni] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(today());
  const [filtroTipo, setFiltroTipo] = useState("all");
  const [search, setSearch]   = useState("");

  const fetchMovs = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("almoxarifado_movimentos")
      .select("*, materiais_catalogo(nome, unidade), obras_destino:obra_destino_id(nome)")
      .eq("obra_id", obraId)
      .gte("data_movimento", dataIni)
      .lte("data_movimento", dataFim)
      .order("created_at", { ascending: false });
    setMovs((data ?? []) as Movimento[]);
    setLoading(false);
  }, [obraId, dataIni, dataFim]);

  useEffect(() => { fetchMovs(); }, [fetchMovs]);

  const totalEntradas = movs.filter(m => m.tipo === "entrada").reduce((s, m) => s + m.quantidade, 0);
  const totalSaidas   = movs.filter(m => m.tipo === "saida").reduce((s, m) => s + m.quantidade, 0);

  const filtered = movs.filter(m => {
    const matchTipo   = filtroTipo === "all" || m.tipo === filtroTipo;
    const matchSearch = !search || m.materiais_catalogo.nome.toLowerCase().includes(search.toLowerCase());
    return matchTipo && matchSearch;
  });

  return (
    <div className="space-y-4 mt-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>De</Label><Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="w-36" /></div>
        <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" /></div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TIPOS_MOV.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setMovOpen(true)} disabled={!obraId} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Movimentação
        </Button>
        <Button variant="ghost" size="icon" onClick={fetchMovs}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {!obraId && <EmptyState icon={ClipboardList} msg="Selecione uma obra para ver as movimentações." />}

      {obraId && (
        <>
          {/* Mini KPIs */}
          {(() => {
            const custoEntradas = movs.filter(m=>m.tipo==="entrada" && m.preco_unitario).reduce((s,m)=>s+(m.preco_unitario??0)*m.quantidade,0);
            const custoSaidas   = movs.filter(m=>m.tipo==="saida"   && m.preco_unitario).reduce((s,m)=>s+(m.preco_unitario??0)*m.quantidade,0);
            const custoTotal    = movs.filter(m=>m.preco_unitario).reduce((s,m)=>s+(m.preco_unitario??0)*m.quantidade,0);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-lg font-extrabold text-green-600">{movs.filter(m=>m.tipo==="entrada").length}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Entradas</p>
                  {custoEntradas > 0 && <p className="text-xs font-bold text-green-700 mt-0.5">{moedaBR(custoEntradas)}</p>}
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-lg font-extrabold text-red-600">{movs.filter(m=>m.tipo==="saida").length}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Saídas</p>
                  {custoSaidas > 0 && <p className="text-xs font-bold text-red-700 mt-0.5">{moedaBR(custoSaidas)}</p>}
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-lg font-extrabold">{movs.length}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Total registros</p>
                </div>
                <div className={cn("rounded-xl border p-3", custoTotal > 0 ? "bg-blue-50 border-blue-200" : "bg-card")}>
                  <p className={cn("text-lg font-extrabold", custoTotal > 0 ? "text-blue-700" : "text-muted-foreground")}>{moedaBR(custoTotal)}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Custo total período</p>
                  {custoTotal === 0 && <p className="text-[10px] text-muted-foreground mt-0.5">Informe preço nas entradas</p>}
                </div>
              </div>
            );
          })()}

          {/* Busca */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Frente / Destino</TableHead>
                  <TableHead>Fornecedor / NF</TableHead>
                  <TableHead className="text-right">Valor Unit.</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">Nenhuma movimentação no período.</TableCell></TableRow>
                )}
                {!loading && filtered.map(m => {
                  const ti = TIPOS_MOV.find(t => t.value === m.tipo)!;
                  const isEntrada = m.tipo === "entrada";
                  const isSaida   = m.tipo === "saida";
                  return (
                    <TableRow key={m.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm tabular-nums whitespace-nowrap">{fmtDate(m.data_movimento)}</TableCell>
                      <TableCell>
                        <span className={cn("flex items-center gap-1 text-xs font-semibold", ti.color)}>
                          <ti.icon className="h-3.5 w-3.5" />{ti.label}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{m.materiais_catalogo.nome}</TableCell>
                      <TableCell className={cn("text-right font-bold text-sm tabular-nums",
                        isEntrada ? "text-green-600" : isSaida ? "text-red-600" : "text-blue-600")}>
                        {isEntrada ? "+" : isSaida ? "−" : "↔"}{fmtQtd(m.quantidade, m.materiais_catalogo.unidade)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.frente ?? (m.obras_destino?.nome ? `→ ${m.obras_destino.nome}` : "—")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.fornecedor && <span>{m.fornecedor}</span>}
                        {m.fornecedor && m.nota_fiscal && " · "}
                        {m.nota_fiscal && <span className="font-mono text-xs">NF {m.nota_fiscal}</span>}
                        {!m.fornecedor && !m.nota_fiscal && "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {m.preco_unitario ? moedaBR(m.preco_unitario) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-semibold">
                        {m.preco_unitario
                          ? <span className={m.tipo === "entrada" ? "text-green-700" : m.tipo === "saida" ? "text-red-700" : "text-foreground"}>
                              {moedaBR(m.preco_unitario * m.quantidade)}
                            </span>
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && filtered.some(m => m.preco_unitario) && (
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={6} className="text-right text-sm text-muted-foreground">Total do período:</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">—</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-extrabold">
                      {moedaBR(filtered.filter(m=>m.preco_unitario).reduce((s,m)=>s+(m.preco_unitario??0)*m.quantidade,0))}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <MovimentacaoModal open={movOpen} onClose={() => setMovOpen(false)} obraId={obraId} obras={obras} materiais={materiais} fornecedores={fornecedores} onSaved={fetchMovs} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUISIÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
function RequisicoesTab({ obras, obraId, setObraId, materiais, canApprove, onPendentesChange }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
  materiais: Material[]; canApprove: boolean; onPendentesChange: () => void;
}) {
  const [reqs,         setReqs]         = useState<Requisicao[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [reqOpen,      setReqOpen]      = useState(false);
  const [rejDialog,    setRejDialog]    = useState<Requisicao | null>(null);
  const [motivoRej,    setMotivoRej]    = useState("");
  const [saving,       setSaving]       = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const [ocFromReq,    setOcFromReq]    = useState<Requisicao | null>(null);

  const fetchReqs = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("requisicoes_compra")
      .select("*, materiais_catalogo(nome, unidade), requisicao_itens(id, quantidade, qtd_aprovada, material_id, materiais_catalogo(nome, unidade))")
    if (obraId) q = q.eq("obra_id", obraId);
    if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
    const { data } = await q.order("created_at", { ascending: false }).limit(100);
    setReqs((data ?? []) as Requisicao[]);
    setLoading(false);
  }, [obraId, filtroStatus]);

  useEffect(() => { fetchReqs(); }, [fetchReqs]);

  async function handleAprovar(req: Requisicao) {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("requisicoes_compra")
        .update({ status: "aprovada", aprovado_por: user?.id, motivo_rejeicao: null })
        .eq("id", req.id);
      if (error) throw error;
      toast.success(`✅ Requisição ${req.numero_req ?? ""} aprovada!`);
      fetchReqs(); onPendentesChange();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleRejeitar() {
    if (!rejDialog) return;
    if (!motivoRej.trim()) { toast.error("Informe o motivo da rejeição"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("requisicoes_compra")
        .update({ status: "rejeitada", aprovado_por: user?.id, motivo_rejeicao: motivoRej.trim() })
        .eq("id", rejDialog.id);
      if (error) throw error;
      toast.success("Requisição rejeitada.");
      setRejDialog(null); setMotivoRej("");
      fetchReqs(); onPendentesChange();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleEntregue(req: Requisicao) {
    setSaving(true);
    try {
      await (supabase as any).from("requisicoes_compra").update({ status: "entregue" }).eq("id", req.id);
      toast.success("Marcado como entregue!");
      fetchReqs(); onPendentesChange();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  const counts = {
    pendente:  reqs.filter(r => r.status === "pendente").length,
    aprovada:  reqs.filter(r => r.status === "aprovada").length,
    rejeitada: reqs.filter(r => r.status === "rejeitada").length,
    entregue:  reqs.filter(r => r.status === "entregue").length,
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId || "all"} onValueChange={v => setObraId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas as obras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setReqOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Requisição
        </Button>
        <Button variant="ghost" size="icon" onClick={fetchReqs}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 flex-wrap">
        {([["todos","Todos","bg-muted text-muted-foreground"],
           ["pendente","Pendentes","bg-amber-100 text-amber-700 border border-amber-200"],
           ["aprovada","Aprovadas","bg-green-100 text-green-700 border border-green-200"],
           ["rejeitada","Rejeitadas","bg-red-100 text-red-700 border border-red-200"],
           ["entregue","Entregues","bg-blue-100 text-blue-700 border border-blue-200"],
        ] as const).map(([val, label, cls]) => (
          <button key={val} onClick={() => setFiltroStatus(val)}
            className={cn("px-3 py-1 rounded-full text-xs font-semibold transition-all border border-transparent",
              filtroStatus === val ? cls + " ring-2 ring-offset-1 ring-current" : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}>
            {label}
            {val !== "todos" && counts[val as keyof typeof counts] > 0 && (
              <span className="ml-1.5 font-mono">{counts[val as keyof typeof counts]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Banner de permissão para não-gestores */}
      {!canApprove && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <ShieldCheck className="h-4 w-4 flex-shrink-0" />
          <span>Apenas <strong>Gestores de Obra</strong> podem aprovar ou rejeitar requisições.</span>
        </div>
      )}

      {/* Lista */}
      {loading && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>}

      {!loading && reqs.length === 0 && (
        <EmptyState icon={ShoppingCart} msg={`Nenhuma requisição ${filtroStatus !== "todos" ? `"${filtroStatus}"` : ""} encontrada.`} />
      )}

      <div className="space-y-3">
        {!loading && reqs.map(r => {
          const urg = URGENCIAS.find(u => u.value === r.urgencia);
          const sts = STATUS_CFG[r.status] ?? STATUS_CFG.pendente;
          const StsIcon = sts.icon;

          // Itens: multi-item ou item único da requisição
          const itens = r.requisicao_itens && r.requisicao_itens.length > 0
            ? r.requisicao_itens
            : [{ id: r.id, material_id: r.material_id, quantidade: r.quantidade, qtd_aprovada: null, materiais_catalogo: r.materiais_catalogo }];

          return (
            <div key={r.id} className={cn("rounded-xl border bg-card p-4 shadow-sm",
              r.status === "pendente" && canApprove ? "border-amber-200 shadow-amber-100/50" : "")}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  {/* Cabeçalho */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {r.numero_req && (
                      <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {r.numero_req}
                      </span>
                    )}
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", sts.cls)}>
                      <StsIcon className="h-3 w-3" /> {sts.label}
                    </span>
                    {urg && (
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", urg.cls)}>
                        {urg.label}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {fmtDate(r.data_solicitacao)}
                      {r.data_necessidade && <> · necessário até <strong>{fmtDate(r.data_necessidade)}</strong></>}
                    </span>
                  </div>

                  {/* Itens */}
                  <div className="space-y-1 mb-2">
                    {itens.map((it, idx) => (
                      <div key={it.id ?? idx} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground text-xs w-4 text-right">{idx + 1}.</span>
                        <span className="font-medium">{it.materiais_catalogo?.nome ?? "—"}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="tabular-nums">{fmtQtd(it.quantidade, it.materiais_catalogo?.unidade ?? "un")}</span>
                        {it.qtd_aprovada != null && it.qtd_aprovada !== it.quantidade && (
                          <span className="text-xs text-amber-600">(aprovado: {fmtQtd(it.qtd_aprovada, it.materiais_catalogo?.unidade ?? "un")})</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {r.justificativa && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{r.justificativa}</p>
                  )}
                  {r.motivo_rejeicao && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                      <Ban className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span><strong>Motivo da rejeição:</strong> {r.motivo_rejeicao}</span>
                    </div>
                  )}
                  {r.observacoes_aprovador && !r.motivo_rejeicao && (
                    <p className="text-xs text-muted-foreground mt-1">Obs. do aprovador: {r.observacoes_aprovador}</p>
                  )}
                </div>

                {/* Ações */}
                {canApprove && r.status === "pendente" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" className="gap-1 bg-green-700 hover:bg-green-800 text-white h-8"
                      onClick={() => handleAprovar(r)} disabled={saving}>
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 h-8"
                      onClick={() => { setRejDialog(r); setMotivoRej(""); }} disabled={saving}>
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </Button>
                  </div>
                )}
                {r.status === "aprovada" && (
                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" className="gap-1 text-green-600 border-green-300 hover:bg-green-50 h-8"
                      onClick={() => setOcFromReq(r)} disabled={saving}>
                      <FileText className="h-3.5 w-3.5" /> Gerar OC
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 h-8"
                      onClick={() => handleEntregue(r)} disabled={saving}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Entregue
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Rejeição */}
      <Dialog open={!!rejDialog} onOpenChange={v => !v && setRejDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" /> Rejeitar Requisição
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {rejDialog?.numero_req && (
              <p className="text-sm text-muted-foreground">Requisição <strong>{rejDialog.numero_req}</strong></p>
            )}
            <div className="space-y-1.5">
              <Label>Motivo da rejeição <span className="text-red-500">*</span></Label>
              <Textarea
                rows={3}
                placeholder="Informe o motivo para o solicitante..."
                value={motivoRej}
                onChange={e => setMotivoRej(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejDialog(null)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRejeitar} disabled={saving || !motivoRej.trim()} className="gap-1">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova Requisição */}
      <RequisicaoModal open={reqOpen} onClose={() => setReqOpen(false)} obraId={obraId} obras={obras} materiais={materiais} onSaved={() => { fetchReqs(); onPendentesChange(); }} />
      {/* Modal Gerar OC a partir de requisição */}
      <OrdemCompraModal open={!!ocFromReq} onClose={() => setOcFromReq(null)} obraId={ocFromReq?.obra_id ?? obraId} obras={obras} materiais={materiais} fornecedores={[]} fromReq={ocFromReq ?? undefined} onSaved={() => setOcFromReq(null)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORNECEDORES
// ═══════════════════════════════════════════════════════════════════════════════
function FornecedoresTab({ fornecedores, onRefresh, canEdit }: {
  fornecedores: Fornecedor[]; onRefresh: () => void; canEdit: boolean;
}) {
  const [search,    setSearch]   = useState("");
  const [open,      setOpen]     = useState(false);
  const [editing,   setEditing]  = useState<Fornecedor | null>(null);
  const [form,      setForm]     = useState({ nome: "", cnpj: "", contato_nome: "", telefone: "", email: "", categorias: "", observacoes: "", ativo: true });
  const [saving,    setSaving]   = useState(false);

  function openNew()  { setEditing(null); setForm({ nome:"",cnpj:"",contato_nome:"",telefone:"",email:"",categorias:"",observacoes:"",ativo:true }); setOpen(true); }
  function openEdit(f: Fornecedor) {
    setEditing(f);
    setForm({ nome:f.nome, cnpj:f.cnpj??"", contato_nome:f.contato_nome??"", telefone:f.telefone??"", email:f.email??"", categorias:(f.categorias??[]).join(", "), observacoes:f.observacoes??"", ativo:f.ativo });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error("Informe o nome do fornecedor"); return; }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(), cnpj: form.cnpj || null,
      contato_nome: form.contato_nome || null, telefone: form.telefone || null,
      email: form.email || null,
      categorias: form.categorias ? form.categorias.split(",").map(c => c.trim()).filter(Boolean) : [],
      observacoes: form.observacoes || null, ativo: form.ativo,
    };
    const { error } = editing
      ? await (supabase as any).from("fornecedores").update(payload).eq("id", editing.id)
      : await (supabase as any).from("fornecedores").insert([payload]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Fornecedor atualizado!" : "Fornecedor cadastrado!");
    setOpen(false); onRefresh();
  }

  const filtered = fornecedores.filter(f =>
    !search || f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.cnpj ?? "").includes(search) || (f.contato_nome ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        {canEdit && <Button onClick={openNew} className="gap-2 ml-auto"><Plus className="h-4 w-4" /> Novo Fornecedor</Button>}
        <Button variant="ghost" size="icon" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Truck} msg={fornecedores.length === 0 ? "Nenhum fornecedor cadastrado ainda." : "Nenhum resultado para a busca."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(f => (
            <div key={f.id} className={cn("rounded-xl border bg-card p-4 space-y-2", !f.ativo && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{f.nome}</p>
                  {f.cnpj && <p className="text-xs font-mono text-muted-foreground">{f.cnpj}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    f.ativo ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                    {f.ativo ? "Ativo" : "Inativo"}
                  </span>
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {f.contato_nome && <p className="text-xs text-muted-foreground">👤 {f.contato_nome}</p>}
              {f.telefone     && <p className="text-xs text-muted-foreground">📞 {f.telefone}</p>}
              {f.email        && <p className="text-xs text-muted-foreground truncate">✉️ {f.email}</p>}
              {f.categorias?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {f.categorias.map(c => (
                    <span key={c} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-slate-500" /> {editing ? "Editar Fornecedor" : "Novo Fornecedor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input placeholder="Razão social ou nome fantasia" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>CNPJ</Label><Input placeholder="00.000.000/0001-00" value={form.cnpj} onChange={e => setForm(f => ({...f, cnpj: e.target.value}))} /></div>
              <div className="space-y-1.5"><Label>Contato</Label><Input placeholder="Nome do contato" value={form.contato_nome} onChange={e => setForm(f => ({...f, contato_nome: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Telefone</Label><Input placeholder="(00) 00000-0000" value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} /></div>
              <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" placeholder="contato@..." value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Categorias fornecidas <span className="text-xs text-muted-foreground">(separadas por vírgula)</span></Label>
              <Input placeholder="Cimento, Ferro, Hidráulico..." value={form.categorias} onChange={e => setForm(f => ({...f, categorias: e.target.value}))} />
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} /></div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
              <Label className="cursor-pointer">Fornecedor ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({...f, ativo: v}))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════════
function CatalogoTab({ materiais, onRefresh, canEdit }: { materiais: Material[]; onRefresh: () => void; canEdit: boolean }) {
  const [search,    setSearch]  = useState("");
  const [catFiltro, setCat]     = useState("all");
  const [open,      setOpen]    = useState(false);
  const [editing,   setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState({ nome:"", descricao:"", unidade:"un", categoria:"", codigo:"", ativo:true });
  const [saving, setSaving] = useState(false);

  function openNew()  { setEditing(null); setForm({nome:"",descricao:"",unidade:"un",categoria:"",codigo:"",ativo:true}); setOpen(true); }
  function openEdit(m: Material) {
    setEditing(m);
    setForm({nome:m.nome,descricao:m.descricao??"",unidade:m.unidade,categoria:m.categoria??"",codigo:m.codigo_interno??"",ativo:m.ativo});
    setOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error("Informe o nome do material"); return; }
    setSaving(true);
    const payload = { nome:form.nome.trim(), descricao:form.descricao||null, unidade:form.unidade, categoria:form.categoria||null, codigo_interno:form.codigo||null, ativo:form.ativo };
    const { error } = editing
      ? await (supabase as any).from("materiais_catalogo").update(payload).eq("id", editing.id)
      : await (supabase as any).from("materiais_catalogo").insert([payload]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Material atualizado!" : "Material cadastrado!");
    setOpen(false); onRefresh();
  }

  const cats = [...new Set(materiais.map(m => m.categoria).filter(Boolean))];
  const filtered = materiais.filter(m => {
    const ms = !search || m.nome.toLowerCase().includes(search.toLowerCase()) || (m.categoria ?? "").toLowerCase().includes(search.toLowerCase()) || (m.codigo_interno ?? "").toLowerCase().includes(search.toLowerCase());
    const mc = catFiltro === "all" || m.categoria === catFiltro;
    return ms && mc;
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={catFiltro} onValueChange={setCat}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {cats.map(c => <SelectItem key={c!} value={c!}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} de {materiais.length}</span>
        {canEdit && <Button onClick={openNew} className="gap-2 ml-auto"><Plus className="h-4 w-4" /> Novo Material</Button>}
        <Button variant="ghost" size="icon" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Material</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                {materiais.length === 0 ? "Nenhum material cadastrado." : "Sem resultados para os filtros."}
              </TableCell></TableRow>
            )}
            {filtered.map(m => (
              <TableRow key={m.id} className={cn("hover:bg-muted/30", !m.ativo && "opacity-50")}>
                <TableCell>
                  <p className="font-medium text-sm">{m.nome}</p>
                  {m.descricao && <p className="text-xs text-muted-foreground truncate max-w-56">{m.descricao}</p>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground capitalize">{m.categoria ?? "—"}</TableCell>
                <TableCell><span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{m.unidade}</span></TableCell>
                <TableCell className="text-sm font-mono text-muted-foreground">{m.codigo_interno ?? "—"}</TableCell>
                <TableCell>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                    m.ativo ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                    {m.ativo ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(m)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-500" /> {editing ? "Editar Material" : "Novo Material"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5"><Label>Nome <span className="text-red-500">*</span></Label><Input value={form.nome} onChange={e => setForm(f=>({...f,nome:e.target.value}))} placeholder="Ex: Cimento Portland CP-II" /></div>
            <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={e => setForm(f=>({...f,descricao:e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select value={form.unidade} onValueChange={v => setForm(f=>({...f,unidade:v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIDADES.map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={v => setForm(f=>({...f,categoria:v}))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Código interno</Label><Input value={form.codigo} onChange={e => setForm(f=>({...f,codigo:e.target.value}))} placeholder="MAT-001" /></div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
              <Label className="cursor-pointer">Material ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={v => setForm(f=>({...f,ativo:v}))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: MOVIMENTAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
function MovimentacaoModal({ open, onClose, obraId, obras, materiais, fornecedores, preselMaterialId, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; obras: any[];
  materiais: Material[]; fornecedores: Fornecedor[];
  preselMaterialId?: string; onSaved: () => void;
}) {
  const [tipo,        setTipo]       = useState("entrada");
  const [materialId,  setMaterialId] = useState("");
  const [qtd,         setQtd]        = useState("");
  const [preco,       setPreco]      = useState("");
  const [frente,      setFrente]     = useState("");
  const [fornId,      setFornId]     = useState("");
  const [nf,          setNf]         = useState("");
  const [obs,         setObs]        = useState("");
  const [dataMov,     setDataMov]    = useState(today());
  const [obraDestino, setObraDestino] = useState("");
  const [saving,      setSaving]     = useState(false);

  useEffect(() => {
    if (open) { setMaterialId(preselMaterialId ?? ""); setQtd(""); setPreco(""); setFrente(""); setFornId(""); setNf(""); setObs(""); setTipo("entrada"); setDataMov(today()); setObraDestino(""); }
  }, [open, preselMaterialId]);

  async function handleSave() {
    if (!obraId)    { toast.error("Selecione uma obra"); return; }
    if (!materialId){ toast.error("Selecione o material"); return; }
    const quantidade = parseFloat(qtd);
    if (!qtd || !Number.isFinite(quantidade) || (tipo === "ajuste" ? quantidade === 0 : quantidade <= 0)) {
      toast.error(tipo === "ajuste" ? "Informe um ajuste diferente de zero" : "Informe uma quantidade maior que zero"); return;
    }
    if (tipo === "transferencia" && !obraDestino) { toast.error("Selecione a obra de destino"); return; }
    setSaving(true);
    try {
      const fornecedorId = fornId && fornId !== "none" ? fornId : null;
      const { error } = await (supabase as any).rpc("registrar_movimentacao_almoxarifado", {
        p_obra_id: obraId,
        p_material_id: materialId,
        p_tipo: tipo,
        p_quantidade: quantidade,
        p_preco_unitario: preco ? parseFloat(preco) : null,
        p_frente: frente || null,
        p_fornecedor_id: fornecedorId,
        p_fornecedor: fornecedores.find(f => f.id === fornecedorId)?.nome || null,
        p_nota_fiscal: nf || null,
        p_observacoes: obs || null,
        p_data_movimento: dataMov,
        p_obra_destino_id: tipo === "transferencia" ? obraDestino : null,
      });
      if (error) throw new Error(error.message);

      toast.success("Movimentação registrada!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  const tipoAtual = TIPOS_MOV.find(t => t.value === tipo)!;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <tipoAtual.icon className={cn("h-5 w-5", tipoAtual.color)} /> Movimentação de Material
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Tipo */}
          <div className="grid grid-cols-4 gap-2">
            {TIPOS_MOV.map(t => (
              <button key={t.value} onClick={() => setTipo(t.value)}
                className={cn("rounded-lg border px-2 py-2.5 text-xs font-semibold flex flex-col items-center gap-1 transition-colors",
                  tipo === t.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50 text-muted-foreground"
                )}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Material <span className="text-red-500">*</span></Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger><SelectValue placeholder="Selecione o material..." /></SelectTrigger>
              <SelectContent className="max-h-56">
                {materiais.filter(m => m.ativo).map(m => <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade <span className="text-red-500">*</span></Label>
              <Input type="number" min={tipo === "ajuste" ? undefined : "0.001"} step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder={tipo === "ajuste" ? "Ex.: -2 ou 3" : "0"} />
              {tipo === "ajuste" && <p className="text-[11px] text-muted-foreground">Use valor negativo para reduzir e positivo para acrescentar.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />
            </div>
          </div>

          {tipo === "transferencia" && (
            <div className="space-y-1.5">
              <Label>Obra de destino <span className="text-red-500">*</span></Label>
              <Select value={obraDestino} onValueChange={setObraDestino}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{obras.filter(o => o.id !== obraId).map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {tipo === "entrada" && (
            <>
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={fornId} onValueChange={setFornId}>
                  <SelectTrigger><SelectValue placeholder="Selecione ou deixe em branco..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem fornecedor</SelectItem>
                    {fornecedores.filter(f => f.ativo).map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nota Fiscal</Label><Input value={nf} onChange={e => setNf(e.target.value)} placeholder="NF-000" /></div>
                <div className="space-y-1.5"><Label>Preço unitário (R$)</Label><Input type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} placeholder="0,00" /></div>
              </div>
            </>
          )}

          {tipo === "saida" && (
            <div className="space-y-1.5">
              <Label>Frente de consumo</Label>
              <Input value={frente} onChange={e => setFrente(e.target.value)} placeholder="Fundação, Estrutura, Acabamento..." />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="resize-none text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <tipoAtual.icon className="h-4 w-4" />}
            {saving ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: REQUISIÇÃO MULTI-ITENS
// ═══════════════════════════════════════════════════════════════════════════════
function RequisicaoModal({ open, onClose, obraId, obras, materiais, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; obras: any[];
  materiais: Material[]; onSaved: () => void;
}) {
  const [obraLocal,    setObraLocal]  = useState(obraId);
  const [urgencia,     setUrgencia]   = useState("normal");
  const [justificativa,setJust]       = useState("");
  const [dataNec,      setDataNec]    = useState("");
  const [itens,        setItens]      = useState<ReqItem[]>([{ material_id: "", quantidade: "1" }]);
  const [saving,       setSaving]     = useState(false);

  useEffect(() => {
    if (open) { setObraLocal(obraId); setUrgencia("normal"); setJust(""); setDataNec(""); setItens([{ material_id: "", quantidade: "1" }]); }
  }, [open, obraId]);

  function addItem()    { setItens(prev => [...prev, { material_id: "", quantidade: "1" }]); }
  function removeItem(i: number) { setItens(prev => prev.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof ReqItem, val: string) {
    setItens(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  async function handleSave() {
    const obraFinal = obraLocal || obraId;
    if (!obraFinal)      { toast.error("Selecione a obra"); return; }
    const itensValidos = itens.filter(it => it.material_id && parseFloat(it.quantidade) > 0);
    if (itensValidos.length === 0) { toast.error("Adicione pelo menos um item com material e quantidade"); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Usa o primeiro item no campo legado (backward compat) e cria requisicao_itens para todos
      const primeiroItem = itensValidos[0];
      const { data: req, error: reqErr } = await (supabase as any)
        .from("requisicoes_compra")
        .insert({
          obra_id:          obraFinal,
          material_id:      primeiroItem.material_id,
          quantidade:       parseFloat(primeiroItem.quantidade),
          urgencia, justificativa: justificativa || null,
          data_necessidade: dataNec || null,
          solicitado_por:   user?.id,
        })
        .select("id")
        .single();
      if (reqErr) throw new Error(reqErr.message);

      // Insere todos os itens na tabela de itens
      const itensPayload = itensValidos.map(it => ({
        requisicao_id: req.id,
        material_id:   it.material_id,
        quantidade:    parseFloat(it.quantidade),
        observacao:    it.observacao || null,
      }));
      await (supabase as any).from("requisicao_itens").insert(itensPayload);

      toast.success(`✅ Requisição enviada com ${itensValidos.length} item(s)!`);
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Nova Requisição de Material
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Obra <span className="text-red-500">*</span></Label>
              <Select value={obraLocal} onValueChange={setObraLocal}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Urgência</Label>
              <Select value={urgencia} onValueChange={setUrgencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{URGENCIAS.map(u=><SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Data necessária</Label>
            <Input type="date" value={dataNec} onChange={e => setDataNec(e.target.value)} />
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Materiais solicitados <span className="text-red-500">*</span></Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={addItem}>
                <Plus className="h-3 w-3" /> Adicionar item
              </Button>
            </div>
            {itens.map((it, i) => (
              <div key={i} className="flex gap-2 items-end bg-muted/30 rounded-lg p-2">
                <div className="flex-1 space-y-1">
                  <Select value={it.material_id} onValueChange={v => updateItem(i, "material_id", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Material..." /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {materiais.filter(m => m.ativo).map(m => <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Input type="number" min="0.001" step="any" className="h-8 text-sm text-center"
                    value={it.quantidade} onChange={e => updateItem(i, "quantidade", e.target.value)} placeholder="Qtd." />
                </div>
                {itens.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600 flex-shrink-0"
                    onClick={() => removeItem(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Justificativa</Label>
            <Textarea rows={2} placeholder="Por que este(s) material(is) é(são) necessário(s)?" value={justificativa} onChange={e => setJust(e.target.value)} className="resize-none text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            {saving ? "Enviando..." : `Enviar Requisição${itens.filter(it => it.material_id).length > 1 ? ` (${itens.filter(it => it.material_id).length} itens)` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDENS DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════════
function OrdemCompraTab({ obras, obraId, setObraId, materiais, fornecedores, canEdit }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
  materiais: Material[]; fornecedores: Fornecedor[]; canEdit: boolean;
}) {
  const [ocs,         setOcs]      = useState<OrdemCompra[]>([]);
  const [loading,     setLoading]  = useState(false);
  const [open,        setOpen]     = useState(false);
  const [filtroStatus,setFiltro]   = useState("all");
  const [saving,      setSaving]   = useState(false);

  const fetchOcs = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("ordens_compra")
      .select("*, fornecedores(nome,cnpj,contato_nome,telefone), obras(nome), ordens_compra_itens(*, materiais_catalogo(nome))");
    if (obraId) q = q.eq("obra_id", obraId);
    if (filtroStatus !== "all") q = q.eq("status", filtroStatus);
    const { data } = await q.order("created_at", { ascending: false }).limit(100);
    setOcs((data ?? []) as OrdemCompra[]);
    setLoading(false);
  }, [obraId, filtroStatus]);

  useEffect(() => { fetchOcs(); }, [fetchOcs]);

  async function updateStatus(id: string, status: string) {
    setSaving(true);
    await (supabase as any).from("ordens_compra").update({ status }).eq("id", id);
    setSaving(false); toast.success("Status atualizado!"); fetchOcs();
  }

  const STATUS_OC: Record<string, { label: string; cls: string }> = {
    rascunho: { label: "Rascunho", cls: "bg-slate-100 text-slate-600 border-slate-200" },
    enviada:  { label: "Enviada",  cls: "bg-blue-100 text-blue-700 border-blue-200" },
    recebida: { label: "Recebida", cls: "bg-green-100 text-green-700 border-green-200" },
    cancelada:{ label: "Cancelada",cls: "bg-red-100 text-red-700 border-red-200" },
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId || "all"} onValueChange={v => setObraId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas as obras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Select value={filtroStatus} onValueChange={setFiltro}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_OC).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {canEdit && <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova OC</Button>}
        <Button variant="ghost" size="icon" onClick={fetchOcs}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {loading && <div className="space-y-3">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>}
      {!loading && ocs.length === 0 && <EmptyState icon={FileText} msg="Nenhuma ordem de compra encontrada." />}

      <div className="space-y-3">
        {ocs.map(oc => {
          const st = STATUS_OC[oc.status] ?? STATUS_OC.rascunho;
          return (
            <div key={oc.id} className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm">{oc.numero_oc}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", st.cls)}>{st.label}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(oc.data_emissao)}</span>
                  </div>
                  <p className="text-sm font-medium mt-1">
                    {oc.obras?.nome ?? "—"}
                    {oc.fornecedores?.nome && <> · <span className="text-muted-foreground">{oc.fornecedores.nome}</span></>}
                  </p>
                  {oc.prazo_entrega && (
                    <p className="text-xs text-muted-foreground mt-0.5">Prazo: {fmtDate(oc.prazo_entrega)}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold">{moedaBR(oc.valor_total)}</p>
                  <p className="text-xs text-muted-foreground">{(oc.ordens_compra_itens ?? []).length} item(s)</p>
                </div>
              </div>

              {/* Itens */}
              {(oc.ordens_compra_itens ?? []).length > 0 && (
                <div className="rounded-lg bg-muted/30 divide-y divide-border/50 text-sm overflow-hidden">
                  {(oc.ordens_compra_itens ?? []).map((it, i) => (
                    <div key={it.id} className="flex items-center justify-between px-3 py-1.5 gap-2">
                      <span className="text-muted-foreground text-xs w-4 text-right">{i+1}.</span>
                      <span className="flex-1 font-medium text-xs">{it.materiais_catalogo?.nome ?? "—"}</span>
                      <span className="text-xs tabular-nums">{Number(it.quantidade).toLocaleString("pt-BR")} {it.unidade}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{it.preco_unitario ? moedaBR(it.preco_unitario) : "—"}/un</span>
                      <span className="text-xs font-semibold tabular-nums">{it.valor_total ? moedaBR(it.valor_total) : "—"}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ações */}
              <div className="flex gap-2 flex-wrap pt-1">
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                  onClick={() => printOrdemCompra(oc)}>
                  <Printer className="h-3 w-3" /> Imprimir
                </Button>
                {canEdit && oc.status === "rascunho" && (
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-blue-600 border-blue-300"
                    onClick={() => updateStatus(oc.id, "enviada")} disabled={saving}>
                    <Send className="h-3 w-3" /> Marcar Enviada
                  </Button>
                )}
                {canEdit && oc.status === "enviada" && (
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-green-600 border-green-300"
                    onClick={() => updateStatus(oc.id, "recebida")} disabled={saving}>
                    <CheckCircle2 className="h-3 w-3" /> Marcar Recebida
                  </Button>
                )}
                {canEdit && (oc.status === "rascunho" || oc.status === "enviada") && (
                  <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs text-red-500 ml-auto"
                    onClick={() => updateStatus(oc.id, "cancelada")} disabled={saving}>
                    <Ban className="h-3 w-3" /> Cancelar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <OrdemCompraModal open={open} onClose={() => setOpen(false)} obraId={obraId} obras={obras} materiais={materiais} fornecedores={fornecedores} onSaved={fetchOcs} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════════════════════════════════════════════
function RelatoriosTab({ obras, obraId, setObraId }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
}) {
  const [movs,    setMovs]   = useState<Movimento[]>([]);
  const [loading, setLoading]= useState(false);
  const [dataIni, setDataIni]= useState(format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd"));
  const [dataFim, setDataFim]= useState(today());

  const fetchMovs = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("almoxarifado_movimentos")
      .select("*, materiais_catalogo(nome, unidade)")
      .eq("obra_id", obraId)
      .gte("data_movimento", dataIni)
      .lte("data_movimento", dataFim)
      .in("tipo", ["saida", "entrada"]);
    setMovs((data ?? []) as Movimento[]);
    setLoading(false);
  }, [obraId, dataIni, dataFim]);

  useEffect(() => { fetchMovs(); }, [fetchMovs]);

  const saidas   = movs.filter(m => m.tipo === "saida");
  const entradas = movs.filter(m => m.tipo === "entrada");
  const custoTotal = saidas.reduce((s, m) => s + (m.preco_unitario ?? 0) * m.quantidade, 0);

  // Top 10 materiais por saída
  const topMateriais = useMemo(() => {
    const mp: Record<string, { nome: string; unidade: string; total: number }> = {};
    saidas.forEach(m => {
      const nome = m.materiais_catalogo.nome;
      if (!mp[nome]) mp[nome] = { nome, unidade: m.materiais_catalogo.unidade, total: 0 };
      mp[nome].total += m.quantidade;
    });
    return Object.values(mp).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [saidas]);

  // Consumo por frente
  const porFrente = useMemo(() => {
    const fp: Record<string, number> = {};
    saidas.forEach(m => {
      const f = m.frente || "Sem frente";
      fp[f] = (fp[f] ?? 0) + m.quantidade;
    });
    return Object.entries(fp).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [saidas]);

  return (
    <div className="space-y-5 mt-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
            <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>De</Label><Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="w-36" /></div>
        <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" /></div>
        <Button variant="ghost" size="icon" onClick={fetchMovs}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {!obraId && <EmptyState icon={TrendingUp} msg="Selecione uma obra para ver os relatórios." />}

      {obraId && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:"Saídas no período", value: saidas.length, sub:"movimentações", color:"text-red-600" },
              { label:"Entradas no período", value: entradas.length, sub:"movimentações", color:"text-green-600" },
              { label:"Custo estimado saídas", value: moedaBR(custoTotal), sub:"baseado no preço unit.", color:"text-foreground" },
              { label:"Materiais distintos", value: new Set(saidas.map(m=>m.materiais_catalogo.nome)).size, sub:"consumidos", color:"text-foreground" },
            ].map(k => (
              <div key={k.label} className="rounded-xl border bg-card p-4">
                <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
                <p className="text-xs font-semibold mt-0.5">{k.label}</p>
                <p className="text-[10px] text-muted-foreground">{k.sub}</p>
              </div>
            ))}
          </div>

          {loading && <Skeleton className="h-64 rounded-xl" />}

          {!loading && topMateriais.length === 0 && (
            <EmptyState icon={BarChart3} msg="Nenhuma saída no período selecionado." />
          )}

          {!loading && topMateriais.length > 0 && (
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Top Materiais */}
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-bold mb-3">Top 10 Materiais Consumidos</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topMateriais} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip formatter={(v: number, _, p) => [`${v.toLocaleString("pt-BR")} ${p.payload.unidade}`, "Consumo"]} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {topMateriais.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Por Frente */}
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-bold mb-3">Consumo por Frente</h3>
                {porFrente.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Nenhuma saída com frente informada.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={porFrente} margin={{ left: 8, right: 16, top: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" name="Saídas" radius={[4, 4, 0, 0]}>
                        {porFrente.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Tabela detalhada */}
          {!loading && saidas.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/30">
                <h3 className="text-sm font-bold">Detalhe de Consumo por Material</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Qtd. Total Saída</TableHead>
                    <TableHead className="text-right">Custo Est.</TableHead>
                    <TableHead className="text-right">Movim.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topMateriais.map(m => {
                    const movsDesseMat = saidas.filter(s => s.materiais_catalogo.nome === m.nome);
                    const custoMat = movsDesseMat.reduce((s, v) => s + (v.preco_unitario ?? 0) * v.quantidade, 0);
                    return (
                      <TableRow key={m.nome} className="hover:bg-muted/20">
                        <TableCell className="font-medium text-sm">{m.nome}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtQtd(m.total, m.unidade)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{custoMat > 0 ? moedaBR(custoMat) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{movsDesseMat.length}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTÁRIO FÍSICO
// ═══════════════════════════════════════════════════════════════════════════════
function InventarioTab({ obras, obraId, setObraId, materiais, canEdit }: {
  obras: any[]; obraId: string; setObraId: (v: string) => void;
  materiais: Material[]; canEdit: boolean;
}) {
  const [inventarios, setInventarios] = useState<InventarioFisico[]>([]);
  const [openInv,     setOpenInv]     = useState<InventarioFisico | null>(null);
  const [invItens,    setInvItens]    = useState<InvItem[]>([]);
  const [contagens,   setContagens]   = useState<Record<string, string>>({});
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);

  const fetchInventarios = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("inventario_fisico").select("*, obras(nome)")
      .eq("obra_id", obraId).order("created_at", { ascending: false });
    setInventarios((data ?? []) as InventarioFisico[]);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { fetchInventarios(); }, [fetchInventarios]);

  async function openInventario(inv: InventarioFisico) {
    setOpenInv(inv);
    const { data } = await (supabase as any)
      .from("inventario_itens").select("*, materiais_catalogo(nome, unidade, codigo_interno)")
      .eq("inventario_id", inv.id).order("materiais_catalogo(nome)");
    const items = (data ?? []) as InvItem[];
    setInvItens(items);
    const init: Record<string, string> = {};
    items.forEach(it => { if (it.quantidade_contada != null) init[it.id] = String(it.quantidade_contada); });
    setContagens(init);
  }

  async function criarInventario() {
    if (!obraId) { toast.error("Selecione uma obra"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Busca estoque atual
      const { data: estoque } = await (supabase as any)
        .from("almoxarifado_estoque").select("material_id, quantidade").eq("obra_id", obraId);
      if (!estoque || estoque.length === 0) { toast.error("Nenhum material no estoque desta obra"); setSaving(false); return; }

      const { data: inv, error } = await (supabase as any)
        .from("inventario_fisico").insert({ obra_id: obraId, responsavel_id: user?.id }).select("*").single();
      if (error) throw new Error(error.message);

      await (supabase as any).from("inventario_itens").insert(
        estoque.map((e: any) => ({ inventario_id: inv.id, material_id: e.material_id, quantidade_sistema: e.quantidade }))
      );
      toast.success("Inventário criado! Inicie a contagem.");
      fetchInventarios(); openInventario(inv);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function salvarContagens() {
    setSaving(true);
    try {
      const updates = Object.entries(contagens).filter(([_, v]) => v !== "").map(([id, v]) =>
        (supabase as any).from("inventario_itens").update({ quantidade_contada: parseFloat(v) }).eq("id", id)
      );
      const results = await Promise.all(updates);
      const failed = results.find((result: any) => result.error);
      if (failed?.error) throw new Error(failed.error.message);
      toast.success("Contagens salvas!");
      if (openInv) openInventario(openInv);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function aplicarAjustes() {
    setSaving(true);
    try {
      const divergentes = invItens.filter(it =>
        !it.ajustado && it.quantidade_contada != null && it.quantidade_contada !== it.quantidade_sistema
      );
      if (divergentes.length === 0) { toast.info("Sem divergências para ajustar"); setSaving(false); return; }

      const { data: total, error } = await (supabase as any).rpc("aplicar_ajustes_inventario", { p_inventario_id: openInv!.id });
      if (error) throw new Error(error.message);
      toast.success(`${total ?? divergentes.length} ajuste(s) aplicado(s)!`);
      if (openInv) openInventario(openInv);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function fecharInventario() {
    if (!openInv) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("fechar_inventario_almoxarifado", { p_inventario_id: openInv.id });
      if (error) throw new Error(error.message);
      toast.success("Inventário fechado!");
      setOpenInv(null); fetchInventarios();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  // === Visualização interna do inventário aberto ===
  if (openInv) {
    const divergentes   = invItens.filter(it => it.quantidade_contada != null && it.quantidade_contada !== it.quantidade_sistema && !it.ajustado);
    const naoContados   = invItens.filter(it => it.quantidade_contada == null);
    const contadosOk    = invItens.filter(it => it.quantidade_contada != null && it.quantidade_contada === it.quantidade_sistema);

    return (
      <div className="space-y-4 mt-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setOpenInv(null)} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Voltar à lista
          </Button>
          <div>
            <h2 className="font-bold text-sm">{openInv.obras?.nome ?? "Inventário"} · {fmtDate(openInv.data_inventario)}</h2>
            <p className="text-xs text-muted-foreground">{invItens.length} itens · {naoContados.length} não contados · {divergentes.length} divergências</p>
          </div>
          {openInv.status === "aberto" && canEdit && (
            <div className="ml-auto flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={salvarContagens} disabled={saving} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> Salvar Contagens
              </Button>
              {divergentes.length > 0 && (
                <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" onClick={aplicarAjustes} disabled={saving}>
                  <RotateCcw className="h-3.5 w-3.5" /> Aplicar {divergentes.length} Ajuste(s)
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={fecharInventario} disabled={saving || naoContados.length > 0 || divergentes.length > 0} className="gap-1.5 text-red-600 border-red-300"
                title={naoContados.length > 0 ? "Conte todos os itens antes de fechar" : divergentes.length > 0 ? "Aplique as divergências antes de fechar" : "Fechar inventário"}>
                <Ban className="h-3.5 w-3.5" /> Fechar Inventário
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="text-right w-32">Contado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invItens.map(it => {
                const contado = contagens[it.id] !== undefined ? parseFloat(contagens[it.id] || "0") : it.quantidade_contada;
                const diff = contado != null ? contado - it.quantidade_sistema : null;
                const isOk   = diff === 0;
                const isPos  = diff != null && diff > 0;
                const isNeg  = diff != null && diff < 0;
                return (
                  <TableRow key={it.id} className={cn("hover:bg-muted/20",
                    it.ajustado ? "opacity-50" : isNeg ? "bg-red-50/40" : isPos ? "bg-blue-50/40" : "")}>
                    <TableCell>
                      <p className="font-medium text-sm">{it.materiais_catalogo?.nome ?? "—"}</p>
                      {it.materiais_catalogo?.codigo_interno && (
                        <p className="text-xs font-mono text-muted-foreground">{it.materiais_catalogo.codigo_interno}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {fmtQtd(it.quantidade_sistema, it.materiais_catalogo?.unidade ?? "un")}
                    </TableCell>
                    <TableCell className="text-right">
                      {openInv.status === "aberto" && canEdit && !it.ajustado ? (
                        <Input
                          type="number" min="0" step="any"
                          className="w-24 h-7 text-xs text-right ml-auto"
                          value={contagens[it.id] ?? (it.quantidade_contada != null ? String(it.quantidade_contada) : "")}
                          onChange={e => setContagens(prev => ({ ...prev, [it.id]: e.target.value }))}
                          placeholder="Contar..."
                        />
                      ) : (
                        <span className="text-sm tabular-nums">
                          {it.quantidade_contada != null ? fmtQtd(it.quantidade_contada, it.materiais_catalogo?.unidade ?? "un") : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right text-sm font-bold tabular-nums",
                      diff == null ? "text-muted-foreground" : isOk ? "text-green-600" : isNeg ? "text-red-600" : "text-blue-600")}>
                      {diff == null ? "—" : diff === 0 ? "OK" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                    </TableCell>
                    <TableCell>
                      {it.ajustado ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Ajustado</span>
                      ) : diff == null ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Pendente</span>
                      ) : isOk ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">OK</span>
                      ) : (
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", isNeg ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                          {isNeg ? "Déficit" : "Excesso"}
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
    );
  }

  // === Lista de inventários ===
  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 space-y-1.5">
          <Label>Obra</Label>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
            <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {obraId && canEdit && (
          <Button onClick={criarInventario} disabled={saving} className="gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Novo Inventário
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={fetchInventarios}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {!obraId && <EmptyState icon={ClipboardCheck} msg="Selecione uma obra para gerenciar inventários." />}

      {obraId && !loading && inventarios.length === 0 && (
        <EmptyState icon={FlaskConical} msg="Nenhum inventário físico realizado. Clique em 'Novo Inventário' para iniciar a contagem." />
      )}

      {loading && <div className="space-y-3">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-20 rounded-xl"/>)}</div>}

      <div className="space-y-3">
        {inventarios.map(inv => (
          <div key={inv.id} className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                  inv.status === "fechado" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-700")}>
                  {inv.status === "fechado" ? "Fechado" : "Em aberto"}
                </span>
                <span className="font-semibold text-sm">{fmtDate(inv.data_inventario)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{inv.obras?.nome ?? "—"}</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openInventario(inv)}>
              <ClipboardCheck className="h-3.5 w-3.5" />
              {inv.status === "aberto" ? "Continuar contagem" : "Ver detalhes"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: ORDEM DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════════
function OrdemCompraModal({ open, onClose, obraId, obras, materiais, fornecedores, fromReq, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; obras: any[];
  materiais: Material[]; fornecedores: Fornecedor[];
  fromReq?: Requisicao; onSaved: () => void;
}) {
  const [obraLocal,  setObraLocal]  = useState(obraId);
  const [fornId,     setFornId]     = useState("");
  const [prazo,      setPrazo]      = useState("");
  const [condicoes,  setCondicoes]  = useState("");
  const [localEnt,   setLocalEnt]   = useState("");
  const [obs,        setObs]        = useState("");
  const [itens,      setItens]      = useState<OcItem[]>([{ material_id: "", quantidade: "1", unidade: "un", preco_unitario: "0" }]);
  const [saving,     setSaving]     = useState(false);
  const [fns,        setFns]        = useState<Fornecedor[]>([]);

  useEffect(() => {
    if (open) {
      setObraLocal(fromReq?.obra_id ?? obraId);
      setFornId(""); setPrazo(""); setCondicoes(""); setLocalEnt(""); setObs("");
      // Se vier de uma requisição, pre-populate itens
      if (fromReq) {
        const reqItens = fromReq.requisicao_itens && fromReq.requisicao_itens.length > 0
          ? fromReq.requisicao_itens
          : [{ id: fromReq.id, material_id: fromReq.material_id, quantidade: fromReq.quantidade, materiais_catalogo: fromReq.materiais_catalogo }];
        setItens(reqItens.map(it => ({
          material_id: it.material_id, unidade: it.materiais_catalogo?.unidade ?? "un",
          quantidade: String(it.quantidade), preco_unitario: "0",
        })));
      } else {
        setItens([{ material_id: "", quantidade: "1", unidade: "un", preco_unitario: "0" }]);
      }
    }
  }, [open, obraId, fromReq]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("fornecedores").select("*").eq("ativo", true).order("nome");
      setFns((data ?? []) as Fornecedor[]);
    })();
  }, []);

  function updateItem(i: number, field: keyof OcItem, v: string) {
    setItens(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const updated = { ...it, [field]: v };
      if (field === "material_id") {
        const mat = materiais.find(m => m.id === v);
        if (mat) updated.unidade = mat.unidade;
      }
      return updated;
    }));
  }

  async function handleSave() {
    if (!obraLocal) { toast.error("Selecione a obra"); return; }
    const valid = itens.filter(it => it.material_id && parseFloat(it.quantidade) > 0);
    if (valid.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: oc, error } = await (supabase as any).from("ordens_compra").insert({
        obra_id: obraLocal, fornecedor_id: fornId || null,
        requisicao_id: fromReq?.id ?? null,
        prazo_entrega: prazo || null, condicoes_pagamento: condicoes || null,
        local_entrega: localEnt || null, observacoes: obs || null, emitido_por: user?.id,
      }).select("id").single();
      if (error) throw new Error(error.message);

      await (supabase as any).from("ordens_compra_itens").insert(
        valid.map(it => {
          const mat = materiais.find(m => m.id === it.material_id);
          const q = parseFloat(it.quantidade); const p = parseFloat(it.preco_unitario) || 0;
          return { ordem_id: oc.id, material_id: it.material_id, quantidade: q,
            unidade: mat?.unidade ?? it.unidade, preco_unitario: p, valor_total: q * p };
        })
      );
      toast.success("Ordem de Compra criada!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {fromReq ? `Ordem de Compra — ${fromReq.numero_req ?? "Requisição"}` : "Nova Ordem de Compra"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Obra <span className="text-red-500">*</span></Label>
              <Select value={obraLocal} onValueChange={setObraLocal}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Select value={fornId} onValueChange={setFornId}>
                <SelectTrigger><SelectValue placeholder="Opcional..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem fornecedor</SelectItem>
                  {fns.map(f=><SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Prazo de entrega</Label><Input type="date" value={prazo} onChange={e=>setPrazo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Condições de pagamento</Label><Input value={condicoes} onChange={e=>setCondicoes(e.target.value)} placeholder="30 dias, à vista..." /></div>
          </div>
          <div className="space-y-1.5"><Label>Local de entrega</Label><Input value={localEnt} onChange={e=>setLocalEnt(e.target.value)} placeholder="Endereço da obra..." /></div>

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens <span className="text-red-500">*</span></Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                onClick={() => setItens(p => [...p, { material_id:"", quantidade:"1", unidade:"un", preco_unitario:"0" }])}>
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-muted/40 px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                <span className="col-span-5">Material</span><span className="col-span-2 text-right">Qtd.</span>
                <span className="col-span-2 text-right">Un.</span><span className="col-span-2 text-right">Preço/un</span><span />
              </div>
              {itens.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-t items-center">
                  <div className="col-span-5">
                    <Select value={it.material_id} onValueChange={v => updateItem(i, "material_id", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Material..." /></SelectTrigger>
                      <SelectContent className="max-h-48">
                        {materiais.filter(m=>m.ativo).map(m=><SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Input type="number" min="0" step="any" className="h-7 text-xs text-right" value={it.quantidade} onChange={e=>updateItem(i,"quantidade",e.target.value)} /></div>
                  <div className="col-span-2 text-center">
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{it.unidade}</span>
                  </div>
                  <div className="col-span-2"><Input type="number" min="0" step="0.01" className="h-7 text-xs text-right" value={it.preco_unitario} onChange={e=>updateItem(i,"preco_unitario",e.target.value)} /></div>
                  <div className="col-span-1 text-right">
                    {itens.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-600"
                        onClick={() => setItens(p=>p.filter((_,idx)=>idx!==i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="px-3 py-2 bg-muted/20 border-t flex justify-end">
                <span className="text-sm font-bold">
                  Total: {moedaBR(itens.reduce((s,it) => s + (parseFloat(it.quantidade)||0)*(parseFloat(it.preco_unitario)||0), 0))}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={obs} onChange={e=>setObs(e.target.value)} className="resize-none text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {saving ? "Criando..." : "Criar Ordem de Compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIALOG: AUTO-REQUISIÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
function AutoReqDialog({ open, onClose, obraId, obras, itensAlerta, materiais, onSaved }: {
  open: boolean; onClose: () => void; obraId: string; obras: any[];
  itensAlerta: Estoque[]; materiais: Material[]; onSaved: () => void;
}) {
  const [qtds,    setQtds]   = useState<Record<string, string>>({});
  const [obraLocal,setObraL] = useState(obraId);
  const [saving,  setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setObraL(obraId);
      const init: Record<string, string> = {};
      itensAlerta.forEach(e => {
        const sugerido = Math.max(e.quantidade_minima - e.quantidade, e.quantidade_minima);
        init[e.material_id] = String(sugerido > 0 ? sugerido : e.quantidade_minima || 1);
      });
      setQtds(init);
    }
  }, [open, obraId, itensAlerta]);

  async function handleCreate() {
    const validos = itensAlerta.filter(e => parseFloat(qtds[e.material_id] || "0") > 0);
    if (!obraLocal) { toast.error("Selecione a obra"); return; }
    if (validos.length === 0) { toast.error("Nenhum item com quantidade > 0"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const primeiro = validos[0];
      const { data: req, error } = await (supabase as any).from("requisicoes_compra").insert({
        obra_id: obraLocal, material_id: primeiro.material_id,
        quantidade: parseFloat(qtds[primeiro.material_id]),
        urgencia: "urgente", justificativa: "Auto-requisição: estoque abaixo do mínimo",
        solicitado_por: user?.id,
      }).select("id").single();
      if (error) throw new Error(error.message);

      await (supabase as any).from("requisicao_itens").insert(
        validos.map(e => ({ requisicao_id: req.id, material_id: e.material_id, quantidade: parseFloat(qtds[e.material_id]) }))
      );
      toast.success(`✅ Requisição automática criada com ${validos.length} item(s)!`);
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" /> Requisição Automática
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            Os itens abaixo estão zerados ou abaixo do estoque mínimo. Ajuste as quantidades sugeridas e confirme.
          </p>
          <div className="space-y-1.5">
            <Label>Obra</Label>
            <Select value={obraLocal} onValueChange={setObraL}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border overflow-hidden">
            <div className="grid grid-cols-12 bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground">
              <span className="col-span-6">Material</span>
              <span className="col-span-3 text-right">Estoque atual</span>
              <span className="col-span-3 text-right">Qtd. a pedir</span>
            </div>
            {itensAlerta.map(e => (
              <div key={e.material_id} className="grid grid-cols-12 items-center px-3 py-2 border-t gap-2">
                <div className="col-span-6">
                  <p className="text-sm font-medium">{e.materiais_catalogo.nome}</p>
                  {e.quantidade_minima > 0 && (
                    <p className="text-[10px] text-muted-foreground">Mínimo: {fmtQtd(e.quantidade_minima, e.materiais_catalogo.unidade)}</p>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <span className={cn("text-sm font-bold tabular-nums", e.quantidade === 0 ? "text-red-600" : "text-amber-600")}>
                    {fmtQtd(e.quantidade, e.materiais_catalogo.unidade)}
                  </span>
                </div>
                <div className="col-span-3">
                  <Input type="number" min="0" step="any" className="h-7 text-xs text-right"
                    value={qtds[e.material_id] ?? ""}
                    onChange={ev => setQtds(p => ({ ...p, [e.material_id]: ev.target.value }))} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving} className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {saving ? "Criando..." : `Criar Requisição (${itensAlerta.length} itens)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, msg }: { icon: React.ElementType; msg: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center py-14 text-center gap-3">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{msg}</p>
    </div>
  );
}

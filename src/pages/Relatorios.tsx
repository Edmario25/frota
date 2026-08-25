import { useState, useCallback, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Car, AlertTriangle, DollarSign, BarChart3,
  Download, Search, TrendingDown, Fuel, Wrench, Wallet,
  FileText, Building2, RefreshCw, Printer, Truck, ShieldCheck,
  LayoutDashboard, Clock3, Package, HardHat, ClipboardCheck, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null) =>
  d ? format(new Date(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

function downloadCSV(rows: string[][], filename: string) {
  const bom = "﻿";
  const csv = bom + rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── tipos internos ───────────────────────────────────────────────────────────

interface Filters {
  dataInicio: string;
  dataFim: string;
  obraId: string;
  status: string;
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function Relatorios() {
  const { hasFullAccess, isGestorObra } = useUserRole();
  const { obraId: userObraId } = useUserObra();
  const [obras,setObras]=useState<Array<{id:string;nome:string}>>([]);

  const hoje = new Date();
  const [filters, setFilters] = useState<Filters>({
    dataInicio: format(subMonths(hoje, 1), "yyyy-MM-dd"),
    dataFim:    format(hoje, "yyyy-MM-dd"),
    obraId:     userObraId ?? "",
    status:     "todos",
  });

  const setF = (k: keyof Filters, v: string) =>
    setFilters(p => ({ ...p, [k]: v }));

  useEffect(()=>{(async()=>{let q=(supabase as any).from("obras").select("id,nome").order("nome");if(!hasFullAccess&&userObraId)q=q.eq("id",userObraId);const{data}=await q;setObras(data??[]);if(data?.length===1)setFilters(current=>current.obraId?current:{...current,obraId:data[0].id});})();},[hasFullAccess,userObraId]);

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Relatórios
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Análises e exportações com filtro por período
          </p>
        </div>

        {/* Filtros globais */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Data início</Label>
                <Input type="date" className="h-8 text-sm w-40"
                  value={filters.dataInicio}
                  onChange={e => setF("dataInicio", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data fim</Label>
                <Input type="date" className="h-8 text-sm w-40"
                  value={filters.dataFim}
                  onChange={e => setF("dataFim", e.target.value)} />
              </div>
              <div className="flex gap-2">
                {[
                  { label: "7 dias",  days: 7  },
                  { label: "30 dias", days: 30 },
                  { label: "90 dias", days: 90 },
                  { label: "12 meses", days: 365 },
                ].map(({ label, days }) => (
                  <Button key={label} size="sm" variant="outline" className="h-8 text-xs"
                    onClick={() => {
                      const fim = new Date();
                      const ini = new Date(); ini.setDate(ini.getDate() - days);
                      setFilters(p => ({
                        ...p,
                        dataInicio: format(ini, "yyyy-MM-dd"),
                        dataFim:    format(fim, "yyyy-MM-dd"),
                      }));
                    }}>
                    {label}
                  </Button>
                ))}
              </div>
              <div className="space-y-1 min-w-56">
                <Label className="text-xs">Obra</Label>
                <Select value={filters.obraId||"todas"} onValueChange={v=>setF("obraId",v==="todas"?"":v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{hasFullAccess&&<SelectItem value="todas">Todas as obras</SelectItem>}{obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Abas */}
        <Tabs defaultValue="executivo" className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="executivo" className="gap-1.5 text-xs"><LayoutDashboard className="h-3.5 w-3.5"/>Executivo</TabsTrigger>
            <TabsTrigger value="frota"      className="gap-1.5 text-xs"><Truck className="h-3.5 w-3.5" />Frota</TabsTrigger>
            <TabsTrigger value="efetivo"    className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Colaboradores</TabsTrigger>
            <TabsTrigger value="avarias"    className="gap-1.5 text-xs"><AlertTriangle className="h-3.5 w-3.5" />Avarias</TabsTrigger>
            <TabsTrigger value="custo-obra" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />Custo por Obra</TabsTrigger>
            <TabsTrigger value="custo-frota" className="gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5" />Custo de Frota</TabsTrigger>
          </TabsList>

          <TabsContent value="executivo"><RelatorioExecutivo filters={filters} obras={obras}/></TabsContent>

          <TabsContent value="frota">
            <RelatorioVeiculos filters={filters} hasFullAccess={hasFullAccess} userObraId={userObraId} />
          </TabsContent>
          <TabsContent value="efetivo">
            <RelatorioEfetivo filters={filters} hasFullAccess={hasFullAccess} userObraId={userObraId} />
          </TabsContent>
          <TabsContent value="avarias">
            <RelatorioAvarias filters={filters} hasFullAccess={hasFullAccess} userObraId={userObraId} />
          </TabsContent>
          <TabsContent value="custo-obra">
            <RelatorioCustoObra filters={filters} hasFullAccess={hasFullAccess} userObraId={userObraId} />
          </TabsContent>
          <TabsContent value="custo-frota">
            <RelatorioCustoFrota filters={filters} hasFullAccess={hasFullAccess} userObraId={userObraId} />
          </TabsContent>
        </Tabs>

      </div>
    </Layout>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RESUMO EXECUTIVO POR OBRA
// ══════════════════════════════════════════════════════════════════════════════
function RelatorioExecutivo({filters,obras}:{filters:Filters;obras:Array<{id:string;nome:string}>}){
  const [loading,setLoading]=useState(false);const[fetched,setFetched]=useState(false);const[stats,setStats]=useState({efetivo:0,veiculos:0,progresso:0,previsto:0,realizado:0,ncs:0,desvios:0,inspecoes:0,consumo:0,manutencoes:0,atrasos:0});
  const obraIds=useMemo(()=>filters.obraId?[filters.obraId]:obras.map(o=>o.id),[filters.obraId,obras]);
  const title=filters.obraId?obras.find(o=>o.id===filters.obraId)?.nome??"Obra selecionada":"Todas as obras";
  const fetchData=useCallback(async()=>{if(!obraIds.length)return;setLoading(true);
    const [emp,veh,cron,cost,nc,dev,fvs,mov,maint]=await Promise.all([
      (supabase as any).from("obra_funcionarios").select("employee_id",{count:"exact"}).in("obra_id",obraIds).eq("status",true),
      (supabase as any).from("obra_veiculos").select("vehicle_id",{count:"exact"}).in("obra_id",obraIds).eq("status",true),
      (supabase as any).from("v_cronograma_situacao").select("obra_id,peso_percentual,perc_realizado,status_item").in("obra_id",obraIds).is("pai_id",null),
      (supabase as any).from("v_orcado_realizado").select("obra_id,valor_previsto,valor_realizado").in("obra_id",obraIds),
      (supabase as any).from("nao_conformidades").select("id",{count:"exact",head:true}).in("obra_id",obraIds).not("status","in",'(encerrada,cancelada)'),
      (supabase as any).from("sms_desvios").select("id",{count:"exact",head:true}).in("obra_id",obraIds).eq("status","aberto"),
      (supabase as any).from("qualidade_inspecoes_servicos").select("id",{count:"exact",head:true}).in("obra_id",obraIds).eq("resultado","reprovado"),
      (supabase as any).from("almoxarifado_movimentos").select("quantidade,preco_unitario").in("obra_id",obraIds).eq("tipo","saida").gte("data_movimento",filters.dataInicio).lte("data_movimento",filters.dataFim),
      (supabase as any).from("maintenance_records").select("id,vehicle_id,status").eq("status","agendada"),
    ]);
    const cronRows=cron.data??[];const totalWeight=cronRows.reduce((s:any,r:any)=>s+Number(r.peso_percentual??0),0);const progress=totalWeight?cronRows.reduce((s:any,r:any)=>s+Number(r.peso_percentual??0)*Number(r.perc_realizado??0),0)/totalWeight:0;
    const vehicleIds=new Set((veh.data??[]).map((v:any)=>v.vehicle_id));
    setStats({efetivo:new Set((emp.data??[]).map((e:any)=>e.employee_id)).size,veiculos:vehicleIds.size,progresso:Math.round(progress),previsto:(cost.data??[]).reduce((s:any,r:any)=>s+Number(r.valor_previsto??0),0),realizado:(cost.data??[]).reduce((s:any,r:any)=>s+Number(r.valor_realizado??0),0),ncs:nc.count??0,desvios:dev.count??0,inspecoes:fvs.count??0,consumo:(mov.data??[]).reduce((s:any,r:any)=>s+Number(r.quantidade??0)*Number(r.preco_unitario??0),0),manutencoes:(maint.data??[]).filter((m:any)=>vehicleIds.has(m.vehicle_id)).length,atrasos:cronRows.filter((r:any)=>r.status_item==="atrasado").length});setFetched(true);setLoading(false);
  },[obraIds,filters.dataInicio,filters.dataFim]);
  const financial=stats.previsto?Math.round(stats.realizado/stats.previsto*100):0;const attention=stats.ncs+stats.desvios+stats.inspecoes+stats.atrasos;
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold">Resumo executivo — {title}</h2><p className="text-xs text-muted-foreground">Consolidado de {fmtDate(filters.dataInicio)} até {fmtDate(filters.dataFim)}</p></div><Button size="sm" onClick={fetchData} disabled={loading}>{loading?<RefreshCw className="mr-2 h-4 w-4 animate-spin"/>:<TrendingUp className="mr-2 h-4 w-4"/>}{fetched?"Atualizar consolidado":"Gerar consolidado"}</Button></div>
    {!fetched?<EmptyPrompt icon={LayoutDashboard} label='Clique em "Gerar consolidado" para carregar a visão executiva da obra'/>:<>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
        [HardHat,"Avanço físico",`${stats.progresso}%`,"text-blue-600"],[DollarSign,"Orçamento realizado",`${financial}%`,financial>100?"text-red-600":"text-emerald-600"],[Users,"Efetivo atual",stats.efetivo,"text-violet-600"],[Truck,"Veículos vinculados",stats.veiculos,"text-cyan-600"],[AlertTriangle,"Pontos de atenção",attention,attention?"text-red-600":"text-emerald-600"],
      ].map(([Icon,label,value,color])=><Card key={String(label)} className="border-0 shadow-sm"><CardContent className="p-4"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><Icon className={`h-4 w-4 ${color}`}/></div><p className="text-2xl font-extrabold">{String(value)}</p><p className="text-xs text-muted-foreground">{String(label)}</p></CardContent></Card>)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Desempenho físico-financeiro</CardTitle></CardHeader><CardContent className="space-y-5"><div><div className="mb-2 flex justify-between text-xs"><span>Avanço físico</span><strong>{stats.progresso}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-blue-600" style={{width:`${Math.min(stats.progresso,100)}%`}}/></div></div><div><div className="mb-2 flex justify-between text-xs"><span>Consumo do orçamento</span><strong>{financial}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full",financial>100?"bg-red-500":"bg-emerald-500")} style={{width:`${Math.min(financial,100)}%`}}/></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Previsto</p><p className="font-bold">{fmt(stats.previsto)}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Realizado</p><p className="font-bold">{fmt(stats.realizado)}</p></div></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Pendências operacionais</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{[[Clock3,"Etapas atrasadas",stats.atrasos],[ShieldCheck,"NCs abertas",stats.ncs],[ClipboardCheck,"Inspeções reprovadas",stats.inspecoes],[ShieldAlert,"Desvios de segurança",stats.desvios],[Wrench,"Manutenções agendadas",stats.manutencoes],[Package,"Consumo de materiais",fmt(stats.consumo)]].map(([Icon,label,value])=><div key={String(label)} className="flex items-center gap-3 rounded-lg border p-3"><Icon className="h-4 w-4 text-muted-foreground"/><div><p className="text-sm font-bold">{String(value)}</p><p className="text-[10px] text-muted-foreground">{String(label)}</p></div></div>)}</CardContent></Card></div>
    </>}</div>;
}

// ─── props compartilhadas ─────────────────────────────────────────────────────

interface ReportProps {
  filters: Filters;
  hasFullAccess: boolean;
  userObraId: string | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. RELATÓRIO DE EFETIVO
// ══════════════════════════════════════════════════════════════════════════════

function RelatorioEfetivo({ filters, hasFullAccess, userObraId }: ReportProps) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("employees")
        .select(`
          id, nome, cpf, cargo, status, data_admissao, departamento, email, telefone,
          obra_funcionarios(obra_id, funcao_obra, status, obras(nome))
        `)
        .order("nome");

      const scopedObraId=filters.obraId||(!hasFullAccess?userObraId:null);
      if (scopedObraId) {
        const { data: emp } = await (supabase as any)
          .from("obra_funcionarios")
          .select("employee_id")
          .eq("obra_id", scopedObraId)
          .eq("status", true);
        const ids = (emp ?? []).map((e: any) => e.employee_id);
        if (ids.length) q = q.in("id", ids); else { setRows([]); setFetched(true); setLoading(false); return; }
      }

      const { data } = await q;
      setRows(data ?? []);
      setFetched(true);
    } finally { setLoading(false); }
  }, [filters, hasFullAccess, userObraId]);

  const filtered = filtroStatus === "todos" ? rows : rows.filter(r => r.status === filtroStatus);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      ativo:   "bg-green-100 text-green-700",
      inativo: "bg-gray-100 text-gray-600",
      ferias:  "bg-blue-100 text-blue-700",
      licenca: "bg-amber-100 text-amber-700",
    };
    const labels: Record<string, string> = {
      ativo: "Ativo", inativo: "Inativo", ferias: "Férias", licenca: "Licença",
    };
    return <Badge className={cn("border-0 text-xs", map[s] ?? "bg-gray-100")}>{labels[s] ?? s}</Badge>;
  };

  const exportCSV = () => {
    const header = ["Nome","CPF","Cargo","Status","Departamento","Data Admissão","Obra","Função na Obra"];
    const data = filtered.map(r => {
      const of = r.obra_funcionarios?.[0];
      return [r.nome, r.cpf, r.cargo, r.status, r.departamento ?? "", fmtDate(r.data_admissao),
              of?.obras?.nome ?? "", of?.funcao_obra ?? ""];
    });
    downloadCSV([header, ...data], `efetivo_atual_${new Date().toISOString().slice(0,10)}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="ferias">Férias</SelectItem>
              <SelectItem value="licenca">Licença</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={fetch} disabled={loading} className="h-8 gap-1.5">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {fetched ? "Atualizar" : "Gerar Relatório"}
          </Button>
        </div>
        {fetched && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />Exportar CSV
          </Button>
        )}
      </div>

      {/* Resumo */}
      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",   val: rows.length,                                       color: "text-foreground" },
            { label: "Ativos",  val: rows.filter(r => r.status === "ativo").length,     color: "text-green-600" },
            { label: "Férias",  val: rows.filter(r => r.status === "ferias").length,    color: "text-blue-600"  },
            { label: "Licença", val: rows.filter(r => r.status === "licenca").length,   color: "text-amber-600" },
          ].map(item => (
            <Card key={item.label} className="border-0 shadow-sm">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={cn("text-2xl font-extrabold", item.color)}>{item.val}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabela */}
      {fetched && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead>Obra Atual</TableHead>
                  <TableHead>Função</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const of = r.obra_funcionarios?.find((o: any) => o.status);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-sm">{r.nome}</TableCell>
                      <TableCell className="text-sm">{r.cargo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.departamento ?? "—"}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(r.data_admissao)}</TableCell>
                      <TableCell className="text-sm">{of?.obras?.nome ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{of?.funcao_obra ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Nenhum colaborador encontrado para os filtros selecionados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!fetched && !loading && (
        <EmptyPrompt icon={Users} label='Clique em "Gerar Relatório" para carregar o efetivo atual da obra' />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. RELATÓRIO DE FROTA — STATUS DE LIBERAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

type LibStatus = "liberado" | "bloqueado" | "aguardando" | "manutencao" | "inativo";

const LIB_CFG: Record<LibStatus, { label: string; cls: string; emoji: string }> = {
  liberado:   { label: "Liberado",            emoji: "✅", cls: "bg-green-100 text-green-800 border border-green-300" },
  bloqueado:  { label: "Bloqueado",           emoji: "🚫", cls: "bg-red-100 text-red-800 border border-red-300" },
  aguardando: { label: "Aguardando liberação", emoji: "⏳", cls: "bg-orange-100 text-orange-800 border border-orange-300" },
  manutencao: { label: "Em manutenção",       emoji: "🔧", cls: "bg-amber-100 text-amber-800 border border-amber-300" },
  inativo:    { label: "Inativo",             emoji: "⛔", cls: "bg-gray-100 text-gray-600 border border-gray-300" },
};

function libBadge(status: LibStatus) {
  const c = LIB_CFG[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full", c.cls)}>
      {c.emoji} {c.label}
    </span>
  );
}

function RelatorioVeiculos({ filters, hasFullAccess, userObraId }: ReportProps) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("pesado");
  const [filtroLib,  setFiltroLib]  = useState("todos");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // hoje em formato YYYY-MM-DD (mesmo que o hook useVehicleLiberacao)
      const hojeStr = new Date().toISOString().split("T")[0];

      // 1. Veículos + responsável
      const vQ = (supabase as any)
        .from("vehicles")
        .select("id, placa, modelo, marca, ano, tipo, status, quilometragem_atual, valor_aluguel_mensal, responsavel_id, employees(nome)")
        .order("tipo", { ascending: false }) // pesados primeiro
        .order("placa");

      // 2. Todos os checklists de liberação (sem filtro de data no banco,
      //    igual ao hook useVehicleLiberacao) — filtramos por data no JS
      //    O campo correto dos itens é "status" (não "resultado")
      const [vRes, libRes] = await Promise.all([
        vQ,
        (supabase as any)
          .from("inspection_checklists")
          .select("id, vehicle_id, data_inspecao, responsavel_checklist, inspection_items(status)")
          .eq("tipo_servico", "liberacao_veiculo")
          .order("data_inspecao", { ascending: false }),
      ]);

      let veiculos = vRes.data ?? [];
      const allLibs: any[] = libRes.data ?? [];

      const scopedObraId=filters.obraId||(!hasFullAccess?userObraId:null);
      if (scopedObraId) {
        const [{ data: ofData }, { data: ovData }] = await Promise.all([
          (supabase as any).from("obra_funcionarios").select("employee_id").eq("obra_id", scopedObraId).eq("status", true),
          (supabase as any).from("obra_veiculos").select("vehicle_id").eq("obra_id", scopedObraId).eq("status", true),
        ]);
        const empIds     = (ofData ?? []).map((e: any) => e.employee_id);
        const obraVehIds = (ovData ?? []).map((v: any) => v.vehicle_id);
        veiculos = veiculos.filter((v: any) =>
          empIds.includes(v.responsavel_id) || obraVehIds.includes(v.id)
        );
      }

      // 3. Para cada veículo, pega o registro mais recente (já vem ordenado desc)
      //    e aplica a MESMA lógica do hook useVehicleLiberacao
      const libByVehicle: Record<string, any> = {};
      for (const row of allLibs) {
        if (!libByVehicle[row.vehicle_id]) {
          libByVehicle[row.vehicle_id] = row; // mais recente
        }
      }

      const enriched = veiculos.map((v: any) => {
        let libStatus: LibStatus;
        if (v.status === "inativo") {
          libStatus = "inativo";
        } else if (v.status === "manutencao") {
          libStatus = "manutencao";
        } else {
          const lib = libByVehicle[v.id];
          if (!lib) {
            libStatus = "aguardando";
          } else {
            // isHoje: mesmo critério do hook — data_inspecao >= "YYYY-MM-DD" de hoje
            const isHoje = (lib.data_inspecao ?? "") >= hojeStr;
            if (!isHoje) {
              libStatus = "aguardando"; // vencido → no relatório mostramos como aguardando
            } else {
              const itens: { status: string }[] = lib.inspection_items ?? [];
              const nc = itens.filter((i: any) => i.status === "reprovado").length;
              libStatus = nc > 0 ? "bloqueado" : "liberado";
            }
          }
        }
        const lib = libByVehicle[v.id];
        const isHoje = lib && (lib.data_inspecao ?? "") >= hojeStr;
        return {
          ...v,
          libStatus,
          libResponsavel: isHoje ? (lib?.responsavel_checklist ?? null) : null,
          libData:        isHoje ? (lib?.data_inspecao ?? null) : null,
        };
      });

      setRows(enriched);
      setFetched(true);
    } finally { setLoading(false); }
  }, [filters, hasFullAccess, userObraId]);

  // filtros locais
  const filtered = rows
    .filter(r => filtroTipo === "todos" || r.tipo === filtroTipo)
    .filter(r => filtroLib  === "todos" || r.libStatus === filtroLib);

  // contadores para cards
  const cnt = (s: LibStatus) => rows
    .filter(r => filtroTipo === "todos" || r.tipo === filtroTipo)
    .filter(r => r.libStatus === s).length;
  const totalFiltered = rows.filter(r => filtroTipo === "todos" || r.tipo === filtroTipo).length;

  const exportCSV = () => {
    const header = ["Placa","Modelo","Marca","Ano","Tipo","Status Operacional","Status Liberação","Responsável","Liberado por","KM/H Atual"];
    const data = filtered.map(r => [
      r.placa, r.modelo, r.marca, r.ano ?? "", r.tipo,
      r.status,
      LIB_CFG[r.libStatus as LibStatus].label,
      r.employees?.nome ?? "",
      r.libResponsavel ?? "",
      r.quilometragem_atual ?? "",
    ]);
    downloadCSV([header, ...data], `frota_liberacao_${hoje()}.csv`);
  };

  const hoje = () => format(new Date(), "yyyy-MM-dd");

  const handlePrint = () => {
    const rowsHtml = filtered.map(r => {
      const cfg = LIB_CFG[r.libStatus as LibStatus];
      const statusLabels: Record<string, string> = { disponivel: "Disponível", em_uso: "Em Uso", manutencao: "Manutenção", inativo: "Inativo" };
      return `
        <tr>
          <td><b>${r.placa}</b></td>
          <td>${r.marca} ${r.modelo}</td>
          <td>${r.tipo === "pesado" ? "Pesado" : "Leve"}</td>
          <td>${statusLabels[r.status] ?? r.status}</td>
          <td><span style="font-size:11px;font-weight:600">${cfg.emoji} ${cfg.label}</span></td>
          <td>${r.employees?.nome ?? "—"}</td>
          <td>${r.libResponsavel ?? "—"}</td>
          <td class="text-right">${r.quilometragem_atual?.toLocaleString("pt-BR") ?? "—"}</td>
        </tr>`;
    }).join("");

    const cardsHtml = [
      { label: "Total", val: totalFiltered, color: "#334155" },
      { label: "✅ Liberados", val: cnt("liberado"), color: "#16a34a" },
      { label: "⏳ Aguardando", val: cnt("aguardando"), color: "#ea580c" },
      { label: "🚫 Bloqueados", val: cnt("bloqueado"), color: "#dc2626" },
      { label: "🔧 Manutenção", val: cnt("manutencao"), color: "#d97706" },
    ].map(c => `
      <div class="print-card">
        <p class="print-card-label">${c.label}</p>
        <p class="print-card-value" style="color:${c.color}">${c.val}</p>
      </div>`).join("");

    const tipoLabel = filtroTipo === "todos" ? "Todos" : filtroTipo === "pesado" ? "Pesados" : "Leves";
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Relatório de Liberação de Veículos</title>
      <style>
        * { margin:0;padding:0;box-sizing:border-box }
        body { font-family:Arial,sans-serif;color:#111;background:#fff;padding:28px 32px }
        .print-header { border-bottom:3px solid #1e40af;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end }
        .print-title { font-size:20px;font-weight:800;color:#1e40af }
        .print-subtitle { font-size:11px;color:#64748b;margin-top:3px }
        .print-meta { font-size:10px;color:#64748b;text-align:right;line-height:1.6 }
        .print-cards { display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px }
        .print-card { border:1px solid #e2e8f0;border-radius:6px;padding:9px 12px }
        .print-card-label { font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:2px }
        .print-card-value { font-size:22px;font-weight:800 }
        table { width:100%;border-collapse:collapse;font-size:10px;margin-bottom:20px }
        thead th { background:#1e40af;color:#fff;padding:7px 8px;text-align:left;font-weight:600;white-space:nowrap }
        .text-right { text-align:right }
        tbody td { padding:5px 8px;border-bottom:1px solid #e2e8f0 }
        tbody tr:nth-child(even) td { background:#f8fafc }
        .print-footer { font-size:9px;color:#94a3b8;text-align:right;border-top:1px solid #e2e8f0;padding-top:10px }
        @media print { @page { margin:15mm;size:A4 landscape } }
      </style>
    </head><body>
      <div class="print-header">
        <div>
          <div class="print-title">Relatório de Liberação de Veículos</div>
          <div class="print-subtitle">Data de referência: ${format(new Date(), "dd/MM/yyyy", { locale: ptBR })} — Tipo: ${tipoLabel}</div>
        </div>
        <div class="print-meta">Emitido em: ${new Date().toLocaleString("pt-BR")}</div>
      </div>
      <div class="print-cards">${cardsHtml}</div>
      <table>
        <thead><tr>
          <th>Placa</th><th>Modelo</th><th>Tipo</th><th>Status</th><th>Liberação</th>
          <th>Responsável</th><th>Liberado por</th><th class="text-right">Medição</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="print-footer">Sistema de Gestão de Frota — gerado em ${new Date().toLocaleString("pt-BR")}</div>
      <script>window.onload=()=>{window.print()}</script>
    </body></html>`);
    w.document.close();
  };

  const TIPO_OPTS = [
    { v: "pesado", l: "Veículos Pesados" },
    { v: "leve",   l: "Veículos Leves"  },
    { v: "todos",  l: "Todos os tipos"  },
  ];
  const LIB_OPTS = [
    { v: "todos",      l: "Todas as situações"     },
    { v: "liberado",   l: "✅ Liberados"             },
    { v: "aguardando", l: "⏳ Aguardando liberação"  },
    { v: "bloqueado",  l: "🚫 Bloqueados"            },
    { v: "manutencao", l: "🔧 Em manutenção"         },
    { v: "inativo",    l: "⛔ Inativos"              },
  ];

  return (
    <div className="space-y-4">

      {/* Controles */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPO_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroLib} onValueChange={setFiltroLib}>
            <SelectTrigger className="h-8 text-xs w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LIB_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={fetchData} disabled={loading} className="h-8 gap-1.5">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {fetched ? "Atualizar" : "Gerar Relatório"}
          </Button>
        </div>
        {fetched && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" />CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />Imprimir
            </Button>
          </div>
        )}
      </div>

      {/* Cards de resumo */}
      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total",            val: totalFiltered,     color: "text-foreground"  },
            { label: "✅ Liberados",     val: cnt("liberado"),   color: "text-green-600"   },
            { label: "⏳ Aguardando",    val: cnt("aguardando"), color: "text-orange-600"  },
            { label: "🚫 Bloqueados",    val: cnt("bloqueado"),  color: "text-red-600"     },
            { label: "🔧 Manutenção",    val: cnt("manutencao"), color: "text-amber-600"   },
          ].map(item => (
            <Card key={item.label} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                const map: Record<string, string> = {
                  "Total": "todos", "✅ Liberados": "liberado", "⏳ Aguardando": "aguardando",
                  "🚫 Bloqueados": "bloqueado", "🔧 Manutenção": "manutencao",
                };
                setFiltroLib(map[item.label] ?? "todos");
              }}>
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={cn("text-2xl font-extrabold", item.color)}>{item.val}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabela */}
      {fetched && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Liberação hoje</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Liberado por</TableHead>
                  <TableHead className="text-right">Medição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const vStatusMap: Record<string, string> = {
                    disponivel: "Disponível", em_uso: "Em Uso", manutencao: "Manutenção", inativo: "Inativo",
                  };
                  const vStatusCls: Record<string, string> = {
                    disponivel: "bg-green-100 text-green-700",
                    em_uso:     "bg-blue-100 text-blue-700",
                    manutencao: "bg-amber-100 text-amber-700",
                    inativo:    "bg-gray-100 text-gray-600",
                  };
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-semibold text-sm">{r.placa}</TableCell>
                      <TableCell className="text-sm">{r.marca} {r.modelo} {r.ano ? `(${r.ano})` : ""}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {r.tipo === "pesado" ? "🚛 Pesado" : "🚗 Leve"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("border-0 text-xs", vStatusCls[r.status] ?? "bg-gray-100")}>
                          {vStatusMap[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{libBadge(r.libStatus)}</TableCell>
                      <TableCell className="text-sm">{r.employees?.nome ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.libResponsavel ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {r.quilometragem_atual != null
                          ? r.quilometragem_atual.toLocaleString("pt-BR") + " km"
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Nenhum veículo encontrado para os filtros selecionados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!fetched && !loading && (
        <EmptyPrompt icon={ShieldCheck} label='Clique em "Gerar Relatório" para ver o status de liberação de hoje' />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. RELATÓRIO DE AVARIAS
// ══════════════════════════════════════════════════════════════════════════════

function RelatorioAvarias({ filters, hasFullAccess, userObraId }: ReportProps) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("damage_reports")
        .select(`
          id, data_avaria, local_ocorrencia, descricao_avaria, responsavel_registro, foto_url,
          vehicles(placa, modelo, marca),
          employees(nome, cargo)
        `)
        .gte("data_avaria", filters.dataInicio + "T00:00:00")
        .lte("data_avaria", filters.dataFim + "T23:59:59")
        .order("data_avaria", { ascending: false });

      const scopedObraId=filters.obraId||(!hasFullAccess?userObraId:null);
      if (scopedObraId) {
        const [{ data: ofData }, { data: ovData }] = await Promise.all([
          (supabase as any).from("obra_funcionarios").select("employee_id").eq("obra_id", scopedObraId).eq("status", true),
          (supabase as any).from("obra_veiculos").select("vehicle_id").eq("obra_id", scopedObraId).eq("status", true),
        ]);
        const empIds     = (ofData ?? []).map((e: any) => e.employee_id);
        const obraVehIds = (ovData ?? []).map((v: any) => v.vehicle_id);

        if (!empIds.length && !obraVehIds.length) {
          setRows([]); setFetched(true); setLoading(false); return;
        }
        // filtra por funcionário da obra OU por veículo vinculado à obra
        if (empIds.length && obraVehIds.length) {
          q = q.or(`employee_id.in.(${empIds.join(",")}),vehicle_id.in.(${obraVehIds.join(",")})`);
        } else if (empIds.length) {
          q = q.in("employee_id", empIds);
        } else {
          q = q.in("vehicle_id", obraVehIds);
        }
      }

      const { data } = await q;
      setRows(data ?? []);
      setFetched(true);
    } finally { setLoading(false); }
  }, [filters, hasFullAccess, userObraId]);

  const exportCSV = () => {
    const header = ["Data","Veículo","Placa","Funcionário","Cargo","Local","Descrição","Responsável Registro"];
    const data = rows.map(r => [
      fmtDate(r.data_avaria?.split("T")[0]),
      `${r.vehicles?.marca} ${r.vehicles?.modelo}`, r.vehicles?.placa ?? "",
      r.employees?.nome ?? "", r.employees?.cargo ?? "",
      r.local_ocorrencia ?? "", r.descricao_avaria,
      r.responsavel_registro ?? "",
    ]);
    downloadCSV([header, ...data], `avarias_${filters.dataInicio}_${filters.dataFim}.csv`);
  };

  // agrupar por veículo
  const porVeiculo: Record<string, number> = {};
  rows.forEach(r => {
    const k = r.vehicles?.placa ?? "?";
    porVeiculo[k] = (porVeiculo[k] ?? 0) + 1;
  });
  const maisAvariado = Object.entries(porVeiculo).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Button size="sm" onClick={fetch} disabled={loading} className="h-8 gap-1.5">
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {fetched ? "Atualizar" : "Gerar Relatório"}
        </Button>
        {fetched && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />Exportar CSV
          </Button>
        )}
      </div>

      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground">Total de Avarias</p>
              <p className="text-2xl font-extrabold text-red-600">{rows.length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground">Veículos Envolvidos</p>
              <p className="text-2xl font-extrabold">{Object.keys(porVeiculo).length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground">Mais Avariado</p>
              <p className="text-xl font-extrabold text-amber-600">
                {maisAvariado ? `${maisAvariado[0]} (${maisAvariado[1]}x)` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {fetched && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Descrição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {fmtDate(r.data_avaria?.split("T")[0])}
                    </TableCell>
                    <TableCell className="text-sm">{r.vehicles?.marca} {r.vehicles?.modelo}</TableCell>
                    <TableCell className="font-mono text-sm font-semibold">{r.vehicles?.placa ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.employees?.nome ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.local_ocorrencia ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-[240px] truncate">{r.descricao_avaria}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Nenhuma avaria registrada no período
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!fetched && !loading && (
        <EmptyPrompt icon={AlertTriangle} label='Clique em "Gerar Relatório" para carregar as avarias do período' />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. RELATÓRIO FINANCEIRO — CUSTO POR OBRA
// ══════════════════════════════════════════════════════════════════════════════

function RelatorioCustoObra({ filters, hasFullAccess, userObraId }: ReportProps) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      // 1. buscar obras
      let obrasQ = (supabase as any).from("obras").select("id, nome, status");
      const scopedObraId=filters.obraId||(!hasFullAccess?userObraId:null);
      if (scopedObraId) obrasQ = obrasQ.eq("id", scopedObraId);
      const { data: obras } = await obrasQ;
      if (!obras?.length) { setRows([]); setFetched(true); setLoading(false); return; }

      const obraIds = obras.map((o: any) => o.id);

      // 2. funcionários vinculados às obras
      const { data: obraFuncs } = await (supabase as any)
        .from("obra_funcionarios")
        .select("obra_id, employee_id")
        .in("obra_id", obraIds)
        .eq("status", true);

      // 3. veículos vinculados diretamente às obras + veículos dos funcionários
      const [{ data: veiculos }, { data: obraVeics }] = await Promise.all([
        (supabase as any).from("vehicles").select("id, responsavel_id, valor_aluguel_mensal"),
        (supabase as any).from("obra_veiculos").select("obra_id, vehicle_id").in("obra_id", obraIds).eq("status", true),
      ]);

      // 4–10. todos os custos no período
      const [mRes, fRes, wRes, tRes, aRes, mulRes, fundoRes, lancRes] = await Promise.all([
        (supabase as any).from("maintenance_records").select("vehicle_id, custo")
          .gte("data_realizada", filters.dataInicio).lte("data_realizada", filters.dataFim).eq("status", "concluida"),
        (supabase as any).from("vehicle_fuel_logs").select("vehicle_id, valor_total")
          .gte("data_abastecimento", filters.dataInicio).lte("data_abastecimento", filters.dataFim),
        (supabase as any).from("wash_records").select("vehicle_id, valor")
          .gte("data_lavagem", filters.dataInicio).lte("data_lavagem", filters.dataFim),
        (supabase as any).from("tire_services").select("vehicle_id, valor_servico")
          .gte("data_servico", filters.dataInicio).lte("data_servico", filters.dataFim),
        (supabase as any).from("vehicle_accessories").select("vehicle_id, valor")
          .gte("data_instalacao", filters.dataInicio).lte("data_instalacao", filters.dataFim),
        (supabase as any).from("traffic_fines").select("vehicle_id, valor")
          .gte("data_multa", filters.dataInicio).lte("data_multa", filters.dataFim),
        (supabase as any).from("fundo_fixo").select("id, obra_id"),
        (supabase as any).from("fundo_fixo_lancamentos").select("fundo_fixo_id, valor, tipo")
          .gte("data_lancamento", filters.dataInicio).lte("data_lancamento", filters.dataFim).eq("tipo", "saida"),
      ]);

      const manuts   = mRes.data   ?? [];
      const fuels    = fRes.data   ?? [];
      const washes   = wRes.data   ?? [];
      const tires    = tRes.data   ?? [];
      const acess    = aRes.data   ?? [];
      const multas   = mulRes.data ?? [];
      const fundos   = fundoRes.data  ?? [];
      const lancs    = lancRes.data   ?? [];

      const sum = (arr: any[], vid: string, field: string) =>
        arr.filter(x => x.vehicle_id === vid).reduce((s, x) => s + (x[field] ?? 0), 0);

      // 11. montar resultado por obra
      const resultado = (obras as any[]).map((obra: any) => {
        const empIds = (obraFuncs ?? [])
          .filter((of: any) => of.obra_id === obra.id)
          .map((of: any) => of.employee_id);

        // veículos: dos funcionários + diretamente vinculados à obra (sem duplicatas)
        const vByEmp  = (veiculos ?? []).filter((v: any) => empIds.includes(v.responsavel_id)).map((v: any) => v.id);
        const vByObra = (obraVeics ?? []).filter((ov: any) => ov.obra_id === obra.id).map((ov: any) => ov.vehicle_id);
        const vIds    = [...new Set([...vByEmp, ...vByObra])];

        const custoManut  = vIds.reduce((s, vid) => s + sum(manuts, vid, "custo"), 0);
        const custoComb   = vIds.reduce((s, vid) => s + sum(fuels, vid, "valor_total"), 0);
        const custoLav    = vIds.reduce((s, vid) => s + sum(washes, vid, "valor"), 0);
        const custoBorr   = vIds.reduce((s, vid) => s + sum(tires, vid, "valor_servico"), 0);
        const custoAcess  = vIds.reduce((s, vid) => s + sum(acess, vid, "valor"), 0);
        const custoMultas = vIds.reduce((s, vid) => s + sum(multas, vid, "valor"), 0);
        const custoAlug   = vIds.reduce((s, vid) => {
          const v = (veiculos ?? []).find((vv: any) => vv.id === vid);
          return s + (v?.valor_aluguel_mensal ?? 0);
        }, 0);

        const fundoIds  = fundos.filter((ff: any) => ff.obra_id === obra.id).map((ff: any) => ff.id);
        const custoFundo = lancs.filter((l: any) => fundoIds.includes(l.fundo_fixo_id))
          .reduce((s: number, l: any) => s + (l.valor ?? 0), 0);

        const total = custoManut + custoComb + custoLav + custoBorr + custoAcess + custoMultas + custoAlug + custoFundo;

        return {
          ...obra, empCount: empIds.length, vCount: vIds.length,
          custoManut, custoComb, custoLav, custoBorr, custoAcess, custoMultas, custoAlug, custoFundo, total,
        };
      }).sort((a: any, b: any) => b.total - a.total);

      setRows(resultado);
      setFetched(true);
    } finally { setLoading(false); }
  }, [filters, hasFullAccess, userObraId]);

  const totalGeral    = rows.reduce((s, r) => s + r.total, 0);
  const totalManut    = rows.reduce((s, r) => s + r.custoManut, 0);
  const totalComb     = rows.reduce((s, r) => s + r.custoComb, 0);
  const totalLav      = rows.reduce((s, r) => s + r.custoLav, 0);
  const totalBorr     = rows.reduce((s, r) => s + r.custoBorr, 0);
  const totalAcess    = rows.reduce((s, r) => s + r.custoAcess, 0);
  const totalMultas   = rows.reduce((s, r) => s + r.custoMultas, 0);
  const totalAlug     = rows.reduce((s, r) => s + r.custoAlug, 0);
  const totalFundo    = rows.reduce((s, r) => s + r.custoFundo, 0);

  const exportCSV = () => {
    const header = ["Obra","Status","Func.","Veíc.","Manutenção","Combustível","Lavagem","Borracharia","Acessórios","Multas","Aluguel","Fundo Fixo","Total"];
    const data = rows.map(r => [
      r.nome, r.status, r.empCount, r.vCount,
      fmt(r.custoManut), fmt(r.custoComb), fmt(r.custoLav),
      fmt(r.custoBorr), fmt(r.custoAcess), fmt(r.custoMultas),
      fmt(r.custoAlug), fmt(r.custoFundo), fmt(r.total),
    ]);
    downloadCSV([header, ...data], `custo_obra_${filters.dataInicio}_${filters.dataFim}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Button size="sm" onClick={fetch} disabled={loading} className="h-8 gap-1.5">
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {fetched ? "Atualizar" : "Gerar Relatório"}
        </Button>
        {fetched && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />Exportar CSV
          </Button>
        )}
      </div>

      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Custo Total",  val: totalGeral,  color: "text-foreground"  },
            { label: "Manutenção",   val: totalManut,  color: "text-amber-600"   },
            { label: "Combustível",  val: totalComb,   color: "text-blue-600"    },
            { label: "Lavagem",      val: totalLav,    color: "text-teal-600"    },
            { label: "Borracharia",  val: totalBorr,   color: "text-orange-600"  },
            { label: "Acessórios",   val: totalAcess,  color: "text-indigo-600"  },
            { label: "Multas",       val: totalMultas, color: "text-red-600"     },
            { label: "Aluguel",      val: totalAlug,   color: "text-violet-600"  },
            { label: "Fundo Fixo",   val: totalFundo,  color: "text-purple-600"  },
          ].map(item => (
            <Card key={item.label} className="border-0 shadow-sm">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={cn("text-lg font-extrabold", item.color)}>{fmt(item.val)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {fetched && (
        <Card className="border-0 shadow-sm overflow-x-auto">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obra</TableHead>
                  <TableHead className="text-right">Func.</TableHead>
                  <TableHead className="text-right">Veíc.</TableHead>
                  <TableHead className="text-right">Manut.</TableHead>
                  <TableHead className="text-right">Comb.</TableHead>
                  <TableHead className="text-right">Lav.</TableHead>
                  <TableHead className="text-right">Borr.</TableHead>
                  <TableHead className="text-right">Acess.</TableHead>
                  <TableHead className="text-right">Multas</TableHead>
                  <TableHead className="text-right">Aluguel</TableHead>
                  <TableHead className="text-right">Fundo Fixo</TableHead>
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">{r.nome}</TableCell>
                    <TableCell className="text-right text-sm">{r.empCount}</TableCell>
                    <TableCell className="text-right text-sm">{r.vCount}</TableCell>
                    <TableCell className="text-right text-sm text-amber-700">{fmt(r.custoManut)}</TableCell>
                    <TableCell className="text-right text-sm text-blue-700">{fmt(r.custoComb)}</TableCell>
                    <TableCell className="text-right text-sm text-teal-700">{fmt(r.custoLav)}</TableCell>
                    <TableCell className="text-right text-sm text-orange-700">{fmt(r.custoBorr)}</TableCell>
                    <TableCell className="text-right text-sm text-indigo-700">{fmt(r.custoAcess)}</TableCell>
                    <TableCell className="text-right text-sm text-red-700">{fmt(r.custoMultas)}</TableCell>
                    <TableCell className="text-right text-sm text-violet-700">{fmt(r.custoAlug)}</TableCell>
                    <TableCell className="text-right text-sm text-purple-700">{fmt(r.custoFundo)}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))}
                {rows.length > 0 && (
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={3} className="text-sm">TOTAL</TableCell>
                    <TableCell className="text-right text-sm text-amber-700">{fmt(totalManut)}</TableCell>
                    <TableCell className="text-right text-sm text-blue-700">{fmt(totalComb)}</TableCell>
                    <TableCell className="text-right text-sm text-teal-700">{fmt(totalLav)}</TableCell>
                    <TableCell className="text-right text-sm text-orange-700">{fmt(totalBorr)}</TableCell>
                    <TableCell className="text-right text-sm text-indigo-700">{fmt(totalAcess)}</TableCell>
                    <TableCell className="text-right text-sm text-red-700">{fmt(totalMultas)}</TableCell>
                    <TableCell className="text-right text-sm text-violet-700">{fmt(totalAlug)}</TableCell>
                    <TableCell className="text-right text-sm text-purple-700">{fmt(totalFundo)}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{fmt(totalGeral)}</TableCell>
                  </TableRow>
                )}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Nenhum dado encontrado para o período
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!fetched && !loading && (
        <EmptyPrompt icon={Building2} label='Clique em "Gerar Relatório" para carregar os custos por obra' />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. RELATÓRIO FINANCEIRO — CUSTO DE FROTA
// ══════════════════════════════════════════════════════════════════════════════

function RelatorioCustoFrota({ filters, hasFullAccess, userObraId }: ReportProps) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, mRes, fRes, wRes, tRes, aRes, mulRes] = await Promise.all([
        (supabase as any).from("vehicles")
          .select("id, placa, modelo, marca, tipo, valor_aluguel_mensal, responsavel_id, employees(nome)")
          .order("placa"),
        (supabase as any).from("maintenance_records")
          .select("vehicle_id, custo")
          .gte("data_realizada", filters.dataInicio)
          .lte("data_realizada", filters.dataFim)
          .eq("status", "concluida"),
        (supabase as any).from("vehicle_fuel_logs")
          .select("vehicle_id, valor_total")
          .gte("data_abastecimento", filters.dataInicio)
          .lte("data_abastecimento", filters.dataFim),
        (supabase as any).from("wash_records")
          .select("vehicle_id, valor")
          .gte("data_lavagem", filters.dataInicio)
          .lte("data_lavagem", filters.dataFim),
        (supabase as any).from("tire_services")
          .select("vehicle_id, valor_servico")
          .gte("data_servico", filters.dataInicio)
          .lte("data_servico", filters.dataFim),
        (supabase as any).from("vehicle_accessories")
          .select("vehicle_id, valor")
          .gte("data_instalacao", filters.dataInicio)
          .lte("data_instalacao", filters.dataFim),
        (supabase as any).from("traffic_fines")
          .select("vehicle_id, valor")
          .gte("data_multa", filters.dataInicio)
          .lte("data_multa", filters.dataFim),
      ]);

      const manuts    = mRes.data ?? [];
      const fuels     = fRes.data ?? [];
      const washes    = wRes.data ?? [];
      const tires     = tRes.data ?? [];
      const acess     = aRes.data ?? [];
      const multas    = mulRes.data ?? [];
      let veiculos    = vRes.data ?? [];

      const scopedObraId=filters.obraId||(!hasFullAccess?userObraId:null);
      if (scopedObraId) {
        const [{ data: ofData }, { data: ovData }] = await Promise.all([
          (supabase as any).from("obra_funcionarios").select("employee_id").eq("obra_id", scopedObraId).eq("status", true),
          (supabase as any).from("obra_veiculos").select("vehicle_id").eq("obra_id", scopedObraId).eq("status", true),
        ]);
        const empIds     = (ofData ?? []).map((e: any) => e.employee_id);
        const obraVehIds = (ovData ?? []).map((v: any) => v.vehicle_id);
        veiculos = veiculos.filter((v: any) =>
          empIds.includes(v.responsavel_id) || obraVehIds.includes(v.id)
        );
      }

      const enriched = veiculos.map((v: any) => {
        const custoManut    = manuts.filter((m: any) => m.vehicle_id === v.id).reduce((s: number, m: any) => s + (m.custo ?? 0), 0);
        const custoComb     = fuels.filter((f: any) => f.vehicle_id === v.id).reduce((s: number, f: any) => s + (f.valor_total ?? 0), 0);
        const custoLav      = washes.filter((w: any) => w.vehicle_id === v.id).reduce((s: number, w: any) => s + (w.valor ?? 0), 0);
        const custoBorr     = tires.filter((t: any) => t.vehicle_id === v.id).reduce((s: number, t: any) => s + (t.valor_servico ?? 0), 0);
        const custoAcess    = acess.filter((a: any) => a.vehicle_id === v.id).reduce((s: number, a: any) => s + (a.valor ?? 0), 0);
        const custoMultas   = multas.filter((m: any) => m.vehicle_id === v.id).reduce((s: number, m: any) => s + (m.valor ?? 0), 0);
        const aluguel       = v.valor_aluguel_mensal ?? 0;
        return {
          ...v,
          custoManut, custoComb, custoLav, custoBorr, custoAcess, custoMultas, aluguel,
          total: custoManut + custoComb + custoLav + custoBorr + custoAcess + custoMultas + aluguel,
        };
      }).sort((a: any, b: any) => b.total - a.total);

      setRows(enriched);
      setFetched(true);
    } finally { setLoading(false); }
  }, [filters, hasFullAccess, userObraId]);

  const filtered      = filtroTipo === "todos" ? rows : rows.filter(r => r.tipo === filtroTipo);
  const totalManut    = filtered.reduce((s, r) => s + r.custoManut, 0);
  const totalComb     = filtered.reduce((s, r) => s + r.custoComb, 0);
  const totalLav      = filtered.reduce((s, r) => s + r.custoLav, 0);
  const totalBorr     = filtered.reduce((s, r) => s + r.custoBorr, 0);
  const totalAcess    = filtered.reduce((s, r) => s + r.custoAcess, 0);
  const totalMultas   = filtered.reduce((s, r) => s + r.custoMultas, 0);
  const totalAlug     = filtered.reduce((s, r) => s + r.aluguel, 0);
  const totalGeral    = filtered.reduce((s, r) => s + r.total, 0);

  const exportCSV = () => {
    const header = ["Placa","Modelo","Tipo","Responsável","Manutenção","Combustível","Lavagem","Borracharia","Acessórios","Multas","Aluguel/Mês","Total"];
    const data = filtered.map(r => [
      r.placa, `${r.marca} ${r.modelo}`, r.tipo, r.employees?.nome ?? "",
      fmt(r.custoManut), fmt(r.custoComb), fmt(r.custoLav),
      fmt(r.custoBorr), fmt(r.custoAcess), fmt(r.custoMultas),
      fmt(r.aluguel), fmt(r.total),
    ]);
    downloadCSV([header, ...data], `custo_frota_${filters.dataInicio}_${filters.dataFim}.csv`);
  };

  const handlePrint = () => {
    const cards = [
      { label: "Custo Total",  val: totalGeral,  color: "#1e40af" },
      { label: "Manutenção",   val: totalManut,  color: "#d97706" },
      { label: "Combustível",  val: totalComb,   color: "#2563eb" },
      { label: "Lavagem",      val: totalLav,    color: "#0d9488" },
      { label: "Borracharia",  val: totalBorr,   color: "#ea580c" },
      { label: "Acessórios",   val: totalAcess,  color: "#4f46e5" },
      { label: "Multas",       val: totalMultas, color: "#dc2626" },
      { label: "Aluguel",      val: totalAlug,   color: "#7c3aed" },
    ];

    const cardsHtml = cards.map(c => `
      <div class="print-card">
        <p class="print-card-label">${c.label}</p>
        <p class="print-card-value" style="color:${c.color}">${fmt(c.val)}</p>
      </div>`).join('');

    const rowsHtml = filtered.map(r => `
      <tr>
        <td><b>${r.placa}</b></td>
        <td>${r.marca} ${r.modelo}</td>
        <td>${r.tipo}</td>
        <td>${r.employees?.nome ?? '—'}</td>
        <td class="text-right">${fmt(r.custoManut)}</td>
        <td class="text-right">${fmt(r.custoComb)}</td>
        <td class="text-right">${fmt(r.custoLav)}</td>
        <td class="text-right">${fmt(r.custoBorr)}</td>
        <td class="text-right">${fmt(r.custoAcess)}</td>
        <td class="text-right">${fmt(r.custoMultas)}</td>
        <td class="text-right">${fmt(r.aluguel)}</td>
        <td class="text-right"><b>${fmt(r.total)}</b></td>
      </tr>`).join('');

    const w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Relatório de Custo de Frota</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; padding: 28px 32px; }
        .print-header { border-bottom: 3px solid #1e40af; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
        .print-title { font-size: 20px; font-weight: 800; color: #1e40af; }
        .print-subtitle { font-size: 11px; color: #64748b; margin-top: 3px; }
        .print-meta { font-size: 10px; color: #64748b; text-align: right; line-height: 1.6; }
        .print-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
        .print-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 12px; }
        .print-card-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 2px; }
        .print-card-value { font-size: 15px; font-weight: 800; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; }
        thead th { background: #1e40af; color: #fff; padding: 7px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
        .text-right { text-align: right; }
        tbody td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
        tbody tr:nth-child(even) td { background: #f8fafc; }
        .total-row td { background: #1e3a8a !important; color: #fff !important; font-weight: 700; padding: 7px 8px; }
        .print-footer { font-size: 9px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print { @page { margin: 15mm; size: A4 landscape; } }
      </style>
    </head><body>
      <div class="print-header">
        <div>
          <div class="print-title">Relatório de Custo de Frota</div>
          <div class="print-subtitle">Período: ${filters.dataInicio} a ${filters.dataFim}</div>
        </div>
        <div class="print-meta">
          Emitido em: ${new Date().toLocaleString('pt-BR')}<br>
          Tipo de veículo: ${filtroTipo === 'todos' ? 'Todos' : filtroTipo}
        </div>
      </div>
      <div class="print-cards">${cardsHtml}</div>
      <table>
        <thead><tr>
          <th>Placa</th><th>Modelo</th><th>Tipo</th><th>Responsável</th>
          <th class="text-right">Manut.</th><th class="text-right">Comb.</th>
          <th class="text-right">Lavagem</th><th class="text-right">Borracharia</th>
          <th class="text-right">Acessórios</th><th class="text-right">Multas</th>
          <th class="text-right">Aluguel</th><th class="text-right">Total</th>
        </tr></thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row">
            <td colspan="4">TOTAL GERAL</td>
            <td class="text-right">${fmt(totalManut)}</td>
            <td class="text-right">${fmt(totalComb)}</td>
            <td class="text-right">${fmt(totalLav)}</td>
            <td class="text-right">${fmt(totalBorr)}</td>
            <td class="text-right">${fmt(totalAcess)}</td>
            <td class="text-right">${fmt(totalMultas)}</td>
            <td class="text-right">${fmt(totalAlug)}</td>
            <td class="text-right">${fmt(totalGeral)}</td>
          </tr>
        </tbody>
      </table>
      <div class="print-footer">Sistema de Gestão de Frota — gerado em ${new Date().toLocaleString('pt-BR')}</div>
      <script>window.onload = () => { window.print(); }</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="leve">Leve</SelectItem>
              <SelectItem value="pesado">Pesado</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={fetch} disabled={loading} className="h-8 gap-1.5">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {fetched ? "Atualizar" : "Gerar Relatório"}
          </Button>
        </div>
        {fetched && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" />Exportar CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />Imprimir
            </Button>
          </div>
        )}
      </div>

      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
          {[
            { label: "Custo Total",  val: totalGeral,  color: "text-foreground"  },
            { label: "Manutenção",   val: totalManut,  color: "text-amber-600"   },
            { label: "Combustível",  val: totalComb,   color: "text-blue-600"    },
            { label: "Lavagem",      val: totalLav,    color: "text-teal-600"    },
            { label: "Borracharia",  val: totalBorr,   color: "text-orange-600"  },
            { label: "Acessórios",   val: totalAcess,  color: "text-indigo-600"  },
            { label: "Multas",       val: totalMultas, color: "text-red-600"     },
            { label: "Aluguel",      val: totalAlug,   color: "text-violet-600"  },
          ].map(item => (
            <Card key={item.label} className="border-0 shadow-sm print:shadow-none print:border">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={cn("text-lg font-extrabold", item.color)}>{fmt(item.val)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {fetched && (
        <Card className="border-0 shadow-sm print:shadow-none print:border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Manut.</TableHead>
                  <TableHead className="text-right">Comb.</TableHead>
                  <TableHead className="text-right">Lav.</TableHead>
                  <TableHead className="text-right">Borr.</TableHead>
                  <TableHead className="text-right">Acess.</TableHead>
                  <TableHead className="text-right">Multas</TableHead>
                  <TableHead className="text-right">Aluguel</TableHead>
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-semibold text-sm">{r.placa}</TableCell>
                    <TableCell className="text-sm">{r.marca} {r.modelo}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{r.tipo}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.employees?.nome ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm text-amber-700">{fmt(r.custoManut)}</TableCell>
                    <TableCell className="text-right text-sm text-blue-700">{fmt(r.custoComb)}</TableCell>
                    <TableCell className="text-right text-sm text-teal-700">{fmt(r.custoLav)}</TableCell>
                    <TableCell className="text-right text-sm text-orange-700">{fmt(r.custoBorr)}</TableCell>
                    <TableCell className="text-right text-sm text-indigo-700">{fmt(r.custoAcess)}</TableCell>
                    <TableCell className="text-right text-sm text-red-700">{fmt(r.custoMultas)}</TableCell>
                    <TableCell className="text-right text-sm text-violet-700">{fmt(r.aluguel)}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))}
                {filtered.length > 0 && (
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={4} className="text-sm">TOTAL</TableCell>
                    <TableCell className="text-right text-sm text-amber-700">{fmt(totalManut)}</TableCell>
                    <TableCell className="text-right text-sm text-blue-700">{fmt(totalComb)}</TableCell>
                    <TableCell className="text-right text-sm text-teal-700">{fmt(totalLav)}</TableCell>
                    <TableCell className="text-right text-sm text-orange-700">{fmt(totalBorr)}</TableCell>
                    <TableCell className="text-right text-sm text-indigo-700">{fmt(totalAcess)}</TableCell>
                    <TableCell className="text-right text-sm text-red-700">{fmt(totalMultas)}</TableCell>
                    <TableCell className="text-right text-sm text-violet-700">{fmt(totalAlug)}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{fmt(totalGeral)}</TableCell>
                  </TableRow>
                )}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                      <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Nenhum custo registrado no período
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!fetched && !loading && (
        <EmptyPrompt icon={DollarSign} label='Clique em "Gerar Relatório" para carregar os custos de frota' />
      )}
    </div>
  );
}

// ─── empty prompt ─────────────────────────────────────────────────────────────

function EmptyPrompt({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <Card className="border-dashed border-2">
      <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center max-w-xs">{label}</p>
      </CardContent>
    </Card>
  );
}

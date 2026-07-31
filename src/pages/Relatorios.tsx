import { useState, useCallback } from "react";
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
  FileText, Building2, RefreshCw,
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

  const hoje = new Date();
  const [filters, setFilters] = useState<Filters>({
    dataInicio: format(subMonths(hoje, 1), "yyyy-MM-dd"),
    dataFim:    format(hoje, "yyyy-MM-dd"),
    obraId:     userObraId ?? "",
    status:     "todos",
  });

  const setF = (k: keyof Filters, v: string) =>
    setFilters(p => ({ ...p, [k]: v }));

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
            </div>
          </CardContent>
        </Card>

        {/* Abas */}
        <Tabs defaultValue="efetivo" className="space-y-4">
          <TabsList className="h-10">
            <TabsTrigger value="efetivo"    className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Efetivo</TabsTrigger>
            <TabsTrigger value="veiculos"   className="gap-1.5 text-xs"><Car className="h-3.5 w-3.5" />Veículos</TabsTrigger>
            <TabsTrigger value="avarias"    className="gap-1.5 text-xs"><AlertTriangle className="h-3.5 w-3.5" />Avarias</TabsTrigger>
            <TabsTrigger value="custo-obra" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />Custo por Obra</TabsTrigger>
            <TabsTrigger value="custo-frota" className="gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5" />Custo de Frota</TabsTrigger>
          </TabsList>

          <TabsContent value="efetivo">
            <RelatorioEfetivo filters={filters} hasFullAccess={hasFullAccess} userObraId={userObraId} />
          </TabsContent>
          <TabsContent value="veiculos">
            <RelatorioVeiculos filters={filters} hasFullAccess={hasFullAccess} userObraId={userObraId} />
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

      if (filters.dataInicio) q = q.gte("data_admissao", filters.dataInicio);
      if (filters.dataFim)    q = q.lte("data_admissao", filters.dataFim);
      if (!hasFullAccess && userObraId) {
        // gestor de obra: só funcionários da sua obra
        const { data: emp } = await (supabase as any)
          .from("obra_funcionarios")
          .select("employee_id")
          .eq("obra_id", userObraId)
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
    downloadCSV([header, ...data], `efetivo_${filters.dataInicio}_${filters.dataFim}.csv`);
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
                      Nenhum registro encontrado para o período selecionado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!fetched && !loading && (
        <EmptyPrompt icon={Users} label='Clique em "Gerar Relatório" para carregar os dados de efetivo' />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. RELATÓRIO DE VEÍCULOS
// ══════════════════════════════════════════════════════════════════════════════

function RelatorioVeiculos({ filters, hasFullAccess, userObraId }: ReportProps) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      // busca veículos + responsável + manutenções no período + combustível no período
      const [vRes, mRes, fRes] = await Promise.all([
        (supabase as any).from("vehicles")
          .select("id, placa, modelo, marca, ano, tipo, status, quilometragem_atual, valor_aluguel_mensal, responsavel_id, employees(nome)")
          .order("placa"),
        (supabase as any).from("maintenance_records")
          .select("id, vehicle_id, tipo, status, custo, data_realizada")
          .gte("data_realizada", filters.dataInicio)
          .lte("data_realizada", filters.dataFim),
        (supabase as any).from("vehicle_fuel_logs")
          .select("id, vehicle_id, litros, valor_total, data_abastecimento")
          .gte("data_abastecimento", filters.dataInicio)
          .lte("data_abastecimento", filters.dataFim),
      ]);

      const manut  = mRes.data  ?? [];
      const fuel   = fRes.data  ?? [];
      let veiculos = vRes.data  ?? [];

      // filtro de obra para gestor: inclui veículos por responsável E por obra_veiculos
      if (!hasFullAccess && userObraId) {
        const [{ data: ofData }, { data: ovData }] = await Promise.all([
          (supabase as any).from("obra_funcionarios").select("employee_id").eq("obra_id", userObraId).eq("status", true),
          (supabase as any).from("obra_veiculos").select("vehicle_id").eq("obra_id", userObraId).eq("status", true),
        ]);
        const empIds       = (ofData ?? []).map((e: any) => e.employee_id);
        const obraVehIds   = (ovData ?? []).map((v: any) => v.vehicle_id);
        veiculos = veiculos.filter((v: any) =>
          empIds.includes(v.responsavel_id) || obraVehIds.includes(v.id)
        );
      }

      const enriched = veiculos.map((v: any) => ({
        ...v,
        qtd_manutencoes:    manut.filter((m: any) => m.vehicle_id === v.id).length,
        custo_manutencao:   manut.filter((m: any) => m.vehicle_id === v.id).reduce((s: number, m: any) => s + (m.custo ?? 0), 0),
        litros_combustivel: fuel.filter((f: any) => f.vehicle_id === v.id).reduce((s: number, f: any) => s + (f.litros ?? 0), 0),
        custo_combustivel:  fuel.filter((f: any) => f.vehicle_id === v.id).reduce((s: number, f: any) => s + (f.valor_total ?? 0), 0),
      }));

      setRows(enriched);
      setFetched(true);
    } finally { setLoading(false); }
  }, [filters, hasFullAccess, userObraId]);

  const filtered = filtroTipo === "todos" ? rows : rows.filter(r => r.tipo === filtroTipo);

  const totalManut  = filtered.reduce((s, r) => s + r.custo_manutencao, 0);
  const totalFuel   = filtered.reduce((s, r) => s + r.custo_combustivel, 0);
  const totalAluguel = filtered.reduce((s, r) => s + (r.valor_aluguel_mensal ?? 0), 0);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      disponivel:  "bg-green-100 text-green-700",
      em_uso:      "bg-blue-100 text-blue-700",
      manutencao:  "bg-amber-100 text-amber-700",
      inativo:     "bg-gray-100 text-gray-600",
    };
    const labels: Record<string, string> = {
      disponivel: "Disponível", em_uso: "Em Uso", manutencao: "Manutenção", inativo: "Inativo",
    };
    return <Badge className={cn("border-0 text-xs", map[s] ?? "bg-gray-100")}>{labels[s] ?? s}</Badge>;
  };

  const exportCSV = () => {
    const header = ["Placa","Modelo","Marca","Ano","Tipo","Status","KM Atual","Responsável",
                    "Manutenções","Custo Manutenção","Litros Combustível","Custo Combustível","Aluguel/Mês"];
    const data = filtered.map(r => [
      r.placa, r.modelo, r.marca, r.ano, r.tipo, r.status, r.quilometragem_atual,
      r.employees?.nome ?? "",
      r.qtd_manutencoes, fmt(r.custo_manutencao), r.litros_combustivel.toFixed(1), fmt(r.custo_combustivel),
      fmt(r.valor_aluguel_mensal ?? 0),
    ]);
    downloadCSV([header, ...data], `veiculos_${filters.dataInicio}_${filters.dataFim}.csv`);
  };

  return (
    <div className="space-y-4">
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
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />Exportar CSV
          </Button>
        )}
      </div>

      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Veículos",        val: filtered.length,               color: "text-foreground",   fmt: false },
            { label: "Custo Manutenção", val: totalManut,                   color: "text-amber-600",    fmt: true  },
            { label: "Custo Combustível",val: totalFuel,                    color: "text-blue-600",     fmt: true  },
            { label: "Aluguel Mensal",   val: totalAluguel,                 color: "text-violet-600",   fmt: true  },
          ].map(item => (
            <Card key={item.label} className="border-0 shadow-sm">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={cn("text-xl font-extrabold", item.color)}>
                  {item.fmt ? fmt(item.val as number) : item.val}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">KM Atual</TableHead>
                  <TableHead className="text-right">Manut.</TableHead>
                  <TableHead className="text-right">Custo Manut.</TableHead>
                  <TableHead className="text-right">Custo Comb.</TableHead>
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
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-sm">{r.employees?.nome ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{r.quilometragem_atual?.toLocaleString("pt-BR") ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{r.qtd_manutencoes}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-amber-700">{fmt(r.custo_manutencao)}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-blue-700">{fmt(r.custo_combustivel)}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      <Car className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Nenhum veículo encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!fetched && !loading && (
        <EmptyPrompt icon={Car} label='Clique em "Gerar Relatório" para carregar os dados de frota' />
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

      if (!hasFullAccess && userObraId) {
        const [{ data: ofData }, { data: ovData }] = await Promise.all([
          (supabase as any).from("obra_funcionarios").select("employee_id").eq("obra_id", userObraId).eq("status", true),
          (supabase as any).from("obra_veiculos").select("vehicle_id").eq("obra_id", userObraId).eq("status", true),
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
      if (!hasFullAccess && userObraId) obrasQ = obrasQ.eq("id", userObraId);
      const { data: obras } = await obrasQ;
      if (!obras?.length) { setRows([]); setFetched(true); setLoading(false); return; }

      // 2. para cada obra: funcionários vinculados
      const { data: obraFuncs } = await (supabase as any)
        .from("obra_funcionarios")
        .select("obra_id, employee_id")
        .in("obra_id", obras.map((o: any) => o.id))
        .eq("status", true);

      // 3. veículos dos funcionários
      const { data: veiculos } = await (supabase as any)
        .from("vehicles")
        .select("id, responsavel_id");

      // 4. manutenções no período
      const { data: manuts } = await (supabase as any)
        .from("maintenance_records")
        .select("vehicle_id, custo")
        .gte("data_realizada", filters.dataInicio)
        .lte("data_realizada", filters.dataFim)
        .eq("status", "concluida");

      // 5. combustível no período
      const { data: fuels } = await (supabase as any)
        .from("vehicle_fuel_logs")
        .select("vehicle_id, valor_total")
        .gte("data_abastecimento", filters.dataInicio)
        .lte("data_abastecimento", filters.dataFim);

      // 6. fundo fixo saídas no período
      const { data: fundos } = await (supabase as any)
        .from("fundo_fixo")
        .select("id, obra_id");

      const { data: lancamentos } = await (supabase as any)
        .from("fundo_fixo_lancamentos")
        .select("fundo_fixo_id, valor, tipo")
        .gte("data_lancamento", filters.dataInicio)
        .lte("data_lancamento", filters.dataFim)
        .eq("tipo", "saida");

      // 7. montar resultado por obra
      const resultado = (obras as any[]).map((obra: any) => {
        const empIds = (obraFuncs ?? [])
          .filter((of: any) => of.obra_id === obra.id)
          .map((of: any) => of.employee_id);

        const vIds = (veiculos ?? [])
          .filter((v: any) => empIds.includes(v.responsavel_id))
          .map((v: any) => v.id);

        const custoManut = (manuts ?? [])
          .filter((m: any) => vIds.includes(m.vehicle_id))
          .reduce((s: number, m: any) => s + (m.custo ?? 0), 0);

        const custoComb = (fuels ?? [])
          .filter((f: any) => vIds.includes(f.vehicle_id))
          .reduce((s: number, f: any) => s + (f.valor_total ?? 0), 0);

        const fundoIds = (fundos ?? [])
          .filter((ff: any) => ff.obra_id === obra.id)
          .map((ff: any) => ff.id);

        const custoFundo = (lancamentos ?? [])
          .filter((l: any) => fundoIds.includes(l.fundo_fixo_id))
          .reduce((s: number, l: any) => s + (l.valor ?? 0), 0);

        return {
          ...obra,
          empCount:   empIds.length,
          vCount:     vIds.length,
          custoManut,
          custoComb,
          custoFundo,
          total:      custoManut + custoComb + custoFundo,
        };
      }).sort((a: any, b: any) => b.total - a.total);

      setRows(resultado);
      setFetched(true);
    } finally { setLoading(false); }
  }, [filters, hasFullAccess, userObraId]);

  const totalGeral = rows.reduce((s, r) => s + r.total, 0);

  const exportCSV = () => {
    const header = ["Obra","Status","Funcionários","Veículos","Custo Manutenção","Custo Combustível","Fundo Fixo","Total"];
    const data = rows.map(r => [
      r.nome, r.status, r.empCount, r.vCount,
      fmt(r.custoManut), fmt(r.custoComb), fmt(r.custoFundo), fmt(r.total),
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground">Custo Total</p>
              <p className="text-xl font-extrabold text-foreground">{fmt(totalGeral)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Wrench className="h-3 w-3" />Manutenção
              </p>
              <p className="text-xl font-extrabold text-amber-600">
                {fmt(rows.reduce((s, r) => s + r.custoManut, 0))}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Fuel className="h-3 w-3" />Combustível
              </p>
              <p className="text-xl font-extrabold text-blue-600">
                {fmt(rows.reduce((s, r) => s + r.custoComb, 0))}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Wallet className="h-3 w-3" />Fundo Fixo
              </p>
              <p className="text-xl font-extrabold text-violet-600">
                {fmt(rows.reduce((s, r) => s + r.custoFundo, 0))}
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
                  <TableHead>Obra</TableHead>
                  <TableHead className="text-right">Func.</TableHead>
                  <TableHead className="text-right">Veíc.</TableHead>
                  <TableHead className="text-right">Manutenção</TableHead>
                  <TableHead className="text-right">Combustível</TableHead>
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
                    <TableCell className="text-right text-sm text-violet-700">{fmt(r.custoFundo)}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
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
      const [vRes, mRes, fRes, wRes] = await Promise.all([
        (supabase as any).from("vehicles")
          .select("id, placa, modelo, marca, tipo, valor_aluguel_mensal, responsavel_id, employees(nome)")
          .order("placa"),
        (supabase as any).from("maintenance_records")
          .select("vehicle_id, custo, tipo")
          .gte("data_realizada", filters.dataInicio)
          .lte("data_realizada", filters.dataFim)
          .eq("status", "concluida"),
        (supabase as any).from("vehicle_fuel_logs")
          .select("vehicle_id, valor_total, litros")
          .gte("data_abastecimento", filters.dataInicio)
          .lte("data_abastecimento", filters.dataFim),
        (supabase as any).from("wash_records")
          .select("vehicle_id, valor")
          .gte("data_lavagem", filters.dataInicio)
          .lte("data_lavagem", filters.dataFim),
      ]);

      const manuts  = mRes.data ?? [];
      const fuels   = fRes.data ?? [];
      const washes  = wRes.data ?? [];
      let veiculos  = vRes.data ?? [];

      if (!hasFullAccess && userObraId) {
        const [{ data: ofData }, { data: ovData }] = await Promise.all([
          (supabase as any).from("obra_funcionarios").select("employee_id").eq("obra_id", userObraId).eq("status", true),
          (supabase as any).from("obra_veiculos").select("vehicle_id").eq("obra_id", userObraId).eq("status", true),
        ]);
        const empIds     = (ofData ?? []).map((e: any) => e.employee_id);
        const obraVehIds = (ovData ?? []).map((v: any) => v.vehicle_id);
        veiculos = veiculos.filter((v: any) =>
          empIds.includes(v.responsavel_id) || obraVehIds.includes(v.id)
        );
      }

      const enriched = veiculos.map((v: any) => {
        const custoManut  = manuts.filter((m: any) => m.vehicle_id === v.id).reduce((s: number, m: any) => s + (m.custo ?? 0), 0);
        const custoComb   = fuels.filter((f: any) => f.vehicle_id === v.id).reduce((s: number, f: any) => s + (f.valor_total ?? 0), 0);
        const custoLav    = washes.filter((w: any) => w.vehicle_id === v.id).reduce((s: number, w: any) => s + (w.valor ?? 0), 0);
        const aluguel     = v.valor_aluguel_mensal ?? 0;
        return {
          ...v,
          custoManut, custoComb, custoLav, aluguel,
          total: custoManut + custoComb + custoLav + aluguel,
        };
      }).sort((a: any, b: any) => b.total - a.total);

      setRows(enriched);
      setFetched(true);
    } finally { setLoading(false); }
  }, [filters, hasFullAccess, userObraId]);

  const filtered  = filtroTipo === "todos" ? rows : rows.filter(r => r.tipo === filtroTipo);
  const totalManut  = filtered.reduce((s, r) => s + r.custoManut, 0);
  const totalComb   = filtered.reduce((s, r) => s + r.custoComb, 0);
  const totalLav    = filtered.reduce((s, r) => s + r.custoLav, 0);
  const totalAlug   = filtered.reduce((s, r) => s + r.aluguel, 0);
  const totalGeral  = filtered.reduce((s, r) => s + r.total, 0);

  const exportCSV = () => {
    const header = ["Placa","Modelo","Tipo","Responsável","Custo Manutenção","Custo Combustível","Custo Lavagem","Aluguel/Mês","Total"];
    const data = filtered.map(r => [
      r.placa, `${r.marca} ${r.modelo}`, r.tipo, r.employees?.nome ?? "",
      fmt(r.custoManut), fmt(r.custoComb), fmt(r.custoLav), fmt(r.aluguel), fmt(r.total),
    ]);
    downloadCSV([header, ...data], `custo_frota_${filters.dataInicio}_${filters.dataFim}.csv`);
  };

  return (
    <div className="space-y-4">
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
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />Exportar CSV
          </Button>
        )}
      </div>

      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Custo Total",     val: totalGeral, color: "text-foreground"  },
            { label: "Manutenção",      val: totalManut, color: "text-amber-600"   },
            { label: "Combustível",     val: totalComb,  color: "text-blue-600"    },
            { label: "Lavagem",         val: totalLav,   color: "text-teal-600"    },
            { label: "Aluguel",         val: totalAlug,  color: "text-violet-600"  },
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
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Manutenção</TableHead>
                  <TableHead className="text-right">Combustível</TableHead>
                  <TableHead className="text-right">Lavagem</TableHead>
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
                    <TableCell className="text-right text-sm text-violet-700">{fmt(r.aluguel)}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))}
                {/* Linha de totais */}
                {filtered.length > 0 && (
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={4} className="text-sm">TOTAL</TableCell>
                    <TableCell className="text-right text-sm text-amber-700">{fmt(totalManut)}</TableCell>
                    <TableCell className="text-right text-sm text-blue-700">{fmt(totalComb)}</TableCell>
                    <TableCell className="text-right text-sm text-teal-700">{fmt(totalLav)}</TableCell>
                    <TableCell className="text-right text-sm text-violet-700">{fmt(totalAlug)}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{fmt(totalGeral)}</TableCell>
                  </TableRow>
                )}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
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

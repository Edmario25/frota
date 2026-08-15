import { useState, useCallback, useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Users, Clock, AlertCircle, CheckCircle2,
  Download, Search, Filter, RefreshCw, Save,
  ChevronDown, ChevronUp, Timer, TrendingUp, Upload,
  FileSpreadsheet, CheckSquare, XSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Obra     { id: string; nome: string }
interface Employee { id: string; nome: string; cargo_nome: string | null }

interface PontoRow extends Employee {
  ausencia:         boolean;
  motivo_ausencia:  string;
  frente:           string;
  empresa:          string;
  hora_entrada:     string;
  hora_saida:       string;
  horas_extras:     string;
  // calculado
  horas_trabalhadas: number | null;
  // id do registro já salvo (para upsert)
  existing_id:      string | null;
  // controle de UI
  expanded:         boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcHoras(entrada: string, saida: string): number | null {
  if (!entrada || !saida) return null;
  const [eh, em] = entrada.split(":").map(Number);
  const [sh, sm] = saida.split(":").map(Number);
  const diff = (sh * 60 + sm) - (eh * 60 + em);
  if (diff <= 0) return null;
  return Math.round((diff / 60) * 100) / 100;
}

function fmtHoras(h: number | null): string {
  if (h === null) return "—";
  const horas  = Math.floor(h);
  const mins   = Math.round((h - horas) * 60);
  return `${horas}h${mins > 0 ? ` ${mins}m` : ""}`;
}

const FRENTES = ["Fundação", "Estrutura", "Alvenaria", "Acabamento", "Instalações", "Cobertura", "Externas", "Escritório", "Outro"];
const today   = format(new Date(), "yyyy-MM-dd");

// ─── Tipo para importação CSV ─────────────────────────────────────────────────
interface ImportRow {
  employee_id: string;
  nome:        string;
  ausencia:    boolean;
  motivo_ausencia: string;
  hora_entrada: string;
  hora_saida:   string;
  horas_extras: string;
  frente:       string;
  empresa:      string;
  horas_calc:   number | null;
  valido:       boolean;
  erros:        string[];
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Efetivo() {
  const [obras, setObras]         = useState<Obra[]>([]);
  const [obraId, setObraId]       = useState("");
  const [data, setData]           = useState(today);
  const [rows, setRows]           = useState<PontoRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [loaded, setLoaded]       = useState(false);
  const [search, setSearch]       = useState("");
  const [filtroFrente, setFiltroFrente] = useState("");

  // Importação CSV
  const fileRef               = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen]   = useState(false);
  const [importRows, setImportRows]   = useState<ImportRow[]>([]);
  const [importSaving, setImportSaving] = useState(false);

  // Carregar obras
  useEffect(() => {
    supabase
      .from("obras")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setObras((data ?? []) as Obra[]));
  }, []);

  // ─── Carregar funcionários + apontamentos do dia ─────────────────────────
  const handleCarregar = useCallback(async () => {
    if (!obraId || !data) { toast.error("Selecione a obra e a data"); return; }
    setLoading(true);
    setLoaded(false);
    try {
      // Funcionários da obra (via obra_funcionarios — tabela usada no cadastro)
      const { data: emps } = await (supabase as any)
        .from("obra_funcionarios")
        .select("employee_id, employees(id, nome, cargos(nome))")
        .eq("obra_id", obraId)
        .eq("status", true);

      // Apontamentos já salvos para obra+data
      const { data: pontos } = await (supabase as any)
        .from("efetivo_ponto")
        .select("*")
        .eq("obra_id", obraId)
        .eq("data", data);

      const pontoMap: Record<string, any> = {};
      (pontos ?? []).forEach((p: any) => { pontoMap[p.employee_id] = p; });

      const newRows: PontoRow[] = (emps ?? [])
        .map((a: any) => a.employees)
        .filter(Boolean)
        .map((e: any) => {
          const ponto = pontoMap[e.id] ?? null;
          const entrada = ponto?.hora_entrada?.slice(0, 5) ?? "";
          const saida   = ponto?.hora_saida?.slice(0, 5) ?? "";
          return {
            id:                e.id,
            nome:              e.nome,
            cargo_nome:        e.cargos?.nome ?? null,
            ausencia:          ponto?.ausencia ?? false,
            motivo_ausencia:   ponto?.motivo_ausencia ?? "",
            frente:            ponto?.frente ?? "",
            empresa:           ponto?.empresa ?? "",
            hora_entrada:      entrada,
            hora_saida:        saida,
            horas_extras:      ponto?.horas_extras?.toString() ?? "0",
            horas_trabalhadas: calcHoras(entrada, saida),
            existing_id:       ponto?.id ?? null,
            expanded:          false,
          } satisfies PontoRow;
        })
        .sort((a: PontoRow, b: PontoRow) => a.nome.localeCompare(b.nome));

      setRows(newRows);
      setLoaded(true);
      if (newRows.length === 0) toast.info("Nenhum funcionário vinculado a essa obra. Vincule no cadastro do funcionário, campo Obra.");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [obraId, data]);

  // ─── Atualizar uma linha ────────────────────────────────────────────────
  function updateRow(empId: string, changes: Partial<PontoRow>) {
    setRows(prev => prev.map(r => {
      if (r.id !== empId) return r;
      const updated = { ...r, ...changes };
      // recalcular horas automaticamente
      if ("hora_entrada" in changes || "hora_saida" in changes) {
        updated.horas_trabalhadas = calcHoras(updated.hora_entrada, updated.hora_saida);
      }
      return updated;
    }));
  }

  // ─── Salvar todos os apontamentos ──────────────────────────────────────
  async function handleSalvar() {
    if (!obraId || !data) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      const upsertData = rows.map(r => ({
        id:                r.existing_id ?? undefined,
        obra_id:           obraId,
        employee_id:       r.id,
        data,
        frente:            r.frente || null,
        empresa:           r.empresa || null,
        hora_entrada:      r.ausencia ? null : (r.hora_entrada || null),
        hora_saida:        r.ausencia ? null : (r.hora_saida || null),
        horas_trabalhadas: r.ausencia ? null : r.horas_trabalhadas,
        horas_extras:      r.ausencia ? 0 : (parseFloat(r.horas_extras) || 0),
        ausencia:          r.ausencia,
        motivo_ausencia:   r.ausencia ? (r.motivo_ausencia || null) : null,
        registrado_por:    userId,
      }));

      const { error } = await (supabase as any)
        .from("efetivo_ponto")
        .upsert(upsertData, { onConflict: "obra_id,employee_id,data" });

      if (error) throw new Error(error.message);
      toast.success("Apontamento salvo com sucesso!");
      // atualizar existing_id das linhas novas
      handleCarregar();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ─── Baixar modelo CSV ─────────────────────────────────────────────────
  function handleDownloadModelo() {
    if (!loaded || rows.length === 0) { toast.error("Carregue a equipe antes de baixar o modelo"); return; }
    const obraNome = obras.find(o => o.id === obraId)?.nome ?? obraId;
    const header = "employee_id,nome,ausencia,motivo_ausencia,hora_entrada,hora_saida,horas_extras,frente,empresa";
    const csvRows = rows.map(r =>
      `${r.id},"${r.nome}",Não,,08:00,17:00,0,,`
    );
    const csv  = [header, ...csvRows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `modelo_ponto_${obraNome}_${data}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Modelo baixado! Preencha e depois importe o arquivo.");
  }

  // ─── Processar arquivo CSV ──────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!loaded || rows.length === 0) { toast.error("Carregue a equipe antes de importar"); return; }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
      if (lines.length < 2) { toast.error("Arquivo vazio ou sem dados"); return; }

      // Mapeia employee_id → employee
      const empMap: Record<string, Employee> = {};
      rows.forEach(r => { empMap[r.id] = r; });

      const parsed: ImportRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").trim());
        const [eid, , ausStr, motivo, entrada, saida, extras, frente, empresa] = cols;
        const erros: string[] = [];

        const emp = empMap[eid];
        if (!emp) erros.push("employee_id não encontrado nessa obra");

        const ausencia = ausStr?.toLowerCase() === "sim";
        if (!ausencia && entrada && !/^\d{2}:\d{2}$/.test(entrada)) erros.push("Hora entrada inválida (use HH:MM)");
        if (!ausencia && saida   && !/^\d{2}:\d{2}$/.test(saida))   erros.push("Hora saída inválida (use HH:MM)");

        parsed.push({
          employee_id:    eid ?? "",
          nome:           emp?.nome ?? cols[1] ?? "—",
          ausencia,
          motivo_ausencia: motivo ?? "",
          hora_entrada:   ausencia ? "" : (entrada ?? ""),
          hora_saida:     ausencia ? "" : (saida ?? ""),
          horas_extras:   extras ?? "0",
          frente:         frente ?? "",
          empresa:        empresa ?? "",
          horas_calc:     ausencia ? null : calcHoras(entrada ?? "", saida ?? ""),
          valido:         erros.length === 0,
          erros,
        });
      }

      setImportRows(parsed);
      setImportOpen(true);
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(file, "UTF-8");
  }

  // ─── Confirmar importação ───────────────────────────────────────────────
  async function handleConfirmImport() {
    const validas = importRows.filter(r => r.valido);
    if (validas.length === 0) { toast.error("Nenhuma linha válida para importar"); return; }

    setImportSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      const upsertData = validas.map(r => ({
        obra_id:           obraId,
        employee_id:       r.employee_id,
        data,
        frente:            r.frente || null,
        empresa:           r.empresa || null,
        hora_entrada:      r.ausencia ? null : (r.hora_entrada || null),
        hora_saida:        r.ausencia ? null : (r.hora_saida || null),
        horas_trabalhadas: r.ausencia ? null : r.horas_calc,
        horas_extras:      parseFloat(r.horas_extras) || 0,
        ausencia:          r.ausencia,
        motivo_ausencia:   r.ausencia ? (r.motivo_ausencia || null) : null,
        registrado_por:    userId,
      }));

      const { error } = await (supabase as any)
        .from("efetivo_ponto")
        .upsert(upsertData, { onConflict: "obra_id,employee_id,data" });

      if (error) throw new Error(error.message);
      toast.success(`${validas.length} registros importados com sucesso!`);
      setImportOpen(false);
      setImportRows([]);
      handleCarregar();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao importar");
    } finally {
      setImportSaving(false);
    }
  }

  // ─── Exportar CSV ──────────────────────────────────────────────────────
  function handleExportCSV() {
    const obraNome = obras.find(o => o.id === obraId)?.nome ?? obraId;
    const headers = ["Funcionário","Cargo","Frente","Empresa","Entrada","Saída","Horas","H.Extra","Ausência","Motivo"];
    const csvRows = rows.map(r => [
      r.nome, r.cargo_nome ?? "", r.frente, r.empresa,
      r.ausencia ? "" : r.hora_entrada,
      r.ausencia ? "" : r.hora_saida,
      r.ausencia ? "0" : (r.horas_trabalhadas?.toString() ?? ""),
      r.horas_extras,
      r.ausencia ? "Sim" : "Não",
      r.motivo_ausencia,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `efetivo_${obraNome}_${data}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── KPIs ──────────────────────────────────────────────────────────────
  const presentes  = rows.filter(r => !r.ausencia).length;
  const ausentes   = rows.filter(r => r.ausencia).length;
  const hhtTotal   = rows.filter(r => !r.ausencia).reduce((s, r) => s + (r.horas_trabalhadas ?? 0), 0);
  const hhExtras   = rows.filter(r => !r.ausencia).reduce((s, r) => s + (parseFloat(r.horas_extras) || 0), 0);

  // ─── Filtro ────────────────────────────────────────────────────────────
  const filtered = rows.filter(r =>
    (!search       || r.nome.toLowerCase().includes(search.toLowerCase())) &&
    (!filtroFrente || r.frente === filtroFrente)
  );

  const obraNome = obras.find(o => o.id === obraId)?.nome ?? "";

  return (
    <Layout>
      <div className="space-y-6">

        {/* Input oculto para arquivo */}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Efetivo e Ponto</h1>
            <p className="text-muted-foreground text-sm">
              Apontamento diário de presença e horas trabalhadas
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleDownloadModelo} className="gap-2 rounded-xl">
              <FileSpreadsheet className="h-4 w-4" /> Baixar Modelo
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2 rounded-xl">
              <Upload className="h-4 w-4" /> Importar CSV
            </Button>
            {loaded && rows.length > 0 && (
              <Button variant="outline" onClick={handleExportCSV} className="gap-2 rounded-xl">
                <Download className="h-4 w-4" /> Exportar Dia
              </Button>
            )}
          </div>
        </div>

        {/* Filtros de carregamento */}
        <Card className="border-0 shadow-medium rounded-2xl">
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="space-y-1.5">
                <Label>Obra</Label>
                <Select value={obraId} onValueChange={setObraId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecione a obra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {obras.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={data}
                  onChange={e => setData(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <Button
                onClick={handleCarregar}
                disabled={loading || !obraId || !data}
                className="gap-2 rounded-xl"
              >
                {loading
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Carregando...</>
                  : <><Users className="h-4 w-4" /> Carregar Equipe</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Skeletons durante carregamento */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {/* KPIs */}
        {loaded && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Presentes",      value: presentes, sub: `de ${rows.length}`,    icon: CheckCircle2, color: "bg-green-100 text-green-600 dark:bg-green-900/30" },
              { label: "Ausências",      value: ausentes,  sub: "no dia",               icon: AlertCircle,  color: ausentes > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-muted/50 text-muted-foreground" },
              { label: "HHT Total",      value: fmtHoras(hhtTotal), sub: "horas homem", icon: Clock,        color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30" },
              { label: "Horas Extras",   value: fmtHoras(hhExtras), sub: "no total",    icon: TrendingUp,   color: hhExtras > 0 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" : "bg-muted/50 text-muted-foreground" },
            ].map(s => (
              <Card key={s.label} className="border-0 shadow-subtle rounded-2xl">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0", s.color)}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-tight">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-[10px] text-muted-foreground/70">{s.sub}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Lista de apontamento */}
        {loaded && !loading && rows.length > 0 && (
          <Card className="border-0 shadow-medium rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base">
                    Equipe — {obraNome} · {format(new Date(data + "T12:00:00"), "EEEE, dd/MM/yyyy", { locale: ptBR })}
                  </CardTitle>
                  <CardDescription>{rows.length} funcionários vinculados a essa obra</CardDescription>
                </div>
              </div>

              {/* Filtros inline */}
              <div className="flex gap-2 flex-wrap mt-3">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar funcionário..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9 rounded-xl text-sm"
                  />
                </div>
                <Select value={filtroFrente} onValueChange={setFiltroFrente}>
                  <SelectTrigger className="h-9 rounded-xl w-44 text-sm">
                    <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Frente..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as frentes</SelectItem>
                    {FRENTES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="space-y-2 pt-0">
              {filtered.map(row => (
                <PontoCard
                  key={row.id}
                  row={row}
                  onChange={changes => updateRow(row.id, changes)}
                />
              ))}

              {filtered.length === 0 && (
                <p className="text-center py-6 text-sm text-muted-foreground">Nenhum resultado para o filtro aplicado.</p>
              )}
            </CardContent>

            {/* Footer — salvar */}
            <div className="px-6 pb-5 pt-2 border-t flex justify-end gap-3">
              <Button
                onClick={handleSalvar}
                disabled={saving}
                size="lg"
                className="gap-2 rounded-xl"
              >
                {saving
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Salvando...</>
                  : <><Save className="h-4 w-4" /> Salvar Apontamento</>
                }
              </Button>
            </div>
          </Card>
        )}

        {/* Estado vazio inicial */}
        {!loaded && !loading && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Timer className="h-7 w-7 text-primary" />
            </div>
            <p className="font-medium">Selecione a obra e a data</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Escolha a obra e a data de referência para carregar os funcionários vinculados e registrar a presença.
            </p>
          </div>
        )}

      </div>

      {/* ─── Modal Preview Importação ─────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-4xl rounded-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" /> Preview da Importação
            </DialogTitle>
            <DialogDescription>
              {importRows.filter(r => r.valido).length} válidas · {importRows.filter(r => !r.valido).length} com erro · Data: {data}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto px-6 py-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>HH</TableHead>
                  <TableHead>Frente</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((r, i) => (
                  <TableRow key={i} className={r.valido ? "" : "bg-red-50 dark:bg-red-950/20"}>
                    <TableCell>
                      {r.valido
                        ? <CheckSquare className="h-4 w-4 text-green-500" />
                        : <XSquare className="h-4 w-4 text-red-500" />
                      }
                    </TableCell>
                    <TableCell className="font-medium text-sm">{r.nome}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs rounded-full", r.ausencia ? "border-red-300 text-red-600" : "border-green-300 text-green-600")}>
                        {r.ausencia ? "Ausente" : "Presente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.ausencia ? "—" : (r.hora_entrada || "—")}</TableCell>
                    <TableCell className="text-sm">{r.ausencia ? "—" : (r.hora_saida || "—")}</TableCell>
                    <TableCell className="text-sm">{r.ausencia ? "—" : fmtHoras(r.horas_calc)}</TableCell>
                    <TableCell className="text-sm">{r.frente || "—"}</TableCell>
                    <TableCell className="text-xs text-red-600">
                      {r.erros.join("; ") || (r.ausencia && r.motivo_ausencia ? r.motivo_ausencia : "")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30">
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importSaving} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={importSaving || importRows.filter(r => r.valido).length === 0}
              className="rounded-xl gap-2"
            >
              {importSaving
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Importando...</>
                : <><Upload className="h-4 w-4" /> Confirmar {importRows.filter(r => r.valido).length} registros</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}

// ─── Cartão de apontamento por funcionário ────────────────────────────────────
interface PontoCardProps {
  row: PontoRow;
  onChange: (changes: Partial<PontoRow>) => void;
}

function PontoCard({ row, onChange }: PontoCardProps) {
  const horas = row.horas_trabalhadas;

  return (
    <div className={cn(
      "rounded-xl border transition-colors",
      row.ausencia
        ? "border-red-200 bg-red-50/50 dark:border-red-800/50 dark:bg-red-950/20"
        : "border-border/60 bg-card",
    )}>
      {/* Linha principal */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Avatar inicial */}
        <div className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0",
          row.ausencia
            ? "bg-red-200 text-red-700 dark:bg-red-800 dark:text-red-200"
            : "bg-primary/10 text-primary"
        )}>
          {row.nome.charAt(0).toUpperCase()}
        </div>

        {/* Nome + cargo */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{row.nome}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {row.cargo_nome && (
              <span className="text-[10px] text-muted-foreground">{row.cargo_nome}</span>
            )}
            {!row.ausencia && horas !== null && (
              <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 rounded-full bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20">
                <Clock className="h-2 w-2 mr-0.5" />{fmtHoras(horas)}
              </Badge>
            )}
            {row.frente && (
              <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 rounded-full">
                {row.frente}
              </Badge>
            )}
          </div>
        </div>

        {/* Toggle presente/ausente */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn("text-xs font-medium", row.ausencia ? "text-red-600" : "text-green-600")}>
            {row.ausencia ? "Ausente" : "Presente"}
          </span>
          <Switch
            checked={!row.ausencia}
            onCheckedChange={v => onChange({ ausencia: !v })}
            className="data-[state=checked]:bg-green-500"
          />
        </div>

        {/* Expandir */}
        <button
          onClick={() => onChange({ expanded: !row.expanded })}
          className="ml-1 h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/60 transition-colors flex-shrink-0"
        >
          {row.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Detalhes expandidos */}
      {row.expanded && (
        <div className="border-t border-border/40 px-4 py-4 space-y-4">
          {row.ausencia ? (
            /* Motivo de ausência */
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo da Ausência</Label>
              <Textarea
                value={row.motivo_ausencia}
                onChange={e => onChange({ motivo_ausencia: e.target.value })}
                placeholder="Falta justificada, atestado médico, etc."
                className="rounded-xl text-sm resize-none"
                rows={2}
              />
            </div>
          ) : (
            /* Campos de presença */
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Entrada</Label>
                <Input
                  type="time"
                  value={row.hora_entrada}
                  onChange={e => onChange({ hora_entrada: e.target.value })}
                  className="rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Saída</Label>
                <Input
                  type="time"
                  value={row.hora_saida}
                  onChange={e => onChange({ hora_saida: e.target.value })}
                  className="rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">H. Extras</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={row.horas_extras}
                  onChange={e => onChange({ horas_extras: e.target.value })}
                  placeholder="0"
                  className="rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">HH Trabalhadas</Label>
                <div className="h-9 rounded-xl bg-muted/40 border border-border/50 flex items-center px-3">
                  <span className={cn("text-sm font-medium", horas !== null ? "text-green-600" : "text-muted-foreground")}>
                    {horas !== null ? fmtHoras(horas) : "Preencha os horários"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Frente e empresa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Frente de Serviço</Label>
              <Select value={row.frente} onValueChange={v => onChange({ frente: v })}>
                <SelectTrigger className="rounded-xl text-sm">
                  <SelectValue placeholder="Selecione a frente..." />
                </SelectTrigger>
                <SelectContent>
                  {FRENTES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Empresa / Subcontratada</Label>
              <Input
                value={row.empresa}
                onChange={e => onChange({ empresa: e.target.value })}
                placeholder="Nome da empresa..."
                className="rounded-xl text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

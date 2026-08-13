import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { GraduationCap, Search, RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useObras } from "@/hooks/useObras";

// ─── Types ──────────────────────────────────────────────────────────────────
type TrStatus = "pendente" | "em_dia" | "a_vencer" | "vencido";

interface ColabTreinamento {
  id: string;
  status: TrStatus;
  data_realizacao: string | null;
  data_vencimento: string | null;
  instituicao: string | null;
  obra_id: string | null;
  employees: { nome: string } | null;
  sms_treinamentos_catalogo: { nome: string; nr_referencia: string | null; carga_horaria_h: number | null; validade_meses: number | null } | null;
  obras: { nome: string } | null;
}

// ─── Badge helpers ───────────────────────────────────────────────────────────
const statusStyle: Record<TrStatus, string> = {
  pendente:  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  em_dia:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  a_vencer:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  vencido:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const statusLabel: Record<TrStatus, string> = {
  pendente:  "Pendente",
  em_dia:    "Em Dia",
  a_vencer:  "A Vencer",
  vencido:   "Vencido",
};

const statusIcon: Record<TrStatus, React.ElementType> = {
  pendente:  Clock,
  em_dia:    CheckCircle2,
  a_vencer:  AlertTriangle,
  vencido:   AlertTriangle,
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SmsTreinamentos() {
  const { toast } = useToast();
  const { obras } = useObras();

  const [registros, setRegistros] = useState<ColabTreinamento[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filtroObra, setFiltroObra] = useState("all");
  const [filtroStatus, setFiltroStatus] = useState("all");

  // ─── KPIs rápidos ─────────────────────────────────────────────────────────
  const total    = registros.length;
  const emDia    = registros.filter(r => r.status === "em_dia").length;
  const aVencer  = registros.filter(r => r.status === "a_vencer").length;
  const vencidos = registros.filter(r => r.status === "vencido").length;

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("sms_colaborador_treinamentos")
      .select(`
        id, status, data_realizacao, data_vencimento, instituicao, obra_id,
        employees(nome),
        sms_treinamentos_catalogo(nome, nr_referencia, carga_horaria_h, validade_meses),
        obras(nome)
      `)
      .order("data_vencimento", { ascending: true })
      .limit(300);

    if (filtroObra !== "all")   q = q.eq("obra_id", filtroObra);
    if (filtroStatus !== "all") q = q.eq("status", filtroStatus);

    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar treinamentos", variant: "destructive" });
    setRegistros((data ?? []) as ColabTreinamento[]);
    setLoading(false);
  }, [filtroObra, filtroStatus, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Filtro local ─────────────────────────────────────────────────────────
  const filtered = registros.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.employees?.nome?.toLowerCase().includes(q) ||
      r.sms_treinamentos_catalogo?.nome?.toLowerCase().includes(q) ||
      r.obras?.nome?.toLowerCase().includes(q)
    );
  });

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-emerald-500" />
            Treinamentos / ASO
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Matriz de treinamentos obrigatórios e exames ocupacionais por colaborador
          </p>
        </div>

        {/* KPIs rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: total, color: "text-foreground", bg: "bg-muted/50" },
            { label: "Em Dia", value: emDia, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/10" },
            { label: "A Vencer", value: aVencer, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/10" },
            { label: "Vencidos", value: vencidos, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/10" },
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
              placeholder="Buscar colaborador ou treinamento..."
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
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="em_dia">Em Dia</SelectItem>
              <SelectItem value="a_vencer">A Vencer</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={fetchData} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Treinamento</TableHead>
                  <TableHead>NR</TableHead>
                  <TableHead>Carga</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Realização</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <GraduationCap className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">Nenhum registro encontrado</p>
                      <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou adicione treinamentos</p>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.map(r => {
                  const Icon = statusIcon[r.status];
                  const diasVenc = r.data_vencimento
                    ? Math.ceil((new Date(r.data_vencimento).getTime() - Date.now()) / 86_400_000)
                    : null;
                  return (
                    <TableRow key={r.id} className={cn(
                      "hover:bg-muted/30 transition-colors",
                      r.status === "vencido" && "bg-red-50/30 dark:bg-red-900/5",
                    )}>
                      <TableCell>
                        <p className="text-sm font-medium">{r.employees?.nome ?? "–"}</p>
                        {false && (
                          <p className="text-xs text-muted-foreground"></p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.sms_treinamentos_catalogo?.nome ?? "–"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.sms_treinamentos_catalogo?.nr_referencia ?? "–"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.sms_treinamentos_catalogo?.carga_horaria_h
                          ? `${r.sms_treinamentos_catalogo.carga_horaria_h}h`
                          : "–"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.obras?.nome ?? "–"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.data_realizacao
                          ? new Date(r.data_realizacao + "T12:00:00").toLocaleDateString("pt-BR")
                          : "–"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.data_vencimento ? (
                          <span className={cn(
                            diasVenc !== null && diasVenc < 0 ? "text-red-600 font-medium" :
                            diasVenc !== null && diasVenc <= 30 ? "text-amber-600 font-medium" : "text-muted-foreground"
                          )}>
                            {new Date(r.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                            {diasVenc !== null && diasVenc < 0 && ` (${Math.abs(diasVenc)}d atrás)`}
                            {diasVenc !== null && diasVenc >= 0 && diasVenc <= 30 && ` (${diasVenc}d)`}
                          </span>
                        ) : "–"}
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", statusStyle[r.status])}>
                          <Icon className="h-2.5 w-2.5" />
                          {statusLabel[r.status]}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
              {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

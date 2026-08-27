import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Wrench, Plus, Pencil, RefreshCw, Search, ShieldAlert,
  AlertTriangle, CheckCircle2, MapPin, User, Clock,
  FileText, Award, ArrowRightLeft, XCircle, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Obra     { id: string; nome: string }
interface Employee { id: string; nome: string }

interface Ferramenta {
  id: string; nome: string; descricao: string | null; categoria: string | null;
  numero_serie: string | null; fabricante: string | null; modelo: string | null;
  capacidade: string | null; exige_certificacao: boolean; ativo: boolean;
  tipo_item: "ferramenta" | "equipamento" | "maquina"; codigo_patrimonio: string | null;
  unidade_medicao: "unidade" | "horimetro"; horimetro_atual: number | null;
  status_operacional: "disponivel" | "operando" | "manutencao" | "bloqueado" | "inativo";
  periodicidade_inspecao_dias: number | null; proxima_inspecao: string | null;
  // da view
  obra_atual_nome: string | null; frente_atual: string | null; condicao: string | null;
  data_alocacao: string | null; cert_status: string; proximo_vencimento: string | null;
}

interface Alocacao {
  id: string; ferramenta_id: string; obra_id: string; frente: string | null;
  data_alocacao: string; data_devolucao: string | null; condicao: string;
  observacoes: string | null;
  ferramentas_catalogo: { nome: string; categoria: string | null };
  obras: { nome: string };
  employees: { nome: string } | null;
}

interface Certificacao {
  id: string; ferramenta_id: string; tipo_certificacao: string;
  numero_certificado: string | null; empresa_certificadora: string | null;
  data_emissao: string | null; data_vencimento: string; observacoes: string | null;
  ferramentas_catalogo: { nome: string };
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS   = ["Içamento","Corte","Medição","Elétrico","Hidráulico","Pneumático","Compactação","Geração de Energia","Concretagem","Terraplenagem","Segurança","Outro"];
const TIPOS_ITEM = [
  { value: "ferramenta", label: "Ferramenta" },
  { value: "equipamento", label: "Equipamento" },
  { value: "maquina", label: "Máquina" },
];
const STATUS_OPERACIONAL = [
  { value: "disponivel", label: "Disponível" }, { value: "operando", label: "Operando" },
  { value: "manutencao", label: "Em manutenção" }, { value: "bloqueado", label: "Bloqueado" },
  { value: "inativo", label: "Inativo" },
];
const TIPOS_CERT   = ["Lacre","Certificado de Carga","Inspeção NR-11","Inspeção NR-18","Teste Dielétrico","Laudo Técnico","Outro"];
const CONDICOES    = [
  { value: "otimo",      label: "Ótimo",     color: "text-green-600 bg-green-50 border-green-200" },
  { value: "bom",        label: "Bom",       color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "regular",    label: "Regular",   color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "danificado", label: "Danificado",color: "text-red-600 bg-red-50 border-red-200" },
];

function condicaoColor(c: string) { return CONDICOES.find(x => x.value === c)?.color ?? ""; }
function condicaoLabel(c: string) { return CONDICOES.find(x => x.value === c)?.label ?? c; }

// Status de certificação
function certBadge(status: string, proximo?: string | null) {
  if (status === "nao_exige") return null;
  if (status === "vencido")   return <Badge variant="outline" className="text-xs rounded-full bg-red-50 text-red-700 border-red-300"><XCircle className="h-2.5 w-2.5 mr-1" />Cert. Vencido</Badge>;
  if (status === "a_vencer")  return <Badge variant="outline" className="text-xs rounded-full bg-amber-50 text-amber-700 border-amber-300"><AlertTriangle className="h-2.5 w-2.5 mr-1" />Vence em breve</Badge>;
  if (status === "valido")    return <Badge variant="outline" className="text-xs rounded-full bg-green-50 text-green-700 border-green-300"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Certificado OK</Badge>;
  if (status === "sem_cert")  return <Badge variant="outline" className="text-xs rounded-full bg-muted text-muted-foreground"><ShieldAlert className="h-2.5 w-2.5 mr-1" />Sem certificado</Badge>;
  return null;
}

function diasParaVencer(data: string): number {
  return differenceInDays(parseISO(data), new Date());
}

function certStatusColor(data_vencimento: string): string {
  const dias = diasParaVencer(data_vencimento);
  if (dias < 0)  return "bg-red-50 dark:bg-red-950/20 border-red-200";
  if (dias <= 30) return "bg-amber-50 dark:bg-amber-950/20 border-amber-200";
  return "";
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Ferramentas() {
  const [obras, setObras]         = useState<Obra[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ferramentas, setFerr]    = useState<Ferramenta[]>([]);
  const [loadingFerr, setLoadingFerr] = useState(false);

  useEffect(() => {
    supabase.from("obras").select("id, nome").order("nome").then(({ data }) => setObras((data ?? []) as Obra[]));
    (supabase as any).from("employees").select("id, nome").order("nome").then(({ data }: any) => setEmployees((data ?? []) as Employee[]));
    fetchFerramentas();
  }, []);

  async function fetchFerramentas() {
    setLoadingFerr(true);
    const { data } = await (supabase as any).from("v_ferramentas_situacao").select("*").order("nome");
    setFerr((data ?? []) as Ferramenta[]);
    setLoadingFerr(false);
  }

  // KPIs globais
  const vencidos  = ferramentas.filter(f => f.cert_status === "vencido").length;
  const aVencer   = ferramentas.filter(f => f.cert_status === "a_vencer").length;
  const alocados  = ferramentas.filter(f => f.obra_atual_nome).length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ferramentas e Equipamentos</h1>
            <p className="text-muted-foreground text-sm">Controle de alocação e certificações de segurança (NR-11 / NR-18)</p>
          </div>
        </div>

        {/* Alertas críticos de certificação */}
        {(vencidos > 0 || aVencer > 0) && (
          <div className={cn("rounded-2xl border px-5 py-4 flex items-start gap-3",
            vencidos > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
          )}>
            <ShieldAlert className={cn("h-5 w-5 flex-shrink-0 mt-0.5", vencidos > 0 ? "text-red-600" : "text-amber-600")} />
            <div>
              <p className={cn("font-semibold text-sm", vencidos > 0 ? "text-red-700" : "text-amber-700")}>
                {vencidos > 0 ? `⚠️ ${vencidos} equipamento(s) com certificação VENCIDA` : `${aVencer} certificação(ões) vencendo nos próximos 30 dias`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Verifique a aba Certificações e providencie a renovação antes do uso em campo.</p>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Equipamentos",       value: ferramentas.length, icon: Wrench,      color: "bg-primary/10 text-primary" },
            { label: "Alocados em obra",   value: alocados,           icon: MapPin,      color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30" },
            { label: "Cert. vencidas",     value: vencidos,           icon: XCircle,     color: vencidos > 0   ? "bg-red-100 text-red-600 dark:bg-red-900/30"   : "bg-muted/50 text-muted-foreground" },
            { label: "Vencendo em 30d",    value: aVencer,            icon: AlertTriangle,color: aVencer > 0   ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" : "bg-muted/50 text-muted-foreground" },
          ].map(s => (
            <Card key={s.label} className="border-0 shadow-subtle rounded-2xl">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0", s.color)}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-tight">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="equipamentos">
          <TabsList className="rounded-xl h-10">
            <TabsTrigger value="equipamentos"  className="rounded-lg gap-1.5"><Wrench className="h-3.5 w-3.5" /> Equipamentos</TabsTrigger>
            <TabsTrigger value="alocacoes"     className="rounded-lg gap-1.5"><ArrowRightLeft className="h-3.5 w-3.5" /> Alocações</TabsTrigger>
            <TabsTrigger value="certificacoes" className="rounded-lg gap-1.5">
              <Award className="h-3.5 w-3.5" /> Certificações
              {(vencidos + aVencer) > 0 && <span className="ml-1 h-4 min-w-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{vencidos + aVencer}</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="equipamentos">
            <EquipamentosTab ferramentas={ferramentas} loading={loadingFerr} obras={obras} employees={employees} onRefresh={fetchFerramentas} />
          </TabsContent>
          <TabsContent value="alocacoes">
            <AlocacoesTab obras={obras} employees={employees} ferramentas={ferramentas} onRefresh={fetchFerramentas} />
          </TabsContent>
          <TabsContent value="certificacoes">
            <CertificacoesTab ferramentas={ferramentas} onRefresh={fetchFerramentas} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Equipamentos
// ═══════════════════════════════════════════════════════════════
function EquipamentosTab({ ferramentas, loading, obras, employees, onRefresh }: {
  ferramentas: Ferramenta[]; loading: boolean;
  obras: Obra[]; employees: Employee[]; onRefresh: () => void;
}) {
  const [search, setSearch]       = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [editOpen, setEditOpen]   = useState(false);
  const [editing, setEditing]     = useState<Ferramenta | null>(null);
  const [alocOpen, setAlocOpen]   = useState(false);
  const [selFerr, setSelFerr]     = useState<Ferramenta | null>(null);

  const filtered = ferramentas.filter(f =>
    (!search   || f.nome.toLowerCase().includes(search.toLowerCase()) || (f.numero_serie ?? "").toLowerCase().includes(search.toLowerCase())) &&
    (!catFiltro || f.categoria === catFiltro)
  );

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Equipamentos cadastrados</CardTitle>
              <CardDescription>{ferramentas.length} equipamentos</CardDescription>
            </div>
            <Button onClick={() => { setEditing(null); setEditOpen(true); }} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Novo Equipamento
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap mt-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou série..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl h-9 text-sm" />
            </div>
            <Select value={catFiltro || "__all__"} onValueChange={v => setCatFiltro(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 rounded-xl w-36 text-sm"><SelectValue placeholder="Categoria..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? <Skeleton className="h-48 rounded-xl" /> : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Equipamento</TableHead>
                  <TableHead>Tipo / Categoria</TableHead>
                  <TableHead>Localização atual</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Certificação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhum equipamento encontrado.</TableCell></TableRow>}
                {filtered.map(f => (
                  <TableRow key={f.id} className={f.cert_status === "vencido" ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
                    <TableCell>
                      <p className="font-medium text-sm">{f.nome}</p>
                      <div className="flex gap-1.5 mt-0.5 flex-wrap">
                        {f.numero_serie && <span className="text-xs text-muted-foreground">Série: {f.numero_serie}</span>}
                        {f.codigo_patrimonio && <span className="text-xs font-mono text-muted-foreground">Patrimônio: {f.codigo_patrimonio}</span>}
                        {f.capacidade && <Badge variant="outline" className="text-[10px] rounded-full px-1.5">{f.capacidade}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1"><Badge className="text-[10px] rounded-full capitalize">{f.tipo_item}</Badge>{f.categoria && <p className="text-xs text-muted-foreground">{f.categoria}</p>}</div>
                    </TableCell>
                    <TableCell>
                      {f.obra_atual_nome ? (
                        <div>
                          <p className="text-sm font-medium flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" />{f.obra_atual_nome}</p>
                          {f.frente_atual && <p className="text-xs text-muted-foreground">{f.frente_atual}</p>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground italic">Disponível</span>}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">{f.condicao
                        ? <Badge variant="outline" className={cn("text-xs rounded-full", condicaoColor(f.condicao))}>{condicaoLabel(f.condicao)}</Badge>
                        : <span className="text-muted-foreground text-sm">—</span>}
                        <p className="text-[10px] text-muted-foreground">{STATUS_OPERACIONAL.find(s => s.value === f.status_operacional)?.label ?? f.status_operacional}</p>
                        {f.unidade_medicao === "horimetro" && <p className="text-[10px] font-medium">{f.horimetro_atual ?? 0} h</p>}</div>
                    </TableCell>
                    <TableCell>
                      {certBadge(f.cert_status, f.proximo_vencimento) ?? <span className="text-muted-foreground text-xs">—</span>}
                      {f.proximo_vencimento && f.cert_status !== "vencido" && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(parseISO(f.proximo_vencimento), "dd/MM/yyyy")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs rounded-lg"
                          onClick={() => { setSelFerr(f); setAlocOpen(true); }}>
                          <ArrowRightLeft className="h-3 w-3" /> Alocar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs rounded-lg"
                          onClick={() => { setEditing(f); setEditOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EquipamentoModal open={editOpen} onClose={() => setEditOpen(false)} editing={editing} onSaved={onRefresh} />
      <AlocacaoModal open={alocOpen} onClose={() => setAlocOpen(false)} obras={obras} employees={employees}
        ferramentas={ferramentas} preselFerr={selFerr} onSaved={onRefresh} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Alocações
// ═══════════════════════════════════════════════════════════════
function AlocacoesTab({ obras, employees, ferramentas, onRefresh }: {
  obras: Obra[]; employees: Employee[]; ferramentas: Ferramenta[]; onRefresh: () => void;
}) {
  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [loading, setLoading]     = useState(false);
  const [obraId, setObraId]       = useState("");
  const [soAtivas, setSoAtivas]   = useState(true);
  const [alocOpen, setAlocOpen]   = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("ferramentas_alocacao")
      .select("*, ferramentas_catalogo(nome, categoria), obras(nome), employees(nome)")
      .order("created_at", { ascending: false });
    if (obraId) q = q.eq("obra_id", obraId);
    if (soAtivas) q = q.is("data_devolucao", null);
    const { data } = await q;
    setAlocacoes((data ?? []) as Alocacao[]);
    setLoading(false);
  }, [obraId, soAtivas]);

  useEffect(() => { fetch(); }, [fetch]);

  async function handleDevolver(id: string) {
    await (supabase as any).from("ferramentas_alocacao").update({ data_devolucao: format(new Date(), "yyyy-MM-dd") }).eq("id", id);
    toast.success("Devolução registrada!");
    fetch(); onRefresh();
  }

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-48 space-y-1.5">
              <Label>Filtrar por obra</Label>
              <Select value={obraId || "__all__"} onValueChange={v => setObraId(v === "__all__" ? "" : v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Todas as obras" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-1">
              <Switch checked={soAtivas} onCheckedChange={setSoAtivas} />
              <span className="text-sm">Somente ativas</span>
            </label>
            <Button onClick={() => setAlocOpen(true)} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Nova Alocação
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="pt-4">
          {loading ? <Skeleton className="h-40 rounded-xl" /> : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Equipamento</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Frente</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Alocado em</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alocacoes.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Nenhuma alocação encontrada.</TableCell></TableRow>}
                {alocacoes.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{a.ferramentas_catalogo?.nome ?? "—"}</p>
                      {a.ferramentas_catalogo?.categoria && <p className="text-xs text-muted-foreground">{a.ferramentas_catalogo.categoria}</p>}
                    </TableCell>
                    <TableCell className="text-sm">{a.obras?.nome ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.frente ?? "—"}</TableCell>
                    <TableCell className="text-sm">{a.employees?.nome ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{format(parseISO(a.data_alocacao), "dd/MM/yyyy")}</TableCell>
                    <TableCell><Badge variant="outline" className={cn("text-xs rounded-full", condicaoColor(a.condicao))}>{condicaoLabel(a.condicao)}</Badge></TableCell>
                    <TableCell>
                      {a.data_devolucao
                        ? <Badge variant="outline" className="text-xs rounded-full text-muted-foreground">Devolvido {format(parseISO(a.data_devolucao), "dd/MM")}</Badge>
                        : <Badge variant="outline" className="text-xs rounded-full bg-blue-50 text-blue-600 border-blue-200">Ativo</Badge>
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      {!a.data_devolucao && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg gap-1 text-amber-600" onClick={() => handleDevolver(a.id)}>
                          <RefreshCw className="h-3 w-3" /> Devolver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlocacaoModal open={alocOpen} onClose={() => setAlocOpen(false)} obras={obras} employees={employees}
        ferramentas={ferramentas} onSaved={() => { fetch(); onRefresh(); }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab: Certificações
// ═══════════════════════════════════════════════════════════════
function CertificacoesTab({ ferramentas, onRefresh }: { ferramentas: Ferramenta[]; onRefresh: () => void }) {
  const [certs, setCerts]       = useState<Certificacao[]>([]);
  const [loading, setLoading]   = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [filtro, setFiltro]     = useState("todos");

  const fetchCerts = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("ferramentas_certificacoes")
      .select("*, ferramentas_catalogo(nome)")
      .order("data_vencimento", { ascending: true });
    setCerts((data ?? []) as Certificacao[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCerts(); }, [fetchCerts]);

  const filtered = certs.filter(c => {
    const dias = diasParaVencer(c.data_vencimento);
    if (filtro === "vencidos")  return dias < 0;
    if (filtro === "a_vencer")  return dias >= 0 && dias <= 30;
    if (filtro === "validos")   return dias > 30;
    return true;
  });

  const vencidos = certs.filter(c => diasParaVencer(c.data_vencimento) < 0).length;
  const aVencer  = certs.filter(c => { const d = diasParaVencer(c.data_vencimento); return d >= 0 && d <= 30; }).length;

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5">
              <Label>Filtrar status</Label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: "todos",    label: `Todos (${certs.length})` },
                  { value: "vencidos", label: `Vencidos (${vencidos})`,    cl: "border-red-300 text-red-700" },
                  { value: "a_vencer", label: `A vencer (${aVencer})`,     cl: "border-amber-300 text-amber-700" },
                  { value: "validos",  label: `Válidos (${certs.length - vencidos - aVencer})`, cl: "border-green-300 text-green-700" },
                ].map(f => (
                  <button key={f.value} onClick={() => setFiltro(f.value)}
                    className={cn("px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors",
                      filtro === f.value ? "bg-primary text-white border-primary" : (f.cl ?? "border-border hover:bg-muted/50")
                    )}>{f.label}</button>
                ))}
              </div>
            </div>
            <Button onClick={() => setCertOpen(true)} className="gap-2 rounded-xl ml-auto">
              <Plus className="h-4 w-4" /> Nova Certificação
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-medium rounded-2xl">
        <CardContent className="pt-4">
          {loading ? <Skeleton className="h-40 rounded-xl" /> : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Equipamento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Certificadora</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Nenhuma certificação encontrada.</TableCell></TableRow>}
                {filtered.map(c => {
                  const dias = diasParaVencer(c.data_vencimento);
                  return (
                    <TableRow key={c.id} className={cn("border-l-2", dias < 0 ? "border-l-red-400 bg-red-50/40 dark:bg-red-950/10" : dias <= 30 ? "border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/10" : "border-l-green-400")}>
                      <TableCell className="font-medium text-sm">{c.ferramentas_catalogo?.nome ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.tipo_certificacao}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.empresa_certificadora ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.numero_certificado ?? "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{c.data_emissao ? format(parseISO(c.data_emissao), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell className="text-sm font-semibold whitespace-nowrap">{format(parseISO(c.data_vencimento), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        {dias < 0
                          ? <Badge variant="outline" className="text-xs rounded-full bg-red-50 text-red-700 border-red-300">Vencido há {Math.abs(dias)}d</Badge>
                          : dias <= 30
                            ? <Badge variant="outline" className="text-xs rounded-full bg-amber-50 text-amber-700 border-amber-300">Vence em {dias}d</Badge>
                            : <Badge variant="outline" className="text-xs rounded-full bg-green-50 text-green-700 border-green-300">Válido ({dias}d)</Badge>
                        }
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CertificacaoModal open={certOpen} onClose={() => setCertOpen(false)} ferramentas={ferramentas} onSaved={fetchCerts} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Cadastro / Edição de Equipamento
// ═══════════════════════════════════════════════════════════════
function EquipamentoModal({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing: Ferramenta | null; onSaved: () => void }) {
  const [nome, setNome]             = useState("");
  const [descricao, setDesc]        = useState("");
  const [categoria, setCategoria]   = useState("");
  const [serie, setSerie]           = useState("");
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo]         = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [tipoItem, setTipoItem]     = useState("equipamento");
  const [patrimonio, setPatrimonio] = useState("");
  const [unidadeMedicao, setUnidadeMedicao] = useState("unidade");
  const [horimetro, setHorimetro]   = useState("");
  const [statusOperacional, setStatusOperacional] = useState("disponivel");
  const [periodicidade, setPeriodicidade] = useState("");
  const [exigeCert, setExigeCert]   = useState(false);
  const [ativo, setAtivo]           = useState(true);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (open && editing) {
      setNome(editing.nome); setDesc(editing.descricao ?? ""); setCategoria(editing.categoria ?? "");
      setSerie(editing.numero_serie ?? ""); setFabricante(editing.fabricante ?? "");
      setModelo(editing.modelo ?? ""); setCapacidade(editing.capacidade ?? "");
      setTipoItem(editing.tipo_item ?? "equipamento"); setPatrimonio(editing.codigo_patrimonio ?? "");
      setUnidadeMedicao(editing.unidade_medicao ?? "unidade"); setHorimetro(editing.horimetro_atual?.toString() ?? "");
      setStatusOperacional(editing.status_operacional ?? "disponivel"); setPeriodicidade(editing.periodicidade_inspecao_dias?.toString() ?? "");
      setExigeCert(editing.exige_certificacao); setAtivo(editing.ativo);
    } else if (open) {
      setNome(""); setDesc(""); setCategoria(""); setSerie(""); setFabricante(""); setModelo(""); setCapacidade(""); setExigeCert(false); setAtivo(true);
      setTipoItem("equipamento"); setPatrimonio(""); setUnidadeMedicao("unidade"); setHorimetro(""); setStatusOperacional("disponivel"); setPeriodicidade("");
    }
  }, [open, editing]);

  async function handleSave() {
    if (!nome.trim()) { toast.error("Informe o nome do equipamento"); return; }
    setSaving(true);
    try {
      const payload = { nome: nome.trim(), descricao: descricao || null, categoria: categoria || null, numero_serie: serie || null, fabricante: fabricante || null, modelo: modelo || null, capacidade: capacidade || null, exige_certificacao: exigeCert, ativo, tipo_item: tipoItem, codigo_patrimonio: patrimonio || null, unidade_medicao: unidadeMedicao, horimetro_atual: unidadeMedicao === "horimetro" ? Number(horimetro || 0) : null, status_operacional: statusOperacional, periodicidade_inspecao_dias: periodicidade ? Number(periodicidade) : null };
      const { error } = editing
        ? await (supabase as any).from("ferramentas_catalogo").update(payload).eq("id", editing.id)
        : await (supabase as any).from("ferramentas_catalogo").insert(payload);
      if (error) throw new Error(error.message);
      toast.success(editing ? "Equipamento atualizado!" : "Equipamento cadastrado!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />{editing ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-1.5"><Label>Nome <span className="text-red-500">*</span></Label><Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Talha Elétrica 5t" className="rounded-xl" /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea value={descricao} onChange={e => setDesc(e.target.value)} rows={2} className="rounded-xl resize-none text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Classificação *</Label><Select value={tipoItem} onValueChange={setTipoItem}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{TIPOS_ITEM.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Código patrimonial</Label><Input value={patrimonio} onChange={e => setPatrimonio(e.target.value)} placeholder="PAT-0001" className="rounded-xl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Capacidade</Label><Input value={capacidade} onChange={e => setCapacidade(e.target.value)} placeholder="5t, 500kg..." className="rounded-xl" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Nº de Série</Label><Input value={serie} onChange={e => setSerie(e.target.value)} placeholder="SN-001" className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Fabricante</Label><Input value={fabricante} onChange={e => setFabricante(e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Modelo</Label><Input value={modelo} onChange={e => setModelo(e.target.value)} className="rounded-xl" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Controle</Label><Select value={unidadeMedicao} onValueChange={setUnidadeMedicao}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unidade">Por unidade</SelectItem><SelectItem value="horimetro">Por horímetro</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Horímetro atual</Label><Input type="number" min="0" value={horimetro} onChange={e => setHorimetro(e.target.value)} disabled={unidadeMedicao !== "horimetro"} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Inspeção a cada</Label><Input type="number" min="1" value={periodicidade} onChange={e => setPeriodicidade(e.target.value)} placeholder="dias" className="rounded-xl" /></div>
          </div>
          <div className="space-y-1.5"><Label>Status operacional</Label><Select value={statusOperacional} onValueChange={setStatusOperacional}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPERACIONAL.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
            <div>
              <Label className="cursor-pointer">Exige certificação de segurança</Label>
              <p className="text-xs text-muted-foreground">Equipamentos de içamento, elétricos, etc.</p>
            </div>
            <Switch checked={exigeCert} onCheckedChange={setExigeCert} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
            <Label className="cursor-pointer">Equipamento ativo</Label>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</> : <><Wrench className="h-4 w-4" />{editing ? "Salvar" : "Cadastrar"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Alocação de Equipamento
// ═══════════════════════════════════════════════════════════════
function AlocacaoModal({ open, onClose, obras, employees, ferramentas, preselFerr, onSaved }: {
  open: boolean; onClose: () => void; obras: Obra[]; employees: Employee[];
  ferramentas: Ferramenta[]; preselFerr?: Ferramenta | null; onSaved: () => void;
}) {
  const [ferrId, setFerrId]       = useState("");
  const [obraId, setObraId]       = useState("");
  const [frente, setFrente]       = useState("");
  const [respId, setRespId]       = useState("");
  const [condicao, setCondicao]   = useState("bom");
  const [dataAloc, setDataAloc]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [obs, setObs]             = useState("");
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (open) { setFerrId(preselFerr?.id ?? ""); setObraId(""); setFrente(""); setRespId(""); setCondicao("bom"); setDataAloc(format(new Date(), "yyyy-MM-dd")); setObs(""); }
  }, [open, preselFerr]);

  async function handleSave() {
    if (!ferrId || !obraId) { toast.error("Selecione o equipamento e a obra"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("ferramentas_alocacao").insert({
        ferramenta_id: ferrId, obra_id: obraId, frente: frente || null,
        responsavel_id: respId || null, condicao, data_alocacao: dataAloc,
        observacoes: obs || null, registrado_por: user?.id,
      });
      if (error) throw new Error(error.message);
      toast.success("Equipamento alocado!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message.includes("unique") ? "Este equipamento já está alocado. Devolva-o primeiro." : e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" /> Alocar Equipamento</DialogTitle>
          <DialogDescription>Defina onde e com quem o equipamento ficará</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Equipamento <span className="text-red-500">*</span></Label>
            <Select value={ferrId} onValueChange={setFerrId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent className="max-h-56">
                {ferramentas.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}{f.numero_serie ? ` (${f.numero_serie})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Obra <span className="text-red-500">*</span></Label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
              <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Frente</Label><Input value={frente} onChange={e => setFrente(e.target.value)} placeholder="Estrutura, Fundação..." className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Data alocação</Label><Input type="date" value={dataAloc} onChange={e => setDataAloc(e.target.value)} className="rounded-xl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={respId || "__none__"} onValueChange={v => setRespId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className="max-h-48">
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Condição</Label>
              <Select value={condicao} onValueChange={setCondicao}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{CONDICOES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Observações</Label><Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="rounded-xl resize-none text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</> : <><ArrowRightLeft className="h-4 w-4" />Alocar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: Nova Certificação
// ═══════════════════════════════════════════════════════════════
function CertificacaoModal({ open, onClose, ferramentas, onSaved }: {
  open: boolean; onClose: () => void; ferramentas: Ferramenta[]; onSaved: () => void;
}) {
  const [ferrId, setFerrId]         = useState("");
  const [tipo, setTipo]             = useState("");
  const [numero, setNumero]         = useState("");
  const [certificadora, setCertif]  = useState("");
  const [dataEmissao, setDataEmis]  = useState("");
  const [dataVenc, setDataVenc]     = useState("");
  const [obs, setObs]               = useState("");
  const [saving, setSaving]         = useState(false);

  useEffect(() => { if (open) { setFerrId(""); setTipo(""); setNumero(""); setCertif(""); setDataEmis(""); setDataVenc(""); setObs(""); } }, [open]);

  async function handleSave() {
    if (!ferrId || !tipo || !dataVenc) { toast.error("Selecione o equipamento, tipo e data de vencimento"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("ferramentas_certificacoes").insert({
        ferramenta_id: ferrId, tipo_certificacao: tipo,
        numero_certificado: numero || null, empresa_certificadora: certificadora || null,
        data_emissao: dataEmissao || null, data_vencimento: dataVenc,
        observacoes: obs || null,
      });
      if (error) throw new Error(error.message);
      toast.success("Certificação registrada!");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-primary" /> Registrar Certificação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Equipamento <span className="text-red-500">*</span></Label>
            <Select value={ferrId} onValueChange={setFerrId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent className="max-h-56">
                {ferramentas.filter(f => f.exige_certificacao).map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de Certificação <span className="text-red-500">*</span></Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{TIPOS_CERT.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nº Certificado</Label><Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="CERT-001" className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Certificadora</Label><Input value={certificadora} onChange={e => setCertif(e.target.value)} placeholder="Empresa..." className="rounded-xl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Data emissão</Label><Input type="date" value={dataEmissao} onChange={e => setDataEmis(e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Vencimento <span className="text-red-500">*</span></Label><Input type="date" value={dataVenc} onChange={e => setDataVenc(e.target.value)} className="rounded-xl" /></div>
          </div>
          <div className="space-y-1.5"><Label>Observações</Label><Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="rounded-xl resize-none text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Salvando...</> : <><Award className="h-4 w-4" />Registrar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

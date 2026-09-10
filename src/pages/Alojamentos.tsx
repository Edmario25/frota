import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BedDouble, Building2, Users, AlertTriangle, Plus, LogIn, LogOut, Sparkles, Wrench, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { T } from "@/i18n";

type Modal = "alojamento" | "ambiente" | "quarto" | "bem" | "reserva" | "checkin" | "checkout" | "transferir" | "ausencia" | "chamado" | null;
const BED_CFG: Record<string, { label: string; cls: string }> = {
  disponivel: { label: "Disponível", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  reservado: { label: "Reservado", cls: "border-blue-300 bg-blue-50 text-blue-700" },
  ocupado: { label: "Ocupado", cls: "border-violet-300 bg-violet-50 text-violet-700" },
  higienizacao: { label: "Higienização", cls: "border-amber-300 bg-amber-50 text-amber-700" },
  manutencao: { label: "Manutenção", cls: "border-orange-300 bg-orange-50 text-orange-700" },
  interditado: { label: "Interditado", cls: "border-red-300 bg-red-50 text-red-700" },
  desativado: { label: "Desativado", cls: "bg-muted text-muted-foreground" },
};

export default function Alojamentos() {
  const { obras } = useObras();
  const { employees } = useEmployees();
  const [alojamentos, setAlojamentos] = useState<any[]>([]);
  const [ambientes, setAmbientes] = useState<any[]>([]);
  const [quartos, setQuartos] = useState<any[]>([]);
  const [leitos, setLeitos] = useState<any[]>([]);
  const [ocupacoes, setOcupacoes] = useState<any[]>([]);
  const [reservas, setReservas] = useState<any[]>([]);
  const [bens, setBens] = useState<any[]>([]);
  const [chamados, setChamados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [obraId, setObraId] = useState("todas");
  const [alojamentoId, setAlojamentoId] = useState("todos");
  const [modal, setModal] = useState<Modal>(null);
  const [selecionado, setSelecionado] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [a, am, q, l, o, r, b, c] = await Promise.all([
      (supabase as any).from("alojamentos").select("*").order("nome"),
      (supabase as any).from("alojamento_ambientes").select("*").order("nome"),
      (supabase as any).from("alojamento_quartos").select("*").order("identificacao"),
      (supabase as any).from("alojamento_leitos").select("*").order("identificacao"),
      (supabase as any).from("alojamento_ocupacoes").select("*").order("data_entrada", { ascending: false }),
      (supabase as any).from("alojamento_reservas").select("*").order("inicio_previsto"),
      (supabase as any).from("alojamento_bens").select("*").order("descricao"),
      (supabase as any).from("alojamento_chamados").select("*").order("created_at", { ascending: false }),
    ]);
    const failure = [a, am, q, l, o, r, b, c].find(x => x.error)?.error;
    if (failure) toast.error(`Não foi possível carregar o módulo: ${failure.message}`);
    setAlojamentos(a.data ?? []); setAmbientes(am.data ?? []); setQuartos(q.data ?? []);
    setLeitos(l.data ?? []); setOcupacoes(o.data ?? []); setReservas(r.data ?? []); setBens(b.data ?? []); setChamados(c.data ?? []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const unidades = useMemo(() => alojamentos.filter(a => obraId === "todas" || a.obra_id === obraId), [alojamentos, obraId]);
  const unidadeIds = new Set(unidades.map(a => a.id));
  const ambientesEscopo = ambientes.filter(a => unidadeIds.has(a.alojamento_id) && (alojamentoId === "todos" || a.alojamento_id === alojamentoId));
  const ambienteIds = new Set(ambientesEscopo.map(a => a.id));
  const quartosEscopo = quartos.filter(q => ambienteIds.has(q.id));
  const quartoIds = new Set(quartosEscopo.map(q => q.id));
  const leitosEscopo = leitos.filter(l => quartoIds.has(l.quarto_id));
  const leitoIds = new Set(leitosEscopo.map(l => l.id));
  const ocupacoesAbertas = ocupacoes.filter(o => !o.data_saida && leitoIds.has(o.leito_id));
  const ocupacaoPorLeito = new Map(ocupacoesAbertas.map(o => [o.leito_id, o]));
  const employeeName = (id: string) => employees.find(e => e.id === id)?.nome ?? "Colaborador";
  const totals = {
    total: leitosEscopo.filter(l => l.status !== "desativado").length,
    ocupados: ocupacoesAbertas.length,
    disponiveis: leitosEscopo.filter(l => l.status === "disponivel").length,
    bloqueados: leitosEscopo.filter(l => ["manutencao", "interditado", "higienizacao"].includes(l.status)).length,
    chamados: chamados.filter(c => !["concluido", "cancelado"].includes(c.status) && unidadeIds.has(c.alojamento_id)).length,
  };
  const ocupacaoPct = totals.total ? Math.round((totals.ocupados / totals.total) * 100) : 0;

  function open(m: Modal, data?: any) {
    setSelecionado(data ?? null);
    if (m === "checkout" && data) {
      const leito = leitos.find(l => l.id === data.leito_id);
      const itens = bens.filter(b => b.ativo && b.ambiente_id === leito?.quarto_id).reduce((acc, b) => ({ ...acc, [b.id]: b.estado }), {});
      setForm({ itens });
    } else setForm({});
    setModal(m);
  }
  async function saveAlojamento() {
    if (!form.obra_id || !form.nome?.trim()) return toast.error("Informe obra e nome.");
    setSaving(true); const { error } = await (supabase as any).from("alojamentos").insert({ obra_id: form.obra_id, nome: form.nome.trim(), endereco: form.endereco?.trim() || null, capacidade_declarada: Number(form.capacidade || 0) }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Alojamento cadastrado."); setModal(null); load();
  }
  async function saveQuarto() {
    if (!form.alojamento_id || !form.identificacao || !form.capacidade) return toast.error("Preencha os dados do quarto.");
    setSaving(true); const { error } = await (supabase as any).rpc("alojamento_criar_quarto", { p_alojamento: form.alojamento_id, p_identificacao: form.identificacao.trim(), p_classificacao: form.classificacao || "masculino", p_capacidade: Number(form.capacidade) }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Quarto e leitos criados."); setModal(null); load();
  }
  async function saveAmbiente() {
    if (!form.alojamento_id || !form.nome?.trim() || !form.tipo) return toast.error("Preencha unidade, nome e tipo.");
    setSaving(true); const { error } = await (supabase as any).from("alojamento_ambientes").insert({ alojamento_id: form.alojamento_id, nome: form.nome.trim(), tipo: form.tipo, capacidade: form.capacidade ? Number(form.capacidade) : null, quantidade_chuveiros: Number(form.chuveiros || 0), quantidade_sanitarios: Number(form.sanitarios || 0), quantidade_lavatorios: Number(form.lavatorios || 0) }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Ambiente cadastrado."); setModal(null); load();
  }
  async function saveBem() {
    if (!form.alojamento_id || !form.tombamento?.trim() || !form.descricao?.trim()) return toast.error("Informe alojamento, tombamento e descrição.");
    setSaving(true); const { error } = await (supabase as any).from("alojamento_bens").insert({ alojamento_id: form.alojamento_id, ambiente_id: form.ambiente_id || null, tombamento: form.tombamento.trim(), descricao: form.descricao.trim(), categoria: form.categoria?.trim() || null, numero_serie: form.numero_serie?.trim() || null, estado: form.estado || "bom", valor_aquisicao: form.valor ? Number(form.valor) : null }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Bem patrimonial cadastrado."); setModal(null); load();
  }
  async function checkin() {
    if (!selecionado || !form.employee_id) return toast.error("Selecione o colaborador.");
    setSaving(true); const { error } = await (supabase as any).rpc("alojamento_checkin", { p_leito: selecionado.id, p_employee: form.employee_id, p_observacoes: form.observacoes || null }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Check-in realizado."); setModal(null); load();
  }
  async function reservar() {
    if (!selecionado || !form.employee_id || !form.inicio) return toast.error("Selecione colaborador e data de início.");
    setSaving(true); const { error } = await (supabase as any).rpc("alojamento_reservar", { p_leito: selecionado.id, p_employee: form.employee_id, p_inicio: form.inicio, p_fim: form.fim || null, p_observacoes: form.observacoes || null }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Leito reservado."); setModal(null); load();
  }
  async function cancelarReserva(reserva: any) {
    setSaving(true); const { error } = await (supabase as any).rpc("alojamento_cancelar_reserva", { p_reserva: reserva.id, p_motivo: "Cancelada pelo gestor" }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Reserva cancelada e leito liberado."); load();
  }
  async function checkout() {
    if (!form.motivo?.trim()) return toast.error("Informe o motivo da saída.");
    const leito = leitos.find(l => l.id === selecionado.leito_id);
    const itens = bens.filter(b => b.ativo && b.ambiente_id === leito?.quarto_id).map(b => ({ bem_id: b.id, estado: form.itens?.[b.id] || b.estado, observacoes: null }));
    setSaving(true); const { error } = await (supabase as any).rpc("alojamento_checkout", { p_ocupacao: selecionado.id, p_motivo: form.motivo.trim(), p_itens: itens }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Check-out realizado; leito enviado para higienização."); setModal(null); load();
  }
  async function transferir() {
    if (!form.leito_destino || !form.motivo?.trim()) return toast.error("Selecione o destino e informe o motivo.");
    setSaving(true); const { error } = await (supabase as any).rpc("alojamento_transferir", { p_ocupacao: selecionado.id, p_leito_destino: form.leito_destino, p_motivo: form.motivo.trim() }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Transferência concluída e registrada no histórico."); setModal(null); load();
  }
  async function registrarAusencia() {
    const ausente = selecionado.presenca_status !== "ausente_temporariamente";
    setSaving(true); const { error } = await (supabase as any).rpc("alojamento_registrar_ausencia", { p_ocupacao: selecionado.id, p_ausente: ausente, p_retorno: ausente ? form.retorno || null : null }); setSaving(false);
    if (error) return toast.error(error.message); toast.success(ausente ? "Ausência temporária registrada." : "Retorno confirmado."); setModal(null); load();
  }
  async function liberarLeito(leito: any) {
    const { error } = await (supabase as any).from("alojamento_leitos").update({ status: "disponivel", motivo_bloqueio: null }).eq("id", leito.id);
    if (error) return toast.error(error.message); toast.success("Leito liberado após higienização."); load();
  }
  async function saveChamado() {
    if (!form.alojamento_id || !form.titulo?.trim() || !form.descricao?.trim()) return toast.error("Informe unidade, título e descrição.");
    const { data: u } = await supabase.auth.getUser(); setSaving(true);
    const { error } = await (supabase as any).from("alojamento_chamados").insert({ alojamento_id: form.alojamento_id, titulo: form.titulo.trim(), descricao: form.descricao.trim(), tipo: form.tipo || "corretiva", prioridade: form.prioridade || "media", prazo: form.prazo || null, aberto_por: u.user?.id }); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Chamado aberto."); setModal(null); load();
  }

  return <Layout><div className="mx-auto max-w-screen-xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Projetos / Pessoas</p><h1 className="text-2xl font-bold"><T>Gestão de Alojamentos</T></h1><p className="text-sm text-muted-foreground">Ocupação, patrimônio, manutenção e conformidade das áreas de vivência.</p></div><div className="flex gap-2"><Button variant="outline" onClick={load}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar</Button><Button onClick={() => open("alojamento")}><Plus className="mr-2 h-4 w-4" />Novo alojamento</Button></div></div>
    <div className="grid gap-2 md:grid-cols-2"><Select value={obraId} onValueChange={v => { setObraId(v); setAlojamentoId("todos"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as obras</SelectItem>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent></Select><Select value={alojamentoId} onValueChange={setAlojamentoId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os alojamentos</SelectItem>{unidades.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
      [BedDouble,"Leitos",totals.total,"Capacidade operacional"],[Users,"Ocupados",totals.ocupados,`${ocupacaoPct}% de ocupação`],[ShieldCheck,"Disponíveis",totals.disponiveis,"Prontos para check-in"],[AlertTriangle,"Bloqueados",totals.bloqueados,"Higienização/manutenção"],[Wrench,"Chamados",totals.chamados,"Pendentes de conclusão"],
    ].map(([Icon,label,value,sub]:any)=><div key={label} className="rounded-xl border bg-card p-4"><Icon className="mb-3 h-5 w-5 text-primary"/><p className="text-2xl font-bold">{value}</p><p className="text-xs font-medium">{label}</p><p className="text-[11px] text-muted-foreground">{sub}</p></div>)}</div>
    {!loading && !alojamentos.length && <div className="rounded-xl border border-dashed p-12 text-center"><Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground"/><h2 className="font-semibold">Cadastre o primeiro alojamento</h2><p className="mb-4 text-sm text-muted-foreground">Depois, crie os quartos e o sistema gerará os leitos automaticamente.</p><Button onClick={()=>open("alojamento")}><Plus className="mr-2 h-4 w-4"/>Começar</Button></div>}
    {!!alojamentos.length && <Tabs defaultValue="mapa" className="rounded-xl border bg-card p-4"><TabsList className="grid w-full max-w-3xl grid-cols-5"><TabsTrigger value="mapa">Mapa de leitos</TabsTrigger><TabsTrigger value="alojados">Alojados</TabsTrigger><TabsTrigger value="estrutura">Estrutura</TabsTrigger><TabsTrigger value="patrimonio">Patrimônio</TabsTrigger><TabsTrigger value="chamados">Chamados</TabsTrigger></TabsList>
      <TabsContent value="mapa" className="mt-4 space-y-4"><div className="flex justify-end"><Button size="sm" onClick={()=>open("quarto")}><Plus className="mr-2 h-4 w-4"/>Novo quarto</Button></div>{quartosEscopo.map(q => <div key={q.id} className="rounded-xl border p-4"><div className="mb-3 flex justify-between"><div><h3 className="font-semibold">Quarto {q.identificacao}</h3><p className="text-xs text-muted-foreground">{q.classificacao} · capacidade {q.capacidade}</p></div><Badge variant="outline">{leitosEscopo.filter(l=>l.quarto_id===q.id && l.status==="ocupado").length}/{q.capacidade}</Badge></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{leitosEscopo.filter(l=>l.quarto_id===q.id).map(l => { const occ=ocupacaoPorLeito.get(l.id); const cfg=BED_CFG[l.status]??BED_CFG.desativado; return <div key={l.id} className={`rounded-lg border p-3 ${cfg.cls}`}><div className="flex items-center justify-between"><span className="font-semibold">Leito {l.identificacao}</span><Badge variant="outline" className="bg-white/70 text-[10px]">{cfg.label}</Badge></div><p className="mt-2 min-h-5 truncate text-xs">{occ ? employeeName(occ.employee_id) : reservas.find(r=>r.leito_id===l.id&&r.status==="ativa") ? employeeName(reservas.find(r=>r.leito_id===l.id&&r.status==="ativa").employee_id) : "Sem ocupante"}</p><div className="mt-3 flex gap-1">{l.status==="disponivel" && <><Button size="sm" className="h-7 flex-1" onClick={()=>open("checkin",l)}><LogIn className="mr-1 h-3 w-3"/>Entrada</Button><Button size="sm" variant="outline" className="h-7 flex-1 bg-white" onClick={()=>open("reserva",l)}>Reservar</Button></>}{l.status==="higienizacao" && <Button size="sm" variant="outline" className="h-7 w-full bg-white" onClick={()=>liberarLeito(l)}><Sparkles className="mr-1 h-3 w-3"/>Liberar</Button>}{occ && <Button size="sm" variant="outline" className="h-7 w-full bg-white" onClick={()=>open("checkout",occ)}><LogOut className="mr-1 h-3 w-3"/>Check-out</Button>}</div></div>})}</div></div>)}</TabsContent>
      <TabsContent value="alojados" className="mt-4"><div className="divide-y">{!ocupacoesAbertas.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma ocupação ativa no filtro selecionado.</p>}{ocupacoesAbertas.map(o => { const l=leitos.find(x=>x.id===o.leito_id); const q=quartos.find(x=>x.id===l?.quarto_id); const ausente=o.presenca_status==="ausente_temporariamente"; return <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="flex items-center gap-2"><p className="font-medium">{employeeName(o.employee_id)}</p>{ausente&&<Badge variant="secondary">Ausente temporariamente</Badge>}</div><p className="text-xs text-muted-foreground">Quarto {q?.identificacao} · Leito {l?.identificacao} · desde {new Date(o.data_entrada).toLocaleDateString("pt-BR")}{o.retorno_previsto?` · retorno ${new Date(o.retorno_previsto).toLocaleString("pt-BR")}`:""}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>open("ausencia",o)}>{ausente?"Confirmar retorno":"Registrar ausência"}</Button><Button size="sm" variant="outline" onClick={()=>open("transferir",o)}>Transferir</Button><Button size="sm" variant="outline" onClick={()=>open("checkout",o)}>Realizar check-out</Button></div></div>})}</div>{reservas.filter(r=>r.status==="ativa"&&leitoIds.has(r.leito_id)).length>0&&<div className="mt-6"><h3 className="mb-2 font-semibold">Reservas futuras</h3><div className="divide-y rounded-lg border px-3">{reservas.filter(r=>r.status==="ativa"&&leitoIds.has(r.leito_id)).map(r=><div key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{employeeName(r.employee_id)}</span><div className="flex items-center gap-3"><span className="text-muted-foreground">A partir de {new Date(`${r.inicio_previsto}T12:00:00`).toLocaleDateString("pt-BR")}</span><Button size="sm" variant="ghost" disabled={saving} onClick={()=>cancelarReserva(r)}>Cancelar</Button></div></div>)}</div></div>}</TabsContent>
      <TabsContent value="estrutura" className="mt-4"><div className="mb-3 flex justify-end"><Button size="sm" onClick={()=>open("ambiente")}><Plus className="mr-2 h-4 w-4"/>Novo ambiente</Button></div><div className="grid gap-3 md:grid-cols-2">{unidades.map(a => { const am=ambientes.filter(x=>x.alojamento_id===a.id); const beds=leitos.filter(l=>am.some(x=>x.id===l.quarto_id)); const showers=am.reduce((n,x)=>n+(x.quantidade_chuveiros||0),0); const occupied=ocupacoes.filter(o=>!o.data_saida&&beds.some(l=>l.id===o.leito_id)).length; const minShowers=Math.ceil(occupied/10); return <div key={a.id} className="rounded-xl border p-4"><div className="flex justify-between"><div><h3 className="font-semibold">{a.nome}</h3><p className="text-xs text-muted-foreground">{obras.find(o=>o.id===a.obra_id)?.nome} · {a.endereco||"Endereço não informado"}</p></div><Badge variant="outline">{a.status}</Badge></div>{showers<minShowers&&<div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700"><AlertTriangle className="mr-1 inline h-3.5 w-3.5"/>Quantidade de chuveiros abaixo da proporção de 1 para cada 10 alojados.</div>}<div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded bg-muted p-2"><strong className="block text-lg">{am.filter(x=>x.tipo==="quarto").length}</strong>quartos</div><div className="rounded bg-muted p-2"><strong className="block text-lg">{beds.length}</strong>leitos</div><div className="rounded bg-muted p-2"><strong className="block text-lg">{showers}</strong>chuveiros</div></div><div className="mt-3 flex flex-wrap gap-1">{am.filter(x=>x.tipo!=="quarto").map(x=><Badge key={x.id} variant="secondary">{x.nome} · {x.tipo}</Badge>)}</div></div>})}</div></TabsContent>
      <TabsContent value="patrimonio" className="mt-4"><div className="mb-3 flex justify-end"><Button size="sm" onClick={()=>open("bem")}><Plus className="mr-2 h-4 w-4"/>Novo bem</Button></div><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/60 text-left"><tr><th className="p-3">Tombamento</th><th className="p-3">Descrição</th><th className="p-3">Local</th><th className="p-3">Estado</th><th className="p-3">Valor</th></tr></thead><tbody>{bens.filter(b=>unidadeIds.has(b.alojamento_id)).map(b=><tr key={b.id} className="border-t"><td className="p-3 font-mono">{b.tombamento}</td><td className="p-3"><strong>{b.descricao}</strong><p className="text-xs text-muted-foreground">{b.categoria||"Sem categoria"}</p></td><td className="p-3">{ambientes.find(a=>a.id===b.ambiente_id)?.nome||alojamentos.find(a=>a.id===b.alojamento_id)?.nome}</td><td className="p-3"><Badge variant="outline">{b.estado}</Badge></td><td className="p-3">{b.valor_aquisicao?Number(b.valor_aquisicao).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"—"}</td></tr>)}</tbody></table>{!bens.filter(b=>unidadeIds.has(b.alojamento_id)).length&&<p className="p-10 text-center text-sm text-muted-foreground">Nenhum bem cadastrado.</p>}</div></TabsContent>
      <TabsContent value="chamados" className="mt-4"><div className="mb-3 flex justify-end"><Button size="sm" onClick={()=>open("chamado")}><Plus className="mr-2 h-4 w-4"/>Abrir chamado</Button></div><div className="divide-y">{!chamados.length && <p className="py-12 text-center text-sm text-muted-foreground">Nenhum chamado registrado.</p>}{chamados.filter(c=>unidadeIds.has(c.alojamento_id)).map(c=><div key={c.id} className="flex items-center justify-between py-3"><div><div className="flex gap-2"><Badge variant="outline">{c.prioridade}</Badge><Badge>{c.status}</Badge></div><p className="mt-1 font-medium">{c.titulo}</p><p className="text-xs text-muted-foreground">{alojamentos.find(a=>a.id===c.alojamento_id)?.nome} · {c.tipo}</p></div>{c.prazo&&<span className="text-xs text-muted-foreground">Prazo {new Date(c.prazo).toLocaleDateString("pt-BR")}</span>}</div>)}</div></TabsContent>
    </Tabs>}
    <Dialog open={!!modal} onOpenChange={o=>!o&&setModal(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{modal==="alojamento"?"Novo alojamento":modal==="ambiente"?"Novo ambiente":modal==="quarto"?"Novo quarto":modal==="bem"?"Novo bem patrimonial":modal==="reserva"?"Reservar leito":modal==="checkin"?"Check-in de colaborador":modal==="checkout"?"Check-out":modal==="transferir"?"Transferir alojado":modal==="ausencia"?"Presença no alojamento":"Novo chamado"}</DialogTitle></DialogHeader><div className="space-y-3 py-2">
      {modal==="alojamento"&&<><Field label="Nome"><Input onChange={e=>setForm({...form,nome:e.target.value})}/></Field><Field label="Obra"><Select onValueChange={v=>setForm({...form,obra_id:v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent></Select></Field><Field label="Endereço"><Input onChange={e=>setForm({...form,endereco:e.target.value})}/></Field><Field label="Capacidade declarada"><Input type="number" min="0" onChange={e=>setForm({...form,capacidade:e.target.value})}/></Field></>}
      {modal==="quarto"&&<><Field label="Alojamento"><Select onValueChange={v=>setForm({...form,alojamento_id:v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{unidades.map(a=><SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></Field><Field label="Identificação"><Input placeholder="Ex.: 101" onChange={e=>setForm({...form,identificacao:e.target.value})}/></Field><Field label="Classificação"><Select defaultValue="masculino" onValueChange={v=>setForm({...form,classificacao:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["masculino","feminino","individual","familia","outro"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field><Field label="Quantidade de leitos"><Input type="number" min="1" max="20" onChange={e=>setForm({...form,capacidade:e.target.value})}/></Field></>}
      {modal==="ambiente"&&<><Field label="Alojamento"><Select onValueChange={v=>setForm({...form,alojamento_id:v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{unidades.map(a=><SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></Field><Field label="Nome"><Input placeholder="Ex.: Banheiro bloco A" onChange={e=>setForm({...form,nome:e.target.value})}/></Field><Field label="Tipo"><Select onValueChange={v=>setForm({...form,tipo:v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{["banheiro","cozinha","refeitorio","lavanderia","lazer","outro"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-3 gap-2"><Field label="Chuveiros"><Input type="number" min="0" onChange={e=>setForm({...form,chuveiros:e.target.value})}/></Field><Field label="Sanitários"><Input type="number" min="0" onChange={e=>setForm({...form,sanitarios:e.target.value})}/></Field><Field label="Lavatórios"><Input type="number" min="0" onChange={e=>setForm({...form,lavatorios:e.target.value})}/></Field></div></>}
      {modal==="bem"&&<><Field label="Alojamento"><Select onValueChange={v=>setForm({...form,alojamento_id:v,ambiente_id:""})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{unidades.map(a=><SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></Field><Field label="Ambiente"><Select onValueChange={v=>setForm({...form,ambiente_id:v==="__none"?"":v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent><SelectItem value="__none">Área geral</SelectItem>{ambientes.filter(a=>a.alojamento_id===form.alojamento_id).map(a=><SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-2 gap-2"><Field label="Tombamento"><Input onChange={e=>setForm({...form,tombamento:e.target.value})}/></Field><Field label="Número de série"><Input onChange={e=>setForm({...form,numero_serie:e.target.value})}/></Field></div><Field label="Descrição"><Input onChange={e=>setForm({...form,descricao:e.target.value})}/></Field><div className="grid grid-cols-3 gap-2"><Field label="Categoria"><Input onChange={e=>setForm({...form,categoria:e.target.value})}/></Field><Field label="Estado"><Select defaultValue="bom" onValueChange={v=>setForm({...form,estado:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["novo","bom","regular","danificado","inservivel"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field><Field label="Valor"><Input type="number" min="0" step="0.01" onChange={e=>setForm({...form,valor:e.target.value})}/></Field></div></>}
      {modal==="checkin"&&<><Field label="Colaborador ativo"><Select onValueChange={v=>setForm({...form,employee_id:v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{employees.filter(e=>e.status==="ativo"&&!ocupacoes.some(o=>!o.data_saida&&o.employee_id===e.id)).map(e=><SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></Field><Field label="Observações"><Textarea onChange={e=>setForm({...form,observacoes:e.target.value})}/></Field></>}
      {modal==="reserva"&&<><Field label="Colaborador ativo"><Select onValueChange={v=>setForm({...form,employee_id:v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{employees.filter(e=>e.status==="ativo"&&!ocupacoes.some(o=>!o.data_saida&&o.employee_id===e.id)&&!reservas.some(r=>r.status==="ativa"&&r.employee_id===e.id)).map(e=><SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-2 gap-2"><Field label="Início previsto"><Input type="date" min={new Date().toISOString().slice(0,10)} onChange={e=>setForm({...form,inicio:e.target.value})}/></Field><Field label="Fim previsto"><Input type="date" min={form.inicio||new Date().toISOString().slice(0,10)} onChange={e=>setForm({...form,fim:e.target.value})}/></Field></div><Field label="Observações"><Textarea onChange={e=>setForm({...form,observacoes:e.target.value})}/></Field></>}
      {modal==="checkout"&&<><p className="text-sm">Saída de <strong>{employeeName(selecionado?.employee_id)}</strong>. Confira os bens antes de concluir. O leito seguirá para higienização.</p>{bens.filter(b=>b.ativo&&b.ambiente_id===leitos.find(l=>l.id===selecionado?.leito_id)?.quarto_id).map(b=><div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border p-2"><div><p className="text-sm font-medium">{b.descricao}</p><p className="text-xs text-muted-foreground">{b.tombamento}</p></div><Select value={form.itens?.[b.id]||b.estado} onValueChange={v=>setForm({...form,itens:{...(form.itens||{}),[b.id]:v}})}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent>{["novo","bom","regular","danificado","ausente","inservivel"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>)}<Field label="Motivo da saída"><Textarea placeholder="Desmobilização, transferência, término da hospedagem..." onChange={e=>setForm({...form,motivo:e.target.value})}/></Field></>}
      {modal==="transferir"&&<><p className="text-sm">Transferência de <strong>{employeeName(selecionado?.employee_id)}</strong>.</p><Field label="Novo leito"><Select onValueChange={v=>setForm({...form,leito_destino:v})}><SelectTrigger><SelectValue placeholder="Selecione um leito disponível"/></SelectTrigger><SelectContent>{leitosEscopo.filter(l=>l.status==="disponivel").map(l=>{const q=quartos.find(q=>q.id===l.quarto_id);return <SelectItem key={l.id} value={l.id}>Quarto {q?.identificacao} · Leito {l.identificacao}</SelectItem>})}</SelectContent></Select></Field><Field label="Motivo"><Textarea onChange={e=>setForm({...form,motivo:e.target.value})}/></Field></>}
      {modal==="ausencia"&&<>{selecionado?.presenca_status==="ausente_temporariamente"?<p className="text-sm">Confirme que <strong>{employeeName(selecionado?.employee_id)}</strong> retornou ao alojamento.</p>:<><p className="text-sm">O leito continuará ocupado durante a ausência temporária.</p><Field label="Retorno previsto"><Input type="datetime-local" onChange={e=>setForm({...form,retorno:e.target.value})}/></Field></>}</>}
      {modal==="chamado"&&<><Field label="Alojamento"><Select onValueChange={v=>setForm({...form,alojamento_id:v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{unidades.map(a=><SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></Field><Field label="Título"><Input onChange={e=>setForm({...form,titulo:e.target.value})}/></Field><Field label="Descrição"><Textarea onChange={e=>setForm({...form,descricao:e.target.value})}/></Field><div className="grid grid-cols-2 gap-2"><Field label="Tipo"><Select defaultValue="corretiva" onValueChange={v=>setForm({...form,tipo:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["preventiva","corretiva","emergencial"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field><Field label="Prioridade"><Select defaultValue="media" onValueChange={v=>setForm({...form,prioridade:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["baixa","media","alta","critica"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field></div><Field label="Prazo"><Input type="datetime-local" onChange={e=>setForm({...form,prazo:e.target.value})}/></Field></>}
    </div><DialogFooter><Button variant="outline" onClick={()=>setModal(null)}>Cancelar</Button><Button disabled={saving} onClick={modal==="alojamento"?saveAlojamento:modal==="ambiente"?saveAmbiente:modal==="quarto"?saveQuarto:modal==="bem"?saveBem:modal==="reserva"?reservar:modal==="checkin"?checkin:modal==="checkout"?checkout:modal==="transferir"?transferir:modal==="ausencia"?registrarAusencia:saveChamado}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Salvar</Button></DialogFooter></DialogContent></Dialog>
  </div></Layout>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }

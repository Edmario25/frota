import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BedDouble, Building2, ChevronDown, Loader2, Pencil, Plus,
  RefreshCw, ShieldCheck, Users, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { T } from "@/i18n";
import {
  CLASSIFICACAO, DADOS_VAZIOS, Dados, ESTADO_BEM, PRIORIDADE, REGIME, TIPO_AMBIENTE,
  TIPO_CHAMADO, TIPO_UNIDADE, buscarTodos,
} from "@/components/alojamentos/shared";
import { MapaHotel } from "@/components/alojamentos/MapaHotel";
import { LeitoPainel } from "@/components/alojamentos/LeitoPainel";
import { MovimentarBemDialog } from "@/components/alojamentos/MovimentarBemDialog";
import { PatrimonioAba } from "@/components/alojamentos/PatrimonioAba";
import { ChamadosAba } from "@/components/alojamentos/ChamadosAba";
import { AlojadosAba } from "@/components/alojamentos/AlojadosAba";
import { PainelGestao } from "@/components/alojamentos/PainelGestao";
import { CustosAba } from "@/components/alojamentos/CustosAba";

type Modal =
  | "complexo" | "alojamento" | "ambiente" | "quarto" | "bem" | "reserva" | "checkin"
  | "checkout" | "transferir" | "ausencia" | "chamado" | "bloquear" | "no_show" | null;

const TITULO_MODAL: Record<Exclude<Modal, null>, string> = {
  complexo: "Complexo", alojamento: "Unidade de alojamento", ambiente: "Novo ambiente",
  quarto: "Criar quartos e leitos", bem: "Novo bem patrimonial", reserva: "Reservar leito",
  checkin: "Entrada de colaborador", checkout: "Saída e conferência", transferir: "Transferir alojado",
  ausencia: "Presença no alojamento", chamado: "Novo chamado", bloquear: "Bloquear leito",
  no_show: "Registrar não comparecimento",
};

export default function Alojamentos() {
  const { obras } = useObras();
  const { employees } = useEmployees();
  const [dados, setDados] = useState<Dados>(DADOS_VAZIOS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [obraId, setObraId] = useState("todas");
  const [complexoId, setComplexoId] = useState("todos");
  const [aba, setAba] = useState("painel");
  const [versaoCustos, setVersaoCustos] = useState(0);
  const [pedidoLancamento, setPedidoLancamento] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [alvo, setAlvo] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [leitoSelId, setLeitoSelId] = useState<string | null>(null);
  const [bemMovendo, setBemMovendo] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [complexos, unidades, ambientes, quartos, leitos, ocupacoes, reservas, bens, chamados] = await Promise.all([
        buscarTodos("alojamento_complexos", "nome"),
        buscarTodos("alojamentos", "nome"),
        buscarTodos("alojamento_ambientes", "nome"),
        buscarTodos("alojamento_quartos", "identificacao"),
        buscarTodos("alojamento_leitos", "identificacao"),
        buscarTodos("alojamento_ocupacoes", "data_entrada", false),
        buscarTodos("alojamento_reservas", "inicio_previsto"),
        buscarTodos("alojamento_bens", "tombamento"),
        buscarTodos("alojamento_chamados", "created_at", false),
      ]);
      setDados({ complexos, unidades, ambientes, quartos, leitos, ocupacoes, reservas, bens, chamados });
    } catch (e: any) {
      toast.error(`Não foi possível carregar o módulo: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Escopo pelos filtros ─────────────────────────────────────────────
  const complexosEscopo = dados.complexos.filter(c => obraId === "todas" || c.obra_id === obraId);
  const unidades = useMemo(() => dados.unidades.filter(u =>
    (obraId === "todas" || u.obra_id === obraId) && (complexoId === "todos" || u.complexo_id === complexoId),
  ), [dados.unidades, obraId, complexoId]);
  const unidadeIds = useMemo(() => new Set(unidades.map(u => u.id)), [unidades]);
  const quartoIds = useMemo(() => new Set(
    dados.ambientes.filter(a => unidadeIds.has(a.alojamento_id)).map(a => a.id),
  ), [dados.ambientes, unidadeIds]);
  const leitosEscopo = useMemo(() => dados.leitos.filter(l => quartoIds.has(l.quarto_id)), [dados.leitos, quartoIds]);
  const leitoIds = useMemo(() => new Set(leitosEscopo.map(l => l.id)), [leitosEscopo]);

  const ocupacaoPorLeito = useMemo(() => new Map(
    dados.ocupacoes.filter(o => !o.data_saida).map(o => [o.leito_id, o] as [string, any]),
  ), [dados.ocupacoes]);
  const reservaPorLeito = useMemo(() => {
    const mapa = new Map<string, any>();
    for (const r of dados.reservas.filter(r => r.status === "ativa")
      .sort((a, b) => String(a.inicio_previsto).localeCompare(String(b.inicio_previsto)))) {
      if (!mapa.has(r.leito_id)) mapa.set(r.leito_id, r);
    }
    return mapa;
  }, [dados.reservas]);

  const nomes = useMemo(() => new Map(employees.map((e: any) => [e.id, e.nome] as [string, string])), [employees]);
  const nome = useCallback((id: string) => nomes.get(id) ?? "Colaborador", [nomes]);

  const ativos = leitosEscopo.filter(l => l.status !== "desativado");
  const ocupados = leitosEscopo.filter(l => ocupacaoPorLeito.has(l.id)).length;
  const kpi = {
    total: ativos.length,
    ocupados,
    livres: leitosEscopo.filter(l => l.status === "disponivel").length,
    bloqueados: leitosEscopo.filter(l => ["manutencao", "interditado", "higienizacao"].includes(l.status)).length,
    chamados: dados.chamados.filter(c => unidadeIds.has(c.alojamento_id) && !["concluido", "cancelado"].includes(c.status)).length,
  };
  const pct = kpi.total ? (kpi.ocupados / kpi.total) * 100 : 0;
  const pctTexto = pct > 0 && pct < 1 ? pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : Math.round(pct).toString();

  // Capacidade autorizada: o número que a fiscalização cobra
  const excedidos = dados.complexos.filter(c => {
    if (c.capacidade_autorizada == null || (obraId !== "todas" && c.obra_id !== obraId)) return false;
    const us = new Set(dados.unidades.filter(u => u.complexo_id === c.id).map(u => u.id));
    const qs = new Set(dados.ambientes.filter(a => us.has(a.alojamento_id)).map(a => a.id));
    const n = dados.leitos.filter(l => qs.has(l.quarto_id) && ocupacaoPorLeito.has(l.id)).length;
    return n > c.capacidade_autorizada;
  });

  const leitoSel = leitoSelId ? dados.leitos.find(l => l.id === leitoSelId) ?? null : null;

  // ── Abertura de modais ───────────────────────────────────────────────
  function abrir(m: Modal, dadosAlvo?: any, inicial: any = {}) {
    setAlvo(dadosAlvo ?? null);
    setForm(inicial);
    setModal(m);
  }
  const campo = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const bensDoLeito = (leito: any) => dados.bens.filter(b =>
    b.ativo && b.ambiente_id === leito?.quarto_id && (!b.leito_id || b.leito_id === leito?.id));

  async function executar(promessa: Promise<{ error: any }>, sucesso: string, fechar = true) {
    setSaving(true);
    const { error } = await promessa;
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(sucesso);
    if (fechar) setModal(null);
    load();
    return true;
  }
  const rpc = (fn: string, args: any) => (supabase as any).rpc(fn, args);

  // ── Salvar cada modal ────────────────────────────────────────────────
  async function salvar() {
    switch (modal) {
      case "complexo": {
        if (!form.obra_id || !form.nome?.trim()) return toast.error("Informe obra e nome do complexo.");
        const linha = {
          obra_id: form.obra_id, nome: form.nome.trim(), status: form.status || "ativo",
          capacidade_autorizada: form.capacidade_autorizada ? Number(form.capacidade_autorizada) : null,
          observacoes: form.observacoes?.trim() || null,
        };
        const q = (supabase as any).from("alojamento_complexos");
        return executar(alvo ? q.update(linha).eq("id", alvo.id) : q.insert(linha), alvo ? "Complexo atualizado." : "Complexo cadastrado.");
      }
      case "alojamento": {
        const complexo = dados.complexos.find(c => c.id === form.complexo_id);
        if (!complexo || !form.nome?.trim()) return toast.error("Informe o complexo e o nome da unidade.");
        const linha = {
          obra_id: complexo.obra_id, complexo_id: complexo.id, nome: form.nome.trim(),
          endereco: form.endereco?.trim() || null, status: form.status || "ativo",
          capacidade_declarada: Number(form.capacidade_declarada || 0),
          capacidade_autorizada: form.capacidade_autorizada ? Number(form.capacidade_autorizada) : null,
          tipo_unidade: form.tipo_unidade || "casa", regime: form.regime || "proprio",
          proprietario_fornecedor: form.proprietario_fornecedor?.trim() || null,
          contrato_numero: form.contrato_numero?.trim() || null,
          contrato_inicio: form.contrato_inicio || null, contrato_fim: form.contrato_fim || null,
          valor_mensal: form.valor_mensal ? Number(form.valor_mensal) : null,
        };
        const q = (supabase as any).from("alojamentos");
        return executar(alvo ? q.update(linha).eq("id", alvo.id) : q.insert(linha), alvo ? "Unidade atualizada." : "Unidade cadastrada.");
      }
      case "quarto": {
        if (!form.alojamento_id || !form.identificacao?.trim() || !form.capacidade) return toast.error("Preencha unidade, identificação e leitos por quarto.");
        const n = Number(form.quantidade || 1);
        return executar(n > 1
          ? rpc("alojamento_criar_quartos_em_lote", {
              p_unidade: form.alojamento_id, p_prefixo: form.identificacao.trim(), p_quantidade: n,
              p_numero_inicial: Number(form.numero_inicial || 1), p_leitos_por_quarto: Number(form.capacidade),
              p_classificacao: form.classificacao || "masculino" })
          : rpc("alojamento_criar_quarto", {
              p_alojamento: form.alojamento_id, p_identificacao: form.identificacao.trim(),
              p_classificacao: form.classificacao || "masculino", p_capacidade: Number(form.capacidade) }),
          n > 1 ? `${n} quartos e seus leitos criados.` : "Quarto e leitos criados.");
      }
      case "ambiente": {
        if (!form.alojamento_id || !form.nome?.trim() || !form.tipo) return toast.error("Preencha unidade, nome e tipo.");
        return executar((supabase as any).from("alojamento_ambientes").insert({
          alojamento_id: form.alojamento_id, nome: form.nome.trim(), tipo: form.tipo,
          quantidade_chuveiros: Number(form.chuveiros || 0), quantidade_sanitarios: Number(form.sanitarios || 0),
          quantidade_lavatorios: Number(form.lavatorios || 0) }), "Ambiente cadastrado.");
      }
      case "bem": {
        if (!form.alojamento_id || !form.tombamento?.trim() || !form.descricao?.trim()) return toast.error("Informe unidade, tombamento e descrição.");
        return executar((supabase as any).from("alojamento_bens").insert({
          alojamento_id: form.alojamento_id, ambiente_id: form.ambiente_id || null, leito_id: form.leito_id || null,
          tombamento: form.tombamento.trim(), descricao: form.descricao.trim(),
          categoria: form.categoria?.trim() || null, numero_serie: form.numero_serie?.trim() || null,
          estado: form.estado || "bom", valor_aquisicao: form.valor ? Number(form.valor) : null }), "Bem cadastrado.");
      }
      case "checkin":
        if (!form.employee_id) return toast.error("Selecione o colaborador.");
        return executar(rpc("alojamento_checkin", { p_leito: alvo.id, p_employee: form.employee_id, p_observacoes: form.observacoes || null }), "Entrada registrada. Termo de recebimento dos bens gerado.");
      case "reserva":
        if (!form.employee_id || !form.inicio) return toast.error("Selecione colaborador e data de início.");
        return executar(rpc("alojamento_reservar", { p_leito: alvo.id, p_employee: form.employee_id, p_inicio: form.inicio, p_fim: form.fim || null, p_observacoes: form.observacoes || null }), "Leito reservado.");
      case "checkout": {
        if (!form.motivo?.trim()) return toast.error("Informe o motivo da saída.");
        const leito = dados.leitos.find(l => l.id === alvo.leito_id);
        const itens = bensDoLeito(leito).map(b => ({ bem_id: b.id, estado: form.itens?.[b.id] ?? b.estado, observacoes: null }));
        return executar(rpc("alojamento_checkout", { p_ocupacao: alvo.id, p_motivo: form.motivo.trim(), p_itens: itens }), "Saída registrada. Leito enviado para higienização.");
      }
      case "transferir":
        if (!form.leito_destino || !form.motivo?.trim()) return toast.error("Selecione o destino e informe o motivo.");
        return executar(rpc("alojamento_transferir", { p_ocupacao: alvo.id, p_leito_destino: form.leito_destino, p_motivo: form.motivo.trim() }), "Transferência concluída.");
      case "ausencia": {
        const ausentar = alvo.presenca_status !== "ausente_temporariamente";
        return executar(rpc("alojamento_registrar_ausencia", { p_ocupacao: alvo.id, p_ausente: ausentar, p_retorno: ausentar ? form.retorno || null : null }), ausentar ? "Ausência registrada." : "Retorno confirmado.");
      }
      case "bloquear":
        if (!form.motivo?.trim()) return toast.error("Informe o motivo do bloqueio.");
        return executar(rpc("alojamento_alterar_status_leito", { p_leito: alvo.id, p_status: form.status || "manutencao", p_motivo: form.motivo.trim() }), "Leito bloqueado.");
      case "no_show":
        if (!form.motivo?.trim()) return toast.error("Informe o motivo do não comparecimento.");
        return executar(rpc("alojamento_marcar_no_show", { p_reserva: alvo.id, p_motivo: form.motivo.trim() }), "Não comparecimento registrado e agenda atualizada.");
      case "chamado": {
        if (!form.alojamento_id || !form.titulo?.trim() || !form.descricao?.trim()) return toast.error("Informe unidade, título e descrição.");
        const { data: u } = await supabase.auth.getUser();
        return executar((supabase as any).from("alojamento_chamados").insert({
          alojamento_id: form.alojamento_id, ambiente_id: form.ambiente_id || null, titulo: form.titulo.trim(),
          descricao: form.descricao.trim(), tipo: form.tipo || "corretiva", prioridade: form.prioridade || "media",
          prazo: form.prazo || null, aberto_por: u.user?.id }), "Chamado aberto.");
      }
    }
  }

  const acoesLeito = {
    checkin: (l: any) => abrir("checkin", l, reservaPorLeito.get(l.id) ? { employee_id: reservaPorLeito.get(l.id).employee_id } : {}),
    reservar: (l: any) => abrir("reserva", l),
    cancelarReserva: (r: any) => executar(rpc("alojamento_cancelar_reserva", { p_reserva: r.id, p_motivo: "Cancelada pelo gestor" }), "Reserva cancelada e leito liberado.", false),
    checkout: (o: any) => {
      const leito = dados.leitos.find(l => l.id === o.leito_id);
      abrir("checkout", o, { itens: Object.fromEntries(bensDoLeito(leito).map(b => [b.id, b.estado])) });
    },
    transferir: (o: any) => abrir("transferir", o),
    ausencia: (o: any) => abrir("ausencia", o),
    liberar: (l: any) => executar(rpc("alojamento_alterar_status_leito", { p_leito: l.id, p_status: "disponivel", p_motivo: null }), "Leito liberado para uso.", false),
    bloquear: (l: any) => abrir("bloquear", l, { status: "manutencao" }),
    novoBem: (l: any) => {
      const amb = dados.ambientes.find(a => a.id === l.quarto_id);
      abrir("bem", null, { alojamento_id: amb?.alojamento_id, ambiente_id: l.quarto_id, leito_id: l.id, estado: "bom" });
    },
    moverBem: (b: any) => setBemMovendo(b),
  };

  const colaboradoresLivres = employees.filter((e: any) =>
    e.status === "ativo" && !dados.ocupacoes.some(o => !o.data_saida && o.employee_id === e.id));

  return (
    <Layout>
      <div className="mx-auto max-w-screen-xl space-y-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Projetos / Pessoas</p>
            <h1 className="text-2xl font-bold"><T>Gestão de Alojamentos</T></h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Cadastrar<ChevronDown className="ml-1 h-3.5 w-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => abrir("complexo", null, { obra_id: obraId !== "todas" ? obraId : undefined })}>Complexo</DropdownMenuItem>
                <DropdownMenuItem onClick={() => abrir("alojamento", null, { complexo_id: complexoId !== "todos" ? complexoId : undefined })}>Unidade (casa, bloco, hotel)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => abrir("quarto", null, { quantidade: "1", numero_inicial: "1", classificacao: "masculino" })}>Quartos e leitos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => abrir("ambiente")}>Ambiente (banheiro, cozinha…)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => abrir("bem", null, { estado: "bom" })}>Bem patrimonial</DropdownMenuItem>
                <DropdownMenuItem onClick={() => abrir("chamado", null, { tipo: "corretiva", prioridade: "media" })}>Chamado de manutenção</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={obraId} onValueChange={v => { setObraId(v); setComplexoId("todos"); }}>
            <SelectTrigger className="h-9 sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obras</SelectItem>
              {obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={complexoId} onValueChange={setComplexoId}>
            <SelectTrigger className="h-9 sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os complexos</SelectItem>
              {complexosEscopo.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Indicadores */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {([
            [BedDouble, "Leitos", kpi.total, "em operação", ""],
            [Users, "Ocupados", kpi.ocupados, `${pctTexto}% de ocupação`, "text-violet-600"],
            [ShieldCheck, "Livres", kpi.livres, "prontos para entrada", "text-emerald-600"],
            [AlertTriangle, "Bloqueados", kpi.bloqueados, "limpeza ou manutenção", kpi.bloqueados ? "text-amber-600" : ""],
            [Wrench, "Chamados", kpi.chamados, "em aberto", kpi.chamados ? "text-red-600" : ""],
          ] as any[]).map(([Icon, label, valor, sub, cor]) => (
            <div key={label} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
              <Icon className={`h-5 w-5 flex-shrink-0 text-muted-foreground ${cor}`} />
              <div className="min-w-0">
                <p className={`text-xl font-bold leading-none tabular-nums ${cor}`}>{valor}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{label} · {sub}</p>
              </div>
            </div>
          ))}
        </div>

        {excedidos.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Ocupação acima da capacidade autorizada em: <strong>{excedidos.map(c => c.nome).join(", ")}</strong>.</span>
          </div>
        )}

        {!loading && !dados.complexos.length ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="font-semibold">Cadastre o primeiro complexo</h2>
            <p className="mb-4 text-sm text-muted-foreground">Um complexo agrupa casas, blocos, hotéis ou contêineres de uma obra.</p>
            <Button onClick={() => abrir("complexo")}><Plus className="mr-2 h-4 w-4" />Começar</Button>
          </div>
        ) : (
          <Tabs value={aba} onValueChange={setAba} className="rounded-xl border bg-card p-4">
            <TabsList className="mb-4 h-auto flex-wrap">
              <TabsTrigger value="painel">Painel</TabsTrigger>
              <TabsTrigger value="mapa">Mapa de leitos</TabsTrigger>
              <TabsTrigger value="custos">Custos</TabsTrigger>
              <TabsTrigger value="alojados">Alojados</TabsTrigger>
              <TabsTrigger value="patrimonio">Patrimônio</TabsTrigger>
              <TabsTrigger value="chamados">Chamados{kpi.chamados ? ` (${kpi.chamados})` : ""}</TabsTrigger>
              <TabsTrigger value="estrutura">Estrutura</TabsTrigger>
            </TabsList>

            <TabsContent value="painel">
              <PainelGestao dados={dados} unidades={unidades}
                complexoIds={new Set((complexoId === "todos" ? complexosEscopo : complexosEscopo.filter(c => c.id === complexoId)).map(c => c.id))}
                versao={versaoCustos}
                onLancar={() => { setAba("custos"); setPedidoLancamento(n => n + 1); }} />
            </TabsContent>

            <TabsContent value="custos" forceMount className="data-[state=inactive]:hidden">
              <CustosAba complexos={complexoId === "todos" ? complexosEscopo : complexosEscopo.filter(c => c.id === complexoId)}
                unidades={unidades} abrirNovo={pedidoLancamento} onMudou={() => setVersaoCustos(v => v + 1)} />
            </TabsContent>

            <TabsContent value="mapa">
              <MapaHotel dados={dados} unidades={unidades} ocupacaoPorLeito={ocupacaoPorLeito} reservaPorLeito={reservaPorLeito}
                nome={nome} onLeito={l => setLeitoSelId(l.id)}
                onNovoQuarto={id => abrir("quarto", null, { alojamento_id: id, quantidade: "1", numero_inicial: "1", classificacao: "masculino" })} />
            </TabsContent>

            <TabsContent value="alojados">
              <AlojadosAba dados={dados} leitoIds={leitoIds} nome={nome} onLeito={l => setLeitoSelId(l.id)}
                onCancelarReserva={acoesLeito.cancelarReserva} onNoShow={r => abrir("no_show", r)} />
            </TabsContent>

            <TabsContent value="patrimonio">
              <PatrimonioAba dados={dados} unidadeIds={unidadeIds} onNovo={() => abrir("bem", null, { estado: "bom" })}
                onMover={b => setBemMovendo(b)} onRecarregar={load} />
            </TabsContent>

            <TabsContent value="chamados">
              <ChamadosAba dados={dados} unidadeIds={unidadeIds} employees={employees}
                onNovo={() => abrir("chamado", null, { tipo: "corretiva", prioridade: "media" })} onRecarregar={load} />
            </TabsContent>

            <TabsContent value="estrutura">
              <Estrutura dados={dados} unidades={unidades} complexos={complexosEscopo} obras={obras} ocupacaoPorLeito={ocupacaoPorLeito}
                onEditarUnidade={u => abrir("alojamento", u, { ...u })} onEditarComplexo={c => abrir("complexo", c, { ...c })} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <LeitoPainel leito={leitoSel} onClose={() => setLeitoSelId(null)} dados={dados}
        ocupacao={leitoSel ? ocupacaoPorLeito.get(leitoSel.id) : undefined}
        reserva={leitoSel ? reservaPorLeito.get(leitoSel.id) : undefined}
        nome={nome} acoes={acoesLeito} />

      <MovimentarBemDialog bem={bemMovendo} onClose={() => setBemMovendo(null)} dados={dados} onDone={load} />

      {/* Formulários */}
      <Dialog open={!!modal} onOpenChange={o => !o && setModal(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{modal ? (alvo && (modal === "complexo" || modal === "alojamento") ? `Editar ${TITULO_MODAL[modal].toLowerCase()}` : TITULO_MODAL[modal]) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {modal === "complexo" && <>
              <Campo label="Obra"><Escolha valor={form.obra_id} onChange={campo("obra_id")} opcoes={obras.map((o: any) => [o.id, o.nome])} /></Campo>
              <Campo label="Nome"><Input value={form.nome ?? ""} onChange={campo("nome")} placeholder="Ex.: Complexo Eólico Norte" /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Capacidade autorizada"><Input type="number" min="0" value={form.capacidade_autorizada ?? ""} onChange={campo("capacidade_autorizada")} /></Campo>
                <Campo label="Situação"><Escolha valor={form.status ?? "ativo"} onChange={campo("status")} opcoes={[["ativo", "Ativo"], ["parcialmente_interditado", "Parcialmente interditado"], ["interditado", "Interditado"], ["inativo", "Inativo"]]} /></Campo>
              </div>
              <Campo label="Observações"><Textarea value={form.observacoes ?? ""} onChange={campo("observacoes")} /></Campo>
            </>}

            {modal === "alojamento" && <>
              <Campo label="Complexo"><Escolha valor={form.complexo_id} onChange={campo("complexo_id")} opcoes={complexosEscopo.map(c => [c.id, c.nome])} /></Campo>
              <Campo label="Nome da unidade"><Input value={form.nome ?? ""} onChange={campo("nome")} placeholder="Ex.: Bloco A ou Casa 01" /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Tipo"><Escolha valor={form.tipo_unidade ?? "casa"} onChange={campo("tipo_unidade")} opcoes={Object.entries(TIPO_UNIDADE)} /></Campo>
                <Campo label="Regime"><Escolha valor={form.regime ?? "proprio"} onChange={campo("regime")} opcoes={Object.entries(REGIME)} /></Campo>
              </div>
              <Campo label="Endereço"><Input value={form.endereco ?? ""} onChange={campo("endereco")} /></Campo>
              <div className="grid grid-cols-3 gap-2">
                <Campo label="Cap. física"><Input type="number" min="0" value={form.capacidade_declarada ?? ""} onChange={campo("capacidade_declarada")} /></Campo>
                <Campo label="Cap. autorizada"><Input type="number" min="0" value={form.capacidade_autorizada ?? ""} onChange={campo("capacidade_autorizada")} /></Campo>
                <Campo label="Situação"><Escolha valor={form.status ?? "ativo"} onChange={campo("status")} opcoes={[["ativo", "Ativa"], ["parcialmente_interditado", "Parcial"], ["interditado", "Interditada"], ["inativo", "Inativa"]]} /></Campo>
              </div>
              {["alugado", "hospedagem", "terceirizado"].includes(form.regime) && <>
                <Campo label="Proprietário / fornecedor"><Input value={form.proprietario_fornecedor ?? ""} onChange={campo("proprietario_fornecedor")} /></Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Contrato"><Input value={form.contrato_numero ?? ""} onChange={campo("contrato_numero")} /></Campo>
                  <Campo label="Valor mensal"><Input type="number" min="0" step="0.01" value={form.valor_mensal ?? ""} onChange={campo("valor_mensal")} /></Campo>
                  <Campo label="Início"><Input type="date" value={form.contrato_inicio ?? ""} onChange={campo("contrato_inicio")} /></Campo>
                  <Campo label="Fim"><Input type="date" value={form.contrato_fim ?? ""} onChange={campo("contrato_fim")} /></Campo>
                </div>
              </>}
            </>}

            {modal === "quarto" && <>
              <Campo label="Unidade"><Escolha valor={form.alojamento_id} onChange={campo("alojamento_id")} opcoes={unidades.map(u => [u.id, u.nome])} /></Campo>
              <div className="grid grid-cols-3 gap-2">
                <Campo label="Prefixo"><Input value={form.identificacao ?? ""} onChange={campo("identificacao")} placeholder="Ex.: B" /></Campo>
                <Campo label="Quantidade"><Input type="number" min="1" max="200" value={form.quantidade ?? "1"} onChange={campo("quantidade")} /></Campo>
                <Campo label="Nº inicial"><Input type="number" min="0" value={form.numero_inicial ?? "1"} onChange={campo("numero_inicial")} /></Campo>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Classificação"><Escolha valor={form.classificacao ?? "masculino"} onChange={campo("classificacao")} opcoes={Object.entries(CLASSIFICACAO).map(([k, v]) => [k, v.label])} /></Campo>
                <Campo label="Leitos por quarto"><Input type="number" min="1" max="20" value={form.capacidade ?? ""} onChange={campo("capacidade")} /></Campo>
              </div>
              {Number(form.quantidade) > 1 && form.identificacao && (
                <p className="text-xs text-muted-foreground">
                  Serão criados {form.quantidade} quartos, de {form.identificacao}{String(Number(form.numero_inicial || 1)).padStart(3, "0")} a {form.identificacao}{String(Number(form.numero_inicial || 1) + Number(form.quantidade) - 1).padStart(3, "0")}.
                </p>
              )}
            </>}

            {modal === "ambiente" && <>
              <Campo label="Unidade"><Escolha valor={form.alojamento_id} onChange={campo("alojamento_id")} opcoes={unidades.map(u => [u.id, u.nome])} /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Nome"><Input value={form.nome ?? ""} onChange={campo("nome")} placeholder="Ex.: Banheiro térreo" /></Campo>
                <Campo label="Tipo"><Escolha valor={form.tipo} onChange={campo("tipo")} opcoes={Object.entries(TIPO_AMBIENTE).filter(([k]) => k !== "quarto")} /></Campo>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Campo label="Chuveiros"><Input type="number" min="0" value={form.chuveiros ?? ""} onChange={campo("chuveiros")} /></Campo>
                <Campo label="Sanitários"><Input type="number" min="0" value={form.sanitarios ?? ""} onChange={campo("sanitarios")} /></Campo>
                <Campo label="Lavatórios"><Input type="number" min="0" value={form.lavatorios ?? ""} onChange={campo("lavatorios")} /></Campo>
              </div>
            </>}

            {modal === "bem" && <>
              <Campo label="Unidade"><Escolha valor={form.alojamento_id} onChange={v => setForm((f: any) => ({ ...f, alojamento_id: v, ambiente_id: "", leito_id: "" }))} opcoes={unidades.map(u => [u.id, u.nome])} /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Ambiente">
                  <Escolha valor={form.ambiente_id || "__"} onChange={v => setForm((f: any) => ({ ...f, ambiente_id: v === "__" ? "" : v, leito_id: "" }))}
                    opcoes={[["__", "Área geral / depósito"], ...dados.ambientes.filter(a => a.alojamento_id === form.alojamento_id).map(a => [a.id, a.nome])]} />
                </Campo>
                <Campo label="Leito">
                  <Escolha valor={form.leito_id || "__"} onChange={v => setForm((f: any) => ({ ...f, leito_id: v === "__" ? "" : v }))}
                    desabilitado={!dados.quartos.some(q => q.id === form.ambiente_id)}
                    opcoes={[["__", "Quarto inteiro"], ...dados.leitos.filter(l => l.quarto_id === form.ambiente_id).map(l => [l.id, `Leito ${l.identificacao}`])]} />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Tombamento"><Input value={form.tombamento ?? ""} onChange={campo("tombamento")} /></Campo>
                <Campo label="Número de série"><Input value={form.numero_serie ?? ""} onChange={campo("numero_serie")} /></Campo>
              </div>
              <Campo label="Descrição"><Input value={form.descricao ?? ""} onChange={campo("descricao")} placeholder="Ex.: Colchão solteiro D33 INMETRO" /></Campo>
              <div className="grid grid-cols-3 gap-2">
                <Campo label="Categoria"><Input value={form.categoria ?? ""} onChange={campo("categoria")} placeholder="Cama, TV…" /></Campo>
                <Campo label="Estado"><Escolha valor={form.estado ?? "bom"} onChange={campo("estado")} opcoes={["novo", "bom", "regular", "danificado"].map(k => [k, ESTADO_BEM[k].label])} /></Campo>
                <Campo label="Valor"><Input type="number" min="0" step="0.01" value={form.valor ?? ""} onChange={campo("valor")} /></Campo>
              </div>
            </>}

            {modal === "checkin" && <>
              <p className="text-sm text-muted-foreground">Os bens do quarto e do leito entram automaticamente no termo de recebimento.</p>
              <Campo label="Colaborador">
                <Escolha valor={form.employee_id} onChange={campo("employee_id")}
                  opcoes={(reservaPorLeito.get(alvo?.id)
                    ? employees.filter((e: any) => e.id === reservaPorLeito.get(alvo.id).employee_id)
                    : colaboradoresLivres).map((e: any) => [e.id, e.nome])} />
              </Campo>
              <Campo label="Observações"><Textarea value={form.observacoes ?? ""} onChange={campo("observacoes")} /></Campo>
            </>}

            {modal === "reserva" && <>
              <Campo label="Colaborador">
                <Escolha valor={form.employee_id} onChange={campo("employee_id")}
                  opcoes={colaboradoresLivres.map((e: any) => [e.id, e.nome])} />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Início previsto"><Input type="date" min={new Date().toISOString().slice(0, 10)} value={form.inicio ?? ""} onChange={campo("inicio")} /></Campo>
                <Campo label="Fim previsto"><Input type="date" min={form.inicio || new Date().toISOString().slice(0, 10)} value={form.fim ?? ""} onChange={campo("fim")} /></Campo>
              </div>
              <Campo label="Observações"><Textarea value={form.observacoes ?? ""} onChange={campo("observacoes")} /></Campo>
            </>}

            {modal === "checkout" && alvo && <>
              <p className="text-sm">Saída de <strong>{nome(alvo.employee_id)}</strong>. Confira cada bem — o estado informado é gravado no patrimônio.</p>
              {bensDoLeito(dados.leitos.find(l => l.id === alvo.leito_id)).map(b => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.descricao}</p>
                    <p className="font-mono text-xs text-muted-foreground">{b.tombamento} · {b.leito_id ? "do leito" : "do quarto"}</p>
                  </div>
                  <Escolha className="w-36" valor={form.itens?.[b.id] ?? b.estado}
                    onChange={v => setForm((f: any) => ({ ...f, itens: { ...(f.itens || {}), [b.id]: v } }))}
                    opcoes={["novo", "bom", "regular", "danificado", "ausente", "inservivel"].map(k => [k, ESTADO_BEM[k].label])} />
                </div>
              ))}
              {!bensDoLeito(dados.leitos.find(l => l.id === alvo.leito_id)).length && (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nenhum bem vinculado a este quarto ou leito.</p>
              )}
              <Campo label="Motivo da saída"><Textarea value={form.motivo ?? ""} onChange={campo("motivo")} placeholder="Desmobilização, férias, fim de contrato…" /></Campo>
            </>}

            {modal === "transferir" && alvo && <>
              <p className="text-sm">Transferência de <strong>{nome(alvo.employee_id)}</strong>. O leito atual segue para higienização.</p>
              <Campo label="Novo leito">
                <Escolha valor={form.leito_destino} onChange={campo("leito_destino")}
                  opcoes={leitosEscopo.filter(l => l.status === "disponivel").map(l => {
                    const q = dados.quartos.find(x => x.id === l.quarto_id);
                    const u = dados.unidades.find(x => x.id === dados.ambientes.find(a => a.id === q?.id)?.alojamento_id);
                    return [l.id, `${u?.nome} · Quarto ${q?.identificacao} · Leito ${l.identificacao}`];
                  })} />
              </Campo>
              <Campo label="Motivo"><Textarea value={form.motivo ?? ""} onChange={campo("motivo")} /></Campo>
            </>}

            {modal === "ausencia" && alvo && (alvo.presenca_status === "ausente_temporariamente"
              ? <p className="text-sm">Confirme que <strong>{nome(alvo.employee_id)}</strong> retornou ao alojamento.</p>
              : <>
                <p className="text-sm">O leito continua reservado para <strong>{nome(alvo.employee_id)}</strong> durante a ausência.</p>
                <Campo label="Retorno previsto"><Input type="datetime-local" value={form.retorno ?? ""} onChange={campo("retorno")} /></Campo>
              </>)}

            {modal === "bloquear" && <>
              <Campo label="Motivo do bloqueio"><Escolha valor={form.status ?? "manutencao"} onChange={campo("status")} opcoes={[["manutencao", "Manutenção"], ["interditado", "Interdição"], ["desativado", "Desativar leito"]]} /></Campo>
              <Campo label="Descrição"><Textarea value={form.motivo ?? ""} onChange={campo("motivo")} placeholder="Ex.: estrado quebrado, infiltração no teto" /></Campo>
            </>}

            {modal === "no_show" && alvo && <>
              <p className="text-sm">A reserva de <strong>{nome(alvo.employee_id)}</strong> será encerrada como não comparecimento.</p>
              <Campo label="Justificativa"><Textarea value={form.motivo ?? ""} onChange={campo("motivo")} placeholder="Ex.: mobilização cancelada ou colaborador não chegou na data prevista" /></Campo>
            </>}

            {modal === "chamado" && <>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Unidade"><Escolha valor={form.alojamento_id} onChange={v => setForm((f: any) => ({ ...f, alojamento_id: v, ambiente_id: "" }))} opcoes={unidades.map(u => [u.id, u.nome])} /></Campo>
                <Campo label="Ambiente">
                  <Escolha valor={form.ambiente_id || "__"} onChange={v => setForm((f: any) => ({ ...f, ambiente_id: v === "__" ? "" : v }))}
                    opcoes={[["__", "Unidade toda"], ...dados.ambientes.filter(a => a.alojamento_id === form.alojamento_id).map(a => [a.id, a.nome])]} />
                </Campo>
              </div>
              <Campo label="Título"><Input value={form.titulo ?? ""} onChange={campo("titulo")} placeholder="Ex.: Ar-condicionado sem gelar" /></Campo>
              <Campo label="Descrição"><Textarea value={form.descricao ?? ""} onChange={campo("descricao")} /></Campo>
              <div className="grid grid-cols-3 gap-2">
                <Campo label="Tipo"><Escolha valor={form.tipo ?? "corretiva"} onChange={campo("tipo")} opcoes={Object.entries(TIPO_CHAMADO)} /></Campo>
                <Campo label="Prioridade"><Escolha valor={form.prioridade ?? "media"} onChange={campo("prioridade")} opcoes={Object.entries(PRIORIDADE).map(([k, v]) => [k, v.label])} /></Campo>
                <Campo label="Prazo"><Input type="datetime-local" value={form.prazo ?? ""} onChange={campo("prazo")} /></Campo>
              </div>
            </>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={salvar}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// ── Aba Estrutura ──────────────────────────────────────────────────────
function Estrutura({ dados, unidades, complexos, obras, ocupacaoPorLeito, onEditarUnidade, onEditarComplexo }: {
  dados: Dados; unidades: any[]; complexos: any[]; obras: any[]; ocupacaoPorLeito: Map<string, any>;
  onEditarUnidade: (u: any) => void; onEditarComplexo: (c: any) => void;
}) {
  return (
    <div className="space-y-6">
      {complexos.map(c => {
        const us = unidades.filter(u => u.complexo_id === c.id);
        if (!us.length && complexos.length > 1) return null;
        return (
          <section key={c.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{c.nome}</h3>
                <p className="text-xs text-muted-foreground">
                  {obras.find((o: any) => o.id === c.obra_id)?.nome} · {us.length} unidades
                  {c.capacidade_autorizada != null && ` · capacidade autorizada ${c.capacidade_autorizada}`}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onEditarComplexo(c)}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {us.map(u => {
                const amb = dados.ambientes.filter(a => a.alojamento_id === u.id);
                const quartoIds = new Set(amb.filter(a => a.tipo === "quarto").map(a => a.id));
                const leitos = dados.leitos.filter(l => quartoIds.has(l.quarto_id));
                const ocupados = leitos.filter(l => ocupacaoPorLeito.has(l.id)).length;
                const chuveiros = amb.reduce((n, a) => n + (a.quantidade_chuveiros || 0), 0);
                const faltaChuveiro = chuveiros < Math.ceil(ocupados / 10);
                const vence = u.contrato_fim && new Date(u.contrato_fim).getTime() - Date.now() < 30 * 864e5;
                return (
                  <div key={u.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{u.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {TIPO_UNIDADE[u.tipo_unidade] ?? "Unidade"} · {REGIME[u.regime] ?? u.regime}{u.endereco ? ` · ${u.endereco}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {u.status !== "ativo" && <Badge variant="outline">{u.status.replace("_", " ")}</Badge>}
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => onEditarUnidade(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                      {[[quartoIds.size, "quartos"], [leitos.length, "leitos"], [ocupados, "ocupados"], [chuveiros, "chuveiros"]].map(([n, l]) => (
                        <div key={l as string} className="rounded bg-muted p-2"><strong className="block text-base tabular-nums">{n}</strong>{l}</div>
                      ))}
                    </div>
                    {faltaChuveiro && (
                      <p className="mt-2 text-xs text-red-600"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Menos de 1 chuveiro para cada 10 alojados (NR-24).</p>
                    )}
                    {u.valor_mensal != null && (
                      <p className={`mt-2 text-xs ${vence ? "font-medium text-amber-700" : "text-muted-foreground"}`}>
                        {Number(u.valor_mensal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês
                        {u.contrato_fim && ` · contrato até ${new Date(`${u.contrato_fim}T12:00:00`).toLocaleDateString("pt-BR")}`}
                        {vence && " · vence em menos de 30 dias"}
                      </p>
                    )}
                    {amb.some(a => a.tipo !== "quarto") && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {amb.filter(a => a.tipo !== "quarto").map(a => <Badge key={a.id} variant="secondary">{a.nome}</Badge>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Pequenos auxiliares de formulário ──────────────────────────────────
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Escolha({ valor, onChange, opcoes, desabilitado, className }: {
  valor?: string; onChange: (v: string) => void; opcoes: (string[] | [string, string])[];
  desabilitado?: boolean; className?: string;
}) {
  return (
    <Select value={valor || undefined} onValueChange={onChange} disabled={desabilitado}>
      <SelectTrigger className={className}><SelectValue placeholder="Selecione" /></SelectTrigger>
      <SelectContent>
        {opcoes.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

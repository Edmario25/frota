import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Gauge, RefreshCw, MapPin, Radio, AlertTriangle, CheckCircle2,
  Plus, Wifi, WifiOff, ExternalLink, Copy, Loader2, ShieldAlert, Search, Eye, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useObras } from "@/hooks/useObras";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";

// ─── Tipos ───────────────────────────────────────────────────────────

type Checkpoint = {
  id: string;
  obra_id: string;
  nome: string;
  descricao: string | null;
  limite_velocidade_kmh: number;
  tolerancia_kmh: number;
  latitude: number | null;
  longitude: number | null;
  device_token: string | null;
  device_token_hint: string | null;
  device_ultimo_contato: string | null;
  heartbeat_intervalo_seg: number;
  calibracao_valida_ate: string | null;
  numero_serie: string | null;
  modo: string;
  ativo: boolean;
  obras: { nome: string } | null;
};

type Infracao = {
  id: string;
  passagem_id: string;
  velocidade_kmh: number;
  limite_kmh: number;
  excesso_kmh: number;
  excesso_percentual: number;
  gravidade: "leve" | "media" | "grave" | "gravissima";
  status: string;
  desvio_id: string | null;
  notificada_em: string | null;
  ciente_em: string | null;
  tratativa: string | null;
  causa: string | null;
  acao_corretiva: string | null;
  tratado_em: string | null;
  created_at: string;
  vehicles: { placa: string; marca: string; modelo: string } | null;
  employees: { nome: string } | null;
  sms_checkpoints: { nome: string } | null;
  obras: { nome: string } | null;
};

type Passagem = {
  id: string;
  velocidade_kmh: number;
  limite_no_momento: number;
  tag_epc: string | null;
  sentido: string | null;
  origem: string;
  detectado_em: string;
  vehicles: { placa: string } | null;
  sms_checkpoints: { nome: string } | null;
};

type TagRfid = {
  id: string;
  tag_epc: string;
  ativa: boolean;
  data_vinculo: string;
  observacoes: string | null;
  vehicles: { placa: string; marca: string; modelo: string } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────

const GRAVIDADE_CFG: Record<string, { label: string; cls: string }> = {
  leve:       { label: "Leve",       cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  media:      { label: "Média",      cls: "bg-orange-100 text-orange-800 border-orange-300" },
  grave:      { label: "Grave",      cls: "bg-red-100 text-red-800 border-red-300" },
  gravissima: { label: "Gravíssima", cls: "bg-red-200 text-red-900 border-red-400 font-bold" },
};

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta", em_tratativa: "Em tratativa", notificada: "Notificada",
  encerrada: "Encerrada", cancelada: "Cancelada",
};

function dateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function isOnline(ultimoContato: string | null, intervaloSeg = 300) {
  if (!ultimoContato) return false;
  return Date.now() - new Date(ultimoContato).getTime() < Math.max(intervaloSeg * 3, 300) * 1000;
}

function Empty({ text, icon: Icon = CheckCircle2 }: { text: string; icon?: any }) {
  return (
    <div className="py-16 text-center">
      <Icon className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────

export default function SmsVelocidade() {
  const { obras } = useObras();
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [infracoes, setInfracoes]     = useState<Infracao[]>([]);
  const [passagens, setPassagens]     = useState<Passagem[]>([]);
  const [tags, setTags]               = useState<TagRfid[]>([]);
  const [loading, setLoading]         = useState(true);
  const [busy, setBusy]               = useState<string | null>(null);

  // Modais
  const [novoCheckpointOpen, setNovoCheckpointOpen] = useState(false);
  const [novaTagOpen, setNovaTagOpen]               = useState(false);
  const [registroManualOpen, setRegistroManualOpen] = useState(false);
  const [infracaoSelecionada, setInfracaoSelecionada] = useState<Infracao | null>(null);
  const [checkpointConfig, setCheckpointConfig] = useState<Checkpoint | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [gravidadeFiltro, setGravidadeFiltro] = useState("todas");

  // ── Carregamento ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [cp, inf, pas, tg] = await Promise.all([
      (supabase as any).from("sms_checkpoints")
        .select("id,obra_id,nome,descricao,limite_velocidade_kmh,tolerancia_kmh,latitude,longitude,device_token_hint,device_ultimo_contato,heartbeat_intervalo_seg,calibracao_valida_ate,numero_serie,modo,ativo,obras(nome)").order("nome"),
      (supabase as any).from("sms_infracoes_velocidade")
        .select("id,passagem_id,velocidade_kmh,limite_kmh,excesso_kmh,excesso_percentual,gravidade,status,desvio_id,notificada_em,ciente_em,tratativa,causa,acao_corretiva,tratado_em,created_at,vehicles(placa,marca,modelo),employees(nome),sms_checkpoints(nome),obras(nome)")
        .order("created_at", { ascending: false }).limit(200),
      (supabase as any).from("sms_checkpoint_passagens")
        .select("id,velocidade_kmh,limite_no_momento,tag_epc,sentido,origem,detectado_em,vehicles(placa),sms_checkpoints(nome)")
        .order("detectado_em", { ascending: false }).limit(200),
      (supabase as any).from("sms_veiculos_rfid")
        .select("id,tag_epc,ativa,data_vinculo,observacoes,vehicles(placa,marca,modelo)")
        .order("data_vinculo", { ascending: false }),
    ]);

    const failure = [cp, inf, pas, tg].find(r => r.error)?.error;
    if (failure) toast.error(`Não foi possível carregar os dados: ${failure.message}`);

    setCheckpoints((cp.data ?? []) as Checkpoint[]);
    setInfracoes((inf.data ?? []) as Infracao[]);
    setPassagens((pas.data ?? []) as Passagem[]);
    setTags((tg.data ?? []) as TagRfid[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── KPIs ──────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const hoje = new Date().toDateString();
    return {
      checkpointsAtivos: checkpoints.filter(c => c.ativo).length,
      online:            checkpoints.filter(c => isOnline(c.device_ultimo_contato, c.heartbeat_intervalo_seg)).length,
      infracoesAbertas:  infracoes.filter(i => i.status === "aberta").length,
      infracoesHoje:     infracoes.filter(i => new Date(i.created_at).toDateString() === hoje).length,
      passagensHoje:     passagens.filter(p => new Date(p.detectado_em).toDateString() === hoje).length,
      graves:            infracoes.filter(i => ["grave", "gravissima"].includes(i.gravidade) && i.status !== "encerrada").length,
    };
  }, [checkpoints, infracoes, passagens]);

  const infracoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return infracoes.filter(item => {
      if (statusFiltro !== "todos" && item.status !== statusFiltro) return false;
      if (gravidadeFiltro !== "todas" && item.gravidade !== gravidadeFiltro) return false;
      if (!termo) return true;
      return [item.vehicles?.placa, item.vehicles?.marca, item.vehicles?.modelo,
        item.employees?.nome, item.sms_checkpoints?.nome, item.obras?.nome]
        .some(valor => valor?.toLocaleLowerCase("pt-BR").includes(termo));
    });
  }, [busca, gravidadeFiltro, infracoes, statusFiltro]);

  // ── Ações ─────────────────────────────────────────────────────────
  async function notificarMotorista(id: string, temMotorista: boolean) {
    if (!temMotorista) {
      return toast.error(
        "Sem motorista identificado — não há para quem enviar. " +
        "Vincule a tag ao veículo e confira o responsável cadastrado."
      );
    }
    setBusy(id);
    const { error } = await (supabase as any)
      .rpc("sms_notificar_infracao", { p_infracao_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Motorista notificado. A infração aparece no app dele para ciência.");
    load();
  }

  async function escalarParaDesvio(id: string) {
    setBusy(id);
    const { error } = await (supabase as any)
      .rpc("sms_escalar_infracao_para_desvio", { p_infracao_id: id });
    setBusy(null);
    if (error) return toast.error(`Não foi possível gerar o desvio: ${error.message}`);
    toast.success("Desvio criado no módulo SMS e vinculado à infração.");
    load();
  }

  async function toggleCheckpoint(cp: Checkpoint) {
    setBusy(cp.id);
    const { error } = await (supabase as any)
      .from("sms_checkpoints").update({ ativo: !cp.ativo }).eq("id", cp.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(cp.ativo ? "Checkpoint desativado." : "Checkpoint ativado.");
    load();
  }

  return (
    <Layout>
      <div className="mx-auto max-w-screen-xl space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">SMS / SSMA</p>
            <h1 className="text-2xl font-bold">Controle de velocidade</h1>
            <p className="text-sm text-muted-foreground">
              Checkpoints com radar e leitura RFID nas vias internas da obra.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Checkpoints ativos", value: `${totals.online}/${totals.checkpointsAtivos}`, sub: "online agora", Icon: Radio },
            { label: "Passagens hoje",     value: totals.passagensHoje, sub: "veículos detectados", Icon: Gauge },
            { label: "Infrações abertas",  value: totals.infracoesAbertas, sub: `${totals.infracoesHoje} hoje`, Icon: AlertTriangle },
            { label: "Graves em aberto",   value: totals.graves, sub: "exigem tratativa", Icon: ShieldAlert },
          ].map(({ label, value, sub, Icon }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <Icon className="mb-3 h-5 w-5 text-primary" />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-[11px] text-muted-foreground/70">{sub}</p>
            </div>
          ))}
        </div>

        {/* Abas */}
        <Tabs defaultValue="infracoes" className="rounded-xl border bg-card p-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="infracoes">Infrações</TabsTrigger>
            <TabsTrigger value="passagens">Passagens</TabsTrigger>
            <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
            <TabsTrigger value="tags">Tags RFID</TabsTrigger>
          </TabsList>

          {/* ── Infrações ────────────────────────────────────────── */}
          <TabsContent value="infracoes" className="mt-4">
            <div className="mb-3 grid gap-2 md:grid-cols-[1fr_190px_190px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar placa, motorista, checkpoint ou obra..."
                  value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos os status</SelectItem>{Object.entries(STATUS_LABEL).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={gravidadeFiltro} onValueChange={setGravidadeFiltro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todas">Todas as gravidades</SelectItem>{Object.entries(GRAVIDADE_CFG).map(([v,c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="divide-y">
            {!loading && !infracoes.length && (
              <Empty text="Nenhuma infração de velocidade registrada." />
            )}
            {!loading && infracoes.length > 0 && !infracoesFiltradas.length && <Empty text="Nenhuma infração corresponde aos filtros." icon={Search} />}
            {infracoesFiltradas.map(item => {
              const g = GRAVIDADE_CFG[item.gravidade];
              return (
                <div key={item.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center">
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge className={g.cls} variant="outline">{g.label}</Badge>
                      <Badge variant={item.status === "encerrada" ? "secondary" : "default"}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                      {item.desvio_id && (
                        <Badge variant="outline" className="gap-1">
                          <ExternalLink className="h-3 w-3" />Desvio gerado
                        </Badge>
                      )}
                      {item.ciente_em ? (
                        <Badge variant="outline"
                          className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Ciente em {dateTime(item.ciente_em)}
                        </Badge>
                      ) : item.notificada_em ? (
                        <Badge variant="outline"
                          className="gap-1 border-amber-300 bg-amber-50 text-amber-700">
                          <Radio className="h-3 w-3" />
                          Aguardando ciência
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {item.sms_checkpoints?.nome ?? "Checkpoint"} · {item.obras?.nome ?? "Obra"} · {dateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="font-medium">
                      {Number(item.velocidade_kmh).toFixed(0)} km/h em zona de {item.limite_kmh} km/h
                      <span className="ml-2 text-sm font-normal text-destructive">
                        (+{Number(item.excesso_kmh).toFixed(0)} km/h · {Number(item.excesso_percentual).toFixed(0)}% acima)
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.vehicles
                        ? `${item.vehicles.placa} — ${item.vehicles.marca} ${item.vehicles.modelo}`
                        : "Veículo não identificado (tag desconhecida)"}
                      {item.employees ? ` · Responsável: ${item.employees.nome}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setInfracaoSelecionada(item)}>
                      <Eye className="mr-1.5 h-3.5 w-3.5" />Detalhes
                    </Button>
                    {!item.desvio_id && item.status !== "encerrada" && (
                      <Button size="sm" variant="outline" disabled={busy === item.id}
                        onClick={() => escalarParaDesvio(item.id)}>
                        Gerar desvio SMS
                      </Button>
                    )}
                    {!item.notificada_em && item.status !== "encerrada" && (
                      <Button size="sm" variant="outline" disabled={busy === item.id}
                        onClick={() => notificarMotorista(item.id, !!item.employees)}>
                        Notificar motorista
                      </Button>
                    )}
                    {item.status !== "encerrada" && (
                      <Button size="sm" disabled={busy === item.id}
                        onClick={() => setInfracaoSelecionada(item)}>
                        <Wrench className="mr-1.5 h-3.5 w-3.5" />Tratar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </TabsContent>

          {/* ── Passagens ────────────────────────────────────────── */}
          <TabsContent value="passagens" className="mt-4">
            <div className="mb-4 flex justify-end">
              <RegistroManualDialog
                open={registroManualOpen}
                onOpenChange={setRegistroManualOpen}
                checkpoints={checkpoints.filter(c => c.ativo)}
                vehicles={vehicles}
                onSaved={load}
              />
            </div>
            <div className="divide-y">
              {!loading && !passagens.length && (
                <Empty text="Nenhuma passagem registrada ainda." icon={Gauge} />
              )}
              {passagens.map(p => {
                const excedeu = Number(p.velocidade_kmh) > p.limite_no_momento;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${excedeu ? "text-destructive" : "text-emerald-600"}`}>
                          {Number(p.velocidade_kmh).toFixed(0)} km/h
                        </span>
                        <span className="text-xs text-muted-foreground">/ {p.limite_no_momento} km/h</span>
                        {p.origem === "manual" && <Badge variant="outline" className="text-[10px]">Manual</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {p.vehicles?.placa ?? (p.tag_epc ? `Tag ${p.tag_epc}` : "Não identificado")}
                        {" · "}{p.sms_checkpoints?.nome ?? "—"}
                        {p.sentido && p.sentido !== "indefinido" ? ` · ${p.sentido}` : ""}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {dateTime(p.detectado_em)}
                    </span>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Checkpoints ──────────────────────────────────────── */}
          <TabsContent value="checkpoints" className="mt-4">
            <div className="mb-4 flex justify-end">
              <CheckpointDialog
                open={novoCheckpointOpen}
                onOpenChange={setNovoCheckpointOpen}
                obras={obras}
                onSaved={load}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {!loading && !checkpoints.length && (
                <div className="md:col-span-2">
                  <Empty text="Nenhum checkpoint cadastrado. Crie o primeiro ponto de medição." icon={MapPin} />
                </div>
              )}
              {checkpoints.map(cp => {
                const online = isOnline(cp.device_ultimo_contato, cp.heartbeat_intervalo_seg);
                const calibracaoVencida = !cp.calibracao_valida_ate || new Date(cp.calibracao_valida_ate + "T23:59:59") < new Date();
                return (
                  <div key={cp.id} className={`rounded-xl border p-4 ${cp.ativo ? "bg-card" : "bg-muted/40 opacity-70"}`}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{cp.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {cp.obras?.nome ?? "—"}{cp.descricao ? ` · ${cp.descricao}` : ""}
                        </p>
                      </div>
                      <Badge className={online
                        ? "gap-1 border-0 bg-green-100 text-green-700"
                        : "gap-1 border-0 bg-gray-100 text-gray-500"}>
                        {online ? <><Wifi className="h-3 w-3" />Online</> : <><WifiOff className="h-3 w-3" />Offline</>}
                      </Badge>
                      <Badge variant="outline" className={calibracaoVencida ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}>
                        {calibracaoVencida ? "Calibração pendente" : `Calibrado até ${new Date(cp.calibracao_valida_ate! + "T12:00:00").toLocaleDateString("pt-BR")}`}
                      </Badge>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-4 text-sm">
                      <div>
                        <p className="text-lg font-bold leading-none">{cp.limite_velocidade_kmh}<span className="text-xs font-normal"> km/h</span></p>
                        <p className="text-[11px] text-muted-foreground">limite da zona</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold leading-none">+{cp.tolerancia_kmh}<span className="text-xs font-normal"> km/h</span></p>
                        <p className="text-[11px] text-muted-foreground">tolerância</p>
                      </div>
                      {cp.latitude != null && cp.longitude != null && (
                        <a
                          href={`https://www.google.com/maps?q=${cp.latitude},${cp.longitude}&z=16`}
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 self-end text-xs text-sky-600 hover:underline"
                        >
                          <MapPin className="h-3.5 w-3.5" />Ver no mapa
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="h-7 gap-1.5 text-xs">
                        <ShieldAlert className="h-3 w-3" />Credencial protegida{cp.device_token_hint ? ` · •••${cp.device_token_hint}` : ""}
                      </Badge>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                        onClick={() => setCheckpointConfig(cp)}>
                        <Copy className="h-3 w-3" />Configurar Raspberry
                      </Button>
                      <Button size="sm" variant={cp.ativo ? "outline" : "default"}
                        className="h-7 text-xs" disabled={busy === cp.id}
                        onClick={() => toggleCheckpoint(cp)}>
                        {cp.ativo ? "Desativar" : "Ativar"}
                      </Button>
                      {cp.device_ultimo_contato && (
                        <span className="text-[11px] text-muted-foreground">
                          último contato {dateTime(cp.device_ultimo_contato)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Tags RFID ────────────────────────────────────────── */}
          <TabsContent value="tags" className="mt-4">
            <div className="mb-4 flex justify-end">
              <TagRfidDialog
                open={novaTagOpen}
                onOpenChange={setNovaTagOpen}
                vehicles={vehicles}
                onSaved={load}
              />
            </div>
            <div className="divide-y">
              {!loading && !tags.length && (
                <Empty text="Nenhuma tag RFID vinculada. Vincule as etiquetas aos veículos da frota." icon={Radio} />
              )}
              {tags.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{t.tag_epc}</span>
                      <Badge variant={t.ativa ? "default" : "secondary"} className="text-[10px]">
                        {t.ativa ? "Ativa" : "Removida"}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {t.vehicles
                        ? `${t.vehicles.placa} — ${t.vehicles.marca} ${t.vehicles.modelo}`
                        : "Veículo removido"}
                      {t.observacoes ? ` · ${t.observacoes}` : ""}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    desde {new Date(t.data_vinculo + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        <TratativaInfracaoDialog item={infracaoSelecionada}
          vehicles={vehicles} employees={employees}
          onOpenChange={open => !open && setInfracaoSelecionada(null)} onSaved={load} />
        <CredencialCheckpointDialog checkpoint={checkpointConfig}
          onOpenChange={open => !open && setCheckpointConfig(null)} onSaved={load} />
      </div>
    </Layout>
  );
}

function CredencialCheckpointDialog({ checkpoint, onOpenChange, onSaved }: {
  checkpoint: Checkpoint | null; onOpenChange: (open: boolean) => void; onSaved: () => void;
}) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setToken(""), [checkpoint]);

  async function gerar() {
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("sms_rotacionar_token_checkpoint", {
      p_checkpoint_id: checkpoint!.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setToken(data?.device_token ?? "");
    onSaved();
    toast.success("Nova credencial gerada. A anterior foi invalidada.");
  }

  if (!checkpoint) return null;
  return (
    <Dialog open={!!checkpoint} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Configurar Raspberry - {checkpoint.nome}</DialogTitle></DialogHeader>
        {!token ? (
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Atenção antes de gerar</p>
              <p className="mt-1">A credencial atual será invalidada imediatamente. O equipamento ficará offline até a nova credencial ser informada no arquivo <code>.env</code> do Raspberry.</p>
            </div>
            {checkpoint.device_token_hint && <p className="text-sm text-muted-foreground">Credencial atual terminada em <strong>{checkpoint.device_token_hint}</strong>.</p>}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-900">Nova credencial - copie agora</p>
              <p className="mt-1 text-xs text-emerald-800">No Raspberry, defina esta chave como <strong>DEVICE_TOKEN</strong>. Ela não será exibida novamente.</p>
              <code className="mt-3 block break-all rounded bg-white p-3 text-xs select-all">{token}</code>
            </div>
            <Button className="w-full" onClick={() => { navigator.clipboard.writeText(token); toast.success("Token copiado para a área de transferência."); }}>
              <Copy className="mr-2 h-4 w-4" />Copiar token do Raspberry
            </Button>
            <div className="rounded-md bg-muted p-3 text-xs">
              <code>DEVICE_TOKEN={token}</code>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{token ? "Concluir" : "Cancelar"}</Button>
          {!token && <Button onClick={gerar} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar nova credencial
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TratativaInfracaoDialog({ item, vehicles, employees, onOpenChange, onSaved }: {
  item: Infracao | null; vehicles: any[]; employees: any[];
  onOpenChange: (open: boolean) => void; onSaved: () => void;
}) {
  const [tratativa, setTratativa] = useState("");
  const [causa, setCausa] = useState("");
  const [acao, setAcao] = useState("");
  const [saving, setSaving] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");

  useEffect(() => {
    setTratativa(item?.tratativa ?? "");
    setCausa(item?.causa ?? "");
    setAcao(item?.acao_corretiva ?? "");
    setVehicleId(""); setMotoristaId("");
  }, [item]);

  async function identificar() {
    if (!vehicleId) return toast.error("Selecione o veículo identificado.");
    setSaving(true);
    const veiculo = vehicles.find(v => v.id === vehicleId);
    const { error } = await (supabase as any).rpc("sms_identificar_passagem_velocidade", {
      p_passagem_id: item!.passagem_id, p_vehicle_id: vehicleId,
      p_motorista_id: motoristaId || veiculo?.responsavel_id || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Veículo e condutor vinculados ao registro histórico.");
    onOpenChange(false); onSaved();
  }

  async function salvar(status: "em_tratativa" | "encerrada") {
    if (!tratativa.trim()) return toast.error("Descreva a tratativa realizada.");
    if (status === "encerrada" && (!causa.trim() || !acao.trim())) {
      return toast.error("Para encerrar, informe a causa e a ação corretiva.");
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc("sms_tratar_infracao_velocidade", {
      p_infracao_id: item!.id, p_status: status, p_tratativa: tratativa.trim(),
      p_causa: causa.trim() || null, p_acao_corretiva: acao.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(status === "encerrada" ? "Infração encerrada com rastreabilidade." : "Tratativa salva.");
    onOpenChange(false); onSaved();
  }

  if (!item) return null;
  const encerrada = ["encerrada", "cancelada"].includes(item.status);
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Detalhes e tratativa da infração</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
          <div><span className="text-muted-foreground">Veículo</span><p className="font-medium">{item.vehicles?.placa ?? "Não identificado"}</p></div>
          <div><span className="text-muted-foreground">Motorista</span><p className="font-medium">{item.employees?.nome ?? "Não identificado"}</p></div>
          <div><span className="text-muted-foreground">Medição</span><p className="font-medium">{item.velocidade_kmh} km/h (limite {item.limite_kmh})</p></div>
          <div><span className="text-muted-foreground">Local e data</span><p className="font-medium">{item.sms_checkpoints?.nome ?? "—"} · {dateTime(item.created_at)}</p></div>
        </div>
        {!item.vehicles && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Identificar passagem desconhecida</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={vehicleId} onValueChange={v => { setVehicleId(v); const found=vehicles.find(x=>x.id===v); setMotoristaId(found?.responsavel_id ?? ""); }}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione o veículo" /></SelectTrigger>
              <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={motoristaId || "__none"} onValueChange={v => setMotoristaId(v === "__none" ? "" : v)}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Condutor" /></SelectTrigger>
              <SelectContent><SelectItem value="__none">Condutor não identificado</SelectItem>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" disabled={saving || !vehicleId} onClick={identificar}>Vincular ao registro</Button>
        </div>}
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Tratativa <span className="text-destructive">*</span></Label>
            <Textarea disabled={encerrada} value={tratativa} onChange={e => setTratativa(e.target.value)} placeholder="Providências adotadas, orientação e responsáveis..." /></div>
          <div className="space-y-1.5"><Label>Causa identificada</Label>
            <Textarea disabled={encerrada} value={causa} onChange={e => setCausa(e.target.value)} placeholder="Causa imediata e causa raiz..." /></div>
          <div className="space-y-1.5"><Label>Ação corretiva</Label>
            <Textarea disabled={encerrada} value={acao} onChange={e => setAcao(e.target.value)} placeholder="Ação para impedir recorrência..." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {!encerrada && <><Button variant="secondary" disabled={saving} onClick={() => salvar("em_tratativa")}>Salvar andamento</Button>
            <Button disabled={saving} onClick={() => salvar("encerrada")}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Encerrar tratativa</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: novo checkpoint ────────────────────────────────────────

function CheckpointDialog({ open, onOpenChange, obras, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; obras: any[]; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    obra_id: "", nome: "", descricao: "",
    limite_velocidade_kmh: "40", tolerancia_kmh: "5",
    latitude: "", longitude: "", fabricante: "", modelo: "", numero_serie: "",
    calibrado_em: "", calibracao_valida_ate: "",
  });
  const [saving, setSaving] = useState(false);
  const [credencial, setCredencial] = useState("");

  async function salvar() {
    if (!form.obra_id || !form.nome.trim()) {
      return toast.error("Informe a obra e o nome do checkpoint.");
    }
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("sms_criar_checkpoint_velocidade", {
      p_obra_id: form.obra_id, p_nome: form.nome.trim(), p_descricao: form.descricao.trim(),
      p_limite: Number(form.limite_velocidade_kmh), p_tolerancia: Number(form.tolerancia_kmh),
      p_latitude: form.latitude ? Number(form.latitude) : null,
      p_longitude: form.longitude ? Number(form.longitude) : null,
      p_fabricante: form.fabricante.trim() || null, p_modelo: form.modelo.trim() || null,
      p_numero_serie: form.numero_serie.trim() || null,
      p_calibrado_em: form.calibrado_em || null, p_calibracao_valida_ate: form.calibracao_valida_ate || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setCredencial(data?.device_token ?? "");
    toast.success("Checkpoint criado. Guarde a credencial exibida agora.");
    setForm({ obra_id: "", nome: "", descricao: "", limite_velocidade_kmh: "40", tolerancia_kmh: "5", latitude: "", longitude: "", fabricante: "", modelo: "", numero_serie: "", calibrado_em: "", calibracao_valida_ate: "" });
    onSaved();
  }

  const obrasAtivas = obras.filter(o => o.status === "em_andamento" || o.status === "planejada");

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) setCredencial(""); onOpenChange(o); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Novo checkpoint</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Novo checkpoint de velocidade</DialogTitle></DialogHeader>
        {credencial ? <div className="space-y-4 py-2">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">Credencial do equipamento — exibição única</p>
            <p className="mt-1 text-xs text-amber-800">Copie e guarde em local seguro. Ela não poderá ser consultada novamente.</p>
            <code className="mt-3 block break-all rounded bg-white p-3 text-xs">{credencial}</code>
          </div>
          <Button className="w-full" onClick={() => { navigator.clipboard.writeText(credencial); toast.success("Credencial copiada."); }}>
            <Copy className="mr-2 h-4 w-4" />Copiar credencial
          </Button>
        </div> : <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Obra <span className="text-destructive">*</span></Label>
            <Select value={form.obra_id} onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
              <SelectContent>
                {obrasAtivas.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nome do ponto <span className="text-destructive">*</span></Label>
            <Input placeholder="Ex.: Portaria principal, Acesso AG-14"
              value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input placeholder="Referência do local"
              value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Limite (km/h) <span className="text-destructive">*</span></Label>
              <Input type="number" min={5} max={200}
                value={form.limite_velocidade_kmh}
                onChange={e => setForm(f => ({ ...f, limite_velocidade_kmh: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tolerância (km/h)</Label>
              <Input type="number" min={0} max={20}
                value={form.tolerancia_kmh}
                onChange={e => setForm(f => ({ ...f, tolerancia_kmh: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Fabricante</Label><Input value={form.fabricante} onChange={e=>setForm(f=>({...f,fabricante:e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Modelo</Label><Input value={form.modelo} onChange={e=>setForm(f=>({...f,modelo:e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Nº de série</Label><Input value={form.numero_serie} onChange={e=>setForm(f=>({...f,numero_serie:e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Calibrado em</Label><Input type="date" value={form.calibrado_em} onChange={e=>setForm(f=>({...f,calibrado_em:e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Calibração válida até</Label><Input type="date" value={form.calibracao_valida_ate} onChange={e=>setForm(f=>({...f,calibracao_valida_ate:e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Latitude</Label>
              <Input placeholder="-5.1234567"
                value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Longitude</Label>
              <Input placeholder="-38.1234567"
                value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A tolerância evita infrações por margem de erro do radar. Um veículo só é
            autuado acima de <strong>{Number(form.limite_velocidade_kmh || 0) + Number(form.tolerancia_kmh || 0)} km/h</strong>.
          </p>
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{credencial ? "Concluir" : "Cancelar"}</Button>
          {!credencial && <Button onClick={salvar} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</> : "Criar checkpoint"}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: vincular tag RFID ──────────────────────────────────────

/**
 * Converte o que está impresso na etiqueta para o valor que o leitor reporta.
 *
 * A etiqueta Control iD traz três representações do mesmo número:
 *     HEX: 34680F    DEC: 3434511    WG: 052,26639
 *
 * Mas o iDUHF reporta em `card_value` um valor mais largo, com quatro zeros
 * entre o facility code e o número do cartão:
 *
 *     etiqueta  34    680F   ->   leitor  34 0000 680F  =  223338326031
 *
 * Sem converter, cadastrar o que está na etiqueta faz toda passagem cair como
 * "veículo não identificado", sem erro nenhum para indicar a causa.
 */
export function normalizarTag(valor: string, formato: FormatoTag): string | null {
  const s = valor.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;

  const montar = (facility: bigint, card: bigint) =>
    (facility > 255n || card > 65535n)
      ? null
      : ((facility << 32n) | card).toString();

  try {
    if (formato === "wiegand") {
      const m = s.match(/^(\d{1,3})[,;.\/-](\d{1,5})$/);
      if (!m) return null;
      return montar(BigInt(m[1]), BigInt(m[2]));
    }
    if (formato === "hex") {
      if (!/^[0-9A-F]{1,8}$/.test(s)) return null;
      const n = BigInt("0x" + s);
      return montar(n >> 16n, n & 0xFFFFn);
    }
    if (formato === "dec") {
      if (!/^\d{1,10}$/.test(s)) return null;
      const n = BigInt(s);
      return montar(n >> 16n, n & 0xFFFFn);
    }
    // Valor bruto, do jeito que o leitor reportou no log
    if (!/^\d{1,20}$/.test(s)) return null;
    return s;
  } catch {
    return null;
  }
}

type FormatoTag = "hex" | "dec" | "wiegand" | "lido";

const FORMATOS: { id: FormatoTag; rotulo: string; exemplo: string }[] = [
  { id: "hex",     rotulo: "HEX (etiqueta)", exemplo: "34680F" },
  { id: "dec",     rotulo: "DEC (etiqueta)", exemplo: "3434511" },
  { id: "wiegand", rotulo: "WG (etiqueta)",  exemplo: "052,26639" },
  { id: "lido",    rotulo: "Valor lido",     exemplo: "223338326031" },
];

function TagRfidDialog({ open, onOpenChange, vehicles, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; vehicles: any[]; onSaved: () => void;
}) {
  const [form, setForm] = useState({ vehicle_id: "", tag_epc: "", observacoes: "" });
  const [formato, setFormato] = useState<FormatoTag>("hex");
  const [saving, setSaving] = useState(false);

  const normalizada = normalizarTag(form.tag_epc, formato);
  const exemplo = FORMATOS.find(f => f.id === formato)!.exemplo;

  async function salvar() {
    if (!form.vehicle_id) return toast.error("Selecione o veículo.");
    if (!normalizada) {
      return toast.error(`Código inválido para o formato escolhido. Exemplo: ${exemplo}`);
    }
    setSaving(true);
    const { error } = await (supabase as any).from("sms_veiculos_rfid").insert({
      vehicle_id: form.vehicle_id,
      tag_epc: normalizada,
      observacoes: [form.observacoes.trim(),
                    formato !== "lido" ? `etiqueta ${formato.toUpperCase()}: ${form.tag_epc.trim().toUpperCase()}` : ""]
                   .filter(Boolean).join(" · ") || null,
    });
    setSaving(false);
    if (error) {
      return toast.error(
        error.code === "23505"
          ? "Esta tag já está vinculada a um veículo."
          : error.message
      );
    }
    toast.success("Tag vinculada ao veículo.");
    setForm({ vehicle_id: "", tag_epc: "", observacoes: "" });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Vincular tag</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Vincular tag RFID a um veículo</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Veículo <span className="text-destructive">*</span></Label>
            <Select value={form.vehicle_id} onValueChange={v => setForm(f => ({ ...f, vehicle_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o veículo..." /></SelectTrigger>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.placa} — {v.marca} {v.modelo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Código da etiqueta <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Select value={formato} onValueChange={v => setFormato(v as FormatoTag)}>
                <SelectTrigger className="w-[150px] flex-shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATOS.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={exemplo}
                className="font-mono"
                value={form.tag_epc}
                onChange={e => setForm(f => ({ ...f, tag_epc: e.target.value }))}
              />
            </div>

            {form.tag_epc.trim() && (
              normalizada ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                  Será salva como <span className="font-mono font-medium">{normalizada}</span>
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  Não parece um código {formato.toUpperCase()} válido. Exemplo: {exemplo}
                </p>
              )
            )}

            <p className="text-xs text-muted-foreground">
              Digite o código como está impresso na etiqueta. O leitor reporta
              num formato mais largo, e o sistema converte — por isso o valor
              salvo é diferente do que você digitou.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input placeholder="Ex.: colada no canto superior do para-brisa"
              value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: registro manual de passagem (modo MVP) ─────────────────

function RegistroManualDialog({ open, onOpenChange, checkpoints, vehicles, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  checkpoints: Checkpoint[]; vehicles: any[]; onSaved: () => void;
}) {
  const [form, setForm] = useState({ checkpoint_id: "", vehicle_id: "", velocidade: "", sentido: "indefinido" });
  const [saving, setSaving] = useState(false);

  const cpSelecionado = checkpoints.find(c => c.id === form.checkpoint_id);

  async function salvar() {
    if (!form.checkpoint_id || !form.velocidade) {
      return toast.error("Selecione o checkpoint e informe a velocidade medida.");
    }
    if (!cpSelecionado) return;

    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const veiculo = vehicles.find(v => v.id === form.vehicle_id);

    const { error } = await (supabase as any).from("sms_checkpoint_passagens").insert({
      checkpoint_id: form.checkpoint_id,
      vehicle_id: form.vehicle_id || null,
      motorista_id: veiculo?.responsavel_id ?? null,
      velocidade_kmh: Number(form.velocidade),
      limite_no_momento: cpSelecionado.limite_velocidade_kmh,
      sentido: form.sentido,
      origem: "manual",
      registrado_por: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);

    const excedeu = Number(form.velocidade) > cpSelecionado.limite_velocidade_kmh + cpSelecionado.tolerancia_kmh;
    toast.success(excedeu
      ? "Passagem registrada — infração gerada automaticamente."
      : "Passagem registrada dentro do limite.");
    setForm({ checkpoint_id: "", vehicle_id: "", velocidade: "", sentido: "indefinido" });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-3.5 w-3.5" />Registro manual
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar passagem manualmente</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Use enquanto o radar automático não está instalado. A infração é gerada
            pelas mesmas regras do dispositivo.
          </p>
          <div className="space-y-1.5">
            <Label>Checkpoint <span className="text-destructive">*</span></Label>
            <Select value={form.checkpoint_id} onValueChange={v => setForm(f => ({ ...f, checkpoint_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o ponto..." /></SelectTrigger>
              <SelectContent>
                {checkpoints.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} ({c.limite_velocidade_kmh} km/h)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Veículo</Label>
            <Select value={form.vehicle_id} onValueChange={v => setForm(f => ({ ...f, vehicle_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Não identificado" /></SelectTrigger>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.placa} — {v.marca} {v.modelo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Velocidade (km/h) <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} placeholder="55"
                value={form.velocidade}
                onChange={e => setForm(f => ({ ...f, velocidade: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Sentido</Label>
              <Select value={form.sentido} onValueChange={v => setForm(f => ({ ...f, sentido: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="indefinido">Indefinido</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {cpSelecionado && form.velocidade && (
            <p className={`text-xs font-medium ${
              Number(form.velocidade) > cpSelecionado.limite_velocidade_kmh + cpSelecionado.tolerancia_kmh
                ? "text-destructive" : "text-emerald-600"
            }`}>
              {Number(form.velocidade) > cpSelecionado.limite_velocidade_kmh + cpSelecionado.tolerancia_kmh
                ? `Acima do limite — vai gerar infração (teto: ${cpSelecionado.limite_velocidade_kmh + cpSelecionado.tolerancia_kmh} km/h)`
                : "Dentro do limite — passagem normal"}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrando...</> : "Registrar passagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Vencimentos da frota: o que o plano calculou e o que os documentos cobram.
 *
 * Até aqui o plano sabia o que vence, mas o aviso aparecia só no app do
 * motorista — quem agenda a oficina não via nada. Esta tela é o outro lado:
 * lista por criticidade e permite agendar a manutenção já amarrada ao item do
 * plano, de modo que concluí-la zera o contador daquele serviço.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, CalendarPlus, CheckCircle2, FileText, Gauge, Loader2, Plus, Search, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Vencimento = {
  vehicle_id: string;
  placa: string;
  marca: string;
  modelo: string;
  tipo_medicao: string | null;
  plano_nome: string;
  item_id: string;
  servico: string;
  bloqueia_veiculo: boolean;
  km_atual: number;
  horimetro_atual: number;
  proximo_km: number | null;
  proximo_horimetro: number | null;
  proxima_data: string | null;
  km_restante: number | null;
  horas_restantes: number | null;
  dias_restantes: number | null;
  gatilho: "km" | "horas" | "dias";
  situacao: "vencida" | "a_vencer" | "em_dia";
  sem_historico: boolean;
};

type Documento = {
  id: string;
  vehicle_id: string;
  placa: string;
  marca: string;
  modelo: string;
  tipo: string;
  descricao: string | null;
  numero: string | null;
  emissor: string | null;
  data_vencimento: string;
  dias_restantes: number;
  situacao: "vencida" | "a_vencer" | "em_dia";
};

type Veiculo = { id: string; placa: string; marca: string; modelo: string };

const TIPO_DOC: Record<string, string> = {
  crlv: "CRLV / Licenciamento",
  seguro: "Seguro",
  ipva: "IPVA",
  tacografo: "Aferição de tacógrafo",
  inspecao_veicular: "Inspeção veicular",
  rntrc: "RNTRC",
  licenca_ambiental: "Licença ambiental",
  outro: "Outro",
};

const SITUACAO_CFG: Record<string, { label: string; cls: string }> = {
  vencida:  { label: "Vencida",  cls: "bg-red-100 text-red-800 border-red-300" },
  a_vencer: { label: "A vencer", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  em_dia:   { label: "Em dia",   cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

function data(valor: string) {
  return new Date(valor + "T12:00:00").toLocaleDateString("pt-BR");
}

/** O texto que responde "falta quanto?" no gatilho que vence primeiro. */
function faltaTexto(v: Vencimento) {
  const n = (valor: number) => Math.abs(Math.round(valor)).toLocaleString("pt-BR");
  if (v.gatilho === "km" && v.km_restante != null) {
    return v.km_restante <= 0 ? `${n(v.km_restante)} km atrás` : `faltam ${n(v.km_restante)} km`;
  }
  if (v.gatilho === "horas" && v.horas_restantes != null) {
    return v.horas_restantes <= 0 ? `${n(v.horas_restantes)} h atrás` : `faltam ${n(v.horas_restantes)} h`;
  }
  if (v.dias_restantes != null) {
    return v.dias_restantes <= 0 ? `${n(v.dias_restantes)} dia(s) atrás` : `faltam ${n(v.dias_restantes)} dia(s)`;
  }
  return "—";
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function VencimentosFrota({ podeEditar }: { podeEditar: boolean }) {
  const [manutencoes, setManutencoes] = useState<Vencimento[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("pendentes");
  const [agendando, setAgendando] = useState<Vencimento | null>(null);
  const [novoDoc, setNovoDoc] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [venc, docs, veic] = await Promise.all([
      (supabase as any).from("v_manutencao_vencimentos").select("*").order("folga_fracao"),
      (supabase as any).from("v_documentos_vencimentos").select("*").order("data_vencimento"),
      (supabase as any).from("vehicles").select("id,placa,marca,modelo").order("placa"),
    ]);
    const falha = [venc, docs, veic].find((r: any) => r.error)?.error;
    if (falha) toast.error(`Não foi possível carregar os vencimentos: ${falha.message}`);
    setManutencoes((venc.data ?? []) as Vencimento[]);
    setDocumentos((docs.data ?? []) as Documento[]);
    setVeiculos((veic.data ?? []) as Veiculo[]);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const combina = useCallback((texto: string[]) => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return true;
    return texto.some(t => t?.toLocaleLowerCase("pt-BR").includes(termo));
  }, [busca]);

  const porSituacao = (s: string) =>
    filtro === "todos" ? true : filtro === "pendentes" ? s !== "em_dia" : s === filtro;

  const manutencoesFiltradas = useMemo(
    () => manutencoes.filter(v => porSituacao(v.situacao) && combina([v.placa, v.marca, v.modelo, v.servico, v.plano_nome])),
    [manutencoes, filtro, combina],
  );

  const documentosFiltrados = useMemo(
    () => documentos.filter(d => porSituacao(d.situacao) && combina([d.placa, d.marca, d.modelo, TIPO_DOC[d.tipo], d.numero ?? ""])),
    [documentos, filtro, combina],
  );

  const totais = useMemo(() => ({
    vencidas: manutencoes.filter(v => v.situacao === "vencida").length,
    aVencer: manutencoes.filter(v => v.situacao === "a_vencer").length,
    docsVencidos: documentos.filter(d => d.situacao === "vencida").length,
    docsAVencer: documentos.filter(d => d.situacao === "a_vencer").length,
    criticas: manutencoes.filter(v => v.situacao === "vencida" && v.bloqueia_veiculo).length,
  }), [manutencoes, documentos]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Manutenções vencidas", totais.vencidas, totais.vencidas > 0 ? "text-destructive" : ""],
          ["Manutenções a vencer", totais.aVencer, totais.aVencer > 0 ? "text-amber-600" : ""],
          ["Itens críticos vencidos", totais.criticas, totais.criticas > 0 ? "text-destructive" : ""],
          ["Documentos vencidos", totais.docsVencidos, totais.docsVencidos > 0 ? "text-destructive" : ""],
          ["Documentos a vencer", totais.docsAVencer, totais.docsAVencer > 0 ? "text-amber-600" : ""],
        ].map(([rotulo, valor, cls]) => (
          <div key={rotulo as string} className="rounded-xl border bg-card p-3">
            <p className={`text-2xl font-bold leading-none ${cls}`}>{valor as number}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{rotulo as string}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por placa, serviço ou documento"
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pendentes">Vencidas e a vencer</SelectItem>
            <SelectItem value="vencida">Só vencidas</SelectItem>
            <SelectItem value="a_vencer">Só a vencer</SelectItem>
            <SelectItem value="todos">Tudo, inclusive em dia</SelectItem>
          </SelectContent>
        </Select>
        {podeEditar && (
          <Button variant="outline" onClick={() => setNovoDoc(true)}>
            <Plus className="mr-2 h-4 w-4" />Documento
          </Button>
        )}
      </div>

      {/* ── Manutenção ─────────────────────────────────────────────── */}
      <div className="rounded-xl border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Manutenção preventiva</h3>
          <span className="text-xs text-muted-foreground">{manutencoesFiltradas.length} item(ns)</span>
        </div>

        <div className="divide-y">
          {loading && <p className="px-4 py-6 text-sm text-muted-foreground">Carregando...</p>}

          {!loading && !manutencoesFiltradas.length && (
            <div className="px-4 py-10 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {manutencoes.length
                  ? "Nada pendente neste filtro."
                  : "Nenhum vencimento calculado — isso acontece quando ainda não há plano aplicado a veículos."}
              </p>
            </div>
          )}

          {manutencoesFiltradas.map(v => (
            <div key={`${v.vehicle_id}-${v.item_id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{v.placa}</span>
                  <span className="truncate text-sm">{v.servico}</span>
                  <Badge variant="outline" className={SITUACAO_CFG[v.situacao]?.cls}>
                    {SITUACAO_CFG[v.situacao]?.label}
                  </Badge>
                  {v.bloqueia_veiculo && (
                    <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-[10px] text-red-700">
                      <ShieldAlert className="h-3 w-3" />crítico
                    </Badge>
                  )}
                  {v.sem_historico && (
                    <Badge variant="outline" className="text-[10px]">sem histórico</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {v.marca} {v.modelo} · {v.plano_nome} · {faltaTexto(v)} (por {v.gatilho})
                  {v.proxima_data ? ` · previsto para ${data(v.proxima_data)}` : ""}
                </p>
              </div>

              {podeEditar && (
                <Button size="sm" variant={v.situacao === "vencida" ? "default" : "outline"}
                  onClick={() => setAgendando(v)}>
                  <CalendarPlus className="mr-1 h-3.5 w-3.5" />Agendar
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Documentos ─────────────────────────────────────────────── */}
      <div className="rounded-xl border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Documentos do veículo</h3>
          <span className="text-xs text-muted-foreground">{documentosFiltrados.length} item(ns)</span>
        </div>

        <div className="divide-y">
          {!loading && !documentosFiltrados.length && (
            <div className="px-4 py-10 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {documentos.length
                  ? "Nada pendente neste filtro."
                  : "Nenhum documento cadastrado. CRLV, seguro, IPVA e aferição de tacógrafo entram aqui."}
              </p>
            </div>
          )}

          {documentosFiltrados.map(d => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.placa}</span>
                  <span className="truncate text-sm">{TIPO_DOC[d.tipo] ?? d.tipo}</span>
                  <Badge variant="outline" className={SITUACAO_CFG[d.situacao]?.cls}>
                    {SITUACAO_CFG[d.situacao]?.label}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  vence em {data(d.data_vencimento)}
                  {d.dias_restantes < 0
                    ? ` · ${Math.abs(d.dias_restantes)} dia(s) atrás`
                    : ` · faltam ${d.dias_restantes} dia(s)`}
                  {d.numero ? ` · nº ${d.numero}` : ""}
                  {d.emissor ? ` · ${d.emissor}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {agendando && (
        <AgendarManutencao
          vencimento={agendando}
          onClose={() => setAgendando(null)}
          onSaved={() => { setAgendando(null); carregar(); }}
        />
      )}

      {novoDoc && (
        <NovoDocumento
          veiculos={veiculos}
          onClose={() => setNovoDoc(false)}
          onSaved={() => { setNovoDoc(false); carregar(); }}
        />
      )}
    </div>
  );
}

// ─── Agendar a manutenção já amarrada ao item do plano ───────────────────────

function AgendarManutencao({ vencimento, onClose, onSaved }: {
  vencimento: Vencimento; onClose: () => void; onSaved: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataAgendada, setDataAgendada] = useState(
    vencimento.proxima_data && vencimento.proxima_data > hoje ? vencimento.proxima_data : hoje,
  );
  const [oficina, setOficina] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const { data: user } = await supabase.auth.getUser();

    const { error } = await (supabase as any).from("maintenance_records").insert({
      vehicle_id: vencimento.vehicle_id,
      plano_item_id: vencimento.item_id,          // é o que faz concluir zerar o contador do item
      tipo: "preventiva",
      status: "agendada",
      data_agendada: dataAgendada,
      descricao: vencimento.servico,
      quilometragem: vencimento.km_atual || null,
      horimetro: vencimento.horimetro_atual || null,
      oficina: oficina.trim() || null,
      observacoes: observacoes.trim() || null,
      created_by: user?.user?.id,
    });
    setSalvando(false);

    if (error) return toast.error(`Não foi possível agendar: ${error.message}`);
    toast.success(
      "Manutenção agendada e amarrada ao item do plano. " +
      "Ao concluir, o ciclo deste serviço recomeça."
    );
    onSaved();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendar — {vencimento.servico}</DialogTitle>
          <DialogDescription>
            {vencimento.placa} · {vencimento.marca} {vencimento.modelo} · {faltaTexto(vencimento)} (por {vencimento.gatilho})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Data agendada *</Label>
            <Input type="date" value={dataAgendada} onChange={e => setDataAgendada(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Oficina</Label>
            <Input value={oficina} onChange={e => setOficina(e.target.value)} placeholder="Onde será feito" />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)}
              placeholder="O que precisa ser feito além do serviço do plano" />
          </div>

          <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            A medição de hoje fica registrada: {vencimento.km_atual?.toLocaleString("pt-BR")} km
            {vencimento.horimetro_atual ? ` · ${vencimento.horimetro_atual} h` : ""}.
            Ajuste no fechamento da manutenção se a medição mudar até lá.
          </p>

          {vencimento.bloqueia_veiculo && vencimento.situacao === "vencida" && (
            <p className="flex items-start gap-1.5 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Item marcado como crítico e já vencido. Avalie tirar o veículo de operação até o serviço ser feito.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando || !dataAgendada} onClick={salvar}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cadastro de documento ───────────────────────────────────────────────────

function NovoDocumento({ veiculos, onClose, onSaved }: {
  veiculos: Veiculo[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    vehicle_id: "", tipo: "crlv", descricao: "", numero: "", emissor: "",
    data_emissao: "", data_vencimento: "", valor: "", arquivo_url: "", observacoes: "",
  });
  const [salvando, setSalvando] = useState(false);

  const campo = (k: keyof typeof form) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function salvar() {
    if (!form.vehicle_id) return toast.error("Escolha o veículo.");
    if (!form.data_vencimento) return toast.error("Informe o vencimento — é o que gera o alerta.");

    setSalvando(true);
    const { data: user } = await supabase.auth.getUser();

    // Renovação: o anterior do mesmo tipo sai de vigente e fica no histórico.
    const { error: erroAnterior } = await (supabase as any)
      .from("vehicle_documentos")
      .update({ vigente: false })
      .eq("vehicle_id", form.vehicle_id)
      .eq("tipo", form.tipo)
      .eq("vigente", true);

    if (erroAnterior) {
      setSalvando(false);
      return toast.error(`Não foi possível arquivar o documento anterior: ${erroAnterior.message}`);
    }

    const { error } = await (supabase as any).from("vehicle_documentos").insert({
      vehicle_id: form.vehicle_id,
      tipo: form.tipo,
      descricao: form.descricao.trim() || null,
      numero: form.numero.trim() || null,
      emissor: form.emissor.trim() || null,
      data_emissao: form.data_emissao || null,
      data_vencimento: form.data_vencimento,
      valor: form.valor ? Number(form.valor) : null,
      arquivo_url: form.arquivo_url.trim() || null,
      observacoes: form.observacoes.trim() || null,
      created_by: user?.user?.id,
    });
    setSalvando(false);

    if (error) return toast.error(`Não foi possível salvar: ${error.message}`);
    toast.success("Documento cadastrado. O anterior do mesmo tipo foi para o histórico.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Documento do veículo</DialogTitle>
          <DialogDescription>
            Cadastrar de novo o mesmo tipo é renovar: o anterior vai para o histórico e para de alertar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Veículo *</Label>
              <Select value={form.vehicle_id} onValueChange={v => setForm(f => ({ ...f, vehicle_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {veiculos.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_DOC).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <Input type="date" value={form.data_vencimento} onChange={campo("data_vencimento")} />
            </div>
            <div className="space-y-1.5">
              <Label>Emissão</Label>
              <Input type="date" value={form.data_emissao} onChange={campo("data_emissao")} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={form.valor} onChange={campo("valor")} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={form.numero} onChange={campo("numero")} placeholder="Apólice, certificado..." />
            </div>
            <div className="space-y-1.5">
              <Label>Emissor</Label>
              <Input value={form.emissor} onChange={campo("emissor")} placeholder="Detran, seguradora, oficina" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={campo("descricao")} placeholder="Complemento, se houver" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Link do arquivo</Label>
            <Input value={form.arquivo_url} onChange={campo("arquivo_url")} placeholder="https://..." />
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes} onChange={campo("observacoes")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando} onClick={salvar}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Planos de manutenção preventiva.
 *
 * Substitui, para quem tiver plano aplicado, o intervalo único da frota
 * (fleet_config). Cada item do plano tem seu próprio ciclo, e vence o gatilho
 * que chegar primeiro entre km, horas e dias.
 *
 * Ao aplicar o plano a um veículo, o banco grava a linha de base com a medição
 * do momento — é o que faz veículo sem histórico já nascer com vencimento.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList, Plus, Trash2, Wrench, Car, AlertTriangle, Loader2, Power, Gauge,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type PlanoResumo = {
  id: string;
  nome: string;
  descricao: string | null;
  fonte: string | null;
  ativo: boolean;
  itens: number;
  veiculos: number;
  vencidas: number;
  a_vencer: number;
};

type ItemPlano = {
  id?: string;
  servico: string;
  descricao: string;
  intervalo_km: string;
  intervalo_horas: string;
  intervalo_dias: string;
  antecedencia_km: string;
  antecedencia_horas: string;
  antecedencia_dias: string;
  bloqueia_veiculo: boolean;
};

type Veiculo = { id: string; placa: string; marca: string; modelo: string; tipo_medicao: string | null };

const ITEM_VAZIO: ItemPlano = {
  servico: "", descricao: "",
  intervalo_km: "", intervalo_horas: "", intervalo_dias: "",
  antecedencia_km: "500", antecedencia_horas: "20", antecedencia_dias: "15",
  bloqueia_veiculo: false,
};

/** Sugestões de partida — o plano real sai do manual do fabricante. */
const MODELOS_PRONTOS: Record<string, ItemPlano[]> = {
  "Veículo leve": [
    { ...ITEM_VAZIO, servico: "Troca de óleo e filtro de óleo", intervalo_km: "10000", intervalo_dias: "180" },
    { ...ITEM_VAZIO, servico: "Filtro de ar e de combustível", intervalo_km: "20000", intervalo_dias: "365" },
    { ...ITEM_VAZIO, servico: "Revisão de freios", intervalo_km: "20000", intervalo_dias: "365" },
    { ...ITEM_VAZIO, servico: "Alinhamento e balanceamento", intervalo_km: "10000" },
    { ...ITEM_VAZIO, servico: "Correia dentada", intervalo_km: "60000", intervalo_dias: "1460", bloqueia_veiculo: true },
  ],
  "Equipamento por horímetro": [
    { ...ITEM_VAZIO, servico: "Troca de óleo do motor", intervalo_horas: "250", intervalo_dias: "180", antecedencia_horas: "20" },
    { ...ITEM_VAZIO, servico: "Filtros (óleo, ar, combustível)", intervalo_horas: "500", antecedencia_horas: "40" },
    { ...ITEM_VAZIO, servico: "Óleo hidráulico e filtros", intervalo_horas: "1000", antecedencia_horas: "50" },
    { ...ITEM_VAZIO, servico: "Inspeção estrutural e de segurança", intervalo_horas: "500", intervalo_dias: "180", bloqueia_veiculo: true },
  ],
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function PlanosManutencao({ podeEditar }: { podeEditar: boolean }) {
  const [planos, setPlanos] = useState<PlanoResumo[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editorAberto, setEditorAberto] = useState(false);
  const [planoEditando, setPlanoEditando] = useState<PlanoResumo | null>(null);
  const [aplicando, setAplicando] = useState<PlanoResumo | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [res, veic] = await Promise.all([
      (supabase as any).from("v_manutencao_planos_resumo").select("*").order("nome"),
      (supabase as any).from("vehicles").select("id,placa,marca,modelo,tipo_medicao").order("placa"),
    ]);
    if (res.error) toast.error(`Não foi possível carregar os planos: ${res.error.message}`);
    setPlanos((res.data ?? []) as PlanoResumo[]);
    setVeiculos((veic.data ?? []) as Veiculo[]);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function alternarAtivo(plano: PlanoResumo) {
    setBusy(plano.id);
    const { error } = await (supabase as any)
      .from("manutencao_planos").update({ ativo: !plano.ativo }).eq("id", plano.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(plano.ativo
      ? "Plano desativado: os vencimentos dele somem do painel."
      : "Plano ativado.");
    carregar();
  }

  async function excluir(plano: PlanoResumo) {
    if (!window.confirm(
      `Excluir o plano "${plano.nome}"?\n\n` +
      `Os itens e a aplicação em ${plano.veiculos} veículo(s) somem junto. ` +
      "As manutenções já registradas continuam no histórico, sem vínculo com o plano. " +
      "Para parar de usar sem apagar, desative."
    )) return;

    setBusy(plano.id);
    const { error } = await (supabase as any)
      .from("manutencao_planos").delete().eq("id", plano.id);
    setBusy(null);
    if (error) return toast.error(`Não foi possível excluir: ${error.message}`);
    toast.success("Plano excluído.");
    carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Cada item do plano tem ciclo próprio em km, horas ou dias — vence o que chegar primeiro.
          Veículo sem plano continua no intervalo único de Configurações.
        </p>
        {podeEditar && (
          <Button onClick={() => { setPlanoEditando(null); setEditorAberto(true); }}>
            <Plus className="mr-2 h-4 w-4" />Novo plano
          </Button>
        )}
      </div>

      {!loading && !planos.length && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <ClipboardList className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhum plano cadastrado. Enquanto não houver, toda a frota segue o mesmo intervalo.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {planos.map(plano => (
          <div key={plano.id} className={`rounded-xl border p-4 ${plano.ativo ? "bg-card" : "bg-muted/40 opacity-70"}`}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{plano.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {plano.descricao || "Sem descrição"}{plano.fonte ? ` · ${plano.fonte}` : ""}
                </p>
              </div>
              {!plano.ativo && <Badge variant="outline">Inativo</Badge>}
            </div>

            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <div>
                <p className="text-lg font-bold leading-none">{plano.itens}</p>
                <p className="text-[11px] text-muted-foreground">serviços</p>
              </div>
              <div>
                <p className="text-lg font-bold leading-none">{plano.veiculos}</p>
                <p className="text-[11px] text-muted-foreground">veículos</p>
              </div>
              <div>
                <p className={`text-lg font-bold leading-none ${plano.vencidas > 0 ? "text-destructive" : ""}`}>
                  {plano.vencidas}
                </p>
                <p className="text-[11px] text-muted-foreground">vencidas</p>
              </div>
              <div>
                <p className={`text-lg font-bold leading-none ${plano.a_vencer > 0 ? "text-amber-600" : ""}`}>
                  {plano.a_vencer}
                </p>
                <p className="text-[11px] text-muted-foreground">a vencer</p>
              </div>
            </div>

            {plano.itens === 0 && (
              <p className="mb-3 flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                Plano sem serviço nenhum: não gera vencimento até ter ao menos um item.
              </p>
            )}
            {plano.itens > 0 && plano.veiculos === 0 && (
              <p className="mb-3 flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                Nenhum veículo aplicado: o plano existe mas não vale para ninguém.
              </p>
            )}

            {podeEditar && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setPlanoEditando(plano); setEditorAberto(true); }}>
                  <Wrench className="mr-1 h-3.5 w-3.5" />Serviços
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAplicando(plano)}>
                  <Car className="mr-1 h-3.5 w-3.5" />Veículos
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === plano.id} onClick={() => alternarAtivo(plano)}>
                  <Power className="mr-1 h-3.5 w-3.5" />{plano.ativo ? "Desativar" : "Ativar"}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  disabled={busy === plano.id} onClick={() => excluir(plano)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editorAberto && (
        <EditorPlano
          plano={planoEditando}
          onClose={() => setEditorAberto(false)}
          onSaved={() => { setEditorAberto(false); carregar(); }}
        />
      )}

      {aplicando && (
        <AplicarVeiculos
          plano={aplicando}
          veiculos={veiculos}
          onClose={() => setAplicando(null)}
          onSaved={() => { setAplicando(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ─── Editor do plano e dos serviços ──────────────────────────────────────────

function EditorPlano({ plano, onClose, onSaved }: {
  plano: PlanoResumo | null; onClose: () => void; onSaved: () => void;
}) {
  const [nome, setNome] = useState(plano?.nome ?? "");
  const [descricao, setDescricao] = useState(plano?.descricao ?? "");
  const [fonte, setFonte] = useState(plano?.fonte ?? "");
  const [itens, setItens] = useState<ItemPlano[]>([]);
  const [carregando, setCarregando] = useState(Boolean(plano));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!plano) { setItens([{ ...ITEM_VAZIO }]); return; }
    (supabase as any)
      .from("manutencao_plano_itens")
      .select("*").eq("plano_id", plano.id).eq("ativo", true).order("ordem")
      .then(({ data, error }: any) => {
        setCarregando(false);
        if (error) return toast.error(`Não foi possível ler os serviços: ${error.message}`);
        setItens((data ?? []).map((i: any) => ({
          id: i.id,
          servico: i.servico,
          descricao: i.descricao ?? "",
          intervalo_km: i.intervalo_km?.toString() ?? "",
          intervalo_horas: i.intervalo_horas?.toString() ?? "",
          intervalo_dias: i.intervalo_dias?.toString() ?? "",
          antecedencia_km: String(i.antecedencia_km ?? 500),
          antecedencia_horas: String(i.antecedencia_horas ?? 20),
          antecedencia_dias: String(i.antecedencia_dias ?? 15),
          bloqueia_veiculo: Boolean(i.bloqueia_veiculo),
        })));
      });
  }, [plano]);

  const semGatilho = useMemo(
    () => itens.some(i => i.servico.trim() && !i.intervalo_km && !i.intervalo_horas && !i.intervalo_dias),
    [itens],
  );

  const alterar = (idx: number, campo: keyof ItemPlano, valor: any) =>
    setItens(lista => lista.map((item, i) => i === idx ? { ...item, [campo]: valor } : item));

  const numero = (v: string) => v.trim() === "" ? null : Number(v);

  async function salvar() {
    if (!nome.trim()) return toast.error("Dê um nome ao plano.");

    const validos = itens.filter(i => i.servico.trim());
    if (!validos.length) return toast.error("Inclua ao menos um serviço.");
    if (semGatilho) return toast.error("Todo serviço precisa de pelo menos um gatilho: km, horas ou dias.");

    setSalvando(true);
    const valores = { nome: nome.trim(), descricao: descricao.trim() || null, fonte: fonte.trim() || null };

    const { data: salvo, error } = plano
      ? await (supabase as any).from("manutencao_planos").update(valores).eq("id", plano.id).select("id").single()
      : await (supabase as any).from("manutencao_planos").insert(valores).select("id").single();

    if (error || !salvo) {
      setSalvando(false);
      return toast.error(`Não foi possível salvar o plano: ${error?.message ?? "erro desconhecido"}`);
    }

    // Substitui a lista inteira de serviços — mantém a ordem da tela e evita
    // item órfão de uma versão anterior do plano.
    if (plano) {
      const { error: erroLimpeza } = await (supabase as any)
        .from("manutencao_plano_itens").delete().eq("plano_id", salvo.id);
      if (erroLimpeza) {
        setSalvando(false);
        return toast.error(`Não foi possível substituir os serviços: ${erroLimpeza.message}`);
      }
    }

    const { error: erroItens } = await (supabase as any)
      .from("manutencao_plano_itens")
      .insert(validos.map((item, i) => ({
        plano_id: salvo.id,
        ordem: i,
        servico: item.servico.trim(),
        descricao: item.descricao.trim() || null,
        intervalo_km: numero(item.intervalo_km),
        intervalo_horas: numero(item.intervalo_horas),
        intervalo_dias: numero(item.intervalo_dias),
        antecedencia_km: Number(item.antecedencia_km) || 0,
        antecedencia_horas: Number(item.antecedencia_horas) || 0,
        antecedencia_dias: Number(item.antecedencia_dias) || 0,
        bloqueia_veiculo: item.bloqueia_veiculo,
      })));
    setSalvando(false);

    if (erroItens) {
      return toast.error(
        `Plano salvo, mas os serviços falharam: ${erroItens.message}. ` +
        "Reabra o plano e corrija antes de aplicar a veículos."
      );
    }

    toast.success(plano
      ? "Plano atualizado. Os vencimentos passam a valer pelos novos ciclos."
      : "Plano criado. Agora aplique a veículos para ele valer.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plano ? `Serviços — ${plano.nome}` : "Novo plano de manutenção"}</DialogTitle>
          <DialogDescription>
            Cada serviço tem o próprio ciclo. Preencha os gatilhos que fizerem sentido:
            vence o primeiro que chegar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Caminhonete a diesel — uso em obra" />
            </div>
            <div className="space-y-1.5">
              <Label>Fonte</Label>
              <Input value={fonte} onChange={e => setFonte(e.target.value)} placeholder="Manual do fabricante, norma interna" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={2} value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="A que veículos se destina e em que condição de uso" />
          </div>

          {!plano && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <span className="text-xs text-muted-foreground">Começar de um modelo:</span>
              {Object.keys(MODELOS_PRONTOS).map(chave => (
                <Button key={chave} size="sm" variant="outline"
                  onClick={() => setItens(MODELOS_PRONTOS[chave].map(i => ({ ...i })))}>
                  {chave}
                </Button>
              ))}
              <span className="text-[11px] text-muted-foreground">
                Valores de partida — confira no manual do fabricante e no regime de uso.
              </span>
            </div>
          )}

          {carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando serviços...
            </p>
          ) : (
            <div className="space-y-3">
              {itens.map((item, idx) => (
                <div key={idx} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-start gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Serviço *</Label>
                      <Input value={item.servico} onChange={e => alterar(idx, "servico", e.target.value)}
                        placeholder="Ex.: Troca de óleo e filtro" />
                    </div>
                    <Button size="icon" variant="ghost" className="mt-6 text-destructive hover:text-destructive"
                      onClick={() => setItens(lista => lista.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">A cada (km)</Label>
                      <Input type="number" min={100} value={item.intervalo_km}
                        onChange={e => alterar(idx, "intervalo_km", e.target.value)} placeholder="10000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">A cada (horas)</Label>
                      <Input type="number" min={10} value={item.intervalo_horas}
                        onChange={e => alterar(idx, "intervalo_horas", e.target.value)} placeholder="250" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">A cada (dias)</Label>
                      <Input type="number" min={1} value={item.intervalo_dias}
                        onChange={e => alterar(idx, "intervalo_dias", e.target.value)} placeholder="180" />
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Avisar com (km)</Label>
                      <Input type="number" min={0} value={item.antecedencia_km}
                        onChange={e => alterar(idx, "antecedencia_km", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Avisar com (horas)</Label>
                      <Input type="number" min={0} value={item.antecedencia_horas}
                        onChange={e => alterar(idx, "antecedencia_horas", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Avisar com (dias)</Label>
                      <Input type="number" min={0} value={item.antecedencia_dias}
                        onChange={e => alterar(idx, "antecedencia_dias", e.target.value)} />
                    </div>
                    <label className="mt-6 flex items-center gap-2 text-xs">
                      <Checkbox checked={item.bloqueia_veiculo}
                        onCheckedChange={v => alterar(idx, "bloqueia_veiculo", Boolean(v))} />
                      Parar o veículo se vencer
                    </label>
                  </div>

                  {item.servico.trim() && !item.intervalo_km && !item.intervalo_horas && !item.intervalo_dias && (
                    <p className="mt-2 text-[11px] text-destructive">
                      Sem gatilho nenhum este serviço nunca vence.
                    </p>
                  )}
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={() => setItens(lista => [...lista, { ...ITEM_VAZIO }])}>
                <Plus className="mr-1 h-3.5 w-3.5" />Adicionar serviço
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando || carregando} onClick={salvar}>
            {(salvando || carregando) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {plano ? "Salvar serviços" : "Criar plano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Aplicação a veículos ────────────────────────────────────────────────────

function AplicarVeiculos({ plano, veiculos, onClose, onSaved }: {
  plano: PlanoResumo; veiculos: Veiculo[]; onClose: () => void; onSaved: () => void;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [originais, setOriginais] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from("manutencao_plano_veiculos").select("vehicle_id").eq("plano_id", plano.id)
      .then(({ data, error }: any) => {
        setCarregando(false);
        if (error) return toast.error(`Não foi possível ler os veículos do plano: ${error.message}`);
        const ids = new Set<string>((data ?? []).map((r: any) => r.vehicle_id));
        setSelecionados(new Set(ids));
        setOriginais(ids);
      });
  }, [plano.id]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return veiculos;
    return veiculos.filter(v =>
      [v.placa, v.marca, v.modelo].some(c => c?.toLocaleLowerCase("pt-BR").includes(termo)));
  }, [busca, veiculos]);

  async function salvar() {
    const incluir = [...selecionados].filter(id => !originais.has(id));
    const remover = [...originais].filter(id => !selecionados.has(id));

    if (!incluir.length && !remover.length) { onClose(); return; }

    setSalvando(true);

    if (remover.length) {
      const { error } = await (supabase as any)
        .from("manutencao_plano_veiculos").delete()
        .eq("plano_id", plano.id).in("vehicle_id", remover);
      if (error) {
        setSalvando(false);
        return toast.error(`Não foi possível remover: ${error.message}`);
      }
    }

    if (incluir.length) {
      // base_km e base_horimetro ficam em branco de propósito: o banco preenche
      // com a medição atual do veículo, então o ciclo começa de hoje.
      const { error } = await (supabase as any)
        .from("manutencao_plano_veiculos")
        .insert(incluir.map(vehicle_id => ({ plano_id: plano.id, vehicle_id })));
      if (error) {
        setSalvando(false);
        return toast.error(`Não foi possível aplicar: ${error.message}`);
      }
    }

    setSalvando(false);
    toast.success(
      `Plano em ${selecionados.size} veículo(s). ` +
      "Para quem entrou agora, o ciclo conta a partir da medição de hoje."
    );
    onSaved();
  }

  const alternar = (id: string) =>
    setSelecionados(atual => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Veículos do plano — {plano.nome}</DialogTitle>
          <DialogDescription>
            Ao incluir um veículo, o ciclo começa a contar da medição atual dele; ao remover,
            os vencimentos deste plano deixam de valer, e o histórico de manutenção fica.
          </DialogDescription>
        </DialogHeader>

        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por placa, marca ou modelo" />

        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando...
          </p>
        ) : (
          <div className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
            {filtrados.map(v => (
              <label key={v.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                <Checkbox checked={selecionados.has(v.id)} onCheckedChange={() => alternar(v.id)} />
                <span className="font-medium">{v.placa}</span>
                <span className="flex-1 truncate text-sm text-muted-foreground">{v.marca} {v.modelo}</span>
                {v.tipo_medicao === "horimetro" && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Gauge className="h-3 w-3" />horímetro
                  </Badge>
                )}
              </label>
            ))}
            {!filtrados.length && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum veículo encontrado.</p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{selecionados.size} veículo(s) selecionado(s)</p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando || carregando} onClick={salvar}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

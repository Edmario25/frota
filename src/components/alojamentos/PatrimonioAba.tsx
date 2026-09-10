import { useMemo, useState } from "react";
import { Archive, History, Loader2, MoveRight, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Dados, ESTADO_BEM, dataHora, localDoBem } from "./shared";

interface Props {
  dados: Dados;
  unidadeIds: Set<string>;
  onNovo: () => void;
  onMover: (bem: any) => void;
  onRecarregar: () => void;
}

const TIPO_MOV: Record<string, string> = {
  cadastro: "Cadastro", transferencia: "Transferência", estado: "Mudança de estado",
  baixa: "Baixa", reativacao: "Reativação",
};

export function PatrimonioAba({ dados, unidadeIds, onNovo, onMover, onRecarregar }: Props) {
  const [busca, setBusca] = useState("");
  const [estado, setEstado] = useState("todos");
  const [situacao, setSituacao] = useState<"ativos" | "baixados">("ativos");
  const [historicoDe, setHistoricoDe] = useState<any>(null);
  const [historico, setHistorico] = useState<any[] | null>(null);
  const [baixaDe, setBaixaDe] = useState<any>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.bens
      .filter(b => unidadeIds.has(b.alojamento_id))
      .filter(b => (situacao === "ativos" ? b.ativo : !b.ativo))
      .filter(b => estado === "todos" || b.estado === estado)
      .filter(b => !t || [b.tombamento, b.descricao, b.categoria, b.numero_serie, localDoBem(b, dados)]
        .some(v => String(v ?? "").toLowerCase().includes(t)))
      .sort((a, b) => String(a.tombamento).localeCompare(String(b.tombamento), "pt-BR", { numeric: true }));
  }, [dados, unidadeIds, busca, estado, situacao]);

  const valorTotal = lista.reduce((s, b) => s + Number(b.valor_aquisicao ?? 0), 0);

  async function abrirHistorico(bem: any) {
    setHistoricoDe(bem);
    setHistorico(null);
    const { data, error } = await (supabase as any)
      .from("alojamento_bem_movimentacoes").select("*")
      .eq("bem_id", bem.id).order("ocorrido_em", { ascending: false });
    if (error) toast.error(error.message);
    setHistorico(data ?? []);
  }

  async function confirmarBaixaOuReativacao() {
    if (motivo.trim().length < 3) return toast.error("Informe o motivo.");
    setSalvando(true);
    const { error } = baixaDe.ativo
      ? await (supabase as any).rpc("alojamento_baixar_bem", { p_bem: baixaDe.id, p_motivo: motivo.trim(), p_estado: "inservivel" })
      : await (supabase as any).rpc("alojamento_reativar_bem", { p_bem: baixaDe.id, p_motivo: motivo.trim() });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(baixaDe.ativo ? "Bem baixado do patrimônio." : "Bem reativado.");
    setBaixaDe(null);
    setMotivo("");
    onRecarregar();
  }

  const nomeLocal = (alojamento?: string, ambiente?: string, leito?: string) =>
    alojamento ? localDoBem({ alojamento_id: alojamento, ambiente_id: ambiente, leito_id: leito }, dados) : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Tombamento, descrição, série ou local" className="h-9 pl-8" />
        </div>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="h-9 md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os estados</SelectItem>
            {Object.entries(ESTADO_BEM).filter(([k]) => k !== "ausente").map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={situacao} onValueChange={v => setSituacao(v as any)}>
          <SelectTrigger className="h-9 md:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos</SelectItem>
            <SelectItem value="baixados">Baixados</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9" onClick={onNovo}><Plus className="mr-1.5 h-4 w-4" />Novo bem</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {lista.length} {lista.length === 1 ? "bem" : "bens"} · valor de aquisição {valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Tombamento</th>
              <th className="p-3 font-medium">Descrição</th>
              <th className="p-3 font-medium">Local</th>
              <th className="p-3 font-medium">Estado</th>
              <th className="p-3 text-right font-medium">Valor</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {lista.map(b => (
              <tr key={b.id} className="border-t align-top">
                <td className="p-3 font-mono text-xs">{b.tombamento}</td>
                <td className="p-3">
                  <p className="font-medium">{b.descricao}</p>
                  <p className="text-xs text-muted-foreground">{[b.categoria, b.numero_serie && `S/N ${b.numero_serie}`].filter(Boolean).join(" · ") || "Sem categoria"}</p>
                </td>
                <td className="p-3 text-xs">{localDoBem(b, dados)}</td>
                <td className="p-3">
                  <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-medium", ESTADO_BEM[b.estado]?.cls)}>
                    {ESTADO_BEM[b.estado]?.label ?? b.estado}
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums">
                  {b.valor_aquisicao ? Number(b.valor_aquisicao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    {b.ativo && (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => onMover(b)}>
                        <MoveRight className="mr-1 h-3.5 w-3.5" />Mover
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Histórico" onClick={() => abrirHistorico(b)}>
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title={b.ativo ? "Dar baixa" : "Reativar"}
                      onClick={() => { setBaixaDe(b); setMotivo(""); }}>
                      {b.ativo ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lista.length && <p className="p-10 text-center text-sm text-muted-foreground">Nenhum bem encontrado.</p>}
      </div>

      {/* Histórico do bem */}
      <Dialog open={!!historicoDe} onOpenChange={o => !o && setHistoricoDe(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Histórico · {historicoDe?.tombamento}</DialogTitle></DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">{historicoDe?.descricao}</p>
          {historico === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !historico.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem movimentações registradas.</p>
          ) : (
            <ol className="relative space-y-4 border-l pl-5">
              {historico.map(h => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                  <p className="text-sm font-medium">{TIPO_MOV[h.tipo] ?? h.tipo}</p>
                  <p className="text-xs text-muted-foreground">{dataHora(h.ocorrido_em)}</p>
                  {h.tipo === "transferencia" && (
                    <p className="mt-1 text-xs">
                      {nomeLocal(h.alojamento_origem_id, h.ambiente_origem_id, h.leito_origem_id)}
                      <span className="mx-1 text-muted-foreground">→</span>
                      {nomeLocal(h.alojamento_destino_id, h.ambiente_destino_id, h.leito_destino_id)}
                    </p>
                  )}
                  {h.tipo === "cadastro" && <p className="mt-1 text-xs">{nomeLocal(h.alojamento_destino_id, h.ambiente_destino_id, h.leito_destino_id)}</p>}
                  {h.estado_anterior && h.estado_novo && h.estado_anterior !== h.estado_novo && (
                    <p className="mt-1 text-xs">Estado: {ESTADO_BEM[h.estado_anterior]?.label ?? h.estado_anterior} → {ESTADO_BEM[h.estado_novo]?.label ?? h.estado_novo}</p>
                  )}
                  {h.motivo && <p className="mt-1 text-xs text-muted-foreground">{h.motivo}</p>}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>

      {/* Baixa / reativação */}
      <Dialog open={!!baixaDe} onOpenChange={o => !o && setBaixaDe(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{baixaDe?.ativo ? "Dar baixa no bem" : "Reativar bem"}</DialogTitle></DialogHeader>
          <p className="text-sm">
            <strong>{baixaDe?.descricao}</strong> <span className="font-mono text-xs text-muted-foreground">{baixaDe?.tombamento}</span>
          </p>
          {baixaDe?.ativo && (
            <p className="text-xs text-muted-foreground">
              O bem sai do inventário ativo e dos termos de entrada e saída, mas continua no histórico.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder={baixaDe?.ativo ? "Ex.: dano irreparável, furto registrado em BO, obsolescência" : "Ex.: reparo concluído"} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaDe(null)}>Cancelar</Button>
            <Button variant={baixaDe?.ativo ? "destructive" : "default"} disabled={salvando} onClick={confirmarBaixaOuReativacao}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {baixaDe?.ativo ? "Dar baixa" : "Reativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

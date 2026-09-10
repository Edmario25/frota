import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Dados, PRIORIDADE, STATUS_CHAMADO, TIPO_CHAMADO, dataHora } from "./shared";

interface Props {
  dados: Dados;
  unidadeIds: Set<string>;
  employees: any[];
  onNovo: () => void;
  onRecarregar: () => void;
}

const ABERTOS = ["aberto", "triagem", "em_andamento", "aguardando"];

export function ChamadosAba({ dados, unidadeIds, employees, onNovo, onRecarregar }: Props) {
  const [visao, setVisao] = useState<"abertos" | "encerrados">("abertos");
  const [concluindo, setConcluindo] = useState<any>(null);
  const [conclusao, setConclusao] = useState("");
  const [custo, setCusto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const agora = Date.now();
  const lista = useMemo(() => dados.chamados
    .filter(c => unidadeIds.has(c.alojamento_id))
    .filter(c => (visao === "abertos" ? ABERTOS.includes(c.status) : !ABERTOS.includes(c.status)))
    .sort((a, b) => {
      const ordem = ["critica", "alta", "media", "baixa"];
      return visao === "abertos"
        ? ordem.indexOf(a.prioridade) - ordem.indexOf(b.prioridade) || String(a.prazo ?? "9").localeCompare(String(b.prazo ?? "9"))
        : String(b.concluido_em ?? b.updated_at).localeCompare(String(a.concluido_em ?? a.updated_at));
    }), [dados.chamados, unidadeIds, visao]);

  const encerrados = dados.chamados.filter(c => unidadeIds.has(c.alojamento_id) && c.status === "concluido" && c.concluido_em);
  const tempoMedioH = encerrados.length
    ? encerrados.reduce((s, c) => s + (new Date(c.concluido_em).getTime() - new Date(c.created_at).getTime()), 0) / encerrados.length / 36e5
    : null;
  const vencidos = dados.chamados.filter(c => unidadeIds.has(c.alojamento_id) && ABERTOS.includes(c.status) && c.prazo && new Date(c.prazo).getTime() < agora).length;

  async function atualizar(c: any, campos: Record<string, any>, msg: string) {
    const { error } = await (supabase as any).from("alojamento_chamados").update(campos).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(msg);
    onRecarregar();
  }

  async function concluir() {
    if (conclusao.trim().length < 3) return toast.error("Descreva o que foi feito.");
    setSalvando(true);
    await atualizar(concluindo, {
      status: "concluido", concluido_em: new Date().toISOString(),
      conclusao: conclusao.trim(), custo: custo ? Number(custo) : null,
    }, "Chamado concluído.");
    setSalvando(false);
    setConcluindo(null);
  }

  const local = (c: any) => {
    const u = dados.unidades.find(x => x.id === c.alojamento_id)?.nome;
    const a = c.ambiente_id ? dados.ambientes.find(x => x.id === c.ambiente_id)?.nome : null;
    return [u, a].filter(Boolean).join(" › ");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["abertos", "encerrados"] as const).map(v => (
            <button key={v} onClick={() => setVisao(v)}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium",
                visao === v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
              {v === "abertos" ? "Em aberto" : "Encerrados"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {vencidos > 0 && <span className="flex items-center gap-1 font-medium text-red-600"><AlertTriangle className="h-3.5 w-3.5" />{vencidos} vencidos</span>}
          {tempoMedioH != null && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Tempo médio {tempoMedioH < 48 ? `${tempoMedioH.toFixed(1)} h` : `${(tempoMedioH / 24).toFixed(1)} dias`}</span>}
          <Button size="sm" onClick={onNovo}><Plus className="mr-1.5 h-4 w-4" />Abrir chamado</Button>
        </div>
      </div>

      <div className="divide-y rounded-lg border">
        {!lista.length && <p className="p-10 text-center text-sm text-muted-foreground">
          {visao === "abertos" ? "Nenhum chamado em aberto." : "Nenhum chamado encerrado."}
        </p>}
        {lista.map(c => {
          const vencido = ABERTOS.includes(c.status) && c.prazo && new Date(c.prazo).getTime() < agora;
          return (
            <div key={c.id} className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", PRIORIDADE[c.prioridade]?.cls)}>
                    {PRIORIDADE[c.prioridade]?.label ?? c.prioridade}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{TIPO_CHAMADO[c.tipo] ?? c.tipo} · {local(c)}</span>
                </div>
                <p className="mt-1 font-medium">{c.titulo}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{c.conclusao ?? c.descricao}</p>
                <p className={cn("mt-1 text-[11px]", vencido ? "font-medium text-red-600" : "text-muted-foreground")}>
                  Aberto {dataHora(c.created_at)}
                  {c.prazo && ` · prazo ${dataHora(c.prazo)}`}
                  {c.concluido_em && ` · concluído ${dataHora(c.concluido_em)}`}
                  {c.custo != null && ` · ${Number(c.custo).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                </p>
              </div>
              {ABERTOS.includes(c.status) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={c.responsavel_id ?? "__"} onValueChange={v => atualizar(c, { responsavel_id: v === "__" ? null : v }, "Responsável definido.")}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__">Sem responsável</SelectItem>
                      {employees.filter(e => e.status === "ativo").map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={c.status} onValueChange={v => v === "concluido"
                    ? (setConcluindo(c), setConclusao(""), setCusto(""))
                    : atualizar(c, { status: v }, "Situação atualizada.")}>
                    <SelectTrigger className={cn("h-8 w-36 border-0 text-xs font-medium", STATUS_CHAMADO[c.status]?.cls)}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CHAMADO).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className={cn("self-start rounded px-2 py-1 text-xs font-medium lg:self-center", STATUS_CHAMADO[c.status]?.cls)}>
                  {STATUS_CHAMADO[c.status]?.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!concluindo} onOpenChange={o => !o && setConcluindo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Concluir chamado</DialogTitle></DialogHeader>
          <p className="text-sm font-medium">{concluindo?.titulo}</p>
          <div className="space-y-1.5">
            <Label>O que foi feito</Label>
            <Textarea value={conclusao} onChange={e => setConclusao(e.target.value)} placeholder="Ex.: filtro do ar limpo e gás recarregado" />
          </div>
          <div className="space-y-1.5">
            <Label>Custo (opcional)</Label>
            <Input type="number" min="0" step="0.01" value={custo} onChange={e => setCusto(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConcluindo(null)}>Cancelar</Button>
            <Button onClick={concluir} disabled={salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

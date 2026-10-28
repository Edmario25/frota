/**
 * Vencimentos do plano, dentro do veículo.
 *
 * A tela de Manutenção da frota mostra tudo que vence no parque. Aqui é o
 * recorte de um veículo só, na aba onde quem abre a ficha já estava olhando:
 * o que este carro deve, quanto falta, e o botão que agenda amarrado ao item
 * do plano — porque é esse vínculo que faz concluir a manutenção recomeçar o
 * ciclo daquele serviço.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CalendarPlus, CheckCircle2, Gauge, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Vencimento = {
  vehicle_id: string;
  placa: string;
  plano_nome: string;
  item_id: string;
  servico: string;
  bloqueia_veiculo: boolean;
  km_atual: number;
  horimetro_atual: number;
  proxima_data: string | null;
  km_restante: number | null;
  horas_restantes: number | null;
  dias_restantes: number | null;
  gatilho: "km" | "horas" | "dias";
  situacao: "vencida" | "a_vencer" | "em_dia";
  sem_historico: boolean;
};

const num = (v: number) => Math.round(v).toLocaleString("pt-BR");

/** O que falta, na unidade do gatilho que vence primeiro. */
function restante(v: Vencimento) {
  if (v.gatilho === "km" && v.km_restante != null) {
    return v.km_restante < 0 ? `${num(-v.km_restante)} km vencidos` : `faltam ${num(v.km_restante)} km`;
  }
  if (v.gatilho === "horas" && v.horas_restantes != null) {
    return v.horas_restantes < 0 ? `${num(-v.horas_restantes)} h vencidas` : `faltam ${num(v.horas_restantes)} h`;
  }
  if (v.dias_restantes != null) {
    return v.dias_restantes < 0 ? `${num(-v.dias_restantes)} dias vencidos` : `faltam ${num(v.dias_restantes)} dias`;
  }
  return "";
}

export function VencimentosVeiculo({
  vehicleId,
  podeEditar = true,
  onAgendado,
}: {
  vehicleId: string;
  podeEditar?: boolean;
  onAgendado?: () => void;
}) {
  const [itens, setItens] = useState<Vencimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [agendando, setAgendando] = useState<Vencimento | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await (supabase as any)
      .from("v_manutencao_vencimentos")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("folga_fracao", { ascending: true });
    setCarregando(false);
    if (error) {
      // Banco sem a migration do plano: a aba continua útil sem este bloco.
      setItens([]);
      return;
    }
    setItens((data as Vencimento[]) ?? []);
  }, [vehicleId]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando o plano deste veículo...
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Nenhum plano de manutenção aplicado a este veículo — ele segue o intervalo único das
        Configurações. Para criar um plano por serviço, use <strong>Manutenção da Frota → Planos</strong>.
      </div>
    );
  }

  const vencidas = itens.filter((i) => i.situacao === "vencida");
  const aVencer = itens.filter((i) => i.situacao === "a_vencer");

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Plano: {itens[0].plano_nome}</span>
        {vencidas.length > 0 && (
          <Badge variant="destructive">{vencidas.length} vencida(s)</Badge>
        )}
        {aVencer.length > 0 && (
          <Badge variant="outline" className="border-amber-300 text-amber-700">
            {aVencer.length} a vencer
          </Badge>
        )}
        {vencidas.length === 0 && aVencer.length === 0 && (
          <Badge variant="outline" className="border-green-300 text-green-700 gap-1">
            <CheckCircle2 className="h-3 w-3" /> em dia
          </Badge>
        )}
      </div>

      <div className="divide-y">
        {itens.map((item) => (
          <div key={item.item_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{item.servico}</span>
                {item.bloqueia_veiculo && (
                  <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-label="Item crítico" />
                )}
                {item.situacao === "vencida" && (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {restante(item)}
                {item.sem_historico && " · contando da data em que o plano foi aplicado"}
              </p>
            </div>
            {podeEditar && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                      onClick={() => setAgendando(item)}>
                <CalendarPlus className="h-3.5 w-3.5" /> Agendar
              </Button>
            )}
          </div>
        ))}
      </div>

      {agendando && (
        <AgendarVencimento
          vencimento={agendando}
          onClose={() => setAgendando(null)}
          onSaved={() => { setAgendando(null); void carregar(); onAgendado?.(); }}
        />
      )}
    </div>
  );
}

function AgendarVencimento({
  vencimento, onClose, onSaved,
}: {
  vencimento: Vencimento;
  onClose: () => void;
  onSaved: () => void;
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
    toast.success("Manutenção agendada e amarrada ao item do plano. Ao concluir, o ciclo deste serviço recomeça.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar {vencimento.servico}</DialogTitle>
          <DialogDescription>
            {vencimento.placa} · {restante(vencimento)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="vv-data">Data</Label>
            <Input id="vv-data" type="date" value={dataAgendada}
                   onChange={(e) => setDataAgendada(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vv-oficina">Oficina</Label>
            <Input id="vv-oficina" value={oficina} placeholder="Opcional"
                   onChange={(e) => setOficina(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vv-obs">Observações</Label>
            <Textarea id="vv-obs" rows={2} value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

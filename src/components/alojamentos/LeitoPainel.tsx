import { useEffect, useState } from "react";
import {
  ArrowLeftRight, CalendarClock, History, LogIn, LogOut, MoveRight, Package,
  Plus, ShieldAlert, Sparkles, UserRound, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CLASSIFICACAO, Dados, ESTADO_BEM, LEITO, dataCurta, dataHora } from "./shared";

export interface AcoesLeito {
  checkin: (leito: any) => void;
  reservar: (leito: any) => void;
  cancelarReserva: (reserva: any) => void;
  checkout: (ocupacao: any) => void;
  transferir: (ocupacao: any) => void;
  ausencia: (ocupacao: any) => void;
  liberar: (leito: any) => void;
  bloquear: (leito: any) => void;
  novoBem: (leito: any) => void;
  moverBem: (bem: any) => void;
}

interface Props {
  leito: any | null;
  onClose: () => void;
  dados: Dados;
  ocupacao?: any;
  reserva?: any;
  nome: (id: string) => string;
  acoes: AcoesLeito;
}

const MOV_LABEL: Record<string, string> = {
  reserva: "Reserva", checkin: "Entrada", transferencia: "Transferência",
  checkout: "Saída", bloqueio: "Bloqueio", liberacao: "Liberação",
};

export function LeitoPainel({ leito, onClose, dados, ocupacao, reserva, nome, acoes }: Props) {
  const [historico, setHistorico] = useState<any[]>([]);

  useEffect(() => {
    if (!leito) return;
    let vivo = true;
    (supabase as any)
      .from("alojamento_movimentacoes")
      .select("id,tipo,motivo,ocorrido_em,ocupacao_id,leito_origem_id,leito_destino_id")
      .or(`leito_origem_id.eq.${leito.id},leito_destino_id.eq.${leito.id}`)
      .order("ocorrido_em", { ascending: false })
      .limit(8)
      .then(({ data }: any) => { if (vivo) setHistorico(data ?? []); });
    return () => { vivo = false; };
  }, [leito?.id, leito?.status]);

  if (!leito) return null;

  const quarto = dados.quartos.find(q => q.id === leito.quarto_id);
  const ambiente = dados.ambientes.find(a => a.id === leito.quarto_id);
  const unidade = dados.unidades.find(u => u.id === ambiente?.alojamento_id);
  const cfg = LEITO[leito.status] ?? LEITO.desativado;
  const bensDoLeito = dados.bens.filter(b => b.ativo && b.leito_id === leito.id);
  const bensDoQuarto = dados.bens.filter(b => b.ativo && b.ambiente_id === leito.quarto_id && !b.leito_id);
  const companheiros = dados.leitos
    .filter(l => l.quarto_id === leito.quarto_id && l.id !== leito.id)
    .map(l => dados.ocupacoes.find(o => !o.data_saida && o.leito_id === l.id))
    .filter(Boolean);
  const ausente = ocupacao?.presenca_status === "ausente_temporariamente";
  const nomeOcupacao = (id: string) => nome(dados.ocupacoes.find(o => o.id === id)?.employee_id);

  return (
    <Sheet open={!!leito} onOpenChange={o => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b p-5 text-left">
          <p className="text-xs text-muted-foreground">
            {unidade?.nome} · {CLASSIFICACAO[quarto?.classificacao]?.label ?? "Quarto"}
          </p>
          <SheetTitle className="flex items-center gap-2 text-xl">
            Quarto {quarto?.identificacao} · Leito {leito.identificacao}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", cfg.suave)}>{cfg.label}</span>
              {leito.motivo_bloqueio && <span className="text-xs text-muted-foreground">{leito.motivo_bloqueio}</span>}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 p-5">
          {/* Ocupante / reserva */}
          <section className="space-y-3">
            {ocupacao ? (
              <div className="rounded-lg border bg-violet-50/50 p-3 dark:bg-violet-950/20">
                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-5 w-5 text-violet-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{nome(ocupacao.employee_id)}</p>
                    <p className="text-xs text-muted-foreground">Desde {dataCurta(ocupacao.data_entrada)}</p>
                    {ausente && (
                      <Badge variant="secondary" className="mt-1.5">
                        Ausente{ocupacao.retorno_previsto ? ` · volta ${dataHora(ocupacao.retorno_previsto)}` : ""}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <Button size="sm" variant="outline" className="bg-background" onClick={() => acoes.ausencia(ocupacao)}>
                    <CalendarClock className="mr-1 h-3.5 w-3.5" />{ausente ? "Retorno" : "Ausência"}
                  </Button>
                  <Button size="sm" variant="outline" className="bg-background" onClick={() => acoes.transferir(ocupacao)}>
                    <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />Transferir
                  </Button>
                  <Button size="sm" onClick={() => acoes.checkout(ocupacao)}>
                    <LogOut className="mr-1 h-3.5 w-3.5" />Saída
                  </Button>
                </div>
              </div>
            ) : reserva ? (
              <div className="rounded-lg border bg-sky-50/50 p-3 dark:bg-sky-950/20">
                <p className="text-xs text-muted-foreground">Reservado para</p>
                <p className="font-semibold">{nome(reserva.employee_id)}</p>
                <p className="text-xs text-muted-foreground">
                  A partir de {new Date(`${reserva.inicio_previsto}T12:00:00`).toLocaleDateString("pt-BR")}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant="outline" className="bg-background" onClick={() => acoes.cancelarReserva(reserva)}>
                    <X className="mr-1 h-3.5 w-3.5" />Cancelar
                  </Button>
                  <Button size="sm" onClick={() => acoes.checkin(leito)}>
                    <LogIn className="mr-1 h-3.5 w-3.5" />Fazer entrada
                  </Button>
                </div>
              </div>
            ) : leito.status === "disponivel" ? (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => acoes.checkin(leito)}><LogIn className="mr-1.5 h-4 w-4" />Entrada</Button>
                <Button variant="outline" onClick={() => acoes.reservar(leito)}>Reservar</Button>
                <Button variant="ghost" size="sm" className="col-span-2 text-muted-foreground" onClick={() => acoes.bloquear(leito)}>
                  <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />Bloquear para manutenção ou interdição
                </Button>
              </div>
            ) : ["higienizacao", "manutencao", "interditado", "desativado"].includes(leito.status) ? (
              <div className="rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">
                  {leito.status === "higienizacao"
                    ? "Aguardando limpeza após a última saída."
                    : "Leito fora de uso. Libere quando o problema for resolvido."}
                </p>
                <Button className="mt-3 w-full" onClick={() => acoes.liberar(leito)}>
                  <Sparkles className="mr-1.5 h-4 w-4" />Liberar para uso
                </Button>
              </div>
            ) : null}

            {companheiros.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Divide o quarto com: {companheiros.map((o: any) => nome(o.employee_id)).join(", ")}
              </p>
            )}
          </section>

          {/* Patrimônio */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4" />Patrimônio</h3>
              <Button size="sm" variant="ghost" onClick={() => acoes.novoBem(leito)}>
                <Plus className="mr-1 h-3.5 w-3.5" />Adicionar
              </Button>
            </div>
            <ListaBens titulo="Deste leito" vazio="Nenhum bem vinculado a este leito." bens={bensDoLeito} onMover={acoes.moverBem} />
            <ListaBens titulo="Do quarto (compartilhado)" vazio="Nenhum bem compartilhado no quarto." bens={bensDoQuarto} onMover={acoes.moverBem} />
          </section>

          {/* Histórico */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />Últimas movimentações</h3>
            {!historico.length && <p className="text-xs text-muted-foreground">Sem registros.</p>}
            <ol className="space-y-2">
              {historico.map(h => (
                <li key={h.id} className="flex gap-3 text-xs">
                  <span className="w-24 flex-shrink-0 text-muted-foreground">{dataHora(h.ocorrido_em)}</span>
                  <span>
                    <strong className="font-medium">{MOV_LABEL[h.tipo] ?? h.tipo}</strong>
                    {h.ocupacao_id && <> · {nomeOcupacao(h.ocupacao_id)}</>}
                    {h.tipo === "transferencia" && h.leito_origem_id === leito.id && <span className="text-muted-foreground"> (saiu daqui)</span>}
                    {h.motivo && <span className="block text-muted-foreground">{h.motivo}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ListaBens({ titulo, vazio, bens, onMover }: { titulo: string; vazio: string; bens: any[]; onMover: (b: any) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {!bens.length ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <div className="divide-y rounded-md border">
          {bens.map(b => (
            <div key={b.id} className="flex items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.descricao}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{b.tombamento}</p>
              </div>
              <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", ESTADO_BEM[b.estado]?.cls)}>
                {ESTADO_BEM[b.estado]?.label ?? b.estado}
              </span>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Movimentar" onClick={() => onMover(b)}>
                <MoveRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


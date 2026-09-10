import { useMemo, useState } from "react";
import { BedDouble, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dados, dataCurta, dataHora } from "./shared";

interface Props {
  dados: Dados;
  leitoIds: Set<string>;
  nome: (id: string) => string;
  onLeito: (leito: any) => void;
  onCancelarReserva: (reserva: any) => void;
}

type Visao = "ativos" | "reservas" | "historico";

export function AlojadosAba({ dados, leitoIds, nome, onLeito, onCancelarReserva }: Props) {
  const [visao, setVisao] = useState<Visao>("ativos");
  const [busca, setBusca] = useState("");

  const onde = (leitoId: string) => {
    const l = dados.leitos.find(x => x.id === leitoId);
    const q = dados.quartos.find(x => x.id === l?.quarto_id);
    const a = dados.ambientes.find(x => x.id === q?.id);
    const u = dados.unidades.find(x => x.id === a?.alojamento_id);
    return { leito: l, texto: `${u?.nome ?? "?"} · Quarto ${q?.identificacao ?? "?"} · Leito ${l?.identificacao ?? "?"}` };
  };

  const termo = busca.trim().toLowerCase();
  const casa = (employeeId: string, leitoId: string) =>
    !termo || nome(employeeId).toLowerCase().includes(termo) || onde(leitoId).texto.toLowerCase().includes(termo);

  const ativos = useMemo(() => dados.ocupacoes
    .filter(o => !o.data_saida && leitoIds.has(o.leito_id) && casa(o.employee_id, o.leito_id))
    .sort((a, b) => nome(a.employee_id).localeCompare(nome(b.employee_id), "pt-BR")),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [dados.ocupacoes, leitoIds, termo]);

  const reservas = dados.reservas
    .filter(r => r.status === "ativa" && leitoIds.has(r.leito_id) && casa(r.employee_id, r.leito_id))
    .sort((a, b) => String(a.inicio_previsto).localeCompare(String(b.inicio_previsto)));

  // Histórico responde "quem dormiu no leito 12 em julho?"
  const historico = dados.ocupacoes
    .filter(o => o.data_saida && leitoIds.has(o.leito_id) && casa(o.employee_id, o.leito_id))
    .sort((a, b) => String(b.data_saida).localeCompare(String(a.data_saida)))
    .slice(0, 300);

  const abas: [Visao, string, number][] = [
    ["ativos", "Alojados agora", ativos.length],
    ["reservas", "Reservas", reservas.length],
    ["historico", "Histórico", historico.length],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1.5">
          {abas.map(([id, label, n]) => (
            <button key={id} onClick={() => setVisao(id)}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium",
                visao === id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
              {label} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, bloco ou quarto" className="h-9 pl-8" />
        </div>
      </div>

      <div className="divide-y rounded-lg border">
        {visao === "ativos" && (!ativos.length
          ? <Vazio texto="Ninguém alojado no filtro atual." />
          : ativos.map(o => {
            const { leito, texto } = onde(o.leito_id);
            const ausente = o.presenca_status === "ausente_temporariamente";
            return (
              <Linha key={o.id} titulo={nome(o.employee_id)} sub={`${texto} · desde ${dataCurta(o.data_entrada)}`}
                selo={ausente ? <Badge variant="secondary">Ausente</Badge> : null}
                acao={<Button size="sm" variant="outline" onClick={() => onLeito(leito)}><BedDouble className="mr-1.5 h-3.5 w-3.5" />Abrir leito</Button>} />
            );
          }))}

        {visao === "reservas" && (!reservas.length
          ? <Vazio texto="Nenhuma reserva ativa." />
          : reservas.map(r => {
            const { leito, texto } = onde(r.leito_id);
            return (
              <Linha key={r.id} titulo={nome(r.employee_id)}
                sub={`${texto} · a partir de ${new Date(`${r.inicio_previsto}T12:00:00`).toLocaleDateString("pt-BR")}`}
                acao={<div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => onCancelarReserva(r)}>Cancelar</Button>
                  <Button size="sm" variant="outline" onClick={() => onLeito(leito)}>Abrir leito</Button>
                </div>} />
            );
          }))}

        {visao === "historico" && (!historico.length
          ? <Vazio texto="Sem saídas registradas no filtro atual." />
          : historico.map(o => (
            <Linha key={o.id} titulo={nome(o.employee_id)}
              sub={`${onde(o.leito_id).texto} · ${dataCurta(o.data_entrada)} → ${dataHora(o.data_saida)}`}
              selo={o.motivo_saida ? <span className="text-xs text-muted-foreground">{o.motivo_saida}</span> : null} />
          )))}
      </div>
    </div>
  );
}

function Linha({ titulo, sub, selo, acao }: { titulo: string; sub: string; selo?: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{titulo}</p>{selo}</div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      {acao}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="p-10 text-center text-sm text-muted-foreground">{texto}</p>;
}

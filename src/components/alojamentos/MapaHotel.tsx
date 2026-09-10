import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BedDouble, Building2, Plus, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CLASSIFICACAO, Dados, LEITO, TIPO_UNIDADE } from "./shared";

interface Props {
  dados: Dados;
  unidades: any[];
  ocupacaoPorLeito: Map<string, any>;
  reservaPorLeito: Map<string, any>;
  nome: (employeeId: string) => string;
  onLeito: (leito: any) => void;
  onNovoQuarto: (unidadeId?: string) => void;
}

type Filtro = "todos" | "vagas" | "masculino" | "feminino" | "bloqueados";

function contar(leitos: any[]) {
  const c = { total: 0, ocupados: 0, livres: 0, reservados: 0, bloqueados: 0 };
  for (const l of leitos) {
    if (l.status === "desativado") continue;
    c.total++;
    if (l.status === "ocupado") c.ocupados++;
    else if (l.status === "disponivel") c.livres++;
    else if (l.status === "reservado") c.reservados++;
    else c.bloqueados++;
  }
  return c;
}

export function MapaHotel({ dados, unidades, ocupacaoPorLeito, reservaPorLeito, nome, onLeito, onNovoQuarto }: Props) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  // Com uma única unidade no filtro, não faz sentido parar na lista de blocos
  useEffect(() => {
    if (unidades.length === 1) setAberta(unidades[0].id);
    else if (aberta && !unidades.some(u => u.id === aberta)) setAberta(null);
  }, [unidades, aberta]);

  const quartosPorUnidade = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const q of dados.quartos) {
      const amb = dados.ambientes.find(a => a.id === q.id);
      if (!amb) continue;
      m.set(amb.alojamento_id, [...(m.get(amb.alojamento_id) ?? []), q]);
    }
    for (const lista of m.values()) {
      lista.sort((a, b) => String(a.identificacao).localeCompare(String(b.identificacao), "pt-BR", { numeric: true }));
    }
    return m;
  }, [dados.quartos, dados.ambientes]);

  const leitosPorQuarto = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const l of dados.leitos) m.set(l.quarto_id, [...(m.get(l.quarto_id) ?? []), l]);
    for (const lista of m.values()) lista.sort((a, b) => String(a.identificacao).localeCompare(String(b.identificacao)));
    return m;
  }, [dados.leitos]);

  // Busca por colaborador: responde "onde está o João?" em qualquer bloco
  const termo = busca.trim().toLowerCase();
  const encontrados = useMemo(() => {
    if (termo.length < 2) return [];
    const unidadeIds = new Set(unidades.map(u => u.id));
    return dados.ocupacoes
      .filter(o => !o.data_saida && nome(o.employee_id).toLowerCase().includes(termo))
      .map(o => {
        const leito = dados.leitos.find(l => l.id === o.leito_id);
        const quarto = dados.quartos.find(q => q.id === leito?.quarto_id);
        const amb = dados.ambientes.find(a => a.id === quarto?.id);
        const unidade = dados.unidades.find(u => u.id === amb?.alojamento_id);
        return { o, leito, quarto, unidade };
      })
      .filter(x => x.leito && x.unidade && unidadeIds.has(x.unidade.id))
      .slice(0, 8);
  }, [termo, dados, unidades, nome]);

  const unidadeAberta = unidades.find(u => u.id === aberta);

  // ── Nível 1: blocos ──────────────────────────────────────────────────
  if (!unidadeAberta) {
    return (
      <div className="space-y-4">
        <BarraBusca busca={busca} setBusca={setBusca} encontrados={encontrados} nome={nome} onLeito={onLeito} />
        {!unidades.length && (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhuma unidade no filtro selecionado.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {unidades.map(u => {
            const quartos = quartosPorUnidade.get(u.id) ?? [];
            const c = contar(quartos.flatMap(q => leitosPorQuarto.get(q.id) ?? []));
            const pct = c.total ? (c.ocupados / c.total) * 100 : 0;
            const excede = u.capacidade_autorizada != null && c.ocupados > u.capacidade_autorizada;
            return (
              <button
                key={u.id}
                onClick={() => setAberta(u.id)}
                className="group rounded-xl border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{u.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {TIPO_UNIDADE[u.tipo_unidade] ?? "Unidade"} · {quartos.length} quartos
                    </p>
                  </div>
                  <Building2 className="h-5 w-5 flex-shrink-0 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-emerald-600">{c.livres}</span>
                  <span className="text-sm text-muted-foreground">vagas livres</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{c.ocupados}/{c.total} ocupados</span>
                  {c.reservados > 0 && <span>{c.reservados} reservados</span>}
                  {c.bloqueados > 0 && <span className="text-amber-700">{c.bloqueados} bloqueados</span>}
                </div>
                {excede && (
                  <p className="mt-2 text-[11px] font-medium text-red-600">
                    Acima da capacidade autorizada ({u.capacidade_autorizada})
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Nível 2: quartos do bloco ────────────────────────────────────────
  const todosQuartos = quartosPorUnidade.get(unidadeAberta.id) ?? [];
  const cBloco = contar(todosQuartos.flatMap(q => leitosPorQuarto.get(q.id) ?? []));
  const quartos = todosQuartos.filter(q => {
    const leitos = leitosPorQuarto.get(q.id) ?? [];
    if (termo && !String(q.identificacao).toLowerCase().includes(termo) &&
        !leitos.some(l => { const o = ocupacaoPorLeito.get(l.id); return o && nome(o.employee_id).toLowerCase().includes(termo); })) return false;
    if (filtro === "vagas") return leitos.some(l => l.status === "disponivel");
    if (filtro === "masculino" || filtro === "feminino") return q.classificacao === filtro;
    if (filtro === "bloqueados") return leitos.some(l => ["higienizacao", "manutencao", "interditado"].includes(l.status));
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {unidades.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setAberta(null)}>
              <ArrowLeft className="mr-1 h-4 w-4" />Blocos
            </Button>
          )}
          <div>
            <p className="font-semibold leading-tight">{unidadeAberta.nome}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-emerald-600">{cBloco.livres} livres</span>
              {" · "}{cBloco.ocupados}/{cBloco.total} ocupados · {todosQuartos.length} quartos
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => onNovoQuarto(unidadeAberta.id)}>
          <Plus className="mr-1.5 h-4 w-4" />Quartos
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {([
            ["todos", "Todos"], ["vagas", "Com vaga"], ["masculino", "Masculino"],
            ["feminino", "Feminino"], ["bloqueados", "Bloqueados"],
          ] as [Filtro, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                filtro === id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >{label}</button>
          ))}
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Quarto ou colaborador" className="h-9 pl-8" />
        </div>
      </div>

      <Legenda />

      {!quartos.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {todosQuartos.length ? "Nenhum quarto atende a este filtro." : "Este bloco ainda não tem quartos cadastrados."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
          {quartos.map(q => {
            const leitos = leitosPorQuarto.get(q.id) ?? [];
            const livres = leitos.filter(l => l.status === "disponivel").length;
            return (
              <div key={q.id} className="rounded-lg border bg-card p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">{q.identificacao}</span>
                  <span
                    title={CLASSIFICACAO[q.classificacao]?.label}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                  >{CLASSIFICACAO[q.classificacao]?.curto ?? "—"}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {leitos.map(l => {
                    const occ = ocupacaoPorLeito.get(l.id);
                    const res = reservaPorLeito.get(l.id);
                    const cfg = LEITO[l.status] ?? LEITO.desativado;
                    const ausente = occ?.presenca_status === "ausente_temporariamente";
                    const titulo = occ ? nome(occ.employee_id) : res ? `Reservado: ${nome(res.employee_id)}` : cfg.label;
                    return (
                      <button
                        key={l.id}
                        onClick={() => onLeito(l)}
                        title={`Leito ${l.identificacao} · ${titulo}`}
                        aria-label={`Leito ${l.identificacao}, ${titulo}`}
                        className={cn(
                          "flex h-8 min-w-8 items-center justify-center rounded-md px-1 text-[11px] font-semibold transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                          cfg.cor,
                          ausente && "ring-2 ring-dashed ring-offset-1 ring-violet-300",
                        )}
                      >{l.identificacao}</button>
                    );
                  })}
                </div>
                <p className={cn("mt-2 text-[11px]", livres ? "font-medium text-emerald-600" : "text-muted-foreground")}>
                  {livres ? `${livres} ${livres === 1 ? "vaga" : "vagas"}` : "Sem vagas"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      {["disponivel", "reservado", "ocupado", "higienizacao", "manutencao", "interditado"].map(s => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-sm", LEITO[s].cor)} />{LEITO[s].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-violet-600 ring-2 ring-dashed ring-violet-300 ring-offset-1" />Ausente temporariamente
      </span>
    </div>
  );
}

function BarraBusca({ busca, setBusca, encontrados, nome, onLeito }: {
  busca: string; setBusca: (v: string) => void; encontrados: any[];
  nome: (id: string) => string; onLeito: (l: any) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Onde está o colaborador? Digite o nome" className="h-9 pl-8" />
      </div>
      {busca.trim().length >= 2 && (
        <div className="max-w-md divide-y rounded-lg border bg-card">
          {!encontrados.length && <p className="p-3 text-sm text-muted-foreground">Ninguém alojado com esse nome.</p>}
          {encontrados.map(({ o, leito, quarto, unidade }) => (
            <button key={o.id} onClick={() => onLeito(leito)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{nome(o.employee_id)}</p>
                <p className="text-xs text-muted-foreground">{unidade.nome} · Quarto {quarto?.identificacao} · Leito {leito.identificacao}</p>
              </div>
              <BedDouble className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

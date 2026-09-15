import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "@/lib/exportCsv";
import { Dados, dataCurta } from "./shared";
import { brl, CATEGORIA, dataParaMes, rotuloMes } from "./custos";

interface Props {
  dados: Dados;
  unidades: any[];
  leitos: any[];
  leitoIds: Set<string>;
  nome: (id: string) => string;
}

const STATUS: Record<string, string> = {
  disponivel: "Livre", reservado: "Reservado", ocupado: "Ocupado",
  higienizacao: "Higienização", manutencao: "Manutenção", interditado: "Interditado", desativado: "Desativado",
};

/** Relatórios executivos do alojamento: dados atuais + custos por competência. */
export function RelatoriosAlojamento({ dados, unidades, leitos, leitoIds, nome }: Props) {
  const [mes, setMes] = useState(() => dataParaMes(new Date()));
  const [custos, setCustos] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const unidadeIds = useMemo(() => new Set(unidades.map(u => u.id)), [unidades]);
  const complexoIds = useMemo(() => new Set(unidades.map(u => u.complexo_id).filter(Boolean)), [unidades]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    Promise.all([
      (supabase as any).rpc("alojamento_custos_periodo", { p_inicio: `${mes}-01`, p_fim: `${mes}-01` }),
      (supabase as any).from("alojamento_despesas").select("*").eq("competencia", `${mes}-01`).order("created_at"),
    ]).then(([c, d]: any[]) => {
      if (!ativo) return;
      if (c.error ?? d.error) toast.error(`Não foi possível carregar os relatórios: ${(c.error ?? d.error).message}`);
      setCustos((c.data ?? []).filter((x: any) => complexoIds.has(x.complexo_id)));
      setDespesas((d.data ?? []).filter((x: any) => complexoIds.has(x.complexo_id)));
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [mes, complexoIds]);

  const local = (leitoId: string) => {
    const leito = dados.leitos.find(l => l.id === leitoId);
    const quarto = dados.quartos.find(q => q.id === leito?.quarto_id);
    const ambiente = dados.ambientes.find(a => a.id === quarto?.id);
    const unidade = dados.unidades.find(u => u.id === ambiente?.alojamento_id);
    return { unidade, quarto, leito, texto: `${unidade?.nome ?? "—"} · Quarto ${quarto?.identificacao ?? "—"} · Leito ${leito?.identificacao ?? "—"}` };
  };

  const alojados = useMemo(() => dados.ocupacoes
    .filter(o => !o.data_saida && leitoIds.has(o.leito_id))
    .sort((a, b) => nome(a.employee_id).localeCompare(nome(b.employee_id), "pt-BR")),
  [dados.ocupacoes, leitoIds, nome]);

  const disponibilidade = useMemo(() => Object.keys(STATUS).map(status => ({
    status, quantidade: leitos.filter(l => l.status === status).length,
  })).filter(x => x.quantidade > 0), [leitos]);

  const porUnidade = useMemo(() => unidades.map(unidade => {
    const quartos = new Set(dados.ambientes.filter(a => a.alojamento_id === unidade.id).map(a => a.id));
    const lista = leitos.filter(l => quartos.has(l.quarto_id));
    const operando = lista.filter(l => l.status !== "desativado");
    const ocupados = lista.filter(l => l.status === "ocupado").length;
    const livres = lista.filter(l => l.status === "disponivel").length;
    const reservados = lista.filter(l => l.status === "reservado").length;
    const bloqueados = lista.filter(l => ["higienizacao", "manutencao", "interditado"].includes(l.status)).length;
    return { unidade, operando: operando.length, ocupados, livres, reservados, bloqueados, taxa: operando.length ? ocupados / operando.length * 100 : 0 };
  }), [unidades, dados.ambientes, leitos]);

  const totalCustos = custos.reduce((s, c) => s + Number(c.valor ?? 0), 0);
  const totalOperando = leitos.filter(l => l.status !== "desativado").length;
  const totalOcupados = alojados.length;
  const totalLivres = leitos.filter(l => l.status === "disponivel").length;
  const ocupacao = totalOperando ? totalOcupados / totalOperando * 100 : 0;
  const unidadeNome = (id?: string | null) => id ? unidades.find(u => u.id === id)?.nome ?? "Unidade removida" : "Complexo (rateado)";
  const complexoNome = (id?: string | null) => dados.complexos.find(c => c.id === id)?.nome ?? "Complexo";

  const detalhesCusto = useMemo(() => {
    const lancados = despesas.map(d => ({
      categoria: CATEGORIA[d.categoria]?.label ?? d.categoria,
      unidade: unidadeNome(d.alojamento_id), complexo: complexoNome(d.complexo_id),
      descricao: d.descricao || d.fornecedor || "Despesa lançada", fornecedor: d.fornecedor || "—",
      documento: d.documento || "—", valor: Number(d.valor ?? 0), origem: "Lançamento",
    }));
    const automaticos = custos.filter(c => ["aluguel", "manutencao"].includes(c.categoria)).map(c => ({
      categoria: CATEGORIA[c.categoria]?.label ?? c.categoria,
      unidade: unidadeNome(c.alojamento_id), complexo: complexoNome(c.complexo_id),
      descricao: c.categoria === "aluguel" ? "Contrato vigente no mês" : "Chamados concluídos no mês",
      fornecedor: "—", documento: "—", valor: Number(c.valor ?? 0), origem: "Automático",
    }));
    return [...lancados, ...automaticos].sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [despesas, custos, unidades, dados.complexos]);

  function exportarAlojados() {
    downloadCsv(["Colaborador", "Unidade", "Quarto", "Leito", "Entrada", "Situação"], alojados.map(o => {
      const x = local(o.leito_id);
      return [nome(o.employee_id), x.unidade?.nome ?? "", x.quarto?.identificacao ?? "", x.leito?.identificacao ?? "", dataCurta(o.data_entrada), o.presenca_status === "ausente_temporariamente" ? "Ausente temporariamente" : "Alojado"];
    }), `alojados_${mes}`);
  }
  function exportarDisponibilidade() {
    downloadCsv(["Unidade", "Leitos em operação", "Ocupados", "Livres", "Reservados", "Bloqueados", "Ocupação (%)"], porUnidade.map(x => [x.unidade.nome, x.operando, x.ocupados, x.livres, x.reservados, x.bloqueados, x.taxa.toFixed(1)]), `ocupacao_alojamento_${mes}`);
  }
  function exportarCustos() {
    downloadCsv(["Competência", "Complexo", "Unidade", "Categoria", "Descrição", "Fornecedor", "Documento", "Origem", "Valor"], detalhesCusto.map(x => [rotuloMes(mes), x.complexo, x.unidade, x.categoria, x.descricao, x.fornecedor, x.documento, x.origem, x.valor.toFixed(2)]), `custos_alojamento_${mes}`);
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <div><h2 className="font-semibold">Relatórios gerenciais</h2><p className="text-sm text-muted-foreground">Visão pronta para acompanhar pessoas, capacidade e custos.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Competência" type="month" value={mes} onChange={e => setMes(e.target.value)} className="h-9 w-40" />
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Button size="sm" variant="outline" onClick={exportarAlojados}><Download className="mr-1.5 h-4 w-4" />Alojados</Button>
        <Button size="sm" variant="outline" onClick={exportarDisponibilidade}><Download className="mr-1.5 h-4 w-4" />Ocupação</Button>
        <Button size="sm" variant="outline" onClick={exportarCustos}><Download className="mr-1.5 h-4 w-4" />Custos</Button>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Numero label="Ocupação atual" valor={`${ocupacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} detalhe={`${totalOcupados} de ${totalOperando} leitos em operação`} />
      <Numero label="Leitos disponíveis" valor={String(totalLivres)} detalhe="prontos para entrada" cor="text-emerald-600" />
      <Numero label="Alojados agora" valor={String(totalOcupados)} detalhe="relação disponível abaixo" cor="text-violet-600" />
      <Numero label={`Custo · ${rotuloMes(mes)}`} valor={brl(totalCustos, 0)} detalhe={`${detalhesCusto.length} itens de custo`} />
    </div>

    <section className="rounded-lg border"><Cabecalho titulo="Ocupação x disponibilidade" sub="Capacidade operacional por unidade." />
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">Unidade</th><th className="p-3 text-right font-medium">Operação</th><th className="p-3 text-right font-medium">Ocupados</th><th className="p-3 text-right font-medium">Livres</th><th className="p-3 text-right font-medium">Reservados</th><th className="p-3 text-right font-medium">Bloqueados</th><th className="p-3 text-right font-medium">Ocupação</th></tr></thead><tbody>
        {porUnidade.length ? porUnidade.map(x => <tr key={x.unidade.id} className="border-b last:border-0"><td className="p-3 font-medium">{x.unidade.nome}</td><td className="p-3 text-right tabular-nums">{x.operando}</td><td className="p-3 text-right tabular-nums">{x.ocupados}</td><td className="p-3 text-right tabular-nums text-emerald-700">{x.livres}</td><td className="p-3 text-right tabular-nums">{x.reservados}</td><td className="p-3 text-right tabular-nums text-amber-700">{x.bloqueados}</td><td className="p-3 text-right tabular-nums font-medium">{x.taxa.toFixed(1)}%</td></tr>) : <Vazio colunas={7} texto="Nenhuma unidade no filtro selecionado." />}
      </tbody></table></div>
      <div className="flex flex-wrap gap-2 border-t p-3 text-xs text-muted-foreground">{disponibilidade.map(x => <span key={x.status} className="rounded-full bg-muted px-2 py-1">{STATUS[x.status]}: <strong className="text-foreground">{x.quantidade}</strong></span>)}</div>
    </section>

    <section className="rounded-lg border"><Cabecalho titulo="Relação de alojados" sub="Posição atual; inclui a situação de presença." />
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">Colaborador</th><th className="p-3 font-medium">Local</th><th className="p-3 font-medium">Entrada</th><th className="p-3 font-medium">Situação</th></tr></thead><tbody>
        {alojados.length ? alojados.map(o => <tr key={o.id} className="border-b last:border-0"><td className="p-3 font-medium">{nome(o.employee_id)}</td><td className="p-3">{local(o.leito_id).texto}</td><td className="p-3">{dataCurta(o.data_entrada)}</td><td className="p-3"><span className={o.presenca_status === "ausente_temporariamente" ? "text-amber-700" : "text-emerald-700"}>{o.presenca_status === "ausente_temporariamente" ? "Ausente temporariamente" : "Alojado"}</span></td></tr>) : <Vazio colunas={4} texto="Não há pessoas alojadas neste filtro." />}
      </tbody></table></div>
    </section>

    <section className="rounded-lg border"><Cabecalho titulo={`Custos detalhados · ${rotuloMes(mes)}`} sub="Lançamentos informados, contratos e manutenções concluídas." />
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">Categoria</th><th className="p-3 font-medium">Unidade</th><th className="p-3 font-medium">Detalhe</th><th className="p-3 font-medium">Fornecedor / documento</th><th className="p-3 font-medium">Origem</th><th className="p-3 text-right font-medium">Valor</th></tr></thead><tbody>
        {detalhesCusto.length ? detalhesCusto.map((x, i) => <tr key={`${x.categoria}-${x.unidade}-${i}`} className="border-b last:border-0"><td className="p-3 font-medium">{x.categoria}</td><td className="p-3">{x.unidade}</td><td className="p-3">{x.descricao}</td><td className="p-3">{x.fornecedor === "—" ? "—" : `${x.fornecedor} · ${x.documento}`}</td><td className="p-3 text-muted-foreground">{x.origem}</td><td className="p-3 text-right font-medium tabular-nums">{brl(x.valor)}</td></tr>) : <Vazio colunas={6} texto="Nenhum custo registrado para esta competência." />}
      </tbody><tfoot className="border-t bg-muted/30"><tr><td className="p-3 font-semibold" colSpan={5}>Total do período</td><td className="p-3 text-right font-bold tabular-nums">{brl(totalCustos)}</td></tr></tfoot></table></div>
    </section>
  </div>;
}

function Numero({ label, valor, detalhe, cor = "" }: { label: string; valor: string; detalhe: string; cor?: string }) {
  return <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${cor}`}>{valor}</p><p className="mt-1 text-xs text-muted-foreground">{detalhe}</p></div>;
}
function Cabecalho({ titulo, sub }: { titulo: string; sub: string }) {
  return <div className="p-4"><h3 className="font-semibold">{titulo}</h3><p className="mt-0.5 text-xs text-muted-foreground">{sub}</p></div>;
}
function Vazio({ colunas, texto }: { colunas: number; texto: string }) {
  return <tr><td colSpan={colunas} className="p-8 text-center text-muted-foreground">{texto}</td></tr>;
}

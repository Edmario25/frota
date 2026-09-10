import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Download,
  Loader2, Package, UserMinus, UserPlus, Wrench,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";
import { Dados } from "./shared";
import {
  CATEGORIA, GRUPOS, brl, dataParaMes, diasDoMes, grupoDe, rotuloMes, somarMeses,
} from "./custos";

interface Props {
  dados: Dados;
  unidades: any[];
  complexoIds: Set<string>;
  versao: number;
  onLancar: () => void;
}

const MESES_GRAFICO = 6;

export function PainelGestao({ dados, unidades, complexoIds, versao, onLancar }: Props) {
  const [mes, setMes] = useState(() => dataParaMes(new Date()));
  const [custos, setCustos] = useState<any[]>([]);
  const [diarias, setDiarias] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  const inicio = somarMeses(mes, -(MESES_GRAFICO - 1));

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    const args = { p_inicio: `${inicio}-01`, p_fim: `${mes}-01` };
    Promise.all([
      (supabase as any).rpc("alojamento_custos_periodo", args),
      (supabase as any).rpc("alojamento_diarias_periodo", args),
    ]).then(([c, d]: any[]) => {
      if (!vivo) return;
      const erro = c.error ?? d.error;
      if (erro) toast.error(`Não foi possível calcular os custos: ${erro.message}`);
      setCustos(c.data ?? []);
      setDiarias(d.data ?? []);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [mes, inicio, versao]);

  const unidadeIds = useMemo(() => new Set(unidades.map(u => u.id)), [unidades]);
  const noEscopo = (r: any) => r.alojamento_id ? unidadeIds.has(r.alojamento_id) : complexoIds.has(r.complexo_id);
  const mesDe = (r: any) => String(r.competencia).slice(0, 7);

  // ── Mês selecionado ──────────────────────────────────────────────────
  const r = useMemo(() => calcularMes(mes, custos.filter(noEscopo), diarias.filter(x => unidadeIds.has(x.alojamento_id)), unidades),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mes, custos, diarias, unidadeIds, complexoIds]);
  const anterior = useMemo(() => calcularMes(somarMeses(mes, -1), custos.filter(noEscopo), diarias.filter(x => unidadeIds.has(x.alojamento_id)), unidades),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mes, custos, diarias, unidadeIds, complexoIds]);

  // ── Série de 6 meses por grupo ───────────────────────────────────────
  const serie = useMemo(() => Array.from({ length: MESES_GRAFICO }, (_, i) => {
    const m = somarMeses(inicio, i);
    const linha: any = { mes: m, rotulo: rotuloMes(m, true) };
    for (const g of GRUPOS) linha[g.id] = 0;
    for (const c of custos) if (mesDe(c) === m && noEscopo(c)) linha[grupoDe(c.categoria).id] += Number(c.valor ?? 0);
    const d = diarias.filter(x => mesDe(x) === m && unidadeIds.has(x.alojamento_id)).reduce((s, x) => s + Number(x.diarias), 0);
    const total = GRUPOS.reduce((s, g) => s + linha[g.id], 0);
    linha.total = total;
    linha.porAlojado = d ? total / (d / diasDoMes(m)) : null;
    return linha;
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [custos, diarias, inicio, unidadeIds, complexoIds]);
  const gruposComDados = GRUPOS.filter(g => serie.some(s => s[g.id] > 0));

  // ── Patrimônio e chamados (estado atual, não do mês) ────────────────
  const bens = dados.bens.filter(b => unidadeIds.has(b.alojamento_id));
  const bensAtivos = bens.filter(b => b.ativo);
  const valorPatrimonio = bensAtivos.reduce((s, b) => s + Number(b.valor_aquisicao ?? 0), 0);
  const avariados = bensAtivos.filter(b => ["danificado", "inservivel"].includes(b.estado));
  const baixadosNoMes = bens.filter(b => !b.ativo && b.baixado_em && String(b.baixado_em).slice(0, 7) === mes);
  const chamadosAbertos = dados.chamados.filter(c => unidadeIds.has(c.alojamento_id) && !["concluido", "cancelado"].includes(c.status));
  const vencidos = chamadosAbertos.filter(c => c.prazo && new Date(c.prazo).getTime() < Date.now());

  // Leitos em operação no escopo: base da ocupação média do mês
  const quartosEscopo = new Set(dados.ambientes.filter(a => unidadeIds.has(a.alojamento_id)).map(a => a.id));
  const leitosOperando = dados.leitos.filter(l => quartosEscopo.has(l.quarto_id) && l.status !== "desativado").length;
  const ocupacaoMedia = leitosOperando ? (r.media / leitosOperando) * 100 : 0;

  const variacao = anterior.total > 0 ? ((r.total - anterior.total) / anterior.total) * 100 : null;
  const variacaoPorAlojado = anterior.porAlojado && r.porAlojado ? ((r.porAlojado - anterior.porAlojado) / anterior.porAlojado) * 100 : null;
  const semLancamentos = !r.porCategoria.some(c => !["aluguel", "manutencao"].includes(c.categoria));

  function exportar() {
    downloadCsv(
      ["Unidade", "Diárias", "Média de alojados", "Custo direto", "Rateio do complexo", "Custo total", "Custo por alojado", "Custo por diária"],
      r.porUnidade.map(u => [
        u.nome, u.diarias.toFixed(1), u.media.toFixed(1), u.direto.toFixed(2), u.rateio.toFixed(2),
        u.total.toFixed(2), u.porAlojado != null ? u.porAlojado.toFixed(2) : "", u.porDiaria != null ? u.porDiaria.toFixed(2) : "",
      ]),
      `alojamento_custos_${mes}`,
    );
  }

  return (
    <div className="aloj-viz space-y-5">
      <style>{VIZ_CSS}</style>

      {/* Mês */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMes(somarMeses(mes, -1))} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <p className="min-w-40 text-center font-semibold capitalize">{rotuloMes(mes)}</p>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={mes >= dataParaMes(new Date())}
            onClick={() => setMes(somarMeses(mes, 1))} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
          {carregando && <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportar} disabled={!r.porUnidade.length}><Download className="mr-1.5 h-4 w-4" />Exportar</Button>
          <Button size="sm" onClick={onLancar}>Lançar despesa</Button>
        </div>
      </div>

      {semLancamentos && !carregando && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>Nenhuma despesa lançada em {rotuloMes(mes)}. O custo abaixo considera só aluguel e manutenção — água, energia e limpeza entram quando forem lançadas.</span>
        </div>
      )}

      {/* Números principais */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Numero rotulo="Custo do mês" valor={brl(r.total, 0)} variacao={variacao} detalhe={`${brl(anterior.total, 0)} no mês anterior`} />
        <Numero rotulo="Custo por alojado" valor={r.porAlojado != null ? brl(r.porAlojado, 0) : "—"} variacao={variacaoPorAlojado}
          detalhe={r.porAlojado != null ? "por mês, pela média de alojados" : "sem ocupação no mês"} />
        <Numero rotulo="Custo por diária" valor={r.porDiaria != null ? brl(r.porDiaria) : "—"} detalhe={`${r.diarias.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} diárias no mês`} />
        <Numero rotulo="Média de alojados" valor={r.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
          detalhe={`${r.alojados} pessoas no mês · ${ocupacaoMedia.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% dos leitos`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        {/* Evolução */}
        <section className="rounded-lg border p-4 xl:col-span-3">
          <h3 className="text-sm font-semibold">Custo por categoria · últimos {MESES_GRAFICO} meses</h3>
          <p className="mb-3 text-xs text-muted-foreground">Passe o mouse sobre uma barra para ver o detalhe do mês.</p>
          {!gruposComDados.length ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem custos no período.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                  <XAxis dataKey="rotulo" tickLine={false} axisLine={{ stroke: "var(--viz-axis)" }} tick={{ fill: "var(--viz-muted)", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: "var(--viz-muted)", fontSize: 11 }}
                    tickFormatter={v => v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${v}`} />
                  <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<Dica />} />
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "var(--viz-ink-2)", paddingTop: 8 }} />
                  {gruposComDados.map(g => (
                    <Bar key={g.id} dataKey={g.id} name={g.label} stackId="c" fill={g.cor}
                      stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={48} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Composição do mês */}
        <section className="rounded-lg border p-4 xl:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Composição de {rotuloMes(mes, true)}</h3>
          {!r.porCategoria.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem custos no mês.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="pb-2 font-medium">Categoria</th><th className="pb-2 text-right font-medium">Valor</th><th className="pb-2 text-right font-medium">Por alojado</th></tr>
              </thead>
              <tbody>
                {r.porCategoria.map(c => (
                  <tr key={c.categoria} className="border-t">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: grupoDe(c.categoria).cor }} />
                        <span>
                          {CATEGORIA[c.categoria]?.label ?? c.categoria}
                          {c.quantidade > 0 && c.medida && r.media > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              {c.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {c.medida} · {(c.quantidade / r.media).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {c.medida}/alojado
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {brl(c.valor, 0)}
                      <span className="block text-[11px] text-muted-foreground">{r.total ? ((c.valor / r.total) * 100).toFixed(0) : 0}%</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{r.media ? brl(c.valor / r.media, 0) : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right tabular-nums">{brl(r.total, 0)}</td>
                  <td className="py-2 text-right tabular-nums">{r.porAlojado != null ? brl(r.porAlojado, 0) : "—"}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Por unidade */}
      <section className="rounded-lg border">
        <div className="flex items-baseline justify-between p-4 pb-2">
          <h3 className="text-sm font-semibold">Por unidade</h3>
          <p className="text-[11px] text-muted-foreground">Despesas do complexo inteiro são rateadas pelas diárias de cada unidade.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Unidade</th>
                <th className="p-3 text-right font-medium">Média de alojados</th>
                <th className="p-3 text-right font-medium">Custo direto</th>
                <th className="p-3 text-right font-medium">Rateio</th>
                <th className="p-3 text-right font-medium">Total</th>
                <th className="p-3 text-right font-medium">Por alojado</th>
              </tr>
            </thead>
            <tbody>
              {r.porUnidade.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-medium">{u.nome}</td>
                  <td className="p-3 text-right tabular-nums">{u.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                  <td className="p-3 text-right tabular-nums">{brl(u.direto, 0)}</td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">{u.rateio ? brl(u.rateio, 0) : "—"}</td>
                  <td className="p-3 text-right font-medium tabular-nums">{brl(u.total, 0)}</td>
                  <td className={cn("p-3 text-right tabular-nums", u.acimaDaMedia && "font-semibold text-red-600")}>
                    {u.porAlojado != null ? brl(u.porAlojado, 0) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!r.porUnidade.length && <p className="p-8 text-center text-sm text-muted-foreground">Sem unidades no filtro.</p>}
        </div>
        {r.porUnidade.some(u => u.acimaDaMedia) && (
          <p className="border-t p-3 text-[11px] text-muted-foreground">Em vermelho: custo por alojado mais de 30% acima da média das unidades.</p>
        )}
      </section>

      {/* Pessoas, patrimônio e manutenção */}
      <div className="grid gap-3 md:grid-cols-3">
        <Resumo titulo="Movimento de pessoas" linhas={[
          [UserPlus, "Entradas no mês", r.entradas],
          [UserMinus, "Saídas no mês", r.saidas],
          [null, "Alojados agora", dados.ocupacoes.filter(o => !o.data_saida && unidadeIds.has(unidadeDoLeito(o.leito_id, dados))).length],
        ]} />
        <Resumo titulo="Patrimônio" linhas={[
          [Package, "Valor ativo", brl(valorPatrimonio, 0)],
          [AlertTriangle, "Danificados ou inservíveis", avariados.length, avariados.length > 0],
          [null, "Baixados no mês", baixadosNoMes.length],
        ]} />
        <Resumo titulo="Manutenção" linhas={[
          [Wrench, "Chamados em aberto", chamadosAbertos.length],
          [AlertTriangle, "Com prazo vencido", vencidos.length, vencidos.length > 0],
          [null, "Custo no mês", brl(r.porCategoria.find(c => c.categoria === "manutencao")?.valor ?? 0, 0)],
        ]} />
      </div>
    </div>
  );
}

// ── Cálculo de um mês ──────────────────────────────────────────────────
function calcularMes(mes: string, custos: any[], diarias: any[], unidades: any[]) {
  const doMes = custos.filter(c => String(c.competencia).slice(0, 7) === mes);
  const dMes = diarias.filter(d => String(d.competencia).slice(0, 7) === mes);
  const dias = diasDoMes(mes);

  const total = doMes.reduce((s, c) => s + Number(c.valor ?? 0), 0);
  const totalDiarias = dMes.reduce((s, d) => s + Number(d.diarias), 0);
  const media = totalDiarias / dias;

  const cat = new Map<string, { categoria: string; valor: number; quantidade: number; medida?: string }>();
  for (const c of doMes) {
    const x = cat.get(c.categoria) ?? { categoria: c.categoria, valor: 0, quantidade: 0, medida: c.unidade_medida ?? CATEGORIA[c.categoria]?.medida };
    x.valor += Number(c.valor ?? 0);
    x.quantidade += Number(c.quantidade ?? 0);
    cat.set(c.categoria, x);
  }

  // Diárias por unidade e por complexo, para o rateio
  const diariasUnid = new Map<string, number>();
  for (const d of dMes) diariasUnid.set(d.alojamento_id, (diariasUnid.get(d.alojamento_id) ?? 0) + Number(d.diarias));
  const diariasCompl = new Map<string, number>();
  for (const u of unidades) diariasCompl.set(u.complexo_id, (diariasCompl.get(u.complexo_id) ?? 0) + (diariasUnid.get(u.id) ?? 0));
  const unidadesPorCompl = new Map<string, number>();
  for (const u of unidades) unidadesPorCompl.set(u.complexo_id, (unidadesPorCompl.get(u.complexo_id) ?? 0) + 1);

  const porUnidadeBase = unidades.map(u => {
    const direto = doMes.filter(c => c.alojamento_id === u.id).reduce((s, c) => s + Number(c.valor ?? 0), 0);
    const doComplexo = doMes.filter(c => !c.alojamento_id && c.complexo_id === u.complexo_id).reduce((s, c) => s + Number(c.valor ?? 0), 0);
    const dU = diariasUnid.get(u.id) ?? 0;
    const dC = diariasCompl.get(u.complexo_id) ?? 0;
    // Sem ocupação no complexo, divide igualmente para o custo não sumir
    const rateio = doComplexo ? (dC ? doComplexo * (dU / dC) : doComplexo / (unidadesPorCompl.get(u.complexo_id) ?? 1)) : 0;
    const mediaU = dU / dias;
    const totalU = direto + rateio;
    return {
      id: u.id, nome: u.nome, diarias: dU, media: mediaU, direto, rateio, total: totalU,
      porAlojado: mediaU > 0 ? totalU / mediaU : null,
      porDiaria: dU > 0 ? totalU / dU : null,
      acimaDaMedia: false,
    };
  }).filter(u => u.total > 0 || u.diarias > 0);

  const comBase = porUnidadeBase.filter(u => u.porAlojado != null);
  const mediaPorAlojado = comBase.length ? comBase.reduce((s, u) => s + (u.porAlojado as number), 0) / comBase.length : 0;
  for (const u of porUnidadeBase) u.acimaDaMedia = comBase.length > 1 && u.porAlojado != null && u.porAlojado > mediaPorAlojado * 1.3;

  return {
    total, diarias: totalDiarias, media,
    porAlojado: media > 0 ? total / media : null,
    porDiaria: totalDiarias > 0 ? total / totalDiarias : null,
    alojados: dMes.reduce((s, d) => s + Number(d.alojados), 0),
    entradas: dMes.reduce((s, d) => s + Number(d.entradas), 0),
    saidas: dMes.reduce((s, d) => s + Number(d.saidas), 0),
    porCategoria: [...cat.values()].sort((a, b) => b.valor - a.valor),
    porUnidade: porUnidadeBase.sort((a, b) => b.total - a.total),
  };
}

function unidadeDoLeito(leitoId: string, d: Dados): string {
  const l = d.leitos.find(x => x.id === leitoId);
  return d.ambientes.find(a => a.id === l?.quarto_id)?.alojamento_id ?? "";
}

// ── Peças visuais ──────────────────────────────────────────────────────
function Numero({ rotulo, valor, detalhe, variacao }: { rotulo: string; valor: string; detalhe: string; variacao?: number | null }) {
  const sobe = variacao != null && variacao > 0;
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-bold">{valor}</p>
        {variacao != null && Math.abs(variacao) >= 0.5 && (
          // Custo subindo é ruim: vermelho para cima, verde para baixo. Com ícone, não só cor.
          <span className={cn("flex items-center text-xs font-medium", sobe ? "text-red-600" : "text-emerald-700 dark:text-emerald-400")}>
            {sobe ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(variacao).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{detalhe}</p>
    </div>
  );
}

function Resumo({ titulo, linhas }: { titulo: string; linhas: [any, string, any, boolean?][] }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-2 text-sm font-semibold">{titulo}</p>
      <dl className="space-y-1.5 text-sm">
        {linhas.map(([Icone, rotulo, valor, alerta]) => (
          <div key={rotulo} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {Icone ? <Icone className={cn("h-3.5 w-3.5", alerta && "text-red-600")} /> : <span className="w-3.5" />}{rotulo}
            </dt>
            <dd className={cn("tabular-nums font-medium", alerta && "text-red-600")}>{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Dica({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const linha = payload[0].payload;
  const itens = payload.filter((p: any) => p.value > 0).reverse();
  return (
    <div className="rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 font-semibold capitalize">{label}</p>
      {itens.map((p: any) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}</span>
          <span className="tabular-nums">{brl(p.value, 0)}</span>
        </p>
      ))}
      <p className="mt-1.5 flex justify-between gap-6 border-t pt-1.5 font-semibold">
        <span>Total</span><span className="tabular-nums">{brl(linha.total, 0)}</span>
      </p>
      {linha.porAlojado != null && (
        <p className="flex justify-between gap-6 text-muted-foreground">
          <span>Por alojado</span><span className="tabular-nums">{brl(linha.porAlojado, 0)}</span>
        </p>
      )}
    </div>
  );
}

// Paleta categórica de referência, em ordem fixa, com passo próprio para o
// escuro. As cores ficam em variáveis para o gráfico trocar de tema junto.
const VIZ_CSS = `
.aloj-viz {
  --viz-1:#2a78d6; --viz-2:#eb6834; --viz-3:#1baf7a; --viz-4:#eda100;
  --viz-5:#e87ba4; --viz-6:#008300; --viz-7:#4a3aa7; --viz-8:#e34948;
  --viz-surface: hsl(var(--card)); --viz-grid:#e1e0d9; --viz-axis:#c3c2b7;
  --viz-muted:#898781; --viz-ink-2:#52514e; --viz-hover: rgba(11,11,11,0.05);
}
.dark .aloj-viz {
  --viz-1:#3987e5; --viz-2:#d95926; --viz-3:#199e70; --viz-4:#c98500;
  --viz-5:#d55181; --viz-6:#008300; --viz-7:#9085e9; --viz-8:#e66767;
  --viz-grid:#2c2c2a; --viz-axis:#383835; --viz-ink-2:#c3c2b7; --viz-hover: rgba(255,255,255,0.06);
}`;

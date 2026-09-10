/**
 * Categorias de custo do alojamento.
 *
 * As categorias finas são o que se lança. Os grupos são o que o gráfico
 * mostra — no máximo oito, na ordem fixa da paleta categórica validada, para
 * cada grupo manter sempre a mesma cor em todos os meses e filtros.
 */

export const CATEGORIA: Record<string, { label: string; medida?: string }> = {
  agua:          { label: "Água",               medida: "m³" },
  energia:       { label: "Energia elétrica",   medida: "kWh" },
  gas:           { label: "Gás",                medida: "botijão" },
  internet:      { label: "Internet" },
  limpeza:       { label: "Material de limpeza" },
  higiene:       { label: "Higiene" },
  alimentacao:   { label: "Alimentação" },
  lavanderia:    { label: "Lavanderia" },
  dedetizacao:   { label: "Dedetização" },
  aluguel_extra: { label: "Taxas do imóvel" },
  outros:        { label: "Outros" },
  // Geradas pelo sistema, não lançadas
  aluguel:       { label: "Aluguel (contrato)" },
  manutencao:    { label: "Manutenção (chamados)" },
};

export const CATEGORIAS_LANCAVEIS = [
  "agua", "energia", "gas", "internet", "limpeza", "higiene",
  "alimentacao", "lavanderia", "dedetizacao", "aluguel_extra", "outros",
];

export interface Grupo { id: string; label: string; cats: string[]; cor: string }

export const GRUPOS: Grupo[] = [
  { id: "agua",        label: "Água",              cats: ["agua"],                             cor: "var(--viz-1)" },
  { id: "energia",     label: "Energia",           cats: ["energia"],                          cor: "var(--viz-2)" },
  { id: "limpeza",     label: "Limpeza e higiene", cats: ["limpeza", "higiene", "dedetizacao"], cor: "var(--viz-3)" },
  { id: "gas",         label: "Gás",               cats: ["gas"],                              cor: "var(--viz-4)" },
  { id: "alimentacao", label: "Alimentação",       cats: ["alimentacao"],                      cor: "var(--viz-5)" },
  { id: "aluguel",     label: "Aluguel e taxas",   cats: ["aluguel", "aluguel_extra"],         cor: "var(--viz-6)" },
  { id: "manutencao",  label: "Manutenção",        cats: ["manutencao"],                       cor: "var(--viz-7)" },
  { id: "outros",      label: "Outros",            cats: ["internet", "lavanderia", "outros"], cor: "var(--viz-8)" },
];

export const grupoDe = (categoria: string) =>
  GRUPOS.find(g => g.cats.includes(categoria)) ?? GRUPOS[GRUPOS.length - 1];

export const brl = (v: number, casas = 2) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });

/** "2026-09" -> Date do dia 1 (meio-dia, para não escorregar de fuso). */
export const mesParaData = (mes: string) => new Date(`${mes}-01T12:00:00`);
export const dataParaMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const somarMeses = (mes: string, n: number) => {
  const d = mesParaData(mes);
  d.setMonth(d.getMonth() + n);
  return dataParaMes(d);
};
export const rotuloMes = (mes: string, curto = false) =>
  mesParaData(mes).toLocaleDateString("pt-BR", curto ? { month: "short" } : { month: "long", year: "numeric" })
    .replace(".", "");

/** Dias do mês que contam: o mês corrente só até hoje, para a média não cair. */
export function diasDoMes(mes: string) {
  const d = mesParaData(mes);
  const total = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const hoje = new Date();
  if (hoje.getFullYear() === d.getFullYear() && hoje.getMonth() === d.getMonth()) return Math.max(1, hoje.getDate());
  return total;
}

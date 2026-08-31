/** Brazilian currency input, accepting canonical decimal strings when editing. */
export function parseCost(value: string): number {
  const raw = value.trim().replace(/^R\$\s*/, "");
  if (!raw) return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) return Number(raw.replace(/\./g, "").replace(",", "."));
  if (!/^\d+([.,]\d{1,2})?$/.test(raw)) return NaN;
  return Number(raw.replace(",", "."));
}

export function accumulatedCosts(rows: { mes: string; categoria_nome: string; valor_acumulado: number }[]) {
  const sorted = [...new Set(rows.map(r => r.mes))].sort();
  if (!sorted.length) return [];
  const categories = [...new Set(rows.map(r => r.categoria_nome))];
  const months: string[] = [];
  let [year, month] = sorted[0].split("-").map(Number);
  while (`${year}-${String(month).padStart(2, "0")}` <= sorted[sorted.length - 1]) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (++month > 12) { month = 1; year++; }
  }
  const previous: Record<string, number> = {};
  return months.map(mes => {
    const entry: Record<string, string | number> = { mes };
    categories.forEach(category => {
      const row = rows.find(r => r.mes === mes && r.categoria_nome === category);
      previous[category] = row ? Number(row.valor_acumulado) : previous[category] ?? 0;
      entry[category] = previous[category];
    });
    return entry;
  });
}

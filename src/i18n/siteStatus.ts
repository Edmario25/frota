// Translate known system statuses without changing names or stored values.
const siteStatusLabels: Record<string, string> = {
  planejada: "Planejada",
  em_andamento: "Em Andamento",
  pausada: "Pausada",
  concluida: "Concluída",
};

export function siteStatusLabel(status: string, t: (source: string) => string): string {
  return Object.prototype.hasOwnProperty.call(siteStatusLabels, status)
    ? t(siteStatusLabels[status])
    : status;
}

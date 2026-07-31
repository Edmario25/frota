/**
 * statusHelpers.ts
 * Fonte única de verdade para cores e labels de status em todo o sistema.
 * Substitui funções getStatusColor/getStatusText duplicadas em 14 arquivos.
 */

// ─── Veículos ────────────────────────────────────────────────────────────────

const vehicleStatusConfig: Record<string, { color: string; badge: string; label: string }> = {
  disponivel: {
    color:  "gradient-success border-0",
    badge:  "bg-green-500",
    label:  "Disponível",
  },
  em_uso: {
    color:  "gradient-primary border-0",
    badge:  "bg-blue-500",
    label:  "Em Uso",
  },
  manutencao: {
    color:  "gradient-warning border-0",
    badge:  "bg-yellow-500",
    label:  "Manutenção",
  },
  inativo: {
    color:  "bg-gray-100 text-gray-800",
    badge:  "bg-gray-500",
    label:  "Inativo",
  },
};

/** Badge colorido para tabelas (usa gradient tokens do design system) */
export const getVehicleStatusColor = (status: string): string =>
  vehicleStatusConfig[status]?.color ?? "";

/** Badge soft (bg-100) para modais de detalhe */
export const getVehicleStatusSoftClass = (status: string): string => {
  const map: Record<string, string> = {
    disponivel:  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    em_uso:      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    manutencao:  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    inativo:     "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  };
  return map[status] ?? "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
};

/** Ponto colorido pequeno (usado em cards de funcionário, etc.) */
export const getVehicleStatusBadge = (status: string): string =>
  vehicleStatusConfig[status]?.badge ?? "bg-gray-500";

/** Label em português */
export const getVehicleStatusText = (status: string): string =>
  vehicleStatusConfig[status]?.label ?? status;

// ─── Manutenção ──────────────────────────────────────────────────────────────

const maintenanceStatusConfig: Record<string, { color: string; label: string }> = {
  agendada: {
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    label: "Agendada",
  },
  em_andamento: {
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    label: "Em Andamento",
  },
  concluida: {
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    label: "Concluída",
  },
  cancelada: {
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    label: "Cancelada",
  },
};

export const getMaintenanceStatusColor = (status: string): string =>
  maintenanceStatusConfig[status]?.color ??
  "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";

export const getMaintenanceStatusText = (status: string): string =>
  maintenanceStatusConfig[status]?.label ?? status;

// ─── Funcionários ────────────────────────────────────────────────────────────

const employeeStatusConfig: Record<string, { color: string; dot: string; label: string }> = {
  ativo: {
    color: "gradient-success border-0",
    dot:   "bg-emerald-500 text-white border-0",
    label: "Ativo",
  },
  inativo: {
    color: "gradient-secondary border-0",
    dot:   "bg-slate-400 text-white border-0",
    label: "Inativo",
  },
  ferias: {
    color: "gradient-primary border-0",
    dot:   "bg-amber-500 text-white border-0",
    label: "Férias",
  },
  licenca: {
    color: "gradient-warning border-0",
    dot:   "bg-blue-500 text-white border-0",
    label: "Licença",
  },
};

export const getEmployeeStatusColor = (status: string): string =>
  employeeStatusConfig[status]?.color ?? "";

/** Variante para listas/cards (fundo sólido) */
export const getEmployeeStatusDot = (status: string): string =>
  employeeStatusConfig[status]?.dot ?? "bg-slate-400 text-white border-0";

export const getEmployeeStatusText = (status: string): string =>
  employeeStatusConfig[status]?.label ?? status;

// ─── Obras ───────────────────────────────────────────────────────────────────

const obraStatusConfig: Record<string, { color: string; label: string }> = {
  em_andamento: { color: "bg-emerald-500 text-white border-0", label: "Em Andamento" },
  planejada:    { color: "bg-slate-400 text-white border-0",   label: "Planejada"    },
  pausada:      { color: "bg-amber-500 text-white border-0",   label: "Pausada"      },
  concluida:    { color: "bg-blue-500 text-white border-0",    label: "Concluída"    },
};

export const getObraStatusColor = (status: string): string =>
  obraStatusConfig[status]?.color ?? "bg-slate-400 text-white border-0";

/** Variante gradient para modal de funcionário */
export const getObraStatusGradient = (status: string): string => {
  const map: Record<string, string> = {
    planejada:    "gradient-secondary border-0",
    em_andamento: "gradient-success border-0",
    pausada:      "gradient-warning border-0",
    concluida:    "gradient-primary border-0",
  };
  return map[status] ?? "";
};

export const getObraStatusText = (status: string): string =>
  obraStatusConfig[status]?.label ?? status;

// ─── Checklist (c / nc) ──────────────────────────────────────────────────────

const checklistItemConfig: Record<string, { color: string; label: string }> = {
  c:  { color: "bg-green-100 text-green-800 border-green-300",  label: "Conforme"     },
  nc: { color: "bg-red-100 text-red-800 border-red-300",        label: "Não Conforme" },
};

export const getChecklistItemColor = (value: string): string =>
  checklistItemConfig[value]?.color ?? "bg-gray-100 text-gray-800 border-gray-300";

export const getChecklistItemText = (value: string): string =>
  checklistItemConfig[value]?.label ?? value;

// ─── Multas ──────────────────────────────────────────────────────────────────

export const getMultaStatusColor = (situacao: string): string =>
  situacao === "paga"
    ? "bg-green-100 text-green-800"
    : "bg-red-100 text-red-800";

export const getMultaStatusText = (situacao: string): string =>
  situacao === "paga" ? "Paga" : "Pendente";

// ─── Tipo de propriedade (veículo) ───────────────────────────────────────────

export const getPropertyTypeText = (tipo: string): string => {
  const map: Record<string, string> = {
    proprio:  "Próprio",
    alugado:  "Alugado",
  };
  return map[tipo] ?? tipo;
};

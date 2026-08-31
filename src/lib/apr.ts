export const aprStatuses: Record<string, string> = {
  aberta: "Legada — revisar",
  rascunho: "Rascunho",
  em_analise: "Em análise",
  liberada: "Liberada",
  em_execucao: "Em execução",
  suspensa: "Suspensa",
  concluida: "Encerrada",
  cancelada: "Cancelada",
};
export const aprTransitions: Record<string, string[]> = {
  aberta: ["rascunho", "cancelada"],
  rascunho: ["em_analise", "cancelada"],
  em_analise: ["liberada", "rascunho", "cancelada"],
  liberada: ["em_execucao", "suspensa", "cancelada"],
  em_execucao: ["concluida", "suspensa", "cancelada"],
  suspensa: ["rascunho", "cancelada"],
};
export function aprLocalDateTime(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function aprScore(p: number, s: number) {
  return Number.isInteger(p) &&
    Number.isInteger(s) &&
    p >= 1 &&
    p <= 5 &&
    s >= 1 &&
    s <= 5
    ? p * s
    : null;
}
export type AprRisk = {
  risco_id: string;
  nome: string;
  resposta: "S" | "N" | "NA";
  etapa: string;
  medida_controle: string;
  responsavel: string;
  p: number;
  s: number;
  pr: number;
  sr: number;
  verificado: boolean;
  evidencia: string;
};
export type AprPayload = {
  obra_id: string;
  tipo_atividade_id: string;
  local: string;
  responsavel: string;
  descricao_trabalho: string;
  data_hora_inicio: string;
  validade: string;
  observacoes: string;
  emergencia: string;
  exige_pt: boolean;
  pt_id: string;
  riscos: AprRisk[];
  participantes: { id: string; origem: "manual" | "qr" }[];
  treinamentos: string[];
};
export function aprDraftError(d: AprPayload) {
  if (
    !d.obra_id ||
    !d.local.trim() ||
    !d.responsavel.trim() ||
    !Number.isFinite(Date.parse(d.data_hora_inicio))
  )
    return "Informe obra, local, responsável e início válido.";
  if (
    d.validade &&
    (!Number.isFinite(Date.parse(d.validade)) ||
      Date.parse(d.validade) <= Date.parse(d.data_hora_inicio))
  )
    return "A validade deve ser posterior ao início.";
  if (
    new Set(d.riscos.map((r) => r.risco_id)).size !== d.riscos.length ||
    new Set(d.participantes.map((p) => p.id)).size !== d.participantes.length
  )
    return "Remova riscos ou participantes duplicados.";
  return "";
}
// Pendências antigas permanecem rascunhos: não inventar equipe, ciência, controles ou liberação.
export function aprSyncPayload(
  d: Record<string, any>,
  obra: string,
): Record<string, any> {
  if (d.apr_version === 2) {
    const { apr_version: _v, ...payload } = d;
    return { ...payload, obra_id: obra };
  }
  return {
    obra_id: obra,
    tipo_atividade_id: d.tipo_atividade_id || "",
    local: d.local || d.descricao_trabalho || "Revisar local",
    responsavel: d.responsavel_nome || "Revisar responsável",
    descricao_trabalho: d.descricao_trabalho || "",
    data_hora_inicio:
      d.data_hora_inicio || `${d.data}T${d.hora_inicio || "00:00"}:00-03:00`,
    validade: d.validade
      ? String(d.validade).length === 10
        ? `${d.validade}T23:59:00-03:00`
        : d.validade
      : "",
    observacoes:
      "Importado do app anterior: revisar informações e coletar ciência.",
    emergencia: "",
    exige_pt: false,
    pt_id: "",
    treinamentos: [],
    participantes: [],
    riscos: (d.riscos_selecionados || []).map((r: any) => ({
      ...r,
      resposta: r.resposta || "S",
      medida_controle: r.medida_controle || "",
      etapa: "",
      responsavel: "",
      p: 0,
      s: 0,
      pr: 0,
      sr: 0,
      verificado: false,
    })),
  };
}

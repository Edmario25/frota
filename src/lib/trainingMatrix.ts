export type Requirement = {
  id: string;
  nome: string;
  status: string;
  vencimento: string | null;
  realizacao: string | null;
  historico: {
    id: string;
    realizacao: string | null;
    vencimento: string | null;
    status_registrado: string;
  }[];
};
export type MatrixRow = {
  id: string;
  nome: string;
  cargo: string | null;
  obra_id: string;
  obra: string;
  requisitos: Requirement[];
};
export const trainingLabels: Record<string, string> = {
  valido: "Válido",
  a_vencer: "A vencer em até 30 dias",
  vencido: "Vencido",
  nao_realizado: "Não realizado",
  conferencia: "Aguardando conferência",
};
export const isValidTraining = (r: Requirement) =>
  ["valido", "a_vencer"].includes(r.status);
export function matrixPercent(r: MatrixRow) {
  return r.requisitos.length
    ? Math.round(
        (100 * r.requisitos.filter(isValidTraining).length) /
          r.requisitos.length,
      )
    : null;
}
export function matrixMetrics(rows: MatrixRow[]) {
  const all = rows.flatMap((r) => r.requisitos),
    valid = all.filter(isValidTraining).length;
  return {
    pessoas: new Set(rows.map((r) => r.id)).size,
    vinculos: rows.length,
    percent: all.length ? Math.round((100 * valid) / all.length) : null,
    valid,
    required: all.length,
    notEvaluated: rows.filter((r) => !r.requisitos.length).length,
    pending: rows.filter((r) => r.requisitos.some((t) => !isValidTraining(t)))
      .length,
  };
}
export function filterMatrix(
  rows: MatrixRow[],
  search: string,
  status: string,
  cargo: string,
  days: string,
  today: string,
) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return rows.filter(
    (r) =>
      (!search ||
        normalize(r.nome + " " + (r.cargo || "")).includes(
          normalize(search),
        )) &&
      (!cargo || r.cargo === cargo) &&
      (!status ||
        (status === "nao_avaliado"
          ? !r.requisitos.length
          : r.requisitos.some((t) => t.status === status))) &&
      (!days ||
        r.requisitos.some((t) => {
          if (!t.vencimento || !isValidTraining(t)) return false;
          const delta =
            (Date.parse(t.vencimento + "T12:00:00Z") -
              Date.parse(today + "T12:00:00Z")) /
            86400000;
          return delta >= 0 && delta <= Number(days);
        })),
  );
}
export const safeMatrixCell = (s: unknown) =>
  /^[\s]*[=+@-]/.test(String(s ?? "")) ? "'" + String(s) : String(s ?? "");
export function matrixCsv(rows: MatrixRow[], today: string) {
  return rows.flatMap((r) =>
    (r.requisitos.length ? r.requisitos : [null]).map((t) =>
      [
        today,
        r.obra,
        r.nome,
        r.cargo || "",
        t?.nome || "Requisitos não definidos",
        t ? trainingLabels[t.status] : "Não avaliado",
        t?.realizacao || "",
        t?.vencimento || "",
        matrixPercent(r) === null ? "Não avaliado" : `${matrixPercent(r)}%`,
      ].map(safeMatrixCell),
    ),
  );
}

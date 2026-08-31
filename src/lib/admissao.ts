export type RequisitoAdmissao = {
  id: string;
  nome: string;
  area: "rh" | "sms";
  status: "pendente" | "recebido" | "validado" | "recusado" | "na";
  arquivo_id?: string;
  justificativa?: string;
  validado_por?: string;
  validado_em?: string;
};
export function progressoAdmissao(requisitos: RequisitoAdmissao[]) {
  const aplicaveis = requisitos.filter((r) => r.status !== "na");
  return aplicaveis.length
    ? Math.round(
        (aplicaveis.filter((r) => r.status === "validado").length /
          aplicaveis.length) *
          100,
      )
    : 100;
}
export function dataLocalAdmissao(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function normalizarFormAdmissao(a: any) {
  return {
    perfil: a.perfil || "",
    responsavel_processo: a.responsavel_processo || "",
    prazo: a.prazo || "",
    requisitos: a.requisitos || [],
    treinamentos_exigidos: a.treinamentos_exigidos || [],
    epis_exigidos: a.epis_exigidos || [],
    epis_na_justificativa: a.epis_na_justificativa || "",
    integracao_id: a.integracao_id || "",
    observacoes: a.observacoes || "",
  };
}
export function aplicarPerfilAdmissao(form: any, perfil: any) {
  // Aplicar modelo nunca remove requisitos existentes nem transporta validações de outra pessoa.
  const requisitos = [...form.requisitos];
  for (const r of perfil.requisitos || [])
    if (!requisitos.some((x) => x.id === r.id))
      requisitos.push({
        id: r.id,
        nome: r.nome,
        area: r.area,
        status: "pendente",
      });
  return {
    ...form,
    perfil: perfil.nome,
    requisitos,
    treinamentos_exigidos: [
      ...new Set([...form.treinamentos_exigidos, ...perfil.treinamentos]),
    ],
    epis_exigidos: [...new Set([...form.epis_exigidos, ...perfil.epis])],
  };
}
export function validarArquivoAdmissao(file: { type: string; size: number }) {
  const ext: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!ext[file.type]) throw new Error("Envie PDF, JPG, PNG ou WebP.");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024)
    throw new Error("O arquivo deve ter até 10 MB e não pode estar vazio.");
  return ext[file.type];
}

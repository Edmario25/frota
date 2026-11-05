/**
 * Mensagem legível a partir de um erro de origem desconhecida.
 *
 * `catch (e: any)` espalhado pelo código existe por um motivo prático: o que o
 * `catch` recebe pode ser qualquer coisa, e `any` cala o compilador. O preço é
 * que `e.message` passa sem verificação — e no dia em que a biblioteca atirar
 * uma string, a tela mostra "undefined" para o usuário.
 *
 * `unknown` no catch é o tipo correto; este helper é o que torna isso prático.
 */
export function mensagemDeErro(erro: unknown, padrao = "Erro inesperado"): string {
  if (typeof erro === "string") return erro || padrao;
  if (erro instanceof Error) return erro.message || padrao;
  if (erro && typeof erro === "object") {
    // Erros do PostgREST/Supabase não são Error: são objetos com message,
    // e às vezes só com details ou hint preenchidos.
    const o = erro as Record<string, unknown>;
    for (const campo of ["message", "details", "hint", "error_description", "error"]) {
      const v = o[campo];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return padrao;
}

/** Código do erro do Postgres, quando houver (ex.: "23505" para chave duplicada). */
export function codigoDeErro(erro: unknown): string | null {
  if (erro && typeof erro === "object") {
    const codigo = (erro as Record<string, unknown>).code;
    if (typeof codigo === "string") return codigo;
  }
  return null;
}

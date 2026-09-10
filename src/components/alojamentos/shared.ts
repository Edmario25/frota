import { supabase } from "@/integrations/supabase/client";

export interface Dados {
  complexos: any[];
  unidades: any[];
  ambientes: any[];
  quartos: any[];
  leitos: any[];
  ocupacoes: any[];
  reservas: any[];
  bens: any[];
  chamados: any[];
}

export const DADOS_VAZIOS: Dados = {
  complexos: [], unidades: [], ambientes: [], quartos: [], leitos: [],
  ocupacoes: [], reservas: [], bens: [], chamados: [],
};

/**
 * O Supabase corta cada consulta em 1.000 linhas. Sem paginar, um complexo
 * grande mostraria indicadores errados sem nenhum aviso.
 */
export async function buscarTodos(tabela: string, ordem: string, asc = true): Promise<any[]> {
  const passo = 1000;
  const saida: any[] = [];
  for (let de = 0; ; de += passo) {
    const { data, error } = await (supabase as any)
      .from(tabela).select("*")
      .order(ordem, { ascending: asc }).order("id", { ascending: true })
      .range(de, de + passo - 1);
    if (error) throw error;
    saida.push(...(data ?? []));
    if (!data || data.length < passo) break;
  }
  return saida;
}

export const LEITO: Record<string, { label: string; cor: string; suave: string }> = {
  disponivel:   { label: "Livre",        cor: "bg-emerald-500 text-white",       suave: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  reservado:    { label: "Reservado",    cor: "bg-sky-500 text-white",           suave: "bg-sky-50 text-sky-700 border-sky-200" },
  ocupado:      { label: "Ocupado",      cor: "bg-violet-600 text-white",        suave: "bg-violet-50 text-violet-700 border-violet-200" },
  higienizacao: { label: "Higienização", cor: "bg-amber-400 text-amber-950",     suave: "bg-amber-50 text-amber-800 border-amber-200" },
  manutencao:   { label: "Manutenção",   cor: "bg-orange-500 text-white",        suave: "bg-orange-50 text-orange-700 border-orange-200" },
  interditado:  { label: "Interditado",  cor: "bg-red-600 text-white",           suave: "bg-red-50 text-red-700 border-red-200" },
  desativado:   { label: "Desativado",   cor: "bg-muted text-muted-foreground",  suave: "bg-muted text-muted-foreground border-border" },
};

export const ESTADO_BEM: Record<string, { label: string; cls: string }> = {
  novo:       { label: "Novo",       cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  bom:        { label: "Bom",        cls: "border-emerald-200 bg-emerald-50/60 text-emerald-700" },
  regular:    { label: "Regular",    cls: "border-amber-300 bg-amber-50 text-amber-800" },
  danificado: { label: "Danificado", cls: "border-orange-300 bg-orange-50 text-orange-700" },
  ausente:    { label: "Ausente",    cls: "border-red-300 bg-red-50 text-red-700" },
  inservivel: { label: "Inservível", cls: "border-red-300 bg-red-50 text-red-700" },
};

export const CLASSIFICACAO: Record<string, { label: string; curto: string }> = {
  masculino:  { label: "Masculino",  curto: "M" },
  feminino:   { label: "Feminino",   curto: "F" },
  individual: { label: "Individual", curto: "I" },
  familia:    { label: "Família",    curto: "Fa" },
  outro:      { label: "Outro",      curto: "—" },
};

export const TIPO_UNIDADE: Record<string, string> = {
  casa: "Casa", bloco: "Bloco", hotel_pousada: "Hotel/Pousada", apartamento: "Apartamento",
  conteiner: "Contêiner", terceirizada: "Terceirizada", outro: "Outro",
};

export const REGIME: Record<string, string> = {
  proprio: "Próprio", alugado: "Alugado", hospedagem: "Hospedagem", cedido: "Cedido", terceirizado: "Terceirizado",
};

export const TIPO_AMBIENTE: Record<string, string> = {
  quarto: "Quarto", banheiro: "Banheiro", cozinha: "Cozinha", refeitorio: "Refeitório",
  lavanderia: "Lavanderia", lazer: "Lazer", outro: "Outro",
};

export const STATUS_CHAMADO: Record<string, { label: string; cls: string }> = {
  aberto:       { label: "Aberto",       cls: "bg-red-100 text-red-700" },
  triagem:      { label: "Triagem",      cls: "bg-amber-100 text-amber-800" },
  em_andamento: { label: "Em andamento", cls: "bg-sky-100 text-sky-700" },
  aguardando:   { label: "Aguardando",   cls: "bg-slate-100 text-slate-700" },
  concluido:    { label: "Concluído",    cls: "bg-emerald-100 text-emerald-700" },
  cancelado:    { label: "Cancelado",    cls: "bg-muted text-muted-foreground" },
};

export const PRIORIDADE: Record<string, { label: string; cls: string }> = {
  baixa:   { label: "Baixa",   cls: "border-slate-300 text-slate-600" },
  media:   { label: "Média",   cls: "border-amber-300 text-amber-700" },
  alta:    { label: "Alta",    cls: "border-orange-400 text-orange-700" },
  critica: { label: "Crítica", cls: "border-red-400 bg-red-50 text-red-700" },
};

export const TIPO_CHAMADO: Record<string, string> = {
  preventiva: "Preventiva", corretiva: "Corretiva", emergencial: "Emergencial",
};

/** "Bloco B › Quarto B001 › Leito 02", ou "Bloco B › Área geral". */
export function localDoBem(bem: any, d: Dados): string {
  const unidade = d.unidades.find(u => u.id === bem.alojamento_id)?.nome ?? "Unidade";
  if (!bem.ambiente_id) return `${unidade} › Área geral`;
  const quarto = d.quartos.find(q => q.id === bem.ambiente_id);
  const ambiente = quarto
    ? `Quarto ${quarto.identificacao}`
    : d.ambientes.find(a => a.id === bem.ambiente_id)?.nome ?? "Ambiente";
  if (!bem.leito_id) return `${unidade} › ${ambiente}`;
  const leito = d.leitos.find(l => l.id === bem.leito_id);
  return `${unidade} › ${ambiente} › Leito ${leito?.identificacao ?? "?"}`;
}

/** Unidade (alojamento) a que um quarto pertence. */
export function unidadeDoQuarto(quartoId: string, d: Dados): any | undefined {
  const amb = d.ambientes.find(a => a.id === quartoId);
  return amb ? d.unidades.find(u => u.id === amb.alojamento_id) : undefined;
}

export function dataCurta(v?: string | null) {
  return v ? new Date(v).toLocaleDateString("pt-BR") : "—";
}

export function dataHora(v?: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

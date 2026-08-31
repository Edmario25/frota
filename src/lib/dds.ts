export function ddsLocalDate(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function identifyDdsBadge(raw: string, employees: { id: string; nome: string }[]) {
  const id = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return undefined;
  return employees.find(e => e.id.toLowerCase() === id);
}

/** Legacy free text remains evidence, never fabricated employee attendance. */
export function ddsSyncPayload(d: Record<string, unknown>, obraId: string, fotos: string[]) {
  return {
    obra_id: obraId,
    tema_id: d.tema_id || null,
    tema_livre: d.tema_livre || (d.tema_id ? null : 'Tema livre (registro legado)'),
    frente_servico: d.frente_servico || null,
    data_sessao: d.data,
    condutor: d.condutor_nome || 'Responsável de campo',
    hora_inicio: d.hora_inicio || null,
    duracao_min: d.duracao_min || null,
    participantes_nomes: d.participantes_nomes || null,
    participantes: Array.isArray(d.participantes) ? d.participantes : [],
    concluir: d.concluir === true,
    observacoes: d.observacoes || null,
    fotos,
  };
}

// ─── Sincronização offline → Supabase ───────────────────────────────────────
import { supabase } from '@/integrations/supabase/client'
import { smsDb, OfflineRecord } from './sms-offline-db'

// ── Upload de foto base64 → Supabase Storage ────────────────────────────────
async function uploadPhoto(base64: string, path: string): Promise<string | null> {
  try {
    const [header, payload] = base64.split(',')
    const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
    const raw  = atob(payload)
    const ab   = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) ab[i] = raw.charCodeAt(i)
    const { data, error } = await supabase.storage
      .from('sms-fotos')
      .upload(path, new Blob([ab], { type: mime }), { contentType: mime, upsert: true })
    if (error || !data) return null
    return supabase.storage.from('sms-fotos').getPublicUrl(data.path).data.publicUrl
  } catch { return null }
}

// Substitui base64s por URLs e retorna o array atualizado
async function resolvePhotos(recordId: string, type: string, fotos: string[]): Promise<string[]> {
  const out: string[] = []
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i]
    if (f.startsWith('data:')) {
      const url = await uploadPhoto(f, `${type}/${recordId}/${i}.jpg`)
      out.push(url ?? '')          // ignora se falhou
    } else {
      out.push(f)
    }
  }
  return out.filter(Boolean)
}

// ── Sync individual ──────────────────────────────────────────────────────────
export async function syncRecord(rec: OfflineRecord): Promise<{ ok: boolean; error?: string }> {
  try {
    const d     = { ...rec.data } as Record<string, unknown>
    const fotos = Array.isArray(d.fotos)
      ? await resolvePhotos(rec.id, rec.type, d.fotos as string[])
      : []

    switch (rec.type) {

      case 'dds': {
        const { error } = await (supabase as any).from('sms_dds_sessoes').insert({
          id:             rec.id,
          obra_id:        rec.obra_id,
          tema_id:        d.tema_id,
          encarregado_id: rec.employee_id,
          data:           d.data,
          hora_inicio:    d.hora_inicio || null,
          duracao_min:    d.duracao_min || null,
          observacoes:    d.observacoes || null,
          status:         'realizado',
          device_id:      d.device_id || null,
          sync_status:    'synced',
        })
        if (error) return { ok: false, error: error.message }
        // Presenças manuais (nomes livres) → não persistidas em sms_dds_presencas pois exigem employee FK
        return { ok: true }
      }

      case 'desvio': {
        const { error } = await (supabase as any).from('sms_desvios').insert({
          id:            rec.id,
          obra_id:       rec.obra_id,
          tipo:          d.tipo,
          descricao:     d.descricao,
          gravidade:     d.gravidade,
          fotos,
          data_abertura: d.data_abertura || new Date().toISOString().split('T')[0],
          autor_id:      rec.employee_id,
          origem:        'registro_livre',
          status:        'aberto',
          device_id:     d.device_id || null,
          sync_status:   'synced',
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      }

      case 'inspecao': {
        const { error: e1 } = await (supabase as any).from('sms_inspecoes').insert({
          id:             rec.id,
          obra_id:        rec.obra_id,
          checklist_id:   d.checklist_id,
          responsavel_id: rec.employee_id,
          data:           d.data,
          status:         'concluida',
          observacoes:    d.observacoes || null,
          device_id:      d.device_id || null,
          sync_status:    'synced',
        })
        if (e1) return { ok: false, error: e1.message }
        const respostas = d.respostas as Array<{ item_id: string; resposta: string; observacao?: string }> | undefined
        if (respostas?.length) {
          await (supabase as any).from('sms_inspecoes_respostas').insert(
            respostas.map(r => ({
              inspecao_id: rec.id,
              item_id:     r.item_id,
              resposta:    r.resposta,
              observacao:  r.observacao || null,
            })),
          )
        }
        return { ok: true }
      }

      case 'apr': {
        const { error } = await (supabase as any).from('sms_aprs').insert({
          id:                 rec.id,
          obra_id:            rec.obra_id,
          tipo_atividade_id:  d.tipo_atividade_id,
          descricao_trabalho: d.descricao_trabalho,
          data:               d.data,
          hora_inicio:        d.hora_inicio || null,
          validade:           d.validade || null,
          emitente_id:        rec.employee_id,
          status:             'aberta',
          device_id:          d.device_id || null,
          sync_status:        'synced',
        })
        if (error) return { ok: false, error: error.message }
        const riscos = d.riscos_selecionados as Array<{ risco_id: string; resposta: string }> | undefined
        if (riscos?.length) {
          await (supabase as any).from('sms_apr_riscos_selecionados').insert(
            riscos.map(r => ({ apr_id: rec.id, risco_id: r.risco_id, resposta: r.resposta })),
          )
        }
        return { ok: true }
      }

      case 'rdo': {
        const { error } = await (supabase as any).from('sms_rdo').insert({
          id:                   rec.id,
          obra_id:              rec.obra_id,
          data:                 d.data,
          encarregado_id:       rec.employee_id,
          efetivo_presente:     d.efetivo_presente || 0,
          clima:                d.clima || null,
          atividades_executadas: d.atividades_executadas || null,
          status:               d.status || 'rascunho',
          device_id:            d.device_id || null,
          sync_status:          'synced',
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      }

      case 'near_miss': {
        const { error } = await (supabase as any).from('sms_near_miss').insert({
          id:              rec.id,
          obra_id:         rec.obra_id,
          registrado_por:  rec.employee_id,
          o_que_aconteceu: d.o_que_aconteceu,
          o_que_poderia:   d.o_que_poderia,
          local:           d.local || null,
          acao_imediata:   d.acao_imediata || null,
          causas:          d.causas || null,
          fotos,
          device_id:       d.device_id || null,
          sync_status:     'synced',
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      }

      case 'acidente': {
        const { error } = await (supabase as any).from('sms_acidentes').insert({
          id:               rec.id,
          obra_id:          rec.obra_id,
          registrado_por:   rec.employee_id,
          data_hora:        d.data_hora,
          tipo:             d.tipo,
          descricao:        d.descricao,
          lesao:            d.lesao || null,
          parte_corpo:      d.parte_corpo || null,
          afastamento:      d.afastamento || false,
          dias_afastamento: d.dias_afastamento || null,
          testemunhas:      d.testemunhas || null,
          cat_gerada:       d.cat_gerada || false,
          fotos,
          device_id:        d.device_id || null,
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      }

      case 'pt': {
        const { error } = await (supabase as any).from('sms_pt').insert({
          id:                rec.id,
          obra_id:           rec.obra_id,
          emitente_id:       rec.employee_id,
          tipo_pt:           d.tipo_pt,
          atividade:         d.atividade,
          local:             d.local,
          responsavel:       d.responsavel || null,
          equipe:            d.equipe || null,
          data_inicio:       d.data_inicio,
          data_fim:          d.data_fim || null,
          riscos:            d.riscos || [],
          epis_obrigatorios: d.epis_obrigatorios || [],
          status:            'aberta',
          device_id:         d.device_id || null,
          sync_status:       'synced',
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      }

      default:
        return { ok: false, error: `Tipo desconhecido: ${rec.type}` }
    }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message ?? 'Erro desconhecido' }
  }
}

// ── Sincroniza todos os pendentes ────────────────────────────────────────────
export async function syncAll(): Promise<{ synced: number; errors: number }> {
  const pending = await smsDb.getPending()
  let synced = 0, errors = 0
  for (const rec of pending) {
    const res = await syncRecord(rec)
    if (res.ok) { await smsDb.markSynced(rec.id); synced++ }
    else         { await smsDb.markError(rec.id, res.error ?? 'Erro'); errors++ }
  }
  return { synced, errors }
}

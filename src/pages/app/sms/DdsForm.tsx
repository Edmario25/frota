import { useEffect, useState } from "react"
import { supabase } from '@/integrations/supabase/client'
import { smsDb } from '@/lib/sms-offline-db'
import { ddsLocalDate } from '@/lib/dds'
import { DdsParticipants, type DdsParticipant, type DdsEmployee } from '@/components/sms/DdsParticipants'
import { FormShell, Field, inputCls, textareaCls, PhotoStrip, usePhotoCapture } from "./shared"

type Tema = { id: string; titulo: string; codigo_nr: string | null }

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras: { id: string; nome: string }[]
  temas?: Tema[]
  onSave: (type: 'dds', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

export function DdsForm({ employee, obraId, obras, temas = [], onSave, onBack }: Props) {
  const today = ddsLocalDate()
  const [obra, setObra]                 = useState(obraId || obras[0]?.id || '')
  const [temaId, setTemaId]             = useState(temas[0]?.id || '')
  const [data, setData]                 = useState(today)
  const [horaInicio, setHoraInicio]     = useState('')
  const [duracaoMin, setDuracaoMin]     = useState('10')
  const [participantes, setParticipantes] = useState<DdsParticipant[]>([])
  const [equipe, setEquipe] = useState<DdsEmployee[]>([])
  const [equipeLoading, setEquipeLoading] = useState(false)
  const [error, setError] = useState('')
  const [temaLivre, setTemaLivre] = useState('')
  const [frente, setFrente] = useState('')
  const [concluir, setConcluir] = useState(false)
  const [observacoes, setObs]           = useState('')
  const [saving, setSaving]             = useState(false)
  const foto = usePhotoCapture(3)

  useEffect(() => {
    let active = true;
    setEquipe([]); setParticipantes([]); setEquipeLoading(true); setError('');
    const key = `dds-equipe:${employee.id}:${obra}`;
    (async () => {
      try {
        if (!navigator.onLine) {
          const cached = await smsDb.getRef<DdsEmployee[]>(key);
          if (active) { setEquipe(cached ?? []); if (!cached) setError('Conecte-se à internet para carregar a equipe desta obra antes de trabalhar offline.'); }
        } else {
          const { data, error } = await (supabase as any).rpc('dds_equipe', { p_obra: obra });
          if (error) throw error;
          await smsDb.setRef(key, data ?? []);
          if (active) setEquipe(data ?? []);
        }
      } catch { if (active) setError('Não foi possível carregar a equipe. Confira a conexão e a atualização do banco.'); }
      finally { if (active) setEquipeLoading(false); }
    })();
    return () => { active = false; };
  }, [obra, employee.id]);

  const handleSave = async () => {
    if (!obra || (!temaId && !temaLivre.trim()) || !data || !Number.isInteger(Number(duracaoMin)) || Number(duracaoMin) <= 0) {
      setError('Informe obra, tema, data e duração válida.'); return;
    }
    if (concluir && (!horaInicio || !participantes.length || equipeLoading)) { setError('Para concluir, informe o horário e identifique os participantes.'); return; }
    setError('')
    setSaving(true)
    try { await onSave('dds', {
      obra_id:              obra,
      tema_id:              temaId || null,
      tema_livre:           temaLivre.trim() || null,
      frente_servico:       frente.trim() || null,
      data,
      hora_inicio:          horaInicio || null,
      duracao_min:          parseInt(duracaoMin) || 10,
      participantes,
      concluir,
      observacoes:          observacoes || null,
      condutor_nome:        employee.nome,
      fotos:                foto.photos,
      device_id:            navigator.userAgent.slice(0, 40),
    }) } catch { setError('Não foi possível guardar o DDS neste aparelho. Tente novamente.'); }
    finally { setSaving(false) }
  }

  return (
    <FormShell title="DDS — Diálogo de Segurança" emoji="💬" onBack={onBack} onSave={handleSave} saving={saving}>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {obras.length > 1 && (
        <Field label="Obra">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={obra} onChange={e => setObra(e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Field>
      )}

      <Field label="Tema *">
        <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={temaId} onChange={e => setTemaId(e.target.value)}>
          <option value="">Tema livre</option>
          {temas.map(t => (
            <option key={t.id} value={t.id}>
              {t.codigo_nr ? `[${t.codigo_nr}] ` : ''}{t.titulo}
            </option>
          ))}
        </select>
      </Field>
      {!temaId && <Field label="Título do tema livre *"><input className={inputCls} value={temaLivre} onChange={e => setTemaLivre(e.target.value)} /></Field>}
      <Field label="Frente de serviço"><input className={inputCls} value={frente} onChange={e => setFrente(e.target.value)} /></Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data *">
          <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
        </Field>
        <Field label="Hora início">
          <input type="time" className={inputCls} value={horaInicio} onChange={e => setHoraInicio(e.target.value)} />
        </Field>
      </div>

      <Field label="Duração (min)">
        <input type="number" min="1" className={inputCls} value={duracaoMin} onChange={e => setDuracaoMin(e.target.value)} />
      </Field>

      <Field label="Participantes da obra">{equipeLoading ? <p>Carregando equipe…</p> : <DdsParticipants equipe={equipe} value={participantes} onChange={setParticipantes} disabled={saving} />}</Field>
      <label className="flex gap-3 text-sm"><input type="checkbox" checked={concluir} onChange={e => setConcluir(e.target.checked)} />Concluir DDS ao sincronizar. Desmarcado: salvar rascunho.</label>
      <p className="text-xs text-gray-500">Sem internet, o DDS e a lista ficam pendentes neste aparelho. A conclusão só é confirmada após a sincronização.</p>

      <Field label="Observações">
        <textarea className={textareaCls} rows={2} value={observacoes} onChange={e => setObs(e.target.value)} />
      </Field>

      <PhotoStrip
        photos={foto.photos} onCapture={foto.capture} onRemove={foto.remove}
        canAdd={foto.canAdd} inputRef={foto.inputRef} onFileChange={foto.onFileChange}
      />

      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
        Encarregado: <strong>{employee.nome}</strong>
      </div>
    </FormShell>
  )
}

import { useState } from "react"
import { FormShell, Field, inputCls, textareaCls, PhotoStrip, usePhotoCapture } from "./shared"

type Tema = { id: string; titulo: string; codigo_nr: string | null }

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras: { id: string; nome: string }[]
  temas: Tema[]
  onSave: (type: 'dds', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

export function DdsForm({ employee, obraId, obras, temas, onSave, onBack }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [obra, setObra]                 = useState(obraId || obras[0]?.id || '')
  const [temaId, setTemaId]             = useState(temas[0]?.id || '')
  const [data, setData]                 = useState(today)
  const [horaInicio, setHoraInicio]     = useState('')
  const [duracaoMin, setDuracaoMin]     = useState('10')
  const [participantes, setParticipantes] = useState('')
  const [observacoes, setObs]           = useState('')
  const [saving, setSaving]             = useState(false)
  const foto = usePhotoCapture(3)

  const handleSave = async () => {
    if (!obra || !temaId || !data) return
    setSaving(true)
    await onSave('dds', {
      obra_id:              obra,
      tema_id:              temaId,
      data,
      hora_inicio:          horaInicio || null,
      duracao_min:          parseInt(duracaoMin) || 10,
      participantes_nomes:  participantes,
      observacoes:          observacoes || null,
      fotos:                foto.photos,
      device_id:            navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  return (
    <FormShell title="DDS — Diálogo de Segurança" emoji="💬" onBack={onBack} onSave={handleSave} saving={saving}>
      {obras.length > 1 && (
        <Field label="Obra">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={obra} onChange={e => setObra(e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Field>
      )}

      <Field label="Tema *">
        <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={temaId} onChange={e => setTemaId(e.target.value)}>
          {temas.map(t => (
            <option key={t.id} value={t.id}>
              {t.codigo_nr ? `[${t.codigo_nr}] ` : ''}{t.titulo}
            </option>
          ))}
        </select>
      </Field>

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

      <Field label="Participantes (nomes ou nº)">
        <textarea
          className={textareaCls}
          rows={3}
          placeholder="Ex: João, Maria, Carlos — ou apenas '12 trabalhadores'"
          value={participantes}
          onChange={e => setParticipantes(e.target.value)}
        />
      </Field>

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

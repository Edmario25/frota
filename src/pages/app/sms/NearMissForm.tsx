import { useState } from "react"
import { FormShell, Field, inputCls, textareaCls, PhotoStrip, usePhotoCapture } from "./shared"

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras: { id: string; nome: string }[]
  onSave: (type: 'near_miss', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

export function NearMissForm({ employee, obraId, obras, onSave, onBack }: Props) {
  const [obra, setObra]           = useState(obraId || obras[0]?.id || '')
  const [oQueAconteceu, setOQue]  = useState('')
  const [oPoderia, setOPoderia]   = useState('')
  const [local, setLocal]         = useState('')
  const [acaoImediata, setAcao]   = useState('')
  const [causas, setCausas]       = useState('')
  const [saving, setSaving]       = useState(false)
  const foto = usePhotoCapture(3)

  const handleSave = async () => {
    if (!obra || !oQueAconteceu.trim() || !oPoderia.trim()) return
    setSaving(true)
    await onSave('near_miss', {
      obra_id:         obra,
      o_que_aconteceu: oQueAconteceu,
      o_que_poderia:   oPoderia,
      local:           local || null,
      acao_imediata:   acaoImediata || null,
      causas:          causas || null,
      fotos:           foto.photos,
      device_id:       navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  return (
    <FormShell title="Near Miss — Quase Acidente" emoji="🚨" onBack={onBack} onSave={handleSave} saving={saving}>
      {/* Banner de orientação */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
        <strong>Near miss</strong> é um evento que NÃO causou lesão ou dano, mas <strong>poderia ter causado</strong> se as circunstâncias fossem ligeiramente diferentes.
      </div>

      {obras.length > 1 && (
        <Field label="Obra">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={obra} onChange={e => setObra(e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Field>
      )}

      <Field label="O que aconteceu? *">
        <textarea
          className={textareaCls}
          rows={3}
          placeholder="Descreva o evento que ocorreu..."
          value={oQueAconteceu}
          onChange={e => setOQue(e.target.value)}
        />
      </Field>

      <Field label="O que poderia ter acontecido? *">
        <textarea
          className={textareaCls}
          rows={3}
          placeholder="Qual seria a consequência se as circunstâncias fossem diferentes?"
          value={oPoderia}
          onChange={e => setOPoderia(e.target.value)}
        />
      </Field>

      <Field label="Local / área">
        <input type="text" className={inputCls} placeholder="Ex: Cobertura, Bloco B" value={local} onChange={e => setLocal(e.target.value)} />
      </Field>

      <Field label="Ação imediata tomada">
        <textarea className={textareaCls} rows={2} value={acaoImediata} onChange={e => setAcao(e.target.value)} />
      </Field>

      <Field label="Causas prováveis">
        <textarea
          className={textareaCls}
          rows={2}
          placeholder="Por que o evento ocorreu?"
          value={causas}
          onChange={e => setCausas(e.target.value)}
        />
      </Field>

      <PhotoStrip
        photos={foto.photos} onCapture={foto.capture} onRemove={foto.remove}
        canAdd={foto.canAdd} inputRef={foto.inputRef} onFileChange={foto.onFileChange}
      />

      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
        Registrado por: <strong>{employee.nome}</strong>
      </div>
    </FormShell>
  )
}

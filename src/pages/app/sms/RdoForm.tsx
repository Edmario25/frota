import { useState } from "react"
import { FormShell, Field, inputCls, textareaCls, PhotoStrip, usePhotoCapture } from "./shared"

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras: { id: string; nome: string }[]
  onSave: (type: 'rdo', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

const CONDICOES_TEMPO = [
  { value: 'sol', label: '☀️ Sol' },
  { value: 'nublado', label: '🌥 Nublado' },
  { value: 'chuva_leve', label: '🌦 Chuva leve' },
  { value: 'chuva_forte', label: '⛈ Chuva forte' },
  { value: 'vento_forte', label: '💨 Vento forte' },
]

const OCORRENCIAS_SMS = [
  { value: 'dds_realizado', label: 'DDS realizado' },
  { value: 'epi_entregue', label: 'EPI entregue' },
  { value: 'incidente', label: 'Incidente registrado' },
  { value: 'inspecao', label: 'Inspeção realizada' },
  { value: 'paralisacao_chuva', label: 'Paralisação por chuva' },
  { value: 'paralisacao_risco', label: 'Paralisação por risco' },
  { value: 'visita_fiscal', label: 'Visita de fiscalização' },
]

interface MaoDeObra {
  funcao: string
  quantidade: number
}

export function RdoForm({ employee, obraId, obras, onSave, onBack }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [obra, setObra]             = useState(obraId || obras[0]?.id || '')
  const [data, setData]             = useState(today)
  const [condicaoTempo, setTempo]   = useState('sol')
  const [horaInicio, setInicio]     = useState('07:00')
  const [horaFim, setFim]           = useState('17:00')
  const [atividadesHoje, setAtiv]   = useState('')
  const [maoDeObra, setMdo]         = useState<MaoDeObra[]>([{ funcao: '', quantidade: 1 }])
  const [ocorrenciasSms, setOcorr]  = useState<Record<string, boolean>>({})
  const [paralisacoes, setParal]    = useState('')
  const [observacoes, setObs]       = useState('')
  const [saving, setSaving]         = useState(false)
  const foto = usePhotoCapture(5)

  const addMdo = () => setMdo(p => [...p, { funcao: '', quantidade: 1 }])
  const removeMdo = (i: number) => setMdo(p => p.filter((_, idx) => idx !== i))
  const updateMdo = (i: number, field: 'funcao' | 'quantidade', v: string | number) =>
    setMdo(p => p.map((m, idx) => idx === i ? { ...m, [field]: v } : m))

  const toggleOcorr = (k: string) => setOcorr(p => ({ ...p, [k]: !p[k] }))

  const totalTrabalhadores = maoDeObra.reduce((s, m) => s + (m.quantidade || 0), 0)

  const handleSave = async () => {
    if (!obra || !atividadesHoje.trim()) return
    setSaving(true)
    await onSave('rdo', {
      obra_id:           obra,
      data,
      condicao_tempo:    condicaoTempo,
      hora_inicio:       horaInicio || null,
      hora_fim:          horaFim || null,
      atividades_hoje:   atividadesHoje,
      mao_de_obra:       maoDeObra.filter(m => m.funcao.trim()),
      total_trabalhadores: totalTrabalhadores,
      ocorrencias_sms:   Object.entries(ocorrenciasSms).filter(([, v]) => v).map(([k]) => k),
      paralisacoes:      paralisacoes || null,
      observacoes:       observacoes || null,
      responsavel_nome:  employee.nome,
      fotos:             foto.photos,
      device_id:         navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  return (
    <FormShell title="RDO — Relatório Diário de Obra" emoji="📝" onBack={onBack} onSave={handleSave} saving={saving}>
      {obras.length > 1 && (
        <Field label="Obra">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={obra} onChange={e => setObra(e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data *">
          <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
        </Field>
        <Field label="Condição do tempo">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={condicaoTempo} onChange={e => setTempo(e.target.value)}>
            {CONDICOES_TEMPO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Hora início">
          <input type="time" className={inputCls} value={horaInicio} onChange={e => setInicio(e.target.value)} />
        </Field>
        <Field label="Hora fim">
          <input type="time" className={inputCls} value={horaFim} onChange={e => setFim(e.target.value)} />
        </Field>
      </div>

      <Field label="Atividades executadas hoje *">
        <textarea
          className={textareaCls}
          rows={4}
          placeholder="Descreva os serviços realizados no dia..."
          value={atividadesHoje}
          onChange={e => setAtiv(e.target.value)}
        />
      </Field>

      {/* Mão de obra */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500">Mão de obra ({totalTrabalhadores} trabalhadores)</label>
          <button type="button" onClick={addMdo} className="text-xs text-green-700 font-semibold">+ Função</button>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl divide-y overflow-hidden">
          {maoDeObra.map((m, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5">
              <input
                type="text"
                className="flex-1 text-sm outline-none bg-transparent"
                placeholder="Função (ex: Pedreiro)"
                value={m.funcao}
                onChange={e => updateMdo(i, 'funcao', e.target.value)}
              />
              <input
                type="number"
                min={1}
                className="w-14 text-sm text-center border border-gray-200 rounded-lg px-1 py-1 outline-none"
                value={m.quantidade}
                onChange={e => updateMdo(i, 'quantidade', parseInt(e.target.value) || 1)}
              />
              {maoDeObra.length > 1 && (
                <button type="button" onClick={() => removeMdo(i)} className="text-gray-400 text-lg leading-none">×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Field label="Ocorrências de SMS">
        <div className="bg-white border border-gray-200 rounded-xl divide-y">
          {OCORRENCIAS_SMS.map(o => (
            <label key={o.value} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={!!ocorrenciasSms[o.value]} onChange={() => toggleOcorr(o.value)} className="h-4 w-4 accent-green-600" />
              <span className="text-sm">{o.label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Paralisações / impedimentos">
        <textarea
          className={textareaCls}
          rows={2}
          placeholder="Houve paralisação? Causa e duração..."
          value={paralisacoes}
          onChange={e => setParal(e.target.value)}
        />
      </Field>

      <Field label="Observações gerais">
        <textarea className={textareaCls} rows={2} value={observacoes} onChange={e => setObs(e.target.value)} />
      </Field>

      <PhotoStrip
        photos={foto.photos} onCapture={foto.capture} onRemove={foto.remove}
        canAdd={foto.canAdd} inputRef={foto.inputRef} onFileChange={foto.onFileChange}
      />

      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
        Responsável: <strong>{employee.nome}</strong>
      </div>
    </FormShell>
  )
}

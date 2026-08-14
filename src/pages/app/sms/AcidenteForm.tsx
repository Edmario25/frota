import { useState } from "react"
import { FormShell, Field, inputCls, textareaCls, PhotoStrip, usePhotoCapture } from "./shared"

type Veiculo = { id: string; placa: string; marca: string; modelo: string }

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras: { id: string; nome: string }[]
  veiculos?: Veiculo[]
  preselectedVehicleId?: string
  onSave: (type: 'acidente', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

const TIPOS = [
  { value: 'acidente_tipico',       label: 'Acidente típico' },
  { value: 'incidente_perigoso',    label: 'Incidente perigoso' },
  { value: 'primeiros_socorros',    label: 'Primeiros socorros' },
  { value: 'doenca_ocupacional',    label: 'Doença ocupacional' },
  { value: 'acidente_trajeto',      label: 'Acidente de trajeto' },
]

const PARTES_CORPO = [
  'Cabeça / crânio', 'Olhos', 'Nariz / face', 'Pescoço', 'Ombro', 'Braço / antebraço',
  'Cotovelo', 'Mão / punho', 'Dedo(s)', 'Tórax / costelas', 'Abdômen', 'Coluna',
  'Quadril', 'Coxa', 'Joelho', 'Perna / pé', 'Tornozelo', 'Dedo(s) do pé', 'Múltiplas',
]

export function AcidenteForm({ employee, obraId, obras, veiculos = [], preselectedVehicleId, onSave, onBack }: Props) {
  const now = new Date()
  const localDT = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

  const [obra, setObra]           = useState(obraId || obras[0]?.id || '')
  const [veiculoId, setVeiculoId] = useState(preselectedVehicleId ?? '')
  const [tipo, setTipo]           = useState('acidente_tipico')
  const [dataHora, setDataHora]   = useState(localDT)
  const [descricao, setDescricao] = useState('')
  const [lesao, setLesao]         = useState('')
  const [parteCorpo, setParte]    = useState('')
  const [afastamento, setAfasta]  = useState(false)
  const [diasAfasta, setDias]     = useState('')
  const [testemunhas, setTest]    = useState('')
  const [catGerada, setCat]       = useState(false)
  const [saving, setSaving]       = useState(false)
  const foto = usePhotoCapture(5)

  const handleSave = async () => {
    if (!obra || !descricao.trim()) return
    setSaving(true)
    await onSave('acidente', {
      obra_id:          obra,
      veiculo_id:       veiculoId || null,
      tipo,
      data_hora:        new Date(dataHora).toISOString(),
      descricao,
      lesao:            lesao || null,
      parte_corpo:      parteCorpo || null,
      afastamento,
      dias_afastamento: afastamento ? parseInt(diasAfasta) || null : null,
      testemunhas:      testemunhas || null,
      cat_gerada:       catGerada,
      fotos:            foto.photos,
      device_id:        navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  return (
    <FormShell title="Acidente / Incidente" emoji="🏥" onBack={onBack} onSave={handleSave} saving={saving}>
      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800">
        Em caso de acidente grave: <strong>ligue 192 (SAMU)</strong> ou <strong>193 (Bombeiros)</strong> antes de registrar.
      </div>

      {obras.length > 1 && (
        <Field label="Obra">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={obra} onChange={e => setObra(e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Field>
      )}

      {veiculos.length > 0 && (
        <Field label="🚗 Veículo envolvido">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={veiculoId} onChange={e => setVeiculoId(e.target.value)}>
            <option value="">— Nenhum veículo envolvido —</option>
            {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>)}
          </select>
        </Field>
      )}

      <Field label="Tipo *">
        <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={tipo} onChange={e => setTipo(e.target.value)}>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>

      <Field label="Data e hora do evento *">
        <input type="datetime-local" className={inputCls} value={dataHora} onChange={e => setDataHora(e.target.value)} />
      </Field>

      <Field label="Descrição do evento *">
        <textarea className={textareaCls} rows={3} placeholder="O que aconteceu? Como ocorreu?" value={descricao} onChange={e => setDescricao(e.target.value)} />
      </Field>

      <Field label="Tipo de lesão">
        <input type="text" className={inputCls} placeholder="Ex: Corte, fratura, contusão, entorse..." value={lesao} onChange={e => setLesao(e.target.value)} />
      </Field>

      <Field label="Parte do corpo atingida">
        <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={parteCorpo} onChange={e => setParte(e.target.value)}>
          <option value="">— Selecione —</option>
          {PARTES_CORPO.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>

      <Field label="Afastamento">
        <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 cursor-pointer">
          <input type="checkbox" checked={afastamento} onChange={e => setAfasta(e.target.checked)} className="h-4 w-4 accent-green-600" />
          <span className="text-sm">Gerou afastamento do trabalho</span>
        </label>
        {afastamento && (
          <input
            type="number" min="1"
            className={`${inputCls} mt-2`}
            placeholder="Nº de dias de afastamento"
            value={diasAfasta}
            onChange={e => setDias(e.target.value)}
          />
        )}
      </Field>

      <Field label="Testemunhas">
        <input type="text" className={inputCls} placeholder="Nomes das testemunhas" value={testemunhas} onChange={e => setTest(e.target.value)} />
      </Field>

      <Field label="CAT">
        <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 cursor-pointer">
          <input type="checkbox" checked={catGerada} onChange={e => setCat(e.target.checked)} className="h-4 w-4 accent-green-600" />
          <span className="text-sm">CAT (Comunicação de Acidente de Trabalho) gerada</span>
        </label>
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

import { useState } from "react"
import { FormShell, Field, inputCls, textareaCls, ChipGroup, PhotoStrip, usePhotoCapture } from "./shared"

type Veiculo = { id: string; placa: string; marca: string; modelo: string }

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras: { id: string; nome: string }[]
  veiculos?: Veiculo[]
  preselectedVehicleId?: string
  onSave: (type: 'desvio', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

const TIPOS = [
  { value: 'condicao_insegura', label: 'Condição insegura' },
  { value: 'ato_inseguro',      label: 'Ato inseguro' },
  { value: 'quase_acidente',    label: 'Quase acidente' },
  { value: 'nao_conformidade',  label: 'Não conformidade' },
  { value: 'melhoria',          label: 'Melhoria' },
] as const

const GRAVIDADES = [
  { value: 'baixa',   label: 'Baixa',   color: 'bg-green-600 border-green-600' },
  { value: 'media',   label: 'Média',   color: 'bg-yellow-500 border-yellow-500' },
  { value: 'alta',    label: 'Alta',    color: 'bg-orange-500 border-orange-500' },
  { value: 'critica', label: 'Crítica', color: 'bg-red-600 border-red-600' },
] as const

export function DesvioForm({ employee, obraId, obras, veiculos = [], preselectedVehicleId, onSave, onBack }: Props) {
  const [obra, setObra]               = useState(obraId || obras[0]?.id || '')
  const [veiculoId, setVeiculoId]     = useState(preselectedVehicleId ?? '')
  const [tipo, setTipo]               = useState<string>('condicao_insegura')
  const [descricao, setDescricao]     = useState('')
  const [local, setLocal]             = useState('')
  const [gravidade, setGravidade]     = useState<string>('media')
  const [acaoImediata, setAcao]       = useState('')
  const [saving, setSaving]           = useState(false)
  const foto = usePhotoCapture(3)

  const handleSave = async () => {
    if (!obra || !descricao.trim()) return
    setSaving(true)
    await onSave('desvio', {
      obra_id:        obra,
      veiculo_id:     veiculoId || null,
      tipo,
      descricao,
      local:          local || null,
      gravidade,
      acao_imediata:  acaoImediata || null,
      data_abertura:  new Date().toISOString().split('T')[0],
      fotos:          foto.photos,
      device_id:      navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  return (
    <FormShell title="Registrar Desvio" emoji="⚠️" onBack={onBack} onSave={handleSave} saving={saving}>
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
        <div className="flex flex-col gap-2">
          {TIPOS.map(t => (
            <label key={t.value} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${tipo === t.value ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <input type="radio" name="tipo" value={t.value} checked={tipo === t.value} onChange={() => setTipo(t.value)} className="accent-green-600" />
              <span className="text-sm">{t.label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Gravidade *">
        <ChipGroup options={GRAVIDADES} value={gravidade} onChange={setGravidade} />
      </Field>

      <Field label="Descrição do desvio *">
        <textarea
          className={textareaCls}
          rows={3}
          placeholder="Descreva o que foi observado..."
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
        />
      </Field>

      <Field label="Local / área">
        <input type="text" className={inputCls} placeholder="Ex: Bloco A, 3º andar" value={local} onChange={e => setLocal(e.target.value)} />
      </Field>

      <Field label="Ação imediata tomada">
        <textarea className={textareaCls} rows={2} placeholder="O que foi feito no momento?" value={acaoImediata} onChange={e => setAcao(e.target.value)} />
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

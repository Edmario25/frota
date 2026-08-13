import { useState } from "react"
import { FormShell, Field, inputCls, textareaCls } from "./shared"

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras: { id: string; nome: string }[]
  onSave: (type: 'pt', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

const TIPOS_PT = [
  { value: 'trabalho_altura',   label: '🧗 Trabalho em altura (NR-35)' },
  { value: 'espaco_confinado',  label: '🕳 Espaço confinado (NR-33)' },
  { value: 'eletrica',          label: '⚡ Atividade elétrica (NR-10)' },
  { value: 'icamento',          label: '🏗 Içamento de carga' },
  { value: 'trabalho_quente',   label: '🔥 Trabalho a quente (solda)' },
  { value: 'outros',            label: '📋 Outros' },
]

const RISCOS_POR_TIPO: Record<string, string[]> = {
  trabalho_altura: ['Queda de altura', 'Queda de objetos', 'Condições climáticas adversas', 'Falha no sistema de ancoragem'],
  espaco_confinado: ['Atmosfera deficiente de O₂', 'Gases tóxicos', 'Engolfamento', 'Temperatura extrema'],
  eletrica: ['Choque elétrico', 'Arco elétrico', 'Queimaduras', 'Incêndio'],
  icamento: ['Queda de carga', 'Colisão com estruturas', 'Falha de equipamento', 'Área de balancim'],
  trabalho_quente: ['Incêndio', 'Explosão', 'Queimaduras', 'Gases tóxicos da solda'],
  outros: ['Risco físico', 'Risco químico', 'Risco ergonômico', 'Risco de queda'],
}

const EPIS_POR_TIPO: Record<string, string[]> = {
  trabalho_altura: ['Capacete com jugular', 'Cinto de segurança tipo paraquedista', 'Trava-queda', 'Luvas', 'Calçado de segurança'],
  espaco_confinado: ['Máscara de fuga', 'Cinturão de resgate', 'Detector de gases', 'Luvas', 'Capacete'],
  eletrica: ['Luvas isolantes', 'Capacete classe B', 'Óculos de proteção', 'Calçado dielétrico', 'Vestimenta antiarco'],
  icamento: ['Capacete', 'Calçado de segurança', 'Colete refletivo', 'Luvas'],
  trabalho_quente: ['Máscara de solda', 'Luvas de raspa', 'Avental de raspa', 'Calçado de segurança', 'Perneiras'],
  outros: ['Capacete', 'Calçado de segurança', 'Luvas', 'Óculos de proteção'],
}

export function PtForm({ employee, obraId, obras, onSave, onBack }: Props) {
  const now = new Date()
  const localDT = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

  const [obra, setObra]           = useState(obraId || obras[0]?.id || '')
  const [tipoPt, setTipoPt]       = useState('trabalho_altura')
  const [atividade, setAtiv]      = useState('')
  const [local, setLocal]         = useState('')
  const [responsavel, setResp]    = useState('')
  const [equipe, setEquipe]       = useState('')
  const [dataInicio, setInicio]   = useState(localDT)
  const [dataFim, setFim]         = useState('')
  const [riscosCheck, setRiscos]  = useState<Record<string, boolean>>({})
  const [episCheck, setEpis]      = useState<Record<string, boolean>>({})
  const [saving, setSaving]       = useState(false)

  const riscosDisponiveis = RISCOS_POR_TIPO[tipoPt] ?? []
  const episDisponiveis   = EPIS_POR_TIPO[tipoPt] ?? []

  const toggleRisco = (r: string) => setRiscos(p => ({ ...p, [r]: !p[r] }))
  const toggleEpi   = (e: string) => setEpis(p => ({ ...p, [e]: !p[e] }))

  const handleSave = async () => {
    if (!obra || !atividade.trim() || !local.trim()) return
    setSaving(true)
    await onSave('pt', {
      obra_id:          obra,
      tipo_pt:          tipoPt,
      atividade,
      local,
      responsavel:      responsavel || null,
      equipe:           equipe || null,
      data_inicio:      new Date(dataInicio).toISOString(),
      data_fim:         dataFim ? new Date(dataFim).toISOString() : null,
      riscos:           riscosDisponiveis.filter(r => riscosCheck[r]),
      epis_obrigatorios: episDisponiveis.filter(e => episCheck[e]),
      device_id:        navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  return (
    <FormShell title="Permissão de Trabalho" emoji="🔑" onBack={onBack} onSave={handleSave} saving={saving}>
      {obras.length > 1 && (
        <Field label="Obra">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={obra} onChange={e => setObra(e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Field>
      )}

      <Field label="Tipo de PT *">
        <div className="space-y-2">
          {TIPOS_PT.map(t => (
            <label key={t.value} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${tipoPt === t.value ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <input type="radio" name="tipo_pt" value={t.value} checked={tipoPt === t.value} onChange={() => setTipoPt(t.value)} className="accent-green-600" />
              <span className="text-sm">{t.label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Atividade a executar *">
        <textarea className={textareaCls} rows={2} placeholder="Descreva detalhadamente o trabalho" value={atividade} onChange={e => setAtiv(e.target.value)} />
      </Field>

      <Field label="Local / setor *">
        <input type="text" className={inputCls} value={local} onChange={e => setLocal(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Responsável">
          <input type="text" className={inputCls} placeholder="Nome" value={responsavel} onChange={e => setResp(e.target.value)} />
        </Field>
        <Field label="Equipe">
          <input type="text" className={inputCls} placeholder="Nomes ou nº" value={equipe} onChange={e => setEquipe(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Início *">
          <input type="datetime-local" className={inputCls} value={dataInicio} onChange={e => setInicio(e.target.value)} />
        </Field>
        <Field label="Término previsto">
          <input type="datetime-local" className={inputCls} value={dataFim} onChange={e => setFim(e.target.value)} />
        </Field>
      </div>

      <Field label="Riscos identificados">
        <div className="bg-white border border-gray-200 rounded-xl divide-y">
          {riscosDisponiveis.map(r => (
            <label key={r} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={!!riscosCheck[r]} onChange={() => toggleRisco(r)} className="h-4 w-4 accent-red-500" />
              <span className="text-sm">{r}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="EPIs obrigatórios">
        <div className="bg-white border border-gray-200 rounded-xl divide-y">
          {episDisponiveis.map(e => (
            <label key={e} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={!!episCheck[e]} onChange={() => toggleEpi(e)} className="h-4 w-4 accent-green-600" />
              <span className="text-sm">{e}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
        Emitente: <strong>{employee.nome}</strong>
      </div>
    </FormShell>
  )
}

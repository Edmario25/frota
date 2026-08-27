import { useState } from "react"
import { FormShell, Field, inputCls, textareaCls } from "./shared"

type TipoAtiv = { id: string; nome: string }
type Risco    = { id: string; risco: string; categoria: string; recomendacao: string | null }

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras:  { id: string; nome: string }[]
  tiposAtividade: TipoAtiv[]
  riscosCatalogo: Risco[]
  onSave: (type: 'apr', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

export function AprForm({ employee, obraId, obras, tiposAtividade, riscosCatalogo, onSave, onBack }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [obra, setObra]         = useState(obraId || obras[0]?.id || '')
  const [tipoId, setTipoId]     = useState(tiposAtividade[0]?.id || '')
  const [descTrabalho, setDesc] = useState('')
  const [data, setData]         = useState(today)
  const [horaInicio, setHora]   = useState('')
  const [validade, setValidade] = useState('')
  const [respostas, setResp]    = useState<Record<string, 'S' | 'N' | 'NA'>>({})
  const [saving, setSaving]     = useState(false)
  const [validation, setValidation] = useState('')

  const riscosFiltrados = riscosCatalogo.filter(r =>
    tiposAtividade.find(t => t.id === tipoId)
      ? true  // se tiver catálogo online mostra por tipo
      : true,
  )

  const setResposta = (id: string, v: 'S' | 'N' | 'NA') =>
    setResp(p => ({ ...p, [id]: v }))

  const handleSave = async () => {
    if (!obra || !tipoId || !descTrabalho.trim()) {
      setValidation('Informe a obra, a atividade e a descrição do trabalho.')
      return
    }
    if (riscosFiltrados.length > 0 && Object.keys(respostas).length !== riscosFiltrados.length) {
      setValidation('Avalie todos os riscos como Sim, Não ou Não aplicável antes de concluir.')
      return
    }
    if (riscosFiltrados.length > 0 && !Object.values(respostas).includes('S')) {
      setValidation('Identifique ao menos um risco aplicável ou revise a atividade selecionada.')
      return
    }
    setValidation('')
    setSaving(true)
    await onSave('apr', {
      obra_id:           obra,
      tipo_atividade_id: tipoId,
      descricao_trabalho: descTrabalho,
      data,
      hora_inicio:       horaInicio || null,
      validade:          validade || null,
      responsavel_nome:  employee.nome,
      riscos_selecionados: Object.entries(respostas).map(([risco_id, resposta]) => ({ risco_id, resposta })),
      device_id:         navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  const catLabel: Record<string, string> = {
    fisico: '⚡ Físico', quimico: '☣️ Químico',
    biologico: '🦠 Biológico', ergonomico: '🏋️ Ergonômico', acidente: '⚠️ Acidente',
  }
  const grupos = riscosFiltrados.reduce<Record<string, Risco[]>>((acc, r) => {
    if (!acc[r.categoria]) acc[r.categoria] = []
    acc[r.categoria].push(r)
    return acc
  }, {})

  return (
    <FormShell title="APR — Análise Preliminar de Risco" emoji="📋" onBack={onBack} onSave={handleSave} saving={saving}>
      {validation && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">{validation}</div>}
      {obras.length > 1 && (
        <Field label="Obra">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={obra} onChange={e => setObra(e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Field>
      )}

      <Field label="Tipo de atividade *">
        <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={tipoId} onChange={e => setTipoId(e.target.value)}>
          {tiposAtividade.length === 0
            ? <option value="">— Sem conexão —</option>
            : tiposAtividade.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)
          }
        </select>
      </Field>

      <Field label="Descrição do trabalho *">
        <textarea className={textareaCls} rows={2} placeholder="Descreva o serviço a executar" value={descTrabalho} onChange={e => setDesc(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data *">
          <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
        </Field>
        <Field label="Hora início">
          <input type="time" className={inputCls} value={horaInicio} onChange={e => setHora(e.target.value)} />
        </Field>
      </div>

      <Field label="Válida até">
        <input type="date" className={inputCls} value={validade} onChange={e => setValidade(e.target.value)} />
      </Field>

      {Object.keys(grupos).length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Riscos identificados</label>
          <div className="space-y-4">
            {Object.entries(grupos).map(([cat, riscos]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-gray-600 mb-1">{catLabel[cat] ?? cat}</p>
                <div className="bg-white border border-gray-200 rounded-xl divide-y">
                  {riscos.map(r => (
                    <div key={r.id} className="px-3 py-2.5">
                      <p className="text-sm font-medium text-gray-800">{r.risco}</p>
                      {r.recomendacao && <p className="text-xs text-gray-500 mt-0.5">{r.recomendacao}</p>}
                      <div className="flex gap-3 mt-2">
                        {(['S', 'N', 'NA'] as const).map(v => (
                          <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name={`r-${r.id}`} checked={respostas[r.id] === v}
                              onChange={() => setResposta(r.id, v)} className="accent-green-600" />
                            <span className="text-xs font-medium">{v === 'NA' ? 'N/A' : v}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
        Emitente: <strong>{employee.nome}</strong>
      </div>
    </FormShell>
  )
}

import { useState } from "react"
import { FormShell, Field, inputCls, textareaCls, PhotoStrip, usePhotoCapture } from "./shared"

type CatalogoInspecao = { id: string; nome: string }
type ItemCatalogo = { id: string; catalogo_id: string; item: string; criterio?: string | null }

type Veiculo = { id: string; placa: string; marca: string; modelo: string }

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  obras: { id: string; nome: string }[]
  veiculos?: Veiculo[]
  preselectedVehicleId?: string
  catalogoInspecoes: CatalogoInspecao[]
  itensCatalogo: ItemCatalogo[]
  onSave: (type: 'inspecao', data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

type Resp = 'C' | 'NC' | 'NA'

const TIPOS_PADRAO = [
  { id: 'epi', nome: 'EPIs e equipamentos de proteção' },
  { id: 'andaimes', nome: 'Andaimes e plataformas de trabalho' },
  { id: 'ferramentas', nome: 'Ferramentas e máquinas' },
  { id: 'organizacao', nome: 'Organização e limpeza do local' },
  { id: 'sinalizacao', nome: 'Sinalização e delimitação' },
  { id: 'eletrica', nome: 'Instalações elétricas provisórias' },
]
const ITENS_PADRAO: Record<string, string[]> = {
  epi: ['Capacete em bom estado', 'Calçado de segurança', 'Luvas adequadas', 'Óculos de proteção quando necessário', 'Cinto de segurança (trabalho em altura)', 'Máscara de proteção respiratória'],
  andaimes: ['Travamentos e travas instalados', 'Rodapés e guarda-corpos presentes', 'Chão firme / base adequada', 'Capacidade de carga não excedida'],
  ferramentas: ['Ferramentas com cabo em bom estado', 'Guardas de proteção instaladas', 'Equipamento com tag de inspeção válida'],
  organizacao: ['Materiais empilhados com segurança', 'Vias de acesso desobstruídas', 'Área livre de entulho e óleo', 'DML organizado'],
  sinalizacao: ['Área delimitada com fita ou cone', 'Placa de perigo visível', 'Iluminação adequada'],
  eletrica: ['Quadro com DPS e DR instalados', 'Cabos sem emendas expostas', 'Tomadas com proteção', 'Aterramento verificado'],
}

export function InspecaoForm({ employee, obraId, obras, veiculos = [], preselectedVehicleId, catalogoInspecoes, itensCatalogo, onSave, onBack }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [obra, setObra]             = useState(obraId || obras[0]?.id || '')
  const [veiculoId, setVeiculoId]   = useState(preselectedVehicleId ?? '')
  const [tipo, setTipo]             = useState(
    catalogoInspecoes.length > 0 ? catalogoInspecoes[0].id : TIPOS_PADRAO[0].id,
  )
  const [area, setArea]             = useState('')
  const [data, setData]             = useState(today)
  const [hora, setHora]             = useState('')
  const [respostas, setResp]        = useState<Record<string, Resp>>({})
  const [obsGeral, setObs]          = useState('')
  const [saving, setSaving]         = useState(false)
  const foto = usePhotoCapture(5)

  const usandoCatalogo = catalogoInspecoes.length > 0
  const itensDoTipo: { id: string; item: string; criterio?: string | null }[] = usandoCatalogo
    ? itensCatalogo.filter(i => i.catalogo_id === tipo)
    : (ITENS_PADRAO[tipo] ?? []).map((item, idx) => ({ id: `${tipo}-${idx}`, item, criterio: null }))

  const setResposta = (id: string, v: Resp) => setResp(p => ({ ...p, [id]: v }))

  const countNC = Object.values(respostas).filter(v => v === 'NC').length
  const countC  = Object.values(respostas).filter(v => v === 'C').length

  const handleSave = async () => {
    if (!obra || !area.trim()) return
    setSaving(true)
    await onSave('inspecao', {
      obra_id:    obra,
      veiculo_id: veiculoId || null,
      catalogo_id: usandoCatalogo ? tipo : null,
      tipo_nome:  usandoCatalogo
        ? catalogoInspecoes.find(c => c.id === tipo)?.nome
        : TIPOS_PADRAO.find(t => t.id === tipo)?.nome,
      area,
      data,
      hora:       hora || null,
      itens: itensDoTipo.map(i => ({
        item_id:   i.id,
        descricao: i.item,
        resposta:  respostas[i.id] ?? 'NA',
      })),
      total_c:  countC,
      total_nc: countNC,
      obs_geral:  obsGeral || null,
      responsavel_nome: employee.nome,
      fotos:      foto.photos,
      device_id:  navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  const tipos = usandoCatalogo ? catalogoInspecoes : TIPOS_PADRAO

  return (
    <FormShell title="Inspeção de Segurança" emoji="🔍" onBack={onBack} onSave={handleSave} saving={saving}>
      {obras.length > 1 && (
        <Field label="Obra">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={obra} onChange={e => setObra(e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Field>
      )}

      {veiculos.length > 0 && (
        <Field label="🚗 Veículo inspecionado">
          <select className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm`} value={veiculoId} onChange={e => setVeiculoId(e.target.value)}>
            <option value="">— Não é inspeção de veículo —</option>
            {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>)}
          </select>
        </Field>
      )}

      <Field label="Tipo de inspeção *">
        <div className="flex flex-col gap-2">
          {tipos.map(t => (
            <label key={t.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${tipo === t.id ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <input type="radio" name="tipo_insp" value={t.id} checked={tipo === t.id} onChange={() => { setTipo(t.id); setResp({}) }} className="accent-green-600" />
              <span className="text-sm">{t.nome}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Área / setor inspecionado *">
        <input type="text" className={inputCls} placeholder="Ex: Bloco A, 3º andar" value={area} onChange={e => setArea(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data *">
          <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
        </Field>
        <Field label="Hora">
          <input type="time" className={inputCls} value={hora} onChange={e => setHora(e.target.value)} />
        </Field>
      </div>

      {itensDoTipo.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500">Itens da inspeção</label>
            {Object.keys(respostas).length > 0 && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${countNC > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {countC}C · {countNC}NC
              </span>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl divide-y">
            {itensDoTipo.map(item => (
              <div key={item.id} className="px-3 py-3">
                <p className="text-sm font-medium text-gray-800">{item.item}</p>
                {item.criterio && <p className="text-xs text-gray-400 mt-0.5">{item.criterio}</p>}
                <div className="flex gap-3 mt-2">
                  {(['C', 'NC', 'NA'] as Resp[]).map(v => {
                    const colors = {
                      C: 'accent-green-600',
                      NC: 'accent-red-500',
                      NA: 'accent-gray-400',
                    }
                    return (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`item-${item.id}`}
                          checked={respostas[item.id] === v}
                          onChange={() => setResposta(item.id, v)}
                          className={colors[v]}
                        />
                        <span className={`text-xs font-semibold ${
                          v === 'C' ? 'text-green-700' :
                          v === 'NC' ? 'text-red-600' : 'text-gray-500'
                        }`}>{v}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">C = Conforme · NC = Não Conforme · NA = Não Aplicável</p>
        </div>
      )}

      <Field label="Observações gerais">
        <textarea className={textareaCls} rows={2} placeholder="Pontos de atenção, recomendações..." value={obsGeral} onChange={e => setObs(e.target.value)} />
      </Field>

      <PhotoStrip
        photos={foto.photos} onCapture={foto.capture} onRemove={foto.remove}
        canAdd={foto.canAdd} inputRef={foto.inputRef} onFileChange={foto.onFileChange}
      />

      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
        Inspetor: <strong>{employee.nome}</strong>
      </div>
    </FormShell>
  )
}

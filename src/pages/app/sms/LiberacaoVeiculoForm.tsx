import { useState } from "react"

// ─── Checklist de Liberação ───────────────────────────────────────────────────

const CHECKLIST: { categoria: string; emoji: string; items: { id: string; item: string }[] }[] = [
  {
    categoria: "Documentação",
    emoji: "📄",
    items: [
      { id: "doc-crlv",     item: "CRLV do veículo em dia" },
      { id: "doc-cnh",      item: "CNH do condutor válida e categoria adequada" },
      { id: "doc-vistoria", item: "Laudo de vistoria dentro da validade" },
    ],
  },
  {
    categoria: "Condições Mecânicas",
    emoji: "🔧",
    items: [
      { id: "mec-pneus",    item: "Pneus em bom estado (pressão e desgaste)" },
      { id: "mec-freios",   item: "Freios com funcionamento adequado" },
      { id: "mec-oleo",     item: "Nível de óleo verificado" },
      { id: "mec-agua",     item: "Nível de água do radiador verificado" },
      { id: "mec-luzes",    item: "Faróis, lanternas e sinalizadores funcionando" },
      { id: "mec-buzina",   item: "Buzina em funcionamento" },
      { id: "mec-limpador", item: "Limpadores de para-brisa funcionando" },
      { id: "mec-espelhos", item: "Retrovisores intactos e regulados" },
    ],
  },
  {
    categoria: "Teste de Fumaça / Emissões",
    emoji: "💨",
    items: [
      { id: "fumaca-realizado", item: "Teste de fumaça realizado" },
      { id: "fumaca-resultado", item: "Resultado dentro do padrão (opacidade < 50%)" },
    ],
  },
  {
    categoria: "Equipamentos de Segurança",
    emoji: "🧯",
    items: [
      { id: "seg-extintor",   item: "Extintor de incêndio presente e com validade" },
      { id: "seg-triangulo",  item: "Triângulo de sinalização presente" },
      { id: "seg-macaco",     item: "Macaco e chave de roda disponíveis" },
      { id: "seg-cinto",      item: "Cinto de segurança em todos os assentos" },
      { id: "seg-primeiros",  item: "Kit de primeiros socorros (se exigido)" },
    ],
  },
  {
    categoria: "EPI e Higiene",
    emoji: "🦺",
    items: [
      { id: "epi-colete",  item: "Colete refletivo disponível para o condutor" },
      { id: "epi-limpo",   item: "Interior limpo e organizado" },
      { id: "epi-vidros",  item: "Para-brisas e retrovisores limpos" },
    ],
  },
]

type Resp = "C" | "NC" | "NA"

type Veiculo = { id: string; placa: string; marca: string; modelo: string }

interface Props {
  employee:   { id: string; nome: string }
  obraId:     string
  obras:      { id: string; nome: string }[]
  veiculos:   Veiculo[]
  preselectedVehicleId?: string
  onSave: (type: "inspecao", data: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiberacaoVeiculoForm({
  employee, obraId, obras, veiculos, preselectedVehicleId, onSave, onBack,
}: Props) {
  const today = new Date().toISOString().split("T")[0]
  const nowTime = new Date().toTimeString().slice(0, 5)

  const [obra,       setObra]    = useState(obraId || obras[0]?.id || "")
  const [veiculoId,  setVeic]    = useState(preselectedVehicleId ?? "")
  const [condutor,   setCond]    = useState("")
  const [data,       setData]    = useState(today)
  const [hora,       setHora]    = useState(nowTime)
  const [respostas,  setResp]    = useState<Record<string, Resp>>({})
  const [obsItem,    setObsItem] = useState<Record<string, string>>({})
  const [obsGeral,   setObs]     = useState("")
  const [saving,     setSaving]  = useState(false)
  const [expandObs,  setExpObs]  = useState<string | null>(null)

  const veiculo = veiculos.find(v => v.id === veiculoId) ?? null

  // ── Computa resultado ────────────────────────────────────────────────────────
  const todosItens = CHECKLIST.flatMap(c => c.items)
  const totalNC    = todosItens.filter(i => respostas[i.id] === "NC").length
  const totalC     = todosItens.filter(i => respostas[i.id] === "C").length
  const totalNA    = todosItens.filter(i => respostas[i.id] === "NA").length
  const respondidos = totalC + totalNC + totalNA

  const resultado: "liberado" | "bloqueado" | "pendente" =
    totalNC > 0 ? "bloqueado" : totalC > 0 ? "liberado" : "pendente"

  const resultadoCfg = {
    liberado:  { label: "LIBERADO ✅",         bg: "bg-green-600", txt: "text-white" },
    bloqueado: { label: `BLOQUEADO 🚫 (${totalNC} NC)`, bg: "bg-red-600",   txt: "text-white" },
    pendente:  { label: "PREENCHA O CHECKLIST", bg: "bg-gray-200",  txt: "text-gray-600" },
  }[resultado]

  // ── Helpers de resposta ──────────────────────────────────────────────────────
  const setResposta = (id: string, v: Resp) =>
    setResp(p => ({ ...p, [id]: v }))

  const btnCls = (id: string, v: Resp) => {
    const active = respostas[id] === v
    const base = "flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-colors"
    if (v === "C")  return `${base} ${active ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500"}`
    if (v === "NC") return `${base} ${active ? "bg-red-600  text-white" : "bg-gray-100 text-gray-500"}`
    return              `${base} ${active ? "bg-gray-400 text-white"  : "bg-gray-100 text-gray-500"}`
  }

  // ── Salvar ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!obra || !veiculoId) return
    setSaving(true)
    await onSave("inspecao", {
      obra_id:        obra,
      veiculo_id:     veiculoId,
      checklist_id:   "liberacao_veiculo",
      tipo:           "liberacao_veiculo",
      data,
      hora:           hora || null,
      condutor:       condutor || null,
      status_liberacao: resultado,
      observacoes:    obsGeral || null,
      respostas: todosItens.map(i => ({
        item_id:    i.id,
        resposta:   respostas[i.id] ?? "NA",
        observacao: obsItem[i.id] || null,
      })),
      device_id: navigator.userAgent.slice(0, 40),
    })
    setSaving(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-orange-600 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="text-2xl leading-none">‹</button>
          <h1 className="font-bold text-base">Liberação de Veículo</h1>
        </div>
        <p className="text-orange-100 text-xs pl-8">
          Checklist diário de segurança para liberação operacional
        </p>
      </div>

      {/* Scroll */}
      <div className="flex-1 overflow-y-auto pb-36">

        {/* ── Dados gerais ─────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-4 py-4 space-y-3">

          {obras.length > 1 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Obra</label>
              <select
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                value={obra} onChange={e => setObra(e.target.value)}
              >
                {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Veículo *
            </label>
            {preselectedVehicleId && veiculo ? (
              // Pré-selecionado via QR — apenas exibe
              <div className="mt-1 flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                <span className="text-xl">🚗</span>
                <div>
                  <p className="text-sm font-bold text-gray-900 tracking-wide">{veiculo.placa}</p>
                  <p className="text-xs text-gray-500">{veiculo.marca} {veiculo.modelo}</p>
                </div>
                <span className="ml-auto text-[10px] text-orange-600 font-semibold bg-orange-100 px-2 py-0.5 rounded-full">
                  via QR
                </span>
              </div>
            ) : (
              <select
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                value={veiculoId} onChange={e => setVeic(e.target.value)}
              >
                <option value="">— Selecione o veículo —</option>
                {veiculos.map(v => (
                  <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                value={data} onChange={e => setData(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hora</label>
              <input
                type="time"
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                value={hora} onChange={e => setHora(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Condutor / Motorista</label>
            <input
              type="text"
              placeholder="Nome do condutor"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
              value={condutor} onChange={e => setCond(e.target.value)}
            />
          </div>
        </div>

        {/* ── Checklist ────────────────────────────────────────────────────── */}
        {CHECKLIST.map(cat => (
          <div key={cat.categoria} className="mt-3 bg-white border-y border-gray-100">
            {/* Cabeçalho da categoria */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <span className="text-lg">{cat.emoji}</span>
              <h2 className="font-bold text-sm text-gray-800">{cat.categoria}</h2>
              <span className="ml-auto text-xs text-gray-400">
                {cat.items.filter(i => respostas[i.id]).length}/{cat.items.length}
              </span>
            </div>

            {/* Itens */}
            <div className="divide-y divide-gray-50">
              {cat.items.map(item => {
                const isNC = respostas[item.id] === "NC"
                return (
                  <div key={item.id} className={`px-4 py-3 ${isNC ? "bg-red-50" : ""}`}>
                    {/* Descrição + botões */}
                    <div className="flex items-start gap-3">
                      <p className={`flex-1 text-sm leading-snug ${isNC ? "text-red-800 font-medium" : "text-gray-700"}`}>
                        {isNC && <span className="mr-1">❌</span>}
                        {item.item}
                      </p>
                      {/* C / NC / NA */}
                      <div className="flex gap-1 flex-shrink-0 mt-0.5">
                        {(["C", "NC", "NA"] as Resp[]).map(v => (
                          <button
                            key={v}
                            onClick={() => {
                              setResposta(item.id, v)
                              if (v !== "NC") setExpObs(p => p === item.id ? null : p)
                            }}
                            className={btnCls(item.id, v)}
                            style={{ minWidth: "36px" }}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Observação ao marcar NC */}
                    {isNC && (
                      <div className="mt-2 pl-0">
                        <input
                          type="text"
                          placeholder="Descreva a não conformidade..."
                          className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs"
                          value={obsItem[item.id] ?? ""}
                          onChange={e => setObsItem(p => ({ ...p, [item.id]: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* ── Observações gerais ────────────────────────────────────────────── */}
        <div className="mt-3 bg-white border-y border-gray-100 px-4 py-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Observações Gerais
          </label>
          <textarea
            rows={3}
            placeholder="Observações adicionais sobre o veículo ou a inspeção..."
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm resize-none"
            value={obsGeral} onChange={e => setObs(e.target.value)}
          />
        </div>

        {/* ── Progresso ─────────────────────────────────────────────────────── */}
        <div className="mt-3 px-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{respondidos} de {todosItens.length} itens preenchidos</span>
            {totalNC > 0 && <span className="text-red-500 font-semibold">{totalNC} NC</span>}
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalNC > 0 ? "bg-red-500" : "bg-green-500"}`}
              style={{ width: `${(respondidos / todosItens.length) * 100}%` }}
            />
          </div>
        </div>

      </div>

      {/* ── Bottom bar fixa ────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 safe-area-bottom">
        {/* Resultado */}
        <div className={`rounded-xl py-2.5 px-4 mb-3 text-center font-bold text-sm ${resultadoCfg.bg} ${resultadoCfg.txt}`}>
          {resultadoCfg.label}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !veiculoId || !obra}
          className="w-full rounded-2xl py-3.5 bg-orange-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Salvando...
            </>
          ) : (
            `💾 Registrar Liberação (${resultado === "liberado" ? "✅ Liberar" : resultado === "bloqueado" ? "🚫 Bloquear" : "preencha"})`
          )}
        </button>
      </div>

    </div>
  )
}

import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"

// ─── Constantes ───────────────────────────────────────────────────────────────

// Mesmos 15 itens do AppChecklist
const CHECKLIST_ITEMS = [
  { id: "pneus",        label: "Pneus (pressão e estado)",    categoria: "Mecânica"   },
  { id: "oleo",         label: "Nível de óleo do motor",      categoria: "Mecânica"   },
  { id: "agua",         label: "Água do radiador",            categoria: "Mecânica"   },
  { id: "freios",       label: "Freios",                      categoria: "Mecânica"   },
  { id: "embreagem",    label: "Embreagem",                   categoria: "Mecânica"   },
  { id: "combustivel",  label: "Nível de combustível",        categoria: "Mecânica"   },
  { id: "farois",       label: "Faróis e lanternas",          categoria: "Elétrica"   },
  { id: "setas",        label: "Setas e pisca-alerta",        categoria: "Elétrica"   },
  { id: "limpadores",   label: "Limpadores de para-brisa",    categoria: "Elétrica"   },
  { id: "buzina",       label: "Buzina",                      categoria: "Elétrica"   },
  { id: "retrovisores", label: "Retrovisores",                categoria: "Segurança"  },
  { id: "extintor",     label: "Extintor de incêndio",        categoria: "Segurança"  },
  { id: "cinto",        label: "Cinto de segurança",          categoria: "Segurança"  },
  { id: "triangulo",    label: "Triângulo de segurança",      categoria: "Segurança"  },
  { id: "documentos",   label: "Documentação do veículo",     categoria: "Documentos" },
] as const

const CATEGORIAS = [...new Set(CHECKLIST_ITEMS.map(i => i.categoria))]

const RINGELMANN_LABEL: Record<number, string> = {
  0: "0 — Transparente",
  1: "1 — Levemente cinza",
  2: "2 — Cinza",
  3: "3 — Cinza escuro",
  4: "4 — Preto acinzentado",
  5: "5 — Preto opaco",
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Veiculo = { id: string; placa: string; marca: string; modelo: string }

type SmokeTest = {
  id: string
  data_afericao: string
  indice_ringelmann: number | null
  densidade_percentual: number | null
  resultado: string
  condutor: string
  observacoes: string | null
  dentro_limite: boolean | null
}

type ChecklistItem = {
  id: string
  item_nome: string
  status: string
  observacoes: string | null
}

type ExistingChecklist = {
  id: string
  data_inspecao: string
  tipo_servico: string
  km_atual: number | null
  responsavel_checklist: string | null
  observacoes: string | null
  itens: ChecklistItem[]
}

type ChecklistMode =
  | "loading"
  | "existing"   // existe checklist — mostra somente leitura
  | "none"       // não existe — mostra aviso + botão realizar
  | "new_form"   // preenche novo checklist inline

type ItemStatus = "ok" | "defeito" | "na" | undefined

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  veiculos: Veiculo[]
  preselectedVehicleId?: string
  onBack: () => void
  onSaved: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hoje() { return new Date().toISOString().split("T")[0] }

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiberacaoVeiculoForm({
  employee, obraId, veiculos, preselectedVehicleId, onBack, onSaved,
}: Props) {
  const [veiculoId, setVeicId]       = useState(preselectedVehicleId ?? "")
  const [condutor, setCondutor]      = useState("")
  const [condutorAuto, setCondAuto]  = useState(false)
  const [obsGeral, setObs]           = useState("")
  const [km, setKm]                  = useState("")

  // Dados puxados
  const [smokeTest, setSmokeTest]    = useState<SmokeTest | null | "loading">("loading")
  const [checklist, setChecklist]    = useState<ExistingChecklist | null>(null)
  const [ckMode, setCkMode]          = useState<ChecklistMode>("loading")

  // Formulário de novo checklist inline
  const [statuses, setStatuses]      = useState<Record<string, ItemStatus>>({})
  const [obsChecklist, setObsCk]     = useState("")
  const [savingCk, setSavingCk]      = useState(false)

  // Salvando liberação
  const [saving, setSaving]          = useState(false)
  const [erro, setErro]              = useState<string | null>(null)

  const veiculo = veiculos.find(v => v.id === veiculoId) ?? null

  // ── Carrega dados ao selecionar veículo ────────────────────────────────────
  useEffect(() => {
    if (!veiculoId) return
    loadVehicleData(veiculoId)
  }, [veiculoId])

  const loadVehicleData = async (vid: string) => {
    setSmokeTest("loading")
    setCkMode("loading")
    setErro(null)

    try {
      // 1. Responsável (condutor) do veículo
      const { data: veh } = await (supabase as any)
        .from("vehicles")
        .select("responsavel_id, quilometragem_atual, employees(nome)")
        .eq("id", vid)
        .maybeSingle()

      const nomeResp = veh?.employees?.nome ?? ""
      if (nomeResp) { setCondutor(nomeResp); setCondAuto(true) }
      if (veh?.quilometragem_atual && !km) setKm(String(veh.quilometragem_atual))

      // 2. Último teste de fumaça
      const { data: st } = await (supabase as any)
        .from("smoke_tests")
        .select("id, data_afericao, indice_ringelmann, densidade_percentual, resultado, condutor, observacoes, dentro_limite")
        .eq("vehicle_id", vid)
        .order("data_afericao", { ascending: false })
        .limit(1)
        .maybeSingle()
      setSmokeTest(st ?? null)

      // 3. Último checklist — usa .neq() para excluir liberações corretamente
      const { data: cl } = await (supabase as any)
        .from("inspection_checklists")
        .select("id, data_inspecao, tipo_servico, km_atual, responsavel_checklist, observacoes")
        .eq("vehicle_id", vid)
        .neq("tipo_servico", "liberacao_veiculo")
        .order("data_inspecao", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cl) {
        const { data: itens } = await (supabase as any)
          .from("inspection_items")
          .select("id, item_nome, status, observacoes")
          .eq("checklist_id", cl.id)
          .order("created_at", { ascending: true })
        setChecklist({ ...cl, itens: itens ?? [] })
        setCkMode("existing")
      } else {
        setChecklist(null)
        setCkMode("none")
      }
    } catch (e: any) {
      setErro("Erro ao carregar dados: " + (e?.message ?? ""))
      setSmokeTest(null)
      setCkMode("none")
    }
  }

  // ── Salvar novo checklist inline ───────────────────────────────────────────
  const handleSalvarChecklist = async () => {
    const pendentes = CHECKLIST_ITEMS.filter(i => !statuses[i.id])
    if (pendentes.length > 0) {
      setErro(`Responda todos os ${pendentes.length} itens restantes do checklist.`)
      return
    }
    setSavingCk(true)
    setErro(null)
    try {
      const { data: newCl, error: clErr } = await (supabase as any)
        .from("inspection_checklists")
        .insert({
          vehicle_id:            veiculoId,
          employee_id:           employee.id,
          tipo_servico:          "pre_viagem",
          data_inspecao:         hoje(),
          km_atual:              km ? parseFloat(km) : null,
          responsavel_checklist: employee.nome,
          observacoes:           obsChecklist || null,
        })
        .select()
        .single()
      if (clErr) throw clErr

      await (supabase as any).from("inspection_items").insert(
        CHECKLIST_ITEMS.map(item => ({
          checklist_id: newCl.id,
          item_nome:    item.label,
          status:
            statuses[item.id] === "ok"      ? "aprovado"
            : statuses[item.id] === "defeito" ? "reprovado"
            : "nao_aplicavel",
          observacoes: null,
        }))
      )

      // Recarrega como "existing"
      const { data: itens } = await (supabase as any)
        .from("inspection_items")
        .select("id, item_nome, status, observacoes")
        .eq("checklist_id", newCl.id)
        .order("created_at", { ascending: true })

      setChecklist({
        id: newCl.id,
        data_inspecao: newCl.data_inspecao,
        tipo_servico: "pre_viagem",
        km_atual: newCl.km_atual,
        responsavel_checklist: newCl.responsavel_checklist,
        observacoes: newCl.observacoes,
        itens: itens ?? [],
      })
      setCkMode("existing")
      setStatuses({})
      setObsCk("")
    } catch (e: any) {
      setErro("Erro ao salvar checklist: " + (e?.message ?? ""))
    } finally {
      setSavingCk(false)
    }
  }

  // ── Resultado automático ───────────────────────────────────────────────────
  const smokeObj = smokeTest === "loading" ? null : smokeTest
  const smokeOk  = smokeObj ? smokeObj.resultado === "aprovado" : null
  const smokeHoje= smokeObj ? smokeObj.data_afericao >= hoje() : false
  const ckNC     = checklist ? checklist.itens.filter(i => i.status === "reprovado").length : null
  const ckHoje   = checklist ? checklist.data_inspecao >= hoje() : false

  const resultado: "liberado" | "bloqueado" | "pendente" = (() => {
    if (!veiculoId || ckMode === "loading" || ckMode === "new_form") return "pendente"
    if (smokeOk === false)                  return "bloqueado"
    if (ckNC !== null && ckNC > 0)          return "bloqueado"
    if (ckNC === 0)                         return "liberado"   // sem fumaça mas checklist ok
    return "pendente"
  })()

  // ── Confirmar liberação ────────────────────────────────────────────────────
  const handleConfirmar = async (decisao: "liberado" | "bloqueado") => {
    if (!veiculoId) return
    setSaving(true)
    setErro(null)
    try {
      const { data: newCl, error: clErr } = await (supabase as any)
        .from("inspection_checklists")
        .insert({
          vehicle_id:            veiculoId,
          employee_id:           employee.id,
          tipo_servico:          "liberacao_veiculo",
          data_inspecao:         hoje(),
          km_atual:              km ? parseFloat(km) : null,
          responsavel_checklist: employee.nome,
          observacoes:           obsGeral || null,
        })
        .select()
        .single()
      if (clErr) throw clErr

      const itensSalvar = [
        {
          checklist_id: newCl.id,
          item_nome:    "Resultado da liberação",
          status:       decisao === "liberado" ? "aprovado" : "reprovado",
          observacoes:  decisao === "bloqueado" ? (obsGeral || "Bloqueado pelo responsável de segurança") : null,
        },
        {
          checklist_id: newCl.id,
          item_nome:    smokeObj
            ? `Teste de fumaça: ${smokeObj.resultado.toUpperCase()} (Ringelmann ${smokeObj.indice_ringelmann ?? "—"})`
            : "Teste de fumaça: não realizado",
          status: smokeHoje && smokeOk ? "aprovado" : smokeHoje && smokeOk === false ? "reprovado" : "nao_aplicavel",
          observacoes: null,
        },
        ...(checklist && checklist.itens.length > 0
          ? checklist.itens.map(i => ({
              checklist_id: newCl.id,
              item_nome:    i.item_nome,
              status:       i.status,
              observacoes:  i.observacoes,
            }))
          : [{
              checklist_id: newCl.id,
              item_nome: "Checklist pré-viagem: não realizado",
              status: "nao_aplicavel",
              observacoes: null,
            }]
        ),
      ]
      await (supabase as any).from("inspection_items").insert(itensSalvar)
      onSaved()
    } catch (e: any) {
      setErro("Erro ao salvar liberação: " + (e?.message ?? ""))
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-orange-600 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="text-2xl leading-none">‹</button>
          <h1 className="font-bold text-base">Liberação de Veículo</h1>
        </div>
        <p className="text-orange-100 text-xs pl-8">
          Revisão de segurança — confirme ou bloqueie a operação
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-44">

        {/* ── Seleção de veículo ─────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-4 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Veículo *</label>
            {preselectedVehicleId && veiculo ? (
              <div className="mt-1 flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                <span className="text-xl">🚗</span>
                <div>
                  <p className="text-sm font-bold text-gray-900 tracking-wide">{veiculo.placa}</p>
                  <p className="text-xs text-gray-500">{veiculo.marca} {veiculo.modelo}</p>
                </div>
                <span className="ml-auto text-[10px] text-orange-600 font-semibold bg-orange-100 px-2 py-0.5 rounded-full">via QR</span>
              </div>
            ) : (
              <select
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                value={veiculoId}
                onChange={e => setVeicId(e.target.value)}
              >
                <option value="">— Selecione o veículo —</option>
                {veiculos.map(v => (
                  <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>
                ))}
              </select>
            )}
          </div>

          {veiculoId && (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Condutor / Motorista
                  {condutorAuto && <span className="ml-2 text-green-600 font-normal normal-case">✓ auto</span>}
                </label>
                <input
                  type="text"
                  placeholder="Nome do condutor"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                  value={condutor}
                  onChange={e => setCondutor(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">KM Atual</label>
                <input
                  type="number"
                  placeholder="Quilometragem"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                  value={km}
                  onChange={e => setKm(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {erro && (
          <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{erro}</div>
        )}

        {veiculoId && (
          <>
            {/* ── Card: Teste de Fumaça ─────────────────────────────────── */}
            <div className="mx-4 mt-4">
              {smokeTest === "loading" ? (
                <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
              ) : (
                <div className={`rounded-2xl border-2 p-4 ${
                  !smokeObj               ? "bg-gray-50 border-gray-200"
                  : smokeHoje && smokeOk  ? "bg-green-50 border-green-300"
                  : smokeHoje && !smokeOk ? "bg-red-50 border-red-300"
                  : "bg-amber-50 border-amber-300"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">💨</span>
                    <p className="font-bold text-sm text-gray-900">Teste de Fumaça</p>
                    {smokeObj && (
                      <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        smokeHoje && smokeOk   ? "bg-green-600 text-white"
                        : smokeHoje && !smokeOk? "bg-red-600 text-white"
                        : "bg-amber-500 text-white"
                      }`}>
                        {smokeHoje ? "HOJE" : fmtData(smokeObj.data_afericao)}
                      </span>
                    )}
                  </div>

                  {!smokeObj ? (
                    <p className="text-xs text-gray-500">⚠️ Nenhum teste de fumaça registrado para este veículo.</p>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-600">Resultado</span>
                        <span className={`text-xs font-bold ${smokeOk ? "text-green-700" : "text-red-700"}`}>
                          {smokeOk ? "✅ APROVADO" : "❌ REPROVADO"}
                        </span>
                      </div>
                      {smokeObj.indice_ringelmann !== null && (
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-600">Ringelmann</span>
                          <span className="text-xs font-semibold text-gray-800">
                            {RINGELMANN_LABEL[smokeObj.indice_ringelmann] ?? smokeObj.indice_ringelmann}
                          </span>
                        </div>
                      )}
                      {smokeObj.densidade_percentual !== null && (
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-600">Opacidade</span>
                          <span className="text-xs font-semibold text-gray-800">{smokeObj.densidade_percentual}%</span>
                        </div>
                      )}
                      {!smokeHoje && (
                        <p className="text-[11px] text-amber-700 mt-1 font-medium">
                          ⚠️ Teste não é de hoje ({fmtData(smokeObj.data_afericao)}).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Card: Checklist ───────────────────────────────────────── */}
            <div className="mx-4 mt-3">

              {/* MODO: carregando */}
              {ckMode === "loading" && (
                <div className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
              )}

              {/* MODO: existe checklist — somente leitura */}
              {ckMode === "existing" && checklist && (
                <div className={`rounded-2xl border-2 p-4 ${
                  ckHoje && ckNC === 0     ? "bg-green-50 border-green-300"
                  : ckHoje && (ckNC??0) > 0? "bg-red-50 border-red-300"
                  : "bg-amber-50 border-amber-300"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📋</span>
                    <p className="font-bold text-sm text-gray-900">Checklist de Pré-Viagem</p>
                    <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      ckHoje && ckNC === 0      ? "bg-green-600 text-white"
                      : ckHoje && (ckNC??0) > 0 ? "bg-red-600 text-white"
                      : "bg-amber-500 text-white"
                    }`}>
                      {ckHoje ? "HOJE" : fmtData(checklist.data_inspecao)}
                    </span>
                  </div>

                  {/* Resumo numérico */}
                  <div className="flex gap-4 mb-2">
                    {[
                      { label: "OK",     count: checklist.itens.filter(i => i.status === "aprovado").length,      color: "text-green-700" },
                      { label: "Defeito",count: ckNC ?? 0,                                                         color: "text-red-600"   },
                      { label: "N/A",    count: checklist.itens.filter(i => i.status === "nao_aplicavel").length, color: "text-gray-500"  },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className={`text-lg font-extrabold ${s.color}`}>{s.count}</p>
                        <p className="text-[10px] text-gray-400">{s.label}</p>
                      </div>
                    ))}
                    <div className="ml-auto text-right">
                      <p className="text-xs text-gray-500">{fmtData(checklist.data_inspecao)}</p>
                      {checklist.responsavel_checklist && (
                        <p className="text-[11px] text-gray-400">{checklist.responsavel_checklist}</p>
                      )}
                      {checklist.tipo_servico && (
                        <p className="text-[10px] text-gray-300 capitalize">{checklist.tipo_servico.replace(/_/g, " ")}</p>
                      )}
                    </div>
                  </div>

                  {/* Itens com defeito */}
                  {(ckNC ?? 0) > 0 && (
                    <div className="mt-2 space-y-1">
                      {checklist.itens.filter(i => i.status === "reprovado").map((item, i) => (
                        <div key={item.id ?? i} className="flex items-start gap-2">
                          <span className="text-red-500 text-xs mt-0.5 flex-shrink-0">❌</span>
                          <div>
                            <p className="text-xs text-red-800 font-medium leading-snug">{item.item_nome}</p>
                            {item.observacoes && (
                              <p className="text-[11px] text-red-700">{item.observacoes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!ckHoje && (
                    <p className="text-[11px] text-amber-700 mt-2 font-medium">
                      ⚠️ Checklist não é de hoje. Recomendado realizar um novo.
                    </p>
                  )}

                  {/* Botão: realizar novo checklist */}
                  <button
                    onClick={() => { setCkMode("new_form"); setStatuses({}); setObsCk("") }}
                    className="mt-3 w-full py-2 rounded-xl border border-gray-300 text-gray-700 text-xs font-semibold bg-white"
                  >
                    🔄 Realizar novo checklist agora
                  </button>
                </div>
              )}

              {/* MODO: nenhum checklist */}
              {ckMode === "none" && (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📋</span>
                    <p className="font-bold text-sm text-gray-900">Checklist de Pré-Viagem</p>
                  </div>
                  <p className="text-xs text-amber-800">
                    ⚠️ Nenhum checklist registrado para este veículo. Realize o checklist antes de liberar.
                  </p>
                  <button
                    onClick={() => { setCkMode("new_form"); setStatuses({}); setObsCk("") }}
                    className="mt-3 w-full py-2.5 rounded-xl bg-orange-600 text-white text-sm font-bold"
                  >
                    ✍️ Realizar checklist agora
                  </button>
                </div>
              )}

              {/* MODO: novo checklist inline */}
              {ckMode === "new_form" && (
                <div className="rounded-2xl border-2 border-violet-300 bg-violet-50">
                  {/* Header */}
                  <div className="flex items-center gap-2 p-4 pb-2">
                    <span className="text-xl">✍️</span>
                    <p className="font-bold text-sm text-violet-900">Novo Checklist — Pré-Viagem</p>
                    {checklist && (
                      <button
                        onClick={() => setCkMode("existing")}
                        className="ml-auto text-[11px] text-violet-600 underline"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="px-4 pb-3">
                    {(() => {
                      const preenchidos = CHECKLIST_ITEMS.filter(i => statuses[i.id]).length
                      const pct = Math.round((preenchidos / CHECKLIST_ITEMS.length) * 100)
                      return (
                        <>
                          <div className="flex justify-between text-[10px] text-violet-600 mb-1">
                            <span>{preenchidos}/{CHECKLIST_ITEMS.length} itens</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-violet-200 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  {/* Itens por categoria */}
                  {CATEGORIAS.map(cat => (
                    <div key={cat}>
                      <div className="px-4 py-1.5 bg-violet-100 border-y border-violet-200">
                        <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">{cat}</p>
                      </div>
                      {CHECKLIST_ITEMS.filter(i => i.categoria === cat).map(item => {
                        const s = statuses[item.id]
                        return (
                          <div key={item.id} className="flex items-center gap-2 px-4 py-3 border-b border-violet-100 last:border-b-0">
                            <p className="flex-1 text-xs text-gray-800">{item.label}</p>
                            <div className="flex gap-1">
                              {(["ok", "defeito", "na"] as const).map(opt => (
                                <button
                                  key={opt}
                                  onClick={() => setStatuses(prev => ({
                                    ...prev,
                                    [item.id]: s === opt ? undefined : opt,
                                  }))}
                                  className={`h-9 w-11 rounded-lg text-[9px] font-bold transition-all ${
                                    s === opt
                                      ? opt === "ok"      ? "bg-green-600 text-white"
                                        : opt === "defeito" ? "bg-red-600 text-white"
                                        : "bg-gray-400 text-white"
                                      : "bg-white border border-gray-200 text-gray-400"
                                  }`}
                                >
                                  {opt === "ok" ? "OK" : opt === "defeito" ? "DEF" : "N/A"}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  {/* Obs + botão salvar */}
                  <div className="p-4 space-y-3">
                    <textarea
                      rows={2}
                      placeholder="Observações do checklist..."
                      className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs resize-none"
                      value={obsChecklist}
                      onChange={e => setObsCk(e.target.value)}
                    />
                    <button
                      onClick={handleSalvarChecklist}
                      disabled={savingCk}
                      className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50"
                    >
                      {savingCk ? "Salvando checklist..." : "💾 Salvar Checklist no Histórico"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Observações do responsável ───────────────────────────── */}
            {ckMode !== "new_form" && (
              <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Observações do responsável de segurança
                </label>
                <textarea
                  rows={2}
                  placeholder="Observações ou ressalvas..."
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm resize-none"
                  value={obsGeral}
                  onChange={e => setObs(e.target.value)}
                />
              </div>
            )}

            {/* ── Painel resultado ─────────────────────────────────────── */}
            {ckMode !== "new_form" && (
              <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resultado da análise</p>
                <div className={`rounded-xl py-3 px-4 text-center font-extrabold text-sm ${
                  resultado === "liberado"   ? "bg-green-100 text-green-800 border border-green-300"
                  : resultado === "bloqueado"? "bg-red-100 text-red-800 border border-red-300"
                  : "bg-gray-100 text-gray-500 border border-gray-200"
                }`}>
                  {resultado === "liberado"  && "✅ PRONTO PARA LIBERAR"}
                  {resultado === "bloqueado" && "🚫 PENDÊNCIAS — BLOQUEIO RECOMENDADO"}
                  {resultado === "pendente"  && "⚠️ Realize o checklist para prosseguir"}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Botões fixos no rodapé ──────────────────────────────────────── */}
      {veiculoId && ckMode !== "new_form" && ckMode !== "loading" && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 safe-area-bottom">
          <div className="flex gap-3">
            <button
              onClick={() => handleConfirmar("bloqueado")}
              disabled={saving}
              className="flex-1 py-3.5 rounded-2xl bg-red-600 text-white font-bold text-sm disabled:opacity-50"
            >
              🚫 Bloquear
            </button>
            <button
              onClick={() => handleConfirmar("liberado")}
              disabled={saving || resultado === "pendente"}
              className="flex-[2] py-3.5 rounded-2xl bg-green-700 text-white font-bold text-sm disabled:opacity-50"
            >
              {saving ? "Salvando..." : "✅ Confirmar Liberação"}
            </button>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-1">Responsável: {employee.nome}</p>
        </div>
      )}
    </div>
  )
}

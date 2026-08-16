import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"

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
  status: string // "aprovado" | "reprovado" | "nao_aplicavel"
  observacoes: string | null
}

type UltimoChecklist = {
  id: string
  data_inspecao: string
  tipo_servico: string
  km_atual: number | null
  responsavel_checklist: string | null
  observacoes: string | null
  itens: ChecklistItem[]
}

interface Props {
  employee: { id: string; nome: string }
  obraId: string
  veiculos: Veiculo[]
  preselectedVehicleId?: string
  onBack: () => void
  onSaved: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RINGELMANN_LABEL: Record<number, string> = {
  0: "0 — Transparente",
  1: "1 — Levemente cinza",
  2: "2 — Cinza",
  3: "3 — Cinza escuro",
  4: "4 — Preto acinzentado",
  5: "5 — Preto opaco",
}

function hoje() { return new Date().toISOString().split("T")[0] }

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiberacaoVeiculoForm({
  employee, obraId, veiculos, preselectedVehicleId, onBack, onSaved,
}: Props) {
  const [veiculoId, setVeicId]         = useState(preselectedVehicleId ?? "")
  const [condutor, setCondutor]         = useState("")
  const [obsGeral, setObs]             = useState("")
  const [km, setKm]                    = useState("")

  const [loadingData, setLoadingData]  = useState(false)
  const [saving, setSaving]            = useState(false)
  const [erro, setErro]                = useState<string | null>(null)

  // Dados puxados do sistema
  const [smokeTest, setSmokeTest]      = useState<SmokeTest | null | "none">("none")
  const [checklist, setChecklist]      = useState<UltimoChecklist | null | "none">("none")
  const [condutorNome, setCondNome]    = useState("")

  const veiculo = veiculos.find(v => v.id === veiculoId) ?? null

  // ── Carrega dados do veículo ao selecionar ─────────────────────────────────
  useEffect(() => {
    if (!veiculoId) return
    loadVehicleData(veiculoId)
  }, [veiculoId])

  const loadVehicleData = async (vid: string) => {
    setLoadingData(true)
    setErro(null)
    setSmokeTest("none")
    setChecklist("none")

    try {
      // 1. Responsável (condutor) vinculado ao veículo
      const { data: veh } = await (supabase as any)
        .from("vehicles")
        .select("responsavel_id, quilometragem_atual, employees(nome)")
        .eq("id", vid)
        .maybeSingle()

      const nomeResp = veh?.employees?.nome ?? ""
      setCondNome(nomeResp)
      setCondutor(nomeResp)                 // auto-fill
      if (veh?.quilometragem_atual) setKm(String(veh.quilometragem_atual))

      // 2. Último teste de fumaça deste veículo
      const { data: st } = await (supabase as any)
        .from("smoke_tests")
        .select("id, data_afericao, indice_ringelmann, densidade_percentual, resultado, condutor, observacoes, dentro_limite")
        .eq("vehicle_id", vid)
        .order("data_afericao", { ascending: false })
        .limit(1)
        .maybeSingle()
      setSmokeTest(st ?? null)

      // 3. Último checklist de pré-viagem deste veículo
      const { data: cl } = await (supabase as any)
        .from("inspection_checklists")
        .select("id, data_inspecao, tipo_servico, km_atual, responsavel_checklist, observacoes")
        .eq("vehicle_id", vid)
        .not("tipo_servico", "eq", "liberacao_veiculo")
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
      } else {
        setChecklist(null)
      }
    } catch (e: any) {
      setErro("Erro ao carregar dados do veículo: " + (e?.message ?? ""))
    } finally {
      setLoadingData(false)
    }
  }

  // ── Resultado calculado ───────────────────────────────────────────────────
  const smokeOk = smokeTest && smokeTest !== "none"
    ? smokeTest.resultado === "aprovado"
    : null   // null = sem dados

  const checklistNC = checklist && checklist !== "none"
    ? checklist.itens.filter(i => i.status === "reprovado").length
    : null

  const checklistHoje = checklist && checklist !== "none"
    ? checklist.data_inspecao >= hoje()
    : false

  const smokeHoje = smokeTest && smokeTest !== "none"
    ? smokeTest.data_afericao >= hoje()
    : false

  // Determina resultado final automaticamente
  const resultado: "liberado" | "bloqueado" | "pendente" = (() => {
    if (!veiculoId) return "pendente"
    if (smokeOk === false) return "bloqueado"          // fumaça reprovada
    if (checklistNC !== null && checklistNC > 0) return "bloqueado" // checklist com defeito
    if (smokeOk === true && checklistNC === 0) return "liberado"
    return "pendente"
  })()

  // ── Salvar liberação ──────────────────────────────────────────────────────
  const handleConfirmar = async (decisao: "liberado" | "bloqueado") => {
    if (!veiculoId) return
    setSaving(true)
    setErro(null)
    try {
      // Cria checklist de liberação
      const { data: newCl, error: clErr } = await (supabase as any)
        .from("inspection_checklists")
        .insert({
          vehicle_id:           veiculoId,
          employee_id:          employee.id,
          tipo_servico:         "liberacao_veiculo",
          data_inspecao:        hoje(),
          km_atual:             km ? parseFloat(km) : null,
          responsavel_checklist: employee.nome,
          observacoes:          obsGeral || null,
          funcao:               "segurança",
        })
        .select()
        .single()
      if (clErr) throw clErr

      // Itens resumo
      const itensSalvar = [
        {
          checklist_id: newCl.id,
          item_nome:    "Resultado final da liberação",
          status:       decisao === "liberado" ? "aprovado" : "reprovado",
          observacoes:  decisao === "bloqueado" ? (obsGeral || "Veículo bloqueado pelo responsável de segurança") : null,
        },
        {
          checklist_id: newCl.id,
          item_nome:    smokeTest && smokeTest !== "none"
            ? `Teste de fumaça: ${smokeTest.resultado.toUpperCase()} (Ringelmann ${smokeTest.indice_ringelmann ?? "—"})`
            : "Teste de fumaça: não realizado",
          status: smokeHoje && smokeOk ? "aprovado" : smokeHoje && smokeOk === false ? "reprovado" : "nao_aplicavel",
          observacoes: null,
        },
        ...(checklist && checklist !== "none" && checklist.itens.length > 0
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
      setErro("Erro ao salvar: " + (e?.message ?? ""))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
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

      <div className="flex-1 overflow-y-auto pb-40">

        {/* ── Seleção de veículo ─────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-4 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Veículo *
            </label>
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

          {/* Condutor auto-preenchido */}
          {veiculoId && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Condutor / Motorista
                {condutorNome && (
                  <span className="ml-2 text-green-600 font-normal normal-case">✓ preenchido automaticamente</span>
                )}
              </label>
              <input
                type="text"
                placeholder="Nome do condutor"
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                value={condutor}
                onChange={e => setCondutor(e.target.value)}
              />
            </div>
          )}

          {veiculoId && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">KM atual</label>
              <input
                type="number"
                placeholder="Quilometragem"
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                value={km}
                onChange={e => setKm(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* ── Carregando ─────────────────────────────────────────────────── */}
        {veiculoId && loadingData && (
          <div className="flex items-center justify-center py-10">
            <div className="w-7 h-7 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {erro && (
          <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
            {erro}
          </div>
        )}

        {veiculoId && !loadingData && (
          <>
            {/* ── Card: Teste de Fumaça ─────────────────────────────────── */}
            <div className="mx-4 mt-4">
              <div className={`rounded-2xl border-2 p-4 ${
                smokeTest === "none" || !smokeTest
                  ? "bg-gray-50 border-gray-200"
                  : smokeHoje && smokeOk
                  ? "bg-green-50 border-green-300"
                  : smokeHoje && !smokeOk
                  ? "bg-red-50 border-red-300"
                  : "bg-amber-50 border-amber-300"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">💨</span>
                  <p className="font-bold text-sm text-gray-900">Teste de Fumaça</p>
                  {smokeTest && smokeTest !== "none" && (
                    <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      smokeHoje && smokeOk
                        ? "bg-green-600 text-white"
                        : smokeHoje && !smokeOk
                        ? "bg-red-600 text-white"
                        : "bg-amber-500 text-white"
                    }`}>
                      {smokeHoje ? "HOJE" : fmtData(smokeTest.data_afericao)}
                    </span>
                  )}
                </div>

                {!smokeTest || smokeTest === "none" ? (
                  <p className="text-xs text-gray-500">⚠️ Nenhum teste de fumaça registrado para este veículo.</p>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Resultado</span>
                      <span className={`text-xs font-bold ${smokeOk ? "text-green-700" : "text-red-700"}`}>
                        {smokeOk ? "✅ APROVADO" : "❌ REPROVADO"}
                      </span>
                    </div>
                    {smokeTest.indice_ringelmann !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Índice Ringelmann</span>
                        <span className="text-xs font-semibold text-gray-800">
                          {RINGELMANN_LABEL[smokeTest.indice_ringelmann] ?? smokeTest.indice_ringelmann}
                        </span>
                      </div>
                    )}
                    {smokeTest.densidade_percentual !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Opacidade</span>
                        <span className="text-xs font-semibold text-gray-800">{smokeTest.densidade_percentual}%</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Data</span>
                      <span className="text-xs text-gray-700">{fmtData(smokeTest.data_afericao)}</span>
                    </div>
                    {!smokeHoje && (
                      <p className="text-[11px] text-amber-700 mt-1 font-medium">
                        ⚠️ Teste não é de hoje — solicite novo teste antes de liberar.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Card: Checklist de Pré-Viagem ────────────────────────── */}
            <div className="mx-4 mt-3">
              <div className={`rounded-2xl border-2 p-4 ${
                !checklist || checklist === "none"
                  ? "bg-gray-50 border-gray-200"
                  : checklistHoje && checklistNC === 0
                  ? "bg-green-50 border-green-300"
                  : checklistHoje && (checklistNC ?? 0) > 0
                  ? "bg-red-50 border-red-300"
                  : "bg-amber-50 border-amber-300"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📋</span>
                  <p className="font-bold text-sm text-gray-900">Checklist de Pré-Viagem</p>
                  {checklist && checklist !== "none" && (
                    <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      checklistHoje && checklistNC === 0
                        ? "bg-green-600 text-white"
                        : checklistHoje && (checklistNC ?? 0) > 0
                        ? "bg-red-600 text-white"
                        : "bg-amber-500 text-white"
                    }`}>
                      {checklistHoje ? "HOJE" : fmtData(checklist.data_inspecao)}
                    </span>
                  )}
                </div>

                {!checklist || checklist === "none" ? (
                  <p className="text-xs text-gray-500">⚠️ Nenhum checklist registrado para este veículo.</p>
                ) : (
                  <>
                    {/* Resumo */}
                    <div className="flex gap-3 mb-2">
                      {[
                        { label: "OK", count: checklist.itens.filter(i => i.status === "aprovado").length, color: "text-green-700" },
                        { label: "Defeito", count: checklistNC ?? 0, color: "text-red-600" },
                        { label: "N/A", count: checklist.itens.filter(i => i.status === "nao_aplicavel").length, color: "text-gray-500" },
                      ].map(s => (
                        <div key={s.label} className="text-center">
                          <p className={`text-base font-extrabold ${s.color}`}>{s.count}</p>
                          <p className="text-[10px] text-gray-400">{s.label}</p>
                        </div>
                      ))}
                      <div className="ml-auto text-right">
                        <p className="text-xs text-gray-500">{fmtData(checklist.data_inspecao)}</p>
                        {checklist.responsavel_checklist && (
                          <p className="text-[11px] text-gray-400">{checklist.responsavel_checklist}</p>
                        )}
                      </div>
                    </div>

                    {/* Itens com defeito em destaque */}
                    {(checklistNC ?? 0) > 0 && (
                      <div className="mt-1 space-y-1">
                        {checklist.itens.filter(i => i.status === "reprovado").map(item => (
                          <div key={item.id} className="flex items-start gap-2">
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

                    {!checklistHoje && (
                      <p className="text-[11px] text-amber-700 mt-2 font-medium">
                        ⚠️ Checklist não é de hoje — solicite novo checklist antes de liberar.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Observações ──────────────────────────────────────────── */}
            <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 p-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Observações do responsável de segurança
              </label>
              <textarea
                rows={3}
                placeholder="Observações, ressalvas ou condições da liberação..."
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm resize-none"
                value={obsGeral}
                onChange={e => setObs(e.target.value)}
              />
            </div>

            {/* ── Painel de resultado ──────────────────────────────────── */}
            <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Resultado da análise
              </p>
              <div className={`rounded-xl py-3 px-4 text-center font-extrabold text-sm ${
                resultado === "liberado"  ? "bg-green-100 text-green-800 border border-green-300" :
                resultado === "bloqueado" ? "bg-red-100 text-red-800 border border-red-300" :
                "bg-gray-100 text-gray-500 border border-gray-200"
              }`}>
                {resultado === "liberado"  && "✅ PRONTO PARA LIBERAR"}
                {resultado === "bloqueado" && "🚫 PENDÊNCIAS ENCONTRADAS — BLOQUEIO RECOMENDADO"}
                {resultado === "pendente"  && "⚠️ Sem dados suficientes para determinar o resultado"}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Botões de ação (fixos no rodapé) ────────────────────────────── */}
      {veiculoId && !loadingData && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 safe-area-bottom">
          <div className="flex gap-3">
            <button
              onClick={() => handleConfirmar("bloqueado")}
              disabled={saving}
              className="flex-1 py-3.5 rounded-2xl bg-red-600 text-white font-bold text-sm disabled:opacity-50"
            >
              {saving ? "..." : "🚫 Bloquear"}
            </button>
            <button
              onClick={() => handleConfirmar("liberado")}
              disabled={saving}
              className="flex-[2] py-3.5 rounded-2xl bg-green-700 text-white font-bold text-sm disabled:opacity-50"
            >
              {saving ? "Salvando..." : "✅ Confirmar Liberação"}
            </button>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-2">
            Responsável: {employee.nome}
          </p>
        </div>
      )}
    </div>
  )
}

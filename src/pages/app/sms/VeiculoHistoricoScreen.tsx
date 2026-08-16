import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"

// ─── Types ────────────────────────────────────────────────────────────────────

type Veiculo = {
  id: string; placa: string; marca: string; modelo: string; ano: number | null
}

type ItemNC = {
  item_id: string
  observacao: string | null
}

type UltimaInspecao = {
  id: string
  data: string
  status: string | null
  observacoes: string | null
  itensNC: ItemNC[]
}

type LiberacaoChecklist = {
  id: string
  data_inspecao: string
  responsavel_checklist: string | null
  observacoes: string | null
  itensReprovados: { item_nome: string; observacoes: string | null }[]
  itensAprovados: number
}

type HistItem = {
  id: string
  tipo: 'inspecao' | 'near_miss' | 'acidente' | 'desvio' | 'apr' | 'liberacao'
  titulo: string
  subtitulo?: string
  data: string
  cor: string
  emoji: string
  status?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function hoje() {
  return new Date().toISOString().split("T")[0]
}

// Determina status de liberação baseado no último checklist de liberação (inspection_checklists)
function getLiberacao(lib: LiberacaoChecklist | null): {
  tipo: "liberado" | "bloqueado" | "aguardando"
  titulo: string
  desc: string
  emoji: string
  bg: string
  txt: string
  border: string
} {
  if (!lib) {
    return {
      tipo: "aguardando",
      titulo: "AGUARDANDO LIBERAÇÃO",
      desc: "Nenhuma liberação registrada hoje. Acesse 'Liberação de Veículo' para realizar o processo.",
      emoji: "⏳",
      bg: "bg-amber-50", txt: "text-amber-900", border: "border-amber-300",
    }
  }

  const isHoje = lib.data_inspecao >= hoje()

  if (!isHoje) {
    return {
      tipo: "aguardando",
      titulo: "LIBERAÇÃO VENCIDA",
      desc: `Última liberação em ${fmtDate(lib.data_inspecao)}. Realize nova liberação para hoje.`,
      emoji: "⚠️",
      bg: "bg-amber-50", txt: "text-amber-900", border: "border-amber-300",
    }
  }

  if (lib.itensReprovados.length > 0) {
    return {
      tipo: "bloqueado",
      titulo: "BLOQUEADO",
      desc: `${lib.itensReprovados.length} pendência${lib.itensReprovados.length > 1 ? "s" : ""} encontrada${lib.itensReprovados.length > 1 ? "s" : ""}. Corrija antes de operar.`,
      emoji: "🚫",
      bg: "bg-red-50", txt: "text-red-900", border: "border-red-400",
    }
  }

  return {
    tipo: "liberado",
    titulo: "LIBERADO PARA OPERAR",
    desc: lib.responsavel_checklist
      ? `Liberado hoje por ${lib.responsavel_checklist}.`
      : "Liberação de hoje concluída sem pendências.",
    emoji: "✅",
    bg: "bg-green-50", txt: "text-green-900", border: "border-green-400",
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  vehicleId: string
  obraId: string | null
  onBack: () => void
  onLiberar?: () => void
}

export function VeiculoHistoricoScreen({ vehicleId, obraId, onBack, onLiberar }: Props) {
  const [veiculo, setVeiculo]           = useState<Veiculo | null>(null)
  const [ultimaLib, setUltimaLib]       = useState<LiberacaoChecklist | null | "loading">("loading")
  // Keep sms_inspecoes for legacy status fallback (not used for liberation display anymore)
  const [_ultimaInsp, setUltimaInsp]   = useState<UltimaInspecao | null>(null)
  const [items, setItems]               = useState<HistItem[]>([])
  const [loading, setLoading]           = useState(true)
  const [erro, setErro]                 = useState<string | null>(null)
  const [showChecklist, setShowCk]      = useState(false)

  useEffect(() => { fetchAll() }, [vehicleId])

  const fetchAll = async () => {
    setLoading(true)
    setErro(null)
    setUltimaLib("loading")
    try {
      // 1. Dados do veículo
      const { data: v } = await (supabase as any)
        .from("vehicles")
        .select("id, placa, marca, modelo, ano")
        .eq("id", vehicleId)
        .maybeSingle()
      setVeiculo(v ?? null)

      const obraFilter = (q: any) => obraId ? q.eq("obra_id", obraId) : q

      // 2. Último checklist de LIBERAÇÃO deste veículo (tabela do sistema principal)
      const { data: libCl } = await (supabase as any)
        .from("inspection_checklists")
        .select("id, data_inspecao, responsavel_checklist, observacoes")
        .eq("vehicle_id", vehicleId)
        .eq("tipo_servico", "liberacao_veiculo")
        .order("data_inspecao", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (libCl) {
        const { data: libItens } = await (supabase as any)
          .from("inspection_items")
          .select("item_nome, status, observacoes")
          .eq("checklist_id", libCl.id)

        const itensReprovados = (libItens ?? []).filter((i: any) => i.status === "reprovado")
        const itensAprovados  = (libItens ?? []).filter((i: any) => i.status === "aprovado").length

        setUltimaLib({
          id: libCl.id,
          data_inspecao: libCl.data_inspecao,
          responsavel_checklist: libCl.responsavel_checklist,
          observacoes: libCl.observacoes,
          itensReprovados,
          itensAprovados,
        })
      } else {
        setUltimaLib(null)
      }

      // 3. Última inspeção SMS (para exibição no histórico)
      const { data: insp } = await (supabase as any)
        .from("sms_inspecoes")
        .select("id, data, status, observacoes")
        .eq("veiculo_id", vehicleId)
        .order("data", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (insp) {
        const { data: ncItens } = await (supabase as any)
          .from("sms_inspecoes_respostas")
          .select("item_id, observacao")
          .eq("inspecao_id", insp.id)
          .eq("resposta", "NC")
        setUltimaInsp({ id: insp.id, data: insp.data, status: insp.status ?? null,
          observacoes: insp.observacoes ?? null, itensNC: ncItens ?? [] })
      }

      // 4. Histórico completo de eventos (liberações + SMS)
      const [r1, r2, r3, r4, r5, rLib] = await Promise.all([
        obraFilter((supabase as any).from("sms_inspecoes")
          .select("id, data, status, observacoes")
          .eq("veiculo_id", vehicleId)
          .order("data", { ascending: false })
          .limit(30)),

        obraFilter((supabase as any).from("sms_near_miss")
          .select("id, created_at, o_que_aconteceu, status")
          .eq("veiculo_id", vehicleId)
          .order("created_at", { ascending: false })
          .limit(30)),

        obraFilter((supabase as any).from("sms_acidentes")
          .select("id, data_hora, tipo, descricao")
          .eq("veiculo_id", vehicleId)
          .order("data_hora", { ascending: false })
          .limit(30)),

        obraFilter((supabase as any).from("sms_desvios")
          .select("id, data_abertura, tipo, descricao, gravidade, status")
          .eq("veiculo_id", vehicleId)
          .order("data_abertura", { ascending: false })
          .limit(30)),

        obraFilter((supabase as any).from("sms_aprs")
          .select("id, data, hora_inicio, descricao_trabalho, status")
          .eq("veiculo_id", vehicleId)
          .order("data", { ascending: false })
          .limit(30)),

        // Histórico de liberações (últimas 20)
        (supabase as any).from("inspection_checklists")
          .select("id, data_inspecao, responsavel_checklist, observacoes, inspection_items(status)")
          .eq("vehicle_id", vehicleId)
          .eq("tipo_servico", "liberacao_veiculo")
          .order("data_inspecao", { ascending: false })
          .limit(20),
      ])

      const merged: HistItem[] = []

      for (const row of r1.data ?? []) {
        merged.push({
          id: row.id, tipo: "inspecao", emoji: "🔍", cor: "border-teal-200",
          titulo: `Inspeção — ${row.status ?? ""}`,
          subtitulo: row.observacoes ?? undefined,
          data: row.data,
          status: row.status,
        })
      }
      for (const row of r2.data ?? []) {
        merged.push({
          id: row.id, tipo: "near_miss", emoji: "🚨", cor: "border-amber-200",
          titulo: "Near Miss",
          subtitulo: row.o_que_aconteceu,
          data: row.created_at,
          status: row.status,
        })
      }
      for (const row of r3.data ?? []) {
        const tipoLabel: Record<string, string> = {
          acidente_tipico: "Acidente típico",
          doenca_ocupacional: "Doença ocupacional",
          acidente_trajeto: "Acidente de trajeto",
          incidente_perigoso: "Incidente perigoso",
          primeiros_socorros: "Primeiros socorros",
        }
        merged.push({
          id: row.id, tipo: "acidente", emoji: "🏥", cor: "border-red-200",
          titulo: tipoLabel[row.tipo] ?? row.tipo,
          subtitulo: row.descricao,
          data: row.data_hora,
        })
      }
      for (const row of r4.data ?? []) {
        merged.push({
          id: row.id, tipo: "desvio", emoji: "⚠️", cor: "border-orange-200",
          titulo: `Desvio — ${row.tipo ?? ""}`,
          subtitulo: row.descricao,
          data: row.data_abertura,
          status: row.status,
        })
      }
      for (const row of r5.data ?? []) {
        merged.push({
          id: row.id, tipo: "apr", emoji: "📋", cor: "border-purple-200",
          titulo: `APR — ${row.status ?? ""}`,
          subtitulo: row.descricao_trabalho ?? undefined,
          data: row.data,
          status: row.status,
        })
      }
      for (const row of rLib.data ?? []) {
        const itensArr = row.inspection_items ?? []
        const nc = itensArr.filter((i: any) => i.status === "reprovado").length
        merged.push({
          id: row.id, tipo: "liberacao", emoji: nc > 0 ? "🚫" : "✅", cor: nc > 0 ? "border-red-200" : "border-green-200",
          titulo: nc > 0 ? `Liberação — BLOQUEADO (${nc} NC)` : "Liberação — LIBERADO",
          subtitulo: row.responsavel_checklist ? `Por: ${row.responsavel_checklist}` : undefined,
          data: row.data_inspecao,
          status: nc > 0 ? "bloqueado" : "liberado",
        })
      }

      merged.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      setItems(merged)

    } catch (e: any) {
      console.error("[VeiculoHistorico] fetchAll error:", e)
      setErro(e?.message ?? "Erro ao carregar")
      setUltimaLib(null)
    } finally {
      setLoading(false)
    }
  }

  const liberacao = getLiberacao(ultimaLib === "loading" ? null : ultimaLib)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-green-700 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="text-2xl leading-none">‹</button>
          <h1 className="font-bold text-base">Veículo</h1>
        </div>

        {veiculo ? (
          <div className="bg-green-800/60 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-extrabold text-2xl tracking-widest">{veiculo.placa}</p>
              <p className="text-green-200 text-xs mt-0.5">
                {veiculo.marca} {veiculo.modelo}{veiculo.ano ? ` · ${veiculo.ano}` : ""}
              </p>
            </div>
            <span className="text-4xl">🚗</span>
          </div>
        ) : loading ? (
          <div className="bg-green-800/40 rounded-xl px-4 py-3 h-16 animate-pulse" />
        ) : (
          <div className="bg-red-800/60 rounded-xl px-4 py-3">
            <p className="text-sm text-red-200">Veículo não encontrado</p>
          </div>
        )}
      </div>

      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Painel de Liberação ─────────────────────────────────────────── */}
        <div className="px-4 pt-4">
          {ultimaLib === "loading" ? (
            <div className="rounded-2xl border-2 border-gray-200 bg-white h-24 animate-pulse" />
          ) : (
            <div className={`rounded-2xl border-2 ${liberacao.border} ${liberacao.bg} p-4`}>
              {/* Status principal */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl leading-none">{liberacao.emoji}</span>
                <div className="flex-1">
                  <p className={`font-extrabold text-sm tracking-wide ${liberacao.txt}`}>
                    {liberacao.titulo}
                  </p>
                  <p className={`text-xs mt-0.5 leading-snug ${liberacao.txt} opacity-80`}>
                    {liberacao.desc}
                  </p>
                </div>
              </div>

              {/* Botão de liberação quando aguardando ou bloqueado */}
              {onLiberar && liberacao.tipo !== "liberado" && (
                <button
                  onClick={onLiberar}
                  className="mt-3 w-full py-2.5 rounded-xl bg-orange-600 text-white text-sm font-bold flex items-center justify-center gap-2"
                >
                  🚦 Iniciar Liberação Agora
                </button>
              )}
              {onLiberar && liberacao.tipo === "liberado" && (
                <button
                  onClick={onLiberar}
                  className="mt-3 w-full py-2 rounded-xl border border-green-400 text-green-800 text-xs font-semibold"
                >
                  🔄 Refazer liberação
                </button>
              )}

              {/* Detalhes da última liberação */}
              {ultimaLib && (
                <div className={`border-t ${liberacao.border} mt-3 pt-3 space-y-1.5`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium ${liberacao.txt} opacity-70`}>
                      📅 {fmtDate(ultimaLib.data_inspecao)}
                    </span>
                    {ultimaLib.itensReprovados.length > 0 && (
                      <button
                        onClick={() => setShowCk(v => !v)}
                        className="text-[11px] font-semibold text-red-700 underline"
                      >
                        {showChecklist ? "Ocultar ▲" : `Ver ${ultimaLib.itensReprovados.length} pendência(s) ▼`}
                      </button>
                    )}
                  </div>

                  {showChecklist && ultimaLib.itensReprovados.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {ultimaLib.itensReprovados.map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-red-500 text-xs mt-0.5 flex-shrink-0">❌</span>
                          <div>
                            <p className="text-xs text-red-800 font-medium leading-snug">{item.item_nome}</p>
                            {item.observacoes && (
                              <p className="text-[11px] text-red-700 leading-snug">{item.observacoes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {ultimaLib.observacoes && (
                    <p className={`text-[11px] ${liberacao.txt} opacity-70 leading-snug`}>
                      Obs: {ultimaLib.observacoes}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Histórico de Eventos ────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Histórico de registros
          </p>
        </div>

        {/* Summary chips */}
        {items.length > 0 && (
          <div className="px-4 pb-2 flex gap-2 flex-wrap">
            {(["liberacao", "inspecao", "near_miss", "acidente", "desvio", "apr"] as const).map(t => {
              const count = items.filter(i => i.tipo === t).length
              if (count === 0) return null
              const labelMap: Record<string, string> = {
                liberacao: "Liberação", inspecao: "Inspeção", near_miss: "Near Miss",
                acidente: "Acidente", desvio: "Desvio", apr: "APR",
              }
              const bgMap: Record<string, string> = {
                liberacao: "bg-orange-100 text-orange-800",
                inspecao: "bg-teal-100 text-teal-800",
                near_miss: "bg-amber-100 text-amber-800",
                acidente: "bg-red-100 text-red-800",
                desvio: "bg-orange-100 text-orange-800",
                apr: "bg-purple-100 text-purple-800",
              }
              return (
                <span key={t} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bgMap[t]}`}>
                  {labelMap[t]} ({count})
                </span>
              )
            })}
          </div>
        )}

        <div className="px-4 pb-8 space-y-2">
          {erro && (
            <div className="flex flex-col items-center justify-center pt-8 gap-3 text-center">
              <span className="text-4xl">⚠️</span>
              <p className="text-gray-500 text-sm">{erro}</p>
              <button
                onClick={fetchAll}
                className="mt-2 px-5 py-2 bg-green-700 text-white rounded-xl text-sm font-semibold"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!erro && loading && (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
              ))}
            </div>
          )}

          {!erro && !loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-8 gap-3 text-center">
              <span className="text-4xl">📭</span>
              <p className="text-gray-500 text-sm">Nenhum registro SMS para este veículo.</p>
            </div>
          )}

          {!erro && !loading && items.map(item => (
            <div
              key={item.id}
              className={`bg-white rounded-xl border ${item.cor} px-4 py-3 space-y-1`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{item.emoji}</span>
                <span className="text-sm font-semibold text-gray-800 flex-1 leading-snug">{item.titulo}</span>
                {item.status && (
                  <span className="text-[10px] font-medium text-gray-500 capitalize">
                    {item.status.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              {item.subtitulo && (
                <p className="text-xs text-gray-500 leading-snug line-clamp-2 pl-7">{item.subtitulo}</p>
              )}
              <p className="text-[10px] text-gray-400 pl-7">{fmtData(item.data)}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"

// ─── Types ────────────────────────────────────────────────────────────────────

type Veiculo = {
  id: string; placa: string; marca: string; modelo: string; ano: number | null; status: string | null
}

type HistItem = {
  id: string
  tipo: 'inspecao' | 'near_miss' | 'acidente' | 'desvio' | 'apr'
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
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

function BadgeTipo({ tipo }: { tipo: HistItem["tipo"] }) {
  const map: Record<HistItem["tipo"], { label: string; cls: string }> = {
    inspecao:  { label: "Inspeção",  cls: "bg-teal-100 text-teal-800" },
    near_miss: { label: "Near Miss", cls: "bg-amber-100 text-amber-800" },
    acidente:  { label: "Acidente",  cls: "bg-red-100 text-red-800" },
    desvio:    { label: "Desvio",    cls: "bg-orange-100 text-orange-800" },
    apr:       { label: "APR",       cls: "bg-purple-100 text-purple-800" },
  }
  const { label, cls } = map[tipo]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  vehicleId: string
  obraId: string | null
  onBack: () => void
}

export function VeiculoHistoricoScreen({ vehicleId, obraId, onBack }: Props) {
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [items, setItems]     = useState<HistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState<string | null>(null)
  const [obraFiltro, setObraFiltro] = useState<string | null>(obraId)

  useEffect(() => {
    fetchAll()
  }, [vehicleId, obraFiltro])

  const fetchAll = async () => {
    setLoading(true)
    setErro(null)
    try {

    // 1. Vehicle info
    const { data: v } = await (supabase as any)
      .from("vehicles").select("id, placa, marca, modelo, ano, status")
      .eq("id", vehicleId).maybeSingle()
    setVeiculo(v ?? null)

    const obraFilter = (q: any) => obraFiltro ? q.eq("obra_id", obraFiltro) : q

    // 2. Fetch all event types in parallel
    const [r1, r2, r3, r4, r5] = await Promise.all([
      obraFilter((supabase as any).from("sms_inspecoes")
        .select("id, data_inspecao, status, observacoes_gerais")
        .eq("veiculo_id", vehicleId).order("data_inspecao", { ascending: false }).limit(50)),

      obraFilter((supabase as any).from("sms_near_miss")
        .select("id, created_at, o_que_aconteceu, status")
        .eq("veiculo_id", vehicleId).order("created_at", { ascending: false }).limit(50)),

      obraFilter((supabase as any).from("sms_acidentes")
        .select("id, data_hora, tipo, descricao")
        .eq("veiculo_id", vehicleId).order("data_hora", { ascending: false }).limit(50)),

      obraFilter((supabase as any).from("sms_desvios")
        .select("id, data_ocorrencia, tipo_desvio, descricao, severidade, status")
        .eq("veiculo_id", vehicleId).order("data_ocorrencia", { ascending: false }).limit(50)),

      obraFilter((supabase as any).from("sms_aprs")
        .select("id, data_hora_inicio, status, observacoes")
        .eq("veiculo_id", vehicleId).order("data_hora_inicio", { ascending: false }).limit(50)),
    ])

    const merged: HistItem[] = []

    // Inspeções
    for (const row of r1.data ?? []) {
      merged.push({
        id: row.id,
        tipo: "inspecao",
        emoji: "🔍",
        cor: "border-teal-200",
        titulo: `Inspeção — ${row.status ?? ""}`,
        subtitulo: row.observacoes_gerais ?? undefined,
        data: row.data_inspecao,
        status: row.status,
      })
    }

    // Near Miss
    for (const row of r2.data ?? []) {
      merged.push({
        id: row.id,
        tipo: "near_miss",
        emoji: "🚨",
        cor: "border-amber-200",
        titulo: "Near Miss",
        subtitulo: row.o_que_aconteceu,
        data: row.created_at,
        status: row.status,
      })
    }

    // Acidentes
    for (const row of r3.data ?? []) {
      const tipoLabel: Record<string, string> = {
        acidente_tipico:     "Acidente típico",
        doenca_ocupacional:  "Doença ocupacional",
        acidente_trajeto:    "Acidente de trajeto",
        incidente_perigoso:  "Incidente perigoso",
        primeiros_socorros:  "Primeiros socorros",
      }
      merged.push({
        id: row.id,
        tipo: "acidente",
        emoji: "🏥",
        cor: "border-red-200",
        titulo: tipoLabel[row.tipo] ?? row.tipo,
        subtitulo: row.descricao,
        data: row.data_hora,
      })
    }

    // Desvios
    for (const row of r4.data ?? []) {
      merged.push({
        id: row.id,
        tipo: "desvio",
        emoji: "⚠️",
        cor: "border-orange-200",
        titulo: `Desvio — ${row.tipo_desvio ?? ""}`,
        subtitulo: row.descricao,
        data: row.data_ocorrencia,
        status: row.status,
      })
    }

    // APRs
    for (const row of r5.data ?? []) {
      merged.push({
        id: row.id,
        tipo: "apr",
        emoji: "📋",
        cor: "border-purple-200",
        titulo: `APR — ${row.status ?? ""}`,
        subtitulo: row.observacoes ?? undefined,
        data: row.data_hora_inicio,
        status: row.status,
      })
    }

    // Sort all by date descending
    merged.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    setItems(merged)

    } catch (e: any) {
      console.error("[VeiculoHistorico] fetchAll error:", e)
      setErro(e?.message ?? "Erro ao carregar histórico")
    } finally {
      setLoading(false)
    }
  }

  // ── Status badge helpers ────────────────────────────────────────────────────
  const statusCls = (s?: string) => {
    if (!s) return ""
    const map: Record<string, string> = {
      concluida: "text-green-700", concluido: "text-green-700",
      aberto: "text-amber-600", aberta: "text-amber-600",
      encerrado: "text-gray-500", encerrada: "text-gray-500",
      em_andamento: "text-blue-600", em_execucao: "text-blue-600",
    }
    return map[s] ?? "text-gray-500"
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="text-2xl leading-none">‹</button>
          <h1 className="font-bold text-base">Histórico do Veículo</h1>
        </div>

        {veiculo ? (
          <div className="bg-green-800/60 rounded-xl px-4 py-3 flex items-start justify-between">
            <div>
              <p className="font-extrabold text-xl tracking-widest">{veiculo.placa}</p>
              <p className="text-green-200 text-xs mt-0.5">
                {veiculo.marca} {veiculo.modelo}{veiculo.ano ? ` · ${veiculo.ano}` : ""}
              </p>
            </div>
            <div className="text-3xl mt-0.5">🚗</div>
          </div>
        ) : loading ? (
          <div className="bg-green-800/40 rounded-xl px-4 py-3 h-16 animate-pulse" />
        ) : (
          <div className="bg-red-800/60 rounded-xl px-4 py-3">
            <p className="text-sm text-red-200">Veículo não encontrado</p>
          </div>
        )}
      </div>

      {/* Summary chips */}
      {items.length > 0 && (
        <div className="px-4 py-3 bg-white border-b flex gap-2 flex-wrap">
          {(["inspecao", "near_miss", "acidente", "desvio", "apr"] as const).map(t => {
            const count = items.filter(i => i.tipo === t).length
            if (count === 0) return null
            return <BadgeTipo key={t} tipo={t} />
          })}
          <span className="text-xs text-gray-500 ml-auto">{items.length} registro{items.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-2">
        {erro && (
          <div className="flex flex-col items-center justify-center pt-16 gap-3 text-center">
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
          <div className="flex flex-col items-center justify-center pt-16 gap-3 text-center">
            <span className="text-5xl">📭</span>
            <p className="text-gray-500 text-sm">Nenhum registro SMS vinculado a este veículo.</p>
            <p className="text-gray-400 text-xs max-w-[260px]">
              Os próximos lançamentos de Inspeção, Near Miss, Acidente ou Desvio poderão ser vinculados a este veículo.
            </p>
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
                <span className={`text-[10px] font-medium capitalize ${statusCls(item.status)}`}>
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
  )
}

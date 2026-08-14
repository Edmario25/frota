import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"

// ─── Types ────────────────────────────────────────────────────────────────────

type Funcionario = {
  id: string
  nome: string
  cpf: string | null
  cargos: { nome: string } | null
  departamentos: { nome: string } | null
}

type Treinamento = {
  id: string
  nome: string
  status: "em_dia" | "a_vencer" | "vencido" | "pendente"
  data_vencimento: string | null
  nr_referencia: string | null
}

type HistItem = {
  id: string
  tipo: "desvio" | "near_miss" | "acidente" | "dds"
  titulo: string
  subtitulo?: string
  data: string
  emoji: string
  cor: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

const trStatusCfg: Record<string, { label: string; bg: string; txt: string }> = {
  em_dia:   { label: "Em dia",   bg: "#dcfce7", txt: "#166534" },
  a_vencer: { label: "A vencer", bg: "#fef9c3", txt: "#854d0e" },
  vencido:  { label: "Vencido",  bg: "#fee2e2", txt: "#991b1b" },
  pendente: { label: "Pendente", bg: "#f1f5f9", txt: "#475569" },
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  employeeId: string
  obraId: string | null
  onBack: () => void
}

export function FuncionarioHistoricoScreen({ employeeId, obraId, onBack }: Props) {
  const [func, setFunc]         = useState<Funcionario | null>(null)
  const [trein, setTrein]       = useState<Treinamento[]>([])
  const [items, setItems]       = useState<HistItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<"treinamentos" | "historico">("treinamentos")

  useEffect(() => { fetchAll() }, [employeeId])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchFunc(), fetchTreinamentos(), fetchHistorico()])
    setLoading(false)
  }

  const fetchFunc = async () => {
    const { data } = await supabase
      .from("employees")
      .select("id, nome, cpf, cargos(nome), departamentos!fk_employees_departamento(nome)")
      .eq("id", employeeId)
      .maybeSingle()
    setFunc(data as any ?? null)
  }

  const fetchTreinamentos = async () => {
    const { data } = await (supabase as any)
      .from("sms_colaborador_treinamentos")
      .select("id, status, data_vencimento, sms_treinamentos_catalogo(nome, nr_referencia)")
      .eq("colaborador_id", employeeId)
      .order("status")
    setTrein(
      (data ?? []).map((t: any) => ({
        id: t.id,
        nome: t.sms_treinamentos_catalogo?.nome ?? "—",
        nr_referencia: t.sms_treinamentos_catalogo?.nr_referencia ?? null,
        status: t.status ?? "pendente",
        data_vencimento: t.data_vencimento ?? null,
      }))
    )
  }

  const fetchHistorico = async () => {
    const obraFilter = (q: any) => obraId ? q.eq("obra_id", obraId) : q

    const [r1, r2, r3] = await Promise.all([
      // Desvios registrados para esse colaborador
      obraFilter(
        (supabase as any).from("sms_desvios")
          .select("id, tipo_desvio, descricao, created_at")
          .eq("colaborador_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(30)
      ),
      // Near-miss registrados por esse colaborador (como autor)
      obraFilter(
        (supabase as any).from("sms_near_miss")
          .select("id, o_que_aconteceu, created_at")
          .eq("created_by", employeeId)
          .order("created_at", { ascending: false })
          .limit(30)
      ),
      // Acidentes
      obraFilter(
        (supabase as any).from("sms_acidentes")
          .select("id, tipo_acidente, descricao, created_at")
          .eq("created_by", employeeId)
          .order("created_at", { ascending: false })
          .limit(20)
      ),
    ])

    const lista: HistItem[] = []

    for (const d of r1.data ?? []) {
      lista.push({
        id: d.id, tipo: "desvio",
        titulo: `Desvio — ${d.tipo_desvio ?? ""}`,
        subtitulo: d.descricao ?? undefined,
        data: d.created_at,
        emoji: "⚠️", cor: "#f97316",
      })
    }
    for (const n of r2.data ?? []) {
      lista.push({
        id: n.id, tipo: "near_miss",
        titulo: "Near Miss registrado",
        subtitulo: n.o_que_aconteceu ?? undefined,
        data: n.created_at,
        emoji: "🚨", cor: "#eab308",
      })
    }
    for (const a of r3.data ?? []) {
      lista.push({
        id: a.id, tipo: "acidente",
        titulo: `Acidente — ${a.tipo_acidente ?? ""}`,
        subtitulo: a.descricao ?? undefined,
        data: a.created_at,
        emoji: "🏥", cor: "#dc2626",
      })
    }

    lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    setItems(lista)
  }

  // ── Estatísticas de treinamentos ──────────────────────────────────────────

  const vencidos = trein.filter(t => t.status === "vencido").length
  const aVencer  = trein.filter(t => t.status === "a_vencer").length
  const emDia    = trein.filter(t => t.status === "em_dia").length

  const statusGeral = vencidos > 0 ? { txt: "IRREGULAR", bg: "#dc2626" }
    : aVencer > 0 ? { txt: "A VENCER", bg: "#d97706" }
    : emDia > 0   ? { txt: "REGULAR", bg: "#16a34a" }
    : { txt: "SEM DADOS", bg: "#64748b" }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 bg-white border-b border-gray-100 shadow-sm">
        <button onClick={onBack} className="text-gray-500 text-2xl leading-none px-1 -ml-1">‹</button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 text-base leading-tight truncate">
            {loading ? "Carregando..." : func?.nome ?? "Funcionário"}
          </h1>
          <p className="text-xs text-gray-500">
            {func?.cargos?.nome ?? ""}{func?.departamentos?.nome ? ` · ${func.departamentos.nome}` : ""}
          </p>
        </div>
        {/* Badge de status geral */}
        {!loading && (
          <span
            className="text-[10px] font-bold px-2 py-1 rounded-full text-white flex-shrink-0"
            style={{ background: statusGeral.bg }}
          >
            🛡️ {statusGeral.txt}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Resumo de treinamentos */}
          <div className="flex gap-2 px-4 py-3 bg-white border-b border-gray-100">
            {[
              { label: "Em dia",    count: emDia,    color: "#16a34a" },
              { label: "A vencer",  count: aVencer,  color: "#d97706" },
              { label: "Vencidos",  count: vencidos, color: "#dc2626" },
            ].map(s => (
              <div key={s.label} className="flex-1 rounded-xl p-2 text-center"
                style={{ background: `${s.color}15`, border: `1px solid ${s.color}30` }}>
                <p className="text-lg font-extrabold" style={{ color: s.color }}>{s.count}</p>
                <p className="text-[10px] font-medium text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex bg-white border-b border-gray-100">
            {(["treinamentos", "historico"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  tab === t
                    ? "text-green-700 border-b-2 border-green-600"
                    : "text-gray-500"
                }`}
              >
                {t === "treinamentos" ? "📋 Treinamentos" : "📅 Histórico SMS"}
              </button>
            ))}
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto">

            {tab === "treinamentos" && (
              <div className="p-4 space-y-2">
                {trein.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-3xl mb-3">📋</p>
                    <p className="text-sm">Nenhum treinamento registrado</p>
                  </div>
                ) : trein.map(t => {
                  const cfg = trStatusCfg[t.status] ?? trStatusCfg.pendente
                  return (
                    <div key={t.id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{t.nome}</p>
                        {t.nr_referencia && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{t.nr_referencia}</p>
                        )}
                        {t.data_vencimento && (
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Vence: {new Date(t.data_vencimento).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                        style={{ background: cfg.bg, color: cfg.txt }}
                      >
                        {cfg.label.toUpperCase()}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {tab === "historico" && (
              <div className="p-4 space-y-2">
                {items.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-3xl mb-3">📅</p>
                    <p className="text-sm">Nenhum registro SMS para este funcionário</p>
                  </div>
                ) : items.map(item => (
                  <div key={item.id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100">
                    <div className="flex items-start gap-3">
                      <span className="text-xl leading-none mt-0.5">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{item.titulo}</p>
                        {item.subtitulo && (
                          <p className="text-[12px] text-gray-500 mt-1 leading-snug line-clamp-2">{item.subtitulo}</p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1">{fmtData(item.data)}</p>
                      </div>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0 mt-0.5"
                        style={{ background: item.cor }}
                      >
                        {item.tipo.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </>
      )}
    </div>
  )
}

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

type AprAtiva = {
  id: string
  data: string
  hora_inicio: string | null
  descricao_trabalho: string | null
  status: string
  tipo_nome: string | null
}

type PtAtiva = {
  id: string
  tipo_pt: string
  atividade: string
  local: string | null
  data_inicio: string
  data_fim: string | null
  status: string
  responsavel: string | null
  equipe: string | null
}

type EpiEntrega = {
  id: string
  nome: string
  ca_numero: string | null
  data_entrega: string
  data_devolucao: string | null
  quantidade: number
  condicao: string | null
  obra: string | null
  assinado: boolean
}

type Tab = "treinamentos" | "epis" | "aprpt" | "historico"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function fmtDT(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

const trStatusCfg: Record<string, { label: string; bg: string; txt: string }> = {
  em_dia:   { label: "Em dia",   bg: "#dcfce7", txt: "#166534" },
  a_vencer: { label: "A vencer", bg: "#fef9c3", txt: "#854d0e" },
  vencido:  { label: "Vencido",  bg: "#fee2e2", txt: "#991b1b" },
  pendente: { label: "Pendente", bg: "#f1f5f9", txt: "#475569" },
}

const TIPO_PT_LABEL: Record<string, string> = {
  trabalho_altura:  "🧗 Trabalho em altura",
  espaco_confinado: "🕳 Espaço confinado",
  eletrica:         "⚡ Atividade elétrica",
  icamento:         "🏗 Içamento de carga",
  trabalho_quente:  "🔥 Trabalho a quente",
  outros:           "📋 Outros",
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
  const [aprs, setAprs]         = useState<AprAtiva[]>([])
  const [pts, setPts]           = useState<PtAtiva[]>([])
  const [epis, setEpis]         = useState<EpiEntrega[]>([])
  const [loading, setLoading]   = useState(true)
  const [erro, setErro]         = useState<string | null>(null)
  const [tab, setTab]           = useState<Tab>("treinamentos")

  useEffect(() => { fetchAll() }, [employeeId])

  const fetchAll = async () => {
    setLoading(true)
    setErro(null)
    try {
      await Promise.all([fetchFunc(), fetchTreinamentos(), fetchHistorico(), fetchAprsPts(), fetchEpis()])
    } catch (e: any) {
      console.error("[FuncionarioHistorico] fetchAll error:", e)
      setErro(e?.message ?? "Erro ao carregar dados")
    } finally {
      setLoading(false)
    }
  }

  const fetchEpis = async () => {
    const { data } = await (supabase as any)
      .from("sms_colaborador_epis")
      .select("id, data_entrega, data_devolucao, quantidade, condicao, assinatura_base64, sms_epis_catalogo(nome, ca_numero), obras(nome)")
      .eq("colaborador_id", employeeId)
      .order("data_entrega", { ascending: false })
      .limit(50)

    setEpis(
      (data ?? []).map((r: any) => ({
        id:             r.id,
        nome:           r.sms_epis_catalogo?.nome ?? "—",
        ca_numero:      r.sms_epis_catalogo?.ca_numero ?? null,
        data_entrega:   r.data_entrega,
        data_devolucao: r.data_devolucao ?? null,
        quantidade:     r.quantidade ?? 1,
        condicao:       r.condicao ?? null,
        obra:           r.obras?.nome ?? null,
        assinado:       !!r.assinatura_base64,
      }))
    )
  }

  const fetchFunc = async () => {
    const { data, error } = await (supabase as any)
      .from("employees")
      .select("id, nome, cpf, cargos(nome), departamentos(nome)")
      .eq("id", employeeId)
      .maybeSingle()
    if (error) console.warn("[FuncionarioHistorico] fetchFunc:", error.message)
    setFunc(data ?? null)
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

  const fetchAprsPts = async () => {
    const [rAprs, rPts] = await Promise.all([
      // APRs abertas emitidas por este funcionário
      (supabase as any)
        .from("sms_aprs")
        .select("id, data, hora_inicio, descricao_trabalho, status, sms_apr_tipos_atividade(nome)")
        .eq("emitente_id", employeeId)
        .in("status", ["aberta", "em_andamento", "ativa", "em_execucao"])
        .order("data", { ascending: false })
        .limit(10),

      // PTs abertas emitidas por este funcionário
      (supabase as any)
        .from("sms_pt")
        .select("id, tipo_pt, atividade, local, data_inicio, data_fim, status, responsavel, equipe")
        .eq("emitente_id", employeeId)
        .in("status", ["aberta", "em_andamento", "ativa"])
        .order("data_inicio", { ascending: false })
        .limit(10),
    ])

    setAprs(
      (rAprs.data ?? []).map((r: any) => ({
        id: r.id,
        data: r.data,
        hora_inicio: r.hora_inicio ?? null,
        descricao_trabalho: r.descricao_trabalho ?? null,
        status: r.status,
        tipo_nome: r.sms_apr_tipos_atividade?.nome ?? null,
      }))
    )

    setPts(
      (rPts.data ?? []).map((r: any) => ({
        id: r.id,
        tipo_pt: r.tipo_pt ?? "outros",
        atividade: r.atividade ?? "—",
        local: r.local ?? null,
        data_inicio: r.data_inicio,
        data_fim: r.data_fim ?? null,
        status: r.status,
        responsavel: r.responsavel ?? null,
        equipe: r.equipe ?? null,
      }))
    )
  }

  const fetchHistorico = async () => {
    const obraFilter = (q: any) => obraId ? q.eq("obra_id", obraId) : q

    const [r1, r2, r3] = await Promise.all([
      obraFilter((supabase as any).from("sms_desvios")
        .select("id, tipo, descricao, created_at")
        .eq("colaborador_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(30)),

      obraFilter((supabase as any).from("sms_near_miss")
        .select("id, o_que_aconteceu, created_at")
        .eq("registrado_por", employeeId)
        .order("created_at", { ascending: false })
        .limit(30)),

      obraFilter((supabase as any).from("sms_acidentes")
        .select("id, tipo, descricao, created_at")
        .eq("registrado_por", employeeId)
        .order("created_at", { ascending: false })
        .limit(20)),
    ])

    const lista: HistItem[] = []
    for (const d of r1.data ?? []) {
      lista.push({
        id: d.id, tipo: "desvio",
        titulo: `Desvio — ${d.tipo ?? ""}`,
        subtitulo: d.descricao ?? undefined,
        data: d.created_at, emoji: "⚠️", cor: "#f97316",
      })
    }
    for (const n of r2.data ?? []) {
      lista.push({
        id: n.id, tipo: "near_miss",
        titulo: "Near Miss registrado",
        subtitulo: n.o_que_aconteceu ?? undefined,
        data: n.created_at, emoji: "🚨", cor: "#eab308",
      })
    }
    for (const a of r3.data ?? []) {
      lista.push({
        id: a.id, tipo: "acidente",
        titulo: `Acidente — ${a.tipo ?? ""}`,
        subtitulo: a.descricao ?? undefined,
        data: a.created_at, emoji: "🏥", cor: "#dc2626",
      })
    }
    lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    setItems(lista)
  }

  // ── Estatísticas ──────────────────────────────────────────────────────────
  const vencidos = trein.filter(t => t.status === "vencido").length
  const aVencer  = trein.filter(t => t.status === "a_vencer").length
  const emDia    = trein.filter(t => t.status === "em_dia").length

  const statusGeral = vencidos > 0 ? { txt: "IRREGULAR", bg: "#dc2626" }
    : aVencer > 0    ? { txt: "A VENCER",  bg: "#d97706" }
    : emDia > 0      ? { txt: "REGULAR",   bg: "#16a34a" }
    :                  { txt: "SEM DADOS",  bg: "#64748b" }

  const totalAprPt   = aprs.length + pts.length
  const episEmUso    = epis.filter(e => !e.data_devolucao).length
  const episTotal    = epis.length

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
            {func?.cargos?.nome ?? ""}
            {func?.departamentos?.nome ? ` · ${func.departamentos.nome}` : ""}
          </p>
        </div>
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
      ) : erro ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="text-4xl">⚠️</span>
          <p className="text-gray-500 text-sm">{erro}</p>
          <button
            onClick={fetchAll}
            className="mt-2 px-5 py-2 bg-green-700 text-white rounded-xl text-sm font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="flex gap-2 px-4 py-3 bg-white border-b border-gray-100">
            {[
              { label: "Em dia",    count: emDia,      color: "#16a34a" },
              { label: "A vencer",  count: aVencer,    color: "#d97706" },
              { label: "Vencidos",  count: vencidos,   color: "#dc2626" },
              { label: "EPIs em uso", count: episEmUso, color: "#0284c7" },
            ].map(s => (
              <div key={s.label} className="flex-1 rounded-xl p-2 text-center"
                style={{ background: `${s.color}15`, border: `1px solid ${s.color}30` }}>
                <p className="text-lg font-extrabold" style={{ color: s.color }}>{s.count}</p>
                <p className="text-[10px] font-medium text-gray-500 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex bg-white border-b border-gray-100 overflow-x-auto">
            <button
              onClick={() => setTab("treinamentos")}
              className={`flex-shrink-0 px-3 py-3 text-[12px] font-semibold transition-colors ${
                tab === "treinamentos" ? "text-green-700 border-b-2 border-green-600" : "text-gray-500"
              }`}
            >
              📋 Treinamentos
            </button>
            <button
              onClick={() => setTab("epis")}
              className={`flex-shrink-0 px-3 py-3 text-[12px] font-semibold transition-colors relative ${
                tab === "epis" ? "text-green-700 border-b-2 border-green-600" : "text-gray-500"
              }`}
            >
              🦺 EPIs
              {episEmUso > 0 && (
                <span className="absolute top-2 right-1 bg-sky-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {episEmUso}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("aprpt")}
              className={`flex-shrink-0 px-3 py-3 text-[12px] font-semibold transition-colors relative ${
                tab === "aprpt" ? "text-green-700 border-b-2 border-green-600" : "text-gray-500"
              }`}
            >
              🔑 APR / PT
              {totalAprPt > 0 && (
                <span className="absolute top-2 right-1 bg-green-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {totalAprPt}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("historico")}
              className={`flex-shrink-0 px-3 py-3 text-[12px] font-semibold transition-colors ${
                tab === "historico" ? "text-green-700 border-b-2 border-green-600" : "text-gray-500"
              }`}
            >
              📅 Histórico
            </button>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto">

            {/* ── TAB: Treinamentos ─────────────────────────────────────── */}
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

            {/* ── TAB: EPIs ────────────────────────────────────────────── */}
            {tab === "epis" && (
              <div className="p-4 space-y-3">

                {/* Resumo rápido */}
                {episTotal > 0 && (
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-xl p-2.5 text-center bg-sky-50 border border-sky-100">
                      <p className="text-xl font-extrabold text-sky-600">{episEmUso}</p>
                      <p className="text-[10px] text-gray-500 font-medium">Em uso</p>
                    </div>
                    <div className="flex-1 rounded-xl p-2.5 text-center bg-gray-50 border border-gray-100">
                      <p className="text-xl font-extrabold text-gray-500">{episTotal - episEmUso}</p>
                      <p className="text-[10px] text-gray-500 font-medium">Devolvidos</p>
                    </div>
                    <div className="flex-1 rounded-xl p-2.5 text-center bg-slate-50 border border-slate-100">
                      <p className="text-xl font-extrabold text-slate-600">{episTotal}</p>
                      <p className="text-[10px] text-gray-500 font-medium">Total</p>
                    </div>
                  </div>
                )}

                {epis.length === 0 ? (
                  <div className="text-center py-14 text-gray-400">
                    <p className="text-4xl mb-3">🦺</p>
                    <p className="text-sm font-medium">Nenhum EPI registrado</p>
                    <p className="text-xs mt-1 text-gray-400">Os EPIs entregues a este colaborador aparecerão aqui</p>
                  </div>
                ) : (
                  <>
                    {/* Em uso */}
                    {epis.filter(e => !e.data_devolucao).length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          Em uso · {epis.filter(e => !e.data_devolucao).length} item(s)
                        </p>
                        <div className="space-y-2">
                          {epis.filter(e => !e.data_devolucao).map(epi => (
                            <div key={epi.id} className="bg-white rounded-2xl border border-sky-200 p-3.5 shadow-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  <span className="text-xl leading-none mt-0.5">🦺</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 leading-tight">{epi.nome}</p>
                                    {epi.ca_numero && (
                                      <p className="text-[11px] text-gray-400 mt-0.5 font-mono">CA {epi.ca_numero}</p>
                                    )}
                                    <div className="flex flex-wrap gap-x-3 mt-1">
                                      <p className="text-[11px] text-gray-500">
                                        📅 Entregue: {new Date(epi.data_entrega).toLocaleDateString("pt-BR")}
                                      </p>
                                      {epi.quantidade > 1 && (
                                        <p className="text-[11px] text-gray-500">Qtd: {epi.quantidade}</p>
                                      )}
                                    </div>
                                    {epi.obra && (
                                      <p className="text-[11px] text-gray-400 mt-0.5">📍 {epi.obra}</p>
                                    )}
                                    {epi.condicao && (
                                      <p className="text-[11px] text-gray-400 capitalize mt-0.5">
                                        Condição: {epi.condicao}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                                    EM USO
                                  </span>
                                  {epi.assinado && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                                      ✓ Assinado
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Devolvidos */}
                    {epis.filter(e => e.data_devolucao).length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 mt-3">
                          Devolvidos · {epis.filter(e => e.data_devolucao).length} item(s)
                        </p>
                        <div className="space-y-2">
                          {epis.filter(e => e.data_devolucao).map(epi => (
                            <div key={epi.id} className="bg-white rounded-2xl border border-gray-200 p-3 shadow-sm opacity-75">
                              <div className="flex items-center gap-2.5">
                                <span className="text-lg leading-none">🦺</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 leading-tight">{epi.nome}</p>
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    {new Date(epi.data_entrega).toLocaleDateString("pt-BR")} →{" "}
                                    {new Date(epi.data_devolucao!).toLocaleDateString("pt-BR")}
                                  </p>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                                  DEVOLVIDO
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── TAB: APR / PT ─────────────────────────────────────────── */}
            {tab === "aprpt" && (
              <div className="p-4 space-y-4">

                {/* APRs */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    APR — Análise Preliminar de Risco ({aprs.length})
                  </p>

                  {aprs.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-4 text-center">
                      <p className="text-sm text-gray-400">Nenhuma APR aberta</p>
                    </div>
                  ) : aprs.map(apr => (
                    <div key={apr.id} className="bg-white rounded-2xl border border-purple-200 p-3.5 mb-2 shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📋</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 leading-tight">
                              {apr.tipo_nome ?? "APR"}
                            </p>
                            {apr.hora_inicio && (
                              <p className="text-[11px] text-gray-400">
                                {fmtData(apr.data)} às {apr.hora_inicio}
                              </p>
                            )}
                            {!apr.hora_inicio && (
                              <p className="text-[11px] text-gray-400">{fmtData(apr.data)}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 flex-shrink-0">
                          {apr.status.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </div>
                      {apr.descricao_trabalho && (
                        <p className="text-xs text-gray-600 leading-snug pl-7 line-clamp-2">
                          {apr.descricao_trabalho}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* PTs */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    PT — Permissão de Trabalho ({pts.length})
                  </p>

                  {pts.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-4 text-center">
                      <p className="text-sm text-gray-400">Nenhuma PT aberta</p>
                    </div>
                  ) : pts.map(pt => {
                    const isExpirada = pt.data_fim ? new Date(pt.data_fim) < new Date() : false
                    return (
                      <div key={pt.id} className={`bg-white rounded-2xl border p-3.5 mb-2 shadow-sm ${
                        isExpirada ? "border-red-200" : "border-green-200"
                      }`}>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🔑</span>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 leading-tight">
                                {TIPO_PT_LABEL[pt.tipo_pt] ?? pt.tipo_pt}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                Início: {fmtDT(pt.data_inicio)}
                              </p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            isExpirada
                              ? "bg-red-100 text-red-800"
                              : "bg-green-100 text-green-800"
                          }`}>
                            {isExpirada ? "EXPIRADA" : pt.status.replace(/_/g, " ").toUpperCase()}
                          </span>
                        </div>

                        {/* Atividade e local */}
                        <div className="pl-7 space-y-0.5">
                          <p className="text-xs text-gray-700 font-medium leading-snug">{pt.atividade}</p>
                          {pt.local && (
                            <p className="text-[11px] text-gray-500">📍 {pt.local}</p>
                          )}
                          {pt.responsavel && (
                            <p className="text-[11px] text-gray-500">👤 Resp: {pt.responsavel}</p>
                          )}
                          {pt.equipe && (
                            <p className="text-[11px] text-gray-500">👥 Equipe: {pt.equipe}</p>
                          )}
                          {pt.data_fim && (
                            <p className={`text-[11px] font-medium ${isExpirada ? "text-red-600" : "text-green-700"}`}>
                              Válida até: {fmtDT(pt.data_fim)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {totalAprPt === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-3xl mb-3">🔑</p>
                    <p className="text-sm">Nenhuma APR ou PT aberta para este funcionário</p>
                    <p className="text-xs mt-1 max-w-[240px] mx-auto leading-snug">
                      Documentos abertos aparecerão aqui após a sincronização.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Histórico SMS ────────────────────────────────────── */}
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

import { useEffect, useState, useCallback } from "react"
import { Layout } from "@/components/layout/Layout"
import { supabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useObras } from "@/hooks/useObras"
import { downloadCsv } from "@/lib/exportCsv"
import {
  BarChart3, RefreshCw, Download, Search, CheckCircle2,
  AlertTriangle, XCircle, Clock, ChevronDown, ChevronRight,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
type TrStatus = "em_dia" | "a_vencer" | "vencido" | "pendente"

interface TreinamentoFunc {
  nome_treinamento: string
  nr_referencia:    string | null
  status:           TrStatus
  data_vencimento:  string | null
}

interface FuncionarioConf {
  id:          string
  nome:        string
  cargo:       string | null
  obra:        string | null
  total:       number
  em_dia:      number
  a_vencer:    number
  vencidos:    number
  pendentes:   number
  pct:         number   // % em dia
  treinamentos: TreinamentoFunc[]
}

interface ObraConf {
  id:       string
  nome:     string
  total_func:   number
  conf_plena:   number   // 100% em dia
  pct_media:    number   // média de conformidade
  funcionarios: FuncionarioConf[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const statusCfg: Record<TrStatus, { label: string; cls: string; icon: React.ElementType }> = {
  em_dia:   { label: "Em dia",   cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",  icon: CheckCircle2 },
  a_vencer: { label: "A vencer", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertTriangle },
  vencido:  { label: "Vencido",  cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",         icon: XCircle },
  pendente: { label: "Pendente", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800",                         icon: Clock },
}

function corPct(pct: number) {
  if (pct >= 80) return "text-green-600"
  if (pct >= 50) return "text-amber-600"
  return "text-red-600"
}

function barBg(pct: number) {
  if (pct >= 80) return "bg-green-500"
  if (pct >= 50) return "bg-amber-500"
  return "bg-red-500"
}

function fmtData(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR")
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function SmsConformidade() {
  const { obras } = useObras()

  const [dados,    setDados]    = useState<ObraConf[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filtroObra, setFiltroObra] = useState("all")
  const [busca,    setBusca]    = useState("")
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [expandFunc,  setExpandFunc]  = useState<Set<string>>(new Set())

  // ── Busca e agrupa dados ────────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    setLoading(true)
    try {
      // Busca todos os treinamentos de colaboradores (com dados relacionados)
      const q = (supabase as any)
        .from("sms_colaborador_treinamentos")
        .select(`
          id, status, data_vencimento,
          colaborador_id,
          employees!sms_colaborador_treinamentos_colaborador_id_fkey(
            id, nome,
            cargos(nome),
            obra_funcionarios(obras(id, nome), status)
          ),
          sms_treinamentos_catalogo(nome, nr_referencia)
        `)
        .order("data_vencimento", { ascending: true, nullsFirst: false })

      const { data, error } = await q
      if (error) throw error

      // Mapeia para estrutura por obra → funcionário
      const obraMap = new Map<string, ObraConf>()

      // Obra "Sem obra" para funcionários não alocados
      const SEM_OBRA_ID = "__sem_obra__"
      obraMap.set(SEM_OBRA_ID, {
        id: SEM_OBRA_ID, nome: "Sem obra vinculada",
        total_func: 0, conf_plena: 0, pct_media: 0, funcionarios: [],
      })

      const funcMap = new Map<string, FuncionarioConf>()  // key: funcId|obraId

      ;(data ?? []).forEach((r: any) => {
        const emp     = r.employees
        if (!emp) return

        const cargo   = emp.cargos?.nome ?? null
        const ativas  = (emp.obra_funcionarios ?? []).filter((of: any) => of.status)
        const obraAtiva = ativas[0]?.obras

        const obraId   = obraAtiva?.id   ?? SEM_OBRA_ID
        const obraNome = obraAtiva?.nome ?? "Sem obra vinculada"

        // Filtra por obra selecionada
        if (filtroObra !== "all" && filtroObra !== obraId) return

        // Garante que a obra existe no mapa
        if (!obraMap.has(obraId)) {
          obraMap.set(obraId, {
            id: obraId, nome: obraNome,
            total_func: 0, conf_plena: 0, pct_media: 0, funcionarios: [],
          })
        }

        // Chave única funcionário × obra
        const key = `${emp.id}|${obraId}`
        if (!funcMap.has(key)) {
          funcMap.set(key, {
            id: emp.id, nome: emp.nome, cargo, obra: obraNome,
            total: 0, em_dia: 0, a_vencer: 0, vencidos: 0, pendentes: 0, pct: 0,
            treinamentos: [],
          })
        }

        const func = funcMap.get(key)!
        func.total++
        func[r.status as TrStatus === "em_dia" ? "em_dia"
           : r.status === "a_vencer" ? "a_vencer"
           : r.status === "vencido"  ? "vencidos"
           : "pendentes"]++

        func.treinamentos.push({
          nome_treinamento: r.sms_treinamentos_catalogo?.nome ?? "—",
          nr_referencia:    r.sms_treinamentos_catalogo?.nr_referencia ?? null,
          status:           r.status as TrStatus,
          data_vencimento:  r.data_vencimento,
        })

        // Associa funcionário à obra no mapa de obras
        const obraConf = obraMap.get(obraId)!
        if (!obraConf.funcionarios.find(f => f.id === emp.id)) {
          obraConf.funcionarios.push(func)
        }
      })

      // Recalcula % de conformidade
      funcMap.forEach(f => {
        f.pct = f.total > 0 ? Math.round((f.em_dia / f.total) * 100) : 0
      })

      // Recalcula métricas por obra
      obraMap.forEach(o => {
        const funcs = o.funcionarios
        o.total_func  = funcs.length
        o.conf_plena  = funcs.filter(f => f.pct === 100).length
        o.pct_media   = funcs.length
          ? Math.round(funcs.reduce((s, f) => s + f.pct, 0) / funcs.length)
          : 0
        // Ordena funcionários: menor % primeiro
        o.funcionarios.sort((a, b) => a.pct - b.pct)
      })

      // Remove "Sem obra" se vazio
      if (obraMap.get(SEM_OBRA_ID)?.total_func === 0) obraMap.delete(SEM_OBRA_ID)

      setDados(Array.from(obraMap.values()).sort((a, b) => a.pct_media - b.pct_media))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filtroObra])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Toggle expansão ─────────────────────────────────────────────────────────
  const toggleObra = (id: string) =>
    setExpandidos(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleFunc = (id: string) =>
    setExpandFunc(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // ── KPIs globais ────────────────────────────────────────────────────────────
  const todasFunc  = dados.flatMap(o => o.funcionarios)
  const totalFunc  = new Set(todasFunc.map(f => f.id)).size
  const mediaGeral = todasFunc.length
    ? Math.round(todasFunc.reduce((s, f) => s + f.pct, 0) / todasFunc.length) : 0
  const criticos   = todasFunc.filter(f => f.vencidos > 0).length
  const confPlena  = todasFunc.filter(f => f.pct === 100).length

  // ── Filtro de busca ─────────────────────────────────────────────────────────
  const dadosFiltrados = dados.map(o => ({
    ...o,
    funcionarios: o.funcionarios.filter(f =>
      !busca || f.nome.toLowerCase().includes(busca.toLowerCase())
    ),
  })).filter(o => o.funcionarios.length > 0 || !busca)

  // ── Exportar CSV ────────────────────────────────────────────────────────────
  const exportar = () => {
    const headers = ["Obra", "Funcionário", "Cargo", "Treinamento", "NR", "Status", "Vencimento", "% Conformidade"]
    const rows: string[][] = []
    dados.forEach(o => {
      o.funcionarios.forEach(f => {
        if (f.treinamentos.length === 0) {
          rows.push([o.nome, f.nome, f.cargo ?? "", "—", "—", "—", "—", `${f.pct}%`])
        } else {
          f.treinamentos.forEach(t => {
            rows.push([
              o.nome, f.nome, f.cargo ?? "",
              t.nome_treinamento, t.nr_referencia ?? "—",
              statusCfg[t.status].label,
              fmtData(t.data_vencimento),
              `${f.pct}%`,
            ])
          })
        }
      })
    })
    downloadCsv(headers, rows, `conformidade_treinamentos_${new Date().toISOString().split("T")[0]}`)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-violet-500" />
              Conformidade de Treinamentos
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              % de treinamentos em dia por colaborador e por obra
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchDados} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportar} disabled={loading || dados.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Funcionários",   value: totalFunc,               color: "text-foreground",   bg: "bg-muted/50" },
            { label: "Conformidade média", value: `${mediaGeral}%`,   color: corPct(mediaGeral),  bg: "bg-muted/50" },
            { label: "100% em dia",    value: confPlena,               color: "text-green-600",    bg: "bg-green-50 dark:bg-green-900/10" },
            { label: "Com vencidos",   value: criticos,                color: criticos > 0 ? "text-red-600" : "text-muted-foreground", bg: criticos > 0 ? "bg-red-50 dark:bg-red-900/10" : "bg-muted/50" },
          ].map(k => (
            <div key={k.label} className={cn("rounded-lg border border-border/50 px-4 py-3", k.bg)}>
              <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
              <p className={cn("text-2xl font-extrabold mt-0.5", k.color)}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar funcionário..."
              className="pl-9"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <Select value={filtroObra} onValueChange={setFiltroObra}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por obra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Lista por obra */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-xl border border-border/50 bg-card p-4 animate-pulse">
                <div className="h-5 bg-muted rounded w-1/3 mb-3" />
                <div className="h-3 bg-muted rounded w-full" />
              </div>
            ))}
          </div>
        ) : dadosFiltrados.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card p-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Nenhum dado encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Registre treinamentos para ver a conformidade
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dadosFiltrados.map(obra => {
              const expanded = expandidos.has(obra.id)
              return (
                <div key={obra.id} className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">

                  {/* Cabeçalho da obra */}
                  <button
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => toggleObra(obra.id)}
                  >
                    {expanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{obra.nome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {obra.total_func} funcionário{obra.total_func !== 1 ? "s" : ""} ·{" "}
                        {obra.conf_plena} com 100% em dia
                      </p>
                    </div>

                    {/* Barra de conformidade */}
                    <div className="flex-shrink-0 w-48 hidden sm:block">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Conformidade média</span>
                        <span className={cn("text-sm font-bold", corPct(obra.pct_media))}>
                          {obra.pct_media}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", barBg(obra.pct_media))}
                          style={{ width: `${obra.pct_media}%` }}
                        />
                      </div>
                    </div>

                    {/* Badge mobile */}
                    <span className={cn(
                      "sm:hidden text-sm font-bold flex-shrink-0",
                      corPct(obra.pct_media)
                    )}>
                      {obra.pct_media}%
                    </span>
                  </button>

                  {/* Funcionários */}
                  {expanded && (
                    <div className="border-t border-border/50 divide-y divide-border/40">
                      {obra.funcionarios.map(func => {
                        const funcKey = `${func.id}|${obra.id}`
                        const funcExpanded = expandFunc.has(funcKey)
                        return (
                          <div key={funcKey}>
                            {/* Linha do funcionário */}
                            <button
                              className="w-full flex items-center gap-3 px-6 py-3 hover:bg-muted/20 transition-colors text-left"
                              onClick={() => toggleFunc(funcKey)}
                            >
                              {funcExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              }

                              {/* Avatar iniciais */}
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0",
                                barBg(func.pct)
                              )}>
                                {func.nome.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground leading-tight truncate">
                                  {func.nome}
                                </p>
                                {func.cargo && (
                                  <p className="text-xs text-muted-foreground">{func.cargo}</p>
                                )}
                              </div>

                              {/* Badges de status */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {func.vencidos > 0 && (
                                  <span className="text-[10px] font-semibold bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">
                                    {func.vencidos} vencido{func.vencidos > 1 ? "s" : ""}
                                  </span>
                                )}
                                {func.a_vencer > 0 && (
                                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">
                                    {func.a_vencer} a vencer
                                  </span>
                                )}
                              </div>

                              {/* Barra individual */}
                              <div className="w-32 flex-shrink-0 hidden md:block">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn("h-full rounded-full", barBg(func.pct))}
                                      style={{ width: `${func.pct}%` }}
                                    />
                                  </div>
                                  <span className={cn("text-xs font-bold w-9 text-right", corPct(func.pct))}>
                                    {func.pct}%
                                  </span>
                                </div>
                              </div>
                            </button>

                            {/* Treinamentos do funcionário */}
                            {funcExpanded && (
                              <div className="bg-muted/20 border-t border-border/30 px-16 py-2 space-y-1">
                                {func.treinamentos.length === 0 ? (
                                  <p className="text-xs text-muted-foreground py-2">Nenhum treinamento registrado</p>
                                ) : func.treinamentos.map((t, i) => {
                                  const cfg = statusCfg[t.status]
                                  const Icon = cfg.icon
                                  return (
                                    <div key={i} className="flex items-center gap-3 py-1">
                                      <Icon className={cn("h-3.5 w-3.5 flex-shrink-0",
                                        t.status === "em_dia"   ? "text-green-500" :
                                        t.status === "a_vencer" ? "text-amber-500" :
                                        t.status === "vencido"  ? "text-red-500"   : "text-slate-400"
                                      )} />
                                      <span className="text-sm text-foreground flex-1 truncate">
                                        {t.nome_treinamento}
                                        {t.nr_referencia && (
                                          <span className="text-xs text-muted-foreground ml-2">{t.nr_referencia}</span>
                                        )}
                                      </span>
                                      <span className={cn(
                                        "text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0",
                                        cfg.cls
                                      )}>
                                        {cfg.label}
                                      </span>
                                      <span className="text-xs text-muted-foreground w-24 text-right flex-shrink-0">
                                        {fmtData(t.data_vencimento)}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}

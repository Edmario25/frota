import { useState, useEffect, useCallback } from "react"
import { Layout } from "@/components/layout/Layout"
import { supabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { useObras } from "@/hooks/useObras"
import { useToast } from "@/hooks/use-toast"
import { downloadCsv } from "@/lib/exportCsv"
import { cn } from "@/lib/utils"
import {
  DollarSign, Users, Clock, TrendingUp, Download, RefreshCw,
  Search, Building2, ChevronDown, ChevronRight, Plus, Wallet,
  AlertTriangle, CheckCircle2, FileText,
} from "lucide-react"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────
interface FuncCusto {
  id:             string
  nome:           string
  cargo:          string | null
  obra_nome:      string | null
  obra_id:        string | null
  // RH
  salario_base:   number
  jornada_horas:  number     // horas/mês padrão (default 220)
  vale_alim:      number
  vale_transp:    number
  // Calculados no período
  he_horas:       number     // total horas extras no período
  he_custo:       number     // custo das HEs (50% adicional)
  valor_hora:     number     // salario_base / jornada_horas
  // Banco de horas
  banco_credito:  number     // total HE acumulado (all time)
  banco_debito:   number     // compensações / pagamentos
  banco_saldo:    number     // crédito - débito
  // Total do período
  total_periodo:  number
}

interface ObraCusto {
  id:           string
  nome:         string
  funcionarios: FuncCusto[]
  total_salarios: number
  total_he:       number
  total_beneficios: number
  total_geral:    number
}

interface BancoLanc {
  id:             string
  employee_id:    string
  tipo:           "compensacao" | "pagamento" | "ajuste"
  horas:          number
  data_referencia: string
  descricao:      string | null
  obra_id:        string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtH = (h: number) => {
  if (h === 0) return "0h"
  const s = h < 0 ? "-" : ""
  const abs = Math.abs(h)
  return `${s}${Math.floor(abs)}h${Math.round((abs % 1) * 60).toString().padStart(2,"0")}m`
}

const FATOR_HE = 1.5   // adicional de 50% sobre a hora normal

// ─── Componente ───────────────────────────────────────────────────────────────
export default function RelatorioFolha() {
  const { obras } = useObras()
  const { toast } = useToast()

  const hoje   = new Date()
  const [mesRef,   setMesRef]   = useState(format(hoje, "yyyy-MM"))
  const [filtroObra, setFiltroObra] = useState("all")
  const [busca,    setBusca]    = useState("")
  const [loading,  setLoading]  = useState(false)

  const [porObra,    setPorObra]    = useState<ObraCusto[]>([])
  const [porFunc,    setPorFunc]    = useState<FuncCusto[]>([])
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  // Banco de horas — modal
  const [modalBanco,  setModalBanco]  = useState(false)
  const [funcSel,     setFuncSel]     = useState<FuncCusto | null>(null)
  const [lancamentos, setLancamentos] = useState<BancoLanc[]>([])
  const [formBanco,   setFormBanco]   = useState({ tipo: "compensacao", horas: "", data_referencia: format(hoje,"yyyy-MM-dd"), descricao: "" })
  const [savingBanco, setSavingBanco] = useState(false)

  // ── Período (primeiro e último dia do mês) ─────────────────────────────────
  const dataInicio = `${mesRef}-01`
  const dataFim    = format(endOfMonth(new Date(mesRef + "-01")), "yyyy-MM-dd")

  // ── Fetch principal ────────────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Funcionários ativos com RH
      const { data: funcs } = await (supabase as any)
        .from("employees")
        .select(`
          id, nome,
          cargos(nome),
          obra_funcionarios!inner(obra_id, status, obras(id, nome))
        `)
        .eq("status", "ativo")
        .eq("obra_funcionarios.status", true)

      if (!funcs?.length) { setPorObra([]); setPorFunc([]); setLoading(false); return }

      const empIds = funcs.map((f: any) => f.id)

      // 2. Dados RH (salário, jornada, benefícios)
      const { data: rh } = await (supabase as any)
        .from("employee_dados_rh")
        .select("employee_id, salario_base, jornada_horas, vale_alimentacao, vale_transporte")
        .in("employee_id", empIds)

      const rhMap = new Map<string, any>()
      ;(rh ?? []).forEach((r: any) => rhMap.set(r.employee_id, r))

      // 3. Horas extras no período selecionado
      const { data: he } = await (supabase as any)
        .from("efetivo_ponto")
        .select("employee_id, horas_extras")
        .in("employee_id", empIds)
        .gte("data", dataInicio)
        .lte("data", dataFim)

      const heMap = new Map<string, number>()
      ;(he ?? []).forEach((r: any) => {
        heMap.set(r.employee_id, (heMap.get(r.employee_id) ?? 0) + Number(r.horas_extras ?? 0))
      })

      // 4. Banco de horas — total acumulado (all time)
      const { data: heTotal } = await (supabase as any)
        .from("efetivo_ponto")
        .select("employee_id, horas_extras")
        .in("employee_id", empIds)

      const heTotalMap = new Map<string, number>()
      ;(heTotal ?? []).forEach((r: any) => {
        heTotalMap.set(r.employee_id, (heTotalMap.get(r.employee_id) ?? 0) + Number(r.horas_extras ?? 0))
      })

      // 5. Lançamentos banco de horas (débitos)
      const { data: lancs } = await (supabase as any)
        .from("banco_horas_lancamentos")
        .select("employee_id, horas, tipo")
        .in("employee_id", empIds)

      const debitoMap = new Map<string, number>()
      ;(lancs ?? []).forEach((l: any) => {
        debitoMap.set(l.employee_id, (debitoMap.get(l.employee_id) ?? 0) + Number(l.horas ?? 0))
      })

      // 6. Monta FuncCusto
      const funcCustos: FuncCusto[] = funcs.map((f: any) => {
        const rhd         = rhMap.get(f.id)
        const salario     = Number(rhd?.salario_base   ?? 0)
        const jornada     = Number(rhd?.jornada_horas  ?? 220)
        const valeAlim    = Number(rhd?.vale_alimentacao ?? 0)
        const valeTr      = Number(rhd?.vale_transporte  ?? 0)
        const heH         = heMap.get(f.id)       ?? 0
        const heTot       = heTotalMap.get(f.id)  ?? 0
        const debito      = debitoMap.get(f.id)   ?? 0
        const valorHora   = jornada > 0 ? salario / jornada : 0
        const heCusto     = heH * valorHora * FATOR_HE
        const obraAtiva   = f.obra_funcionarios?.[0]

        return {
          id:            f.id,
          nome:          f.nome,
          cargo:         f.cargos?.nome ?? null,
          obra_nome:     obraAtiva?.obras?.nome ?? null,
          obra_id:       obraAtiva?.obras?.id   ?? null,
          salario_base:  salario,
          jornada_horas: jornada,
          vale_alim:     valeAlim,
          vale_transp:   valeTr,
          he_horas:      heH,
          he_custo:      heCusto,
          valor_hora:    valorHora,
          banco_credito: heTot,
          banco_debito:  debito,
          banco_saldo:   heTot - debito,
          total_periodo: salario + heCusto + valeAlim + valeTr,
        }
      })

      // Filtra por obra
      const filtrados = filtroObra === "all"
        ? funcCustos
        : funcCustos.filter(f => f.obra_id === filtroObra)

      setPorFunc(filtrados)

      // 7. Agrupa por obra
      const obraMap = new Map<string, ObraCusto>()
      filtrados.forEach(f => {
        const oId   = f.obra_id   ?? "__sem_obra__"
        const oNome = f.obra_nome ?? "Sem obra"
        if (!obraMap.has(oId)) {
          obraMap.set(oId, { id: oId, nome: oNome, funcionarios: [], total_salarios: 0, total_he: 0, total_beneficios: 0, total_geral: 0 })
        }
        const o = obraMap.get(oId)!
        o.funcionarios.push(f)
        o.total_salarios   += f.salario_base
        o.total_he         += f.he_custo
        o.total_beneficios += f.vale_alim + f.vale_transp
        o.total_geral      += f.total_periodo
      })

      setPorObra(Array.from(obraMap.values()).sort((a,b) => b.total_geral - a.total_geral))

    } catch (e) {
      console.error(e)
      toast({ title: "Erro ao carregar dados", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [mesRef, filtroObra])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── KPIs globais ────────────────────────────────────────────────────────────
  const totalFuncs     = porFunc.length
  const totalSalarios  = porFunc.reduce((s, f) => s + f.salario_base,  0)
  const totalHe        = porFunc.reduce((s, f) => s + f.he_custo,      0)
  const totalBeneficios= porFunc.reduce((s, f) => s + f.vale_alim + f.vale_transp, 0)
  const totalGeral     = porFunc.reduce((s, f) => s + f.total_periodo, 0)
  const bancoCriticos  = porFunc.filter(f => f.banco_saldo > 40).length  // > 40h acumuladas

  // ── Toggle obra expandida ───────────────────────────────────────────────────
  const toggleObra = (id: string) =>
    setExpandidos(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // ── Abrir modal banco de horas ──────────────────────────────────────────────
  const abrirBanco = async (func: FuncCusto) => {
    setFuncSel(func)
    setModalBanco(true)
    const { data } = await (supabase as any)
      .from("banco_horas_lancamentos")
      .select("id, tipo, horas, data_referencia, descricao, obra_id")
      .eq("employee_id", func.id)
      .order("data_referencia", { ascending: false })
    setLancamentos(data ?? [])
  }

  // ── Salvar lançamento banco ─────────────────────────────────────────────────
  const salvarBanco = async () => {
    if (!funcSel || !formBanco.horas || !formBanco.data_referencia) {
      toast({ title: "Preencha horas e data", variant: "destructive" }); return
    }
    setSavingBanco(true)
    const { error } = await (supabase as any).from("banco_horas_lancamentos").insert({
      employee_id:     funcSel.id,
      tipo:            formBanco.tipo,
      horas:           Number(formBanco.horas),
      data_referencia: formBanco.data_referencia,
      descricao:       formBanco.descricao || null,
      obra_id:         funcSel.obra_id || null,
    })
    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" })
    } else {
      toast({ title: "Lançamento registrado!" })
      setFormBanco({ tipo: "compensacao", horas: "", data_referencia: format(hoje,"yyyy-MM-dd"), descricao: "" })
      await abrirBanco(funcSel)
      fetchDados()
    }
    setSavingBanco(false)
  }

  // ── Exportar CSV ────────────────────────────────────────────────────────────
  const exportarPorObra = () => {
    const h = ["Obra", "Funcionários", "Total Salários", "Total HE", "Total Benefícios", "Total Geral"]
    const r = porObra.map(o => [
      o.nome, String(o.funcionarios.length),
      fmt(o.total_salarios), fmt(o.total_he), fmt(o.total_beneficios), fmt(o.total_geral),
    ])
    downloadCsv(h, r, `custo_obra_${mesRef}`)
  }

  const exportarPorFunc = () => {
    const h = [
      "Funcionário", "Cargo", "Obra",
      "Salário Base", "Valor/Hora", "HE (horas)", "HE (custo)",
      "Vale Alim.", "Vale Transp.", "Total Período",
      "Banco Crédito", "Banco Débito", "Banco Saldo",
    ]
    const r = funcFiltrados.map(f => [
      f.nome, f.cargo ?? "", f.obra_nome ?? "",
      fmt(f.salario_base), fmt(f.valor_hora), fmtH(f.he_horas), fmt(f.he_custo),
      fmt(f.vale_alim), fmt(f.vale_transp), fmt(f.total_periodo),
      fmtH(f.banco_credito), fmtH(f.banco_debito), fmtH(f.banco_saldo),
    ])
    downloadCsv(h, r, `custo_funcionario_${mesRef}`)
  }

  const funcFiltrados = porFunc.filter(f =>
    !busca || f.nome.toLowerCase().includes(busca.toLowerCase())
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Estimativa de Custo de Pessoal
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visão gerencial estimada por obra e funcionário — não substitui a folha de pagamento oficial
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDados} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Mês de referência</Label>
            <Input
              type="month"
              className="h-8 text-sm w-40"
              value={mesRef}
              onChange={e => setMesRef(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Obra</Label>
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger className="h-8 text-sm w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Atalhos de mês */}
          <div className="flex gap-1.5 pb-0.5">
            {[-2,-1,0].map(d => {
              const m = format(subMonths(hoje, -d), "yyyy-MM")
              const l = format(subMonths(hoje, -d), "MMM/yy")
              return (
                <Button key={d} size="sm" variant={mesRef === m ? "default" : "outline"}
                  className="h-8 text-xs" onClick={() => setMesRef(m)}>
                  {l}
                </Button>
              )
            })}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { icon: Users,     label: "Funcionários",  value: totalFuncs,              color: "text-foreground",  bg: "bg-muted/50",                         fmt: String },
            { icon: DollarSign,label: "Salário Base",  value: totalSalarios,           color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-900/10",       fmt: fmt },
            { icon: Clock,     label: "Horas Extras",  value: totalHe,                 color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-900/10",     fmt: fmt },
            { icon: Wallet,    label: "Benefícios",    value: totalBeneficios,         color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-900/10",   fmt: fmt },
            { icon: TrendingUp,label: "Custo Total",   value: totalGeral,              color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/10", fmt: fmt },
          ].map(k => (
            <div key={k.label} className={cn("rounded-lg border border-border/50 px-4 py-3", k.bg)}>
              <div className="flex items-center gap-1.5 mb-1">
                <k.icon className={cn("h-3.5 w-3.5", k.color)} />
                <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
              </div>
              <p className={cn("text-xl font-extrabold", k.color)}>{k.fmt(k.value as any)}</p>
            </div>
          ))}
        </div>

        {bancoCriticos > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <span className="font-semibold">{bancoCriticos} funcionário{bancoCriticos !== 1 ? "s" : ""}</span>{" "}
              com saldo de banco de horas acima de 40h — considere compensação ou pagamento.
            </p>
          </div>
        )}

        {/* Abas */}
        <Tabs defaultValue="por-obra">
          <TabsList>
            <TabsTrigger value="por-obra"  className="gap-1.5 text-xs">
              <Building2 className="h-3.5 w-3.5" /> Por Obra
            </TabsTrigger>
            <TabsTrigger value="por-func"  className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" /> Por Funcionário
            </TabsTrigger>
            <TabsTrigger value="banco"     className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" /> Banco de Horas
            </TabsTrigger>
          </TabsList>

          {/* ── Aba: Por Obra ── */}
          <TabsContent value="por-obra" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={exportarPorObra} disabled={!porObra.length}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
              </div>
            ) : porObra.length === 0 ? (
              <EmptyState icon={Building2} msg="Nenhum dado encontrado para o período" />
            ) : (
              <div className="space-y-3">
                {porObra.map(o => {
                  const exp = expandidos.has(o.id)
                  return (
                    <div key={o.id} className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
                      <button
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                        onClick={() => toggleObra(o.id)}
                      >
                        {exp ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{o.nome}</p>
                          <p className="text-xs text-muted-foreground">{o.funcionarios.length} funcionários</p>
                        </div>
                        {/* mini-tabela de custos */}
                        <div className="hidden md:flex items-center gap-6 text-right">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Folha</p>
                            <p className="text-sm font-semibold text-blue-600">{fmt(o.total_salarios)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">HE</p>
                            <p className="text-sm font-semibold text-amber-600">{fmt(o.total_he)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Benefícios</p>
                            <p className="text-sm font-semibold text-violet-600">{fmt(o.total_beneficios)}</p>
                          </div>
                          <div className="min-w-[120px]">
                            <p className="text-[10px] text-muted-foreground">Total</p>
                            <p className="text-base font-extrabold text-emerald-600">{fmt(o.total_geral)}</p>
                          </div>
                        </div>
                        <p className="md:hidden text-base font-extrabold text-emerald-600">{fmt(o.total_geral)}</p>
                      </button>

                      {exp && (
                        <div className="border-t border-border/50 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead>Funcionário</TableHead>
                                <TableHead>Cargo</TableHead>
                                <TableHead className="text-right">Salário Base</TableHead>
                                <TableHead className="text-right">HE (h)</TableHead>
                                <TableHead className="text-right">HE (R$)</TableHead>
                                <TableHead className="text-right">Benefícios</TableHead>
                                <TableHead className="text-right font-bold">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {o.funcionarios.map(f => (
                                <TableRow key={f.id} className="hover:bg-muted/20">
                                  <TableCell className="text-sm font-medium">{f.nome}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{f.cargo ?? "—"}</TableCell>
                                  <TableCell className="text-right text-sm">{fmt(f.salario_base)}</TableCell>
                                  <TableCell className="text-right text-sm">
                                    <span className={f.he_horas > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                                      {fmtH(f.he_horas)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    <span className={f.he_custo > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                                      {fmt(f.he_custo)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-muted-foreground">
                                    {fmt(f.vale_alim + f.vale_transp)}
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-bold text-emerald-600">
                                    {fmt(f.total_periodo)}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-muted/20 font-bold">
                                <TableCell colSpan={2} className="text-sm">Total</TableCell>
                                <TableCell className="text-right text-sm text-blue-600">{fmt(o.total_salarios)}</TableCell>
                                <TableCell />
                                <TableCell className="text-right text-sm text-amber-600">{fmt(o.total_he)}</TableCell>
                                <TableCell className="text-right text-sm text-violet-600">{fmt(o.total_beneficios)}</TableCell>
                                <TableCell className="text-right text-sm text-emerald-600">{fmt(o.total_geral)}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Aba: Por Funcionário ── */}
          <TabsContent value="por-func" className="mt-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 h-8 text-sm" placeholder="Buscar funcionário..."
                  value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" onClick={exportarPorFunc} className="ml-auto">
                <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
              </Button>
            </div>

            <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Funcionário</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead className="text-right">Salário Base</TableHead>
                      <TableHead className="text-right">Valor/h</TableHead>
                      <TableHead className="text-right">HE (h)</TableHead>
                      <TableHead className="text-right">HE (R$)</TableHead>
                      <TableHead className="text-right">Vale Alim.</TableHead>
                      <TableHead className="text-right">Vale Transp.</TableHead>
                      <TableHead className="text-right font-bold">Total Período</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({length: 5}).map((_,i) => (
                        <TableRow key={i}>
                          {Array.from({length: 9}).map((_,j) => (
                            <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse w-16" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : funcFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-muted-foreground text-sm">
                          Nenhum funcionário encontrado
                        </TableCell>
                      </TableRow>
                    ) : funcFiltrados.map(f => (
                      <TableRow key={f.id} className="hover:bg-muted/20">
                        <TableCell>
                          <p className="text-sm font-medium">{f.nome}</p>
                          {f.cargo && <p className="text-xs text-muted-foreground">{f.cargo}</p>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.obra_nome ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm">{f.salario_base > 0 ? fmt(f.salario_base) : <span className="text-muted-foreground text-xs">Sem RH</span>}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{f.valor_hora > 0 ? fmt(f.valor_hora) : "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={f.he_horas > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                            {fmtH(f.he_horas)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={f.he_custo > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                            {f.he_custo > 0 ? fmt(f.he_custo) : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{f.vale_alim > 0 ? fmt(f.vale_alim) : "—"}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{f.vale_transp > 0 ? fmt(f.vale_transp) : "—"}</TableCell>
                        <TableCell className="text-right text-sm font-bold text-emerald-600">
                          {f.total_periodo > 0 ? fmt(f.total_periodo) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {funcFiltrados.length > 0 && (
                    <tfoot>
                      <TableRow className="bg-muted/30 font-bold border-t-2">
                        <TableCell colSpan={2} className="text-sm">Total ({funcFiltrados.length} funcionários)</TableCell>
                        <TableCell className="text-right text-sm text-blue-600">{fmt(funcFiltrados.reduce((s,f)=>s+f.salario_base,0))}</TableCell>
                        <TableCell />
                        <TableCell className="text-right text-sm text-amber-600">{fmtH(funcFiltrados.reduce((s,f)=>s+f.he_horas,0))}</TableCell>
                        <TableCell className="text-right text-sm text-amber-600">{fmt(funcFiltrados.reduce((s,f)=>s+f.he_custo,0))}</TableCell>
                        <TableCell className="text-right text-sm text-violet-600">{fmt(funcFiltrados.reduce((s,f)=>s+f.vale_alim,0))}</TableCell>
                        <TableCell className="text-right text-sm text-violet-600">{fmt(funcFiltrados.reduce((s,f)=>s+f.vale_transp,0))}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600">{fmt(funcFiltrados.reduce((s,f)=>s+f.total_periodo,0))}</TableCell>
                      </TableRow>
                    </tfoot>
                  )}
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* ── Aba: Banco de Horas ── */}
          <TabsContent value="banco" className="mt-4">
            <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Funcionário</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead className="text-right">HE Acumuladas</TableHead>
                      <TableHead className="text-right">Compensadas/Pagas</TableHead>
                      <TableHead className="text-right font-bold">Saldo</TableHead>
                      <TableHead className="text-right">Custo Estimado</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({length: 5}).map((_,i) => (
                        <TableRow key={i}>
                          {Array.from({length: 7}).map((_,j) => (
                            <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse w-16" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : porFunc.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                          Nenhum dado encontrado
                        </TableCell>
                      </TableRow>
                    ) : porFunc
                        .slice()
                        .sort((a,b) => b.banco_saldo - a.banco_saldo)
                        .map(f => {
                          const custoSaldo = f.banco_saldo * f.valor_hora * FATOR_HE
                          const critico    = f.banco_saldo > 40
                          const positivo   = f.banco_saldo > 0
                          return (
                            <TableRow key={f.id} className={cn("hover:bg-muted/20", critico && "bg-amber-50/40 dark:bg-amber-900/5")}>
                              <TableCell>
                                <p className="text-sm font-medium flex items-center gap-1.5">
                                  {critico && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                                  {f.nome}
                                </p>
                                {f.cargo && <p className="text-xs text-muted-foreground">{f.cargo}</p>}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{f.obra_nome ?? "—"}</TableCell>
                              <TableCell className="text-right text-sm font-medium text-blue-600">
                                {fmtH(f.banco_credito)}
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {f.banco_debito > 0 ? fmtH(f.banco_debito) : "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm font-bold">
                                <span className={cn(
                                  f.banco_saldo > 40 ? "text-amber-600" :
                                  f.banco_saldo > 0  ? "text-blue-600" :
                                  f.banco_saldo < 0  ? "text-red-600"  : "text-muted-foreground"
                                )}>
                                  {fmtH(f.banco_saldo)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {custoSaldo > 0 ? fmt(custoSaldo) : "—"}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm" variant="outline"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => abrirBanco(f)}
                                >
                                  <Plus className="h-3 w-3" /> Lançar
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                  </TableBody>
                </Table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              * HE acumuladas = todas as horas extras registradas no efetivo. Custo estimado calculado com adicional de 50%.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Modal Banco de Horas ─────────────────────────────────────────────── */}
      <Dialog open={modalBanco} onOpenChange={setModalBanco}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Banco de Horas — {funcSel?.nome}
            </DialogTitle>
          </DialogHeader>

          {/* Saldo atual */}
          {funcSel && (
            <div className="grid grid-cols-3 gap-2 bg-muted/30 rounded-lg p-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Acumulado</p>
                <p className="text-lg font-bold text-blue-600">{fmtH(funcSel.banco_credito)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Compensado</p>
                <p className="text-lg font-bold text-muted-foreground">{fmtH(funcSel.banco_debito)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className={cn("text-lg font-bold",
                  funcSel.banco_saldo > 0 ? "text-amber-600" :
                  funcSel.banco_saldo < 0 ? "text-red-600"   : "text-muted-foreground"
                )}>
                  {fmtH(funcSel.banco_saldo)}
                </p>
              </div>
            </div>
          )}

          {/* Histórico */}
          {lancamentos.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs text-right">Horas</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{new Date(l.data_referencia).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-xs capitalize">{l.tipo}</TableCell>
                      <TableCell className="text-xs text-right text-amber-600">-{fmtH(l.horas)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">{l.descricao ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Form novo lançamento */}
          <div className="space-y-3 border-t border-border/50 pt-3">
            <p className="text-xs font-semibold text-foreground">Novo lançamento</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={formBanco.tipo} onValueChange={v => setFormBanco(f => ({...f, tipo: v}))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compensacao">Compensação (folga)</SelectItem>
                    <SelectItem value="pagamento">Pagamento em dinheiro</SelectItem>
                    <SelectItem value="ajuste">Ajuste manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Horas</Label>
                <Input
                  type="number" step="0.5" min="0"
                  className="h-8 text-sm"
                  placeholder="Ex: 8"
                  value={formBanco.horas}
                  onChange={e => setFormBanco(f => ({...f, horas: e.target.value}))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data de referência</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={formBanco.data_referencia}
                  onChange={e => setFormBanco(f => ({...f, data_referencia: e.target.value}))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="Opcional"
                  value={formBanco.descricao}
                  onChange={e => setFormBanco(f => ({...f, descricao: e.target.value}))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalBanco(false)} disabled={savingBanco}>Fechar</Button>
            <Button onClick={salvarBanco} disabled={savingBanco || !formBanco.horas}>
              {savingBanco ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, msg }: { icon: React.ElementType; msg: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  )
}

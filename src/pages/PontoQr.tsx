import { useState, useEffect, useCallback } from "react"
import { Layout } from "@/components/layout/Layout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { supabase } from "@/integrations/supabase/client"
import { Download, RefreshCw, LogIn, LogOut, Search, Users, Clock, CalendarDays } from "lucide-react"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { downloadCsv } from "@/lib/exportCsv"
import { format, startOfDay, endOfDay, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

// ─── Types ────────────────────────────────────────────────────────────────────
interface Obra     { id: string; nome: string }
interface Registro {
  id: string
  employee_id:   string
  emp_nome:      string
  emp_cargo:     string | null
  emp_foto:      string | null
  obra_nome:     string | null
  tipo:          "entrada" | "saida"
  registrado_em: string
  metodo:        string
  scanner_nome:  string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })

// Calcula horas trabalhadas para pares entrada/saída do mesmo funcionário no mesmo dia
function calcularHoras(registros: Registro[]): Map<string, number> {
  const mapa = new Map<string, number>()
  const por = new Map<string, Registro[]>()
  registros.forEach(r => {
    const chave = `${r.employee_id}|${r.registrado_em.split("T")[0]}`
    if (!por.has(chave)) por.set(chave, [])
    por.get(chave)!.push(r)
  })
  por.forEach((lista, chave) => {
    const ordenados = lista.sort((a, b) => a.registrado_em.localeCompare(b.registrado_em))
    let total = 0
    for (let i = 0; i + 1 < ordenados.length; i++) {
      if (ordenados[i].tipo === "entrada" && ordenados[i + 1].tipo === "saida") {
        const diff = new Date(ordenados[i + 1].registrado_em).getTime() -
                     new Date(ordenados[i].registrado_em).getTime()
        total += diff / 3_600_000
        i++
      }
    }
    mapa.set(chave, total)
  })
  return mapa
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PontoQr() {
  const [obras,     setObras]     = useState<Obra[]>([])
  const [obraId,    setObraId]    = useState("all")
  const [dataInicio, setDataInicio] = useState(format(new Date(), "yyyy-MM-dd"))
  const [dataFim,    setDataFim]    = useState(format(new Date(), "yyyy-MM-dd"))
  const [busca,      setBusca]      = useState("")
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "entrada" | "saida">("todos")
  const [registros,  setRegistros]  = useState<Registro[]>([])
  const [loading,    setLoading]    = useState(false)
  const [initialized, setInitialized] = useState(false)

  // ── Obras ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("obras" as any).select("id, nome").order("nome")
      .then(({ data }) => setObras(data ?? []))
  }, [])

  // ── Busca registros ────────────────────────────────────────────────────────
  const fetchRegistros = useCallback(async () => {
    setLoading(true)
    try {
      let q = (supabase as any)
        .from("employee_ponto_qr")
        .select(`
          id, employee_id, tipo, registrado_em, metodo,
          employees!employee_ponto_qr_employee_id_fkey(nome, foto_url, cargos(nome)),
          obras(nome),
          scanner:registrado_por(nome)
        `)
        .gte("registrado_em", `${dataInicio}T00:00:00`)
        .lte("registrado_em", `${dataFim}T23:59:59`)
        .order("registrado_em", { ascending: false })

      if (obraId !== "all") q = q.eq("obra_id", obraId)
      if (filtroTipo !== "todos") q = q.eq("tipo", filtroTipo)

      const { data, error } = await q
      if (error) throw error

      const mapped: Registro[] = (data ?? []).map((r: any) => ({
        id:            r.id,
        employee_id:   r.employee_id,
        emp_nome:      r.employees?.nome ?? "—",
        emp_cargo:     r.employees?.cargos?.nome ?? null,
        emp_foto:      r.employees?.foto_url ?? null,
        obra_nome:     r.obras?.nome ?? null,
        tipo:          r.tipo,
        registrado_em: r.registrado_em,
        metodo:        r.metodo,
        scanner_nome:  r.scanner?.nome ?? null,
      }))
      setRegistros(mapped)
      setInitialized(true)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [obraId, dataInicio, dataFim, filtroTipo])

  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  // ── Filtro de busca local ──────────────────────────────────────────────────
  const filtrados = registros.filter(r =>
    !busca || r.emp_nome.toLowerCase().includes(busca.toLowerCase())
  )

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const entradas  = registros.filter(r => r.tipo === "entrada").length
  const saidas    = registros.filter(r => r.tipo === "saida").length
  const unicos    = new Set(registros.map(r => r.employee_id)).size
  const horasMap  = calcularHoras(registros)
  const totalHoras = Array.from(horasMap.values()).reduce((s, v) => s + v, 0)
  const fmtH = (h: number) => h > 0
    ? `${Math.floor(h)}h${Math.round((h % 1) * 60).toString().padStart(2, "0")}m`
    : "—"

  // ── Exportar CSV ───────────────────────────────────────────────────────────
  const exportar = () => {
    const headers = ["Nome", "Cargo", "Obra", "Tipo", "Data", "Hora", "Método", "Registrado por"]
    const rows = filtrados.map(r => [
      r.emp_nome, r.emp_cargo ?? "", r.obra_nome ?? "",
      r.tipo === "entrada" ? "Entrada" : "Saída",
      fmtData(r.registrado_em), fmtHora(r.registrado_em),
      r.metodo, r.scanner_nome ?? "",
    ])
    downloadCsv(headers, rows, `ponto_qr_${dataInicio}_${dataFim}`)
  }

  if (!initialized) return <PageSkeleton statsCount={4} columns={6} rows={8} />

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Ponto QR</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Registros de ponto via leitura de crachá QR Code
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRegistros} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportar} disabled={filtrados.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <div className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-violet-500" />
              <p className="text-xs text-muted-foreground font-medium">Funcionários</p>
            </div>
            <p className="text-2xl font-extrabold text-violet-600">{unicos}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <LogIn className="h-4 w-4 text-green-500" />
              <p className="text-xs text-muted-foreground font-medium">Entradas</p>
            </div>
            <p className="text-2xl font-extrabold text-green-600">{entradas}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <LogOut className="h-4 w-4 text-blue-500" />
              <p className="text-xs text-muted-foreground font-medium">Saídas</p>
            </div>
            <p className="text-2xl font-extrabold text-blue-600">{saidas}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <p className="text-xs text-muted-foreground font-medium">Total de horas</p>
            </div>
            <p className="text-2xl font-extrabold text-amber-600">{fmtH(totalHoras)}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm w-44"
              placeholder="Buscar funcionário..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>

          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger className="h-8 text-sm w-44">
              <SelectValue placeholder="Obra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filtroTipo} onValueChange={v => setFiltroTipo(v as any)}>
            <SelectTrigger className="h-8 text-sm w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="saida">Saídas</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 ml-auto">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date" className="h-8 text-sm w-36"
              value={dataInicio} onChange={e => setDataInicio(e.target.value)}
            />
            <span className="text-muted-foreground text-xs">→</span>
            <Input
              type="date" className="h-8 text-sm w-36"
              value={dataFim} onChange={e => setDataFim(e.target.value)}
            />
          </div>
        </div>

        {/* Tabela */}
        <Card className="shadow-medium">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Horas no dia</TableHead>
                <TableHead>Registrado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Nenhum registro encontrado para o período selecionado
                  </TableCell>
                </TableRow>
              ) : filtrados.map(r => {
                const chave = `${r.employee_id}|${r.registrado_em.split("T")[0]}`
                const horas = horasMap.get(chave)
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {r.emp_foto ? (
                          <img src={r.emp_foto} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
                            {r.emp_nome.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium leading-tight">{r.emp_nome}</p>
                          {r.emp_cargo && <p className="text-xs text-muted-foreground">{r.emp_cargo}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.obra_nome ?? "—"}
                    </TableCell>
                    <TableCell>
                      {r.tipo === "entrada" ? (
                        <Badge className="bg-green-100 text-green-700 border-0 text-xs gap-1">
                          <LogIn className="h-3 w-3" /> Entrada
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 border-0 text-xs gap-1">
                          <LogOut className="h-3 w-3" /> Saída
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{fmtData(r.registrado_em)}</TableCell>
                    <TableCell className="text-sm font-mono">{fmtHora(r.registrado_em)}</TableCell>
                    <TableCell className="text-sm">
                      {r.tipo === "saida" && horas && horas > 0
                        ? <span className="text-amber-600 font-semibold">{fmtH(horas)}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.scanner_nome ?? "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>

        {filtrados.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""} · {unicos} funcionário{unicos !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Layout>
  )
}

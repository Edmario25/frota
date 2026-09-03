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
  evento:        "entrada" | "intervalo_saida" | "intervalo_retorno" | "saida"
  registrado_em: string
  metodo:        string
  scanner_nome:  string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })

const diaBrasilia = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso))

const eventoLabel: Record<Registro["evento"], string> = {
  entrada: "Início da jornada",
  intervalo_saida: "Início do intervalo",
  intervalo_retorno: "Retorno do intervalo",
  saida: "Fim da jornada",
}

// Calcula horas trabalhadas para pares entrada/saída do mesmo funcionário no mesmo dia
function calcularHoras(registros: Registro[]): Map<string, number> {
  const mapa = new Map<string, number>()
  const por = new Map<string, Registro[]>()
  registros.forEach(r => {
    const chave = `${r.employee_id}|${diaBrasilia(r.registrado_em)}`
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
  const [filtroEvento, setFiltroEvento] = useState<"todos" | Registro["evento"]>("todos")
  const [registros,  setRegistros]  = useState<Registro[]>([])
  const [loading,    setLoading]    = useState(false)
  const [initialized, setInitialized] = useState(false)

  // ── Obras ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("obras" as any).select("id, nome").order("nome")
      .then(({ data }) => setObras((data ?? []) as unknown as Obra[]))
  }, [])

  // ── Busca registros ────────────────────────────────────────────────────────
  const fetchRegistros = useCallback(async () => {
    setLoading(true)
    try {
      // Converte para ISO UTC respeitando o fuso local do navegador
      const inicioUtc = new Date(`${dataInicio}T00:00:00`).toISOString()
      const fimUtc    = new Date(`${dataFim}T23:59:59`).toISOString()

      let q = (supabase as any)
        .from("employee_ponto_qr")
        .select(`
          id, employee_id, tipo, registrado_em, metodo,
          evento,
          employees!employee_ponto_qr_employee_id_fkey(nome, foto_url, cargos(nome)),
          obras(nome),
          scanner:registrado_por(nome),
          totem:ponto_totem_dispositivos(nome)
        `)
        .gte("registrado_em", inicioUtc)
        .lte("registrado_em", fimUtc)
        .order("registrado_em", { ascending: false })

      if (obraId !== "all") q = q.eq("obra_id", obraId)
      if (filtroEvento !== "todos") q = q.eq("evento", filtroEvento)

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
        evento:        r.evento ?? r.tipo,
        registrado_em: r.registrado_em,
        metodo:        r.metodo,
        scanner_nome:  r.totem?.nome ?? r.scanner?.nome ?? null,
      }))
      setRegistros(mapped)
      setInitialized(true)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [obraId, dataInicio, dataFim, filtroEvento])

  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  // ── Filtro de busca local ──────────────────────────────────────────────────
  const filtrados = registros.filter(r =>
    !busca || r.emp_nome.toLowerCase().includes(busca.toLowerCase())
  )

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const entradas  = registros.filter(r => r.evento === "entrada").length
  const saidas    = registros.filter(r => r.evento === "saida").length
  const intervalos = registros.filter(r => r.evento === "intervalo_saida").length
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
      eventoLabel[r.evento],
      fmtData(r.registrado_em), fmtHora(r.registrado_em),
      r.metodo, r.scanner_nome ?? "",
    ])
    downloadCsv(headers, rows, `ponto_qr_${dataInicio}_${dataFim}`)
  }

  if (!initialized) return <PageSkeleton statsCount={4} columns={6} rows={8} />

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">

        <TotensPanel obras={obras} />

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
              <p className="text-xs text-muted-foreground font-medium">Inícios de jornada</p>
            </div>
            <p className="text-2xl font-extrabold text-green-600">{entradas}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <LogOut className="h-4 w-4 text-blue-500" />
              <p className="text-xs text-muted-foreground font-medium">Fins de jornada</p>
            </div>
            <p className="text-2xl font-extrabold text-blue-600">{saidas}</p>
            <p className="text-[11px] text-muted-foreground">{intervalos} intervalo(s)</p>
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

          <Select value={filtroEvento} onValueChange={v => setFiltroEvento(v as typeof filtroEvento)}>
            <SelectTrigger className="h-8 text-sm w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="entrada">Início da jornada</SelectItem>
              <SelectItem value="intervalo_saida">Início do intervalo</SelectItem>
              <SelectItem value="intervalo_retorno">Retorno do intervalo</SelectItem>
              <SelectItem value="saida">Fim da jornada</SelectItem>
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
                const chave = `${r.employee_id}|${diaBrasilia(r.registrado_em)}`
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
                      <Badge className={`${r.evento === "entrada" || r.evento === "intervalo_retorno" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"} border-0 text-xs gap-1`}>
                        {r.evento === "entrada" || r.evento === "intervalo_retorno"
                          ? <LogIn className="h-3 w-3" />
                          : <LogOut className="h-3 w-3" />}
                        {eventoLabel[r.evento]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{fmtData(r.registrado_em)}</TableCell>
                    <TableCell className="text-sm font-mono">{fmtHora(r.registrado_em)}</TableCell>
                    <TableCell className="text-sm">
                      {r.evento === "saida" && horas && horas > 0
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

function TotensPanel({ obras }: { obras: Obra[] }) {
  const [dados, setDados] = useState<any>({ itens: [], pode_criar: false })
  const [nome, setNome] = useState("")
  const [obra, setObra] = useState("")
  const [credencial, setCredencial] = useState<any>(null)
  const [erro, setErro] = useState("")
  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("listar_ponto_totens")
    if (error) setErro(error.message); else { setErro(""); setDados(data) }
  }, [])
  useEffect(() => { load() }, [load])
  async function criar() {
    const { data, error } = await (supabase as any).rpc("criar_ponto_totem", { p_obra: obra, p_nome: nome })
    if (error) return setErro(error.message)
    setCredencial(data); setNome(""); await load()
  }
  async function status(id: string, ativo: boolean) {
    const { error } = await (supabase as any).rpc("definir_status_ponto_totem", { p_id: id, p_ativo: ativo })
    if (error) setErro(error.message); else await load()
  }
  return <details className="border rounded-xl bg-card p-4">
    <summary className="font-semibold cursor-pointer">Equipamentos de ponto cadastrados ({dados.itens.length})</summary>
    {erro && <p role="alert" className="text-sm text-red-700 mt-3">{erro}</p>}
    {dados.pode_criar && <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mt-4">
      <Select value={obra} onValueChange={setObra}><SelectTrigger><SelectValue placeholder="Obra do equipamento" /></SelectTrigger><SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent></Select>
      <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Totem portaria principal" />
      <Button disabled={!obra || nome.trim().length < 3} onClick={criar}>Cadastrar totem</Button>
    </div>}
    {credencial && <div className="mt-4 border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm">
      <strong>Copie agora: o segredo não será exibido novamente.</strong>
      <pre className="whitespace-pre-wrap select-text mt-2">VITE_TOTEM_DEVICE_ID={credencial.id}{"\n"}VITE_TOTEM_DEVICE_SECRET={credencial.segredo}</pre>
      <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`VITE_TOTEM_DEVICE_ID=${credencial.id}\nVITE_TOTEM_DEVICE_SECRET=${credencial.segredo}`)}>Copiar credenciais</Button>
    </div>}
    <div className="mt-4 space-y-2">{dados.itens.map((d: any) => <div key={d.id} className="border rounded-lg p-3 flex flex-wrap items-center gap-3 text-sm"><span className="flex-1"><b>{d.nome}</b><small className="block text-muted-foreground">{d.obra} · versão {d.versao || "não informada"} · último acesso {d.ultimo_acesso ? new Date(d.ultimo_acesso).toLocaleString("pt-BR") : "nunca"}</small></span><Badge variant={d.ativo ? "default" : "secondary"}>{d.ativo ? "Ativo" : "Bloqueado"}</Badge>{dados.pode_criar && <Button variant="outline" size="sm" onClick={() => status(d.id, !d.ativo)}>{d.ativo ? "Bloquear" : "Reativar"}</Button>}</div>)}</div>
  </details>
}

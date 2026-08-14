import { useRef, useState } from "react"
import Papa from "papaparse"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, X, RefreshCw } from "lucide-react"
import { addMonths, format, parseISO, isValid } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────
interface LinhaCsv {
  colaborador_nome: string
  treinamento_nome: string
  data_realizacao:  string
  data_vencimento?: string
  obra_nome?:       string
  instituicao?:     string
  instrutor?:       string
}

type StatusLinha = "ok" | "erro" | "aviso" | "pendente"

interface LinhaProcessada extends LinhaCsv {
  _idx:             number
  _status:          StatusLinha
  _msg:             string
  colaborador_id:   string | null
  treinamento_id:   string | null
  obra_id:          string | null
  data_venc_calc:   string | null
}

interface Props {
  open:         boolean
  onOpenChange: (v: boolean) => void
  onImportado:  () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseData(v: string): string | null {
  if (!v) return null
  // Tenta ISO yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = parseISO(v)
    return isValid(d) ? v : null
  }
  // Tenta dd/MM/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [d, m, y] = v.split("/")
    return `${y}-${m}-${d}`
  }
  return null
}

function calcStatus(dataVenc: string | null): string {
  if (!dataVenc) return "pendente"
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const venc = new Date(dataVenc + "T00:00:00")
  const dias = Math.ceil((venc.getTime() - hoje.getTime()) / 86_400_000)
  if (dias < 0)   return "vencido"
  if (dias <= 30) return "a_vencer"
  return "em_dia"
}

// ─── Template CSV ─────────────────────────────────────────────────────────────
const CABECALHO = [
  "colaborador_nome", "treinamento_nome", "data_realizacao",
  "data_vencimento", "obra_nome", "instituicao", "instrutor",
]
const EXEMPLO = [
  ["João Silva",  "NR-35 — Trabalho em Altura",       "2026-01-15", "2028-01-15", "Obra Central", "SENAI", "Carlos Pereira"],
  ["Maria Costa", "Integração SMS admissional",        "2026-03-01", "2027-03-01", "",             "",      ""],
  ["Pedro Lima",  "NR-10 — Segurança em Instalações", "2025-11-20", "",           "Obra Norte",   "",      ""],
]

function baixarTemplate() {
  const rows = [CABECALHO, ...EXEMPLO]
  const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url; a.download = "modelo_importacao_treinamentos.csv"
  a.click(); URL.revokeObjectURL(url)
}

// ─── Componente ───────────────────────────────────────────────────────────────
export function ImportacaoTreinamentosModal({ open, onOpenChange, onImportado }: Props) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [fase,    setFase]    = useState<"upload" | "revisao" | "importando" | "resultado">("upload")
  const [linhas,  setLinhas]  = useState<LinhaProcessada[]>([])
  const [ok,      setOk]      = useState(0)
  const [erros,   setErros]   = useState(0)
  const [dragging,setDragging]= useState(false)

  const resetar = () => {
    setFase("upload"); setLinhas([]); setOk(0); setErros(0)
    if (inputRef.current) inputRef.current.value = ""
  }

  // ── Processar arquivo ──────────────────────────────────────────────────────
  const processarArquivo = async (file: File) => {
    Papa.parse<LinhaCsv>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim().toLowerCase().replace(/ /g, "_"),
      complete: async (result) => {
        const raw = result.data as LinhaCsv[]

        // Busca catálogo, funcionários e obras para matching
        const [catRes, funcRes, obraRes] = await Promise.all([
          (supabase as any).from("sms_treinamentos_catalogo").select("id, nome, validade_meses"),
          (supabase as any).from("employees").select("id, nome").eq("status", "ativo"),
          (supabase as any).from("obras").select("id, nome"),
        ])

        const catalogo:    { id: string; nome: string; validade_meses: number | null }[] = catRes.data ?? []
        const funcionarios:{ id: string; nome: string }[] = funcRes.data ?? []
        const obras:       { id: string; nome: string }[] = obraRes.data ?? []

        const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()

        const matchNome = <T extends { nome: string }>(lista: T[], busca: string): T | undefined => {
          const nb = normalizar(busca)
          // Exato
          let m = lista.find(x => normalizar(x.nome) === nb)
          if (m) return m
          // Contém
          m = lista.find(x => normalizar(x.nome).includes(nb) || nb.includes(normalizar(x.nome)))
          return m
        }

        const processadas: LinhaProcessada[] = raw.map((row, idx) => {
          const msgs: string[] = []
          let status: StatusLinha = "ok"

          const func = matchNome(funcionarios, row.colaborador_nome ?? "")
          const cat  = matchNome(catalogo,    row.treinamento_nome ?? "")
          const obra = row.obra_nome ? matchNome(obras, row.obra_nome) : undefined

          if (!func) { msgs.push(`Colaborador não encontrado: "${row.colaborador_nome}"`); status = "erro" }
          if (!cat)  { msgs.push(`Treinamento não encontrado: "${row.treinamento_nome}"`); status = "erro" }

          const dataReal = parseData(row.data_realizacao ?? "")
          if (!dataReal) { msgs.push("Data de realização inválida"); status = "erro" }

          // Vencimento: usa coluna ou calcula pela validade
          let dataVenc = parseData(row.data_vencimento ?? "") || null
          if (!dataVenc && cat?.validade_meses && dataReal) {
            dataVenc = format(addMonths(parseISO(dataReal), cat.validade_meses), "yyyy-MM-dd")
            msgs.push(`Vencimento calculado: ${dataVenc}`)
            if (status === "ok") status = "aviso"
          }

          if (row.obra_nome && !obra) {
            msgs.push(`Obra não encontrada: "${row.obra_nome}" — será ignorada`)
            if (status === "ok") status = "aviso"
          }

          return {
            ...row,
            _idx:           idx + 2,
            _status:        status,
            _msg:           msgs.join(" · ") || "OK",
            colaborador_id: func?.id ?? null,
            treinamento_id: cat?.id  ?? null,
            obra_id:        obra?.id ?? null,
            data_venc_calc: dataVenc,
          }
        })

        setLinhas(processadas)
        setFase("revisao")
      },
      error: () => toast({ title: "Erro ao ler o arquivo CSV", variant: "destructive" }),
    })
  }

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Use um arquivo .csv", variant: "destructive" }); return
    }
    processarArquivo(file)
  }

  // ── Importar ───────────────────────────────────────────────────────────────
  const importar = async () => {
    const validas = linhas.filter(l => l._status !== "erro" && l.colaborador_id && l.treinamento_id)
    if (!validas.length) {
      toast({ title: "Nenhuma linha válida para importar", variant: "destructive" }); return
    }

    setFase("importando")

    const registros = validas.map(l => ({
      colaborador_id:  l.colaborador_id,
      treinamento_id:  l.treinamento_id,
      obra_id:         l.obra_id || null,
      data_realizacao: parseData(l.data_realizacao) || null,
      data_vencimento: l.data_venc_calc || null,
      instituicao:     l.instituicao || null,
      instrutor:       l.instrutor   || null,
      status:          calcStatus(l.data_venc_calc),
    }))

    // Insere em lotes de 50
    let okCount = 0; let errCount = 0
    for (let i = 0; i < registros.length; i += 50) {
      const lote = registros.slice(i, i + 50)
      const { error } = await (supabase as any)
        .from("sms_colaborador_treinamentos").insert(lote)
      if (error) errCount += lote.length
      else       okCount  += lote.length
    }

    setOk(okCount); setErros(errCount)
    setFase("resultado")
    if (okCount > 0) onImportado()
  }

  const validas  = linhas.filter(l => l._status !== "erro").length
  const invalidas= linhas.filter(l => l._status === "erro").length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) resetar(); onOpenChange(v) }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
            Importar Treinamentos em Lote
          </DialogTitle>
        </DialogHeader>

        {/* ── Fase: upload ── */}
        {fase === "upload" && (
          <div className="flex-1 space-y-5 py-2">
            {/* Instruções */}
            <div className="bg-muted/40 rounded-lg p-4 text-sm space-y-1.5">
              <p className="font-semibold text-foreground">Como importar:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Baixe o modelo CSV abaixo</li>
                <li>Preencha com os dados de treinamentos (use os nomes exatos de colaboradores e treinamentos)</li>
                <li>Salve como <strong>.csv</strong> e faça o upload</li>
                <li>Revise e confirme a importação</li>
              </ol>
            </div>

            <Button variant="outline" className="gap-2" onClick={baixarTemplate}>
              <Download className="h-4 w-4" />
              Baixar Modelo CSV
            </Button>

            {/* Drop zone */}
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
                dragging
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10"
                  : "border-border hover:border-emerald-400 hover:bg-muted/30"
              )}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault(); setDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className={cn("h-10 w-10 mx-auto mb-3", dragging ? "text-emerald-500" : "text-muted-foreground")} />
              <p className="text-sm font-medium text-foreground">
                {dragging ? "Solte o arquivo aqui" : "Arraste o CSV ou clique para selecionar"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Apenas arquivos .csv</p>
              <input ref={inputRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>

            {/* Colunas esperadas */}
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Colunas do CSV
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Coluna</th>
                      <th className="text-left px-3 py-2 font-medium">Obrigatório</th>
                      <th className="text-left px-3 py-2 font-medium">Exemplo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {[
                      { col: "colaborador_nome", obrig: true,  ex: "João Silva" },
                      { col: "treinamento_nome", obrig: true,  ex: "NR-35 — Trabalho em Altura" },
                      { col: "data_realizacao",  obrig: true,  ex: "2026-01-15 ou 15/01/2026" },
                      { col: "data_vencimento",  obrig: false, ex: "2028-01-15 (auto se vazio)" },
                      { col: "obra_nome",         obrig: false, ex: "Obra Central" },
                      { col: "instituicao",       obrig: false, ex: "SENAI" },
                      { col: "instrutor",         obrig: false, ex: "Carlos Pereira" },
                    ].map(r => (
                      <tr key={r.col}>
                        <td className="px-3 py-2 font-mono text-foreground">{r.col}</td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            r.obrig ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                          )}>
                            {r.obrig ? "Obrigatório" : "Opcional"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.ex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Fase: revisão ── */}
        {fase === "revisao" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Resumo */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{linhas.length} linhas lidas</span>
              <span className="text-xs font-semibold bg-green-100 text-green-700 rounded-full px-2.5 py-0.5">
                {validas} válidas
              </span>
              {invalidas > 0 && (
                <span className="text-xs font-semibold bg-red-100 text-red-700 rounded-full px-2.5 py-0.5">
                  {invalidas} com erro
                </span>
              )}
              <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={resetar}>
                <X className="h-3.5 w-3.5" /> Trocar arquivo
              </Button>
            </div>

            {/* Tabela de revisão */}
            <div className="flex-1 overflow-auto rounded-lg border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Treinamento</TableHead>
                    <TableHead>Realização</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(l => (
                    <TableRow key={l._idx} className={cn(
                      l._status === "erro"  && "bg-red-50/50 dark:bg-red-900/10",
                      l._status === "aviso" && "bg-amber-50/50 dark:bg-amber-900/10",
                    )}>
                      <TableCell className="text-xs text-muted-foreground">{l._idx}</TableCell>
                      <TableCell className="text-sm">
                        <span className={cn(!l.colaborador_id && "text-red-600 font-medium")}>
                          {l.colaborador_nome || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className={cn(!l.treinamento_id && "text-red-600 font-medium")}>
                          {l.treinamento_nome || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.data_realizacao || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.data_venc_calc || "—"}</TableCell>
                      <TableCell>
                        {l._status === "ok"    && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        {l._status === "aviso" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        {l._status === "erro"  && <X className="h-4 w-4 text-red-500" />}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={l._msg}>
                        {l._msg}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── Fase: importando ── */}
        {fase === "importando" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <RefreshCw className="h-10 w-10 text-emerald-500 animate-spin" />
            <p className="text-sm font-medium">Importando registros...</p>
            <p className="text-xs text-muted-foreground">Aguarde, não feche esta janela</p>
          </div>
        )}

        {/* ── Fase: resultado ── */}
        {fase === "resultado" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            {ok > 0
              ? <CheckCircle2 className="h-14 w-14 text-green-500" />
              : <AlertTriangle className="h-14 w-14 text-red-500" />
            }
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                {ok > 0 ? "Importação concluída!" : "Nenhum registro importado"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {ok > 0 && <span className="text-green-600 font-semibold">{ok} registro{ok !== 1 ? "s" : ""} importado{ok !== 1 ? "s" : ""} com sucesso. </span>}
                {erros > 0 && <span className="text-red-600">{erros} erro{erros !== 1 ? "s" : ""}.</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetar}>Nova importação</Button>
              <Button onClick={() => { onOpenChange(false); resetar() }}>Fechar</Button>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        {(fase === "revisao") && (
          <DialogFooter className="border-t border-border/50 pt-3">
            <p className="text-xs text-muted-foreground flex-1">
              {invalidas > 0 && `${invalidas} linha${invalidas !== 1 ? "s" : ""} com erro serão ignoradas.`}
            </p>
            <Button variant="outline" onClick={resetar}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={importar}
              disabled={validas === 0}
            >
              <Upload className="h-4 w-4" />
              Importar {validas} registro{validas !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

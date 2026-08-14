import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { supabase } from "@/integrations/supabase/client"
import { cn } from "@/lib/utils"
import {
  GraduationCap, FileText, AlertTriangle, ArrowRight,
  RefreshCw, CheckCircle2, Clock,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface ItemVencimento {
  id:         string
  tipo:       "treinamento" | "documento"
  nome:       string           // nome do treinamento ou documento
  funcionario: string          // nome do funcionário
  vencimento: string           // ISO date
  diasRestantes: number        // negativo = já venceu
  status: "vencido" | "critico" | "atencao"
  // critico = ≤ 15 dias | atencao = 16-60 dias
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function diasAte(isoDate: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(isoDate)
  venc.setHours(0, 0, 0, 0)
  return Math.round((venc.getTime() - hoje.getTime()) / 86_400_000)
}

function calcStatus(dias: number): ItemVencimento["status"] {
  if (dias < 0)   return "vencido"
  if (dias <= 15) return "critico"
  return "atencao"
}

const statusCfg = {
  vencido: {
    label: "Vencido",
    cls:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    dot:   "bg-red-500",
  },
  critico: {
    label: "Crítico",
    cls:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    dot:   "bg-orange-500",
  },
  atencao: {
    label: "A vencer",
    cls:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    dot:   "bg-amber-500",
  },
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// ─── Componente ───────────────────────────────────────────────────────────────
interface Props {
  diasJanela?: number    // quantos dias à frente olhar (padrão: 60)
  maxItens?:   number    // máx linhas exibidas (padrão: 8)
  compact?:    boolean   // versão sem expandir — mostra só totais
}

export function VencimentosCard({ diasJanela = 60, maxItens = 8, compact = false }: Props) {
  const [itens,   setItens]   = useState<ItemVencimento[]>([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState(false)

  const fetchVencimentos = async () => {
    setLoading(true)
    setErro(false)
    try {
      const hoje      = new Date()
      const limite    = new Date(Date.now() + diasJanela * 86_400_000)
      const hojeISO   = hoje.toISOString().split("T")[0]
      const limiteISO = limite.toISOString().split("T")[0]

      // ── 1. Treinamentos vencidos ou a vencer ──────────────────────────────
      const { data: trs, error: trErr } = await (supabase as any)
        .from("sms_colaborador_treinamentos")
        .select(`
          id, data_vencimento,
          employees(nome),
          sms_treinamentos_catalogo(nome)
        `)
        .in("status", ["a_vencer", "vencido", "pendente"])
        .not("data_vencimento", "is", null)
        .lte("data_vencimento", limiteISO)
        .order("data_vencimento", { ascending: true })
        .limit(100)

      if (trErr) throw trErr

      // ── 2. Documentos do RH a vencer ─────────────────────────────────────
      const { data: docs } = await (supabase as any)
        .from("employee_documentos")
        .select(`
          id, tipo, descricao, data_vencimento,
          employees(nome)
        `)
        .not("data_vencimento", "is", null)
        .lte("data_vencimento", limiteISO)
        .order("data_vencimento", { ascending: true })
        .limit(100)

      const lista: ItemVencimento[] = []

      // Mapeia treinamentos
      ;(trs ?? []).forEach((t: any) => {
        if (!t.data_vencimento) return
        const dias = diasAte(t.data_vencimento)
        lista.push({
          id:          t.id,
          tipo:        "treinamento",
          nome:        t.sms_treinamentos_catalogo?.nome ?? "Treinamento",
          funcionario: t.employees?.nome ?? "—",
          vencimento:  t.data_vencimento,
          diasRestantes: dias,
          status:      calcStatus(dias),
        })
      })

      // Mapeia documentos
      ;(docs ?? []).forEach((d: any) => {
        if (!d.data_vencimento) return
        const dias = diasAte(d.data_vencimento)
        lista.push({
          id:          d.id,
          tipo:        "documento",
          nome:        d.descricao ?? d.tipo ?? "Documento",
          funcionario: d.employees?.nome ?? "—",
          vencimento:  d.data_vencimento,
          diasRestantes: dias,
          status:      calcStatus(dias),
        })
      })

      // Ordena: vencidos primeiro, depois por dias restantes
      lista.sort((a, b) => a.diasRestantes - b.diasRestantes)
      setItens(lista)
    } catch {
      setErro(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchVencimentos() }, [diasJanela])

  // ── Totais por grupo ────────────────────────────────────────────────────────
  const vencidos = itens.filter(i => i.status === "vencido").length
  const criticos = itens.filter(i => i.status === "critico").length
  const atencao  = itens.filter(i => i.status === "atencao").length
  const total    = itens.length
  const exibidos = itens.slice(0, maxItens)

  // ── Sem pendências ──────────────────────────────────────────────────────────
  if (!loading && !erro && total === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card shadow-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <p className="text-sm font-semibold text-foreground">Vencimentos</p>
        </div>
        <p className="text-sm text-green-600 font-medium">
          ✅ Nenhum treinamento ou documento vencendo nos próximos {diasJanela} dias
        </p>
      </div>
    )
  }

  return (
    <div className={cn(
      "rounded-xl border bg-card shadow-card",
      vencidos > 0
        ? "border-red-200 dark:border-red-800"
        : criticos > 0
          ? "border-orange-200 dark:border-orange-800"
          : "border-amber-200 dark:border-amber-800"
    )}>

      {/* ── Header ── */}
      <div className={cn(
        "flex items-center justify-between px-5 pt-4 pb-3 border-b",
        vencidos > 0
          ? "border-red-100 dark:border-red-900/40"
          : "border-border/50"
      )}>
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn(
            "h-4 w-4",
            vencidos > 0 ? "text-red-500" : criticos > 0 ? "text-orange-500" : "text-amber-500"
          )} />
          <p className="text-sm font-semibold text-foreground">Vencimentos Próximos</p>
          {loading && <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />}
        </div>
        <div className="flex items-center gap-1.5">
          {vencidos > 0 && (
            <span className="text-xs font-bold bg-red-500 text-white rounded-full px-2 py-0.5">
              {vencidos} vencido{vencidos > 1 ? "s" : ""}
            </span>
          )}
          {criticos > 0 && (
            <span className="text-xs font-bold bg-orange-500 text-white rounded-full px-2 py-0.5">
              {criticos} crítico{criticos > 1 ? "s" : ""}
            </span>
          )}
          {atencao > 0 && (
            <span className="text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-2 py-0.5">
              {atencao} a vencer
            </span>
          )}
        </div>
      </div>

      {/* ── Resumo compacto (totais) ── */}
      <div className="grid grid-cols-3 divide-x divide-border/50 border-b border-border/50">
        {[
          { label: "Vencidos",  value: vencidos, color: "text-red-600"    },
          { label: "Críticos",  value: criticos, color: "text-orange-600" },
          { label: "A vencer",  value: atencao,  color: "text-amber-600"  },
        ].map(k => (
          <div key={k.label} className="flex flex-col items-center py-3 px-2">
            <p className={cn("text-xl font-extrabold leading-none", k.color)}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">{k.label}</p>
          </div>
        ))}
      </div>

      {/* ── Lista de itens ── */}
      {!compact && (
        <div className="divide-y divide-border/40">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-2.5 bg-muted rounded animate-pulse w-1/2" />
                </div>
                <div className="h-5 w-16 bg-muted rounded animate-pulse" />
              </div>
            ))
          ) : erro ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Erro ao carregar vencimentos.{" "}
              <button onClick={fetchVencimentos} className="text-primary underline">Tentar novamente</button>
            </div>
          ) : (
            exibidos.map(item => {
              const cfg    = statusCfg[item.status]
              const icon   = item.tipo === "treinamento" ? GraduationCap : FileText
              const Icon   = icon
              const diasTxt = item.diasRestantes < 0
                ? `venceu há ${Math.abs(item.diasRestantes)} dia${Math.abs(item.diasRestantes) !== 1 ? "s" : ""}`
                : item.diasRestantes === 0
                  ? "vence hoje"
                  : `${item.diasRestantes} dia${item.diasRestantes !== 1 ? "s" : ""}`

              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  {/* Dot de status */}
                  <div className={cn("w-2 h-2 rounded-full flex-shrink-0", cfg.dot)} />

                  {/* Ícone tipo */}
                  <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

                  {/* Texto */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate leading-tight">
                      {item.nome}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.funcionario} · {fmtData(item.vencimento)}
                    </p>
                  </div>

                  {/* Badge */}
                  <div className="flex-shrink-0 text-right">
                    <span className={cn("text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap", cfg.cls)}>
                      {diasTxt}
                    </span>
                  </div>
                </div>
              )
            })
          )}

          {/* Rodapé com link e contagem restante */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20">
            {total > maxItens && (
              <p className="text-xs text-muted-foreground">
                + {total - maxItens} item{total - maxItens !== 1 ? "s" : ""} não exibido{total - maxItens !== 1 ? "s" : ""}
              </p>
            )}
            <div className="flex gap-3 ml-auto">
              <Link
                to="/sms/treinamentos"
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Treinamentos <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                to="/funcionarios"
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
              >
                Documentos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

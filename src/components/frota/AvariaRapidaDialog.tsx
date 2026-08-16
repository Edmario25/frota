import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { AlertTriangle, Wrench, CheckCircle2 } from "lucide-react"

// ─── Tipos de problema ────────────────────────────────────────────────────────
const TIPOS_PROBLEMA = [
  { value: "motor",       label: "Motor / mecânico" },
  { value: "eletrica",    label: "Elétrica" },
  { value: "pneu",        label: "Pneu / borracharia" },
  { value: "acidente",    label: "Colisão / acidente" },
  { value: "hidraulica",  label: "Hidráulica" },
  { value: "outro",       label: "Outro" },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicle: {
    id: string
    placa: string
    marca: string
    modelo: string
    status: string | null
    quilometragem_atual?: number | null
  } | null
  onStatusChanged: () => void   // callback para refetch
}

export function AvariaRapidaDialog({ open, onOpenChange, vehicle, onStatusChanged }: Props) {
  const { toast } = useToast()
  const [descricao, setDescricao] = useState("")
  const [tipoProblem, setTipoProblem] = useState("motor")
  const [saving, setSaving] = useState(false)

  const emManutencao = vehicle?.status === "manutencao"

  const hoje = () => new Date().toISOString().split("T")[0]

  // ── Reportar avaria ─────────────────────────────────────────────────────────
  const handleReportar = async () => {
    if (!vehicle || !descricao.trim()) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      const tipoLabel = TIPOS_PROBLEMA.find(t => t.value === tipoProblem)?.label ?? tipoProblem
      const descFinal = `[${tipoLabel}] ${descricao.trim()}`

      // 1. Criar registro de manutenção
      const { error: mErr } = await supabase
        .from("maintenance_records")
        .insert({
          vehicle_id:    vehicle.id,
          created_by:    user.id,
          tipo:          "emergencial",
          status:        "em_andamento",
          descricao:     descFinal,
          data_agendada: hoje(),
          quilometragem: vehicle.quilometragem_atual ?? null,
        })
      if (mErr) throw mErr

      // 2. Atualizar status do veículo para manutenção
      const { error: vErr } = await (supabase as any)
        .from("vehicles")
        .update({ status: "manutencao" })
        .eq("id", vehicle.id)
      if (vErr) throw vErr

      toast({
        title: "Veículo reportado como inoperante",
        description: `${vehicle.placa} marcado em manutenção. Aguardando resolução.`,
      })
      onStatusChanged()
      onOpenChange(false)
      setDescricao("")
    } catch (e: any) {
      toast({ title: "Erro ao reportar avaria", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // ── Retornar ao serviço ─────────────────────────────────────────────────────
  const handleRetornar = async () => {
    if (!vehicle) return
    setSaving(true)
    try {
      // Conclui o registro de manutenção em aberto
      await (supabase as any)
        .from("maintenance_records")
        .update({ status: "concluida", data_realizada: hoje() })
        .eq("vehicle_id", vehicle.id)
        .eq("status", "em_andamento")
        .eq("tipo", "emergencial")

      // Retorna veículo para disponível
      const { error: vErr } = await (supabase as any)
        .from("vehicles")
        .update({ status: "disponivel" })
        .eq("id", vehicle.id)
      if (vErr) throw vErr

      toast({
        title: "Veículo retornou ao serviço",
        description: `${vehicle?.placa} marcado como disponível.`,
      })
      onStatusChanged()
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: "Erro ao retornar veículo", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (!vehicle) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-600" />
            {emManutencao ? "Veículo em Manutenção" : "Reportar Avaria"}
          </DialogTitle>
        </DialogHeader>

        {/* Info do veículo */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
          <span className="text-2xl">{vehicle.marca?.toLowerCase().includes("truck") || vehicle.marca?.toLowerCase().includes("volvo") || vehicle.marca?.toLowerCase().includes("scania") ? "🚛" : "🚗"}</span>
          <div>
            <p className="font-bold text-sm tracking-wide">{vehicle.placa}</p>
            <p className="text-xs text-muted-foreground">{vehicle.marca} {vehicle.modelo}</p>
          </div>
          <Badge className={
            emManutencao
              ? "ml-auto bg-amber-100 text-amber-800 border border-amber-300"
              : "ml-auto bg-green-100 text-green-800 border border-green-300"
          }>
            {emManutencao ? "🔧 Em manutenção" : "✅ Disponível"}
          </Badge>
        </div>

        {/* ── Modo: em manutenção — mostra opções ──────────────────────── */}
        {emManutencao ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Veículo inoperante</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Este veículo está em manutenção. Sua liberação diária mostrará "Aguardando" até que seja retornado ao serviço.
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleRetornar}
              disabled={saving}
              className="w-full bg-green-700 hover:bg-green-800 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {saving ? "Processando..." : "✅ Retornar ao Serviço"}
            </Button>
          </div>
        ) : (
          /* ── Modo: reportar avaria ─────────────────────────────────── */
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Tipo de problema *
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {TIPOS_PROBLEMA.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTipoProblem(t.value)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      tipoProblem === t.value
                        ? "bg-amber-600 text-white border-amber-600"
                        : "bg-background border-border text-foreground hover:border-amber-400"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Descrição do problema *
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Motor apresentou superaquecimento, vazamento de óleo..."
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
              />
            </div>

            <div className="rounded-xl bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">
                <strong>Atenção:</strong> Ao confirmar, o veículo será marcado como <strong>inoperante</strong> e não poderá ser liberado até que retorne ao serviço.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleReportar}
                disabled={saving || !descricao.trim()}
                className="flex-[2] bg-amber-600 hover:bg-amber-700 text-white"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : "🔧 Reportar Avaria"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

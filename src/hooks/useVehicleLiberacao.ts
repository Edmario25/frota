// ─── Hook: Status de liberação permanente por veículo ────────────────────────
// A liberacao continua valida ate surgir um evento que exija nova verificacao:
// manutencao corretiva posterior, item nao conforme, documento vencido ou
// preventiva critica do plano vencida.
//
// Lógica:
//   "aguardando" → nunca teve checklist de liberação aprovado
//   "liberado"   → último checklist aprovado (sem itens reprovados) — válido indefinidamente
//   "bloqueado"  → itens reprovados, documento vencido, ou item do plano marcado
//                  como crítico (bloqueia_veiculo) já vencido
//   "vencido"    → reservado: checklist aprovado mas veículo entrou em manutenção corretiva
//                  depois da última liberação (quando houver integração com manutenção)

import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"

export type LiberacaoStatus = "liberado" | "bloqueado" | "aguardando" | "vencido"

export type VehicleLiberacaoInfo = {
  status: LiberacaoStatus
  data: string | null
  responsavel: string | null
}

/**
 * Retorna um mapa de vehicleId → VehicleLiberacaoInfo.
 * Faz uma única query batch para todos os vehicle IDs passados.
 * Só refetch quando `vehicleIds` muda.
 */
export function useVehicleLiberacao(vehicleIds: string[]) {
  const [map, setMap] = useState<Record<string, VehicleLiberacaoInfo>>({})
  const [loading, setLoading] = useState(false)

  const key = vehicleIds.slice().sort().join(",")

  useEffect(() => {
    if (vehicleIds.length === 0) { setMap({}); return }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        // Busca o checklist de liberação mais recente de cada veículo
        const [{ data, error }, { data: manutencoes }, { data: documentos }, { data: criticas }] = await Promise.all([
          (supabase as any)
            .from("inspection_checklists")
            .select("id, vehicle_id, data_inspecao, responsavel_checklist, inspection_items(status)")
            .eq("tipo_servico", "liberacao_veiculo")
            .in("vehicle_id", vehicleIds)
            .order("data_inspecao", { ascending: false }),
          supabase
            .from("maintenance_records")
            .select("vehicle_id, tipo, status, created_at, data_realizada")
            .in("vehicle_id", vehicleIds)
            .eq("tipo", "corretiva")
            .neq("status", "cancelada"),
          // Fonte única desde 20261029000001: a tela de Vencimentos cadastra
          // aqui, e sem isso documento vencido avisava sem bloquear nada.
          (supabase as any)
            .from("v_documentos_vencidos")
            .select("vehicle_id")
            .in("vehicle_id", vehicleIds),
          // Preventiva crítica vencida: o item que o plano marcou como de
          // segurança (correia, freio, inspeção). Item vencido não crítico
          // não bloqueia — bloquear tudo faria o gestor ignorar o bloqueio.
          (supabase as any)
            .from("v_manutencao_vencimentos")
            .select("vehicle_id, servico")
            .in("vehicle_id", vehicleIds)
            .eq("situacao", "vencida")
            .eq("bloqueia_veiculo", true),
        ])

        if (error || cancelled) return

        const manutencaoPosterior = new Map<string, string>()
        for (const m of manutencoes ?? []) {
          const dataEvento = m.data_realizada || m.created_at
          const atual = manutencaoPosterior.get(m.vehicle_id)
          if (!atual || dataEvento > atual) manutencaoPosterior.set(m.vehicle_id, dataEvento)
        }
        const documentoVencido = new Set((documentos ?? []).map(d => d.vehicle_id))
        const preventivaCritica = new Set((criticas ?? []).map((m: any) => m.vehicle_id))

        // Para cada veículo, pega o registro mais recente (results já vem ordenados desc)
        const result: Record<string, VehicleLiberacaoInfo> = {}
        for (const row of data ?? []) {
          if (result[row.vehicle_id]) continue  // já processamos este veículo (mais recente)

          const itens: { status: string }[] = row.inspection_items ?? []
          const nc = itens.filter(i => i.status === "nao_conforme" || i.status === "reprovado").length
          const ultimaCorretiva = manutencaoPosterior.get(row.vehicle_id)
          const exigeNovaLiberacao = Boolean(ultimaCorretiva && ultimaCorretiva > row.data_inspecao)

          let status: LiberacaoStatus
          if (itens.length === 0) status = "aguardando"
          else if (nc > 0 || documentoVencido.has(row.vehicle_id) || preventivaCritica.has(row.vehicle_id)) status = "bloqueado"
          else if (exigeNovaLiberacao) status = "vencido"
          else status = "liberado"

          result[row.vehicle_id] = {
            status,
            data: row.data_inspecao,
            responsavel: row.responsavel_checklist,
          }
        }

        // Veículos sem nenhum checklist de liberação ficam como "aguardando"
        for (const id of vehicleIds) {
          if (!result[id]) {
            result[id] = { status: "aguardando", data: null, responsavel: null }
          }
        }

        if (!cancelled) setMap(result)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { liberacaoMap: map, liberacaoLoading: loading }
}

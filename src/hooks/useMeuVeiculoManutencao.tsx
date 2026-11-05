/**
 * Manutenção e liberação do veículo do próprio motorista.
 *
 * O módulo de frota ganhou plano de manutenção por item (km, horas ou dias),
 * itens que param o veículo e controle de documento vencido. Nada disso chegava
 * ao app: o motorista saía com o carro sem saber que havia preventiva crítica
 * vencida — a informação existia só na tela do gestor.
 *
 * Aqui vem o que o motorista precisa saber antes de dar a partida.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VencimentoVeiculo {
  item_id: string;
  servico: string;
  situacao: "vencida" | "a_vencer" | "em_dia";
  gatilho: "km" | "horas" | "dias";
  bloqueia_veiculo: boolean;
  km_restante: number | null;
  horas_restantes: number | null;
  dias_restantes: number | null;
  folga_fracao: number | null;
}

export interface ManutencaoDoVeiculo {
  vencimentos: VencimentoVeiculo[];
  /** Itens vencidos que param o veículo — motivo de não poder sair. */
  criticosVencidos: VencimentoVeiculo[];
  vencidos: VencimentoVeiculo[];
  aVencer: VencimentoVeiculo[];
  documentosVencidos: number;
  /** Tem plano aplicado? Sem plano, lista vazia não quer dizer "em dia". */
  temPlano: boolean;
}

const VAZIO: ManutencaoDoVeiculo = {
  vencimentos: [], criticosVencidos: [], vencidos: [], aVencer: [],
  documentosVencidos: 0, temPlano: false,
};

export const useMeuVeiculoManutencao = (vehicleId?: string) => {
  const query = useQuery({
    queryKey: ["meuVeiculoManutencao", vehicleId],
    queryFn: async (): Promise<ManutencaoDoVeiculo> => {
      const [venc, docs] = await Promise.all([
        (supabase as any)
          .from("v_manutencao_vencimentos")
          .select("item_id, servico, situacao, gatilho, bloqueia_veiculo, km_restante, horas_restantes, dias_restantes, folga_fracao")
          .eq("vehicle_id", vehicleId!)
          .order("folga_fracao", { ascending: true }),
        (supabase as any)
          .from("v_documentos_vencidos")
          .select("documentos_vencidos")
          .eq("vehicle_id", vehicleId!)
          .maybeSingle(),
      ]);

      if (venc.error) throw venc.error;

      const lista: VencimentoVeiculo[] = (venc.data ?? []).map((v: any) => ({
        item_id: v.item_id,
        servico: v.servico,
        situacao: v.situacao,
        gatilho: v.gatilho,
        bloqueia_veiculo: Boolean(v.bloqueia_veiculo),
        km_restante: v.km_restante == null ? null : Number(v.km_restante),
        horas_restantes: v.horas_restantes == null ? null : Number(v.horas_restantes),
        dias_restantes: v.dias_restantes == null ? null : Number(v.dias_restantes),
        folga_fracao: v.folga_fracao == null ? null : Number(v.folga_fracao),
      }));

      const vencidos = lista.filter(v => v.situacao === "vencida");

      return {
        vencimentos: lista,
        vencidos,
        criticosVencidos: vencidos.filter(v => v.bloqueia_veiculo),
        aVencer: lista.filter(v => v.situacao === "a_vencer"),
        // Erro ao ler documento não pode derrubar o card inteiro: a manutenção
        // é a informação principal e ela já veio.
        documentosVencidos: Number(docs?.data?.documentos_vencidos ?? 0),
        temPlano: lista.length > 0,
      };
    },
    enabled: Boolean(vehicleId),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });

  return {
    ...(query.data ?? VAZIO),
    loading: query.isLoading,
    erro: query.isError,
    refetch: query.refetch,
  };
};

/** Texto curto na unidade do gatilho que vence primeiro. */
export function restanteDoVencimento(v: VencimentoVeiculo): string {
  const fmt = (n: number) => Math.abs(Math.round(n)).toLocaleString("pt-BR");
  if (v.gatilho === "km" && v.km_restante != null) {
    return v.km_restante < 0 ? `venceu há ${fmt(v.km_restante)} km` : `faltam ${fmt(v.km_restante)} km`;
  }
  if (v.gatilho === "horas" && v.horas_restantes != null) {
    return v.horas_restantes < 0 ? `venceu há ${fmt(v.horas_restantes)} h` : `faltam ${fmt(v.horas_restantes)} h`;
  }
  if (v.dias_restantes != null) {
    if (v.dias_restantes < 0) return `venceu há ${fmt(v.dias_restantes)} dias`;
    if (v.dias_restantes === 0) return "vence hoje";
    return `faltam ${fmt(v.dias_restantes)} dias`;
  }
  return "—";
}

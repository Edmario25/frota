/**
 * useMinhasInfracoes
 *
 * Infrações de velocidade do próprio motorista, para o app.
 * Traz apenas as que o gestor já notificou — infração recém-registrada
 * não aparece antes de alguém decidir comunicá-la.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";

export interface MinhaInfracao {
  id: string;
  velocidade_kmh: number;
  limite_kmh: number;
  excesso_kmh: number;
  excesso_percentual: number;
  gravidade: "leve" | "media" | "grave" | "gravissima";
  status: string;
  notificada_em: string | null;
  ciente_em: string | null;
  created_at: string;
  checkpoint_nome: string | null;
  obra_nome: string | null;
  placa: string | null;
}

const QK = (employeeId?: string) => ["minhasInfracoes", employeeId] as const;

export const useMinhasInfracoes = () => {
  const { employee } = useCurrentEmployee();
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QK(employee?.id),
    queryFn: async (): Promise<MinhaInfracao[]> => {
      const { data, error } = await (supabase as any)
        .from("sms_infracoes_velocidade")
        .select(`id, velocidade_kmh, limite_kmh, excesso_kmh, excesso_percentual,
                 gravidade, status, notificada_em, ciente_em, created_at,
                 sms_checkpoints(nome), obras(nome), vehicles(placa)`)
        .eq("motorista_id", employee!.id)
        .not("notificada_em", "is", null)
        .neq("status", "cancelada")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      return (data ?? []).map((r: any) => ({
        id: r.id,
        velocidade_kmh: Number(r.velocidade_kmh),
        limite_kmh: r.limite_kmh,
        excesso_kmh: Number(r.excesso_kmh),
        excesso_percentual: Number(r.excesso_percentual),
        gravidade: r.gravidade,
        status: r.status,
        notificada_em: r.notificada_em,
        ciente_em: r.ciente_em,
        created_at: r.created_at,
        checkpoint_nome: r.sms_checkpoints?.nome ?? null,
        obra_nome: r.obras?.nome ?? null,
        placa: r.vehicles?.placa ?? null,
      }));
    },
    enabled: !!employee?.id,
    // Recarrega ao voltar para o app: a infração pode ter sido notificada
    // enquanto o motorista estava fora dele.
    refetchOnWindowFocus: true,
  });

  const darCiencia = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .rpc("sms_dar_ciencia_infracao", { p_infracao_id: id });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: QK(employee?.id) });
      toast({
        title: "Ciência registrada",
        description: "A equipe de segurança foi informada de que você viu a notificação.",
      });
    } catch (e: any) {
      toast({
        title: "Não foi possível registrar",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const infracoes = query.data ?? [];

  return {
    infracoes,
    /** Notificadas que ainda aguardam ciência — é o que exige ação. */
    pendentes: infracoes.filter(i => !i.ciente_em),
    loading: query.isLoading,
    darCiencia,
    refetch: query.refetch,
  };
};

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Chaves de permissão disponíveis no sistema ──────────────────────────────
export type PermKey =
  // Operacional
  | "acesso_dashboard"
  | "acesso_frota"
  | "acesso_escalas"
  | "acesso_manutencao"
  | "acesso_colaboradores"
  | "acesso_fundo_fixo"
  | "acesso_relatorios"
  // SMS
  | "acesso_sms_dashboard"
  | "acesso_sms_desvios"
  | "acesso_sms_inspecoes"
  | "acesso_sms_apr"
  | "acesso_sms_dds"
  | "acesso_sms_epis"
  | "acesso_sms_treinamentos"
  | "acesso_sms_admissao"
  | "acesso_sms_rdo"
  // Fases futuras
  | "acesso_efetivo"
  | "acesso_almoxarifado"
  | "acesso_ferramentas"
  | "acesso_cronograma"
  | "acesso_subcontratadas"
  | "acesso_financeiro"
  | "acesso_qualidade"
  | "acesso_comunicados"
  | "acesso_visitantes"
  | "acesso_fornecedores"
  // Escopo
  | "acessa_todas_obras";

export type PermissionsMap = Record<PermKey, boolean>;

// ─── Permissões padrão (tudo false — fallback seguro) ────────────────────────
const DEFAULT_PERMS: PermissionsMap = {
  acesso_dashboard:         false,
  acesso_frota:             false,
  acesso_escalas:           false,
  acesso_manutencao:        false,
  acesso_colaboradores:     false,
  acesso_fundo_fixo:        false,
  acesso_relatorios:        false,
  acesso_sms_dashboard:     false,
  acesso_sms_desvios:       false,
  acesso_sms_inspecoes:     false,
  acesso_sms_apr:           false,
  acesso_sms_dds:           false,
  acesso_sms_epis:          false,
  acesso_sms_treinamentos:  false,
  acesso_sms_admissao:      false,
  acesso_sms_rdo:           false,
  acesso_efetivo:           false,
  acesso_almoxarifado:      false,
  acesso_ferramentas:       false,
  acesso_cronograma:        false,
  acesso_subcontratadas:    false,
  acesso_financeiro:        false,
  acesso_qualidade:         false,
  acesso_comunicados:       false,
  acesso_visitantes:        false,
  acesso_fornecedores:      false,
  acessa_todas_obras:       false,
};

export interface UsePermissionsResult {
  /** Verifica se o usuário tem uma permissão específica */
  can: (key: PermKey) => boolean;
  /** Mapa completo de permissões */
  perms: PermissionsMap;
  /** IDs das obras que o usuário pode acessar */
  obraIds: string[];
  /** true enquanto carregando */
  loading: boolean;
  /** true se as permissões vieram do banco com sucesso */
  ready: boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { user } = useAuth();

  // ─── Permissões do cargo ────────────────────────────────────────────────────
  const { data: rawPerms, isLoading: loadingPerms, isSuccess } = useQuery({
    queryKey: ["user-permissions", user?.id],
    queryFn: async (): Promise<PermissionsMap> => {
      if (!user) return DEFAULT_PERMS;
      const { data, error } = await (supabase as any).rpc("get_user_permissions");
      if (error || !data) return DEFAULT_PERMS;
      // Mescla com defaults para garantir que chaves novas existam
      return { ...DEFAULT_PERMS, ...data } as PermissionsMap;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,   // 5 min — cargo muda raramente
    gcTime:    1000 * 60 * 10,
  });

  // ─── Obras vinculadas ───────────────────────────────────────────────────────
  const { data: obraIds = [], isLoading: loadingObras } = useQuery({
    queryKey: ["user-obra-ids", user?.id],
    queryFn: async (): Promise<string[]> => {
      if (!user) return [];
      const { data, error } = await (supabase as any).rpc("get_user_obra_ids");
      if (error || !data) return [];
      return data as string[];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const perms: PermissionsMap = rawPerms ?? DEFAULT_PERMS;

  return {
    can:     (key: PermKey) => perms[key] === true,
    perms,
    obraIds,
    loading: loadingPerms || loadingObras,
    ready:   isSuccess,
  };
}

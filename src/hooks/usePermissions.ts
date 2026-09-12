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
  | "acesso_sms_velocidade"
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
  | "acesso_alojamento"
  // Escopo
  | "acessa_todas_obras";

// Chaves antigas por cargo: só rotulam os itens do menu. Não dão acesso.
export type PermissionsMap = Record<PermKey, boolean>;

export interface UsePermissionsResult {
  /** IDs das obras do usuário (perfis por obra e vínculos do próprio funcionário) */
  obraIds: string[];
  /** true enquanto carregando */
  loading: boolean;
  /** A ação existe em algum escopo (ex.: para abrir a página). Não diz ONDE vale. */
  canAction: (permission: string) => boolean;
  /**
   * A ação vale no alvo, pela mesma regra do banco (pode()): concessão da
   * empresa, ou da obra informada. Sem obra, só concessões da empresa valem.
   */
  pode: (permission: string, alvo?: { obraId?: string | null }) => boolean;
  /** Obras em que a ação vale; `todas` quando a concessão é da empresa. */
  obrasCom: (permission: string) => { todas: boolean; ids: string[] };
  /** Perfis efetivos, incluindo escopo e validade. */
  accessProfiles: Array<{ id: string; nome: string; scope_type: string; scope_id: string | null; valido_ate: string | null }>;
}

type Grant = { chave: string; scope_type: string; scope_id: string | null };
type EffectiveAccess = {
  permissions: string[];
  grants: Grant[];
  denies: Grant[];
  profiles: UsePermissionsResult["accessProfiles"];
};
const EMPTY_ACCESS: EffectiveAccess = { permissions: [], grants: [], denies: [], profiles: [] };

const cobreObra = (g: Grant, obraId?: string | null) =>
  g.scope_type === "empresa" || (!!obraId && g.scope_type === "obra" && g.scope_id === obraId);

export function usePermissions(): UsePermissionsResult {
  const { user } = useAuth();

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

  const { data: effectiveAccess, isLoading: loadingEffective } = useQuery({
    queryKey: ["effective-access", user?.id],
    queryFn: async (): Promise<EffectiveAccess> => {
      if (!user) return EMPTY_ACCESS;
      const { data, error } = await (supabase as any).rpc("get_effective_access");
      // Banco ainda sem a migration nova: segue normalmente pelo modelo legado.
      if (error || !data) return EMPTY_ACCESS;
      const list = (v: unknown) => (Array.isArray(v) ? v : []);
      return {
        permissions: list(data.permissions),
        grants: list(data.grants),
        denies: list(data.denies),
        profiles: list(data.profiles),
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  const access = effectiveAccess ?? EMPTY_ACCESS;

  const pode = (permission: string, alvo?: { obraId?: string | null }) =>
    access.grants.some(g => g.chave === permission && cobreObra(g, alvo?.obraId)) &&
    !access.denies.some(d => d.chave === permission && cobreObra(d, alvo?.obraId));

  const obrasCom = (permission: string) => {
    const grants = access.grants.filter(g => g.chave === permission);
    const negadas = new Set(access.denies.filter(d => d.chave === permission && d.scope_type === "obra").map(d => d.scope_id));
    return {
      todas: grants.some(g => g.scope_type === "empresa"),
      ids: grants.filter(g => g.scope_type === "obra" && g.scope_id && !negadas.has(g.scope_id)).map(g => g.scope_id!),
    };
  };

  return {
    obraIds,
    loading: loadingObras || loadingEffective,
    canAction: (permission: string) => access.permissions.includes(permission),
    pode,
    obrasCom,
    accessProfiles: access.profiles,
  };
}

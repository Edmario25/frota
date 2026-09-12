import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

type Props = {
  /** Chave da permissão, ex.: "fundo_fixo.aprovar". */
  acao: string;
  /** Obra do registro; sem obra, só concessões da empresa valem. */
  obraId?: string | null;
  /** Resultado para quem ainda não tem perfil novo (regra antiga da tela). */
  legado?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Mostra o conteúdo só se o usuário pode fazer a ação.
 * Esconder o botão é conveniência: quem decide de fato é o banco.
 */
export function Pode({ acao, obraId, legado = false, children, fallback = null }: Props) {
  const { pode, accessProfiles, loading } = usePermissions();
  if (loading) return null;
  const permitido = accessProfiles.length > 0 ? pode(acao, { obraId }) : legado;
  return <>{permitido ? children : fallback}</>;
}

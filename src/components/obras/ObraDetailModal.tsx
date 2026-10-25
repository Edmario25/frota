import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Car, HardHat, Package, AlertTriangle, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { siteStatusLabel } from "@/i18n/siteStatus";
import { useEffect, useState } from "react";

interface ObraDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  obra: any;
}

export function ObraDetailModal({ isOpen, onClose, obra }: ObraDetailModalProps) {
  const { t, money, date } = useI18n();
  const [resumo, setResumo] = useState<Record<string, number>>({});
  const [responsaveis, setResponsaveis] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !obra?.id) return;
    (async () => {
      const ids = [obra.responsavel_tecnico_id, obra.gerente_obra_id, obra.responsavel_sms_id, obra.responsavel_qualidade_id].filter(Boolean);
      const [summary, people] = await Promise.all([
        (supabase as any).rpc("obra_resumo_360", { p_obra_id: obra.id }),
        ids.length ? supabase.from("employees").select("id,nome").in("id", ids) : Promise.resolve({ data: [] }),
      ]);
      setResumo(summary.data ?? {});
      setResponsaveis(Object.fromEntries((people.data ?? []).map((p: any) => [p.id, p.nome])));
    })();
  }, [isOpen, obra?.id]);

  if (!obra) return null;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "planejada": return "secondary";
      case "em_andamento": return "default";
      case "pausada": return "destructive";
      case "concluida": return "outline";
      default: return "secondary";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Detalhes da Obra")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              [Users, t("Funcionários"), resumo.funcionarios ?? 0], [Car, t("Veículos"), resumo.veiculos ?? 0],
              [HardHat, t("Equipes"), resumo.equipes ?? 0], [Package, t("Itens em estoque"), resumo.estoque_itens ?? 0],
              [Wrench, t("Ferramentas"), resumo.ferramentas ?? 0], [AlertTriangle, t("NCs abertas"), resumo.ncs_abertas ?? 0],
            ].map(([Icon, label, value]: any) => <Card key={label}><CardContent className="flex items-center gap-3 p-3"><Icon className="h-4 w-4 text-primary"/><div><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>)}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold">{t("Contrato e controle")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div><span className="text-muted-foreground">{t("Contrato")}</span><p>{obra.numero_contrato || "—"}</p></div>
              <div><span className="text-muted-foreground">{t("Centro de custo")}</span><p>{obra.centro_custo || "—"}</p></div>
              <div><span className="text-muted-foreground">{t("Valor")}</span><p>{obra.valor_contrato != null ? money(Number(obra.valor_contrato)) : "—"}</p></div>
            </div>
            {obra.objeto_contrato && <div className="text-sm"><span className="text-muted-foreground">{t("Objeto")}</span><p>{obra.objeto_contrato}</p></div>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Nome da Obra")}</label>
              <p className="text-sm mt-1">{obra.nome}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Código Interno")}</label>
              <p className="text-sm mt-1">{obra.codigo_interno || "-"}</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">{t("Endereço Completo")}</label>
            <p className="text-sm mt-1">
              {[obra.endereco, obra.cidade, obra.estado].filter(Boolean).join(", ") || "-"}
            </p>
          </div>

          {obra.coordenadas_gps && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Coordenadas GPS")}</label>
              <p className="text-sm mt-1">{obra.coordenadas_gps}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Cliente/Contratante")}</label>
              <p className="text-sm mt-1">{obra.cliente_nome}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("CNPJ do Cliente")}</label>
              <p className="text-sm mt-1">{obra.cliente_cnpj || "-"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Data de Início Prevista")}</label>
              <p className="text-sm mt-1">
                {obra.data_inicio_prevista 
                  ? date(obra.data_inicio_prevista)
                  : "-"
                }
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Data de Término Prevista")}</label>
              <p className="text-sm mt-1">
                {obra.data_termino_prevista 
                  ? date(obra.data_termino_prevista)
                  : "-"
                }
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Status")}</label>
              <div className="mt-1">
                <Badge variant={getStatusBadgeVariant(obra.status)}>
                  {siteStatusLabel(obra.status, t)}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Responsável Técnico")}</label>
              <p className="text-sm mt-1">{responsaveis[obra.responsavel_tecnico_id] || obra.responsavel_tecnico || "-"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-sm font-medium text-muted-foreground">{t("Gerente da Obra")}</label><p className="text-sm mt-1">{responsaveis[obra.gerente_obra_id] || "—"}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t("Responsável SMS")}</label><p className="text-sm mt-1">{responsaveis[obra.responsavel_sms_id] || "—"}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t("Responsável Qualidade")}</label><p className="text-sm mt-1">{responsaveis[obra.responsavel_qualidade_id] || "—"}</p></div>
          </div>

          {obra.observacoes && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("Observações")}</label>
              <p className="text-sm mt-1 whitespace-pre-wrap">{obra.observacoes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <label className="font-medium">{t("Criado em")}</label>
              <p>{date(obra.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <div>
              <label className="font-medium">{t("Última atualização")}</label>
              <p>{date(obra.updated_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Car, HardHat, Package, AlertTriangle, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ObraDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  obra: any;
}

export function ObraDetailModal({ isOpen, onClose, obra }: ObraDetailModalProps) {
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "planejada": return "Planejada";
      case "em_andamento": return "Em Andamento";
      case "pausada": return "Pausada";
      case "concluida": return "Concluída";
      default: return status;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Obra</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              [Users, "Funcionários", resumo.funcionarios ?? 0], [Car, "Veículos", resumo.veiculos ?? 0],
              [HardHat, "Equipes", resumo.equipes ?? 0], [Package, "Itens em estoque", resumo.estoque_itens ?? 0],
              [Wrench, "Ferramentas", resumo.ferramentas ?? 0], [AlertTriangle, "NCs abertas", resumo.ncs_abertas ?? 0],
            ].map(([Icon, label, value]: any) => <Card key={label}><CardContent className="flex items-center gap-3 p-3"><Icon className="h-4 w-4 text-primary"/><div><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>)}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold">Contrato e controle</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div><span className="text-muted-foreground">Contrato</span><p>{obra.numero_contrato || "—"}</p></div>
              <div><span className="text-muted-foreground">Centro de custo</span><p>{obra.centro_custo || "—"}</p></div>
              <div><span className="text-muted-foreground">Valor</span><p>{obra.valor_contrato != null ? Number(obra.valor_contrato).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</p></div>
            </div>
            {obra.objeto_contrato && <div className="text-sm"><span className="text-muted-foreground">Objeto</span><p>{obra.objeto_contrato}</p></div>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Nome da Obra</label>
              <p className="text-sm mt-1">{obra.nome}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Código Interno</label>
              <p className="text-sm mt-1">{obra.codigo_interno || "-"}</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Endereço Completo</label>
            <p className="text-sm mt-1">
              {[obra.endereco, obra.cidade, obra.estado].filter(Boolean).join(", ") || "-"}
            </p>
          </div>

          {obra.coordenadas_gps && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Coordenadas GPS</label>
              <p className="text-sm mt-1">{obra.coordenadas_gps}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Cliente/Contratante</label>
              <p className="text-sm mt-1">{obra.cliente_nome}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">CNPJ do Cliente</label>
              <p className="text-sm mt-1">{obra.cliente_cnpj || "-"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Data de Início Prevista</label>
              <p className="text-sm mt-1">
                {obra.data_inicio_prevista 
                  ? format(new Date(obra.data_inicio_prevista), "dd/MM/yyyy", { locale: ptBR })
                  : "-"
                }
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Data de Término Prevista</label>
              <p className="text-sm mt-1">
                {obra.data_termino_prevista 
                  ? format(new Date(obra.data_termino_prevista), "dd/MM/yyyy", { locale: ptBR })
                  : "-"
                }
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              <div className="mt-1">
                <Badge variant={getStatusBadgeVariant(obra.status)}>
                  {getStatusLabel(obra.status)}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Responsável Técnico</label>
              <p className="text-sm mt-1">{responsaveis[obra.responsavel_tecnico_id] || obra.responsavel_tecnico || "-"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-sm font-medium text-muted-foreground">Gerente da Obra</label><p className="text-sm mt-1">{responsaveis[obra.gerente_obra_id] || "—"}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">Responsável SMS</label><p className="text-sm mt-1">{responsaveis[obra.responsavel_sms_id] || "—"}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">Responsável Qualidade</label><p className="text-sm mt-1">{responsaveis[obra.responsavel_qualidade_id] || "—"}</p></div>
          </div>

          {obra.observacoes && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Observações</label>
              <p className="text-sm mt-1 whitespace-pre-wrap">{obra.observacoes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <label className="font-medium">Criado em</label>
              <p>{format(new Date(obra.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>
            <div>
              <label className="font-medium">Última atualização</label>
              <p>{format(new Date(obra.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

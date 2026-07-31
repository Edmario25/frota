import React, { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, Phone, Mail, MapPin, Calendar, FileText, Pencil, LinkIcon, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Fornecedor, useFornecedores, ObraFornecedor } from "@/hooks/useFornecedores";
import { VinculacaoObraModal } from "./VinculacaoObraModal";
import { useToast } from "@/hooks/use-toast";

interface FornecedorDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  fornecedor: Fornecedor | null;
  onEdit: () => void;
}

const TIPO_LABELS: Record<string, string> = {
  materiais: "Materiais",
  servicos: "Serviços",
  equipamentos: "Equipamentos",
  combustivel: "Combustível",
  pecas: "Peças",
  geral: "Geral",
};

export const FornecedorDetailModal: React.FC<FornecedorDetailModalProps> = ({
  isOpen,
  onClose,
  fornecedor,
  onEdit,
}) => {
  const { getObrasByFornecedor, unlinkFornecedorFromObra } = useFornecedores();
  const { toast } = useToast();
  const [obrasVinculadas, setObrasVinculadas] = useState<ObraFornecedor[]>([]);
  const [loadingObras, setLoadingObras] = useState(false);
  const [isVinculacaoModalOpen, setIsVinculacaoModalOpen] = useState(false);

  const loadObrasVinculadas = useCallback(async () => {
    if (!fornecedor?.id) return;
    setLoadingObras(true);
    try {
      const obras = await getObrasByFornecedor(fornecedor.id);
      setObrasVinculadas(obras);
    } catch (error) {
      console.error("Error loading obras:", error);
    } finally {
      setLoadingObras(false);
    }
  }, [fornecedor?.id, getObrasByFornecedor]);

  useEffect(() => {
    if (isOpen && fornecedor?.id) {
      loadObrasVinculadas();
    }
  }, [isOpen, fornecedor?.id, loadObrasVinculadas]);

  const handleRemoveVinculo = async (linkId: string) => {
    try {
      await unlinkFornecedorFromObra(linkId);
      setObrasVinculadas(prev => prev.filter(o => o.id !== linkId));
    } catch (error) {
      console.error("Error removing vinculo:", error);
    }
  };

  if (!fornecedor) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ativo":
        return <Badge className="bg-green-100 text-green-800">Ativo</Badge>;
      case "inativo":
        return <Badge className="bg-gray-100 text-gray-800">Inativo</Badge>;
      case "bloqueado":
        return <Badge className="bg-red-100 text-red-800">Bloqueado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Detalhes do Fornecedor
              </DialogTitle>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{fornecedor.nome}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">
                    {TIPO_LABELS[fornecedor.tipo_fornecedor] || fornecedor.tipo_fornecedor}
                  </Badge>
                  {getStatusBadge(fornecedor.status)}
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(fornecedor.cnpj || fornecedor.cpf) && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">
                    {fornecedor.cnpj ? "CNPJ" : "CPF"}
                  </label>
                  <p className="text-sm">{fornecedor.cnpj || fornecedor.cpf}</p>
                </div>
              )}

              {fornecedor.telefone && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    Telefone
                  </label>
                  <p className="text-sm">{fornecedor.telefone}</p>
                </div>
              )}

              {fornecedor.email && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Email
                  </label>
                  <p className="text-sm">{fornecedor.email}</p>
                </div>
              )}

              {fornecedor.categoria && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Categoria</label>
                  <p className="text-sm">{fornecedor.categoria}</p>
                </div>
              )}
            </div>

            {/* Address */}
            {(fornecedor.endereco || fornecedor.cidade || fornecedor.estado) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Endereço
                  </label>
                  <p className="text-sm">
                    {[fornecedor.endereco, fornecedor.cidade, fornecedor.estado]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </>
            )}

            {/* Linked Obras */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-1">
                  <LinkIcon className="h-4 w-4" />
                  Obras Vinculadas
                </label>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setIsVinculacaoModalOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Vincular Obra
                </Button>
              </div>
              
              {loadingObras ? (
                <p className="text-sm text-muted-foreground">Carregando obras...</p>
              ) : obrasVinculadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma obra vinculada.</p>
              ) : (
                <div className="space-y-2">
                  {obrasVinculadas.map((link) => (
                    <div
                      key={link.id}
                      className="border rounded-lg p-3 bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{link.obra?.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            Cliente: {link.obra?.cliente_nome}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={link.status ? "default" : "secondary"}>
                            {link.status ? "Ativo" : "Inativo"}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveVinculo(link.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span>Início: {format(new Date(link.data_inicio), "dd/MM/yyyy", { locale: ptBR })}</span>
                        {link.data_fim && (
                          <span> | Fim: {format(new Date(link.data_fim), "dd/MM/yyyy", { locale: ptBR })}</span>
                        )}
                        {link.valor_contrato && (
                          <span> | Valor: R$ {link.valor_contrato.toLocaleString()}</span>
                        )}
                        {link.tipo_contrato && (
                          <span> | Tipo: {link.tipo_contrato}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Observations */}
            {fornecedor.observacoes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    Observações
                  </label>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                    {fornecedor.observacoes}
                  </p>
                </div>
              </>
            )}

            {/* Registration Info */}
            <Separator />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Cadastrado em: {format(new Date(fornecedor.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
              {fornecedor.updated_at !== fornecedor.created_at && (
                <p>
                  Última atualização: {format(new Date(fornecedor.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isVinculacaoModalOpen && (
        <VinculacaoObraModal
          isOpen={isVinculacaoModalOpen}
          onClose={() => setIsVinculacaoModalOpen(false)}
          fornecedorId={fornecedor.id}
          fornecedorNome={fornecedor.nome}
          onSuccess={loadObrasVinculadas}
        />
      )}
    </>
  );
};

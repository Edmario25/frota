import React, { useEffect, useState, useCallback } from "react";
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
import { formatCnpj, formatCpf } from "@/utils/documentValidation";
import { useI18n } from "@/i18n";

interface FornecedorDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  fornecedor: Fornecedor | null;
  onEdit: () => void;
}

// Labels are the Portuguese catalog keys; they are translated when rendered.
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
  const { t, money, date } = useI18n();
  const { getObrasByFornecedor, unlinkFornecedorFromObra } = useFornecedores();
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
    if (!window.confirm(t("Encerrar este vínculo com a obra? O histórico será preservado."))) return;
    try {
      await unlinkFornecedorFromObra(linkId);
      await loadObrasVinculadas();
    } catch (error) {
      console.error("Error removing vinculo:", error);
    }
  };

  if (!fornecedor) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ativo":
        return <Badge className="bg-green-100 text-green-800">{t("Ativo")}</Badge>;
      case "inativo":
        return <Badge className="bg-gray-100 text-gray-800">{t("Inativo")}</Badge>;
      case "bloqueado":
        return <Badge className="bg-red-100 text-red-800">{t("Bloqueado")}</Badge>;
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
                {t("Detalhes do Fornecedor")}
              </DialogTitle>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                {t("Editar")}
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
                    {t(TIPO_LABELS[fornecedor.tipo_fornecedor] || fornecedor.tipo_fornecedor)}
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
                    {fornecedor.cnpj ? t("CNPJ") : t("CPF")}
                  </label>
                  <p className="text-sm">{fornecedor.cnpj ? formatCnpj(fornecedor.cnpj) : formatCpf(fornecedor.cpf ?? "")}</p>
                </div>
              )}

              {fornecedor.telefone && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {t("Telefone")}
                  </label>
                  <p className="text-sm">{fornecedor.telefone}</p>
                </div>
              )}

              {fornecedor.email && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {t("Email")}
                  </label>
                  <p className="text-sm">{fornecedor.email}</p>
                </div>
              )}

              {fornecedor.categoria && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">{t("Categoria")}</label>
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
                    {t("Endereço")}
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
                  {t("Obras Vinculadas")}
                </label>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setIsVinculacaoModalOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t("Vincular Obra")}
                </Button>
              </div>
              
              {loadingObras ? (
                <p className="text-sm text-muted-foreground">{t("Carregando obras...")}</p>
              ) : obrasVinculadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("Nenhuma obra vinculada.")}</p>
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
                            {t("Cliente:")} {link.obra?.cliente_nome}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={link.status ? "default" : "secondary"}>
                            {link.status ? t("Ativo") : t("Inativo")}
                          </Badge>
                          {link.status && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t("Encerrar vínculo")}
                              aria-label={`Encerrar vínculo com ${link.obra?.nome ?? "a obra"}`}
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveVinculo(link.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span>{t("Início:")} {date(`${link.data_inicio}T12:00:00`)}</span>
                        {link.data_fim && (
                          <span> | {t("Fim:")} {date(`${link.data_fim}T12:00:00`)}</span>
                        )}
                        {link.valor_contrato && (
                          <span> | {t("Valor:")} {money(link.valor_contrato)}</span>
                        )}
                        {link.tipo_contrato && (
                          <span> | {t("Tipo:")} {link.tipo_contrato}</span>
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
                    {t("Observações")}
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
                {t("Cadastrado em:")} {date(fornecedor.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              {fornecedor.updated_at !== fornecedor.created_at && (
                <p>
                  {t("Última atualização:")} {date(fornecedor.updated_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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

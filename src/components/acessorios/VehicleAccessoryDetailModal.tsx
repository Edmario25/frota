import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Building, FileText, Camera, Car } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useVehicles } from "@/hooks/useVehicles";

interface VehicleAccessory {
  id: string;
  vehicle_id: string;
  tipo_acessorio: string;
  data_instalacao: string | null;
  fornecedor_empresa: string | null;
  foto_comprovante_url: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

interface VehicleAccessoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessory: VehicleAccessory | null;
}

export const VehicleAccessoryDetailModal: React.FC<VehicleAccessoryDetailModalProps> = ({
  isOpen,
  onClose,
  accessory,
}) => {
  const { vehicles } = useVehicles();

  if (!accessory) return null;

  const vehicle = vehicles.find(v => v.id === accessory.vehicle_id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Acessório</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Vehicle Info */}
          <div className="flex items-center gap-3">
            <Car className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {vehicle?.placa} - {vehicle?.marca} {vehicle?.modelo}
              </p>
              <p className="text-sm text-muted-foreground">
                Ano: {vehicle?.ano} | Cor: {vehicle?.cor}
              </p>
            </div>
          </div>

          <Separator />

          {/* Accessory Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo de Acessório</label>
            <div>
              <Badge variant="outline" className="text-sm">
                {accessory.tipo_acessorio}
              </Badge>
            </div>
          </div>

          {/* Installation Date */}
          {accessory.data_instalacao && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Data de Instalação
              </label>
              <p className="text-sm">
                {format(new Date(accessory.data_instalacao), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          )}

          {/* Supplier */}
          {accessory.fornecedor_empresa && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Building className="h-4 w-4" />
                Fornecedor / Empresa
              </label>
              <p className="text-sm">{accessory.fornecedor_empresa}</p>
            </div>
          )}

          {/* Installation Proof Photo */}
          {accessory.foto_comprovante_url && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Comprovante de Instalação
              </label>
              <div className="mt-2">
                <img
                  src={accessory.foto_comprovante_url}
                  alt="Comprovante de instalação"
                  className="max-w-full h-auto rounded-lg border"
                />
              </div>
            </div>
          )}

          {/* Observations */}
          {accessory.observacoes && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Observações
              </label>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                {accessory.observacoes}
              </p>
            </div>
          )}

          {/* Registration Info */}
          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Registrado em: {format(new Date(accessory.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {accessory.updated_at !== accessory.created_at && (
              <p>
                Última atualização: {format(new Date(accessory.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
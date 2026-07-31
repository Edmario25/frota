import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Car, User, MapPin, FileText, Camera, CircleDot } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";

interface TireService {
  id: string;
  vehicle_id: string;
  employee_id: string;
  data_servico: string;
  tipo_servico: string;
  quantidade_pneus: number | null;
  responsavel: string | null;
  local_servico: string | null;
  foto_pneus_url: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

interface TireServiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tireService: TireService | null;
}

export const TireServiceDetailModal: React.FC<TireServiceDetailModalProps> = ({
  isOpen,
  onClose,
  tireService,
}) => {
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();

  if (!tireService) return null;

  const vehicle = vehicles.find(v => v.id === tireService.vehicle_id);
  const employee = employees.find(e => e.id === tireService.employee_id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Serviço de Borracharia</DialogTitle>
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

          {/* Service Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo de Serviço</label>
            <Badge variant="outline" className="text-sm">
              {tireService.tipo_servico}
            </Badge>
          </div>

          {/* Service Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Data do Serviço
            </label>
            <p className="text-sm">
              {format(new Date(tireService.data_servico), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>

          {/* Tire Quantity */}
          {tireService.quantidade_pneus && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <CircleDot className="h-4 w-4" />
                Quantidade de Pneus
              </label>
              <p className="text-sm">{tireService.quantidade_pneus} pneus</p>
            </div>
          )}

          {/* Responsible Person */}
          {tireService.responsavel && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Responsável pelo Serviço
              </label>
              <p className="text-sm">{tireService.responsavel}</p>
            </div>
          )}

          {/* Service Location */}
          {tireService.local_servico && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Local do Serviço
              </label>
              <p className="text-sm">{tireService.local_servico}</p>
            </div>
          )}

          {/* Employee Info */}
          {employee && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Funcionário Responsável</label>
              <p className="text-sm">{employee.nome}</p>
            </div>
          )}

          {/* Tire Photos */}
          {tireService.foto_pneus_url && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Fotos dos Pneus
              </label>
              <div className="mt-2">
                <img
                  src={tireService.foto_pneus_url}
                  alt="Fotos dos pneus"
                  className="max-w-full h-auto rounded-lg border"
                />
              </div>
            </div>
          )}

          {/* Observations */}
          {tireService.observacoes && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Observações
              </label>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                {tireService.observacoes}
              </p>
            </div>
          )}

          {/* Registration Info */}
          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Registrado em: {format(new Date(tireService.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {tireService.updated_at !== tireService.created_at && (
              <p>
                Última atualização: {format(new Date(tireService.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
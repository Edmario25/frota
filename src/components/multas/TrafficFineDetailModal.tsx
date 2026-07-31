import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Car, User, MapPin, FileText, Camera, DollarSign, AlertTriangle } from "lucide-react";
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

interface TrafficFine {
  id: string;
  vehicle_id: string;
  employee_id: string | null;
  data_multa: string;
  tipo_infracao: string;
  local_infracao: string;
  valor: string;
  situacao: string;
  comprovante_url: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

interface TrafficFineDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  trafficFine: TrafficFine | null;
}

export const TrafficFineDetailModal: React.FC<TrafficFineDetailModalProps> = ({
  isOpen,
  onClose,
  trafficFine,
}) => {
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();

  if (!trafficFine) return null;

  const vehicle = vehicles.find(v => v.id === trafficFine.vehicle_id);
  const employee = trafficFine.employee_id ? employees.find(e => e.id === trafficFine.employee_id) : null;
  const isPending = trafficFine.situacao.toLowerCase() === 'pendente';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Multa</DialogTitle>
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

          {/* Fine Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Situação da Multa</label>
            <div className="flex items-center gap-2">
              {isPending ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-green-600" />
              )}
              <Badge variant={isPending ? "destructive" : "default"}>
                {trafficFine.situacao.toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* Fine Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Data da Multa
            </label>
            <p className="text-sm">
              {format(new Date(trafficFine.data_multa), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>

          {/* Infraction Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo de Infração</label>
            <Badge variant="outline" className="text-sm">
              {trafficFine.tipo_infracao}
            </Badge>
          </div>

          {/* Infraction Location */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Local da Infração
            </label>
            <p className="text-sm">{trafficFine.local_infracao}</p>
          </div>

          {/* Fine Value */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Valor da Multa
            </label>
            <p className="text-lg font-bold text-destructive">
              {Number(trafficFine.valor).toLocaleString('pt-BR', { 
                style: 'currency', 
                currency: 'BRL' 
              })}
            </p>
          </div>

          {/* Employee Info */}
          {employee && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Funcionário Responsável
              </label>
              <p className="text-sm">{employee.nome}</p>
            </div>
          )}

          {/* Proof Document */}
          {trafficFine.comprovante_url && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Comprovante
              </label>
              <div className="mt-2">
                <img
                  src={trafficFine.comprovante_url}
                  alt="Comprovante da multa"
                  className="max-w-full h-auto rounded-lg border"
                />
              </div>
            </div>
          )}

          {/* Observations */}
          {trafficFine.observacoes && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Observações
              </label>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                {trafficFine.observacoes}
              </p>
            </div>
          )}

          {/* Registration Info */}
          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Registrado em: {format(new Date(trafficFine.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {trafficFine.updated_at !== trafficFine.created_at && (
              <p>
                Última atualização: {format(new Date(trafficFine.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
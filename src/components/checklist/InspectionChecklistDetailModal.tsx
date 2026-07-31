import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Car, User, FileText, Gauge, Briefcase, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
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
import { useInspectionChecklist } from "@/hooks/useInspectionChecklist";

interface InspectionChecklist {
  id: string;
  vehicle_id: string;
  employee_id: string;
  data_inspecao: string;
  tipo_servico: string;
  responsavel_checklist: string | null;
  funcao: string | null;
  km_atual: number | null;
  observacoes: string | null;
  fotos_checklist: string | null;
  created_at: string;
  updated_at: string;
}

interface InspectionChecklistDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  checklist: InspectionChecklist | null;
}

export const InspectionChecklistDetailModal: React.FC<InspectionChecklistDetailModalProps> = ({
  isOpen,
  onClose,
  checklist,
}) => {
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { getChecklistItems } = useInspectionChecklist();
  const [checklistItems, setChecklistItems] = React.useState<any[]>([]);
  const [loadingItems, setLoadingItems] = React.useState(false);

  // Load checklist items when modal opens
  React.useEffect(() => {
    if (isOpen && checklist?.id) {
      setLoadingItems(true);
      getChecklistItems(checklist.id).then((items) => {
        setChecklistItems(items);
        setLoadingItems(false);
      });
    }
  }, [isOpen, checklist?.id, getChecklistItems]);

  // Early return AFTER all hooks
  if (!checklist) return null;

  const vehicle = vehicles.find(v => v.id === checklist.vehicle_id);
  const employee = employees.find(e => e.id === checklist.employee_id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Inspeção</DialogTitle>
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
              {checklist.tipo_servico}
            </Badge>
          </div>

          {/* Inspection Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Data da Inspeção
            </label>
            <p className="text-sm">
              {format(new Date(checklist.data_inspecao), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>

          {/* Current Mileage */}
          {checklist.km_atual && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Quilometragem Atual
              </label>
              <p className="text-sm">{checklist.km_atual.toLocaleString()} km</p>
            </div>
          )}

          {/* Responsible Person */}
          {checklist.responsavel_checklist && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Responsável pelo Checklist
              </label>
              <p className="text-sm">{checklist.responsavel_checklist}</p>
            </div>
          )}

          {/* Function */}
          {checklist.funcao && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Função
              </label>
              <p className="text-sm">{checklist.funcao}</p>
            </div>
          )}

          {/* Employee Info */}
          {employee && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Funcionário Responsável</label>
              <p className="text-sm">{employee.nome}</p>
            </div>
          )}

          {/* Observations */}
          {checklist.observacoes && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Observações Gerais
              </label>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                {checklist.observacoes}
              </p>
            </div>
          )}

          {/* General Photos */}
          {checklist.fotos_checklist && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Fotos do Checklist</label>
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(JSON.parse(checklist.fotos_checklist)).map(([categoria, url]) => 
                  url ? (
                    <div key={categoria} className="border rounded-lg p-2">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs">
                          {categoria === 'frente' && '🚗'}
                          {categoria === 'traseira' && '🚙'}
                          {categoria === 'lado_direito' && '➡️'}
                          {categoria === 'lado_esquerdo' && '⬅️'}
                          {categoria === 'painel' && '📊'}
                        </span>
                        <span className="text-sm font-medium capitalize">
                          {categoria.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="relative aspect-video">
                        <img 
                          src={url as string} 
                          alt={`Foto - ${categoria}`} 
                          className="w-full h-full object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => window.open(url as string, '_blank')}
                        />
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* Inspection Items */}
          {checklistItems.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Itens Inspecionados</h4>
                <div className="divide-y divide-border rounded-lg border">
                  {checklistItems.map((item, index) => {
                    const getStatusInfo = (status: string) => {
                      switch (status) {
                        case 'conforme':
                          return {
                            icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
                            label: 'Conforme',
                            badgeClass: 'bg-green-50 text-green-700 border-green-200'
                          };
                        case 'nao_conforme':
                          return {
                            icon: <XCircle className="h-5 w-5 text-red-600" />,
                            label: 'Não Conforme',
                            badgeClass: 'bg-red-50 text-red-700 border-red-200'
                          };
                        case 'nao_aplicavel':
                        default:
                          return {
                            icon: <MinusCircle className="h-5 w-5 text-gray-400" />,
                            label: 'N/A',
                            badgeClass: 'bg-gray-50 text-gray-600 border-gray-200'
                          };
                      }
                    };
                    
                    const statusInfo = getStatusInfo(item.status);
                    
                    return (
                      <div key={index} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 flex-1">
                          {statusInfo.icon}
                          <span className="text-sm font-medium uppercase text-foreground">
                            {item.item_nome}
                          </span>
                        </div>
                        <Badge 
                          variant="outline"
                          className={`${statusInfo.badgeClass} px-3 py-1 text-xs font-medium`}
                        >
                          {statusInfo.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
                
                {/* Observations section if any item has observations */}
                {checklistItems.some(item => item.observacoes) && (
                  <div className="space-y-2 mt-4">
                    <h5 className="text-sm font-medium text-muted-foreground">Observações dos Itens</h5>
                    <div className="space-y-2">
                      {checklistItems
                        .filter(item => item.observacoes)
                        .map((item, index) => (
                          <div key={index} className="bg-muted/30 rounded-lg p-3">
                            <p className="text-xs font-medium text-foreground">{item.item_nome}</p>
                            <p className="text-xs text-muted-foreground mt-1">{item.observacoes}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {loadingItems && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Carregando itens...</p>
            </div>
          )}

          {/* Registration Info */}
          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Registrado em: {format(new Date(checklist.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {checklist.updated_at !== checklist.created_at && (
              <p>
                Última atualização: {format(new Date(checklist.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
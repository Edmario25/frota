import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Truck, User, FileText, Gauge, Briefcase, CheckCircle, XCircle, MinusCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useHeavyVehicleInspections } from "@/hooks/useHeavyVehicleInspections";

interface HeavyVehicleInspection {
  id: string;
  vehicle_id: string;
  employee_id: string;
  data_inspecao: string;
  inspetor_nome: string;
  inspetor_funcao: string;
  km_atual: number | null;
  observacoes_gerais: string | null;
  status_geral: string;
  fotos_checklist: string | null;
  assinatura_inspetor: string | null;
  assinatura_responsavel: string | null;
  created_at: string;
  updated_at: string;
}

interface HeavyVehicleInspectionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  inspection: HeavyVehicleInspection | null;
}

export const HeavyVehicleInspectionDetailModal: React.FC<HeavyVehicleInspectionDetailModalProps> = ({
  isOpen,
  onClose,
  inspection,
}) => {
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { getInspectionItems } = useHeavyVehicleInspections();
  const [inspectionItems, setInspectionItems] = React.useState<any[]>([]);
  const [loadingItems, setLoadingItems] = React.useState(false);

  // Load inspection items when modal opens
  React.useEffect(() => {
    if (isOpen && inspection?.id) {
      setLoadingItems(true);
      getInspectionItems(inspection.id).then((items) => {
        setInspectionItems(items);
        setLoadingItems(false);
      });
    }
  }, [isOpen, inspection?.id, getInspectionItems]);

  // Early return AFTER all hooks
  if (!inspection) return null;

  const vehicle = vehicles.find(v => v.id === inspection.vehicle_id);
  const employee = employees.find(e => e.id === inspection.employee_id);

  // Group items by category
  const itemsByCategory = inspectionItems.reduce((acc, item) => {
    if (!acc[item.categoria]) {
      acc[item.categoria] = [];
    }
    acc[item.categoria].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'C':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'NC':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'NA':
        return <MinusCircle className="h-4 w-4 text-gray-400" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'C':
        return <Badge className="bg-green-100 text-green-800">Conforme</Badge>;
      case 'NC':
        return <Badge className="bg-red-100 text-red-800">Não Conforme</Badge>;
      case 'NA':
        return <Badge className="bg-gray-100 text-gray-800">Não Aplicável</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getGeneralStatusBadge = (status: string) => {
    switch (status) {
      case 'aprovado':
        return <Badge className="bg-green-100 text-green-800">Aprovado</Badge>;
      case 'reprovado':
        return <Badge className="bg-red-100 text-red-800">Reprovado</Badge>;
      case 'pendente':
        return <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Inspeção de Veículo Pesado</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Vehicle Info */}
          <div className="flex items-center gap-3">
            <Truck className="h-5 w-5 text-muted-foreground" />
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

          {/* General Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Data da Inspeção
                </label>
                <p className="text-sm">
                  {format(new Date(inspection.data_inspecao), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Inspetor
                </label>
                <div className="text-sm">
                  <p className="font-medium">{inspection.inspetor_nome}</p>
                  <p className="text-muted-foreground">{inspection.inspetor_funcao}</p>
                </div>
              </div>

              {inspection.km_atual && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    Quilometragem
                  </label>
                  <p className="text-sm">{inspection.km_atual.toLocaleString()} km</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Status Geral</label>
                {getGeneralStatusBadge(inspection.status_geral)}
              </div>

              {employee && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Funcionário Responsável</label>
                  <p className="text-sm">{employee.nome}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Inspection Items by Category */}
          {Object.keys(itemsByCategory).length > 0 && (
            <div className="space-y-4">
              <h4 className="text-lg font-medium">Itens Inspecionados</h4>
              
              <Tabs defaultValue={Object.keys(itemsByCategory)[0]} className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
                  {Object.keys(itemsByCategory).map((categoria) => (
                    <TabsTrigger key={categoria} value={categoria} className="text-xs">
                      {categoria}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {Object.entries(itemsByCategory).map(([categoria, items]: [string, any[]]) => (
                  <TabsContent key={categoria} value={categoria} className="space-y-3">
                    <h5 className="font-medium">{categoria}</h5>
                    <div className="space-y-2">
                      {items.map((item, index) => (
                        <div key={index} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm flex items-center gap-2">
                              {getStatusIcon(item.status)}
                              {item.item_nome}
                            </span>
                            {getStatusBadge(item.status)}
                          </div>
                          {item.observacoes && (
                            <p className="text-xs text-muted-foreground">
                              <strong>Observações:</strong> {item.observacoes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}

          {loadingItems && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Carregando itens da inspeção...</p>
            </div>
          )}

          <Separator />

          {/* General Photos */}
          {inspection.fotos_checklist && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Fotos do Checklist</label>
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(JSON.parse(inspection.fotos_checklist)).map(([categoria, url]) => 
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

          {/* General Observations */}
          {inspection.observacoes_gerais && (
            <>
              <Separator />
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Observações Gerais
                </label>
                <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                  {inspection.observacoes_gerais}
                </p>
              </div>
            </>
          )}

          {/* Registration Info */}
          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Registrado em: {format(new Date(inspection.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {inspection.updated_at !== inspection.created_at && (
              <p>
                Última atualização: {format(new Date(inspection.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
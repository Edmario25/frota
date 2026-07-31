import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Car, MapPin, Wrench, User, Building, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState } from "react";
import { useVehicleKmCycles, KmCycleInfo } from "@/hooks/useVehicleKmCycles";
import { getVehicleStatusSoftClass, getVehicleStatusText, getPropertyTypeText } from "@/lib/statusHelpers";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];

interface ViewVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  employees?: any[];
  rentalCompanies?: any[];
}

const getTypeText = (tipo: string) => {
  switch (tipo) {
    case "leve":
      return "Veículo Leve";
    case "pesado":
      return "Veículo Pesado";
    default:
      return tipo;
  }
};

export function ViewVehicleModal({ 
  isOpen, 
  onClose, 
  vehicle, 
  employees = [], 
  rentalCompanies = [] 
}: ViewVehicleModalProps) {
  const [cycleInfo, setCycleInfo] = useState<KmCycleInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const { getCurrentCycle, getKmProgressColor, formatCycleDate, getDaysText } = useVehicleKmCycles();

  useEffect(() => {
    const fetchCycleInfo = async () => {
      if (vehicle) {
        setLoading(true);
        try {
          const cycle = await getCurrentCycle(vehicle.id);
          setCycleInfo(cycle);
        } catch (error) {
          console.error('Error fetching cycle info:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    if (isOpen && vehicle) {
      fetchCycleInfo();
    }
  }, [vehicle?.id, isOpen]); // Remove getCurrentCycle from dependencies

  if (!vehicle) return null;

  const responsibleEmployee = employees.find(emp => emp.id === vehicle.responsavel_id);
  const rentalCompany = rentalCompanies.find(company => company.id === vehicle.rental_company_id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Detalhes do Veículo
          </DialogTitle>
          <DialogDescription>
            Informações completas do veículo {vehicle.placa}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                Informações do Veículo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Placa</label>
                  <p className="text-lg font-semibold">{vehicle.placa}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Marca</label>
                  <p className="text-base">{vehicle.marca}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Modelo</label>
                  <p className="text-base">{vehicle.modelo}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ano</label>
                  <p className="text-base">{vehicle.ano}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Cor</label>
                  <p className="text-base">{vehicle.cor || 'Não informado'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Tipo</label>
                  <Badge variant="outline">
                    {getTypeText(vehicle.tipo)}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    <Badge className={getVehicleStatusSoftClass(vehicle.status || 'disponivel')}>
                      {getVehicleStatusText(vehicle.status || 'disponivel')}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Tipo de Propriedade</label>
                  <p className="text-base">{getPropertyTypeText(vehicle.tipo_propriedade || 'proprio')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quilometragem */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Controle de Quilometragem
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="space-y-3">
                  <div className="h-4 bg-muted animate-pulse rounded"></div>
                  <div className="h-8 bg-muted animate-pulse rounded"></div>
                  <div className="h-3 bg-muted animate-pulse rounded"></div>
                </div>
              ) : cycleInfo ? (
                <>
                  {/* Quilometragem Total e Atual */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Quilometragem Total</label>
                      <p className="text-2xl font-bold">{(cycleInfo.km_inicial + cycleInfo.km_rodados).toLocaleString()} km</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">KM Inicial do Ciclo</label>
                      <p className="text-xl">{cycleInfo.km_inicial.toLocaleString()} km</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Limite Mensal</label>
                      <p className="text-xl">{cycleInfo.limite_km_mensal.toLocaleString()} km</p>
                    </div>
                  </div>

                  {/* Progresso do Ciclo Mensal */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Ciclo Atual</label>
                      <p className="text-base">
                        {formatCycleDate(cycleInfo.cycle_start_date)} até {formatCycleDate(cycleInfo.cycle_end_date)}
                      </p>
                    </div>

                    <div>
                      <div className="flex justify-between items-center text-sm mb-2">
                        <span className="font-medium">KM Rodados no Ciclo: {cycleInfo.km_rodados.toLocaleString()} km</span>
                        <div className="flex items-center gap-2">
                          <span>{cycleInfo.percentage_used.toFixed(1)}%</span>
                          {cycleInfo.percentage_used >= 80 && (
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-3">
                        <div 
                          className={`h-3 rounded-full transition-all ${getKmProgressColor(cycleInfo.percentage_used)}`}
                          style={{ width: `${Math.min(cycleInfo.percentage_used, 100)}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between items-center mt-2 text-sm">
                        <span className="text-muted-foreground">
                          {getDaysText(cycleInfo.days_remaining)}
                        </span>
                        <span className={`font-medium ${
                          cycleInfo.percentage_used >= 100 ? 'text-destructive' : 
                          cycleInfo.percentage_used >= 80 ? 'text-warning' : 'text-success'
                        }`}>
                          {cycleInfo.percentage_used >= 100 ? 'Limite excedido!' : 
                           cycleInfo.percentage_used >= 80 ? 'Próximo do limite' : 'Dentro do limite'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">Não foi possível carregar os dados do ciclo de quilometragem</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Responsável e Locadora */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Responsável
                </CardTitle>
              </CardHeader>
              <CardContent>
                {responsibleEmployee ? (
                  <div>
                    <p className="font-medium">{responsibleEmployee.nome}</p>
                    <p className="text-sm text-muted-foreground">{responsibleEmployee.email}</p>
                    {responsibleEmployee.telefone && (
                      <p className="text-sm text-muted-foreground">{responsibleEmployee.telefone}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Nenhum responsável atribuído</p>
                )}
              </CardContent>
            </Card>

            {vehicle.tipo_propriedade === 'alugado' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Locadora
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {rentalCompany ? (
                    <div>
                      <p className="font-medium">{rentalCompany.nome}</p>
                      {rentalCompany.contato_responsavel && (
                        <p className="text-sm text-muted-foreground">{rentalCompany.contato_responsavel}</p>
                      )}
                      {rentalCompany.telefone && (
                        <p className="text-sm text-muted-foreground">{rentalCompany.telefone}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Nenhuma locadora vinculada</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Manutenção e Observações */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vehicle.data_ultima_revisao && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Última Revisão
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(vehicle.data_ultima_revisao), 'dd/MM/yyyy', { locale: ptBR })}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {vehicle.observacoes && (
              <Card>
                <CardHeader>
                  <CardTitle>Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{vehicle.observacoes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Datas de Criação e Atualização */}
          <Card>
            <CardHeader>
              <CardTitle>Informações do Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <label className="font-medium">Cadastrado em:</label>
                  <p>{format(new Date(vehicle.created_at), 'dd/MM/yyyy \'às\' HH:mm', { locale: ptBR })}</p>
                </div>
                <div>
                  <label className="font-medium">Última atualização:</label>
                  <p>{format(new Date(vehicle.updated_at), 'dd/MM/yyyy \'às\' HH:mm', { locale: ptBR })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
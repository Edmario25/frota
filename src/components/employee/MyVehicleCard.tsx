import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UpdateKmModal } from "./UpdateKmModal";
import { VehicleDetailModal } from "@/components/frota/VehicleDetailModal";
import {
  Car,
  Gauge,
  Calendar,
  AlertTriangle,
  Clock,
  Wrench,
  LayoutDashboard
} from "lucide-react";
import { getVehicleStatusBadge, getVehicleStatusText } from "@/lib/statusHelpers";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { useState } from "react";

export const MyVehicleCard = () => {
  const { vehicle, kmCycle, loading, refetch } = useEmployeeVehicle();
  const [showUpdateKm, setShowUpdateKm] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const handleKmUpdated = () => {
    setShowUpdateKm(false);
    refetch(); // Recarregar dados após atualização
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Meu Veículo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-muted-foreground">Carregando informações...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!vehicle) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Meu Veículo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Car className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum veículo atribuído</p>
            <p className="text-sm text-muted-foreground mt-1">
              Entre em contato com o gestor para atribuição de veículo
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const kmPercentage = kmCycle ? (kmCycle.km_rodados / kmCycle.limite_km_mensal) * 100 : 0;
  const isOverLimit = kmPercentage > 100;
  const isNearLimit = kmPercentage > 80;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Meu Veículo
          </div>
          <Badge 
            variant="outline" 
            className={`${getVehicleStatusBadge(vehicle.status)} text-white border-0`}
          >
            {getVehicleStatusText(vehicle.status)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Vehicle Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Veículo</p>
            <p className="font-medium">{vehicle.marca} {vehicle.modelo}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Placa</p>
            <p className="font-medium">{vehicle.placa}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Ano</p>
            <p className="font-medium">{vehicle.ano}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Cor</p>
            <p className="font-medium">{vehicle.cor}</p>
          </div>
        </div>

        {/* Current Mileage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Quilometragem Atual</span>
            </div>
            <span className="text-lg font-bold">{vehicle.quilometragem_atual?.toLocaleString()} km</span>
          </div>
        </div>

        {/* Monthly KM Cycle */}
        {kmCycle && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Ciclo Mensal</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {kmCycle.days_remaining} dias restantes
              </span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{kmCycle.km_rodados} km rodados</span>
                <span>{kmCycle.limite_km_mensal} km limite</span>
              </div>
              
              <Progress 
                value={Math.min(kmPercentage, 100)} 
                className={`h-2 ${isOverLimit ? 'bg-red-100' : isNearLimit ? 'bg-yellow-100' : ''}`}
              />
              
              {isOverLimit && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Limite mensal excedido em {(kmCycle.km_rodados - kmCycle.limite_km_mensal)} km</span>
                </div>
              )}
              
              {isNearLimit && !isOverLimit && (
                <div className="flex items-center gap-2 text-yellow-600 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>Próximo do limite mensal</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setShowUpdateKm(true)}
          >
            <Gauge className="h-4 w-4" />
            Atualizar KM
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setShowDetailModal(true)}
          >
            <LayoutDashboard className="h-4 w-4" />
            Controle do Veículo
          </Button>
        </div>

        <UpdateKmModal
          open={showUpdateKm}
          onOpenChange={setShowUpdateKm}
          vehicle={vehicle}
          onKmUpdated={handleKmUpdated}
        />

        <VehicleDetailModal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          vehicle={vehicle}
          isEmployeeMode={true}
        />
      </CardContent>
    </Card>
  );
};
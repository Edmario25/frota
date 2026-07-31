import React, { useState } from "react";
import { Plus, Search, Calendar, CircleDot } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTireServices } from "@/hooks/useTireServices";
import { useVehicles } from "@/hooks/useVehicles";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { TireServiceFormModal } from "@/components/borracharia/TireServiceFormModal";
import { TireServiceDetailModal } from "@/components/borracharia/TireServiceDetailModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const Borracharia = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<any>(null);
  
  const { tireServices, loading } = useTireServices();
  const { vehicles } = useVehicles();
  const { isFuncionario } = useUserRole();
  const { employee } = useCurrentEmployee();

  // Para funcionários, filtrar apenas veículos atribuídos a eles
  const getEmployeeVehicles = () => {
    if (!isFuncionario || !employee) return vehicles;
    return vehicles.filter(v => v.responsavel_id === employee.id);
  };

  const employeeVehicles = getEmployeeVehicles();
  const employeeVehicleIds = employeeVehicles.map(v => v.id);

  // Filtrar serviços apenas dos veículos do funcionário
  const filteredServicesByRole = isFuncionario 
    ? tireServices.filter(service => employeeVehicleIds.includes(service.vehicle_id))
    : tireServices;

  const getVehiclePlate = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.placa || 'N/A';
  };

  const getVehicleModel = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.marca} ${vehicle.modelo}` : 'N/A';
  };

  const getServiceTypeLabel = (tipo: string) => {
    const serviceTypeMap: { [key: string]: string } = {
      calibragem: "Calibragem",
      troca_pneu: "Troca de pneu",
      reparo: "Reparo",
      rodizio: "Rodízio"
    };
    return serviceTypeMap[tipo] || tipo;
  };

  const filteredServices = filteredServicesByRole.filter(service =>
    getVehiclePlate(service.vehicle_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    service.tipo_servico.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (service.responsavel || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (service: any) => {
    setSelectedService(service);
    setIsModalOpen(true);
  };

  const handleViewDetails = (service: any) => {
    setSelectedService(service);
    setIsDetailModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedService(null);
  };

  const handleDetailModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedService(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Carregando serviços...</div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Borracharia</h1>
            <p className="text-muted-foreground">
              Controle de serviços realizados nos pneus
              {isFuncionario && " - Seus veículos"}
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Serviço
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Serviços</CardTitle>
              <CircleDot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredServicesByRole.length}</div>
              <p className="text-xs text-muted-foreground">
                {isFuncionario ? "Seus veículos" : "Toda a frota"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pneus Atendidos</CardTitle>
              <CircleDot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredServicesByRole.reduce((acc, s) => acc + (s.quantidade_pneus || 0), 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Total de pneus
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Serviços Este Mês</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredServicesByRole.filter(s => {
                  const diffTime = Date.now() - new Date(s.data_servico).getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  return diffDays <= 30;
                }).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Últimos 30 dias
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Veículos Atendidos</CardTitle>
              <CircleDot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(filteredServicesByRole.map(s => s.vehicle_id)).size}
              </div>
              <p className="text-xs text-muted-foreground">
                Veículos únicos
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por placa, tipo ou responsável..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>Serviços Realizados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-lg">Carregando serviços...</div>
              </div>
            ) : filteredServices.length === 0 ? (
              <div className="text-center py-12">
                <CircleDot className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum serviço encontrado</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "Tente ajustar os filtros de busca." : "Comece registrando o primeiro serviço."}
                </p>
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Serviço
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredServices.map((service) => (
                  <div
                    key={service.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {getVehiclePlate(service.vehicle_id)}
                        </span>
                        <Badge variant="outline">{getServiceTypeLabel(service.tipo_servico)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getVehicleModel(service.vehicle_id)}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          <Calendar className="inline mr-1 h-3 w-3" />
                          {format(new Date(service.data_servico), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        {service.quantidade_pneus && (
                          <span>Qtd: {service.quantidade_pneus} pneus</span>
                        )}
                        {service.responsavel && (
                          <span>Responsável: {service.responsavel}</span>
                        )}
                      </div>
                      {service.observacoes && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {service.observacoes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(service)}
                      >
                        Ver Detalhes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(service)}
                      >
                        Editar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <TireServiceFormModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          service={selectedService}
          vehicleType={null}
        />

        <TireServiceDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleDetailModalClose}
          tireService={selectedService}
        />
      </div>
    </Layout>
  );
};

export default Borracharia;
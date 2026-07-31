import React, { useState } from "react";
import { Plus, Search, Calendar, FileText } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVehicleAccessories } from "@/hooks/useVehicleAccessories";
import { useVehicles } from "@/hooks/useVehicles";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { VehicleAccessoryFormModal } from "@/components/acessorios/VehicleAccessoryFormModal";
import { VehicleAccessoryDetailModal } from "@/components/acessorios/VehicleAccessoryDetailModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const Acessorios = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedAccessory, setSelectedAccessory] = useState<any>(null);
  
  const { accessories, loading } = useVehicleAccessories();
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

  // Filtrar acessórios apenas dos veículos do funcionário
  const filteredAccessoriesByRole = isFuncionario 
    ? accessories.filter(accessory => employeeVehicleIds.includes(accessory.vehicle_id))
    : accessories;

  const getVehiclePlate = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.placa || 'N/A';
  };

  const getVehicleModel = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.marca} ${vehicle.modelo}` : 'N/A';
  };

  const filteredAccessories = filteredAccessoriesByRole.filter(accessory =>
    getVehiclePlate(accessory.vehicle_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    accessory.tipo_acessorio.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (accessory.fornecedor_empresa || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (accessory: any) => {
    setSelectedAccessory(accessory);
    setIsModalOpen(true);
  };

  const handleViewDetails = (accessory: any) => {
    setSelectedAccessory(accessory);
    setIsDetailModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedAccessory(null);
  };

  const handleDetailModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedAccessory(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Carregando acessórios...</div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Acessórios e Segurança</h1>
            <p className="text-muted-foreground">
              Controle de acessórios instalados nos veículos
              {isFuncionario && " - Seus veículos"}
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Acessório
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Acessórios</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredAccessoriesByRole.length}</div>
              <p className="text-xs text-muted-foreground">
                {isFuncionario ? "Seus veículos" : "Toda a frota"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Veículos com Acessórios</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(filteredAccessoriesByRole.map(a => a.vehicle_id)).size}
              </div>
              <p className="text-xs text-muted-foreground">
                Veículos únicos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Instalações Recentes</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredAccessoriesByRole.filter(a => {
                  if (!a.data_instalacao) return false;
                  const diffTime = Date.now() - new Date(a.data_instalacao).getTime();
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
              <CardTitle className="text-sm font-medium">Veículos Disponíveis</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{employeeVehicles.length}</div>
              <p className="text-xs text-muted-foreground">
                {isFuncionario ? "Atribuídos a você" : "Total disponível"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por placa, tipo ou fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>Acessórios Instalados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-lg">Carregando acessórios...</div>
              </div>
            ) : filteredAccessories.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum acessório encontrado</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "Tente ajustar os filtros de busca." : "Comece registrando o primeiro acessório."}
                </p>
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Acessório
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAccessories.map((accessory) => (
                  <div
                    key={accessory.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {getVehiclePlate(accessory.vehicle_id)}
                        </span>
                        <Badge variant="outline">{accessory.tipo_acessorio}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getVehicleModel(accessory.vehicle_id)}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {accessory.data_instalacao && (
                          <span>
                            <Calendar className="inline mr-1 h-3 w-3" />
                            {format(new Date(accessory.data_instalacao), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        )}
                        {accessory.fornecedor_empresa && (
                          <span>Fornecedor: {accessory.fornecedor_empresa}</span>
                        )}
                      </div>
                      {accessory.observacoes && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {accessory.observacoes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(accessory)}
                      >
                        Ver Detalhes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(accessory)}
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

        <VehicleAccessoryFormModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          accessory={selectedAccessory}
          vehicleType={null}
        />

        <VehicleAccessoryDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleDetailModalClose}
          accessory={selectedAccessory}
        />
      </div>
    </Layout>
  );
};

export default Acessorios;
import React, { useState } from "react";
import { Plus, Search, Calendar, AlertTriangle, DollarSign } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTrafficFines } from "@/hooks/useTrafficFines";
import { useVehicles } from "@/hooks/useVehicles";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { TrafficFineFormModal } from "@/components/multas/TrafficFineFormModal";
import { TrafficFineDetailModal } from "@/components/multas/TrafficFineDetailModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const Multas = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedFine, setSelectedFine] = useState<any>(null);
  
  const { trafficFines, loading, getTrafficFineStats } = useTrafficFines();
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

  // Filtrar multas apenas dos veículos do funcionário
  const filteredFinesByRole = isFuncionario 
    ? trafficFines.filter(fine => employeeVehicleIds.includes(fine.vehicle_id))
    : trafficFines;

  const stats = getTrafficFineStats();

  const getVehiclePlate = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.placa || 'N/A';
  };

  const getVehicleModel = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.marca} ${vehicle.modelo}` : 'N/A';
  };

  const filteredFines = filteredFinesByRole.filter(fine =>
    getVehiclePlate(fine.vehicle_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    fine.tipo_infracao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    fine.local_infracao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (fine: any) => {
    setSelectedFine(fine);
    setIsModalOpen(true);
  };

  const handleViewDetails = (fine: any) => {
    setSelectedFine(fine);
    setIsDetailModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedFine(null);
  };

  const handleDetailModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedFine(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Carregando multas...</div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Multas de Trânsito</h1>
            <p className="text-muted-foreground">
              Gerenciamento das multas recebidas pela frota
              {isFuncionario && " - Seus veículos"}
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Multa
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Multas</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredFinesByRole.length}</div>
              <p className="text-xs text-muted-foreground">
                {isFuncionario ? "Seus veículos" : "Toda a frota"}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {filteredFinesByRole.filter(f => f.situacao === 'pendente').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Necessitam pagamento
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pagas</CardTitle>
              <AlertTriangle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {filteredFinesByRole.filter(f => f.situacao === 'paga').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Quitadas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Pendente</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredFinesByRole
                  .filter(f => f.situacao === 'pendente')
                  .reduce((acc, f) => acc + Number(f.valor), 0)
                  .toLocaleString('pt-BR', { 
                    style: 'currency', 
                    currency: 'BRL' 
                  })}
              </div>
              <p className="text-xs text-muted-foreground">
                A pagar
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por placa, tipo ou local da infração..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>Multas Registradas</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-lg">Carregando multas...</div>
              </div>
            ) : filteredFines.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma multa encontrada</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "Tente ajustar os filtros de busca." : "Comece registrando a primeira multa."}
                </p>
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Multa
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFines.map((fine) => (
                  <div
                    key={fine.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {getVehiclePlate(fine.vehicle_id)}
                        </span>
                        <Badge 
                          variant={fine.situacao === 'paga' ? 'default' : 'destructive'}
                        >
                          {fine.situacao}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getVehicleModel(fine.vehicle_id)}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          <Calendar className="inline mr-1 h-3 w-3" />
                          {format(new Date(fine.data_multa), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        <span>Infração: {fine.tipo_infracao}</span>
                        <span>Local: {fine.local_infracao}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm font-medium">
                        <span>Valor: {Number(fine.valor).toLocaleString('pt-BR', { 
                          style: 'currency', 
                          currency: 'BRL' 
                        })}</span>
                      </div>
                      {fine.observacoes && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {fine.observacoes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(fine)}
                      >
                        Ver Detalhes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(fine)}
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

        <TrafficFineFormModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          fine={selectedFine}
        />

        <TrafficFineDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleDetailModalClose}
          trafficFine={selectedFine}
        />
      </div>
    </Layout>
  );
};

export default Multas;
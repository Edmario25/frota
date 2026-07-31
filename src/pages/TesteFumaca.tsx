import React, { useState } from "react";
import { Plus, Search, Calendar, CheckCircle, XCircle } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSmokeTests } from "@/hooks/useSmokeTests";
import { useVehicles } from "@/hooks/useVehicles";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { SmokeTestFormModal } from "@/components/fumaca/SmokeTestFormModal";
import { SmokeTestDetailModal } from "@/components/fumaca/SmokeTestDetailModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TesteFumaca = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<any>(null);
  
  const { smokeTests, loading } = useSmokeTests();
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

  // Filtrar testes apenas dos veículos do funcionário
  const filteredTestsByRole = isFuncionario 
    ? smokeTests.filter(test => employeeVehicleIds.includes(test.vehicle_id))
    : smokeTests;

  const getVehiclePlate = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.placa || 'N/A';
  };

  const getVehicleModel = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.marca} ${vehicle.modelo}` : 'N/A';
  };

  const filteredTests = filteredTestsByRole.filter(test =>
    getVehiclePlate(test.vehicle_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    test.condutor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    test.responsavel_elaboracao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (test: any) => {
    setSelectedTest(test);
    setIsModalOpen(true);
  };

  const handleViewDetails = (test: any) => {
    setSelectedTest(test);
    setIsDetailModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedTest(null);
  };

  const handleDetailModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedTest(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Carregando testes...</div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Teste de Fumaça Preta</h1>
            <p className="text-muted-foreground">
              Registros obrigatórios para veículos a diesel
              {isFuncionario && " - Seus veículos"}
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Teste
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Testes</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredTestsByRole.length}</div>
              <p className="text-xs text-muted-foreground">
                {isFuncionario ? "Seus veículos" : "Toda a frota"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {filteredTestsByRole.filter(t => t.resultado === 'aprovado').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Testes aprovados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reprovados</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {filteredTestsByRole.filter(t => t.resultado === 'reprovado').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Necessitam atenção
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Veículos Testados</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(filteredTestsByRole.map(t => t.vehicle_id)).size}
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
              placeholder="Buscar por placa, condutor ou responsável..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>Testes Realizados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-lg">Carregando testes...</div>
              </div>
            ) : filteredTests.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum teste encontrado</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "Tente ajustar os filtros de busca." : "Comece registrando o primeiro teste."}
                </p>
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Teste
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTests.map((test) => (
                  <div
                    key={test.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {getVehiclePlate(test.vehicle_id)}
                        </span>
                        <Badge 
                          variant={test.resultado === 'aprovado' ? 'default' : 'destructive'}
                          className="flex items-center gap-1"
                        >
                          {test.resultado === 'aprovado' ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {test.resultado}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getVehicleModel(test.vehicle_id)}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          <Calendar className="inline mr-1 h-3 w-3" />
                          {format(new Date(test.data_afericao), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        <span>Condutor: {test.condutor}</span>
                        <span>Responsável: {test.responsavel_elaboracao}</span>
                      </div>
                      {test.observacoes && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {test.observacoes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(test)}
                      >
                        Ver Detalhes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(test)}
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

        <SmokeTestFormModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          test={selectedTest}
          vehicleType={null}
        />

        <SmokeTestDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleDetailModalClose}
          smokeTest={selectedTest}
        />
      </div>
    </Layout>
  );
};

export default TesteFumaca;
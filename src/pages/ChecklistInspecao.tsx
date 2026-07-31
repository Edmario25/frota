import React, { useState } from "react";
import { Plus, Search, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVehicles } from "@/hooks/useVehicles";
import { useInspectionChecklist } from "@/hooks/useInspectionChecklist";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { InspectionChecklistDetailModal } from "@/components/checklist/InspectionChecklistDetailModal";
import { InspectionChecklistFormModal } from "@/components/checklist/InspectionChecklistFormModal";
import { Layout } from "@/components/layout/Layout";

const ChecklistInspecao = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState<any>(null);
  
  const { checklists, loading } = useInspectionChecklist();
  const { vehicles } = useVehicles();

  const getVehiclePlate = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.placa || 'N/A';
  };

  const getVehicleModel = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.marca} ${vehicle.modelo}` : 'N/A';
  };

  const filteredChecklists = checklists.filter(checklist =>
    getVehiclePlate(checklist.vehicle_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    checklist.tipo_servico.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (checklist.responsavel_checklist || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (checklist: any) => {
    setSelectedChecklist(checklist);
    setIsModalOpen(true);
  };

  const handleViewDetails = (checklist: any) => {
    setSelectedChecklist(checklist);
    setIsDetailModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedChecklist(null);
  };

  const handleDetailModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedChecklist(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Carregando checklists...</div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Checklist de Inspeção</h1>
          <p className="text-muted-foreground">
            Inspeções de entrada e saída dos veículos
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nova Inspeção
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar por placa, tipo ou responsável..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredChecklists.map((checklist) => (
          <Card key={checklist.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{getVehiclePlate(checklist.vehicle_id)}</CardTitle>
                <Badge variant="outline">{checklist.tipo_servico}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {getVehicleModel(checklist.vehicle_id)}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="mr-2 h-4 w-4" />
                  {format(new Date(checklist.data_inspecao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </div>
                
                <div className="text-sm">
                  {checklist.responsavel_checklist && (
                    <p><strong>Responsável:</strong> {checklist.responsavel_checklist}</p>
                  )}
                  {checklist.km_atual && (
                    <p><strong>KM:</strong> {checklist.km_atual.toLocaleString()}</p>
                  )}
                </div>

                {checklist.observacoes && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {checklist.observacoes}
                  </p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleViewDetails(checklist)}
                  className="flex-1"
                >
                  Ver Detalhes
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleEdit(checklist)}
                  className="flex-1"
                >
                  Editar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredChecklists.length === 0 && !loading && (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhuma inspeção encontrada</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm ? "Tente ajustar os filtros de busca." : "Comece registrando a primeira inspeção."}
          </p>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Inspeção
          </Button>
        </div>
      )}

      <InspectionChecklistFormModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        checklist={selectedChecklist}
      />

      <InspectionChecklistDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleDetailModalClose}
        checklist={selectedChecklist}
      />
    </div>
    </Layout>
  );
};

export default ChecklistInspecao;
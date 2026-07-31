import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Plus,
  Wrench,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Car,
  FileText,
  History,
  Camera,
  Droplets,
  Download,
} from "lucide-react";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useVehicles } from "@/hooks/useVehicles";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { MaintenanceFormModal } from "@/components/manutencao/MaintenanceFormModal";
import { DamageReportModal } from "@/components/manutencao/DamageReportModal";
import { WashRecordModal } from "@/components/manutencao/WashRecordModal";
import { HistoryModal } from "@/components/manutencao/HistoryModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getMaintenanceStatusColor, getMaintenanceStatusText } from "@/lib/statusHelpers";
import { downloadCsv } from "@/lib/exportCsv";

export default function Manutencao() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showWashModal, setShowWashModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedMaintenance, setSelectedMaintenance] = useState(null);
  
  const { maintenanceRecords, loading, getMaintenanceStats } = useMaintenance();
  const { vehicles } = useVehicles();
  const { isFuncionario } = useUserRole();
  const { employee } = useCurrentEmployee();
  
  const stats = getMaintenanceStats();

  // Para funcionários, filtrar apenas veículos atribuídos a eles
  const getEmployeeVehicleCount = () => {
    if (!employee) return 0;
    return vehicles.filter(v => v.responsavel_id === employee.id).length;
  };

  const vehicleCount = isFuncionario ? getEmployeeVehicleCount() : vehicles.length;

  const getVehiclePlate = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.placa || 'N/A';
  };

  const filteredRecords = maintenanceRecords.filter(record =>
    getVehiclePlate(record.vehicle_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.descricao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtrar por status para cada aba
  const getFilteredRecordsByStatus = (status?: string) => {
    if (!status) return filteredRecords;
    return filteredRecords.filter(record => record.status === status);
  };

  // Função para renderizar lista de manutenções
  const renderMaintenanceList = (records: typeof maintenanceRecords, title: string) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {records.length} registro{records.length !== 1 ? 's' : ''} encontrado{records.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {loading ? (
            <p>Carregando...</p>
          ) : records.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Nenhum registro encontrado.
            </p>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {getVehiclePlate(record.vehicle_id)}
                      </span>
                      <Badge className={getMaintenanceStatusColor(record.status)}>
                        {getMaintenanceStatusText(record.status)}
                      </Badge>
                      <Badge variant="outline">
                        {record.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {record.descricao}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        Agendada: {format(new Date(record.data_agendada), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                      {record.data_realizada && (
                        <span>
                          Realizada: {format(new Date(record.data_realizada), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      )}
                      {record.quilometragem && (
                        <span>KM: {record.quilometragem.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.custo && (
                      <span className="text-sm font-medium">
                        R$ {record.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedMaintenance(record);
                        setShowMaintenanceModal(true);
                      }}
                    >
                      Editar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight">Manutenção</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gerencie as manutenções da sua frota</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const headers = ['Placa', 'Descrição', 'Tipo', 'Status', 'Data Agendada', 'Data Realizada', 'KM', 'Custo (R$)', 'Oficina', 'Responsável', 'Observações'];
                const rows = filteredRecords.map(r => [
                  getVehiclePlate(r.vehicle_id),
                  r.descricao,
                  r.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva',
                  getMaintenanceStatusText(r.status),
                  new Date(r.data_agendada).toLocaleDateString('pt-BR'),
                  r.data_realizada ? new Date(r.data_realizada).toLocaleDateString('pt-BR') : '',
                  r.quilometragem ?? '',
                  r.custo != null ? r.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
                  r.oficina ?? '',
                  r.responsavel ?? '',
                  r.observacoes ?? '',
                ]);
                downloadCsv(headers, rows, `manutencao_${new Date().toISOString().slice(0, 10)}`);
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Exportar CSV
            </Button>
            <Button size="sm" onClick={() => setShowMaintenanceModal(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nova Manutenção
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            { label: isFuncionario ? "Atribuídos a você" : "Veículos", value: vehicleCount, color: "text-primary" },
            { label: "Em Andamento", value: stats.em_andamento, color: "text-amber-600" },
            { label: "Concluídas", value: stats.concluida, color: "text-emerald-600" },
            { label: "Alertas Críticos", value: 2, color: "text-destructive" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="lista" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="lista">Lista de Manutenções</TabsTrigger>
              <TabsTrigger value="agendadas">Agendadas</TabsTrigger>
              <TabsTrigger value="em_andamento">Em Andamento</TabsTrigger>
              <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDamageModal(true)}>
                <Camera className="mr-2 h-4 w-4" />
                Avarias
              </Button>
              <Button variant="outline" onClick={() => setShowWashModal(true)}>
                <Droplets className="mr-2 h-4 w-4" />
                Lavagem
              </Button>
              <Button variant="outline" onClick={() => setShowHistoryModal(true)}>
                <History className="mr-2 h-4 w-4" />
                Histórico
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por placa ou descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <TabsContent value="lista" className="space-y-4">
            {renderMaintenanceList(filteredRecords, "Lista de Manutenções")}
          </TabsContent>

          <TabsContent value="agendadas" className="space-y-4">
            {renderMaintenanceList(getFilteredRecordsByStatus('agendada'), "Manutenções Agendadas")}
          </TabsContent>

          <TabsContent value="em_andamento" className="space-y-4">
            {renderMaintenanceList(getFilteredRecordsByStatus('em_andamento'), "Manutenções em Andamento")}
          </TabsContent>

          <TabsContent value="concluidas" className="space-y-4">
            {renderMaintenanceList(getFilteredRecordsByStatus('concluida'), "Manutenções Concluídas")}
          </TabsContent>
        </Tabs>
      </div>

      <MaintenanceFormModal
        isOpen={showMaintenanceModal}
        onClose={() => {
          setShowMaintenanceModal(false);
          setSelectedMaintenance(null);
        }}
        maintenance={selectedMaintenance}
      />

      <DamageReportModal
        isOpen={showDamageModal}
        onClose={() => setShowDamageModal(false)}
      />

      <WashRecordModal
        isOpen={showWashModal}
        onClose={() => setShowWashModal(false)}
      />

      <HistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />
    </Layout>
  );
}
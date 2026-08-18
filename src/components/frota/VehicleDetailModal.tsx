import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Car, MapPin, User, Building, Wrench, Package, TestTube, ClipboardCheck,
  CircleDot, CircleDollarSign, AlertTriangle, Calendar, Plus, MoreHorizontal,
  Edit, Eye, Trash2, Droplets, Fuel, TrendingUp, Play, Check, X
} from "lucide-react";
import { useVehicleKmCycles, KmCycleInfo } from "@/hooks/useVehicleKmCycles";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useVehicleAccessories } from "@/hooks/useVehicleAccessories";
import { useSmokeTests } from "@/hooks/useSmokeTests";
import { useTireServices } from "@/hooks/useTireServices";
import { useDamageReports } from "@/hooks/useDamageReports";
import { useTrafficFines } from "@/hooks/useTrafficFines";
import { useInspectionChecklist } from "@/hooks/useInspectionChecklist";
import { useWashRecords } from "@/hooks/useWashRecords";
import { useFuelLogs } from "@/hooks/useFuelLogs";
import { useEmployees } from "@/hooks/useEmployees";
import { WashRecordFormModal } from "@/components/lavagem/WashRecordFormModal";
import { FuelLogFormModal } from "@/components/combustivel/FuelLogFormModal";
import { MaintenanceFormModal } from "@/components/manutencao/MaintenanceFormModal";
import { MaintenanceDetailModal } from "@/components/manutencao/MaintenanceDetailModal";
import { VehicleAccessoryFormModal } from "@/components/acessorios/VehicleAccessoryFormModal";
import { VehicleAccessoryDetailModal } from "@/components/acessorios/VehicleAccessoryDetailModal";
import { SmokeTestFormModal } from "@/components/fumaca/SmokeTestFormModal";
import { SmokeTestDetailModal } from "@/components/fumaca/SmokeTestDetailModal";
import { TireServiceFormModal } from "@/components/borracharia/TireServiceFormModal";
import { TireServiceDetailModal } from "@/components/borracharia/TireServiceDetailModal";
import { DamageReportModal } from "@/components/manutencao/DamageReportModal";
import { TrafficFineFormModal } from "@/components/multas/TrafficFineFormModal";
import { TrafficFineDetailModal } from "@/components/multas/TrafficFineDetailModal";
import { InspectionChecklistFormModal } from "@/components/checklist/InspectionChecklistFormModal";
import { InspectionChecklistDetailModal } from "@/components/checklist/InspectionChecklistDetailModal";
import {
  getVehicleStatusSoftClass,
  getVehicleStatusText,
  getPropertyTypeText,
  getMaintenanceStatusColor,
  getMaintenanceStatusText,
} from "@/lib/statusHelpers";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];

interface VehicleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  employees?: any[];
  rentalCompanies?: any[];
  /** Modo funcionário: esconde ações admin (criar manutenção, excluir registros),
   *  mas permite lançamentos operacionais e mudanças de status */
  isEmployeeMode?: boolean;
}


export function VehicleDetailModal({
  isOpen,
  onClose,
  vehicle,
  employees: propEmployees = [],
  rentalCompanies = [],
  isEmployeeMode = false,
}: VehicleDetailModalProps) {
  const [cycleInfo, setCycleInfo] = useState<KmCycleInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  
  // Data hooks
  const { getCurrentCycle, getKmProgressColor, formatCycleDate, getDaysText } = useVehicleKmCycles();
  const { maintenanceRecords, deleteMaintenanceRecord, updateMaintenanceRecord } = useMaintenance();
  const { accessories, deleteAccessory } = useVehicleAccessories();
  const { smokeTests, deleteSmokeTest } = useSmokeTests();
  const { tireServices, deleteTireService } = useTireServices();
  const { damageReports, deleteDamageReport } = useDamageReports();
  const { trafficFines, deleteTrafficFine } = useTrafficFines();
  const { checklists } = useInspectionChecklist();
  const { washRecords, createWashRecord, updateWashRecord, deleteWashRecord } = useWashRecords();
  const { fuelLogs, createFuelLog, updateFuelLog, deleteFuelLog } = useFuelLogs();
  const { employees: hookEmployees } = useEmployees();
  
  const employees = propEmployees.length > 0 ? propEmployees : hookEmployees;

  // Modal states
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isMaintenanceDetailModalOpen, setIsMaintenanceDetailModalOpen] = useState(false);
  const [selectedMaintenance, setSelectedMaintenance] = useState<any>(null);
  
  const [isAccessoryFormModalOpen, setIsAccessoryFormModalOpen] = useState(false);
  const [isAccessoryDetailModalOpen, setIsAccessoryDetailModalOpen] = useState(false);
  const [selectedAccessory, setSelectedAccessory] = useState<any>(null);
  
  const [isSmokeTestFormModalOpen, setIsSmokeTestFormModalOpen] = useState(false);
  const [isSmokeTestDetailModalOpen, setIsSmokeTestDetailModalOpen] = useState(false);
  const [selectedSmokeTest, setSelectedSmokeTest] = useState<any>(null);
  
  const [isTireServiceFormModalOpen, setIsTireServiceFormModalOpen] = useState(false);
  const [isTireServiceDetailModalOpen, setIsTireServiceDetailModalOpen] = useState(false);
  const [selectedTireService, setSelectedTireService] = useState<any>(null);
  
  const [isDamageReportModalOpen, setIsDamageReportModalOpen] = useState(false);
  const [selectedDamageReport, setSelectedDamageReport] = useState<any>(null);
  
  const [isTrafficFineFormModalOpen, setIsTrafficFineFormModalOpen] = useState(false);
  const [isTrafficFineDetailModalOpen, setIsTrafficFineDetailModalOpen] = useState(false);
  const [selectedTrafficFine, setSelectedTrafficFine] = useState<any>(null);
  
  const [isChecklistFormModalOpen, setIsChecklistFormModalOpen] = useState(false);
  const [isChecklistDetailModalOpen, setIsChecklistDetailModalOpen] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState<any>(null);

  const [isWashFormModalOpen, setIsWashFormModalOpen] = useState(false);
  const [selectedWash, setSelectedWash] = useState<any>(null);

  const [selectedCostMonth, setSelectedCostMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );

  const [isFuelFormModalOpen, setIsFuelFormModalOpen] = useState(false);
  const [selectedFuelLog, setSelectedFuelLog] = useState<any>(null);

  // Filter data for this vehicle
  const vehicleMaintenanceRecords = useMemo(() => 
    maintenanceRecords.filter(r => r.vehicle_id === vehicle?.id), 
    [maintenanceRecords, vehicle?.id]
  );
  
  const vehicleAccessories = useMemo(() => 
    accessories.filter(a => a.vehicle_id === vehicle?.id), 
    [accessories, vehicle?.id]
  );
  
  const vehicleSmokeTests = useMemo(() => 
    smokeTests.filter(t => t.vehicle_id === vehicle?.id), 
    [smokeTests, vehicle?.id]
  );
  
  const vehicleTireServices = useMemo(() => 
    tireServices.filter(s => s.vehicle_id === vehicle?.id), 
    [tireServices, vehicle?.id]
  );
  
  const vehicleDamageReports = useMemo(() => 
    damageReports.filter(r => r.vehicle_id === vehicle?.id), 
    [damageReports, vehicle?.id]
  );
  
  const vehicleTrafficFines = useMemo(() => 
    trafficFines.filter(f => f.vehicle_id === vehicle?.id), 
    [trafficFines, vehicle?.id]
  );
  
  const vehicleChecklists = useMemo(() =>
    checklists.filter(c => c.vehicle_id === vehicle?.id),
    [checklists, vehicle?.id]
  );

  const vehicleWashRecords = useMemo(() =>
    washRecords.filter(w => w.vehicle_id === vehicle?.id),
    [washRecords, vehicle?.id]
  );

  const vehicleFuelLogs = useMemo(() =>
    fuelLogs.filter(f => f.vehicle_id === vehicle?.id),
    [fuelLogs, vehicle?.id]
  );

  const fetchCycleInfo = React.useCallback(async () => {
    if (!vehicle) return;
    setLoading(true);
    try {
      const cycle = await getCurrentCycle(vehicle.id);
      setCycleInfo(cycle);
    } catch (error) {
      console.error('Error fetching cycle info:', error);
    } finally {
      setLoading(false);
    }
  }, [vehicle?.id, getCurrentCycle]);

  useEffect(() => {
    if (isOpen && vehicle) {
      fetchCycleInfo();
      setActiveTab("info");
    }
  }, [vehicle?.id, vehicle?.quilometragem_atual, isOpen]);

  if (!vehicle) return null;

  const responsibleEmployee = employees.find(emp => emp.id === vehicle.responsavel_id);
  const rentalCompany = rentalCompanies.find(company => company.id === vehicle.rental_company_id);

  const getMaintenanceStatusBadge = (status: string) =>
    <Badge className={getMaintenanceStatusColor(status)}>{getMaintenanceStatusText(status)}</Badge>;

  const renderInfoTab = () => (
    <div className="space-y-4">
      {/* Vehicle Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="h-4 w-4" />
            Informações do Veículo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Placa</label>
              <p className="text-sm font-semibold">{vehicle.placa}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Marca/Modelo</label>
              <p className="text-sm">{vehicle.marca} {vehicle.modelo}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ano</label>
              <p className="text-sm">{vehicle.ano}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cor</label>
              <p className="text-sm">{vehicle.cor || 'Não informado'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <div className="mt-1">
                <Badge className={getVehicleStatusSoftClass(vehicle.status || 'disponivel')}>
                  {getVehicleStatusText(vehicle.status || 'disponivel')}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Propriedade</label>
              <p className="text-sm">{getPropertyTypeText(vehicle.tipo_propriedade || 'proprio')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Km Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Quilometragem
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-16 bg-muted animate-pulse rounded" />
          ) : (
            <div className="space-y-3">
              {/* Quilometragem atual — sempre visível e sempre atualizada */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Quilometragem Atual</label>
                  <p className="text-2xl font-bold">{(vehicle.quilometragem_atual ?? 0).toLocaleString()} km</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Limite Mensal</label>
                  <p className="text-lg">{(vehicle.quilometragem_maxima_mensal ?? 0).toLocaleString()} km</p>
                </div>
              </div>

              {/* Ciclo mensal — exibido apenas quando existir */}
              {cycleInfo ? (
                <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ciclo Mensal Ativo</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">KM Rodados no Ciclo</label>
                      <p className="text-sm font-medium">{cycleInfo.km_rodados.toLocaleString()} km</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Prazo</label>
                      <p className="text-sm font-medium">{getDaysText(cycleInfo.days_remaining)}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span>Progresso: {cycleInfo.percentage_used.toFixed(1)}%</span>
                      <span className="text-muted-foreground">
                        {formatCycleDate(cycleInfo.cycle_start_date)} → {formatCycleDate(cycleInfo.cycle_end_date)}
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getKmProgressColor(cycleInfo.percentage_used)}`}
                        style={{ width: `${Math.min(cycleInfo.percentage_used, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed px-4 py-3 bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground">
                    Nenhum ciclo ativo — o ciclo é criado automaticamente na data de cadastro do veículo.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Responsible & Rental */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Responsável
            </CardTitle>
          </CardHeader>
          <CardContent>
            {responsibleEmployee ? (
              <div>
                <p className="text-sm font-medium">{responsibleEmployee.nome}</p>
                <p className="text-xs text-muted-foreground">{responsibleEmployee.email}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Não atribuído</p>
            )}
          </CardContent>
        </Card>

        {vehicle.tipo_propriedade === 'alugado' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building className="h-4 w-4" />
                Locadora
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rentalCompany ? (
                <div>
                  <p className="text-sm font-medium">{rentalCompany.nome}</p>
                  <p className="text-xs text-muted-foreground">{rentalCompany.telefone}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Não vinculada</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const renderMaintenanceTab = () => {
    const today = new Date().toISOString().split('T')[0];
    return (
      <div className="space-y-4">
        {!isEmployeeMode && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setSelectedMaintenance(null); setIsMaintenanceModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Nova Manutenção
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-[120px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicleMaintenanceRecords.map((record) => (
              <TableRow key={record.id}>
                <TableCell><Badge variant="outline">{record.tipo}</Badge></TableCell>
                <TableCell className="max-w-[150px] truncate">{record.descricao}</TableCell>
                <TableCell>{getMaintenanceStatusBadge(record.status)}</TableCell>
                <TableCell>{format(new Date(record.data_agendada), 'dd/MM/yy', { locale: ptBR })}</TableCell>
                <TableCell>
                  {isEmployeeMode ? (
                    <div className="flex flex-wrap gap-1">
                      {record.status === 'agendada' && (
                        <Button size="sm" variant="outline"
                          className="h-7 px-2 text-xs gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                          onClick={() => updateMaintenanceRecord(record.id, { status: 'em_andamento' })}>
                          <Play className="h-3 w-3" />Iniciar
                        </Button>
                      )}
                      {record.status === 'em_andamento' && (
                        <Button size="sm" variant="outline"
                          className="h-7 px-2 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => updateMaintenanceRecord(record.id, { status: 'concluida', data_realizada: today })}>
                          <Check className="h-3 w-3" />Concluir
                        </Button>
                      )}
                      {(record.status === 'agendada' || record.status === 'em_andamento') && (
                        <Button size="sm" variant="outline"
                          className="h-7 px-2 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => updateMaintenanceRecord(record.id, { status: 'cancelada' })}>
                          <X className="h-3 w-3" />Cancelar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setSelectedMaintenance(record); setIsMaintenanceDetailModalOpen(true); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-7 w-7 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedMaintenance(record); setIsMaintenanceDetailModalOpen(true); }}>
                          <Eye className="h-4 w-4 mr-2" />Ver
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelectedMaintenance(record); setIsMaintenanceModalOpen(true); }}>
                          <Edit className="h-4 w-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => deleteMaintenanceRecord(record.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {vehicleMaintenanceRecords.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                  Nenhuma manutenção registrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderAccessoriesTab = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setSelectedAccessory(null); setIsAccessoryFormModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Acessório
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Data Instalação</TableHead>
            <TableHead className="w-[80px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicleAccessories.map((accessory) => (
            <TableRow key={accessory.id}>
              <TableCell>{accessory.tipo_acessorio}</TableCell>
              <TableCell>{accessory.fornecedor_empresa || '-'}</TableCell>
              <TableCell>{accessory.data_instalacao ? format(new Date(accessory.data_instalacao), 'dd/MM/yy', { locale: ptBR }) : '-'}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setSelectedAccessory(accessory); setIsAccessoryDetailModalOpen(true); }}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {!isEmployeeMode && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setSelectedAccessory(accessory); setIsAccessoryFormModalOpen(true); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => deleteAccessory(accessory.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {vehicleAccessories.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                Nenhum acessório registrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  const renderSmokeTestTab = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setSelectedSmokeTest(null); setIsSmokeTestFormModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Teste
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Condutor</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead className="w-[80px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicleSmokeTests.map((test) => (
            <TableRow key={test.id}>
              <TableCell>{format(new Date(test.data_afericao), 'dd/MM/yy', { locale: ptBR })}</TableCell>
              <TableCell>{test.condutor}</TableCell>
              <TableCell>
                <Badge variant={test.resultado === 'Aprovado' ? 'default' : 'destructive'}>
                  {test.resultado}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setSelectedSmokeTest(test); setIsSmokeTestDetailModalOpen(true); }}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setSelectedSmokeTest(test); setIsSmokeTestFormModalOpen(true); }}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  {!isEmployeeMode && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => deleteSmokeTest(test.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {vehicleSmokeTests.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                Nenhum teste registrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  const renderChecklistTab = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setSelectedChecklist(null); setIsChecklistFormModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Checklist
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo Serviço</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead className="w-[80px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicleChecklists.map((checklist) => (
            <TableRow key={checklist.id}>
              <TableCell>{format(new Date(checklist.data_inspecao), 'dd/MM/yy', { locale: ptBR })}</TableCell>
              <TableCell>{checklist.tipo_servico}</TableCell>
              <TableCell>{checklist.responsavel_checklist || '-'}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setSelectedChecklist(checklist); setIsChecklistDetailModalOpen(true); }}>
                      <Eye className="h-4 w-4 mr-2" />Ver
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSelectedChecklist(checklist); setIsChecklistFormModalOpen(true); }}>
                      <Edit className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  {/* checklist kept as dropdown (no delete) — same for all roles */}
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {vehicleChecklists.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                Nenhum checklist registrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  const renderTireServiceTab = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setSelectedTireService(null); setIsTireServiceFormModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Serviço
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Qtd Pneus</TableHead>
            <TableHead className="w-[80px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicleTireServices.map((service) => (
            <TableRow key={service.id}>
              <TableCell>{format(new Date(service.data_servico), 'dd/MM/yy', { locale: ptBR })}</TableCell>
              <TableCell>{service.tipo_servico}</TableCell>
              <TableCell>{service.quantidade_pneus || '-'}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setSelectedTireService(service); setIsTireServiceDetailModalOpen(true); }}>
                      <Eye className="h-4 w-4 mr-2" />Ver
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSelectedTireService(service); setIsTireServiceFormModalOpen(true); }}>
                      <Edit className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    {!isEmployeeMode && <DropdownMenuSeparator />}
                    {!isEmployeeMode && (
                      <DropdownMenuItem onClick={() => deleteTireService(service.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />Excluir
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {vehicleTireServices.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                Nenhum serviço registrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  const renderFinesTab = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setSelectedTrafficFine(null); setIsTrafficFineFormModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Multa
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[80px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicleTrafficFines.map((fine) => (
            <TableRow key={fine.id}>
              <TableCell>{format(new Date(fine.data_multa), 'dd/MM/yy', { locale: ptBR })}</TableCell>
              <TableCell>{fine.tipo_infracao}</TableCell>
              <TableCell>R$ {Number(fine.valor).toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant={fine.situacao === 'paga' ? 'default' : 'destructive'}>
                  {fine.situacao === 'paga' ? 'Paga' : 'Pendente'}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setSelectedTrafficFine(fine); setIsTrafficFineDetailModalOpen(true); }}>
                      <Eye className="h-4 w-4 mr-2" />Ver
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSelectedTrafficFine(fine); setIsTrafficFineFormModalOpen(true); }}>
                      <Edit className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    {!isEmployeeMode && <DropdownMenuSeparator />}
                    {!isEmployeeMode && (
                      <DropdownMenuItem onClick={() => deleteTrafficFine(fine.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />Excluir
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {vehicleTrafficFines.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                Nenhuma multa registrada
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  const renderDamageTab = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setSelectedDamageReport(null); setIsDamageReportModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Avaria
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Local</TableHead>
            <TableHead className="w-[80px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicleDamageReports.map((report) => (
            <TableRow key={report.id}>
              <TableCell>{format(new Date(report.data_avaria), 'dd/MM/yy', { locale: ptBR })}</TableCell>
              <TableCell className="max-w-[150px] truncate">{report.descricao_avaria}</TableCell>
              <TableCell>{report.local_ocorrencia || '-'}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setSelectedDamageReport(report); setIsDamageReportModalOpen(true); }}>
                      <Edit className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    {!isEmployeeMode && <DropdownMenuSeparator />}
                    {!isEmployeeMode && (
                      <DropdownMenuItem onClick={() => deleteDamageReport(report.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />Excluir
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {vehicleDamageReports.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                Nenhuma avaria registrada
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  const renderWashTab = () => {
    const limite = (vehicle as any).limite_lavagens_mensal ?? 4;
    const mesAtual = new Date().toISOString().slice(0, 7);
    const lavagensMes = vehicleWashRecords.filter(w => w.data_lavagem.slice(0, 7) === mesAtual).length;
    const limiteAtingido = lavagensMes >= limite;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {lavagensMes} / {limite} lavagens este mês
            </span>
            {limiteAtingido && (
              <span className="text-xs text-destructive font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Limite atingido
              </span>
            )}
          </div>
          <Button size="sm" onClick={() => { setSelectedWash(null); setIsWashFormModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Registrar Lavagem
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="w-[80px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicleWashRecords.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{format(new Date(record.data_lavagem), 'dd/MM/yy', { locale: ptBR })}</TableCell>
                <TableCell className="capitalize">{record.tipo_lavagem}</TableCell>
                <TableCell>{(record as any).fornecedor || record.responsavel_lavagem || '-'}</TableCell>
                <TableCell>{(record as any).valor ? `R$ ${Number((record as any).valor).toFixed(2)}` : '-'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setSelectedWash(record); setIsWashFormModalOpen(true); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => deleteWashRecord(record.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {vehicleWashRecords.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma lavagem registrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderFuelTab = () => {
    const tipoMedicao = ((vehicle as any).tipo_medicao || 'km') as 'km' | 'horimetro';
    const totalLitros = vehicleFuelLogs.reduce((sum, f) => sum + (f.litros || 0), 0);
    const totalGasto = vehicleFuelLogs.reduce((sum, f) => sum + (f.valor_total || 0), 0);

    return (
      <div className="space-y-4">
        {vehicleFuelLogs.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total Litros</p>
              <p className="text-lg font-bold">{totalLitros.toFixed(1)} L</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Total Gasto</p>
              <p className="text-lg font-bold">R$ {totalGasto.toFixed(2)}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setSelectedFuelLog(null); setIsFuelFormModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Registrar Abastecimento
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Combustível</TableHead>
              <TableHead>Litros</TableHead>
              <TableHead>R$/L</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>{tipoMedicao === 'km' ? 'KM' : 'Horímetro'}</TableHead>
              <TableHead className="w-[80px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicleFuelLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{format(new Date(log.data_abastecimento), 'dd/MM/yy', { locale: ptBR })}</TableCell>
                <TableCell className="capitalize">{log.tipo_combustivel || '-'}</TableCell>
                <TableCell>{log.litros?.toFixed(1)} L</TableCell>
                <TableCell>R$ {log.valor_litro?.toFixed(3)}</TableCell>
                <TableCell className="font-medium">R$ {(log.valor_total || 0).toFixed(2)}</TableCell>
                <TableCell>
                  {tipoMedicao === 'km'
                    ? (log.km_no_abastecimento ? `${log.km_no_abastecimento.toLocaleString()} km` : '-')
                    : (log.horimetro_no_abastecimento ? `${log.horimetro_no_abastecimento} h` : '-')
                  }
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setSelectedFuelLog(log); setIsFuelFormModalOpen(true); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => deleteFuelLog(log.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {vehicleFuelLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  Nenhum abastecimento registrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderCostCenterTab = () => {
    const mes = selectedCostMonth;
    const [year, month] = mes.split('-').map(Number);
    const mesLabel = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    const combustivelMes = vehicleFuelLogs
      .filter(f => f.data_abastecimento.slice(0, 7) === mes)
      .reduce((sum, f) => sum + (f.valor_total || 0), 0);

    const lavagensMes = vehicleWashRecords
      .filter(w => w.data_lavagem.slice(0, 7) === mes)
      .reduce((sum, w) => sum + ((w as any).valor || 0), 0);

    const manutencaoMes = vehicleMaintenanceRecords
      .filter(m => (m.data_realizada || m.data_agendada).slice(0, 7) === mes && m.status === 'concluida')
      .reduce((sum, m) => sum + ((m.custo as number) || 0), 0);

    const borrachariaMes = vehicleTireServices
      .filter(s => s.data_servico.slice(0, 7) === mes)
      .reduce((sum, s) => sum + ((s as any).valor_servico || 0), 0);

    const acessoriosMes = vehicleAccessories
      .filter(a => a.data_instalacao && a.data_instalacao.slice(0, 7) === mes)
      .reduce((sum, a) => sum + ((a as any).valor || 0), 0);

    const multasMes = vehicleTrafficFines
      .filter(f => f.data_multa.slice(0, 7) === mes)
      .reduce((sum, f) => sum + (f.valor || 0), 0);

    const aluguel = (vehicle as any).valor_aluguel_mensal || 0;
    const total = aluguel + combustivelMes + lavagensMes + manutencaoMes + borrachariaMes + acessoriosMes + multasMes;

    const itens = [
      { label: "Aluguel / Depreciação", valor: aluguel, icon: Car },
      { label: "Combustível", valor: combustivelMes, icon: Fuel },
      { label: "Lavagens", valor: lavagensMes, icon: Droplets },
      { label: "Manutenção", valor: manutencaoMes, icon: Wrench },
      { label: "Borracharia", valor: borrachariaMes, icon: Wrench },
      { label: "Acessórios", valor: acessoriosMes, icon: Car },
      { label: "Multas", valor: multasMes, icon: TrendingUp },
    ];

    const prevMonth = () => {
      const d = new Date(year, month - 2, 1);
      setSelectedCostMonth(d.toISOString().slice(0, 7));
    };
    const nextMonth = () => {
      const d = new Date(year, month, 1);
      if (d <= new Date()) setSelectedCostMonth(d.toISOString().slice(0, 7));
    };

    return (
      <div className="space-y-4">
        {/* Seletor de mês */}
        <div className="flex items-center justify-between">
          <button type="button" onClick={prevMonth}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
            ‹ Anterior
          </button>
          <span className="text-sm font-semibold capitalize">{mesLabel}</span>
          <button type="button" onClick={nextMonth}
            disabled={new Date(year, month, 1) > new Date()}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Próximo ›
          </button>
        </div>

        <div className="space-y-2">
          {itens.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-md border px-4 py-3">
              <div className="flex items-center gap-3">
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{item.label}</span>
              </div>
              <span className={`font-semibold ${item.valor === 0 ? 'text-muted-foreground' : ''}`}>
                R$ {item.valor.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-md bg-primary/5 border border-primary/20 px-4 py-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-semibold">Custo Total do Mês</span>
          </div>
          <span className="text-lg font-bold text-primary">R$ {total.toFixed(2)}</span>
        </div>

        <p className="text-xs text-muted-foreground italic">
          * O valor de aluguel/depreciação é fixo (cadastro do veículo). Os demais valores são somados pelos registros do mês selecionado.
        </p>
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              {vehicle.placa} - {vehicle.marca} {vehicle.modelo}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap gap-0.5 h-auto w-full">
              <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
              <TabsTrigger value="maintenance" className="text-xs">Manutenção</TabsTrigger>
              <TabsTrigger value="wash" className="text-xs">Lavagens</TabsTrigger>
              <TabsTrigger value="fuel" className="text-xs">Combustível</TabsTrigger>
              <TabsTrigger value="cost-center" className="text-xs">Custo/Mês</TabsTrigger>
              <TabsTrigger value="accessories" className="text-xs">Acessórios</TabsTrigger>
              <TabsTrigger value="damage" className="text-xs">Avarias</TabsTrigger>
              <TabsTrigger value="smoke-test" className="text-xs">Fumaça</TabsTrigger>
              <TabsTrigger value="checklist" className="text-xs">Checklist</TabsTrigger>
              <TabsTrigger value="tire-service" className="text-xs">Borracharia</TabsTrigger>
              <TabsTrigger value="fines" className="text-xs">Multas</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-4">{renderInfoTab()}</TabsContent>
            <TabsContent value="maintenance" className="mt-4">{renderMaintenanceTab()}</TabsContent>
            <TabsContent value="wash" className="mt-4">{renderWashTab()}</TabsContent>
            <TabsContent value="fuel" className="mt-4">{renderFuelTab()}</TabsContent>
            <TabsContent value="cost-center" className="mt-4">{renderCostCenterTab()}</TabsContent>
            <TabsContent value="accessories" className="mt-4">{renderAccessoriesTab()}</TabsContent>
            <TabsContent value="damage" className="mt-4">{renderDamageTab()}</TabsContent>
            <TabsContent value="smoke-test" className="mt-4">{renderSmokeTestTab()}</TabsContent>
            <TabsContent value="checklist" className="mt-4">{renderChecklistTab()}</TabsContent>
            <TabsContent value="tire-service" className="mt-4">{renderTireServiceTab()}</TabsContent>
            <TabsContent value="fines" className="mt-4">{renderFinesTab()}</TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Sub-modals */}
      <MaintenanceFormModal
        isOpen={isMaintenanceModalOpen}
        onClose={() => setIsMaintenanceModalOpen(false)}
        maintenance={selectedMaintenance}
        vehicleId={vehicle.id}
      />
      <MaintenanceDetailModal
        isOpen={isMaintenanceDetailModalOpen}
        onClose={() => setIsMaintenanceDetailModalOpen(false)}
        maintenance={selectedMaintenance}
        employees={employees}
      />
      <VehicleAccessoryFormModal
        isOpen={isAccessoryFormModalOpen}
        onClose={() => setIsAccessoryFormModalOpen(false)}
        accessory={selectedAccessory}
        vehicleId={vehicle.id}
      />
      <VehicleAccessoryDetailModal
        isOpen={isAccessoryDetailModalOpen}
        onClose={() => setIsAccessoryDetailModalOpen(false)}
        accessory={selectedAccessory}
      />
      <SmokeTestFormModal
        isOpen={isSmokeTestFormModalOpen}
        onClose={() => setIsSmokeTestFormModalOpen(false)}
        test={selectedSmokeTest}
        vehicleId={vehicle.id}
      />
      <SmokeTestDetailModal
        isOpen={isSmokeTestDetailModalOpen}
        onClose={() => setIsSmokeTestDetailModalOpen(false)}
        smokeTest={selectedSmokeTest}
      />
      <TireServiceFormModal
        isOpen={isTireServiceFormModalOpen}
        onClose={() => setIsTireServiceFormModalOpen(false)}
        service={selectedTireService}
        vehicleId={vehicle.id}
      />
      <TireServiceDetailModal
        isOpen={isTireServiceDetailModalOpen}
        onClose={() => setIsTireServiceDetailModalOpen(false)}
        tireService={selectedTireService}
      />
      <DamageReportModal
        isOpen={isDamageReportModalOpen}
        onClose={() => setIsDamageReportModalOpen(false)}
        damageReport={selectedDamageReport}
        vehicleId={vehicle.id}
      />
      <TrafficFineFormModal
        isOpen={isTrafficFineFormModalOpen}
        onClose={() => setIsTrafficFineFormModalOpen(false)}
        fine={selectedTrafficFine}
        vehicleId={vehicle.id}
      />
      <TrafficFineDetailModal
        isOpen={isTrafficFineDetailModalOpen}
        onClose={() => setIsTrafficFineDetailModalOpen(false)}
        trafficFine={selectedTrafficFine}
      />
      <InspectionChecklistFormModal
        isOpen={isChecklistFormModalOpen}
        onClose={() => setIsChecklistFormModalOpen(false)}
        checklist={selectedChecklist}
        vehicleId={vehicle.id}
      />
      <InspectionChecklistDetailModal
        isOpen={isChecklistDetailModalOpen}
        onClose={() => setIsChecklistDetailModalOpen(false)}
        checklist={selectedChecklist}
      />

      <WashRecordFormModal
        open={isWashFormModalOpen}
        onOpenChange={setIsWashFormModalOpen}
        vehicleId={vehicle.id}
        washRecord={selectedWash}
        onSubmit={async (data) => {
          if (selectedWash) {
            await updateWashRecord(selectedWash.id, data);
          } else {
            await createWashRecord(data);
          }
        }}
      />

      <FuelLogFormModal
        open={isFuelFormModalOpen}
        onOpenChange={setIsFuelFormModalOpen}
        vehicleId={vehicle.id}
        tipoMedicao={((vehicle as any).tipo_medicao || 'km') as 'km' | 'horimetro'}
        fuelLog={selectedFuelLog}
        onSubmit={async (data) => {
          if (selectedFuelLog) {
            await updateFuelLog(selectedFuelLog.id, data);
          } else {
            await createFuelLog(data);
          }
        }}
      />
    </>
  );
}

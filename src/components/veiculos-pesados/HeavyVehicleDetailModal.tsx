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
  Truck, MapPin, User, Building, Wrench, Package, TestTube, ClipboardCheck,
  CircleDot, CircleDollarSign, AlertTriangle, Plus, MoreHorizontal,
  Edit, Eye, Trash2, Droplets, Fuel, TrendingUp, Timer
} from "lucide-react";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useVehicleAccessories } from "@/hooks/useVehicleAccessories";
import { useSmokeTests } from "@/hooks/useSmokeTests";
import { useTireServices } from "@/hooks/useTireServices";
import { useDamageReports } from "@/hooks/useDamageReports";
import { useTrafficFines } from "@/hooks/useTrafficFines";
import { useHeavyVehicleInspections } from "@/hooks/useHeavyVehicleInspections";
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
import { HeavyVehicleInspectionFormModal } from "@/components/veiculos-pesados/HeavyVehicleInspectionFormModal";
import { HeavyVehicleInspectionDetailModal } from "@/components/veiculos-pesados/HeavyVehicleInspectionDetailModal";
import {
  getVehicleStatusSoftClass,
  getVehicleStatusText,
  getPropertyTypeText,
  getMaintenanceStatusColor,
  getMaintenanceStatusText,
} from "@/lib/statusHelpers";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];

interface HeavyVehicleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  employees?: any[];
  rentalCompanies?: any[];
}

export function HeavyVehicleDetailModal({ 
  isOpen, 
  onClose, 
  vehicle, 
  employees: propEmployees = [], 
  rentalCompanies = [] 
}: HeavyVehicleDetailModalProps) {
  const [activeTab, setActiveTab] = useState("info");
  
  // Data hooks
  const { maintenanceRecords, deleteMaintenanceRecord } = useMaintenance();
  const { accessories, deleteAccessory } = useVehicleAccessories();
  const { smokeTests, deleteSmokeTest } = useSmokeTests();
  const { tireServices, deleteTireService } = useTireServices();
  const { damageReports, deleteDamageReport } = useDamageReports();
  const { trafficFines, deleteTrafficFine } = useTrafficFines();
  const { inspections, deleteInspection } = useHeavyVehicleInspections();
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
  
  const vehicleInspections = useMemo(() =>
    inspections.filter(i => i.vehicle_id === vehicle?.id),
    [inspections, vehicle?.id]
  );

  const vehicleWashRecords = useMemo(() =>
    washRecords.filter(w => w.vehicle_id === vehicle?.id),
    [washRecords, vehicle?.id]
  );

  const vehicleFuelLogs = useMemo(() =>
    fuelLogs.filter(f => f.vehicle_id === vehicle?.id),
    [fuelLogs, vehicle?.id]
  );

  useEffect(() => {
    if (isOpen && vehicle) {
      setActiveTab("info");
    }
  }, [vehicle?.id, isOpen]);

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
            <Truck className="h-4 w-4" />
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
          <div className="grid grid-cols-2 gap-4">
            {(vehicle as any).tipo_medicao === 'horimetro' ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3 w-3" /> Horímetro Atual
                  </label>
                  <p className="text-2xl font-bold">{((vehicle as any).horimetro_atual ?? 0).toLocaleString()} h</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Limite / Mês</label>
                  <p className="text-lg">{((vehicle as any).limite_horimetro_mensal ?? 250).toLocaleString()} h</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Quilometragem Atual</label>
                  <p className="text-2xl font-bold">{(vehicle.quilometragem_atual ?? 0).toLocaleString()} km</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Limite KM / Mês</label>
                  <p className="text-lg">{(vehicle.quilometragem_maxima_mensal ?? 0).toLocaleString()} km</p>
                </div>
              </>
            )}
          </div>
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

  const renderMaintenanceTab = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setSelectedMaintenance(null); setIsMaintenanceModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Manutenção
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="w-[80px]">Ações</TableHead>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setSelectedAccessory(accessory); setIsAccessoryDetailModalOpen(true); }}>
                      <Eye className="h-4 w-4 mr-2" />Ver
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSelectedAccessory(accessory); setIsAccessoryFormModalOpen(true); }}>
                      <Edit className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteAccessory(accessory.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setSelectedSmokeTest(test); setIsSmokeTestDetailModalOpen(true); }}>
                      <Eye className="h-4 w-4 mr-2" />Ver
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSelectedSmokeTest(test); setIsSmokeTestFormModalOpen(true); }}>
                      <Edit className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteSmokeTest(test.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
          Nova Inspeção
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Inspetor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[80px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicleInspections.map((inspection) => (
            <TableRow key={inspection.id}>
              <TableCell>{format(new Date(inspection.data_inspecao), 'dd/MM/yy', { locale: ptBR })}</TableCell>
              <TableCell>{inspection.inspetor_nome}</TableCell>
              <TableCell>
                <Badge variant={inspection.status_geral === 'aprovado' ? 'default' : inspection.status_geral === 'reprovado' ? 'destructive' : 'secondary'}>
                  {inspection.status_geral}
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
                    <DropdownMenuItem onClick={() => { setSelectedChecklist(inspection); setIsChecklistDetailModalOpen(true); }}>
                      <Eye className="h-4 w-4 mr-2" />Ver
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSelectedChecklist(inspection); setIsChecklistFormModalOpen(true); }}>
                      <Edit className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteInspection(inspection.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {vehicleInspections.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                Nenhuma inspeção registrada
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteTireService(service.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />Excluir
                    </DropdownMenuItem>
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteTrafficFine(fine.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />Excluir
                    </DropdownMenuItem>
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteDamageReport(report.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />Excluir
                    </DropdownMenuItem>
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

  // ---- Lavagens ----
  const renderWashTab = () => {
    const limite = (vehicle as any).limite_lavagens_mensal ?? 4;
    const mesAtual = new Date().toISOString().slice(0, 7);
    const lavagensMes = vehicleWashRecords.filter(w => w.data_lavagem.slice(0, 7) === mesAtual).length;
    const limiteAtingido = lavagensMes >= limite;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {lavagensMes} / {limite} lavagens este mês
            {limiteAtingido && <span className="ml-2 text-destructive font-medium">⚠ Limite atingido</span>}
          </span>
          <Button size="sm" onClick={() => { setSelectedWash(null); setIsWashFormModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Registrar Lavagem
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
                  <div className="flex gap-1">
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

  // ---- Combustível ----
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
            <Plus className="h-4 w-4 mr-1" />Registrar Abastecimento
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
                  <div className="flex gap-1">
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

  // ---- Centro de Custo ----
  const renderCostCenterTab = () => {
    const now = new Date();
    const mesAtual = now.toISOString().slice(0, 7);
    const combustivelMes = vehicleFuelLogs.filter(f => f.data_abastecimento.slice(0, 7) === mesAtual)
      .reduce((sum, f) => sum + (f.valor_total || 0), 0);
    const lavagensMes = vehicleWashRecords.filter(w => w.data_lavagem.slice(0, 7) === mesAtual)
      .reduce((sum, w) => sum + ((w as any).valor || 0), 0);
    const manutencaoMes = vehicleMaintenanceRecords.filter(m => m.data_agendada.slice(0, 7) === mesAtual && m.status === 'concluida')
      .reduce((sum, m) => sum + ((m.custo as number) || 0), 0);
    const aluguel = (vehicle as any).valor_aluguel_mensal || 0;
    const total = combustivelMes + lavagensMes + manutencaoMes + aluguel;
    const itens = [
      { label: "Aluguel / Depreciação", valor: aluguel, Icon: Truck },
      { label: "Combustível (mês atual)", valor: combustivelMes, Icon: Fuel },
      { label: "Lavagens (mês atual)", valor: lavagensMes, Icon: Droplets },
      { label: "Manutenção (mês atual)", valor: manutencaoMes, Icon: Wrench },
    ];
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Custos do mês: <strong>{now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
        </p>
        <div className="space-y-2">
          {itens.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-md border px-4 py-3">
              <div className="flex items-center gap-3">
                <item.Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{item.label}</span>
              </div>
              <span className="font-semibold">R$ {item.valor.toFixed(2)}</span>
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
          * Para equipamentos próprios, inclua um valor de depreciação/custo operacional no cadastro.
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
              <Truck className="h-5 w-5" />
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
              <TabsTrigger value="checklist" className="text-xs">Inspeção</TabsTrigger>
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
      <HeavyVehicleInspectionFormModal
        isOpen={isChecklistFormModalOpen}
        onClose={() => setIsChecklistFormModalOpen(false)}
        inspection={selectedChecklist}
        vehicleId={vehicle.id}
      />
      <HeavyVehicleInspectionDetailModal
        isOpen={isChecklistDetailModalOpen}
        onClose={() => setIsChecklistDetailModalOpen(false)}
        inspection={selectedChecklist}
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

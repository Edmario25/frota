import React, { useState, useEffect } from "react";
import { Truck, Plus, Eye, Edit, Trash2, Search, Filter, QrCode, Wrench, LogOut, ArrowLeftRight } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useRentalCompanies } from "@/hooks/useRentalCompanies";
import { useHeavyVehicleInspections } from "@/hooks/useHeavyVehicleInspections";
import { HeavyVehicleFormModal } from "@/components/veiculos-pesados/HeavyVehicleFormModal";
import { ConfirmDeleteModal } from "@/components/veiculos-pesados/ConfirmDeleteModal";
import { HeavyVehicleDetailModal } from "@/components/veiculos-pesados/HeavyVehicleDetailModal";
import { QrCodeVeiculoDialog } from "@/components/frota/QrCodeVeiculoDialog";
import { AvariaRapidaDialog } from "@/components/frota/AvariaRapidaDialog";
import { DevolverVeiculoModal } from "@/components/frota/DevolverVeiculoModal";
import { TransferirVeiculoModal } from "@/components/frota/TransferirVeiculoModal";
import { useVehicleLiberacao } from "@/hooks/useVehicleLiberacao";
import { getVehicleStatusColor, getVehicleStatusText } from "@/lib/statusHelpers";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];

export const VeiculosPesados: React.FC = () => {
  const { vehicles, createVehicle, updateVehicle, deleteVehicle, refetchVehicles } = useVehicles();
  const { employees } = useEmployees();
  const { rentalCompanies } = useRentalCompanies();
  const { inspections } = useHeavyVehicleInspections();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isVehicleFormModalOpen, setIsVehicleFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrVehicle, setQrVehicle] = useState<Vehicle | null>(null);
  const [isAvariaOpen, setIsAvariaOpen] = useState(false);
  const [avariaVehicle, setAvariaVehicle] = useState<Vehicle | null>(null);
  const [isDevolverOpen, setIsDevolverOpen] = useState(false);
  const [devolverVehicle, setDevolverVehicle] = useState<Vehicle | null>(null);
  const [isTransferirOpen, setIsTransferirOpen] = useState(false);
  const [transferirVehicle, setTransferirVehicle] = useState<Vehicle | null>(null);
  
  const [stats, setStats] = useState({
    disponivel: 0,
    em_uso: 0,
    manutencao: 0,
    total_inspecoes: 0,
  });

  const loadStats = () => {
    const heavyVehicles = vehicles.filter(vehicle => vehicle.tipo === 'pesado');
    const newStats = {
      disponivel: heavyVehicles.filter(v => v.status === 'disponivel').length,
      em_uso: heavyVehicles.filter(v => v.status === 'em_uso').length,
      manutencao: heavyVehicles.filter(v => v.status === 'manutencao').length,
      total_inspecoes: inspections.length,
    };
    setStats(newStats);
  };

  useEffect(() => {
    if (vehicles.length > 0) {
      loadStats();
    }
  }, [vehicles, inspections]);

  // Filter heavy vehicles
  const heavyVehicles = vehicles.filter(vehicle => vehicle.tipo === 'pesado');

  // Batch liberation status — one query for all heavy vehicles
  const { liberacaoMap } = useVehicleLiberacao(heavyVehicles.map(v => v.id));

  const filteredVehicles = heavyVehicles.filter(vehicle =>
    vehicle.placa.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.marca.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVehicleSubmit = async (vehicleData: any) => {
    if (selectedVehicle) {
      await updateVehicle(selectedVehicle.id, vehicleData);
    } else {
      await createVehicle(vehicleData);
    }
  };

  const handleDeleteVehicle = async () => {
    if (selectedVehicle) {
      await deleteVehicle(selectedVehicle.id);
      setIsDeleteModalOpen(false);
      setSelectedVehicle(null);
    }
  };

  const openDetailModal = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsDetailModalOpen(true);
  };

  const openEditModal = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsVehicleFormModalOpen(true);
  };

  const openDeleteModal = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsDeleteModalOpen(true);
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedVehicle(null);
  };

  const closeFormModal = () => {
    setIsVehicleFormModalOpen(false);
    setSelectedVehicle(null);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight">Veículos Pesados</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gerencie sua frota de veículos pesados</p>
          </div>
          <Button size="sm" onClick={() => { setSelectedVehicle(null); setIsVehicleFormModalOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Novo Veículo
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            { label: "Disponíveis",  value: stats.disponivel,     color: "text-emerald-600" },
            { label: "Em Uso",       value: stats.em_uso,         color: "text-primary" },
            { label: "Manutenção",   value: stats.manutencao,     color: "text-amber-600" },
            { label: "Inspeções",    value: stats.total_inspecoes, color: "text-muted-foreground" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por placa, modelo ou marca..."
              className="pl-8 h-8 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            Filtros
          </Button>
        </div>

        {/* Table */}
        <Card className="shadow-medium">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Veículo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Liberação</TableHead>
                <TableHead>Medição</TableHead>
                <TableHead className="w-[110px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVehicles.map((vehicle) => (
                <TableRow key={vehicle.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetailModal(vehicle)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <div className="font-medium">{vehicle.placa}</div>
                        <div className="text-sm text-muted-foreground">
                          {vehicle.marca} {vehicle.modelo} ({vehicle.ano})
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {vehicle.responsavel_id
                      ? (employees.find(e => e.id === vehicle.responsavel_id)?.nome ?? "Atribuído")
                      : <span className="text-muted-foreground text-sm italic">Sem responsável</span>
                    }
                  </TableCell>
                  <TableCell>
                    <Badge className={getVehicleStatusColor(vehicle.status || 'disponivel')}>
                      {getVehicleStatusText(vehicle.status || 'disponivel')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {vehicle.status === "manutencao" ? (
                      <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none bg-amber-100 text-amber-800 border border-amber-300">
                        🔧 Em manutenção
                      </span>
                    ) : vehicle.status === "inativo" ? (
                      <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none bg-gray-100 text-gray-600 border border-gray-300">
                        ⛔ Inativo
                      </span>
                    ) : (() => {
                      const lib = liberacaoMap[vehicle.id]
                      if (!lib) return <span className="text-muted-foreground text-xs">—</span>
                      const cfg: Record<string, { label: string; cls: string }> = {
                        liberado:  { label: "✅ Liberado",           cls: "bg-green-100 text-green-800 border border-green-300" },
                        bloqueado: { label: "🚫 Bloqueado",          cls: "bg-red-100 text-red-800 border border-red-300" },
                        vencido:   { label: "⚠️ Lib. vencida",       cls: "bg-amber-100 text-amber-800 border border-amber-300" },
                        aguardando:{ label: "⏳ Aguardando",          cls: "bg-orange-100 text-orange-800 border border-orange-300" },
                      }
                      const c = cfg[lib.status]
                      return (
                        <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${c.cls}`}>
                          {c.label}
                        </span>
                      )
                    })()}
                  </TableCell>
                  <TableCell>
                    {(vehicle as any).tipo_medicao === 'horimetro'
                      ? <span>{((vehicle as any).horimetro_atual ?? 0).toLocaleString()} h</span>
                      : <span>{(vehicle.quilometragem_atual ?? 0).toLocaleString()} km</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDetailModal(vehicle); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-green-700 hover:text-green-800 hover:bg-green-50" title="Gerar QR Code SMS" onClick={(e) => { e.stopPropagation(); setQrVehicle(vehicle); setIsQrModalOpen(true); }}>
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className={`h-8 w-8 ${vehicle.status === "manutencao" ? "text-amber-600 bg-amber-50" : "text-amber-500 hover:text-amber-700 hover:bg-amber-50"}`}
                        title={vehicle.status === "manutencao" ? "Retornar ao serviço" : "Reportar avaria"}
                        onClick={(e) => { e.stopPropagation(); setAvariaVehicle(vehicle); setIsAvariaOpen(true); }}
                      >
                        <Wrench className="h-4 w-4" />
                      </Button>
                      {/* Devolver (apenas veículos alugados) */}
                      {vehicle.tipo_propriedade === "alugado" && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                          title="Devolver veículo"
                          onClick={(e) => { e.stopPropagation(); setDevolverVehicle(vehicle); setIsDevolverOpen(true); }}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Transferir (apenas veículos próprios) */}
                      {vehicle.tipo_propriedade === "proprio" && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          title="Transferir para outra obra"
                          onClick={(e) => { e.stopPropagation(); setTransferirVehicle(vehicle); setIsTransferirOpen(true); }}
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEditModal(vehicle); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); openDeleteModal(vehicle); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredVehicles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="text-muted-foreground">
                      {searchTerm ? 'Nenhum veículo encontrado para a busca.' : 'Nenhum veículo pesado cadastrado.'}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Modals */}
      <HeavyVehicleFormModal 
        open={isVehicleFormModalOpen}
        onOpenChange={closeFormModal}
        vehicle={selectedVehicle || undefined}
        onSubmit={handleVehicleSubmit}
        employees={employees}
      />
      
      <HeavyVehicleDetailModal
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        vehicle={selectedVehicle}
        employees={employees}
        rentalCompanies={rentalCompanies}
      />
      
      <ConfirmDeleteModal
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        vehicle={selectedVehicle}
        onConfirm={handleDeleteVehicle}
      />

      {qrVehicle && (
        <QrCodeVeiculoDialog
          vehicle={qrVehicle}
          open={isQrModalOpen}
          onOpenChange={(open) => { setIsQrModalOpen(open); if (!open) setQrVehicle(null); }}
        />
      )}

      <AvariaRapidaDialog
        open={isAvariaOpen}
        onOpenChange={(open) => { setIsAvariaOpen(open); if (!open) setAvariaVehicle(null); }}
        vehicle={avariaVehicle}
        onStatusChanged={refetchVehicles}
      />

      <DevolverVeiculoModal
        open={isDevolverOpen}
        onOpenChange={(open) => { setIsDevolverOpen(open); if (!open) setDevolverVehicle(null); }}
        vehicle={devolverVehicle}
        onSuccess={refetchVehicles}
      />

      <TransferirVeiculoModal
        open={isTransferirOpen}
        onOpenChange={(open) => { setIsTransferirOpen(open); if (!open) setTransferirVehicle(null); }}
        vehicle={transferirVehicle}
        onSuccess={refetchVehicles}
      />
    </Layout>
  );
};

export default VeiculosPesados;

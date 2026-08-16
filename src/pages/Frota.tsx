import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Layout } from "@/components/layout/Layout";
import { TraccarSyncPanel } from "@/components/frota/TraccarSyncPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Filter, Edit, Trash2, Eye, Download, QrCode } from "lucide-react";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEmployees } from "@/hooks/useEmployees";
import { useRentalCompanies } from "@/hooks/useRentalCompanies";
import { RentalCompanyFormModal } from "@/components/frota/RentalCompanyFormModal";
import { useVehicles } from "@/hooks/useVehicles";
import { VehicleFormModal } from "@/components/frota/VehicleFormModal";
import { ConfirmDeleteModal } from "@/components/frota/ConfirmDeleteModal";
import { VehicleDetailModal } from "@/components/frota/VehicleDetailModal";
import { QrCodeVeiculoDialog } from "@/components/frota/QrCodeVeiculoDialog";
import { VehicleKmCell } from "@/components/frota/VehicleKmCell";
import { useKmCyclesBatch } from "@/hooks/useVehicleKmCycles";
import { getVehicleStatusColor, getVehicleStatusText } from "@/lib/statusHelpers";
import { downloadCsv } from "@/lib/exportCsv";
import { useVehicleLiberacao } from "@/hooks/useVehicleLiberacao";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];

const Frota = () => {
  const { vehicles, loading, createVehicle, updateVehicle, deleteVehicle, getVehicleStats, refetchVehicles } = useVehicles();
  const { employees } = useEmployees();
  const { rentalCompanies, createRentalCompany } = useRentalCompanies();

  const [searchTerm, setSearchTerm] = useState("");
  
  // Vehicle modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRentalCompanyModalOpen, setIsRentalCompanyModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrVehicle, setQrVehicle] = useState<Vehicle | null>(null);

  const [stats, setStats] = useState({
    disponivel: 0,
    em_uso: 0,
    manutencao: 0,
    alertas_km: 0,
  });

  const loadStats = async () => {
    const newStats = await getVehicleStats('leve');
    setStats(newStats);
  };

  useEffect(() => {
    if (vehicles.length > 0) {
      loadStats();
    }
  }, [vehicles]);

  // Filter light vehicles only
  const lightVehicles = vehicles.filter(vehicle => vehicle.tipo !== 'pesado');

  // Single batch query for all light vehicle km cycles (replaces N individual RPC calls)
  const kmCyclesMap = useKmCyclesBatch(lightVehicles.map(v => v.id));

  // Batch liberation status — one query for all light vehicles
  const { liberacaoMap } = useVehicleLiberacao(lightVehicles.map(v => v.id));

  const filteredVehicles = lightVehicles.filter(vehicle =>
    vehicle.placa.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.marca.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Vehicle handlers
  const handleCreateVehicle = async (data: any) => {
    await createVehicle(data);
  };

  const handleUpdateVehicle = async (data: any) => {
    if (selectedVehicle) {
      await updateVehicle(selectedVehicle.id, data);
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
    setIsFormModalOpen(true);
  };

  const openDeleteModal = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsDeleteModalOpen(true);
  };

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    setSelectedVehicle(null);
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedVehicle(null);
  };

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight">Veículos Leves</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gerencie sua frota de veículos leves</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsRentalCompanyModalOpen(true)}>
              Gerenciar Locadoras
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const headers = ['Placa', 'Marca', 'Modelo', 'Ano', 'Tipo', 'Cor', 'Status', 'Responsável', 'Km Atual', 'Limite Km/Mês', 'Km Rodados', '% Utilizado', 'Dias Restantes'];
                const rows = filteredVehicles.map(v => {
                  const cycle = kmCyclesMap[v.id];
                  const responsavel = employees.find(e => e.id === v.responsavel_id)?.nome ?? '';
                  return [
                    v.placa,
                    v.marca,
                    v.modelo,
                    v.ano,
                    v.tipo === 'leve' ? 'Leve' : 'Pesado',
                    v.cor ?? '',
                    getVehicleStatusText(v.status ?? 'disponivel'),
                    responsavel,
                    v.quilometragem_atual ?? '',
                    v.quilometragem_maxima_mensal ?? '',
                    cycle?.km_rodados ?? '',
                    cycle ? `${cycle.percentage_used}%` : '',
                    cycle?.days_remaining ?? '',
                  ];
                });
                downloadCsv(headers, rows, `veiculos_${new Date().toISOString().slice(0, 10)}`);
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Exportar CSV
            </Button>
            <Button size="sm" onClick={() => setIsFormModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Novo Veículo
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            { label: "Disponíveis", value: stats.disponivel, color: "text-emerald-600" },
            { label: "Em Uso", value: stats.em_uso, color: "text-primary" },
            { label: "Manutenção", value: stats.manutencao, color: "text-amber-600" },
            { label: "Alertas KM", value: stats.alertas_km, color: "text-destructive" },
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
                <TableHead>Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Km Mensal</TableHead>
                <TableHead>Km Total</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVehicles.map((vehicle) => (
                <TableRow key={vehicle.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetailModal(vehicle)}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{vehicle.placa}</div>
                      <div className="text-sm text-muted-foreground">
                        {vehicle.marca} {vehicle.modelo} ({vehicle.ano})
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {vehicle.tipo === 'leve' ? 'Leve' : 'Pesado'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {vehicle.responsavel_id
                      ? (employees.find(e => e.id === vehicle.responsavel_id)?.nome ?? "Atribuído")
                      : <span className="text-muted-foreground text-sm italic">Sem responsável</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge className={getVehicleStatusColor(vehicle.status || 'disponivel')}>
                        {getVehicleStatusText(vehicle.status || 'disponivel')}
                      </Badge>
                      {(() => {
                        const lib = liberacaoMap[vehicle.id]
                        if (!lib) return null
                        const cfg: Record<string, { label: string; cls: string }> = {
                          liberado:  { label: "✅ Liberado",             cls: "bg-green-100 text-green-800 border border-green-300" },
                          bloqueado: { label: "🚫 Bloqueado",            cls: "bg-red-100 text-red-800 border border-red-300" },
                          vencido:   { label: "⚠️ Liberação vencida",    cls: "bg-amber-100 text-amber-800 border border-amber-300" },
                          aguardando:{ label: "⏳ Aguardando liberação",  cls: "bg-orange-100 text-orange-800 border border-orange-300" },
                        }
                        const c = cfg[lib.status]
                        return (
                          <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${c.cls}`}>
                            {c.label}
                          </span>
                        )
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <VehicleKmCell
                      type="mensal"
                      quilometragem_maxima_mensal={vehicle.quilometragem_maxima_mensal ?? 0}
                      cycleInfo={kmCyclesMap[vehicle.id]}
                    />
                  </TableCell>
                  <TableCell>
                    <VehicleKmCell
                      type="total"
                      quilometragem_atual={vehicle.quilometragem_atual ?? 0}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDetailModal(vehicle); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-green-700 hover:text-green-800 hover:bg-green-50" title="Gerar QR Code SMS" onClick={(e) => { e.stopPropagation(); setQrVehicle(vehicle); setIsQrModalOpen(true); }}>
                        <QrCode className="h-4 w-4" />
                      </Button>
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
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-muted-foreground">
                      {searchTerm ? 'Nenhum veículo encontrado para a busca.' : 'Nenhum veículo cadastrado.'}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Modals */}
      <VehicleFormModal 
        open={isFormModalOpen}
        onOpenChange={closeFormModal}
        vehicle={selectedVehicle || undefined}
        onSubmit={selectedVehicle ? handleUpdateVehicle : handleCreateVehicle}
        employees={employees}
      />
      
      <RentalCompanyFormModal
        open={isRentalCompanyModalOpen}
        onOpenChange={setIsRentalCompanyModalOpen}
        onSubmit={async (data) => {
          await createRentalCompany(data);
        }}
      />
      
      <VehicleDetailModal
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

      <QrCodeVeiculoDialog
        vehicle={qrVehicle}
        open={isQrModalOpen}
        onOpenChange={(open) => { setIsQrModalOpen(open); if (!open) setQrVehicle(null); }}
      />

      {/* Painel GPS / Traccar */}
      <TraccarSyncPanel
        onKmUpdate={(vehicleId, newKm) => {
          // Atualiza o modal se o veículo sincronizado estiver aberto
          setSelectedVehicle(prev =>
            prev?.id === vehicleId
              ? { ...prev, quilometragem_atual: newKm }
              : prev
          );
          // Recarrega a lista de veículos
          refetchVehicles();
        }}
      />
    </Layout>
  );
};

export default Frota;

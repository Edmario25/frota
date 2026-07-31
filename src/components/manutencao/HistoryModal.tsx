import React, { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWashRecords } from "@/hooks/useWashRecords";
import { useDamageReports } from "@/hooks/useDamageReports";
import { useVehicles } from "@/hooks/useVehicles";
import { DetailModal } from "./DetailModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Droplets, AlertTriangle, Calendar, User, FileText, Eye } from "lucide-react";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal = ({ isOpen, onClose }: HistoryModalProps) => {
  const { washRecords, loading: washLoading, refetchWashRecords } = useWashRecords();
  const { damageReports, loading: damageLoading, refetchDamageReports } = useDamageReports();
  const { vehicles } = useVehicles();
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<'wash' | 'damage'>('wash');

  // Removi o useEffect que causava loop infinito
  // Os dados são carregados automaticamente pelos hooks

  const openDetailModal = useCallback((item: any, type: 'wash' | 'damage') => {
    setSelectedItem(item);
    setSelectedType(type);
    setDetailModalOpen(true);
  }, []);

  const getVehiclePlate = useCallback((vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.placa || 'N/A';
  }, [vehicles]);

  const getVehicleModel = useCallback((vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.marca} ${vehicle.modelo}` : 'N/A';
  }, [vehicles]);

  const renderWashHistory = () => (
    <div className="space-y-4">
      {washLoading ? (
        <p>Carregando registros de lavagem...</p>
      ) : washRecords.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum registro de lavagem encontrado.
        </p>
      ) : (
        washRecords.map((record) => (
          <Card key={record.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900">
                    <Droplets className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{getVehiclePlate(record.vehicle_id)}</CardTitle>
                    <CardDescription>{getVehicleModel(record.vehicle_id)}</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {record.tipo_lavagem === 'completa' ? 'Completa' :
                   record.tipo_lavagem === 'interna' ? 'Interna' : 'Externa'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Data: {format(new Date(record.data_lavagem), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
                {record.responsavel_lavagem && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>Responsável: {record.responsavel_lavagem}</span>
                  </div>
                )}
              </div>
              {record.observacoes && (
                <div className="pt-2 border-t">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Observações:</p>
                      <p className="text-sm text-muted-foreground">{record.observacoes}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {record.foto_antes_url && (
                  <Badge variant="secondary">Foto Antes</Badge>
                )}
                {record.foto_depois_url && (
                  <Badge variant="secondary">Foto Depois</Badge>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => openDetailModal(record, 'wash')}
                  className="ml-auto"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Detalhes
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  const renderDamageHistory = () => (
    <div className="space-y-4">
      {damageLoading ? (
        <p>Carregando relatórios de avaria...</p>
      ) : damageReports.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum relatório de avaria encontrado.
        </p>
      ) : (
        damageReports.map((report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-300" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{getVehiclePlate(report.vehicle_id)}</CardTitle>
                    <CardDescription>{getVehicleModel(report.vehicle_id)}</CardDescription>
                  </div>
                </div>
                <Badge variant="destructive">
                  Avaria
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Data da Avaria: {format(new Date(report.data_avaria), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
                {report.local_ocorrencia && (
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-fit">Local:</span>
                    <span>{report.local_ocorrencia}</span>
                  </div>
                )}
                {report.responsavel_registro && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>Registrado por: {report.responsavel_registro}</span>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Descrição da Avaria:</p>
                    <p className="text-sm text-muted-foreground">{report.descricao_avaria}</p>
                  </div>
                </div>
              </div>
              {report.foto_url && (
                <div className="pt-2">
                  <Badge variant="secondary">Foto da Avaria</Badge>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => openDetailModal(report, 'damage')}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Detalhes
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  const combinedHistory = useMemo(() => {
    return [
      ...washRecords.map(record => ({
        ...record,
        type: 'wash' as const,
        date: record.data_lavagem,
      })),
      ...damageReports.map(report => ({
        ...report,
        type: 'damage' as const,
        date: report.data_avaria,
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [washRecords, damageReports]);

  const renderCombinedHistory = () => (
    <div className="space-y-4">
      {washLoading || damageLoading ? (
        <p>Carregando histórico...</p>
      ) : combinedHistory.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum registro encontrado.
        </p>
      ) : (
        combinedHistory.map((record) => (
          <Card key={`${record.type}-${record.id}`} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    record.type === 'wash' 
                      ? 'bg-blue-100 dark:bg-blue-900' 
                      : 'bg-red-100 dark:bg-red-900'
                  }`}>
                    {record.type === 'wash' ? (
                      <Droplets className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-300" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{getVehiclePlate(record.vehicle_id)}</CardTitle>
                    <CardDescription>{getVehicleModel(record.vehicle_id)}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={record.type === 'wash' ? 'outline' : 'destructive'}>
                    {record.type === 'wash' ? 'Lavagem' : 'Avaria'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(record.date), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
                  {record.type === 'wash' ? (
                    <div className="space-y-2">
                      <p className="text-sm">
                        <span className="font-medium">Tipo:</span> {
                          (record as any).tipo_lavagem === 'completa' ? 'Completa' :
                          (record as any).tipo_lavagem === 'interna' ? 'Interna' : 'Externa'
                        }
                      </p>
                      {(record as any).observacoes && (
                        <p className="text-sm text-muted-foreground">{(record as any).observacoes}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm">
                        <span className="font-medium">Descrição:</span> {(record as any).descricao_avaria}
                      </p>
                      {(record as any).local_ocorrencia && (
                        <p className="text-sm">
                          <span className="font-medium">Local:</span> {(record as any).local_ocorrencia}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openDetailModal(record, record.type)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Detalhes
                    </Button>
                  </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Histórico de Manutenção</DialogTitle>
          <DialogDescription>
            Visualize o histórico completo de lavagens e avarias dos veículos
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="all" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">Histórico Completo</TabsTrigger>
            <TabsTrigger value="wash">Lavagens</TabsTrigger>
            <TabsTrigger value="damage">Avarias</TabsTrigger>
          </TabsList>
          
          <div className="mt-4 overflow-auto max-h-[60vh]">
            <TabsContent value="all" className="mt-0">
              {renderCombinedHistory()}
            </TabsContent>
            
            <TabsContent value="wash" className="mt-0">
              {renderWashHistory()}
            </TabsContent>
            
            <TabsContent value="damage" className="mt-0">
              {renderDamageHistory()}
            </TabsContent>
          </div>
        </Tabs>

        <DetailModal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          item={selectedItem}
          type={selectedType}
        />
      </DialogContent>
    </Dialog>
  );
};
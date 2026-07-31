import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useVehicles } from "@/hooks/useVehicles";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Calendar, 
  User, 
  FileText, 
  MapPin, 
  Camera,
  Droplets,
  AlertTriangle 
} from "lucide-react";

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  type: 'wash' | 'damage';
}

export const DetailModal = ({ isOpen, onClose, item, type }: DetailModalProps) => {
  const { vehicles } = useVehicles();

  if (!item) return null;

  const getVehicleInfo = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? {
      placa: vehicle.placa,
      modelo: `${vehicle.marca} ${vehicle.modelo}`,
      cor: vehicle.cor,
      ano: vehicle.ano
    } : null;
  };

  const getImageUrl = (path: string | null) => {
    if (!path) return null;
    
    // If it's already a full URL, return as is
    if (path.startsWith('http')) return path;
    
    // Otherwise, get the public URL from Supabase storage
    const bucketName = type === 'wash' ? 'wash-photos' : 'damage-photos';
    const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
    return data.publicUrl;
  };

  const vehicleInfo = getVehicleInfo(item.vehicle_id);

  const renderWashDetails = () => (
    <div className="space-y-6">
      {/* Header com ícone e tipo */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg dark:bg-blue-900/20">
        <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900">
          <Droplets className="h-6 w-6 text-blue-600 dark:text-blue-300" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Registro de Lavagem</h3>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {item.tipo_lavagem === 'completa' ? 'Lavagem Completa' :
             item.tipo_lavagem === 'interna' ? 'Lavagem Interna' : 'Lavagem Externa'}
          </Badge>
        </div>
      </div>

      {/* Informações do Veículo */}
      {vehicleInfo && (
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-medium mb-3">Informações do Veículo</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Placa:</span> {vehicleInfo.placa}
              </div>
              <div>
                <span className="font-medium">Modelo:</span> {vehicleInfo.modelo}
              </div>
              <div>
                <span className="font-medium">Cor:</span> {vehicleInfo.cor || 'N/A'}
              </div>
              <div>
                <span className="font-medium">Ano:</span> {vehicleInfo.ano}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detalhes da Lavagem */}
      <Card>
        <CardContent className="pt-6">
          <h4 className="font-medium mb-3">Detalhes da Lavagem</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Data da Lavagem:</span>
              <span>{format(new Date(item.data_lavagem), 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
            
            {item.responsavel_lavagem && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Responsável:</span>
                <span>{item.responsavel_lavagem}</span>
              </div>
            )}

            {item.observacoes && (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="font-medium">Observações:</span>
                </div>
                <p className="text-muted-foreground pl-6">{item.observacoes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fotos */}
      {(item.foto_antes_url || item.foto_depois_url) && (
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Fotos da Lavagem
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {item.foto_antes_url && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Antes da Lavagem</p>
                  <img 
                    src={getImageUrl(item.foto_antes_url) || item.foto_antes_url} 
                    alt="Foto antes da lavagem"
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                </div>
              )}
              {item.foto_depois_url && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Depois da Lavagem</p>
                  <img 
                    src={getImageUrl(item.foto_depois_url) || item.foto_depois_url}
                    alt="Foto depois da lavagem"
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderDamageDetails = () => (
    <div className="space-y-6">
      {/* Header com ícone e tipo */}
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg dark:bg-red-900/20">
        <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900">
          <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-300" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Relatório de Avaria</h3>
          <Badge variant="destructive">
            Avaria Reportada
          </Badge>
        </div>
      </div>

      {/* Informações do Veículo */}
      {vehicleInfo && (
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-medium mb-3">Informações do Veículo</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Placa:</span> {vehicleInfo.placa}
              </div>
              <div>
                <span className="font-medium">Modelo:</span> {vehicleInfo.modelo}
              </div>
              <div>
                <span className="font-medium">Cor:</span> {vehicleInfo.cor || 'N/A'}
              </div>
              <div>
                <span className="font-medium">Ano:</span> {vehicleInfo.ano}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detalhes da Avaria */}
      <Card>
        <CardContent className="pt-6">
          <h4 className="font-medium mb-3">Detalhes da Avaria</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Data da Avaria:</span>
              <span>{format(new Date(item.data_avaria), 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
            
            {item.local_ocorrencia && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="font-medium">Local da Ocorrência:</span>
                <span>{item.local_ocorrencia}</span>
              </div>
            )}

            {item.responsavel_registro && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Registrado por:</span>
                <span>{item.responsavel_registro}</span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="font-medium">Descrição da Avaria:</span>
              </div>
              <p className="text-muted-foreground pl-6">{item.descricao_avaria}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Foto da Avaria */}
      {item.foto_url && (
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Foto da Avaria
            </h4>
            <div className="max-w-md">
              <img 
                src={getImageUrl(item.foto_url) || item.foto_url}
                alt="Foto da avaria"
                className="w-full h-64 object-cover rounded-lg border"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {type === 'wash' ? 'Detalhes da Lavagem' : 'Detalhes da Avaria'}
          </DialogTitle>
          <DialogDescription>
            Informações completas do registro {vehicleInfo ? `- ${vehicleInfo.placa}` : ''}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {type === 'wash' ? renderWashDetails() : renderDamageDetails()}
        </div>
      </DialogContent>
    </Dialog>
  );
};
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getVehicleStatusSoftClass, getVehicleStatusText } from "@/lib/statusHelpers";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Employee = Database['public']['Tables']['employees']['Row'];
type RentalCompany = Database['public']['Tables']['rental_companies']['Row'];

interface ViewVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  employees: Employee[];
  rentalCompanies: RentalCompany[];
}

export function ViewVehicleModal({ 
  isOpen, 
  onClose, 
  vehicle, 
  employees, 
  rentalCompanies 
}: ViewVehicleModalProps) {
  if (!vehicle) return null;

  const responsavel = employees.find(e => e.id === vehicle.responsavel_id);
  const rentalCompany = rentalCompanies.find(rc => rc.id === vehicle.rental_company_id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalhes do Veículo Pesado - {vehicle.placa}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Placa</label>
                  <p className="font-medium">{vehicle.placa}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    <Badge className={getVehicleStatusSoftClass(vehicle.status || 'disponivel')}>
                      {getVehicleStatusText(vehicle.status || 'disponivel')}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Marca</label>
                  <p className="font-medium">{vehicle.marca}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Modelo</label>
                  <p className="font-medium">{vehicle.modelo}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ano</label>
                  <p className="font-medium">{vehicle.ano}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Cor</label>
                  <p className="font-medium">{vehicle.cor || 'Não informado'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quilometragem */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quilometragem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Quilometragem Atual</label>
                  <p className="font-medium">{vehicle.quilometragem_atual?.toLocaleString() || 0} km</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Limite Mensal</label>
                  <p className="font-medium">{vehicle.quilometragem_maxima_mensal?.toLocaleString() || 2000} km</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Responsável */}
          {responsavel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Responsável</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="font-medium">{responsavel.nome}</p>
                  <p className="text-sm text-muted-foreground">{responsavel.email}</p>
                  {responsavel.telefone && (
                    <p className="text-sm text-muted-foreground">{responsavel.telefone}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Locadora (se aplicável) */}
          {vehicle.tipo_propriedade === 'alugado' && rentalCompany && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Locadora</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="font-medium">{rentalCompany.nome}</p>
                  {rentalCompany.cnpj && (
                    <p className="text-sm text-muted-foreground">CNPJ: {rentalCompany.cnpj}</p>
                  )}
                  {rentalCompany.telefone && (
                    <p className="text-sm text-muted-foreground">Telefone: {rentalCompany.telefone}</p>
                  )}
                  {rentalCompany.email && (
                    <p className="text-sm text-muted-foreground">Email: {rentalCompany.email}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Informações Adicionais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações Adicionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Tipo de Propriedade</label>
                <p className="font-medium">
                  {vehicle.tipo_propriedade === 'proprio' ? 'Próprio' : 'Alugado'}
                </p>
              </div>

              {vehicle.data_ultima_revisao && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Última Revisão</label>
                  <p className="font-medium">
                    {format(new Date(vehicle.data_ultima_revisao), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
              )}

              {vehicle.observacoes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Observações</label>
                  <p className="font-medium">{vehicle.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
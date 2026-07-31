import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import type { Database } from "@/integrations/supabase/types";

type MaintenanceRecord = Database['public']['Tables']['maintenance_records']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Employee = Database['public']['Tables']['employees']['Row'];

interface MaintenanceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  maintenance: MaintenanceRecord | null;
  vehicle?: Vehicle | null;
  employees: Employee[];
}

export function MaintenanceDetailModal({ 
  isOpen, 
  onClose, 
  maintenance,
  vehicle,
  employees
}: MaintenanceDetailModalProps) {
  if (!maintenance) return null;

  const getMaintenanceStatusBadge = (status: string) => {
    switch (status) {
      case 'agendada':
        return <Badge className="bg-blue-100 text-blue-800">Agendada</Badge>;
      case 'em_andamento':
        return <Badge className="bg-yellow-100 text-yellow-800">Em Andamento</Badge>;
      case 'concluida':
        return <Badge className="bg-green-100 text-green-800">Concluída</Badge>;
      case 'cancelada':
        return <Badge className="bg-red-100 text-red-800">Cancelada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMaintenanceTypeBadge = (tipo: string) => {
    switch (tipo) {
      case 'preventiva':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Preventiva</Badge>;
      case 'corretiva':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Corretiva</Badge>;
      default:
        return <Badge variant="outline">{tipo}</Badge>;
    }
  };

  // Encontrar o funcionário que criou o registro
  const createdByEmployee = employees.find(emp => emp.user_id === maintenance.created_by);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Detalhes da Manutenção
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações do Veículo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Veículo
                {vehicle && (
                  <Badge variant="outline">
                    {vehicle.tipo === 'pesado' ? 'Veículo Pesado' : 'Veículo Leve'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vehicle ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Placa</p>
                    <p className="font-semibold">{vehicle.placa}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Marca/Modelo</p>
                    <p className="font-semibold">{vehicle.marca} {vehicle.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ano</p>
                    <p className="font-semibold">{vehicle.ano}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Quilometragem Atual</p>
                    <p className="font-semibold">{vehicle.quilometragem_atual?.toLocaleString() || 0} km</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Informações do veículo não disponíveis</p>
              )}
            </CardContent>
          </Card>

          {/* Informações Gerais da Manutenção */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações da Manutenção</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo</p>
                    {getMaintenanceTypeBadge(maintenance.tipo)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    {getMaintenanceStatusBadge(maintenance.status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Data Agendada</p>
                    <p className="font-semibold">
                      {format(new Date(maintenance.data_agendada), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                  {maintenance.data_realizada && (
                    <div>
                      <p className="text-sm text-muted-foreground">Data Realizada</p>
                      <p className="font-semibold">
                        {format(new Date(maintenance.data_realizada), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {maintenance.quilometragem && (
                    <div>
                      <p className="text-sm text-muted-foreground">Quilometragem na Manutenção</p>
                      <p className="font-semibold">{maintenance.quilometragem.toLocaleString()} km</p>
                    </div>
                  )}
                  {maintenance.custo && (
                    <div>
                      <p className="text-sm text-muted-foreground">Custo</p>
                      <p className="font-semibold text-green-600">
                        R$ {maintenance.custo.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  )}
                  {maintenance.responsavel && (
                    <div>
                      <p className="text-sm text-muted-foreground">Responsável</p>
                      <p className="font-semibold">{maintenance.responsavel}</p>
                    </div>
                  )}
                  {maintenance.oficina && (
                    <div>
                      <p className="text-sm text-muted-foreground">Oficina</p>
                      <p className="font-semibold">{maintenance.oficina}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Descrição */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Descrição do Serviço</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground leading-relaxed">
                {maintenance.descricao}
              </p>
            </CardContent>
          </Card>

          {/* Observações */}
          {maintenance.observacoes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground leading-relaxed">
                  {maintenance.observacoes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Informações de Registro */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações de Registro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Criado por</p>
                  <p className="font-medium">
                    {createdByEmployee ? createdByEmployee.nome : 'Usuário não identificado'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Data de Criação</p>
                  <p className="font-medium">
                    {format(new Date(maintenance.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Última Atualização</p>
                  <p className="font-medium">
                    {format(new Date(maintenance.updated_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
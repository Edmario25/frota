import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n";

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
  const { t, number, money, date } = useI18n();
  if (!maintenance) return null;

  const getMaintenanceStatusBadge = (status: string) => {
    switch (status) {
      case 'agendada':
        return <Badge className="bg-blue-100 text-blue-800">{t("Agendada")}</Badge>;
      case 'em_andamento':
        return <Badge className="bg-yellow-100 text-yellow-800">{t("Em Andamento")}</Badge>;
      case 'concluida':
        return <Badge className="bg-green-100 text-green-800">{t("Concluída")}</Badge>;
      case 'cancelada':
        return <Badge className="bg-red-100 text-red-800">{t("Cancelada")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMaintenanceTypeBadge = (tipo: string) => {
    switch (tipo) {
      case 'preventiva':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{t("Preventiva")}</Badge>;
      case 'corretiva':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">{t("Corretiva")}</Badge>;
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
            {t("Detalhes da Manutenção")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações do Veículo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {t("Veículo")}
                {vehicle && (
                  <Badge variant="outline">
                    {vehicle.tipo === 'pesado' ? t("Veículo Pesado") : t("Veículo Leve")}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vehicle ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Placa")}</p>
                    <p className="font-semibold">{vehicle.placa}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Marca/Modelo")}</p>
                    <p className="font-semibold">{vehicle.marca} {vehicle.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Ano")}</p>
                    <p className="font-semibold">{vehicle.ano}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Quilometragem Atual")}</p>
                    <p className="font-semibold">{number(vehicle.quilometragem_atual ?? 0)} km</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("Informações do veículo não disponíveis")}</p>
              )}
            </CardContent>
          </Card>

          {/* Informações Gerais da Manutenção */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("Informações da Manutenção")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Tipo")}</p>
                    {getMaintenanceTypeBadge(maintenance.tipo)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Status")}</p>
                    {getMaintenanceStatusBadge(maintenance.status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Data Agendada")}</p>
                    <p className="font-semibold">
                      {date(maintenance.data_agendada)}
                    </p>
                  </div>
                  {maintenance.data_realizada && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t("Data Realizada")}</p>
                      <p className="font-semibold">
                        {date(maintenance.data_realizada)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {maintenance.quilometragem && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t("Quilometragem na Manutenção")}</p>
                      <p className="font-semibold">{number(maintenance.quilometragem)} km</p>
                    </div>
                  )}
                  {maintenance.custo && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t("Custo")}</p>
                      <p className="font-semibold text-green-600">
                        {money(maintenance.custo)}
                      </p>
                    </div>
                  )}
                  {maintenance.responsavel && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t("Responsável")}</p>
                      <p className="font-semibold">{maintenance.responsavel}</p>
                    </div>
                  )}
                  {maintenance.oficina && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t("Oficina")}</p>
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
              <CardTitle className="text-lg">{t("Descrição do Serviço")}</CardTitle>
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
                <CardTitle className="text-lg">{t("Observações")}</CardTitle>
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
              <CardTitle className="text-lg">{t("Informações de Registro")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("Criado por")}</p>
                  <p className="font-medium">
                    {createdByEmployee ? createdByEmployee.nome : t("Usuário não identificado")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("Data de Criação")}</p>
                  <p className="font-medium">
                    {date(maintenance.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("Última Atualização")}</p>
                  <p className="font-medium">
                    {date(maintenance.updated_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
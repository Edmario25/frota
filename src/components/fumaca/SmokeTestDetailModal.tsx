import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Calendar, 
  Car, 
  User, 
  Building, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Gauge, 
  Camera,
  Ruler,
  Zap
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";

interface SmokeTest {
  id: string;
  vehicle_id: string;
  employee_id: string;
  data_afericao: string;
  data_hora_teste?: string;
  condutor: string;
  cargo: string;
  obra: string | null;
  ano_fabricacao: number;
  resultado: string;
  responsavel_elaboracao: string;
  observacoes: string | null;
  motor_tipo?: string;
  quilometragem_atual?: number;
  distancia_observador?: number;
  indice_ringelmann?: number;
  densidade_percentual?: number;
  dentro_limite?: boolean;
  evidencias_url?: string;
  condicoes_teste?: string;
  created_at: string;
  updated_at: string;
}

interface SmokeTestDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  smokeTest: SmokeTest | null;
}

export const SmokeTestDetailModal: React.FC<SmokeTestDetailModalProps> = ({
  isOpen,
  onClose,
  smokeTest,
}) => {
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();

  if (!smokeTest) return null;

  const vehicle = vehicles.find(v => v.id === smokeTest.vehicle_id);
  const employee = employees.find(e => e.id === smokeTest.employee_id);
  const isApproved = smokeTest.dentro_limite ?? smokeTest.resultado?.toLowerCase() === 'aprovado';

  const getRingelmannDescription = (indice: number) => {
    const descriptions = {
      1: "Densidade 20% - Fumaça clara",
      2: "Densidade 40% - Fumaça leve",
      3: "Densidade 60% - Fumaça moderada",
      4: "Densidade 80% - Fumaça densa",
      5: "Densidade 100% - Fumaça escura"
    };
    return descriptions[indice as keyof typeof descriptions] || "Não informado";
  };

  const getMotorTypeLabel = (tipo: string) => {
    const types = {
      diesel: "Diesel",
      gasolina: "Gasolina",
      flex: "Flex",
      etanol: "Etanol"
    };
    return types[tipo as keyof typeof types] || tipo;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Teste de Fumaça - Escala Ringelmann</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Vehicle Info */}
          <div className="flex items-center gap-3">
            <Car className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {vehicle?.placa} - {vehicle?.marca} {vehicle?.modelo}
              </p>
              <p className="text-sm text-muted-foreground">
                Ano: {vehicle?.ano} | Cor: {vehicle?.cor} | Tipo: {vehicle?.tipo}
              </p>
              {smokeTest.motor_tipo && (
                <p className="text-sm text-muted-foreground">
                  Motor: {getMotorTypeLabel(smokeTest.motor_tipo)}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Test Result with Ringelmann Scale */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Resultado do Teste</label>
              <div className="flex items-center gap-2">
                {isApproved ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <Badge variant={isApproved ? "default" : "destructive"}>
                  {isApproved ? "✅ Dentro do limite" : "❌ Fora do limite"}
                </Badge>
              </div>
            </div>

            {smokeTest.indice_ringelmann && (
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      Escala Ringelmann
                    </label>
                    <p className="text-lg font-semibold">
                      Nº {smokeTest.indice_ringelmann}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {getRingelmannDescription(smokeTest.indice_ringelmann)}
                    </p>
                  </div>
                  
                  {smokeTest.densidade_percentual && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Densidade</label>
                      <p className="text-lg font-semibold">
                        {smokeTest.densidade_percentual}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Test Conditions */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Test Date and Time */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Data e Hora do Teste
                </label>
                <p className="text-sm">
                  {format(
                    new Date(smokeTest.data_hora_teste || smokeTest.data_afericao), 
                    "dd 'de' MMMM 'de' yyyy 'às' HH:mm", 
                    { locale: ptBR }
                  )}
                </p>
              </div>

              {/* Observer Distance */}
              {smokeTest.distancia_observador && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Ruler className="h-4 w-4" />
                    Distância do Observador
                  </label>
                  <p className="text-sm">{smokeTest.distancia_observador} metros</p>
                </div>
              )}

              {/* Current Mileage */}
              {smokeTest.quilometragem_atual !== undefined && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    Quilometragem Atual
                  </label>
                  <p className="text-sm">{smokeTest.quilometragem_atual?.toLocaleString()} km</p>
                </div>
              )}

              {/* Vehicle Manufacturing Year */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Ano de Fabricação</label>
                <p className="text-sm">{smokeTest.ano_fabricacao}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Personnel Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Condutor
              </label>
              <p className="text-sm">{smokeTest.condutor}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Cargo</label>
              <p className="text-sm">{smokeTest.cargo}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Responsável pela Elaboração</label>
              <p className="text-sm">{smokeTest.responsavel_elaboracao}</p>
            </div>

            {employee && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Funcionário Responsável</label>
                <p className="text-sm">{employee.nome}</p>
              </div>
            )}
          </div>

          {/* Work Site */}
          {smokeTest.obra && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Building className="h-4 w-4" />
                Obra
              </label>
              <p className="text-sm">{smokeTest.obra}</p>
            </div>
          )}

          {/* Test Conditions */}
          {smokeTest.condicoes_teste && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Condições do Teste
              </label>
              <p className="text-sm bg-muted/50 p-3 rounded-lg">
                {smokeTest.condicoes_teste}
              </p>
            </div>
          )}

          {/* Evidence */}
          {smokeTest.evidencias_url && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Evidências
              </label>
              <a 
                href={smokeTest.evidencias_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                Ver evidência
              </a>
            </div>
          )}

          {/* Observations */}
          {smokeTest.observacoes && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Observações Adicionais
              </label>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                {smokeTest.observacoes}
              </p>
            </div>
          )}

          {/* Registration Info */}
          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Registrado em: {format(new Date(smokeTest.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {smokeTest.updated_at !== smokeTest.created_at && (
              <p>
                Última atualização: {format(new Date(smokeTest.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
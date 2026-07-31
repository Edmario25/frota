import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useDamageReports } from "@/hooks/useDamageReports";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { PhotoUpload } from "@/components/ui/photo-upload";

interface DamageReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  damageReport?: any;
  vehicleId?: string;
}

export function DamageReportModal({ isOpen, onClose, damageReport, vehicleId }: DamageReportModalProps) {
  const [formData, setFormData] = useState({
    vehicle_id: "",
    employee_id: "",
    data_avaria: new Date(),
    descricao_avaria: "",
    local_ocorrencia: "",
    responsavel_registro: "",
    foto_url: ""
  });

  const { createDamageReport, updateDamageReport } = useDamageReports();
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { employee: currentEmployee } = useCurrentEmployee();
  const { isFuncionario, hasAdminAccess } = useUserRole();
  const { vehicle: employeeVehicle } = useEmployeeVehicle();
  const [loading, setLoading] = useState(false);

  // Filtrar veículos baseado no papel do usuário
  const availableVehicles = isFuncionario && employeeVehicle 
    ? [employeeVehicle] 
    : vehicles;

  useEffect(() => {
    if (damageReport) {
      setFormData({
        vehicle_id: damageReport.vehicle_id || "",
        employee_id: damageReport.employee_id || "",
        data_avaria: new Date(damageReport.data_avaria),
        descricao_avaria: damageReport.descricao_avaria || "",
        local_ocorrencia: damageReport.local_ocorrencia || "",
        responsavel_registro: damageReport.responsavel_registro || "",
        foto_url: damageReport.foto_url || ""
      });
    } else {
      // Para novo registro, auto-preencher se for funcionário ou se vehicleId foi passado
      const defaultVehicleId = vehicleId || ((isFuncionario && employeeVehicle) ? employeeVehicle.id : "");
      const defaultEmployeeId = currentEmployee?.id || "";
      
      setFormData({
        vehicle_id: defaultVehicleId,
        employee_id: defaultEmployeeId,
        data_avaria: new Date(),
        descricao_avaria: "",
        local_ocorrencia: "",
        responsavel_registro: currentEmployee?.nome || "",
        foto_url: ""
      });
    }
  }, [damageReport, isFuncionario, employeeVehicle, currentEmployee, vehicleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const reportData = {
        vehicle_id: formData.vehicle_id,
        employee_id: formData.employee_id,
        data_avaria: formData.data_avaria.toISOString(),
        descricao_avaria: formData.descricao_avaria,
        local_ocorrencia: formData.local_ocorrencia,
        responsavel_registro: formData.responsavel_registro,
        foto_url: formData.foto_url || null
      };

      if (damageReport) {
        await updateDamageReport(damageReport.id, reportData);
      } else {
        await createDamageReport(reportData);
      }

      onClose();
    } catch (error) {
      console.error('Erro ao salvar relatório de avaria:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {damageReport ? "Editar Relatório de Avaria" : "Novo Relatório de Avaria"}
          </DialogTitle>
          <DialogDescription>
            {damageReport ? "Edite as informações da avaria" : "Preencha os dados da avaria ocorrida"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle_id">Veículo</Label>
              <Select
                value={formData.vehicle_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, vehicle_id: value }))}
                disabled={isFuncionario}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar Veículo" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  {availableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.placa} - {vehicle.marca} {vehicle.modelo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isFuncionario && (
                <p className="text-xs text-muted-foreground">
                  Você pode registrar avarias apenas do seu veículo atribuído
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data da Avaria</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.data_avaria && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.data_avaria ? format(formData.data_avaria, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.data_avaria}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, data_avaria: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao_avaria">Descrição da Avaria</Label>
            <Textarea
              id="descricao_avaria"
              value={formData.descricao_avaria}
              onChange={(e) => setFormData(prev => ({ ...prev, descricao_avaria: e.target.value }))}
              placeholder="Descreva a avaria ocorrida"
              required
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="local_ocorrencia">Local da Ocorrência</Label>
              <Input
                id="local_ocorrencia"
                value={formData.local_ocorrencia}
                onChange={(e) => setFormData(prev => ({ ...prev, local_ocorrencia: e.target.value }))}
                placeholder="Onde ocorreu a avaria"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel_registro">Responsável pelo Registro</Label>
              <Input
                id="responsavel_registro"
                value={formData.responsavel_registro}
                onChange={(e) => setFormData(prev => ({ ...prev, responsavel_registro: e.target.value }))}
                placeholder="Nome do responsável"
              />
            </div>
          </div>

          <PhotoUpload
            label="Foto da Avaria"
            value={formData.foto_url}
            onChange={(url) => setFormData(prev => ({ ...prev, foto_url: url || "" }))}
            bucketName="damage-photos"
            vehicleId={formData.vehicle_id}
            disabled={loading}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : damageReport ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
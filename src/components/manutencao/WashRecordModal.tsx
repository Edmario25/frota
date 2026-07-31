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
import { useWashRecords } from "@/hooks/useWashRecords";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { PhotoUpload } from "@/components/ui/photo-upload";

interface WashRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  washRecord?: any;
}

export function WashRecordModal({ isOpen, onClose, washRecord }: WashRecordModalProps) {
  const [formData, setFormData] = useState({
    vehicle_id: "",
    employee_id: "",
    data_lavagem: new Date(),
    tipo_lavagem: "",
    responsavel_lavagem: "",
    observacoes: "",
    foto_antes_url: "",
    foto_depois_url: ""
  });

  const { createWashRecord, updateWashRecord } = useWashRecords();
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
    if (washRecord) {
      setFormData({
        vehicle_id: washRecord.vehicle_id || "",
        employee_id: washRecord.employee_id || "",
        data_lavagem: new Date(washRecord.data_lavagem),
        tipo_lavagem: washRecord.tipo_lavagem || "",
        responsavel_lavagem: washRecord.responsavel_lavagem || "",
        observacoes: washRecord.observacoes || "",
        foto_antes_url: washRecord.foto_antes_url || "",
        foto_depois_url: washRecord.foto_depois_url || ""
      });
    } else {
      // Para novo registro, auto-preencher se for funcionário
      const defaultVehicleId = (isFuncionario && employeeVehicle) ? employeeVehicle.id : "";
      const defaultEmployeeId = currentEmployee?.id || "";
      
      setFormData({
        vehicle_id: defaultVehicleId,
        employee_id: defaultEmployeeId,
        data_lavagem: new Date(),
        tipo_lavagem: "",
        responsavel_lavagem: currentEmployee?.nome || "",
        observacoes: "",
        foto_antes_url: "",
        foto_depois_url: ""
      });
    }
  }, [washRecord, isFuncionario, employeeVehicle, currentEmployee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validações antes de enviar
    if (!formData.vehicle_id) {
      alert('Selecione um veículo');
      return;
    }
    if (!formData.employee_id) {
      alert('Funcionário não identificado');
      return;
    }
    if (!formData.tipo_lavagem) {
      alert('Selecione o tipo de lavagem');
      return;
    }
    if (!formData.responsavel_lavagem) {
      alert('Informe o responsável pela lavagem');
      return;
    }

    setLoading(true);

    try {
      const recordData = {
        vehicle_id: formData.vehicle_id,
        employee_id: formData.employee_id,
        data_lavagem: formData.data_lavagem.toISOString().split('T')[0],
        tipo_lavagem: formData.tipo_lavagem,
        responsavel_lavagem: formData.responsavel_lavagem,
        observacoes: formData.observacoes || null,
        foto_antes_url: formData.foto_antes_url || null,
        foto_depois_url: formData.foto_depois_url || null
      };

      if (washRecord) {
        await updateWashRecord(washRecord.id, recordData);
      } else {
        await createWashRecord(recordData);
      }

      onClose();
    } catch (error) {
      console.error('Erro ao salvar registro de lavagem:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {washRecord ? "Editar Registro de Lavagem" : "Novo Registro de Lavagem"}
          </DialogTitle>
          <DialogDescription>
            {washRecord ? "Edite as informações da lavagem" : "Preencha os dados da lavagem realizada"}
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
                  Você pode registrar lavagens apenas do seu veículo atribuído
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data da Lavagem</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.data_lavagem && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.data_lavagem ? format(formData.data_lavagem, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.data_lavagem}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, data_lavagem: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo_lavagem">Tipo de Lavagem</Label>
              <Select
                value={formData.tipo_lavagem}
                onValueChange={(value) => setFormData(prev => ({ ...prev, tipo_lavagem: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar Tipo" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  <SelectItem value="completa">Lavagem Completa</SelectItem>
                  <SelectItem value="interna">Lavagem Interna</SelectItem>
                  <SelectItem value="externa">Lavagem Externa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel_lavagem">Responsável pela Lavagem</Label>
              <Input
                id="responsavel_lavagem"
                value={formData.responsavel_lavagem}
                onChange={(e) => setFormData(prev => ({ ...prev, responsavel_lavagem: e.target.value }))}
                placeholder="Nome do responsável"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
              placeholder="Observações sobre a lavagem realizada"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <PhotoUpload
              label="Foto Antes da Lavagem"
              value={formData.foto_antes_url}
              onChange={(url) => setFormData(prev => ({ ...prev, foto_antes_url: url || "" }))}
              bucketName="wash-photos"
              vehicleId={formData.vehicle_id}
              disabled={loading}
            />

            <PhotoUpload
              label="Foto Depois da Lavagem"
              value={formData.foto_depois_url}
              onChange={(url) => setFormData(prev => ({ ...prev, foto_depois_url: url || "" }))}
              bucketName="wash-photos"
              vehicleId={formData.vehicle_id}
              disabled={loading}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !formData.vehicle_id || !formData.tipo_lavagem || !formData.responsavel_lavagem}
            >
              {loading ? "Salvando..." : washRecord ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
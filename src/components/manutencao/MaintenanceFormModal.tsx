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
import { supabase } from "@/integrations/supabase/client";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { FornecedorSelect } from "@/components/ui/FornecedorSelect";
import { PhotoUpload } from "@/components/ui/photo-upload";

interface MaintenanceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  maintenance?: any;
  vehicleType?: 'leve' | 'pesado';
  vehicleId?: string;
}

export function MaintenanceFormModal({ isOpen, onClose, maintenance, vehicleType, vehicleId }: MaintenanceFormModalProps) {
  const [formData, setFormData] = useState({
    vehicle_id: "",
    tipo: "",
    descricao: "",
    data_agendada: new Date(),
    data_realizada: null as Date | null,
    quilometragem: "",
    custo: "",
    responsavel: "",
    oficina: "",
    observacoes: "",
    foto_url: "",
    status: "agendada" as 'agendada' | 'em_andamento' | 'concluida' | 'cancelada',
    created_by: ""
  });

  const { createMaintenanceRecord, updateMaintenanceRecord } = useMaintenance();
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { employee: currentEmployee, loading: loadingEmployee } = useCurrentEmployee();
  const { isFuncionario, hasAdminAccess } = useUserRole();
  const { vehicle: employeeVehicle } = useEmployeeVehicle();
  const [loading, setLoading] = useState(false);

  // Filtrar veículos baseado no papel do usuário e tipo de veículo
  let filteredVehicles = isFuncionario && employeeVehicle 
    ? [employeeVehicle] 
    : vehicles;
    
  // Se foi especificado um tipo de veículo, filtrar por esse tipo
  if (vehicleType) {
    filteredVehicles = filteredVehicles.filter(vehicle => vehicle.tipo === vehicleType);
  }
  
  const availableVehicles = filteredVehicles;

  useEffect(() => {
    if (maintenance) {
      setFormData({
        vehicle_id: maintenance.vehicle_id || "",
        tipo: maintenance.tipo || "",
        descricao: maintenance.descricao || "",
        data_agendada: new Date(maintenance.data_agendada),
        data_realizada: maintenance.data_realizada ? new Date(maintenance.data_realizada) : null,
        quilometragem: maintenance.quilometragem?.toString() || "",
        custo: maintenance.custo?.toString() || "",
        responsavel: maintenance.responsavel || "",
        oficina: maintenance.oficina || "",
        observacoes: maintenance.observacoes || "",
        foto_url: maintenance.foto_url || "",
        status: maintenance.status || "agendada",
        created_by: maintenance.created_by || ""
      });
    } else {
      const defaultVehicleId = vehicleId || ((isFuncionario && employeeVehicle) ? employeeVehicle.id : "");
      const defaultVehicle = vehicles.find(v => v.id === defaultVehicleId);

      setFormData({
        vehicle_id: defaultVehicleId,
        tipo: "",
        descricao: "",
        data_agendada: new Date(),
        data_realizada: null,
        quilometragem: defaultVehicle?.quilometragem_atual?.toString() || "",
        custo: "",
        responsavel: "",
        oficina: "",
        observacoes: "",
        foto_url: "",
        status: "agendada" as 'agendada' | 'em_andamento' | 'concluida' | 'cancelada',
        created_by: ""
      });
    }
  }, [maintenance, isFuncionario, employeeVehicle, vehicleId, vehicles]);

  // Quando o veículo muda (novo registro), atualiza o KM com o valor do banco
  useEffect(() => {
    if (maintenance) return;
    const selected = vehicles.find(v => v.id === formData.vehicle_id);
    if (selected) {
      setFormData(prev => ({ ...prev, quilometragem: selected.quilometragem_atual?.toString() || "" }));
    }
  }, [formData.vehicle_id, vehicles, maintenance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validações obrigatórias
      if (!formData.vehicle_id) {
        throw new Error('Por favor, selecione um veículo');
      }
      
      if (!formData.tipo) {
        throw new Error('Por favor, selecione o tipo de manutenção');
      }
      
      if (!formData.descricao) {
        throw new Error('Por favor, preencha a descrição da manutenção');
      }

      // Para created_by, usar o user_id do auth (que é o campo correto para a constraint)
      // Se o usuário atual tem um funcionário cadastrado, usar o user_id dele
      // Caso contrário, usar o user_id do primeiro funcionário disponível
      // Como último recurso, usar o ID do usuário atual logado
      let createdByUserId = currentEmployee?.user_id;
      
      if (!createdByUserId && employees.length > 0) {
        // Usar o user_id do primeiro funcionário que tem user_id
        const employeeWithUserId = employees.find(emp => emp.user_id);
        createdByUserId = employeeWithUserId?.user_id;
      }
      
      // Se ainda não tem user_id, usar o ID do usuário atual do auth (fallback para admins)
      if (!createdByUserId) {
        // Aqui usamos diretamente o auth.uid() através do supabase client
        const { data: { user } } = await supabase.auth.getUser();
        createdByUserId = user?.id;
      }
      
      if (!createdByUserId) {
        throw new Error('Não foi possível identificar um usuário responsável pela criação do registro. Certifique-se de estar logado no sistema.');
      }

      const maintenanceData = {
        vehicle_id: formData.vehicle_id,
        tipo: formData.tipo as 'preventiva' | 'corretiva',
        descricao: formData.descricao,
        data_agendada: formData.data_agendada.toISOString().split('T')[0],
        data_realizada: formData.data_realizada?.toISOString().split('T')[0] || null,
        quilometragem: formData.quilometragem ? parseInt(formData.quilometragem) : null,
        custo: formData.custo ? parseFloat(formData.custo) : null,
        responsavel: formData.responsavel,
        oficina: formData.oficina,
        observacoes: formData.observacoes,
        foto_url: formData.foto_url || null,
        status: formData.status as 'agendada' | 'em_andamento' | 'concluida' | 'cancelada',
        created_by: createdByUserId
      };

      if (maintenance) {
        await updateMaintenanceRecord(maintenance.id, maintenanceData);
      } else {
        await createMaintenanceRecord(maintenanceData);
      }

      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar manutenção:', error);
      
      // Mostrar mensagem de erro mais específica
      const errorMessage = error.message || 'Erro desconhecido ao salvar manutenção';
      alert(`Erro ao salvar manutenção: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {maintenance ? "Editar Manutenção" : "Nova Manutenção"}
          </DialogTitle>
          <DialogDescription>
            {maintenance ? "Edite as informações da manutenção" : "Preencha os dados da nova manutenção"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle_id">Veículo</Label>
              <Select
                value={formData.vehicle_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, vehicle_id: value }))}
                disabled={isFuncionario} // Funcionários não podem alterar o veículo
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
                  Você pode gerenciar manutenções apenas do seu veículo atribuído
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de Serviço</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData(prev => ({ ...prev, tipo: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar Tipo" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  <SelectItem value="preventiva">Preventiva</SelectItem>
                  <SelectItem value="corretiva">Corretiva</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={formData.descricao}
              onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
              placeholder="Descreva o serviço a ser realizado"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Agendada</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.data_agendada && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.data_agendada ? format(formData.data_agendada, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.data_agendada}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, data_agendada: date }))}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada') => setFormData(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar Status" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.status === 'concluida' && (
            <div className="space-y-2">
              <Label>Data Realizada</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.data_realizada && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.data_realizada ? format(formData.data_realizada, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.data_realizada}
                    onSelect={(date) => setFormData(prev => ({ ...prev, data_realizada: date }))}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quilometragem">Quilometragem Atual</Label>
              <Input
                id="quilometragem"
                type="number"
                value={formData.quilometragem}
                readOnly
                className="bg-muted cursor-not-allowed"
                placeholder="Preenchido automaticamente"
              />
              <p className="text-xs text-muted-foreground">Preenchido automaticamente pelo sistema</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custo">Valor do Serviço (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                <Input
                  id="custo"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.custo}
                  onChange={(e) => setFormData(prev => ({ ...prev, custo: e.target.value }))}
                  placeholder="0,00"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="responsavel">Responsável</Label>
              <Input
                id="responsavel"
                value={formData.responsavel}
                onChange={(e) => setFormData(prev => ({ ...prev, responsavel: e.target.value }))}
                placeholder="Nome do responsável"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oficina">Oficina / Fornecedor</Label>
            <FornecedorSelect
              value={formData.oficina}
              onChange={(value) => setFormData(prev => ({ ...prev, oficina: value }))}
              tipos={["servicos", "pecas", "geral"]}
              placeholder="Selecione a oficina"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
              placeholder="Observações adicionais"
              rows={3}
            />
          </div>

          <PhotoUpload
            label="Foto da manutenção (comprovante / serviço)"
            value={formData.foto_url}
            onChange={(url) => setFormData(prev => ({ ...prev, foto_url: url || "" }))}
            bucketName="maintenance-photos"
            vehicleId={formData.vehicle_id}
            disabled={loading}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : maintenance ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
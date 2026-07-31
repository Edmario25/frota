import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Plus, Trash2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { getChecklistItemColor } from "@/lib/statusHelpers";
import { useInspectionChecklist } from "@/hooks/useInspectionChecklist";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  vehicle_id: z.string().min(1, "Selecione um veículo"),
  employee_id: z.string().optional(),
  data_inspecao: z.date(),
  tipo_servico: z.string().min(1, "Selecione o tipo de serviço"),
  responsavel_checklist: z.string().min(1, "Responsável é obrigatório"),
  funcao: z.string().optional(),
  km_atual: z.number().min(0, "Quilometragem deve ser positiva"),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface InspectionChecklistFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  checklist?: any;
  vehicleId?: string;
}

interface InspectionItem {
  id?: string;
  item_nome: string;
  status: 'c' | 'nc' | 'na';
  observacoes?: string;
}

const INSPECTION_ITEMS = [
  "Estado geral da carroceria",
  "Pneus e pressão",
  "Sistema de freios",
  "Faróis e lanternas",
  "Para-brisa e vidros",
  "Espelhos retrovisores",
  "Cinto de segurança",
  "Extintor de incêndio",
  "Kit de primeiros socorros",
  "Triângulo de sinalização",
  "Documentação do veículo",
  "Nível de óleo do motor",
  "Nível de água do radiador",
  "Bateria",
  "Sistema elétrico",
  "Direção",
  "Suspensão",
  "Escapamento",
  "Limpador de para-brisa",
  "Buzina",
];

const SERVICE_TYPES = [
  { value: "entrada", label: "Entrada" },
  { value: "saida", label: "Saída" },
  { value: "diario", label: "Diário" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
];

export const InspectionChecklistFormModal: React.FC<InspectionChecklistFormModalProps> = ({
  isOpen,
  onClose,
  checklist,
  vehicleId,
}) => {
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { role: userRole } = useUserRole();
  const { employee: currentEmployee } = useCurrentEmployee();
  const { createChecklist, createChecklistItem } = useInspectionChecklist();
  const { toast } = useToast();
  
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>([]);
  const [checklistPhotos, setChecklistPhotos] = useState<{
    frente: string;
    traseira: string;
    lado_direito: string;
    lado_esquerdo: string;
    painel: string;
  }>({
    frente: '',
    traseira: '',
    lado_direito: '',
    lado_esquerdo: '',
    painel: '',
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicle_id: "",
      employee_id: "",
      data_inspecao: new Date(),
      tipo_servico: "",
      responsavel_checklist: "",
      funcao: "",
      km_atual: 0,
      observacoes: "",
    },
  });

  // Filter vehicles based on user role
  const availableVehicles = React.useMemo(() => {
    if (userRole === 'funcionario' && currentEmployee) {
      return vehicles.filter(vehicle => vehicle.responsavel_id === currentEmployee.id);
    }
    return vehicles;
  }, [vehicles, userRole, currentEmployee]);

  useEffect(() => {
    if (checklist) {
      form.reset({
        vehicle_id: checklist.vehicle_id,
        employee_id: checklist.employee_id,
        data_inspecao: new Date(checklist.data_inspecao),
        tipo_servico: checklist.tipo_servico,
        responsavel_checklist: checklist.responsavel_checklist || "",
        funcao: checklist.funcao || "",
        km_atual: checklist.km_atual || 0,
        observacoes: checklist.observacoes || "",
      });
    } else if (isOpen) {
      form.reset({
        vehicle_id: vehicleId || "",
        employee_id: currentEmployee?.id || "",
        data_inspecao: new Date(),
        tipo_servico: "",
        responsavel_checklist: currentEmployee?.nome || "",
        funcao: "",
        km_atual: 0,
        observacoes: "",
      });
      // Initialize inspection items for new checklist
      setInspectionItems(
        INSPECTION_ITEMS.map(item => ({
          item_nome: item,
          status: 'na' as const,
          observacoes: '',
        }))
      );
      setChecklistPhotos({
        frente: '',
        traseira: '',
        lado_direito: '',
        lado_esquerdo: '',
        painel: '',
      });
    }
  }, [checklist, form, vehicleId, isOpen]);

  // Update employee_id when currentEmployee loads (async)
  useEffect(() => {
    if (isOpen && !checklist && currentEmployee?.id) {
      const currentValues = form.getValues();
      if (!currentValues.employee_id) {
        form.setValue('employee_id', currentEmployee.id);
        form.setValue('responsavel_checklist', currentEmployee.nome || '');
      }
    }
  }, [currentEmployee, isOpen, checklist, form]);

  const onSubmit = async (data: FormData) => {
    console.log("=== INICIANDO SALVAMENTO DO CHECKLIST ===");
    console.log("Form data recebida:", data);
    console.log("Inspection items:", inspectionItems);
    console.log("Current employee:", currentEmployee);
    console.log("Available vehicles:", availableVehicles);
    
    try {
      // Validate required fields
      if (!data.vehicle_id) {
        console.log("❌ Erro: vehicle_id está vazio");
        toast({
          title: "Erro de validação",
          description: "Selecione um veículo",
          variant: "destructive",
        });
        return;
      }

      if (!data.tipo_servico) {
        console.log("❌ Erro: tipo_servico está vazio");
        toast({
          title: "Erro de validação",
          description: "Selecione o tipo de serviço",
          variant: "destructive",
        });
        return;
      }

      // Get employee_id from current employee, vehicle responsible, or use a fallback
      let employeeId = data.employee_id || currentEmployee?.id;
      
      if (!employeeId) {
        // Try to get from the selected vehicle's responsible
        const selectedVehicle = availableVehicles.find(v => v.id === data.vehicle_id);
        if (selectedVehicle?.responsavel_id) {
          employeeId = selectedVehicle.responsavel_id;
        }
      }

      // Fallback for admins without employee record - use first available employee
      if (!employeeId && employees.length > 0) {
        employeeId = employees[0].id;
      }

      if (!employeeId) {
        console.log("❌ Erro: Não foi possível identificar o funcionário");
        toast({
          title: "Erro de validação", 
          description: "Não foi possível identificar o funcionário responsável",
          variant: "destructive",
        });
        return;
      }

      const checklistData = {
        vehicle_id: data.vehicle_id,
        employee_id: employeeId,
        data_inspecao: data.data_inspecao.toISOString(),
        tipo_servico: data.tipo_servico,
        responsavel_checklist: data.responsavel_checklist || null,
        funcao: data.funcao || null,
        km_atual: data.km_atual || 0,
        observacoes: data.observacoes || null,
      };

      console.log("✅ Dados validados, salvando checklist:", checklistData);
      const createdChecklist = await createChecklist(checklistData);
      console.log("✅ Checklist criado:", createdChecklist);
      
      // Create inspection items - save all items regardless of status for record keeping
      console.log("📋 Salvando itens de inspeção...");
      
      // Map UI status values to database values
      const statusMap: Record<string, string> = {
        'c': 'conforme',
        'nc': 'nao_conforme',
        'na': 'nao_aplicavel'
      };
      
      for (const item of inspectionItems) {
        console.log("Salvando item:", item);
        await createChecklistItem({
          checklist_id: createdChecklist.id,
          item_nome: item.item_nome,
          status: statusMap[item.status] || 'nao_aplicavel',
          observacoes: item.observacoes || null,
          foto_url: null,
        });
      }
      
      console.log("✅ CHECKLIST SALVO COM SUCESSO!");
      toast({
        title: "Sucesso",
        description: "Checklist salvo com sucesso!",
      });
      
      onClose();
      form.reset();
      setInspectionItems([]);
    } catch (error: any) {
      console.error("❌ ERRO AO SALVAR CHECKLIST:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      toast({
        title: "Erro ao salvar checklist",
        description: error.message || "Ocorreu um erro inesperado",
        variant: "destructive",
      });
    }
  };

  const updateInspectionItem = (index: number, field: keyof InspectionItem, value: any) => {
    setInspectionItems(prev => 
      prev.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {checklist ? "Editar Checklist" : "Nova Inspeção"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vehicle Selection */}
              <FormField
                control={form.control}
                name="vehicle_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Veículo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o veículo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableVehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.placa} - {vehicle.marca} {vehicle.modelo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Service Type */}
              <FormField
                control={form.control}
                name="tipo_servico"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Serviço</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SERVICE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Inspection Date */}
              <FormField
                control={form.control}
                name="data_inspecao"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data da Inspeção</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>Selecione a data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          locale={ptBR}
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Current Mileage */}
              <FormField
                control={form.control}
                name="km_atual"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quilometragem Atual</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Ex: 15000"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Responsible Person */}
              <FormField
                control={form.control}
                name="responsavel_checklist"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável pelo Checklist</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do responsável" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Function */}
              <FormField
                control={form.control}
                name="funcao" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Motorista, Operador" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Inspection Items */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Itens de Inspeção</h3>
              <div className="space-y-3">
                {inspectionItems.map((item, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <h4 className="font-medium text-sm">{item.item_nome}</h4>
                      <div className="flex gap-1">
                        {[
                          { value: 'c', label: 'C' },
                          { value: 'nc', label: 'NC' },
                          { value: 'na', label: 'NA' }
                        ].map((statusOption) => (
                          <Button
                            key={statusOption.value}
                            type="button"
                            size="sm"
                            variant={item.status === statusOption.value ? "default" : "outline"}
                            className={cn(
                              "text-xs px-2 py-1",
                              item.status === statusOption.value && getChecklistItemColor(statusOption.value)
                            )}
                            onClick={() => updateInspectionItem(index, 'status', statusOption.value)}
                          >
                            {statusOption.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    {item.status !== 'na' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Observações</label>
                          <Input
                            placeholder="Observações sobre este item"
                            value={item.observacoes || ''}
                            onChange={(e) => updateInspectionItem(index, 'observacoes', e.target.value)}
                          />
                         </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* General Photos */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Fotos do Checklist</h3>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { key: 'frente', label: 'Foto 1: Frente', icon: '🚗' },
                  { key: 'traseira', label: 'Foto 2: Traseira', icon: '🚙' },
                  { key: 'lado_direito', label: 'Foto 3: Lado Direito', icon: '➡️' },
                  { key: 'lado_esquerdo', label: 'Foto 4: Lado Esquerdo', icon: '⬅️' },
                  { key: 'painel', label: 'Foto 5: Painel', icon: '📊' },
                ].map((categoria) => (
                  <div key={categoria.key} className="border-2 border-dashed border-muted rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{categoria.icon}</span>
                      <span className="text-sm font-medium">{categoria.label}</span>
                    </div>
                    <PhotoUpload
                      label=""
                      bucketName="vehicle-photos"
                      value={checklistPhotos[categoria.key as keyof typeof checklistPhotos]}
                      onChange={(url) => {
                        setChecklistPhotos(prev => ({
                          ...prev,
                          [categoria.key]: url
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* General Observations */}
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações Gerais</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações gerais sobre a inspeção..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button 
                type="submit"
                onClick={() => {
                  console.log("🔘 Botão Salvar clicado!");
                  console.log("Form errors:", form.formState.errors);
                  console.log("Form is valid:", form.formState.isValid);
                  console.log("Form values:", form.getValues());
                }}
              >
                {checklist ? "Atualizar" : "Salvar"} Checklist
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
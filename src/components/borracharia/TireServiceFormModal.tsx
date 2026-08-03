import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTireServices } from "@/hooks/useTireServices";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useFornecedores } from "@/hooks/useFornecedores";
import { PhotoUpload } from "@/components/ui/photo-upload";

const serviceTypes = [
  { value: "calibragem", label: "Calibragem" },
  { value: "troca_pneu", label: "Troca de pneu" }, 
  { value: "reparo", label: "Reparo" },
  { value: "rodizio", label: "Rodízio" }
];

const formSchema = z.object({
  vehicle_id: z.string().min(1, "Selecione um veículo"),
  employee_id: z.string().min(1, "Selecione um funcionário"),
  data_servico: z.date({
    required_error: "Data do serviço é obrigatória",
  }),
  tipo_servico: z.string().min(1, "Selecione pelo menos um tipo de serviço"),
  quantidade_pneus: z.number().min(1, "Quantidade deve ser pelo menos 1").optional(),
  valor_servico: z.number().min(0, "Valor não pode ser negativo").optional(),
  local_servico: z.string().optional(),
  foto_pneus_url: z.string().optional(),
  responsavel: z.string().optional(),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface TireServiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  service?: any;
  vehicleType?: 'leve' | 'pesado' | null;
  vehicleId?: string;
}

export const TireServiceFormModal = ({ 
  isOpen, 
  onClose, 
  service,
  vehicleType,
  vehicleId
}: TireServiceFormModalProps) => {
  const { createTireService, updateTireService } = useTireServices();
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { isFuncionario } = useUserRole();
  const { employee } = useCurrentEmployee();
  const { fornecedores } = useFornecedores();

  const availableFornecedores = React.useMemo(() => {
    return fornecedores.filter(f => f.status === 'ativo');
  }, [fornecedores]);
  // Para funcionários, filtrar apenas veículos atribuídos a eles
  // Para tipo específico, filtrar por tipo de veículo
  const availableVehicles = React.useMemo(() => {
    let filteredVehicles = vehicles;
    
    // Filtrar por tipo se especificado
    if (vehicleType) {
      filteredVehicles = filteredVehicles.filter(v => v.tipo === vehicleType);
    }
    
    // Para funcionários, filtrar apenas veículos atribuídos a eles
    if (isFuncionario && employee) {
      filteredVehicles = filteredVehicles.filter(v => v.responsavel_id === employee.id);
    }
    
    return filteredVehicles;
  }, [vehicles, isFuncionario, employee, vehicleType]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicle_id: "",
      employee_id: "",
      data_servico: new Date(),
      tipo_servico: "",
      quantidade_pneus: 1,
      valor_servico: undefined,
      local_servico: "",
      foto_pneus_url: "",
      responsavel: "",
      observacoes: "",
    },
  });

  React.useEffect(() => {
    if (service) {
      form.reset({
        vehicle_id: service.vehicle_id,
        employee_id: service.employee_id,
        data_servico: new Date(service.data_servico),
        tipo_servico: service.tipo_servico,
        quantidade_pneus: service.quantidade_pneus || 1,
        valor_servico: service.valor_servico ?? undefined,
        local_servico: service.local_servico || "",
        foto_pneus_url: service.foto_pneus_url || "",
        responsavel: service.responsavel || "",
        observacoes: service.observacoes || "",
      });
    } else {
      form.reset();
    }
  }, [service, form]);

  const onSubmit = async (data: FormData) => {
    try {
      const serviceData = {
        vehicle_id: data.vehicle_id,
        employee_id: data.employee_id,
        data_servico: data.data_servico.toISOString().split('T')[0],
        tipo_servico: data.tipo_servico,
        quantidade_pneus: data.quantidade_pneus || null,
        valor_servico: data.valor_servico ?? null,
        local_servico: data.local_servico || null,
        foto_pneus_url: data.foto_pneus_url || null,
        responsavel: data.responsavel || null,
        observacoes: data.observacoes || null,
      };

      if (service) {
        await updateTireService(service.id, serviceData);
      } else {
        await createTireService(serviceData);
      }
      
      onClose();
      form.reset();
    } catch (error) {
      console.error("Error saving tire service:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {service ? "Editar Serviço" : "Novo Serviço de Pneu"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="employee_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Funcionário</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o funcionário" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vehicle_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Placa do Veículo</FormLabel>
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

            <FormField
              control={form.control}
              name="data_servico"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data do Serviço</FormLabel>
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

            <FormField
              control={form.control}
              name="tipo_servico"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Serviço</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo de serviço" />
                      </SelectTrigger>
                    </FormControl>
                     <SelectContent>
                       {serviceTypes.map((type) => (
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

            <FormField
              control={form.control}
              name="quantidade_pneus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade de Pneus</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="valor_servico"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor do Serviço <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        className="pl-10"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="local_servico"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Local do Serviço</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o fornecedor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableFornecedores.map((fornecedor) => (
                        <SelectItem key={fornecedor.id} value={fornecedor.nome}>
                          {fornecedor.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />


            <FormField
              control={form.control}
              name="foto_pneus_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fotos dos Pneus</FormLabel>
                  <FormControl>
                    <PhotoUpload
                      label=""
                      value={field.value || ""}
                      onChange={field.onChange}
                      bucketName="vehicle-photos"
                      vehicleId={form.watch("vehicle_id")}
                      accept="image/*"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações sobre o serviço..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Salvando..."
                  : service
                  ? "Atualizar"
                  : "Salvar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
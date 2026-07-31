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
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useVehicleAccessories } from "@/hooks/useVehicleAccessories";
import { useVehicles } from "@/hooks/useVehicles";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { FornecedorSelect } from "@/components/ui/FornecedorSelect";

const accessoryTypes = [
  "Película (Insulfilm)",
  "Substituição de Vidros", 
  "Rastreadores",
  "Alarme/Anti-furto"
];

const formSchema = z.object({
  vehicle_id: z.string().min(1, "Selecione um veículo"),
  data_instalacao: z.date().optional(),
  tipo_acessorio: z.string().min(1, "Selecione pelo menos um tipo de acessório"),
  fornecedor_empresa: z.string().optional(),
  foto_comprovante_url: z.string().optional(),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface VehicleAccessoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessory?: any;
  vehicleType?: 'leve' | 'pesado' | null;
  vehicleId?: string;
}

export const VehicleAccessoryFormModal = ({ 
  isOpen, 
  onClose, 
  accessory,
  vehicleType,
  vehicleId
}: VehicleAccessoryFormModalProps) => {
  const { createAccessory, updateAccessory } = useVehicleAccessories();
  const { vehicles } = useVehicles();
  const { isFuncionario } = useUserRole();
  const { employee } = useCurrentEmployee();
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);

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
      data_instalacao: undefined,
      tipo_acessorio: "",
      fornecedor_empresa: "",
      foto_comprovante_url: "",
      observacoes: "",
    },
  });

  React.useEffect(() => {
    if (accessory) {
      form.reset({
        vehicle_id: accessory.vehicle_id,
        data_instalacao: accessory.data_instalacao ? new Date(accessory.data_instalacao) : undefined,
        tipo_acessorio: accessory.tipo_acessorio,
        fornecedor_empresa: accessory.fornecedor_empresa || "",
        foto_comprovante_url: accessory.foto_comprovante_url || "",
        observacoes: accessory.observacoes || "",
      });
      setSelectedTypes(accessory.tipo_acessorio.split(", "));
    } else {
      form.reset();
      setSelectedTypes([]);
    }
  }, [accessory, form]);

  const onSubmit = async (data: FormData) => {
    try {
      if (!data.vehicle_id) {
        throw new Error("Veículo é obrigatório");
      }

      const accessoryData = {
        vehicle_id: data.vehicle_id,
        tipo_acessorio: selectedTypes.join(", "),
        data_instalacao: data.data_instalacao ? data.data_instalacao.toISOString().split('T')[0] : null,
        fornecedor_empresa: data.fornecedor_empresa || null,
        foto_comprovante_url: data.foto_comprovante_url || null,
        observacoes: data.observacoes || null,
      };

      if (accessory) {
        await updateAccessory(accessory.id, accessoryData);
      } else {
        await createAccessory(accessoryData);
      }
      
      onClose();
      form.reset();
      setSelectedTypes([]);
    } catch (error) {
      console.error("Error saving accessory:", error);
    }
  };

  const handleTypeToggle = (type: string) => {
    setSelectedTypes(prev => {
      const newTypes = prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type];
      
      form.setValue("tipo_acessorio", newTypes.join(", "));
      return newTypes;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {accessory ? "Editar Acessório" : "Novo Acessório"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
              name="data_instalacao"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data da Instalação</FormLabel>
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
              name="tipo_acessorio"
              render={() => (
                <FormItem>
                  <FormLabel>Tipo de Acessório</FormLabel>
                  <div className="space-y-2">
                    {accessoryTypes.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={type}
                          checked={selectedTypes.includes(type)}
                          onCheckedChange={() => handleTypeToggle(type)}
                        />
                        <label
                          htmlFor={type}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {type}
                        </label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fornecedor_empresa"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fornecedor / Empresa Responsável</FormLabel>
                  <FormControl>
                    <FornecedorSelect
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      tipos={["equipamentos", "materiais", "servicos", "geral"]}
                      placeholder="Selecione o fornecedor"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="foto_comprovante_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comprovante de Instalação</FormLabel>
                  <FormControl>
                    <PhotoUpload
                      label=""
                      value={field.value || ""}
                      onChange={field.onChange}
                      bucketName="vehicle-photos"
                      vehicleId={form.watch("vehicle_id")}
                      accept="image/*,.pdf"
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
                      placeholder="Observações adicionais..."
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
                  : accessory
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
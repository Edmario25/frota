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
import { useTrafficFines } from "@/hooks/useTrafficFines";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { PhotoUpload } from "@/components/ui/photo-upload";

const formSchema = z.object({
  vehicle_id: z.string().min(1, "Selecione um veículo"),
  employee_id: z.string().optional(),
  data_multa: z.date({
    required_error: "Data da multa é obrigatória",
  }),
  local_infracao: z.string().min(1, "Local da infração é obrigatório"),
  tipo_infracao: z.string().min(1, "Tipo da infração é obrigatório"),
  valor: z.number().min(0.01, "Valor deve ser maior que zero"),
  situacao: z.enum(["paga", "pendente"], {
    required_error: "Selecione a situação",
  }),
  comprovante_url: z.string().optional(),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface TrafficFineFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  fine?: any;
  vehicleId?: string;
}

export const TrafficFineFormModal = ({ 
  isOpen, 
  onClose, 
  fine,
  vehicleId
}: TrafficFineFormModalProps) => {
  const { createTrafficFine, updateTrafficFine } = useTrafficFines();
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { isFuncionario } = useUserRole();
  const { employee } = useCurrentEmployee();

  // Para funcionários, filtrar apenas veículos atribuídos a eles
  const availableVehicles = React.useMemo(() => {
    if (!isFuncionario || !employee) return vehicles;
    return vehicles.filter(v => v.responsavel_id === employee.id);
  }, [vehicles, isFuncionario, employee]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicle_id: "",
      employee_id: "",
      data_multa: new Date(),
      local_infracao: "",
      tipo_infracao: "",
      valor: 0,
      situacao: "pendente",
      comprovante_url: "",
      observacoes: "",
    },
  });

  React.useEffect(() => {
    if (fine) {
      form.reset({
        vehicle_id: fine.vehicle_id,
        employee_id: fine.employee_id || "",
        data_multa: new Date(fine.data_multa),
        local_infracao: fine.local_infracao,
        tipo_infracao: fine.tipo_infracao,
        valor: Number(fine.valor),
        situacao: fine.situacao,
        comprovante_url: fine.comprovante_url || "",
        observacoes: fine.observacoes || "",
      });
    } else {
      form.reset();
    }
  }, [fine, form]);

  const onSubmit = async (data: FormData) => {
    try {
      const fineData = {
        vehicle_id: data.vehicle_id,
        employee_id: data.employee_id || null,
        data_multa: data.data_multa.toISOString().split('T')[0],
        local_infracao: data.local_infracao,
        tipo_infracao: data.tipo_infracao,
        valor: data.valor,
        situacao: data.situacao,
        comprovante_url: data.comprovante_url || null,
        observacoes: data.observacoes || null,
      };

      if (fine) {
        await updateTrafficFine(fine.id, fineData);
      } else {
        await createTrafficFine(fineData);
      }
      
      onClose();
      form.reset();
    } catch (error) {
      console.error("Error saving traffic fine:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {fine ? "Editar Multa" : "Nova Multa de Trânsito"}
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
              name="employee_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Funcionário (Opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o funcionário (opcional)" />
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
              name="data_multa"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data da Multa</FormLabel>
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
              name="local_infracao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Local da Infração</FormLabel>
                  <FormControl>
                    <Input placeholder="Endereço ou local da infração" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo_infracao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Infração</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Excesso de velocidade, Estacionamento irregular" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (R$)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="situacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Situação</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a situação" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="paga">Paga</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="comprovante_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comprovante</FormLabel>
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
                  <FormLabel>Histórico ou Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações sobre a multa..."
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
                  : fine
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
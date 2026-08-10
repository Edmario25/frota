import React, { useState } from "react";
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
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useSmokeTests } from "@/hooks/useSmokeTests";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { PhotoUpload } from "@/components/ui/photo-upload";

const step1Schema = z.object({
  vehicle_id: z.string().min(1, "Selecione um veículo"),
  employee_id: z.string().min(1, "Selecione um funcionário"),
  condutor: z.string().min(1, "Nome do condutor é obrigatório"),
  obra: z.string().optional(),
  responsavel_elaboracao: z.string().min(1, "Responsável pela elaboração é obrigatório"),
  cargo: z.string().min(1, "Cargo é obrigatório"),
  motor_tipo: z.string().min(1, "Selecione o tipo de motor"),
  quilometragem_atual: z.number().min(0, "Quilometragem deve ser positiva"),
});

const step2Schema = z.object({
  ano_fabricacao: z.number().min(1900, "Ano inválido").max(new Date().getFullYear(), "Ano inválido"),
  data_hora_teste: z.date({
    required_error: "Data e hora do teste são obrigatórias",
  }),
  distancia_observador: z.number().min(20).max(150, "Distância deve estar entre 20 e 150 metros"),
  indice_ringelmann: z.number().min(1).max(5, "Índice deve estar entre 1 e 5"),
  densidade_percentual: z.number().min(20).max(100),
  dentro_limite: z.boolean(),
  observacoes: z.string().optional(),
  evidencias_url: z.string().optional(),
});

const formSchema = step1Schema.merge(step2Schema);

type FormData = z.infer<typeof formSchema>;

interface SmokeTestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  test?: any;
  vehicleType?: 'leve' | 'pesado' | null;
  vehicleId?: string;
}

export const SmokeTestFormModal = ({ 
  isOpen, 
  onClose, 
  test,
  vehicleType,
  vehicleId
}: SmokeTestFormModalProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const { createSmokeTest, updateSmokeTest } = useSmokeTests();
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { isFuncionario } = useUserRole();
  const { employee } = useCurrentEmployee();

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
      condutor: "",
      obra: "",
      responsavel_elaboracao: "",
      cargo: "",
      motor_tipo: "",
      quilometragem_atual: 0,
      ano_fabricacao: new Date().getFullYear(),
      data_hora_teste: new Date(),
      distancia_observador: 30,
      indice_ringelmann: 1,
      densidade_percentual: 20,
      dentro_limite: true,
      observacoes: "",
      evidencias_url: "",
    },
  });

  React.useEffect(() => {
    if (test) {
      form.reset({
        vehicle_id: test.vehicle_id,
        employee_id: test.employee_id,
        condutor: test.condutor,
        obra: test.obra || "",
        responsavel_elaboracao: test.responsavel_elaboracao,
        cargo: test.cargo,
        motor_tipo: test.motor_tipo || "diesel",
        quilometragem_atual: test.quilometragem_atual || 0,
        ano_fabricacao: test.ano_fabricacao,
        data_hora_teste: new Date(test.data_hora_teste || test.data_afericao),
        distancia_observador: test.distancia_observador || 30,
        indice_ringelmann: test.indice_ringelmann || 1,
        densidade_percentual: test.densidade_percentual || 20,
        dentro_limite: test.dentro_limite ?? true,
        observacoes: test.observacoes || "",
        evidencias_url: test.evidencias_url || "",
      });
    } else {
      form.reset();
      setCurrentStep(1);
    }
  }, [test, form]);

  const onSubmit = async (data: FormData) => {
    console.log("onSubmit called with data:", data);
    console.log("Current step when submitting:", currentStep);
    
    try {
      const testData = {
        vehicle_id: data.vehicle_id,
        employee_id: data.employee_id,
        condutor: data.condutor,
        obra: data.obra || null,
        responsavel_elaboracao: data.responsavel_elaboracao,
        cargo: data.cargo,
        motor_tipo: data.motor_tipo,
        quilometragem_atual: data.quilometragem_atual,
        ano_fabricacao: data.ano_fabricacao,
        data_afericao: data.data_hora_teste.toISOString().split('T')[0],
        data_hora_teste: data.data_hora_teste.toISOString(),
        distancia_observador: data.distancia_observador,
        indice_ringelmann: data.indice_ringelmann,
        densidade_percentual: data.densidade_percentual,
        dentro_limite: data.dentro_limite,
        resultado: data.dentro_limite ? "aprovado" : "reprovado",
        observacoes: data.observacoes || null,
        evidencias_url: data.evidencias_url || null,
      };

      if (test) {
        await updateSmokeTest(test.id, testData);
      } else {
        await createSmokeTest(testData);
      }
      
      onClose();
      form.reset();
      setCurrentStep(1);
    } catch (error) {
      console.error("Error saving smoke test:", error);
    }
  };

  const nextStep = async (e: React.MouseEvent) => {
    e.preventDefault(); // Previne o submit do formulário
    console.log("nextStep called, currentStep:", currentStep);
    const step1Fields = ["vehicle_id", "employee_id", "condutor", "responsavel_elaboracao", "cargo", "motor_tipo", "quilometragem_atual"] as const;
    
    console.log("Validating step1 fields...");
    const isStep1Valid = await form.trigger(step1Fields);
    console.log("Step1 validation result:", isStep1Valid);
    console.log("Form values:", form.getValues());
    console.log("Form errors:", form.formState.errors);
    
    if (isStep1Valid) {
      console.log("Moving to step 2");
      setCurrentStep(2);
    } else {
      console.log("Validation failed, staying on step 1");
    }
  };

  const prevStep = () => {
    setCurrentStep(1);
  };

  const handleClose = () => {
    onClose();
    setCurrentStep(1);
    form.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {test ? "Editar Teste" : "Novo Teste de Fumaça"} - Etapa {currentStep}/2
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {currentStep === 1 && (
              <div className="space-y-4">
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
                  name="condutor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condutor</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do condutor" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="obra"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Obra</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome da obra" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="responsavel_elaboracao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável pela Elaboração</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do responsável" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cargo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo</FormLabel>
                      <FormControl>
                        <Input placeholder="Cargo do responsável" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="motor_tipo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Motor</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="diesel">Diesel</SelectItem>
                            <SelectItem value="gasolina">Gasolina</SelectItem>
                            <SelectItem value="flex">Flex</SelectItem>
                            <SelectItem value="etanol">Etanol</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="quilometragem_atual"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quilometragem Atual</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="Quilometragem"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="ano_fabricacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ano de Fabricação</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="1900" 
                          max={new Date().getFullYear()}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="data_hora_teste"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data e Hora do Teste</FormLabel>
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
                                format(field.value, "dd/MM/yyyy HH:mm", { locale: ptBR })
                              ) : (
                                <span>Selecione data e hora</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              if (date) {
                                const currentTime = field.value || new Date();
                                date.setHours(currentTime.getHours());
                                date.setMinutes(currentTime.getMinutes());
                                field.onChange(date);
                              }
                            }}
                            initialFocus
                            locale={ptBR}
                            className="pointer-events-auto"
                          />
                          <div className="p-3 border-t">
                            <Input
                              type="time"
                              value={field.value ? format(field.value, "HH:mm") : ""}
                              onChange={(e) => {
                                const [hours, minutes] = e.target.value.split(':');
                                const newDate = field.value || new Date();
                                newDate.setHours(parseInt(hours), parseInt(minutes));
                                field.onChange(newDate);
                              }}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="distancia_observador"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Distância do Observador (metros)</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a distância" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="20">20m - Veículos leves</SelectItem>
                          <SelectItem value="25">25m - Veículos leves</SelectItem>
                          <SelectItem value="30">30m - Veículos pesados</SelectItem>
                          <SelectItem value="40">40m - Veículos pesados</SelectItem>
                          <SelectItem value="50">50m - Veículos pesados</SelectItem>
                          <SelectItem value="100">100m - Geradores/Chaminés</SelectItem>
                          <SelectItem value="150">150m - Geradores/Chaminés</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="indice_ringelmann"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Escala Ringelmann (Índice de Fumaça)</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          const index = parseInt(value);
                          field.onChange(index);
                          // Atualizar densidade automaticamente
                          const density = index * 20;
                          form.setValue("densidade_percentual", density);
                          // Determinar se está dentro do limite (índices 1-3 são aprovados)
                          form.setValue("dentro_limite", index <= 3);
                        }} 
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o índice" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">Nº 1 - Densidade 20% (Fumaça clara)</SelectItem>
                          <SelectItem value="2">Nº 2 - Densidade 40%</SelectItem>
                          <SelectItem value="3">Nº 3 - Densidade 60%</SelectItem>
                          <SelectItem value="4">Nº 4 - Densidade 80%</SelectItem>
                          <SelectItem value="5">Nº 5 - Densidade 100% (Fumaça escura)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="densidade_percentual"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Densidade Percentual</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="20"
                          max="100"
                          step="20"
                          disabled
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          value={field.value || 20}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dentro_limite"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Fumaça dentro do limite permitido?
                        </FormLabel>
                        <div className="text-sm text-muted-foreground">
                          {field.value ? "✅ Aprovado" : "❌ Reprovado"}
                        </div>
                      </div>
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="h-4 w-4"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações Adicionais</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Condições do teste: veículo em movimento com carga no motor, fumaça contínua por no mínimo 5 segundos..."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="evidencias_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Foto da Fumaça / Evidências (Opcional)</FormLabel>
                      <FormControl>
                        <PhotoUpload
                          label=""
                          value={field.value || ""}
                          onChange={field.onChange}
                          bucketName="smoke-photos"
                          vehicleId={form.watch("vehicle_id")}
                          accept="image/*"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex gap-3 pt-4">
              {currentStep === 1 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={nextStep}
                    className="flex-1"
                  >
                    Próximo
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prevStep}
                    className="flex-1"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting
                      ? "Salvando..."
                      : test
                      ? "Atualizar"
                      : "Salvar"}
                  </Button>
                </>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
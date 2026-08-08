import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EscalaPeriodo, useEscalas } from "@/hooks/useEscalas";
import { useEmployees } from "@/hooks/useEmployees";

const formSchema = z.object({
  employee_id: z.string().min(1, "Selecione um funcionário"),
  escala_tipo_id: z.string().min(1, "Selecione um tipo de escala"),
  data_inicio_trabalho: z.date({
    required_error: "Data de início do trabalho é obrigatória",
  }),
  observacoes: z.string().max(500, "Observações muito longas").optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ConflictInfo {
  hasConflict: boolean;
  conflicts: EscalaPeriodo[];
  allowOverlap: boolean;
}

interface EscalaPeriodoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodo?: EscalaPeriodo | null;
  /** Chamado após salvar com sucesso — útil para disparar notificações após "Remarcar" */
  onSaved?: (periodo: EscalaPeriodo) => void;
}

export const EscalaPeriodoFormModal = ({
  isOpen,
  onClose,
  periodo,
  onSaved,
}: EscalaPeriodoFormModalProps) => {
  const { 
    escalaTipos, 
    createEscalaPeriodo, 
    updateEscalaPeriodo,
    checkConflicts 
  } = useEscalas();
  const { employees } = useEmployees();
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo>({
    hasConflict: false,
    conflicts: [],
    allowOverlap: false,
  });
  const [authorizeConflict, setAuthorizeConflict] = useState(false);
  const [calculatedDates, setCalculatedDates] = useState<{
    dataFimTrabalho: Date | null;
    dataInicioFolga: Date | null;
    dataFimFolga: Date | null;
  }>({
    dataFimTrabalho: null,
    dataInicioFolga: null,
    dataFimFolga: null,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employee_id: "",
      escala_tipo_id: "",
      data_inicio_trabalho: new Date(),
      observacoes: "",
    },
  });

  const selectedEscalaTipoId = form.watch("escala_tipo_id");
  const selectedEmployeeId = form.watch("employee_id");
  const dataInicioTrabalho = form.watch("data_inicio_trabalho");

  // Calculate dates based on escala type
  useEffect(() => {
    if (selectedEscalaTipoId && dataInicioTrabalho) {
      const escalaTipo = escalaTipos.find(e => e.id === selectedEscalaTipoId);
      if (escalaTipo) {
        const dataFimTrabalho = addDays(dataInicioTrabalho, escalaTipo.dias_trabalho - 1);
        const dataInicioFolga = addDays(dataFimTrabalho, 1);
        const dataFimFolga = addDays(dataInicioFolga, escalaTipo.dias_folga - 1);
        
        setCalculatedDates({
          dataFimTrabalho,
          dataInicioFolga,
          dataFimFolga,
        });
      }
    }
  }, [selectedEscalaTipoId, dataInicioTrabalho, escalaTipos]);

  // Check for conflicts
  useEffect(() => {
    const checkForConflicts = async () => {
      if (selectedEmployeeId && selectedEscalaTipoId && calculatedDates.dataInicioFolga && calculatedDates.dataFimFolga) {
        const employee = employees.find(e => e.id === selectedEmployeeId);
        const escalaTipo = escalaTipos.find(e => e.id === selectedEscalaTipoId);
        
        if (employee && escalaTipo) {
          const conflicts = await checkConflicts(
            selectedEmployeeId,
            employee.cargo_id,
            format(calculatedDates.dataInicioFolga, 'yyyy-MM-dd'),
            format(calculatedDates.dataFimFolga, 'yyyy-MM-dd'),
            periodo?.id
          );

          setConflictInfo({
            hasConflict: conflicts.length > 0,
            conflicts,
            allowOverlap: escalaTipo.permite_sobreposicao,
          });
        }
      }
    };

    checkForConflicts();
  }, [selectedEmployeeId, selectedEscalaTipoId, calculatedDates, employees, escalaTipos, checkConflicts, periodo]);

  useEffect(() => {
    if (periodo) {
      form.reset({
        employee_id: periodo.employee_id,
        escala_tipo_id: periodo.escala_tipo_id,
        data_inicio_trabalho: new Date(periodo.data_inicio_trabalho),
        observacoes: periodo.observacoes || "",
      });
      setAuthorizeConflict(periodo.conflito_autorizado);
    } else {
      form.reset({
        employee_id: "",
        escala_tipo_id: "",
        data_inicio_trabalho: new Date(),
        observacoes: "",
      });
      setAuthorizeConflict(false);
    }
  }, [periodo, form]);

  const onSubmit = async (data: FormData) => {
    if (conflictInfo.hasConflict && !conflictInfo.allowOverlap && !authorizeConflict) {
      return;
    }

    try {
      const escalaTipo = escalaTipos.find(e => e.id === data.escala_tipo_id);
      if (!escalaTipo) return;

      const dataFimTrabalho = addDays(data.data_inicio_trabalho, escalaTipo.dias_trabalho - 1);
      const dataInicioFolga = addDays(dataFimTrabalho, 1);
      const dataFimFolga = addDays(dataInicioFolga, escalaTipo.dias_folga - 1);

      const periodoData = {
        employee_id: data.employee_id,
        escala_tipo_id: data.escala_tipo_id,
        data_inicio_trabalho: format(data.data_inicio_trabalho, 'yyyy-MM-dd'),
        data_fim_trabalho: format(dataFimTrabalho, 'yyyy-MM-dd'),
        data_inicio_folga: format(dataInicioFolga, 'yyyy-MM-dd'),
        data_fim_folga: format(dataFimFolga, 'yyyy-MM-dd'),
        status: 'agendado',
        conflito_detectado: conflictInfo.hasConflict,
        conflito_autorizado: authorizeConflict,
        observacoes: data.observacoes || null,
      };

      let saved: EscalaPeriodo;
      if (periodo) {
        saved = await updateEscalaPeriodo(periodo.id, periodoData);
      } else {
        saved = await createEscalaPeriodo(periodoData);
      }

      onSaved?.(saved);
      onClose();
      form.reset();
      setConflictInfo({ hasConflict: false, conflicts: [], allowOverlap: false });
      setAuthorizeConflict(false);
    } catch (error) {
      console.error("Error saving escala periodo:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {periodo ? "Editar Período de Escala" : "Novo Período de Escala"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="escala_tipo_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Escala</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo de escala" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {escalaTipos.map((tipo) => (
                        <SelectItem key={tipo.id} value={tipo.id}>
                          {tipo.nome} ({tipo.dias_trabalho}x{tipo.dias_folga})
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
              name="data_inicio_trabalho"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data de Início do Trabalho</FormLabel>
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

            {/* Calculated dates display */}
            {calculatedDates.dataFimTrabalho && (
              <div className="rounded-lg border p-4 space-y-2 bg-muted/50">
                <h4 className="font-medium text-sm">Datas Calculadas</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Fim do Trabalho:</span>
                    <p className="font-medium">
                      {format(calculatedDates.dataFimTrabalho, "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Início da Folga:</span>
                    <p className="font-medium">
                      {calculatedDates.dataInicioFolga && format(calculatedDates.dataInicioFolga, "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Fim da Folga:</span>
                    <p className="font-medium">
                      {calculatedDates.dataFimFolga && format(calculatedDates.dataFimFolga, "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Conflict alert */}
            {conflictInfo.hasConflict && (
              <Alert variant={conflictInfo.allowOverlap ? "default" : "destructive"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {conflictInfo.allowOverlap ? "Sobreposição Detectada" : "Conflito de Folga Detectado!"}
                </AlertTitle>
                <AlertDescription>
                  <p className="mb-2">
                    Os seguintes funcionários da mesma função já têm folga agendada neste período:
                  </p>
                  <ul className="list-disc list-inside mb-2">
                    {conflictInfo.conflicts.map((c) => (
                      <li key={c.id}>
                        {c.employee?.nome} - {format(new Date(c.data_inicio_folga), "dd/MM/yyyy")} a{" "}
                        {format(new Date(c.data_fim_folga), "dd/MM/yyyy")}
                      </li>
                    ))}
                  </ul>
                  {conflictInfo.allowOverlap ? (
                    <p className="text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      Este tipo de escala permite sobreposição de folgas.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="authorize-conflict"
                        checked={authorizeConflict}
                        onChange={(e) => setAuthorizeConflict(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="authorize-conflict" className="text-sm">
                        Autorizar folga mesmo com conflito
                      </label>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações opcionais..."
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
                disabled={
                  form.formState.isSubmitting ||
                  (conflictInfo.hasConflict && !conflictInfo.allowOverlap && !authorizeConflict)
                }
              >
                {form.formState.isSubmitting
                  ? "Salvando..."
                  : periodo
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

import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, addDays, parseISO } from "date-fns";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, AlertTriangle, CheckCircle, Pencil } from "lucide-react";
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

interface ManualDates {
  dataFimTrabalho: Date | null;
  dataInicioFolga: Date | null;
  dataFimFolga: Date | null;
}

interface EscalaPeriodoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodo?: EscalaPeriodo | null;
  onSaved?: (periodo: EscalaPeriodo) => void;
  resetStatusOnSave?: boolean;
}

/** DatePicker reutilizável */
function DatePickerField({
  label,
  value,
  onChange,
  disabled,
  minDate,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  disabled?: boolean;
  minDate?: Date;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full pl-3 text-left font-normal text-sm h-9",
              !value && "text-muted-foreground"
            )}
          >
            {value ? format(value, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
            <CalendarIcon className="ml-auto h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(d) => d && onChange(d)}
            fromDate={minDate}
            initialFocus
            locale={ptBR}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export const EscalaPeriodoFormModal = ({
  isOpen,
  onClose,
  periodo,
  onSaved,
  resetStatusOnSave = false,
}: EscalaPeriodoFormModalProps) => {
  const { escalaTipos, createEscalaPeriodo, updateEscalaPeriodo, checkConflicts } = useEscalas();
  const { employees } = useEmployees();
  const activeEmployees = useMemo(
    () => employees.filter(e => e.status === "ativo"),
    [employees],
  );

  const [conflictInfo, setConflictInfo] = useState<ConflictInfo>({
    hasConflict: false,
    conflicts: [],
    allowOverlap: false,
  });
  const [authorizeConflict, setAuthorizeConflict] = useState(false);

  // Datas calculadas automaticamente
  const [calculatedDates, setCalculatedDates] = useState<ManualDates>({
    dataFimTrabalho: null,
    dataInicioFolga: null,
    dataFimFolga: null,
  });

  // Modo manual: datas editáveis pelo gestor
  const [modoManual, setModoManual] = useState(false);
  const [manualDates, setManualDates] = useState<ManualDates>({
    dataFimTrabalho: null,
    dataInicioFolga: null,
    dataFimFolga: null,
  });

  // Datas efetivas (calculadas ou manuais)
  const datesEfetivas = modoManual ? manualDates : calculatedDates;

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
  const selectedEmployeeId   = form.watch("employee_id");
  const dataInicioTrabalho   = form.watch("data_inicio_trabalho");

  // Recalcula datas automáticas quando tipo ou data de início mudam
  useEffect(() => {
    if (!selectedEscalaTipoId || !dataInicioTrabalho) return;
    const tipo = escalaTipos.find(e => e.id === selectedEscalaTipoId);
    if (!tipo) return;

    const dataFimTrabalho = addDays(dataInicioTrabalho, tipo.dias_trabalho - 1);
    const dataInicioFolga = addDays(dataFimTrabalho, 1);
    const dataFimFolga    = addDays(dataInicioFolga, tipo.dias_folga - 1);

    const calc = { dataFimTrabalho, dataInicioFolga, dataFimFolga };
    setCalculatedDates(calc);

    // Ao sair do modo manual e recalcular, sincroniza as manuais como fallback
    if (!modoManual) {
      setManualDates(calc);
    }
  }, [selectedEscalaTipoId, dataInicioTrabalho, escalaTipos, modoManual]);

  // Quando ativa o modo manual, copia as calculadas como ponto de partida
  const handleToggleModoManual = (ativo: boolean) => {
    if (ativo) setManualDates({ ...calculatedDates });
    setModoManual(ativo);
  };

  // Verifica conflitos usando as datas efetivas
  useEffect(() => {
    const run = async () => {
      if (!selectedEmployeeId || !selectedEscalaTipoId || !datesEfetivas.dataInicioFolga || !datesEfetivas.dataFimFolga) return;
      const employee = activeEmployees.find(e => e.id === selectedEmployeeId);
      const tipo = escalaTipos.find(e => e.id === selectedEscalaTipoId);
      if (!employee || !tipo) return;

      const conflicts = await checkConflicts(
        selectedEmployeeId,
        employee.cargo_id,
        format(datesEfetivas.dataInicioFolga, 'yyyy-MM-dd'),
        format(datesEfetivas.dataFimFolga, 'yyyy-MM-dd'),
        periodo?.id
      );
      setConflictInfo({ hasConflict: conflicts.length > 0, conflicts, allowOverlap: tipo.permite_sobreposicao });
    };
    run().catch(() => {
      setConflictInfo({ hasConflict: true, conflicts: [], allowOverlap: false });
    });
  }, [selectedEmployeeId, selectedEscalaTipoId, datesEfetivas, activeEmployees, escalaTipos, checkConflicts, periodo]);

  // Popula form ao editar
  useEffect(() => {
    if (periodo) {
      form.reset({
        employee_id: periodo.employee_id,
        escala_tipo_id: periodo.escala_tipo_id,
        data_inicio_trabalho: new Date(periodo.data_inicio_trabalho),
        observacoes: periodo.observacoes || "",
      });
      setAuthorizeConflict(periodo.conflito_autorizado);
      setModoManual(false);
    } else {
      form.reset({ employee_id: "", escala_tipo_id: "", data_inicio_trabalho: new Date(), observacoes: "" });
      setAuthorizeConflict(false);
      setModoManual(false);
    }
  }, [periodo, form]);

  const onSubmit = async (data: FormData) => {
    if (conflictInfo.hasConflict && !conflictInfo.allowOverlap && !authorizeConflict) return;

    const tipo = escalaTipos.find(e => e.id === data.escala_tipo_id);
    if (!tipo) return;

    // Usa datas manuais ou calcula automaticamente
    let dataFimTrabalho: Date, dataInicioFolga: Date, dataFimFolga: Date;
    if (modoManual && manualDates.dataFimTrabalho && manualDates.dataInicioFolga && manualDates.dataFimFolga) {
      dataFimTrabalho = manualDates.dataFimTrabalho;
      dataInicioFolga = manualDates.dataInicioFolga;
      dataFimFolga    = manualDates.dataFimFolga;
    } else {
      dataFimTrabalho = addDays(data.data_inicio_trabalho, tipo.dias_trabalho - 1);
      dataInicioFolga = addDays(dataFimTrabalho, 1);
      dataFimFolga    = addDays(dataInicioFolga, tipo.dias_folga - 1);
    }

    if (dataFimTrabalho < data.data_inicio_trabalho || dataInicioFolga <= dataFimTrabalho || dataFimFolga < dataInicioFolga) {
      form.setError("data_inicio_trabalho", {
        message: "Revise as datas: a folga deve começar após o trabalho e terminar depois de começar.",
      });
      return;
    }

    try {
      const periodoData = {
        employee_id: data.employee_id,
        escala_tipo_id: data.escala_tipo_id,
        data_inicio_trabalho: format(data.data_inicio_trabalho, 'yyyy-MM-dd'),
        data_fim_trabalho:    format(dataFimTrabalho, 'yyyy-MM-dd'),
        data_inicio_folga:    format(dataInicioFolga, 'yyyy-MM-dd'),
        data_fim_folga:       format(dataFimFolga, 'yyyy-MM-dd'),
        // Ao editar, preserva o fluxo atual. Antes, qualquer alteração reabria
        // períodos em folga ou concluídos como "agendado".
        status: resetStatusOnSave ? 'pendente_aprovacao' : (periodo?.status ?? 'pendente_aprovacao'),
        ...(resetStatusOnSave ? { autorizado_por: null, autorizado_em: null, motivo_negativa: null } : {}),
        conflito_detectado: conflictInfo.hasConflict,
        conflito_autorizado: authorizeConflict,
        observacoes: data.observacoes || null,
      };

      const saved = periodo
        ? await updateEscalaPeriodo(periodo.id, periodoData)
        : await createEscalaPeriodo(periodoData);

      onSaved?.(saved);
      onClose();
      form.reset();
      setConflictInfo({ hasConflict: false, conflicts: [], allowOverlap: false });
      setAuthorizeConflict(false);
      setModoManual(false);
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

            {/* Funcionário */}
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
                      {activeEmployees.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo de Escala */}
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
                      {escalaTipos.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome} ({t.dias_trabalho}x{t.dias_folga})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Data de início do trabalho */}
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
                          className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                        >
                          {field.value ? format(field.value, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione a data</span>}
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

            {/* Painel de datas */}
            {calculatedDates.dataFimTrabalho && (
              <div className={cn(
                "rounded-lg border p-4 space-y-3",
                modoManual ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "bg-muted/50"
              )}>
                {/* Header do painel */}
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">
                    {modoManual ? "Datas Ajustadas Manualmente" : "Datas Calculadas"}
                  </h4>
                  <div className="flex items-center gap-2">
                    <Pencil className={cn("h-3.5 w-3.5", modoManual ? "text-amber-600" : "text-muted-foreground")} />
                    <Label htmlFor="modo-manual" className="text-xs text-muted-foreground cursor-pointer select-none">
                      Ajuste manual
                    </Label>
                    <Switch
                      id="modo-manual"
                      checked={modoManual}
                      onCheckedChange={handleToggleModoManual}
                    />
                  </div>
                </div>

                {modoManual && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    ⚠️ As datas abaixo serão salvas exatamente como definidas, sem seguir a fórmula da escala.
                  </p>
                )}

                {/* Datas: modo automático = só leitura, modo manual = editáveis */}
                {modoManual ? (
                  <div className="grid grid-cols-2 gap-3">
                    <DatePickerField
                      label="Fim do Trabalho"
                      value={manualDates.dataFimTrabalho}
                      onChange={d => setManualDates(prev => ({ ...prev, dataFimTrabalho: d }))}
                      minDate={dataInicioTrabalho}
                    />
                    <DatePickerField
                      label="Início da Folga"
                      value={manualDates.dataInicioFolga}
                      onChange={d => setManualDates(prev => ({ ...prev, dataInicioFolga: d }))}
                      minDate={manualDates.dataFimTrabalho ?? dataInicioTrabalho}
                    />
                    <div className="col-span-2">
                      <DatePickerField
                        label="Fim da Folga"
                        value={manualDates.dataFimFolga}
                        onChange={d => setManualDates(prev => ({ ...prev, dataFimFolga: d }))}
                        minDate={manualDates.dataInicioFolga ?? dataInicioTrabalho}
                      />
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            )}

            {/* Alerta de conflito */}
            {conflictInfo.hasConflict && (
              <Alert variant={conflictInfo.allowOverlap ? "default" : "destructive"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {conflictInfo.allowOverlap ? "Sobreposição Detectada" : "Conflito de Folga Detectado!"}
                </AlertTitle>
                <AlertDescription>
                  <p className="mb-2">Funcionários da mesma função com folga neste período:</p>
                  <ul className="list-disc list-inside mb-2">
                    {conflictInfo.conflicts.map(c => (
                      <li key={c.id}>
                        {c.employee?.nome} — {format(new Date(c.data_inicio_folga), "dd/MM/yyyy")} a{" "}
                        {format(new Date(c.data_fim_folga), "dd/MM/yyyy")}
                      </li>
                    ))}
                  </ul>
                  {conflictInfo.allowOverlap ? (
                    <p className="text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      Este tipo de escala permite sobreposição.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="authorize-conflict"
                        checked={authorizeConflict}
                        onChange={e => setAuthorizeConflict(e.target.checked)}
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

            {/* Observações */}
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Observações opcionais..." className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={
                  form.formState.isSubmitting ||
                  (conflictInfo.hasConflict && !conflictInfo.allowOverlap && !authorizeConflict) ||
                  (modoManual && (!manualDates.dataFimTrabalho || !manualDates.dataInicioFolga || !manualDates.dataFimFolga))
                }
              >
                {form.formState.isSubmitting ? "Salvando..." : periodo ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

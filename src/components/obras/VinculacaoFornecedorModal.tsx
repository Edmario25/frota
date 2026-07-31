import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
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
import { useFornecedores } from "@/hooks/useFornecedores";

const formSchema = z.object({
  fornecedor_id: z.string().min(1, "Selecione um fornecedor"),
  data_inicio: z.date(),
  tipo_contrato: z.string().optional(),
  valor_contrato: z.number().optional(),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface VinculacaoFornecedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  obraId: string;
  obraNome: string;
}

const TIPO_CONTRATO_OPTIONS = [
  { value: "fornecimento", label: "Fornecimento" },
  { value: "servico", label: "Serviço" },
  { value: "locacao", label: "Locação" },
  { value: "manutencao", label: "Manutenção" },
  { value: "consultoria", label: "Consultoria" },
  { value: "outro", label: "Outro" },
];

export const VinculacaoFornecedorModal: React.FC<VinculacaoFornecedorModalProps> = ({
  isOpen,
  onClose,
  obraId,
  obraNome,
}) => {
  const { fornecedores, linkFornecedorToObra } = useFornecedores();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fornecedor_id: "",
      data_inicio: new Date(),
      tipo_contrato: "",
      valor_contrato: undefined,
      observacoes: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        fornecedor_id: "",
        data_inicio: new Date(),
        tipo_contrato: "",
        valor_contrato: undefined,
        observacoes: "",
      });
    }
  }, [isOpen, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await linkFornecedorToObra({
        obra_id: obraId,
        fornecedor_id: data.fornecedor_id,
        data_inicio: data.data_inicio.toISOString().split('T')[0],
        tipo_contrato: data.tipo_contrato,
        valor_contrato: data.valor_contrato,
        observacoes: data.observacoes,
      });
      onClose();
    } catch (error) {
      console.error("Error linking fornecedor:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular Fornecedor à Obra</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Obra: <strong>{obraNome}</strong>
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fornecedor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fornecedor *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o fornecedor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fornecedores
                        .filter(f => f.status === 'ativo')
                        .map((fornecedor) => (
                          <SelectItem key={fornecedor.id} value={fornecedor.id}>
                            {fornecedor.nome} {fornecedor.cnpj && `(${fornecedor.cnpj})`}
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
              name="data_inicio"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data de Início *</FormLabel>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo_contrato"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Contrato</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIPO_CONTRATO_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
                name="valor_contrato"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor do Contrato (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações sobre o vínculo..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">Vincular</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
